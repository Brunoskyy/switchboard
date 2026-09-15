'use client'

import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

const DEBOUNCE_MS = 250

export function FlagFilters({
  initialQuery,
  showArchived,
}: {
  initialQuery: string
  showArchived: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [query, setQuery] = React.useState(initialQuery)
  const [isPending, startTransition] = React.useTransition()

  const pushParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams)
      mutate(params)
      startTransition(() => {
        // replace, not push: typing in a search box should not fill the history
        // stack with a entry per keystroke.
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
      })
    },
    [pathname, router, searchParams],
  )

  // Debounce the URL write so each keystroke does not trigger a server render,
  // while the input itself stays fully controlled and responsive.
  React.useEffect(() => {
    if (query === initialQuery) return

    const timer = setTimeout(() => {
      pushParams((params) => {
        if (query) params.set('q', query)
        else params.delete('q')
      })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, initialQuery, pushParams])

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search flags, keys or tags"
          aria-label="Search flags"
          className="pl-8 pr-8"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-fg-subtle transition-colors hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
        {/* Announce result changes to screen readers without stealing focus. */}
        <span aria-live="polite" className="sr-only">
          {isPending ? 'Updating results' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="show-archived"
          checked={showArchived}
          onCheckedChange={(checked) =>
            pushParams((params) => {
              if (checked) params.set('archived', '1')
              else params.delete('archived')
            })
          }
        />
        <Label htmlFor="show-archived" className="text-sm text-fg-muted">
          Archived
        </Label>
      </div>
    </div>
  )
}
