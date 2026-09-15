'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toggleFlag } from '@/server/flags/actions'

interface FlagToggleProps {
  orgSlug: string
  projectKey: string
  environmentKey: string
  environmentName: string
  flagKey: string
  flagName: string
  enabled: boolean
  editable: boolean
}

/**
 * Optimistic toggle.
 *
 * `useOptimistic` holds the pending value only for the life of the transition.
 * When the server action resolves and the route revalidates, the `enabled`
 * prop becomes the source of truth again — so a rejected write (no permission,
 * archived flag, lost connection) snaps back on its own and we only have to
 * surface the reason.
 */
export function FlagToggle({
  orgSlug,
  projectKey,
  environmentKey,
  environmentName,
  flagKey,
  flagName,
  enabled,
  editable,
}: FlagToggleProps) {
  const [optimisticEnabled, setOptimisticEnabled] = React.useOptimistic(enabled)
  const [, startTransition] = React.useTransition()

  const onCheckedChange = (next: boolean) => {
    startTransition(async () => {
      setOptimisticEnabled(next)

      const result = await toggleFlag({
        orgSlug,
        projectKey,
        environmentKey,
        flagKey,
        enabled: next,
      })

      if (!result.ok) {
        toast.error(result.error ?? 'Could not update the flag.')
        return
      }

      toast.success(
        `${flagName} is ${next ? 'on' : 'off'} in ${environmentName}.`,
      )
    })
  }

  const control = (
    <Switch
      checked={optimisticEnabled}
      onCheckedChange={onCheckedChange}
      disabled={!editable}
      aria-label={`${flagName} in ${environmentName}`}
    />
  )

  if (editable) return control

  return (
    <Tooltip>
      {/* A disabled control receives no pointer events, so the tooltip needs a
          wrapper to hang off — otherwise viewers get no explanation at all. */}
      <TooltipTrigger asChild>
        <span className="inline-flex">{control}</span>
      </TooltipTrigger>
      <TooltipContent>Your role can view flags but not change them.</TooltipContent>
    </Tooltip>
  )
}
