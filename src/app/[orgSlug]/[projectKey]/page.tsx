import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CreateFlagDialog } from '@/components/flags/create-flag-dialog'
import { EnvironmentTabs } from '@/components/flags/environment-tabs'
import { FlagFilters } from '@/components/flags/flag-filters'
import { FlagsTable } from '@/components/flags/flags-table'
import { db } from '@/lib/db'
import type { Rollout, Rule } from '@/lib/flags/types'
import { can, requireProject } from '@/server/tenancy/scope'

export const metadata: Metadata = { title: 'Flags' }

interface PageProps {
  params: Promise<{ orgSlug: string; projectKey: string }>
  searchParams: Promise<{ env?: string; q?: string; archived?: string }>
}

export default async function FlagsPage({ params, searchParams }: PageProps) {
  const { orgSlug, projectKey } = await params
  const { env, q = '', archived } = await searchParams

  const scope = await requireProject(orgSlug, projectKey)

  const environments = await db.environment.findMany({
    where: { projectId: scope.project.id },
    select: { id: true, key: true, name: true, color: true },
    orderBy: { sortOrder: 'asc' },
  })

  if (environments.length === 0) notFound()

  const active = environments.find((e) => e.key === env) ?? environments[0]
  const showArchived = archived === '1'
  const search = q.trim()

  const flags = await db.flag.findMany({
    where: {
      projectId: scope.project.id,
      archived: showArchived,
      ...(search
        ? {
            OR: [
              { key: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
              { tags: { has: search.toLowerCase() } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      type: true,
      tags: true,
      updatedAt: true,
      variants: { select: { key: true, name: true }, orderBy: { sortOrder: 'asc' } },
      configs: {
        where: { environmentId: active.id },
        select: { enabled: true, rules: true, rollout: true, defaultVariantKey: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const rows = flags.map((flag) => {
    const config = flag.configs[0]
    const rules = (Array.isArray(config?.rules) ? config.rules : []) as unknown as Rule[]
    const rollout = (config?.rollout ?? null) as unknown as Rollout | null

    return {
      key: flag.key,
      name: flag.name,
      description: flag.description,
      type: flag.type,
      tags: flag.tags,
      updatedAt: flag.updatedAt.toISOString(),
      enabled: config?.enabled ?? false,
      ruleCount: rules.length,
      rolloutSummary: summarizeRollout(rollout),
      variantCount: flag.variants.length,
    }
  })

  const editable = can(scope, 'toggleFlag')

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{scope.project.name}</h1>
          <p className="pt-1 text-sm text-fg-muted">
            {rows.length} {showArchived ? 'archived ' : ''}
            {rows.length === 1 ? 'flag' : 'flags'} in{' '}
            <span className="font-medium text-fg">{active.name}</span>
          </p>
        </div>
        {can(scope, 'manageFlags') ? (
          <CreateFlagDialog orgSlug={orgSlug} projectKey={projectKey} />
        ) : null}
      </header>

      <EnvironmentTabs environments={environments} activeKey={active.key} />

      <FlagFilters initialQuery={q} showArchived={showArchived} />

      <FlagsTable
        rows={rows}
        orgSlug={orgSlug}
        projectKey={projectKey}
        environmentKey={active.key}
        environmentName={active.name}
        editable={editable}
        emptyReason={search ? 'search' : showArchived ? 'archived' : 'none'}
      />
    </div>
  )
}

/** "25% on" reads better in a dense table than a list of buckets. */
function summarizeRollout(rollout: Rollout | null): string | null {
  if (!rollout || !Array.isArray(rollout.buckets) || rollout.buckets.length === 0) return null

  const serving = rollout.buckets
    .filter((bucket) => bucket.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  if (serving.length === 0) return null
  if (serving.length === 1) return `100% ${serving[0].variantKey}`

  return serving.map((bucket) => `${bucket.weight}% ${bucket.variantKey}`).join(' · ')
}
