import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/app/(auth)/login/login-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentUser } from '@/server/tenancy/scope'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Manage your feature flags and rollouts.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LoginForm />
        <p className="text-center text-sm text-fg-muted">
          No account?{' '}
          <Link href="/signup" className="font-medium text-accent hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
