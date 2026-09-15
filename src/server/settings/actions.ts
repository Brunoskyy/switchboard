'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { AuditAction } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { PermissionError, assertCan, requireOrg, requireProject } from '@/server/tenancy/scope'
import { generateSdkKey } from '@/server/settings/keys'

export interface ActionResult {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

function toResult(error: unknown): ActionResult {
  if (error instanceof PermissionError) return { ok: false, error: error.message }
  if (error instanceof z.ZodError) {
    return { ok: false, fieldErrors: z.flattenError(error).fieldErrors }
  }
  console.error('[settings/actions]', error)
  return { ok: false, error: 'Something went wrong. Please try again.' }
}

const RenameSchema = z.object({
  orgSlug: z.string().min(1),
  name: z.string().min(2, 'Name it something').max(60),
})

export async function renameOrganization(raw: unknown): Promise<ActionResult> {
  try {
    const input = RenameSchema.parse(raw)
    const scope = await requireOrg(input.orgSlug)
    assertCan(scope, 'manageProjects')

    if (scope.org.name === input.name) return { ok: true }

    await db.$transaction([
      db.organization.update({ where: { id: scope.org.id }, data: { name: input.name } }),
      db.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.UPDATED,
          entityType: 'Organization',
          entityId: scope.org.id,
          entityLabel: input.name,
          diff: { name: { from: scope.org.name, to: input.name } },
        },
      }),
    ])

    // The slug is deliberately left alone: it is in every bookmarked URL and
    // in customers' SDK configuration. Renaming is a display change only.
    revalidatePath(`/${input.orgSlug}`, 'layout')
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * Project keys sit at /[orgSlug]/[projectKey], alongside these static routes.
 * Next resolves a static segment ahead of a dynamic one, so a project keyed
 * "audit" would build fine and then be permanently unreachable. Rejecting the
 * name up front is cheaper than explaining that later.
 */
const RESERVED_PROJECT_KEYS = ['audit', 'members', 'settings', 'api', 'new', 'onboarding']

const ProjectKeySchema = z
  .string()
  .min(2, 'At least 2 characters')
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, numbers and hyphens')
  .refine((key) => !RESERVED_PROJECT_KEYS.includes(key), {
    message: 'That key is reserved by the app. Pick another.',
  })

const CreateProjectSchema = z.object({
  orgSlug: z.string().min(1),
  name: z.string().min(2, 'Give the project a name').max(60),
  key: ProjectKeySchema,
})

export async function createProject(
  raw: unknown,
): Promise<ActionResult & { projectKey?: string }> {
  try {
    const input = CreateProjectSchema.parse(raw)
    const scope = await requireOrg(input.orgSlug)
    assertCan(scope, 'manageProjects')

    const duplicate = await db.project.findFirst({
      where: { key: input.key, orgId: scope.org.id },
      select: { id: true },
    })
    if (duplicate) {
      return { ok: false, fieldErrors: { key: ['A project with this key already exists'] } }
    }

    await db.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: input.name,
          key: input.key,
          orgId: scope.org.id,
          environments: {
            create: [
              { key: 'development', name: 'Development', color: '#22c55e', sortOrder: 0 },
              { key: 'staging', name: 'Staging', color: '#f59e0b', sortOrder: 1 },
              { key: 'production', name: 'Production', color: '#ef4444', sortOrder: 2 },
            ],
          },
        },
        select: { id: true },
      })

      await tx.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.CREATED,
          entityType: 'Project',
          entityId: project.id,
          entityLabel: input.key,
        },
      })
    })

    revalidatePath(`/${input.orgSlug}`, 'layout')
    return { ok: true, projectKey: input.key }
  } catch (error) {
    return toResult(error)
  }
}

const CreateKeySchema = z.object({
  orgSlug: z.string().min(1),
  projectKey: z.string().min(1),
  environmentKey: z.string().min(1),
  name: z.string().min(2, 'Name the key so you know what to revoke').max(60),
})

export async function createSdkKey(
  raw: unknown,
): Promise<ActionResult & { plaintext?: string }> {
  try {
    const input = CreateKeySchema.parse(raw)
    const scope = await requireProject(input.orgSlug, input.projectKey)
    assertCan(scope, 'manageSdkKeys')

    const environment = await db.environment.findFirst({
      where: { key: input.environmentKey, projectId: scope.project.id },
      select: { id: true, key: true },
    })
    if (!environment) return { ok: false, error: 'Environment not found.' }

    const generated = generateSdkKey(environment.key)

    await db.$transaction([
      db.sdkKey.create({
        data: {
          environmentId: environment.id,
          name: input.name,
          prefix: generated.prefix,
          hashedKey: generated.hashedKey,
        },
      }),
      db.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.KEY_CREATED,
          entityType: 'SdkKey',
          entityId: environment.id,
          entityLabel: input.name,
          environmentKey: environment.key,
        },
      }),
    ])

    revalidatePath(`/${input.orgSlug}/settings`)

    // The only time the plaintext ever leaves this function. It is not stored,
    // so a lost key has to be revoked and replaced rather than recovered.
    return { ok: true, plaintext: generated.plaintext }
  } catch (error) {
    return toResult(error)
  }
}

const RevokeKeySchema = z.object({
  orgSlug: z.string().min(1),
  keyId: z.string().min(1),
})

export async function revokeSdkKey(raw: unknown): Promise<ActionResult> {
  try {
    const input = RevokeKeySchema.parse(raw)
    const scope = await requireOrg(input.orgSlug)
    assertCan(scope, 'manageSdkKeys')

    // Reaching the key through its environment's project keeps the org filter
    // on the query, so a key id from another tenant resolves to nothing.
    const key = await db.sdkKey.findFirst({
      where: { id: input.keyId, environment: { project: { orgId: scope.org.id } } },
      select: { id: true, name: true, revokedAt: true, environment: { select: { key: true } } },
    })
    if (!key) return { ok: false, error: 'That key no longer exists.' }
    if (key.revokedAt) return { ok: true }

    await db.$transaction([
      db.sdkKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } }),
      db.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.KEY_REVOKED,
          entityType: 'SdkKey',
          entityId: key.id,
          entityLabel: key.name,
          environmentKey: key.environment.key,
        },
      }),
    ])

    revalidatePath(`/${input.orgSlug}/settings`)
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}
