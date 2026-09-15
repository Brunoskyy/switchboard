import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('animate-pulse rounded-[var(--radius-control)] bg-surface-raised', className)}
      // Decorative: the surrounding region announces loading state instead.
      aria-hidden="true"
      {...props}
    />
  )
}
