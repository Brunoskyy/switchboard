import * as React from 'react'

import { Label } from '@/components/ui/label'

interface FieldProps {
  id: string
  label: string
  errors?: string[]
  hint?: string
  children: (props: {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
  }) => React.ReactNode
}

/**
 * Wires a control to its label, hint and error message.
 *
 * The point of the render-prop is that `aria-describedby` and `aria-invalid`
 * cannot be forgotten at the call site — a screen reader user hears the error
 * the moment the field takes focus, which is the whole reason the markup
 * exists.
 */
export function Field({ id, label, errors, hint, children }: FieldProps) {
  const firstError = errors?.[0]
  const hasError = Boolean(firstError)
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [hasError ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': hasError,
        'aria-describedby': describedBy || undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
      {firstError ? (
        <p id={errorId} className="text-xs text-danger">
          {firstError}
        </p>
      ) : null}
    </div>
  )
}
