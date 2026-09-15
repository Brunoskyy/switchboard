'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

export interface NavItem {
  href: string
  label: string
  /** Lucide icon name is resolved by the caller; we take the node. */
  icon: React.ReactNode
  /** Match nested routes too, not just the exact path. */
  prefix?: boolean
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = item.prefix
            ? pathname === item.href || pathname.startsWith(`${item.href}/`)
            : pathname === item.href

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                // aria-current is what tells a screen reader which page it is on;
                // the colour change alone says nothing.
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm transition-colors',
                  '[&_svg]:size-4 [&_svg]:shrink-0',
                  active
                    ? 'bg-accent-subtle font-medium text-accent'
                    : 'text-fg-muted hover:bg-surface-raised hover:text-fg',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
