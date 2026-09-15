'use client'

import { useActionState } from 'react'

import { Field } from '@/components/auth/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createOrganization, type AuthFormState } from '@/server/auth/actions'

const INITIAL: AuthFormState = {}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createOrganization, INITIAL)

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

      <Field
        id="organization"
        label="Organization name"
        hint="A first project with three environments is created with it."
        errors={state.fieldErrors?.name}
      >
        {(props) => (
          <Input {...props} name="name" autoFocus autoComplete="organization" required />
        )}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {pending ? 'Creating…' : 'Create organization'}
      </Button>
    </form>
  )
}
