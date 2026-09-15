import type { Metadata } from 'next'
import Link from 'next/link'
import { History } from 'lucide-react'

import { AuditEventItem, type AuditEventRow } from '@/components/audit/audit-event-item'
import { AuditFilters } from '@/components/audit/audit-filters'
import { Button } from '@/components/ui/button'
import { AuditAction } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { requireOrg } from '@/server/tenancy/scope'

export const metadata: Metadata = { title: 'Audit log' }

const PAGE_SIZE = 40

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ action?: string; env?: string; actor?: string; cursor?: string }>
}

function parseAction(value: string | undefined): AuditAction | undefined {
  if (!value) return undefined
  return (Object.values(AuditAction) as string[]).includes(value)
    ? (value as AuditAction)
    : undefined
}

export default async function AuditPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { action, env, actor, cursor } = await searchParams

  const scope = await requireOrg(orgSlug)

  const where = {
    orgId: scope.org.id,
    ...(parseAction(action) ? { action: parseAction(action) } : {}),
    ...(env ? { environmentKey: env } : {}),
    ...(actor ? { actorId: actor } : {}),
  }

  /*
    Cursor pagination rather than skip/take: the audit log only grows, and an
    offset would both slow down on later pages and silently shift results when
    new events land while someone is paging.

    One extra row is fetched to learn whether another page exists, without a
    second count query.
  */
  const events = await db.auditEvent.findMany({
    where,
    select: {
      id: true,
      action: true,
      entityLabel: true,
      entityType: true,
      environmentKey: true,
      diff: true,
      createdAt: true,
      actor: { select: { name: true, avatarColor: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  const hasMore = events.length > PAGE_SIZE
  const page = hasMore ? events.slice(0, PAGE_SIZE) : events

  const rows: AuditEventRow[] = page.map((event) => ({
    id: event.id,
    action: event.action,
    entityLabel: event.entityLabel,
    entityType: event.entityType,
    environmentKey: event.environmentKey,
    diff: event.diff,
    createdAt: event.createdAt.toISOString(),
    actorName: event.actor?.name ?? null,
    actorColor: event.actor?.avatarColor ?? null,
  }))

  const [actors, environments] = await Promise.all([
    db.user.findMany({
      where: { auditEvents: { some: { orgId: scope.org.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.environment.findMany({
      where: { project: { orgId: scope.org.id } },
      select: { key: true },
      distinct: ['key'],
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  const nextHref = hasMore
    ? buildHref(orgSlug, { action, env, actor, cursor: page[page.length - 1]?.id })
    : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Audit log</h1>
        <p className="pt-1 text-sm text-fg-muted">
          Every change to a flag, a rollout or a membership in {scope.org.name}.
        </p>
      </header>

      <AuditFilters actors={actors} environments={environments.map((e) => e.key)} />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-16 text-center">
          <History className="size-8 text-fg-subtle" aria-hidden="true" />
          <p className="font-medium text-fg">Nothing recorded yet</p>
          <p className="max-w-sm text-sm text-fg-muted">
            {action || env || actor
              ? 'No events match these filters.'
              : 'Changes to flags and members will show up here.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
          <ul className="divide-y divide-border">
            {rows.map((event) => (
              <AuditEventItem key={event.id} event={event} />
            ))}
          </ul>
        </div>
      )}

      {nextHref ? (
        <div className="flex justify-center">
          <Button asChild variant="secondary">
            <Link href={nextHref} scroll={false}>
              Load older events
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function buildHref(
  orgSlug: string,
  params: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }

  return search.size ? `/${orgSlug}/audit?${search}` : `/${orgSlug}/audit`
}
