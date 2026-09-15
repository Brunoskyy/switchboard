import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { EnvironmentTabs } from '@/components/flags/environment-tabs'
import { EvaluationTester } from '@/components/flags/evaluation-tester'
import { TargetingEditor } from '@/components/flags/targeting-editor'
import { Badge } from '@/components/ui/badge'
import { db } from '@/lib/db'
import type { Rollout, Rule } from '@/lib/flags/types'
import { can, requireProject } from '@/server/tenancy/scope'

interface PageProps {
  params: Promise<{ orgSlug: string; projectKey: string; flagKey: string }>
  searchParams: Promise<{ env?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { flagKey } = await params
  return { title: flagKey }
}

export default async function FlagDetailPage({ params, searchParams }: PageProps) {
  const { orgSlug, projectKey, flagKey } = await params
  const { env } = await searchParams

  const scope = await requireProject(orgSlug, projectKey)

  const environments = await db.environment.findMany({
    where: { projectId: scope.project.id },
    select: { id: true, key: true, name: true, color: true },
    orderBy: { sortOrder: 'asc' },
  })
  if (environments.length === 0) notFound()

  const active = environments.find((e) => e.key === env) ?? environments[0]

  const flag = await db.flag.findFirst({
    where: { key: flagKey, projectId: scope.project.id },
    select: {
      key: true,
      name: true,
      description: true,
      type: true,
      tags: true,
      archived: true,
      variants: {
        select: { key: true, name: true, value: true },
        orderBy: { sortOrder: 'asc' },
      },
      configs: {
        where: { environmentId: active.id },
        select: {
          enabled: true,
          rules: true,
          rollout: true,
          defaultVariantKey: true,
          offVariantKey: true,
        },
      },
    },
  })

  if (!flag) notFound()

  const config = flag.configs[0]
  if (!config) notFound()

  const variants = flag.variants.map((variant) => ({
    key: variant.key,
    name: variant.name,
    value: variant.value,
  }))

  const fallbackKey = variants[0]?.key ?? ''

  const targeting = {
    enabled: config.enabled,
    rules: (Array.isArray(config.rules) ? config.rules : []) as unknown as Rule[],
    rollout: (config.rollout ?? null) as unknown as Rollout | null,
    defaultVariantKey: config.defaultVariantKey ?? fallbackKey,
    offVariantKey: config.offVariantKey ?? fallbackKey,
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <Link
          href={`/${orgSlug}/${projectKey}?env=${active.key}`}
          className="inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          All flags
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-fg">{flag.name}</h1>
            {flag.archived ? <Badge tone="danger">Archived</Badge> : null}
            <Badge>{flag.type.toLowerCase()}</Badge>
            {flag.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <p className="pt-1 font-mono text-xs text-fg-subtle">{flag.key}</p>
          {flag.description ? (
            <p className="max-w-2xl pt-2 text-sm text-fg-muted">{flag.description}</p>
          ) : null}
        </div>
      </header>

      <EnvironmentTabs environments={environments} activeKey={active.key} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <TargetingEditor
          key={`${flag.key}:${active.key}`}
          orgSlug={orgSlug}
          projectKey={projectKey}
          environmentKey={active.key}
          environmentName={active.name}
          flagKey={flag.key}
          flagName={flag.name}
          variants={variants}
          initial={targeting}
          editable={can(scope, 'editTargeting') && !flag.archived}
        />

        <EvaluationTester
          flagKey={flag.key}
          archived={flag.archived}
          variants={variants}
          targeting={targeting}
        />
      </div>
    </div>
  )
}
