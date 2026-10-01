'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { Prisma } from '@/generated/prisma/client'
import { AuditAction, FlagType } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { describeTargetingChange } from '@/lib/flags/diff'
import type { Rollout } from '@/lib/flags/types'
import { FlagKeySchema, FlagRulesSchema, RolloutSchema } from '@/lib/flags/schema'
import { type ActionResult, toResult } from '@/server/action-result'
import { assertCan, requireEnvironment, requireProject } from '@/server/tenancy/scope'

const ok: ActionResult = { ok: true }

/**
 * Revalidates both places a flag is rendered.
 *
 * The list and the detail page are separate routes, so revalidating only the
 * list leaves the editor holding a stale `initial` prop — it keeps reporting
 * unsaved changes after a successful save, and Discard reverts to the state
 * from before it.
 */
function revalidateFlag(orgSlug: string, projectKey: string, flagKey?: string) {
  revalidatePath(`/${orgSlug}/${projectKey}`)
  if (flagKey) revalidatePath(`/${orgSlug}/${projectKey}/flags/${flagKey}`)
}

const ScopeSchema = z.object({
  orgSlug: z.string().min(1),
  projectKey: z.string().min(1),
  environmentKey: z.string().min(1),
  flagKey: z.string().min(1),
})

export async function toggleFlag(
  input: z.infer<typeof ScopeSchema> & { enabled: boolean },
): Promise<ActionResult> {
  try {
    const { orgSlug, projectKey, environmentKey, flagKey } = ScopeSchema.parse(input)
    const enabled = z.boolean().parse(input.enabled)

    const scope = await requireProject(orgSlug, projectKey)
    assertCan(scope, 'toggleFlag')

    const environment = await requireEnvironment(scope, environmentKey)

    // projectId in the filter is what stops a flag key from another tenant
    // being toggled through this org's URL.
    const flag = await db.flag.findFirst({
      where: { key: flagKey, projectId: scope.project.id },
      select: { id: true, key: true, archived: true },
    })
    if (!flag) return { ok: false, error: 'Flag not found.' }
    if (flag.archived) return { ok: false, error: 'This flag is archived. Restore it first.' }

    const existing = await db.flagConfig.findUnique({
      where: { flagId_environmentId: { flagId: flag.id, environmentId: environment.id } },
      select: { enabled: true },
    })

    if (existing?.enabled === enabled) return ok

    await db.$transaction([
      db.flagConfig.update({
        where: { flagId_environmentId: { flagId: flag.id, environmentId: environment.id } },
        data: { enabled },
      }),
      db.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.TOGGLED,
          entityType: 'FlagConfig',
          entityId: flag.id,
          entityLabel: flag.key,
          environmentKey: environment.key,
          diff: { enabled: { from: existing?.enabled ?? null, to: enabled } },
        },
      }),
    ])

    revalidateFlag(orgSlug, projectKey, flagKey)
    return ok
  } catch (error) {
    return toResult(error, 'flags/actions')
  }
}

const CreateFlagSchema = z.object({
  orgSlug: z.string().min(1),
  projectKey: z.string().min(1),
  key: FlagKeySchema,
  name: z.string().min(2, 'Give the flag a name').max(120),
  description: z.string().max(500).optional().default(''),
  type: z.enum(FlagType).default(FlagType.BOOLEAN),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
})

export async function createFlag(raw: unknown): Promise<ActionResult & { flagKey?: string }> {
  try {
    const input = CreateFlagSchema.parse(raw)

    const scope = await requireProject(input.orgSlug, input.projectKey)
    assertCan(scope, 'manageFlags')

    const duplicate = await db.flag.findFirst({
      where: { key: input.key, projectId: scope.project.id },
      select: { id: true },
    })
    if (duplicate) {
      return { ok: false, fieldErrors: { key: ['A flag with this key already exists'] } }
    }

    const environments = await db.environment.findMany({
      where: { projectId: scope.project.id },
      select: { id: true },
    })

    const variants =
      input.type === FlagType.BOOLEAN
        ? [
            { key: 'off', name: 'Off', value: false, sortOrder: 0 },
            { key: 'on', name: 'On', value: true, sortOrder: 1 },
          ]
        : [
            { key: 'control', name: 'Control', value: '', sortOrder: 0 },
            { key: 'treatment', name: 'Treatment', value: '', sortOrder: 1 },
          ]

    const offKey = variants[0].key

    await db.$transaction(async (tx) => {
      const flag = await tx.flag.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description,
          type: input.type,
          tags: input.tags,
          projectId: scope.project.id,
          createdById: scope.user.id,
          variants: { create: variants },
        },
        select: { id: true },
      })

      // A flag with no config in an environment is unevaluable, so create one
      // for every environment up front rather than lazily on first read.
      await tx.flagConfig.createMany({
        data: environments.map((env) => ({
          flagId: flag.id,
          environmentId: env.id,
          enabled: false,
          defaultVariantKey: offKey,
          offVariantKey: offKey,
          rules: [],
        })),
      })

      await tx.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.CREATED,
          entityType: 'Flag',
          entityId: flag.id,
          entityLabel: input.key,
        },
      })
    })

    revalidateFlag(input.orgSlug, input.projectKey, input.key)
    return { ok: true, flagKey: input.key }
  } catch (error) {
    return toResult(error, 'flags/actions')
  }
}

