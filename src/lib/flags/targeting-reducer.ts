import type { Condition, Rollout, Rule } from './types'

/**
 * State and transitions for the targeting editor.
 *
 * Kept as a pure reducer in its own module so the editing rules — ordering,
 * weight redistribution, what happens when a variant disappears — can be
 * tested without rendering anything. The component below it only maps events
 * to actions.
 */
export interface TargetingState {
  enabled: boolean
  rules: Rule[]
  rollout: Rollout | null
  defaultVariantKey: string
  offVariantKey: string
}

export type TargetingAction =
  | { type: 'setEnabled'; enabled: boolean }
  | { type: 'addRule'; variantKey: string }
  | { type: 'removeRule'; index: number }
  | { type: 'moveRule'; index: number; direction: -1 | 1 }
  | { type: 'setRuleDescription'; index: number; description: string }
  | { type: 'setRuleVariant'; index: number; variantKey: string }
  | { type: 'addCondition'; ruleIndex: number }
  | { type: 'removeCondition'; ruleIndex: number; conditionIndex: number }
  | {
      type: 'updateCondition'
      ruleIndex: number
      conditionIndex: number
      patch: Partial<Condition>
    }
  | { type: 'setDefaultVariant'; variantKey: string }
  | { type: 'setOffVariant'; variantKey: string }
  | { type: 'enableRollout'; variantKeys: string[] }
  | { type: 'disableRollout' }
  | { type: 'setBucketWeight'; variantKey: string; weight: number }
  | { type: 'setRolloutBucketBy'; bucketBy: string }
  | { type: 'reset'; state: TargetingState }

/** Ids only need to be unique within one config; they are not database keys. */
function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

const emptyCondition = (): Condition => ({
  id: newId('cond'),
  attribute: '',
  operator: 'eq',
  values: [],
})

function newRuleId(): string {
  return newId('rule')
}

/**
 * Gives every condition an id.
 *
 * Saved configs can predate the id field, and the editor keys rows by it — a
 * row keyed by position gets recycled when its neighbour is deleted, which
 * leaves the previous condition's text sitting in the new row's inputs.
 */
export function withConditionIds(state: TargetingState): TargetingState {
  let changed = false

  const rules = state.rules.map((rule) => {
    if (rule.conditions.every((condition) => condition.id)) return rule

    changed = true
    return {
      ...rule,
      conditions: rule.conditions.map((condition) =>
        condition.id ? condition : { ...condition, id: newId('cond') },
      ),
    }
  })

  return changed ? { ...state, rules } : state
}

function replaceAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, i) => (i === index ? next : item))
}

function updateRuleAt(state: TargetingState, index: number, update: (rule: Rule) => Rule) {
  const rule = state.rules[index]
  if (!rule) return state
  return { ...state, rules: replaceAt(state.rules, index, update(rule)) }
}

/**
 * Spreads 100% across the given variants, giving any remainder to the first
 * bucket so the weights always sum to exactly 100 — the invariant both the
 * evaluator and the write-side schema require.
 */
export function evenBuckets(variantKeys: string[]): Rollout['buckets'] {
  if (variantKeys.length === 0) return []

  const base = Math.floor(100 / variantKeys.length)
  const remainder = 100 - base * variantKeys.length

  return variantKeys.map((variantKey, i) => ({
    variantKey,
    weight: i === 0 ? base + remainder : base,
  }))
}

export function totalWeight(rollout: Rollout | null): number {
  return rollout?.buckets.reduce((sum, bucket) => sum + bucket.weight, 0) ?? 0
}

export function targetingReducer(
  state: TargetingState,
  action: TargetingAction,
): TargetingState {
  switch (action.type) {
    case 'setEnabled':
      return { ...state, enabled: action.enabled }

    case 'addRule':
      return {
        ...state,
        rules: [
          ...state.rules,
          {
            id: newRuleId(),
            description: '',
            conditions: [emptyCondition()],
            serve: { variantKey: action.variantKey },
          },
        ],
      }

    case 'removeRule':
      return { ...state, rules: state.rules.filter((_, i) => i !== action.index) }

    case 'moveRule': {
      const target = action.index + action.direction
      // Rules are evaluated top to bottom, so order is behaviour, not cosmetics.
      if (target < 0 || target >= state.rules.length) return state

      const rules = [...state.rules]
      ;[rules[action.index], rules[target]] = [rules[target], rules[action.index]]
      return { ...state, rules }
    }

    case 'setRuleDescription':
      return updateRuleAt(state, action.index, (rule) => ({
        ...rule,
        description: action.description,
      }))

    case 'setRuleVariant':
      return updateRuleAt(state, action.index, (rule) => ({
        ...rule,
        serve: { variantKey: action.variantKey },
      }))

    case 'addCondition':
      return updateRuleAt(state, action.ruleIndex, (rule) => ({
        ...rule,
        conditions: [...rule.conditions, emptyCondition()],
      }))

    case 'removeCondition':
      return updateRuleAt(state, action.ruleIndex, (rule) => ({
        ...rule,
        conditions: rule.conditions.filter((_, i) => i !== action.conditionIndex),
      }))

    case 'updateCondition':
      return updateRuleAt(state, action.ruleIndex, (rule) => {
        const condition = rule.conditions[action.conditionIndex]
        if (!condition) return rule

        return {
          ...rule,
          conditions: replaceAt(rule.conditions, action.conditionIndex, {
            ...condition,
            ...action.patch,
          }),
        }
      })

    case 'setDefaultVariant':
      return { ...state, defaultVariantKey: action.variantKey }

    case 'setOffVariant':
      return { ...state, offVariantKey: action.variantKey }

    case 'enableRollout':
      return {
        ...state,
        rollout: {
          seed: `${Date.now().toString(36)}`,
          buckets: evenBuckets(action.variantKeys),
        },
      }

    case 'disableRollout':
      return { ...state, rollout: null }

    case 'setBucketWeight': {
      if (!state.rollout) return state

      const weight = Math.max(0, Math.min(100, Math.round(action.weight)))

      return {
        ...state,
        rollout: {
          ...state.rollout,
          buckets: state.rollout.buckets.map((bucket) =>
            bucket.variantKey === action.variantKey ? { ...bucket, weight } : bucket,
          ),
        },
      }
    }

    case 'setRolloutBucketBy': {
      if (!state.rollout) return state
      const bucketBy = action.bucketBy.trim()

      return {
        ...state,
        rollout: bucketBy
          ? { ...state.rollout, bucketBy }
          : // Dropping the key means "bucket by the context key" — represented
            // by the field being absent, not empty.
            (({ bucketBy: _dropped, ...rest }) => rest)(state.rollout),
      }
    }

    case 'reset':
      return action.state

    default:
      return state
  }
}
