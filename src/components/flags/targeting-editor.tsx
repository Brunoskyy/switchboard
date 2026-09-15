'use client'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { ConditionRow } from '@/components/flags/condition-row'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  targetingReducer,
  totalWeight,
  withConditionIds,
  type TargetingState,
} from '@/lib/flags/targeting-reducer'
import { updateTargeting } from '@/server/flags/actions'
import { toggleFlag } from '@/server/flags/actions'

export interface VariantOption {
  key: string
  name: string
  value: unknown
}

interface TargetingEditorProps {
  orgSlug: string
  projectKey: string
  environmentKey: string
  environmentName: string
  flagKey: string
  flagName: string
  variants: VariantOption[]
  initial: TargetingState
  editable: boolean
}

export function TargetingEditor({
  orgSlug,
  projectKey,
  environmentKey,
  environmentName,
  flagKey,
  flagName,
  variants,
  initial,
  editable,
}: TargetingEditorProps) {
  const router = useRouter()

  // Saved configs can predate condition ids; rows are keyed by them, so they
  // are filled in before anything renders.
  const baseline = React.useMemo(() => withConditionIds(initial), [initial])

  const [state, dispatch] = React.useReducer(targetingReducer, baseline)
  const [saving, startSaving] = React.useTransition()

  // Cheap structural comparison. The editor holds at most a few dozen rules,
  // so this is far simpler than threading a dirty flag through every action.
  const dirty = React.useMemo(
    () => JSON.stringify(stripEnabled(state)) !== JSON.stringify(stripEnabled(baseline)),
    [state, baseline],
  )

  const weight = totalWeight(state.rollout)
  const weightsBalanced = state.rollout === null || weight === 100

  const save = () => {
    if (!weightsBalanced) {
      toast.error(`Rollout weights add up to ${weight}%. They must total 100%.`)
      return
    }

    startSaving(async () => {
      const result = await updateTargeting({
        orgSlug,
        projectKey,
        environmentKey,
        flagKey,
        rules: state.rules,
        rollout: state.rollout,
        defaultVariantKey: state.defaultVariantKey,
        offVariantKey: state.offVariantKey,
      })

      if (!result.ok) {
        toast.error(result.error ?? firstFieldError(result.fieldErrors) ?? 'Could not save.')
        return
      }

      // revalidatePath marks the server cache stale, but this component keeps
      // rendering against the `initial` prop it already has. Without the
      // refresh the footer still claims unsaved changes after a successful
      // save, and Discard would roll back to the pre-save config.
      router.refresh()
      toast.success(`Targeting saved for ${environmentName}.`)
    })
  }

  const onToggleEnabled = (enabled: boolean) => {
    dispatch({ type: 'setEnabled', enabled })

    startSaving(async () => {
      const result = await toggleFlag({
        orgSlug,
        projectKey,
        environmentKey,
        flagKey,
        enabled,
      })

      if (!result.ok) {
        dispatch({ type: 'setEnabled', enabled: !enabled })
        toast.error(result.error ?? 'Could not update the flag.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-fg">
              {state.enabled ? 'On' : 'Off'} in {environmentName}
            </p>
            <p className="pt-0.5 text-sm text-fg-muted">
              {state.enabled
                ? 'Rules and rollout below decide what each context is served.'
                : `Everyone is served "${state.offVariantKey}" while this is off.`}
            </p>
          </div>
          <Switch
            checked={state.enabled}
            onCheckedChange={onToggleEnabled}
            disabled={!editable}
            aria-label={`${flagName} in ${environmentName}`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Targeting rules</CardTitle>
            <p className="pt-1 text-sm text-fg-muted">
              Evaluated top to bottom. The first rule that matches wins.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              dispatch({ type: 'addRule', variantKey: variants[0]?.key ?? '' })
            }
            disabled={!editable}
          >
            <Plus /> Add rule
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {state.rules.length === 0 ? (
            <p className="rounded-[var(--radius-control)] border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
              No rules. Every context falls through to the default below.
            </p>
          ) : (
            state.rules.map((rule, ruleIndex) => (
              <div
                key={rule.id}
                className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-surface-raised p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">Rule {ruleIndex + 1}</Badge>

                  <Input
                    value={rule.description ?? ''}
                    onChange={(event) =>
                      dispatch({
                        type: 'setRuleDescription',
                        index: ruleIndex,
                        description: event.target.value,
                      })
                    }
                    placeholder="What is this rule for?"
                    aria-label={`Description for rule ${ruleIndex + 1}`}
                    disabled={!editable}
                    className="h-8 min-w-0 flex-1"
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatch({ type: 'moveRule', index: ruleIndex, direction: -1 })}
                    disabled={!editable || ruleIndex === 0}
                    aria-label={`Move rule ${ruleIndex + 1} up`}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatch({ type: 'moveRule', index: ruleIndex, direction: 1 })}
                    disabled={!editable || ruleIndex === state.rules.length - 1}
                    aria-label={`Move rule ${ruleIndex + 1} down`}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatch({ type: 'removeRule', index: ruleIndex })}
                    disabled={!editable}
                    aria-label={`Delete rule ${ruleIndex + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="flex flex-col gap-2">
                  {rule.conditions.map((condition, conditionIndex) => (
                    <ConditionRow
                      key={condition.id ?? `${rule.id}-${conditionIndex}`}
                      condition={condition}
                      index={conditionIndex}
                      ruleId={rule.id}
                      disabled={!editable}
                      canRemove={rule.conditions.length > 1}
                      onChange={(patch) =>
                        dispatch({
                          type: 'updateCondition',
                          ruleIndex,
                          conditionIndex,
                          patch,
                        })
                      }
                      onRemove={() =>
                        dispatch({ type: 'removeCondition', ruleIndex, conditionIndex })
                      }
                    />
                  ))}

                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => dispatch({ type: 'addCondition', ruleIndex })}
                      disabled={!editable}
                    >
                      <Plus /> Add condition
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <Label htmlFor={`${rule.id}-serve`} className="text-sm text-fg-muted">
                    Then serve
                  </Label>
                  <Select
                    value={'variantKey' in rule.serve ? rule.serve.variantKey : ''}
                    onValueChange={(value) =>
                      dispatch({ type: 'setRuleVariant', index: ruleIndex, variantKey: value })
                    }
                    disabled={!editable}
                  >
                    <SelectTrigger id={`${rule.id}-serve`} className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((variant) => (
                        <SelectItem key={variant.key} value={variant.key}>
                          {variant.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default</CardTitle>
          <p className="pt-1 text-sm text-fg-muted">
            What a context gets when no rule matches.
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-fg">Percentage rollout</p>
              <p className="text-sm text-fg-muted">
                Split the fallthrough across variants instead of serving one.
              </p>
            </div>
            <Switch
              checked={state.rollout !== null}
              onCheckedChange={(checked) =>
                dispatch(
                  checked
                    ? { type: 'enableRollout', variantKeys: variants.map((v) => v.key) }
                    : { type: 'disableRollout' },
                )
              }
              disabled={!editable}
              aria-label="Use a percentage rollout"
            />
          </div>

          {state.rollout ? (
            <div className="flex flex-col gap-3">
              {state.rollout.buckets.map((bucket) => (
                <div key={bucket.variantKey} className="flex items-center gap-3">
                  <Label
                    htmlFor={`bucket-${bucket.variantKey}`}
                    className="w-40 shrink-0 truncate text-sm"
                  >
                    {variants.find((v) => v.key === bucket.variantKey)?.name ??
                      bucket.variantKey}
                  </Label>
                  <input
                    id={`bucket-${bucket.variantKey}`}
                    type="range"
                    min={0}
                    max={100}
                    value={bucket.weight}
                    onChange={(event) =>
                      dispatch({
                        type: 'setBucketWeight',
                        variantKey: bucket.variantKey,
                        weight: Number(event.target.value),
                      })
                    }
                    disabled={!editable}
                    className="min-w-0 flex-1 accent-[var(--color-accent)]"
                  />
                  <span className="w-12 text-right font-mono text-sm tabular-nums text-fg">
                    {bucket.weight}%
                  </span>
                </div>
              ))}

              <p
                className={
                  weightsBalanced
                    ? 'text-xs text-fg-subtle'
                    : 'text-xs font-medium text-danger'
                }
                // Announce the running total as it crosses in and out of valid.
                role="status"
              >
                Total: {weight}%{weightsBalanced ? '' : ' — must be exactly 100%'}
              </p>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bucket-by">Bucket by</Label>
                <Input
                  id="bucket-by"
                  value={state.rollout.bucketBy ?? ''}
                  onChange={(event) =>
                    dispatch({ type: 'setRolloutBucketBy', bucketBy: event.target.value })
                  }
                  placeholder="context key (default)"
                  disabled={!editable}
                  className="font-mono text-xs"
                  aria-describedby="bucket-by-hint"
                />
                <p id="bucket-by-hint" className="text-xs text-fg-subtle">
                  Set to an attribute like <code className="font-mono">accountId</code> to keep a
                  whole account on the same side of the split.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="default-variant">Serve</Label>
              <Select
                value={state.defaultVariantKey}
                onValueChange={(value) =>
                  dispatch({ type: 'setDefaultVariant', variantKey: value })
                }
                disabled={!editable}
              >
                <SelectTrigger id="default-variant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((variant) => (
                    <SelectItem key={variant.key} value={variant.key}>
                      {variant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="off-variant">Serve when the flag is off</Label>
            <Select
              value={state.offVariantKey}
              onValueChange={(value) => dispatch({ type: 'setOffVariant', variantKey: value })}
              disabled={!editable}
            >
              <SelectTrigger id="off-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map((variant) => (
                  <SelectItem key={variant.key} value={variant.key}>
                    {variant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {editable ? (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-[var(--radius-card)] border border-border bg-surface/95 p-3 shadow-[var(--shadow-popover)] backdrop-blur">
          <p aria-live="polite" className="mr-auto text-sm text-fg-muted">
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => dispatch({ type: 'reset', state: baseline })}
            disabled={!dirty || saving}
          >
            Discard
          </Button>
          <Button type="button" onClick={save} loading={saving} disabled={!dirty}>
            Save targeting
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** `enabled` saves through its own action, so it never counts as unsaved work. */
function stripEnabled(state: TargetingState) {
  const { enabled: _enabled, ...rest } = state
  return rest
}

function firstFieldError(fieldErrors?: Record<string, string[]>): string | undefined {
  if (!fieldErrors) return undefined
  for (const messages of Object.values(fieldErrors)) {
    if (messages?.[0]) return messages[0]
  }
  return undefined
}
