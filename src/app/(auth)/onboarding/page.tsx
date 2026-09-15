import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { OnboardingForm } from '@/app/(auth)/onboarding/onboarding-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/server/tenancy/scope'

export const metadata: Metadata = { title: 'Create an organization' }

/**
 * Where someone lands when they are signed in but belong to no organization —
 * either they were just removed from their last one, or their account outlived
 * the org. Without this the root route sent them to a 404 with no way forward.
 */
export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    select: { org: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  })

  if (membership) redirect(`/${membership.org.slug}`)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an organization</CardTitle>
        <CardDescription>
          You are signed in as {user.email} but do not belong to an organization yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingForm />
      </CardContent>
    </Card>
  )
}
