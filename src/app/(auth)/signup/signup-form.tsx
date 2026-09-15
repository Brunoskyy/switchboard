'use client'

import { useActionState } from 'react'

import { Field } from '@/components/auth/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { signup, type AuthFormState } from '@/server/auth/actions'

const INITIAL: AuthFormState = {}

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signup, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="rounded-[var(--radius-control)] border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <Field id="name" label="Your name" errors={state.fieldErrors?.name}>
        {(props) => (
          <Input {...props} name="name" autoComplete="name" defaultValue={state.values?.name} required />
        )}
      </Field>

      <Field id="organization" label="Organization" errors={state.fieldErrors?.organization}>
        {(props) => (
          <Input
            {...props}
            name="organization"
            autoComplete="organization"
            placeholder="Acme Inc"
            defaultValue={state.values?.organization}
            required
          />
        )}
      </Field>

      <Field id="email" label="Work email" errors={state.fieldErrors?.email}>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.values?.email}
            required
          />
        )}
      </Field>

      <Field
        id="password"
        label="Password"
        hint="At least 10 characters."
        errors={state.fieldErrors?.password}
      >
        {(props) => (
          <Input {...props} name="password" type="password" autoComplete="new-password" required />
        )}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
