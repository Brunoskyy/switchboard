import { redirect } from 'next/navigation'

import { db } from '@/lib/db'
import { requireOrg } from '@/server/tenancy/scope'

export default async function OrgPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const scope = await requireOrg(orgSlug)

  const project = await db.project.findFirst({
    where: { orgId: scope.org.id },
    select: { key: true },
    orderBy: { createdAt: 'asc' },
  })

  redirect(project ? `/${orgSlug}/${project.key}` : `/${orgSlug}/settings`)
}
