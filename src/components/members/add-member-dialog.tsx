'use client'

import { UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Role } from '@/generated/prisma/enums'
import { ROLE_DESCRIPTIONS, assignableRoles } from '@/lib/members/rules'
import { addMember } from '@/server/members/actions'

export function AddMemberDialog({
  orgSlug,
  actorRole,
}: {
  orgSlug: string
  actorRole: Role
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<Role>(Role.MEMBER)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const options = assignableRoles(actorRole)

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await addMember({ orgSlug, email, role })

      if (!result.ok) {
        setError(result.error ?? result.fieldErrors?.email?.[0] ?? 'Could not add the member.')
        return
      }

      toast.success(`${email} was added as ${role.toLowerCase()}.`)
      setOpen(false)
      setEmail('')
      setRole(Role.MEMBER)
      router.refresh()
    })
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setEmail('')
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" /> Add member
        </Button>
      </DialogTrigger>

      <DialogContent aria-describedby="add-member-description">
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription id="add-member-description">
            They need a Switchboard account already — emailed invitations are not built yet.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <DialogBody className="flex flex-col gap-4">
            {error ? (
              <p
                role="alert"
                className="rounded-[var(--radius-control)] border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="member-role">Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option} value={option}>
                      <span className="capitalize">{option.toLowerCase()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-fg-subtle">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
