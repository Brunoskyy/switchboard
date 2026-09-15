'use client'

import { useActionState } from 'react'

import { Field } from '@/components/auth/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { login, type AuthFormState } from '@/server/auth/actions'

const INITIAL: AuthFormState = {}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        // role="alert" so the message is announced even though focus has not moved.
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <Field id="email" label="Email" errors={state.fieldErrors?.email}>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            defaultValue={state.values?.email}
            required
          />
        )}
      </Field>

      <Field id="password" label="Password" errors={state.fieldErrors?.password}>
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="current-password" required />
        )}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="rounded-[var(--radius-control)] border border-border bg-surface-raised px-3 py-2 text-xs text-fg-muted">
        <span className="font-medium text-fg">Demo account</span>
        <br />
        ana@northwind.test · switchboard123
      </p>
    </form>
  )
}
