'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { cn } from '@/lib/utils'

interface Environment {
  key: string
  name: string
  color: string
}

/**
 * The selected environment lives in the URL, not in component state, so a link
 * to "production" is shareable and the browser back button does the obvious
 * thing. Every other filter is preserved when switching.
 */
export function EnvironmentTabs({
  environments,
  activeKey,
}: {
  environments: Environment[]
  activeKey: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hrefFor = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('env', key)
    return `${pathname}?${next.toString()}`
  }

  return (
    <div className="border-b border-border">
      <nav aria-label="Environment" className="flex items-center gap-1">
        {environments.map((environment) => {
          const active = environment.key === activeKey

          return (
            <Link
              key={environment.key}
              href={hrefFor(environment.key)}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-accent text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: environment.color }}
                aria-hidden="true"
              />
              {environment.name}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
