import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { SignupForm } from '@/app/(auth)/signup/signup-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentUser } from '@/server/tenancy/scope'

export const metadata: Metadata = { title: 'Create account' }

export default async function SignupPage() {
  if (await getCurrentUser()) redirect('/')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Your organization and a first project are set up for you.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SignupForm />
        <p className="text-center text-sm text-fg-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
