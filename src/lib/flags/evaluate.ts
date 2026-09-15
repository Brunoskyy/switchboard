import { bucketFor } from './hash'
import type {
  AttributeValue,
  Condition,
  EvaluationContext,
  EvaluationResult,
  Operator,
  Rollout,
  Rule,
} from './types'

export interface EvaluableFlag {
  key: string
  archived: boolean
  variants: ReadonlyArray<{ key: string; value: unknown }>
}

export interface EvaluableConfig {
  enabled: boolean
  defaultVariantKey: string | null
  offVariantKey: string | null
  rules: readonly Rule[]
  rollout: Rollout | null
}

/**
 * Longest regex we will compile for a `matches` condition.
 *
 * Patterns are authored by org admins in the dashboard, never by end users, so
 * the threat model is a careless teammate rather than an attacker. Still, a
 * catastrophically backtracking pattern would stall evaluation for everyone in
 * the environment, so we cap length and fail the condition closed. A hard
 * timeout would need a worker or the RegExp engine to support one; neither is
 * worth it at this length limit.
 */
const MAX_PATTERN_LENGTH = 512

function toComparable(value: unknown): AttributeValue | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return undefined
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return Number.NaN
}

function matchesScalar(actual: AttributeValue, condition: Condition): boolean {
  const { operator, values } = condition
  const first = values[0]

  switch (operator) {
    case 'eq':
      return actual === first
    case 'neq':
      return actual !== first
    case 'in':
      return values.includes(actual)
    case 'not_in':
      return !values.includes(actual)
    case 'contains':
      return typeof actual === 'string' && values.some((v) => actual.includes(String(v)))
    case 'not_contains':
      return typeof actual === 'string' && !values.some((v) => actual.includes(String(v)))
    case 'starts_with':
      return typeof actual === 'string' && values.some((v) => actual.startsWith(String(v)))
    case 'ends_with':
      return typeof actual === 'string' && values.some((v) => actual.endsWith(String(v)))
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = asNumber(actual)
      const b = asNumber(first)
      if (Number.isNaN(a) || Number.isNaN(b)) return false
      if (operator === 'gt') return a > b
      if (operator === 'gte') return a >= b
      if (operator === 'lt') return a < b
      return a <= b
    }
    case 'matches': {
      if (typeof actual !== 'string') return false
      const pattern = String(first ?? '')
      if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return false
      try {
        return new RegExp(pattern).test(actual)
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

const PRESENCE_OPERATORS: ReadonlySet<Operator> = new Set(['exists', 'not_exists'])

export function evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
  const raw =
    condition.attribute === 'key' ? context.key : context.attributes?.[condition.attribute]

  const present = raw !== undefined && raw !== null

  if (PRESENCE_OPERATORS.has(condition.operator)) {
    const result = condition.operator === 'exists' ? present : !present
    return condition.negate ? !result : result
  }

  if (!present) return condition.negate === true

  // An array attribute (roles, feature groups, ...) matches when ANY element
  // matches — except for the negative operators, where every element must, so
  // that `not_in` keeps meaning "none of these".
  let result: boolean
  if (Array.isArray(raw)) {
    const elements = raw.map(toComparable).filter((v): v is AttributeValue => v !== undefined)
    const isNegative =
      condition.operator === 'neq' ||
      condition.operator === 'not_in' ||
      condition.operator === 'not_contains'
    result = isNegative
      ? elements.every((el) => matchesScalar(el, condition))
      : elements.some((el) => matchesScalar(el, condition))
  } else {
    const actual = toComparable(raw)
    result = actual === undefined ? false : matchesScalar(actual, condition)
  }

  return condition.negate ? !result : result
}

/** All conditions must match. An empty condition list matches everything. */
export function evaluateRule(rule: Rule, context: EvaluationContext): boolean {
  return rule.conditions.every((condition) => evaluateCondition(condition, context))
}

/**
 * Picks a bucket for `context` and walks the weighted buckets in order.
 * Returns null when the weights are unusable, so the caller can fall back
 * rather than serve an arbitrary variant.
 */
export function resolveRollout(
  rollout: Rollout,
  flagKey: string,
  context: EvaluationContext,
): { variantKey: string; bucket: number } | null {
  const total = rollout.buckets.reduce((sum, b) => sum + b.weight, 0)
  if (rollout.buckets.length === 0 || total !== 100) return null

  const identityAttr = rollout.bucketBy
  const rawIdentity = identityAttr ? context.attributes?.[identityAttr] : context.key
  const identity = toComparable(rawIdentity)
  if (identity === undefined) return null

  const bucket = bucketFor(rollout.seed, flagKey, String(identity))

  let cursor = 0
  for (const b of rollout.buckets) {
    cursor += b.weight
    if (bucket < cursor) return { variantKey: b.variantKey, bucket }
  }

  // Unreachable while the weights sum to 100, but keeps the function total.
  return { variantKey: rollout.buckets[rollout.buckets.length - 1].variantKey, bucket }
}

/**
 * Evaluates one flag for one context.
 *
 * Never throws: a malformed config degrades to the off variant with
 * `reason: 'ERROR'`, because a flag platform that can crash its callers is
 * worse than one that is briefly wrong.
 */
export function evaluate<T = unknown>(
  flag: EvaluableFlag,
  config: EvaluableConfig,
  context: EvaluationContext,
): EvaluationResult<T> {
  const variantValue = (key: string | null): { key: string; value: T } | null => {
    if (!key) return null
    const variant = flag.variants.find((v) => v.key === key)
    return variant ? { key: variant.key, value: variant.value as T } : null
  }

  const off = variantValue(config.offVariantKey) ?? variantValue(flag.variants[0]?.key ?? null)

  const fallback = (reason: EvaluationResult<T>['reason'], error?: string): EvaluationResult<T> => ({
    value: (off?.value ?? null) as T,
    variantKey: off?.key ?? '',
    reason,
    ...(error ? { error } : {}),
  })

  try {
    if (flag.archived) return fallback('FLAG_ARCHIVED')
    if (!config.enabled) return fallback('FLAG_OFF')

    for (let i = 0; i < config.rules.length; i++) {
      const rule = config.rules[i]
      if (!evaluateRule(rule, context)) continue

      if ('variantKey' in rule.serve) {
        const served = variantValue(rule.serve.variantKey)
        if (!served) {
          return fallback('ERROR', `Rule ${i} serves unknown variant "${rule.serve.variantKey}"`)
        }
        return { value: served.value, variantKey: served.key, reason: 'RULE_MATCH', ruleIndex: i }
      }

      const resolved = resolveRollout(rule.serve.rollout, flag.key, context)
      if (!resolved) return fallback('ERROR', `Rule ${i} has an invalid rollout`)

      const served = variantValue(resolved.variantKey)
      if (!served) {
        return fallback('ERROR', `Rule ${i} rollout serves unknown variant "${resolved.variantKey}"`)
      }
      return {
        value: served.value,
        variantKey: served.key,
        reason: 'RULE_MATCH',
        ruleIndex: i,
        bucket: resolved.bucket,
      }
    }

    if (config.rollout) {
      const resolved = resolveRollout(config.rollout, flag.key, context)
      if (!resolved) return fallback('ERROR', 'Default rollout is invalid')

      const served = variantValue(resolved.variantKey)
      if (!served) {
        return fallback('ERROR', `Default rollout serves unknown variant "${resolved.variantKey}"`)
      }
      return {
        value: served.value,
        variantKey: served.key,
        reason: 'ROLLOUT',
        bucket: resolved.bucket,
      }
    }

    const fallthrough = variantValue(config.defaultVariantKey)
    if (!fallthrough) return fallback('ERROR', 'Config has no usable default variant')

    return { value: fallthrough.value, variantKey: fallthrough.key, reason: 'DEFAULT' }
  } catch (cause) {
    return fallback('ERROR', cause instanceof Error ? cause.message : 'Unknown evaluation error')
  }
}
