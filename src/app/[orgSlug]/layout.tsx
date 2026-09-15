import { Flag, History, Settings, ToggleRight, Users } from 'lucide-react'
import Link from 'next/link'

import { SidebarNav, type NavItem } from '@/components/app/sidebar-nav'
import { UserMenu } from '@/components/app/user-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { db } from '@/lib/db'
import { requireOrg } from '@/server/tenancy/scope'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await requireOrg(orgSlug)

  const projects = await db.project.findMany({
    where: { orgId: scope.org.id },
    select: { key: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  const primary = projects[0]?.key

  const items: NavItem[] = [
    ...(primary
      ? [
          {
            href: `/${orgSlug}/${primary}`,
            label: 'Flags',
            icon: <Flag aria-hidden="true" />,
            prefix: true,
          },
        ]
      : []),
    { href: `/${orgSlug}/audit`, label: 'Audit log', icon: <History aria-hidden="true" /> },
    { href: `/${orgSlug}/members`, label: 'Members', icon: <Users aria-hidden="true" /> },
    {
      href: `/${orgSlug}/settings`,
      label: 'Settings',
      icon: <Settings aria-hidden="true" />,
      prefix: true,
    },
  ]

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/*
        Skip link: the sidebar is a long list of repeated links on every page,
        so keyboard users get a way past it.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-accent-fg"
      >
        Skip to content
      </a>

      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <ToggleRight className="size-5 text-accent" aria-hidden="true" />
          <Link href={`/${orgSlug}`} className="text-sm font-semibold tracking-tight text-fg">
            Switchboard
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="border-b border-border px-3 py-3">
          <p className="px-2.5 text-xs font-medium uppercase tracking-wide text-fg-subtle">
            Organization
          </p>
          <p className="truncate px-2.5 pt-1 text-sm font-medium text-fg">{scope.org.name}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav items={items} />
        </div>

        <div className="border-t border-border p-2">
          <UserMenu
            name={scope.user.name}
            email={scope.user.email}
            color={scope.user.avatarColor}
            role={scope.role}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-border bg-surface px-4 md:hidden">
          <ToggleRight className="size-5 text-accent" aria-hidden="true" />
          <span className="text-sm font-semibold text-fg">Switchboard</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
