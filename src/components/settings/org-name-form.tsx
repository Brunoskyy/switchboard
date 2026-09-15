'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { renameOrganization } from '@/server/settings/actions'

export function OrgNameForm({
  orgSlug,
  initialName,
  editable,
}: {
  orgSlug: string
  initialName: string
  editable: boolean
}) {
  const router = useRouter()
  const [name, setName] = React.useState(initialName)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const dirty = name.trim() !== initialName

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await renameOrganization({ orgSlug, name: name.trim() })

      if (!result.ok) {
        setError(result.error ?? result.fieldErrors?.name?.[0] ?? 'Could not rename.')
        return
      }

      toast.success('Organization renamed.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
        <CardDescription>The display name. Everyone in the org sees it.</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!editable || pending}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'org-name-error' : undefined}
              className="max-w-sm"
            />
            {error ? (
              <p id="org-name-error" className="text-xs text-danger">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-slug">URL</Label>
            <Input
              id="org-slug"
              value={`/${orgSlug}`}
              readOnly
              disabled
              className="max-w-sm font-mono text-xs"
              aria-describedby="org-slug-hint"
            />
            <p id="org-slug-hint" className="text-xs text-fg-subtle">
              Fixed. It is in every bookmarked link and in SDK configuration, so renaming the
              organization deliberately leaves it alone.
            </p>
          </div>

          {editable ? (
            <div>
              <Button type="submit" loading={pending} disabled={!dirty}>
                Save
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}
