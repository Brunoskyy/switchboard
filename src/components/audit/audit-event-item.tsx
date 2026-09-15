import {
  Archive,
  ArchiveRestore,
  KeyRound,
  KeySquare,
  ListFilter,
  Percent,
  Plus,
  ToggleRight,
  UserMinus,
  UserPlus,
  UserCog,
  Pencil,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { AuditAction } from '@/generated/prisma/enums'
import { formatDateTime, formatRelative } from '@/lib/format'

export interface AuditEventRow {
  id: string
  action: AuditAction
  entityLabel: string
  entityType: string
  environmentKey: string | null
  diff: unknown
  createdAt: string
  actorName: string | null
  actorColor: string | null
}

const PRESENTATION: Record<
  AuditAction,
  { icon: typeof Plus; verb: string; tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }
> = {
  [AuditAction.CREATED]: { icon: Plus, verb: 'created', tone: 'success' },
  [AuditAction.UPDATED]: { icon: Pencil, verb: 'updated', tone: 'neutral' },
  [AuditAction.ARCHIVED]: { icon: Archive, verb: 'archived', tone: 'danger' },
  [AuditAction.RESTORED]: { icon: ArchiveRestore, verb: 'restored', tone: 'success' },
  [AuditAction.TOGGLED]: { icon: ToggleRight, verb: 'toggled', tone: 'accent' },
  [AuditAction.ROLLOUT_CHANGED]: { icon: Percent, verb: 'changed the rollout for', tone: 'warning' },
  [AuditAction.RULES_CHANGED]: { icon: ListFilter, verb: 'changed targeting for', tone: 'warning' },
  [AuditAction.MEMBER_INVITED]: { icon: UserPlus, verb: 'added', tone: 'success' },
  [AuditAction.MEMBER_ROLE_CHANGED]: { icon: UserCog, verb: 'changed the role of', tone: 'accent' },
  [AuditAction.MEMBER_REMOVED]: { icon: UserMinus, verb: 'removed', tone: 'danger' },
  [AuditAction.KEY_CREATED]: { icon: KeyRound, verb: 'created an SDK key', tone: 'success' },
  [AuditAction.KEY_REVOKED]: { icon: KeySquare, verb: 'revoked an SDK key', tone: 'danger' },
}

/**
 * Renders the recorded diff as "field: from → to".
 *
 * `diff` is a Json column, so its shape is only as trustworthy as whatever
 * wrote it. Anything that does not match the expected `{ field: { from, to } }`
 * is rendered as raw JSON rather than dropped — an audit log that silently
 * hides what it cannot parse is worse than one that looks untidy.
 */
function DiffSummary({ diff }: { diff: unknown }) {
  if (diff === null || typeof diff !== 'object' || Array.isArray(diff)) return null

  const entries = Object.entries(diff as Record<string, unknown>)
  if (entries.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
      {entries.map(([field, change]) => {
        const isFromTo =
          change !== null &&
          typeof change === 'object' &&
          !Array.isArray(change) &&
          ('from' in change || 'to' in change)

        return (
          <li key={field} className="font-mono text-xs text-fg-subtle">
            <span className="text-fg-muted">{field}</span>{' '}
            {isFromTo ? (
              <>
                {JSON.stringify((change as { from?: unknown }).from ?? null)}
                <span aria-label="changed to"> → </span>
                {JSON.stringify((change as { to?: unknown }).to ?? null)}
              </>
            ) : (
              JSON.stringify(change)
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function AuditEventItem({ event }: { event: AuditEventRow }) {
  const presentation = PRESENTATION[event.action]
  const Icon = presentation.icon

  const initials = (event.actorName ?? '??')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <li className="flex items-start gap-3 p-4">
      <span
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: event.actorColor ?? 'var(--color-fg-subtle)' }}
        aria-hidden="true"
      >
        {initials}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">
          <span className="font-medium">{event.actorName ?? 'A deleted user'}</span>{' '}
          <span className="text-fg-muted">{presentation.verb}</span>{' '}
          <span className="font-mono text-xs">{event.entityLabel}</span>
          {event.environmentKey ? (
            <>
              {' '}
              <span className="text-fg-muted">in</span>{' '}
              <Badge tone={presentation.tone}>{event.environmentKey}</Badge>
            </>
          ) : null}
        </p>

        <DiffSummary diff={event.diff} />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Icon className="size-4 text-fg-subtle" aria-hidden="true" />
        <time
          dateTime={event.createdAt}
          title={formatDateTime(event.createdAt)}
          className="whitespace-nowrap text-xs text-fg-subtle"
        >
          {formatRelative(event.createdAt)}
        </time>
      </div>
    </li>
  )
}
