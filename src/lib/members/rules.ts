import { Role } from '@/generated/prisma/enums'

/**
 * Who may change whom.
 *
 * These are the rules that stop an organization locking itself out or an
 * admin quietly promoting themselves, so they live in a pure module the
 * server actions call and the tests exercise directly — not inline in a
 * handler where only the happy path ever gets read.
 *
 * Every function returns `null` when the action is allowed, or the reason it
 * is not. That reason is written to be shown to the user as-is.
 */

const RANK: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.MEMBER]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
}

/** The one ordering of roles; permission checks in tenancy/scope.ts use it too. */
export function hasAtLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum]
}

export interface MemberActionContext {
  /** Role of the person performing the action. */
  actorRole: Role
  /** Whether the actor is acting on their own membership. */
  isSelf: boolean
  /** Current role of the membership being acted on. */
  targetRole: Role
  /** How many OWNER memberships the org has right now. */
  ownerCount: number
}

export function canManageMembers(actorRole: Role): boolean {
  return hasAtLeast(actorRole, Role.ADMIN)
}

export function checkRoleChange(
  context: MemberActionContext,
  nextRole: Role,
): string | null {
  const { actorRole, isSelf, targetRole, ownerCount } = context

  if (!canManageMembers(actorRole)) {
    return 'You need the admin role or higher to change member roles.'
  }

  if (nextRole === targetRole) return null

  // An admin must not be able to reach above their own level — in either
  // direction. Editing an owner, or minting a new one, is owner-only.
  if (actorRole !== Role.OWNER && targetRole === Role.OWNER) {
    return 'Only an owner can change another owner’s role.'
  }

  if (actorRole !== Role.OWNER && nextRole === Role.OWNER) {
    return 'Only an owner can promote someone to owner.'
  }

  // Losing the last owner would leave nobody able to grant the role back.
  if (targetRole === Role.OWNER && nextRole !== Role.OWNER && ownerCount <= 1) {
    return 'This is the only owner. Promote someone else to owner first.'
  }

  if (isSelf && targetRole === Role.OWNER && nextRole !== Role.OWNER && ownerCount <= 1) {
    return 'You are the only owner. Promote someone else before changing your own role.'
  }

  return null
}

export function checkRemoval(context: MemberActionContext): string | null {
  const { actorRole, isSelf, targetRole, ownerCount } = context

  // Anyone may leave an org they are not the last owner of, whatever their role.
  if (!isSelf && !canManageMembers(actorRole)) {
    return 'You need the admin role or higher to remove members.'
  }

  if (!isSelf && actorRole !== Role.OWNER && targetRole === Role.OWNER) {
    return 'Only an owner can remove another owner.'
  }

  if (targetRole === Role.OWNER && ownerCount <= 1) {
    return isSelf
      ? 'You are the only owner. Promote someone else before leaving.'
      : 'This is the only owner. Promote someone else to owner first.'
  }

  return null
}

/** Roles an actor is allowed to assign, for populating a role picker. */
export function assignableRoles(actorRole: Role): Role[] {
  const all = [Role.VIEWER, Role.MEMBER, Role.ADMIN, Role.OWNER]
  if (actorRole === Role.OWNER) return all
  if (actorRole === Role.ADMIN) return all.filter((role) => role !== Role.OWNER)
  return []
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.OWNER]: 'Full access, including billing and deleting the organization.',
  [Role.ADMIN]: 'Manage flags, projects, SDK keys and members.',
  [Role.MEMBER]: 'Toggle flags and edit targeting.',
  [Role.VIEWER]: 'Read-only access to flags and history.',
}
