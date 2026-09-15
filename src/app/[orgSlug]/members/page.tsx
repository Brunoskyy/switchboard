import type { Metadata } from 'next'

import { AddMemberDialog } from '@/components/members/add-member-dialog'
import { MembersTable } from '@/components/members/members-table'
import { db } from '@/lib/db'
import { Role } from '@/generated/prisma/enums'
import { canManageMembers } from '@/lib/members/rules'
import { requireOrg } from '@/server/tenancy/scope'

export const metadata: Metadata = { title: 'Members' }

export default async function MembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await requireOrg(orgSlug)

  const memberships = await db.membership.findMany({
    where: { orgId: scope.org.id },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, avatarColor: true } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })

  const ownerCount = memberships.filter((m) => m.role === Role.OWNER).length

  const rows = memberships.map((membership) => ({
    id: membership.id,
    role: membership.role,
    joinedAt: membership.createdAt.toISOString(),
    isSelf: membership.user.id === scope.user.id,
    name: membership.user.name,
    email: membership.user.email,
    color: membership.user.avatarColor,
  }))

  const manageable = canManageMembers(scope.role)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Members</h1>
          <p className="pt-1 text-sm text-fg-muted">
            {rows.length} {rows.length === 1 ? 'person' : 'people'} in {scope.org.name}
          </p>
        </div>
        {manageable ? <AddMemberDialog orgSlug={orgSlug} actorRole={scope.role} /> : null}
      </header>

      <MembersTable
        rows={rows}
        orgSlug={orgSlug}
        actorRole={scope.role}
        ownerCount={ownerCount}
      />
    </div>
  )
}
