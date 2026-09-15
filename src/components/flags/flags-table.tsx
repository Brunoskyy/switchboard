import { FileQuestion, Flag as FlagIcon, SearchX } from 'lucide-react'
import Link from 'next/link'

import { FlagToggle } from '@/components/flags/flag-toggle'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/lib/format'

export interface FlagRow {
  key: string
  name: string
  description: string
  type: string
  tags: string[]
  updatedAt: string
  enabled: boolean
  ruleCount: number
  rolloutSummary: string | null
  variantCount: number
}

interface FlagsTableProps {
  rows: FlagRow[]
  orgSlug: string
  projectKey: string
  environmentKey: string
  environmentName: string
  editable: boolean
  emptyReason: 'search' | 'archived' | 'none'
}

export function FlagsTable({
  rows,
  orgSlug,
  projectKey,
  environmentKey,
  environmentName,
  editable,
  emptyReason,
}: FlagsTableProps) {
  if (rows.length === 0) return <EmptyState reason={emptyReason} />

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-start gap-4 p-4 transition-colors hover:bg-surface-raised"
          >
            <div className="pt-0.5">
              <FlagToggle
                orgSlug={orgSlug}
                projectKey={projectKey}
                environmentKey={environmentKey}
                environmentName={environmentName}
                flagKey={row.key}
                flagName={row.name}
                enabled={row.enabled}
                editable={editable}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/${orgSlug}/${projectKey}/flags/${row.key}?env=${environmentKey}`}
                  className="font-medium text-fg hover:text-accent hover:underline"
                >
                  {row.name}
                </Link>
                {row.variantCount > 2 ? (
                  <Badge tone="accent">{row.variantCount} variants</Badge>
                ) : null}
                {row.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>

              <p className="truncate pt-0.5 font-mono text-xs text-fg-subtle">{row.key}</p>

              {row.description ? (
                <p className="line-clamp-1 pt-1 text-sm text-fg-muted">{row.description}</p>
              ) : null}
            </div>

            <div className="hidden shrink-0 flex-col items-end gap-1 text-xs text-fg-muted sm:flex">
              {row.rolloutSummary ? (
                <Badge tone="warning">{row.rolloutSummary}</Badge>
              ) : null}
              {row.ruleCount > 0 ? (
                <span>
                  {row.ruleCount} {row.ruleCount === 1 ? 'rule' : 'rules'}
                </span>
              ) : null}
              <time dateTime={row.updatedAt} className="text-fg-subtle">
                {formatRelative(row.updatedAt)}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyState({ reason }: { reason: FlagsTableProps['emptyReason'] }) {
  const content = {
    search: {
      icon: SearchX,
      title: 'No flags match your search',
      body: 'Try a different key, name or tag.',
    },
    archived: {
      icon: FileQuestion,
      title: 'Nothing archived yet',
      body: 'Flags you archive are kept here so their history stays readable.',
    },
    none: {
      icon: FlagIcon,
      title: 'No flags in this project',
      body: 'Create your first flag to start shipping behind a switch.',
    },
  }[reason]

  const Icon = content.icon

  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-16 text-center">
      <Icon className="size-8 text-fg-subtle" aria-hidden="true" />
      <p className="font-medium text-fg">{content.title}</p>
      <p className="max-w-sm text-sm text-fg-muted">{content.body}</p>
    </div>
  )
}
