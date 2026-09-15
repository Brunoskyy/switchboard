import type { Metadata } from 'next'
import Link from 'next/link'

import { CreateProjectDialog } from '@/components/settings/create-project-dialog'
import { OrgNameForm } from '@/components/settings/org-name-form'
import { SdkKeysPanel, type SdkKeyRow } from '@/components/settings/sdk-keys-panel'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/lib/db'
import { can, requireOrg } from '@/server/tenancy/scope'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const scope = await requireOrg(orgSlug)

  const projects = await db.project.findMany({
    where: { orgId: scope.org.id },
    select: {
      id: true,
      key: true,
      name: true,
      _count: { select: { flags: true } },
      environments: {
        select: {
          key: true,
          name: true,
          color: true,
          sdkKeys: {
            select: {
              id: true,
              name: true,
              prefix: true,
              createdAt: true,
              revokedAt: true,
              lastUsedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const manageProjects = can(scope, 'manageProjects')
  const manageKeys = can(scope, 'manageSdkKeys')

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Settings</h1>
        <p className="pt-1 text-sm text-fg-muted">
          Organization, projects and SDK keys.
        </p>
      </header>

      <OrgNameForm orgSlug={orgSlug} initialName={scope.org.name} editable={manageProjects} />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Each project has its own flags and its own set of environments.
            </CardDescription>
          </div>
          {manageProjects ? <CreateProjectDialog orgSlug={orgSlug} /> : null}
        </CardHeader>

        <CardContent>
          <ul className="divide-y divide-border">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${orgSlug}/${project.key}`}
                    className="font-medium text-fg hover:text-accent hover:underline"
                  >
                    {project.name}
                  </Link>
                  <p className="font-mono text-xs text-fg-subtle">{project.key}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {project.environments.map((environment) => (
                    <span
                      key={environment.key}
                      className="inline-flex items-center gap-1.5 text-xs text-fg-muted"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: environment.color }}
                        aria-hidden="true"
                      />
                      {environment.name}
                    </span>
                  ))}
                </div>

                <Badge>
                  {project._count.flags} {project._count.flags === 1 ? 'flag' : 'flags'}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {projects.map((project) => (
        <SdkKeysPanel
          key={project.id}
          orgSlug={orgSlug}
          projectKey={project.key}
          projectName={project.name}
          environments={project.environments.map((e) => ({ key: e.key, name: e.name }))}
          keys={project.environments.flatMap<SdkKeyRow>((environment) =>
            environment.sdkKeys.map((key) => ({
              id: key.id,
              name: key.name,
              prefix: key.prefix,
              environmentKey: environment.key,
              environmentName: environment.name,
              createdAt: key.createdAt.toISOString(),
              revokedAt: key.revokedAt?.toISOString() ?? null,
              lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
            })),
          )}
          editable={manageKeys}
        />
      ))}
    </div>
  )
}
