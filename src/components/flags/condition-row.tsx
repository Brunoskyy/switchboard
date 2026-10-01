'use client'

import { Trash2 } from 'lucide-react'
import * as React from 'react'

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
import type { Condition, Operator } from '@/lib/flags/types'
import { coerceValue, parseValueList } from '@/lib/flags/values'

/** `exists` / `not_exists` take no values, so the input is hidden for them. */
function takesValues(operator: Operator): boolean {
  return !(PRESENCE_OPERATORS as readonly string[]).includes(operator)
}

/**
 * Only set membership reads more than one value; every other operator uses
 * `values[0]`.
 *
 * This is why the list operators get their own input. Comma-splitting
 * everything corrupted any single value that legitimately contains a comma —
 * the regex `^(alpha|beta){1,3}$` became two values, neither of them a valid
 * pattern, and the condition then silently never matched.
 */
function takesList(operator: Operator): boolean {
  return operator === 'in' || operator === 'not_in'
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

  const isList = takesList(condition.operator)

  /*
    The list input keeps its own text while it has focus. Parsing on every
    keystroke and echoing the parsed array back would delete the separator the
    moment it is typed, so "us, ca" could never be reached. Rows are keyed by
    condition id, so this buffer never outlives the condition it belongs to.
  */
  const [listText, setListText] = React.useState(() => condition.values.join(', '))
  const [editingList, setEditingList] = React.useState(false)

  const listValue = editingList ? listText : condition.values.join(', ')
  const singleValue = condition.values[0] === undefined ? '' : String(condition.values[0])

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
            {isList ? `Values for condition ${index + 1}` : `Value for condition ${index + 1}`}
          </label>
          {isList ? (
            <Input
              id={valuesId}
              value={listValue}
              onFocus={() => {
                setListText(condition.values.join(', '))
                setEditingList(true)
              }}
              onBlur={() => setEditingList(false)}
              onChange={(event) => {
                setListText(event.target.value)
                onChange({ values: parseValueList(event.target.value) })
              }}
              placeholder="comma, separated"
              disabled={disabled}
              className="font-mono text-xs"
            />
          ) : (
            <Input
              id={valuesId}
              value={singleValue}
              onChange={(event) =>
                onChange({
                  values: event.target.value === '' ? [] : [coerceValue(event.target.value)],
                })
              }
              placeholder={condition.operator === 'matches' ? '^prefix-.*$' : 'value'}
              disabled={disabled}
              className="font-mono text-xs"
            />
          )}
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
