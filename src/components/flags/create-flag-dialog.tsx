'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FlagKeySchema } from '@/lib/flags/schema'
import { createFlag } from '@/server/flags/actions'

const FormSchema = z.object({
  name: z.string().min(2, 'Give the flag a name').max(120),
  key: FlagKeySchema,
  description: z.string().max(500),
  type: z.enum(['BOOLEAN', 'STRING', 'NUMBER', 'JSON']),
})

type FormValues = z.infer<typeof FormSchema>

/** Mirrors the server's key rules so the suggestion is always valid. */
function suggestKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function CreateFlagDialog({
  orgSlug,
  projectKey,
}: {
  orgSlug: string
  projectKey: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: '', key: '', description: '', type: 'BOOLEAN' },
  })

  /**
   * Stop suggesting a key once the user edits that field themselves.
   *
   * react-hook-form already tracks this: a programmatic `setValue` does not
   * mark a field dirty, only user input does. Reusing it avoids a ref, which
   * React Compiler rightly rejects being read during render.
   */
  const keyEditedByUser = Boolean(form.formState.dirtyFields.key)

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await createFlag({ ...values, orgSlug, projectKey, tags: [] })

    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (field in values && messages?.[0]) {
            form.setError(field as keyof FormValues, { message: messages[0] })
          }
        }
        return
      }
      toast.error(result.error ?? 'Could not create the flag.')
      return
    }

    toast.success(`${values.name} created.`)
    setOpen(false)
    form.reset()
    router.push(`/${orgSlug}/${projectKey}/flags/${result.flagKey}`)
  })

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) form.reset()
  }

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" /> New flag
        </Button>
      </DialogTrigger>

      <DialogContent aria-describedby="create-flag-description">
        <DialogHeader>
          <DialogTitle>Create a flag</DialogTitle>
          <DialogDescription id="create-flag-description">
            It starts off in every environment, so creating it is always safe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-name">Name</Label>
              <Input
                id="flag-name"
                autoFocus
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'flag-name-error' : undefined}
                {...form.register('name', {
                  onChange: (event) => {
                    if (keyEditedByUser) return
                    form.setValue('key', suggestKey(event.target.value), {
                      shouldValidate: form.formState.isSubmitted,
                    })
                  },
                })}
              />
              {errors.name ? (
                <p id="flag-name-error" className="text-xs text-danger">
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-key">Key</Label>
              <Input
                id="flag-key"
                className="font-mono text-xs"
                aria-invalid={Boolean(errors.key)}
                aria-describedby={errors.key ? 'flag-key-error' : 'flag-key-hint'}
                {...form.register('key')}
              />
              {errors.key ? (
                <p id="flag-key-error" className="text-xs text-danger">
                  {errors.key.message}
                </p>
              ) : (
                <p id="flag-key-hint" className="text-xs text-fg-subtle">
                  How your code refers to this flag. It cannot be changed later.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-type">Type</Label>
              {/*
                Radix Select is not a native input, so it binds through
                Controller rather than register(). This also keeps `watch()`
                out of render, which React Compiler cannot memoize safely.
              */}
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="flag-type" onBlur={field.onBlur} ref={field.ref}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BOOLEAN">Boolean — on / off</SelectItem>
                      <SelectItem value="STRING">String — multiple variants</SelectItem>
                      <SelectItem value="NUMBER">Number</SelectItem>
                      <SelectItem value="JSON">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="flag-description">Description</Label>
              <Textarea id="flag-description" rows={3} {...form.register('description')} />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={form.formState.isSubmitting}>
              Create flag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
