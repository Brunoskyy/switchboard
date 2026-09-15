import { describe, expect, it } from 'vitest'

import { Role } from '@/generated/prisma/enums'

import { assignableRoles, canManageMembers, checkRemoval, checkRoleChange } from './rules'
import type { MemberActionContext } from './rules'

const ctx = (overrides: Partial<MemberActionContext> = {}): MemberActionContext => ({
  actorRole: Role.OWNER,
  isSelf: false,
  targetRole: Role.MEMBER,
  ownerCount: 2,
  ...overrides,
})

describe('canManageMembers', () => {
  it('admits admins and owners only', () => {
    expect(canManageMembers(Role.OWNER)).toBe(true)
    expect(canManageMembers(Role.ADMIN)).toBe(true)
    expect(canManageMembers(Role.MEMBER)).toBe(false)
    expect(canManageMembers(Role.VIEWER)).toBe(false)
  })
})

describe('checkRoleChange', () => {
  it('lets an owner promote a member to admin', () => {
    expect(checkRoleChange(ctx(), Role.ADMIN)).toBeNull()
  })

  it('refuses members and viewers outright', () => {
    expect(checkRoleChange(ctx({ actorRole: Role.MEMBER }), Role.ADMIN)).toMatch(/admin role/)
    expect(checkRoleChange(ctx({ actorRole: Role.VIEWER }), Role.ADMIN)).toMatch(/admin role/)
  })

  it('checks permission before checking whether anything would change', () => {
    // A no-op is still an action the caller was not entitled to attempt, and
    // silently succeeding would let the UI offer a control it should not.
    expect(checkRoleChange(ctx({ actorRole: Role.MEMBER, targetRole: Role.MEMBER }), Role.MEMBER))
      .toMatch(/admin role/)
  })

  it('allows a no-op change from someone who could have made a real one', () => {
    expect(checkRoleChange(ctx({ targetRole: Role.ADMIN }), Role.ADMIN)).toBeNull()
    // Even the last-owner guard does not fire when the role is unchanged.
    expect(checkRoleChange(ctx({ targetRole: Role.OWNER, ownerCount: 1 }), Role.OWNER))
      .toBeNull()
  })

  it('stops an admin from editing an owner', () => {
    const result = checkRoleChange(
      ctx({ actorRole: Role.ADMIN, targetRole: Role.OWNER }),
      Role.MEMBER,
    )
    expect(result).toMatch(/Only an owner/)
  })

  it('stops an admin from minting a new owner, including themselves', () => {
    expect(checkRoleChange(ctx({ actorRole: Role.ADMIN }), Role.OWNER)).toMatch(/Only an owner/)
    expect(
      checkRoleChange(
        ctx({ actorRole: Role.ADMIN, isSelf: true, targetRole: Role.ADMIN }),
        Role.OWNER,
      ),
    ).toMatch(/Only an owner/)
  })

  it('refuses to demote the last owner', () => {
    const result = checkRoleChange(
      ctx({ targetRole: Role.OWNER, ownerCount: 1 }),
      Role.ADMIN,
    )
    expect(result).toMatch(/only owner/i)
  })

  it('refuses to let the last owner demote themselves', () => {
    const result = checkRoleChange(
      ctx({ isSelf: true, targetRole: Role.OWNER, ownerCount: 1 }),
      Role.MEMBER,
    )
    expect(result).toMatch(/only owner/i)
  })

  it('allows demoting an owner once another owner exists', () => {
    expect(checkRoleChange(ctx({ targetRole: Role.OWNER, ownerCount: 2 }), Role.ADMIN))
      .toBeNull()
  })
})

describe('checkRemoval', () => {
  it('lets an owner remove a member', () => {
    expect(checkRemoval(ctx())).toBeNull()
  })

  it('refuses a member removing someone else', () => {
    expect(checkRemoval(ctx({ actorRole: Role.MEMBER }))).toMatch(/admin role/)
  })

  it('lets anyone leave on their own, whatever their role', () => {
    expect(checkRemoval(ctx({ actorRole: Role.VIEWER, isSelf: true, targetRole: Role.VIEWER })))
      .toBeNull()
    expect(checkRemoval(ctx({ actorRole: Role.MEMBER, isSelf: true, targetRole: Role.MEMBER })))
      .toBeNull()
  })

  it('stops an admin removing an owner', () => {
    expect(checkRemoval(ctx({ actorRole: Role.ADMIN, targetRole: Role.OWNER })))
      .toMatch(/Only an owner/)
  })

  it('refuses to remove the last owner, by anyone', () => {
    expect(checkRemoval(ctx({ targetRole: Role.OWNER, ownerCount: 1 }))).toMatch(/only owner/i)
  })

  it('refuses to let the last owner leave', () => {
    const result = checkRemoval(
      ctx({ actorRole: Role.OWNER, isSelf: true, targetRole: Role.OWNER, ownerCount: 1 }),
    )
    expect(result).toMatch(/only owner/i)
  })

  it('lets an owner leave once another owner remains', () => {
    expect(
      checkRemoval(
        ctx({ actorRole: Role.OWNER, isSelf: true, targetRole: Role.OWNER, ownerCount: 2 }),
      ),
    ).toBeNull()
  })
})

describe('assignableRoles', () => {
  it('gives owners every role and admins everything below owner', () => {
    expect(assignableRoles(Role.OWNER)).toContain(Role.OWNER)
    expect(assignableRoles(Role.ADMIN)).not.toContain(Role.OWNER)
    expect(assignableRoles(Role.ADMIN)).toHaveLength(3)
  })

  it('gives members and viewers nothing to assign', () => {
    expect(assignableRoles(Role.MEMBER)).toEqual([])
    expect(assignableRoles(Role.VIEWER)).toEqual([])
  })
})
