'use client'

import { Plus } from 'lucide-react'
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
import { createProject } from '@/server/settings/actions'

function suggestKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function CreateProjectDialog({ orgSlug }: { orgSlug: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [key, setKey] = React.useState('')
  const [keyEdited, setKeyEdited] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const onNameChange = (value: string) => {
    setName(value)
    if (!keyEdited) setKey(suggestKey(value))
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await createProject({ orgSlug, name, key })

      if (!result.ok) {
        setError(
          result.error ??
            result.fieldErrors?.key?.[0] ??
            result.fieldErrors?.name?.[0] ??
            'Could not create the project.',
        )
        return
      }

      toast.success(`${name} created with three environments.`)
      onOpenChange(false)
      router.push(`/${orgSlug}/${result.projectKey}`)
    })
  }

  const reset = () => {
    setName('')
    setKey('')
    setKeyEdited(false)
    setError(null)
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) reset()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus aria-hidden="true" /> New project
        </Button>
      </DialogTrigger>

      <DialogContent aria-describedby="create-project-description">
        <DialogHeader>
          <DialogTitle>Create a project</DialogTitle>
          <DialogDescription id="create-project-description">
            Development, Staging and Production are created with it.
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
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                autoFocus
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Mobile App"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-key">Key</Label>
              <Input
                id="project-key"
                value={key}
                onChange={(event) => {
                  setKeyEdited(true)
                  setKey(event.target.value)
                }}
                className="font-mono text-xs"
                aria-describedby="project-key-hint"
                required
              />
              <p id="project-key-hint" className="text-xs text-fg-subtle">
                Appears in the URL. Lowercase letters, numbers and hyphens.
              </p>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