const TargetingSchema = ScopeSchema.extend({
  rules: FlagRulesSchema,
  rollout: RolloutSchema.nullable(),
  defaultVariantKey: z.string().min(1),
  offVariantKey: z.string().min(1),
})

export async function updateTargeting(raw: unknown): Promise<ActionResult> {
  try {
    const input = TargetingSchema.parse(raw)

    const scope = await requireProject(input.orgSlug, input.projectKey)
    assertCan(scope, 'editTargeting')

    const environment = await requireEnvironment(scope, input.environmentKey)

    const flag = await db.flag.findFirst({
      where: { key: input.flagKey, projectId: scope.project.id },
      select: { id: true, key: true, archived: true, variants: { select: { key: true } } },
    })
    if (!flag) return { ok: false, error: 'Flag not found.' }
    if (flag.archived) return { ok: false, error: 'This flag is archived. Restore it first.' }

    // Cross-check every variant the payload references against the flag's own
    // variants. Zod can validate the shape but not this relationship, and an
    // unknown key here would make the evaluator fall back to `off` at runtime.
    const known = new Set(flag.variants.map((v) => v.key))
    const referenced = [
      input.defaultVariantKey,
      input.offVariantKey,
      ...input.rules.flatMap((rule) =>
        'variantKey' in rule.serve
          ? [rule.serve.variantKey]
          : rule.serve.rollout.buckets.map((b) => b.variantKey),
      ),
      ...(input.rollout?.buckets.map((b) => b.variantKey) ?? []),
    ]

    const unknownKey = referenced.find((key) => !known.has(key))
    if (unknownKey) {
      return { ok: false, error: `"${unknownKey}" is not a variant of this flag.` }
    }

    const previous = await db.flagConfig.findUnique({
      where: { flagId_environmentId: { flagId: flag.id, environmentId: environment.id } },
      select: { rules: true, rollout: true, defaultVariantKey: true, offVariantKey: true },
    })

    const change = describeTargetingChange(
      previous ? { ...previous, rollout: previous.rollout as Rollout | null } : null,
      input,
    )

    // Report what actually moved. Always writing RULES_CHANGED made the audit
    // log's "Rollout changed" filter an option no real event could match.
    const action = change.rolloutOnly ? AuditAction.ROLLOUT_CHANGED : AuditAction.RULES_CHANGED

    const update = db.flagConfig.update({
      where: { flagId_environmentId: { flagId: flag.id, environmentId: environment.id } },
      data: {
        rules: input.rules,
        // Prisma reads `undefined` as "leave this column alone", so turning a
        // rollout off has to say DbNull explicitly or the old split survives
        // the save.
        rollout: input.rollout ?? Prisma.DbNull,
        defaultVariantKey: input.defaultVariantKey,
        offVariantKey: input.offVariantKey,
      },
    })

    // A save that changes nothing a reader would notice (only editor-minted
    // ids, say) still writes, but an audit event saying nothing happened is
    // noise.
    if (change.unchanged) {
      await update
    } else {
      await db.$transaction([
        update,
        db.auditEvent.create({
          data: {
            orgId: scope.org.id,
            actorId: scope.user.id,
            action,
            entityType: 'FlagConfig',
            entityId: flag.id,
            entityLabel: flag.key,
            environmentKey: environment.key,
            diff: change.diff,
          },
        }),
      ])
    }

    revalidateFlag(input.orgSlug, input.projectKey, input.flagKey)
    return ok
  } catch (error) {
    return toResult(error, 'flags/actions')
  }
}

const ArchiveSchema = z.object({
  orgSlug: z.string().min(1),
  projectKey: z.string().min(1),
  flagKey: z.string().min(1),
  archived: z.boolean(),
})

export async function setFlagArchived(raw: unknown): Promise<ActionResult> {
  try {
    const input = ArchiveSchema.parse(raw)

    const scope = await requireProject(input.orgSlug, input.projectKey)
    assertCan(scope, 'manageFlags')

    const flag = await db.flag.findFirst({
      where: { key: input.flagKey, projectId: scope.project.id },
      select: { id: true, key: true },
    })
    if (!flag) return { ok: false, error: 'Flag not found.' }

    await db.$transaction([
      db.flag.update({ where: { id: flag.id }, data: { archived: input.archived } }),
      db.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: input.archived ? AuditAction.ARCHIVED : AuditAction.RESTORED,
          entityType: 'Flag',
          entityId: flag.id,
          entityLabel: flag.key,
        },
      }),
    ])

    revalidateFlag(input.orgSlug, input.projectKey, input.flagKey)
    return ok
  } catch (error) {
    return toResult(error, 'flags/actions')
  }
}
