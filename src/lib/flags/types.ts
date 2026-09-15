/**
 * Targeting model
 * ---------------
 * A flag's behaviour in one environment is described by a FlagConfig:
 *
 *   enabled === false            -> always serve `offVariantKey`
 *   first rule whose conditions  -> serve that rule's variant, or bucket the
 *   all match (top to bottom)       context through that rule's rollout
 *   no rule matched              -> serve `defaultVariantKey`, or bucket
 *                                   through the config-level rollout
 *
 * Conditions inside a rule are ANDed. To express OR, add another rule.
 * This mirrors how LaunchDarkly/Unleash model targeting and keeps evaluation
 * a single top-to-bottom pass with no backtracking.
 */

export type Operator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'matches'
  | 'exists'
  | 'not_exists'

export type AttributeValue = string | number | boolean

export interface Condition {
  /**
   * Stable across edits, so the editor can key a row by the condition itself
   * rather than by its position. Optional because configs written before this
   * existed are still valid; the editor assigns one on load.
   */
  id?: string
  attribute: string
  operator: Operator
  /** Ignored by `exists` / `not_exists`. */
  values: AttributeValue[]
  negate?: boolean
}

/** Weights are whole percentages and must sum to exactly 100. */
export interface RolloutBucket {
  variantKey: string
  weight: number
}

export interface Rollout {
  /** Changing the seed reshuffles who lands in which bucket. */
  seed: string
  buckets: RolloutBucket[]
  /**
   * Context attribute used to bucket. Defaults to the context key, so a given
   * user stays in the same bucket across sessions; set to e.g. `accountId` to
   * keep whole accounts together.
   */
  bucketBy?: string
}

export type RuleServe = { variantKey: string } | { rollout: Rollout }

export interface Rule {
  id: string
  description?: string
  conditions: Condition[]
  serve: RuleServe
}

export interface EvaluationContext {
  /** Stable identifier for the subject being evaluated. */
  key: string
  attributes?: Record<string, AttributeValue | AttributeValue[] | null | undefined>
}

export type EvaluationReason =
  | 'FLAG_ARCHIVED'
  | 'FLAG_OFF'
  | 'RULE_MATCH'
  | 'ROLLOUT'
  | 'DEFAULT'
  | 'ERROR'

export interface EvaluationResult<T = unknown> {
  value: T
  variantKey: string
  reason: EvaluationReason
  /** Index of the matched rule, when `reason === 'RULE_MATCH'`. */
  ruleIndex?: number
  /** Bucket the context landed in (0-99), when bucketing took place. */
  bucket?: number
  error?: string
}
