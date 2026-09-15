'use client'

import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OPERATORS, OPERATOR_LABELS, PRESENCE_OPERATORS } from '@/lib/flags/schema'
import type { AttributeValue, Condition, Operator } from '@/lib/flags/types'

/** `exists` / `not_exists` take no values, so the input is hidden for them. */
function takesValues(operator: Operator): boolean {
  return !(PRESENCE_OPERATORS as readonly string[]).includes(operator)
}

/**
 * Values are edited as a comma-separated list. Numbers are kept as numbers so
 * `gt`/`lt` compare numerically instead of lexicographically ("9" > "10").
 */
function parseValues(raw: string): AttributeValue[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      if (part === 'true') return true
      if (part === 'false') return false
      const asNumber = Number(part)
      return part !== '' && !Number.isNaN(asNumber) ? asNumber : part
    })
}

function formatValues(values: AttributeValue[]): string {
  return values.join(', ')
}

interface ConditionRowProps {
  condition: Condition
  index: number
  ruleId: string
  disabled: boolean
  canRemove: boolean
  onChange: (patch: Partial<Condition>) => void
  onRemove: () => void
}

export function ConditionRow({
  condition,
  index,
  ruleId,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: ConditionRowProps) {
  const attributeId = `${ruleId}-cond-${index}-attribute`
  const operatorId = `${ruleId}-cond-${index}-operator`
  const valuesId = `${ruleId}-cond-${index}-values`

  return (
    <div className="flex flex-wrap items-end gap-2">
      <span className="pb-2 text-xs font-medium uppercase text-fg-subtle">
        {index === 0 ? 'If' : 'And'}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={attributeId} className="sr-only">
          Attribute for condition {index + 1}
        </label>
        <Input
          id={attributeId}
          value={condition.attribute}
          onChange={(event) => onChange({ attribute: event.target.value })}
          placeholder="email, plan, country…"
          disabled={disabled}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex w-44 flex-col gap-1">
        <label htmlFor={operatorId} className="sr-only">
          Operator for condition {index + 1}
        </label>
        <Select
          value={condition.operator}
          onValueChange={(value) => onChange({ operator: value as Operator })}
          disabled={disabled}
        >
          <SelectTrigger id={operatorId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {OPERATOR_LABELS[operator]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {takesValues(condition.operator) ? (
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={valuesId} className="sr-only">
            Values for condition {index + 1}
          </label>
          <Input
            id={valuesId}
            defaultValue={formatValues(condition.values)}
            onChange={(event) => onChange({ values: parseValues(event.target.value) })}
            placeholder="comma, separated, values"
            disabled={disabled}
            className="font-mono text-xs"
          />
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled || !canRemove}
        aria-label={`Remove condition ${index + 1}`}
      >
        <Trash2 />
      </Button>
    </div>
  )
}
