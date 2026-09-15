'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AuditAction } from '@/generated/prisma/enums'

const ANY = '__any__'

const ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.CREATED]: 'Created',
  [AuditAction.UPDATED]: 'Updated',
  [AuditAction.ARCHIVED]: 'Archived',
  [AuditAction.RESTORED]: 'Restored',
  [AuditAction.TOGGLED]: 'Toggled',
  [AuditAction.ROLLOUT_CHANGED]: 'Rollout changed',
  [AuditAction.RULES_CHANGED]: 'Targeting changed',
  [AuditAction.MEMBER_INVITED]: 'Member added',
  [AuditAction.MEMBER_ROLE_CHANGED]: 'Role changed',
  [AuditAction.MEMBER_REMOVED]: 'Member removed',
  [AuditAction.KEY_CREATED]: 'SDK key created',
  [AuditAction.KEY_REVOKED]: 'SDK key revoked',
}

export function AuditFilters({
  actors,
  environments,
}: {
  actors: Array<{ id: string; name: string }>
  environments: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams)

    if (value === ANY) params.delete(key)
    else params.set(key, value)

    // Any filter change invalidates the page cursor — keeping it would skip
    // into the middle of a result set the user has not seen the start of.
    params.delete('cursor')

    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false })
  }

  const active = ['action', 'env', 'actor'].filter((key) => searchParams.has(key))

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-action">Action</Label>
        <Select
          value={searchParams.get('action') ?? ANY}
          onValueChange={(value) => setParam('action', value)}
        >
          <SelectTrigger id="filter-action" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any action</SelectItem>
            {Object.values(AuditAction).map((action) => (
              <SelectItem key={action} value={action}>
                {ACTION_LABELS[action]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-env">Environment</Label>
        <Select
          value={searchParams.get('env') ?? ANY}
          onValueChange={(value) => setParam('env', value)}
        >
          <SelectTrigger id="filter-env" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any environment</SelectItem>
            {environments.map((environment) => (
              <SelectItem key={environment} value={environment}>
                {environment}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-actor">Person</Label>
        <Select
          value={searchParams.get('actor') ?? ANY}
          onValueChange={(value) => setParam('actor', value)}
        >
          <SelectTrigger id="filter-actor" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Anyone</SelectItem>
            {actors.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {active.length > 0 ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={pathname} scroll={false}>
            <X aria-hidden="true" /> Clear {active.length}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
