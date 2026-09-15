import * as React from 'react'

import { cn } from '@/lib/utils'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm text-fg',
        'placeholder:text-fg-subtle',
        'transition-colors hover:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-fg',
        'placeholder:text-fg-subtle transition-colors hover:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  )
}
