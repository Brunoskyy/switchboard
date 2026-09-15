import { redirect } from 'next/navigation'

import { db } from '@/lib/db'
import { getCurrentUser } from '@/server/tenancy/scope'

/**
 * The root is only ever a router: signed out goes to login, signed in goes to
 * the org the user joined first.
 */
export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    select: { org: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  })

  redirect(membership ? `/${membership.org.slug}` : '/onboarding')
}
