'use server'

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import { AuditAction, Role } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { checkRemoval, checkRoleChange } from '@/lib/members/rules'
import { PermissionError, requireOrg } from '@/server/tenancy/scope'

export interface ActionResult {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

function toResult(error: unknown): ActionResult {
  // `redirect()` and `notFound()` signal by throwing; catching them here would
  // turn an expired session into a permanent generic error.
  unstable_rethrow(error)

  if (error instanceof PermissionError) return { ok: false, error: error.message }
  if (error instanceof z.ZodError) {
    return { ok: false, fieldErrors: z.flattenError(error).fieldErrors }
  }
  console.error('[members/actions]', error)
  return { ok: false, error: 'Something went wrong. Please try again.' }
}

/**
 * Counts the org's owners and holds a lock on those rows until the surrounding
 * transaction ends.
 *
 * Being inside the transaction is not enough on its own: Prisma runs at READ
 * COMMITTED and a plain `count()` takes no locks, so two owners leaving at the
 * same moment would each read two, each delete a different row, and both
 * commit — leaving nobody able to grant the role back. `FOR UPDATE` locks every
 * owner row, so the second transaction blocks, then re-reads a count of one and
 * is refused.
 */
async function lockedOwnerCount(
  tx: Pick<typeof db, '$queryRaw'>,
  orgId: string,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Membership"
    WHERE "orgId" = ${orgId} AND "role" = 'OWNER'::"Role"
    FOR UPDATE
  `
  return rows.length
}

/**
 * Loads everything the membership rules need, in one place.
 */
async function loadContext(orgSlug: string, membershipId: string) {
  const scope = await requireOrg(orgSlug)

  const membership = await db.membership.findFirst({
    where: { id: membershipId, orgId: scope.org.id },
    select: {
      id: true,
      role: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
  })

  return { scope, membership }
}

const ChangeRoleSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.string().min(1),
  role: z.enum(Role),
})

export async function changeMemberRole(raw: unknown): Promise<ActionResult> {
  try {
    const input = ChangeRoleSchema.parse(raw)
    const { scope, membership } = await loadContext(input.orgSlug, input.membershipId)

    if (!membership) return { ok: false, error: 'That member is no longer in this organization.' }

    const denial = await db.$transaction(async (tx) => {
      const ownerCount = await lockedOwnerCount(tx, scope.org.id)

      const reason = checkRoleChange(
        {
          actorRole: scope.role,
          isSelf: membership.userId === scope.user.id,
          targetRole: membership.role,
          ownerCount,
        },
        input.role,
      )

      if (reason) return reason
      if (membership.role === input.role) return null

      await tx.membership.update({
        where: { id: membership.id },
        data: { role: input.role },
      })

      await tx.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.MEMBER_ROLE_CHANGED,
          entityType: 'Membership',
          entityId: membership.id,
          entityLabel: membership.user.email,
          diff: { role: { from: membership.role, to: input.role } },
        },
      })

      return null
    })

    if (denial) return { ok: false, error: denial }

    revalidatePath(`/${input.orgSlug}/members`)
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

const RemoveSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.string().min(1),
})

export async function removeMember(raw: unknown): Promise<ActionResult> {
  try {
    const input = RemoveSchema.parse(raw)
    const { scope, membership } = await loadContext(input.orgSlug, input.membershipId)

    if (!membership) return { ok: true }

    const denial = await db.$transaction(async (tx) => {
      const ownerCount = await lockedOwnerCount(tx, scope.org.id)

      const reason = checkRemoval({
        actorRole: scope.role,
        isSelf: membership.userId === scope.user.id,
        targetRole: membership.role,
        ownerCount,
      })

      if (reason) return reason

      await tx.membership.delete({ where: { id: membership.id } })

      await tx.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.MEMBER_REMOVED,
          entityType: 'Membership',
          entityId: membership.id,
          entityLabel: membership.user.email,
          diff: { role: membership.role },
        },
      })

      return null
    })

    if (denial) return { ok: false, error: denial }

    revalidatePath(`/${input.orgSlug}/members`)
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

const AddSchema = z.object({
  orgSlug: z.string().min(1),
  email: z.string().email('Enter a valid email address'),
  role: z.enum(Role),
})

/**
 * Adds an existing Switchboard user to the organization.
 *
 * Emailed invitations are not built — this is the honest subset: the person
 * must already have an account. The failure message says so rather than
 * pretending an invite went out.
 */
export async function addMember(raw: unknown): Promise<ActionResult> {
  try {
    const input = AddSchema.parse(raw)
    const scope = await requireOrg(input.orgSlug)

    const reason = checkRoleChange(
      {
        actorRole: scope.role,
        isSelf: false,
        // A new membership starts from the lowest role, so the guard that
        // matters here is "may the actor grant the role they picked".
        targetRole: Role.VIEWER,
        ownerCount: 2,
      },
      input.role,
    )
    if (reason) return { ok: false, error: reason }

    const email = input.email.toLowerCase()

    const user = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (!user) {
      return {
        ok: false,
        fieldErrors: {
          email: ['No Switchboard account uses this email. Ask them to sign up first.'],
        },
      }
    }

    const existing = await db.membership.findUnique({
      where: { userId_orgId: { userId: user.id, orgId: scope.org.id } },
      select: { id: true },
    })
    if (existing) {
      return { ok: false, fieldErrors: { email: ['They are already in this organization.'] } }
    }

    // Interactive so the event can name the membership it created, matching
    // what MEMBER_ROLE_CHANGED and MEMBER_REMOVED record.
    await db.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: { userId: user.id, orgId: scope.org.id, role: input.role },
        select: { id: true },
      })

      await tx.auditEvent.create({
        data: {
          orgId: scope.org.id,
          actorId: scope.user.id,
          action: AuditAction.MEMBER_INVITED,
          entityType: 'Membership',
          entityId: membership.id,
          entityLabel: email,
          diff: { role: input.role },
        },
      })
    })

    revalidatePath(`/${input.orgSlug}/members`)
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}
