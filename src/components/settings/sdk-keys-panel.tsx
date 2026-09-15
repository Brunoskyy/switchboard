'use client'

import { Copy, KeyRound, Plus, ShieldOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { formatRelative } from '@/lib/format'
import { createSdkKey, revokeSdkKey } from '@/server/settings/actions'

export interface SdkKeyRow {
  id: string
  name: string
  prefix: string
  environmentKey: string
  environmentName: string
  createdAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

interface SdkKeysPanelProps {
  orgSlug: string
  projectKey: string
  projectName: string
  environments: Array<{ key: string; name: string }>
  keys: SdkKeyRow[]
  editable: boolean
}

export function SdkKeysPanel({
  orgSlug,
  projectKey,
  projectName,
  environments,
  keys,
  editable,
}: SdkKeysPanelProps) {
  const router = useRouter()
  const [creating, setCreating] = React.useState(false)
  const [name, setName] = React.useState('')
  const [environmentKey, setEnvironmentKey] = React.useState(environments[0]?.key ?? '')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /** Held only until the dialog closes; the server never stores it. */
  const [revealed, setRevealed] = React.useState<string | null>(null)

  const onCreate = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await createSdkKey({ orgSlug, projectKey, environmentKey, name })

      if (!result.ok || !result.plaintext) {
        setError(result.error ?? result.fieldErrors?.name?.[0] ?? 'Could not create the key.')
        return
      }

      setRevealed(result.plaintext)
      setCreating(false)
      setName('')
      router.refresh()
    })
  }

  const onRevoke = (key: SdkKeyRow) => {
    startTransition(async () => {
      const result = await revokeSdkKey({ orgSlug, keyId: key.id })

      if (!result.ok) {
        toast.error(result.error ?? 'Could not revoke the key.')
        return
      }

      toast.success(`${key.name} revoked.`)
      router.refresh()
    })
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied to clipboard.')
    } catch {
      // Clipboard access needs a secure context and can be blocked outright.
      toast.error('Could not copy. Select the key and copy it manually.')
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>SDK keys · {projectName}</CardTitle>
            <CardDescription>
              One key per environment. Shown once at creation and stored only as a hash.
            </CardDescription>
          </div>
          {editable ? (
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> New key
            </Button>
          ) : null}
        </CardHeader>

        <CardContent>
          {keys.length === 0 ? (
            <p className="rounded-[var(--radius-control)] border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
              No keys yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <KeyRound className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      {key.name}
                      <Badge>{key.environmentName}</Badge>
                      {key.revokedAt ? <Badge tone="danger">Revoked</Badge> : null}
                    </p>
                    <p className="font-mono text-xs text-fg-subtle">{key.prefix}…</p>
                  </div>

                  <p className="text-xs text-fg-subtle">
                    {key.revokedAt
                      ? `Revoked ${formatRelative(key.revokedAt)}`
                      : key.lastUsedAt
                        ? `Last used ${formatRelative(key.lastUsedAt)}`
                        : 'Never used'}
                  </p>

                  {editable && !key.revokedAt ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRevoke(key)}
                      disabled={pending}
                      aria-label={`Revoke ${key.name}`}
                    >
                      <ShieldOff />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent aria-describedby="new-key-description">
          <DialogHeader>
            <DialogTitle>New SDK key</DialogTitle>
            <DialogDescription id="new-key-description">
              Name it after where it will be used, so you know what you are revoking later.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onCreate}>
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
                <Label htmlFor="key-name">Name</Label>
                <Input
                  id="key-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="web frontend, mobile app…"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="key-environment">Environment</Label>
                <Select value={environmentKey} onValueChange={setEnvironmentKey}>
                  <SelectTrigger id="key-environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((environment) => (
                      <SelectItem key={environment.key} value={environment.key}>
                        {environment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={revealed !== null} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent aria-describedby="revealed-key-description">
          <DialogHeader>
            <DialogTitle>Copy your key now</DialogTitle>
            <DialogDescription id="revealed-key-description">
              This is the only time it is shown. Only a hash is stored, so a lost key has to be
              revoked and replaced rather than recovered.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-raised px-3 py-2 font-mono text-xs text-fg">
                {revealed}
              </code>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => revealed && copy(revealed)}
                aria-label="Copy key to clipboard"
              >
                <Copy />
              </Button>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
