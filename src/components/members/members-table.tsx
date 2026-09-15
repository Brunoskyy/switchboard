'use client'

import { UserMinus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Role } from '@/generated/prisma/enums'
import { formatRelative } from '@/lib/format'
import { ROLE_DESCRIPTIONS, assignableRoles, checkRemoval, checkRoleChange } from '@/lib/members/rules'
import { changeMemberRole, removeMember } from '@/server/members/actions'

export interface MemberRow {
  id: string
  role: Role
  joinedAt: string
  isSelf: boolean
  name: string
  email: string
  color: string
}

interface MembersTableProps {
  rows: MemberRow[]
  orgSlug: string
  actorRole: Role
  ownerCount: number
}

export function MembersTable({ rows, orgSlug, actorRole, ownerCount }: MembersTableProps) {
  const options = assignableRoles(actorRole)

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <MemberRowItem
            key={row.id}
            row={row}
            orgSlug={orgSlug}
            actorRole={actorRole}
            ownerCount={ownerCount}
            options={options}
          />
        ))}
      </ul>
    </div>
  )
}

function MemberRowItem({
  row,
  orgSlug,
  actorRole,
  ownerCount,
  options,
}: {
  row: MemberRow
  orgSlug: string
  actorRole: Role
  ownerCount: number
  options: Role[]
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [optimisticRole, setOptimisticRole] = React.useOptimistic(row.role)

  const context = {
    actorRole,
    isSelf: row.isSelf,
    targetRole: row.role,
    ownerCount,
  }

  // The same rules the server enforces, run here purely to explain a disabled
  // control. The server check is the one that decides; this one just means the
  // user is told why before they click rather than after.
  const removalDenial = checkRemoval(context)

  const initials = row.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  const onRoleChange = (next: string) => {
    const role = next as Role
    const denial = checkRoleChange(context, role)

    if (denial) {
      toast.error(denial)
      return
    }

    startTransition(async () => {
      setOptimisticRole(role)

      const result = await changeMemberRole({
        orgSlug,
        membershipId: row.id,
        role,
      })

      if (!result.ok) {
        toast.error(result.error ?? 'Could not change the role.')
        return
      }

      toast.success(`${row.name} is now ${role.toLowerCase()}.`)
      router.refresh()
    })
  }

  const onRemove = () => {
    startTransition(async () => {
      const result = await removeMember({ orgSlug, membershipId: row.id })

      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove the member.')
        return
      }

      toast.success(row.isSelf ? 'You left the organization.' : `${row.name} was removed.`)
      router.refresh()
    })
  }

  const canEditRole = options.length > 0 && !(actorRole !== Role.OWNER && row.role === Role.OWNER)

  return (
    <li className="flex flex-wrap items-center gap-4 p-4">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: row.color }}
        aria-hidden="true"
      >
        {initials}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium text-fg">
          {row.name}
          {row.isSelf ? <Badge>You</Badge> : null}
        </p>
        <p className="truncate text-sm text-fg-muted">{row.email}</p>
      </div>

      <p className="hidden text-xs text-fg-subtle sm:block">
        Joined {formatRelative(row.joinedAt)}
      </p>

      {canEditRole ? (
        <Select value={optimisticRole} onValueChange={onRoleChange} disabled={pending}>
          <SelectTrigger className="w-36" aria-label={`Role for ${row.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((role) => (
              <SelectItem key={role} value={role}>
                <span className="capitalize">{role.toLowerCase()}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Badge tone={row.role === Role.OWNER ? 'accent' : 'neutral'}>
                <span className="capitalize">{row.role.toLowerCase()}</span>
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>{ROLE_DESCRIPTIONS[row.role]}</TooltipContent>
        </Tooltip>
      )}

      {removalDenial ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button variant="ghost" size="icon" disabled aria-label={`Remove ${row.name}`}>
                <UserMinus />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{removalDenial}</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={pending}
          aria-label={row.isSelf ? 'Leave organization' : `Remove ${row.name}`}
        >
          <UserMinus />
        </Button>
      )}
    </li>
  )
}
