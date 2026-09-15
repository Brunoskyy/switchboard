import 'server-only'

import { notFound, redirect } from 'next/navigation'

import { db } from '@/lib/db'
import { Role } from '@/generated/prisma/enums'
import { readSession } from '@/server/auth/session'

/**
 * Tenant scoping
 * --------------
 * Organization is the tenant boundary. The rule every server action and route
 * handler follows:
 *
 *   Never trust an id that arrived from the client. Resolve the org from the
 *   URL slug through the caller's Membership, then use the *resolved* ids for
 *   every subsequent query.
 *
 * A missing membership is reported as 404, not 403: telling a stranger that an
 * org exists but they cannot see it leaks the customer list.
 */

const ROLE_RANK: Record<Role, number> = {
  [Role.VIEWER]: 0,
  [Role.MEMBER]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
}

export function hasAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum]
}

export const PERMISSIONS = {
  /** Flip a flag on/off and edit its targeting in an environment. */
  toggleFlag: Role.MEMBER,
  editTargeting: Role.MEMBER,
  /** Create, rename and archive flags; manage projects and environments. */
  manageFlags: Role.ADMIN,
  manageProjects: Role.ADMIN,
  manageMembers: Role.ADMIN,
  manageSdkKeys: Role.ADMIN,
  /** Destructive, org-wide. */
  deleteOrganization: Role.OWNER,
} as const

export type Permission = keyof typeof PERMISSIONS

export interface AuthedUser {
  id: string
  email: string
  name: string
  avatarColor: string
}

export async function getCurrentUser(): Promise<AuthedUser | null> {
  const session = await readSession()
  if (!session) return null

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, avatarColor: true },
  })

  // The cookie can outlive the row it points at (deleted account, reset DB).
  return user ?? null
}

export async function requireUser(): Promise<AuthedUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export interface OrgScope {
  user: AuthedUser
  org: { id: string; name: string; slug: string }
  role: Role
}

/** Resolves an org from its URL slug, but only if the caller is a member. */
export async function requireOrg(slug: string): Promise<OrgScope> {
  const user = await requireUser()

  const membership = await db.membership.findFirst({
    where: { userId: user.id, org: { slug } },
    select: {
      role: true,
      org: { select: { id: true, name: true, slug: true } },
    },
  })

  if (!membership) notFound()

  return { user, org: membership.org, role: membership.role }
}

export function can(scope: Pick<OrgScope, 'role'>, permission: Permission): boolean {
  return hasAtLeast(scope.role, PERMISSIONS[permission])
}

/** Throws rather than returning false, for use at the top of a mutation. */
export function assertCan(scope: Pick<OrgScope, 'role'>, permission: Permission): void {
  if (!can(scope, permission)) {
    throw new PermissionError(
      `This action requires the ${PERMISSIONS[permission].toLowerCase()} role or higher.`,
    )
  }
}

export class PermissionError extends Error {
  readonly code = 'FORBIDDEN'
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

export interface ProjectScope extends OrgScope {
  project: { id: string; name: string; key: string }
}

/**
 * Resolves a project inside an org the caller belongs to. The `orgId` filter is
 * what stops a valid project key from one tenant being read through another
 * tenant's URL.
 */
export async function requireProject(
  orgSlug: string,
  projectKey: string,
): Promise<ProjectScope> {
  const scope = await requireOrg(orgSlug)

  const project = await db.project.findFirst({
    where: { key: projectKey, orgId: scope.org.id },
    select: { id: true, name: true, key: true },
  })

  if (!project) notFound()

  return { ...scope, project }
}

/** Resolves an environment inside an already-scoped project. */
export async function requireEnvironment(scope: ProjectScope, environmentKey: string) {
  const environment = await db.environment.findFirst({
    where: { key: environmentKey, projectId: scope.project.id },
    select: { id: true, name: true, key: true, color: true },
  })

  if (!environment) notFound()

  return environment
}
