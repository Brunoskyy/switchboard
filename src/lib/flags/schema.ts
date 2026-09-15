import { z } from 'zod'

/**
 * Write-side validation for the Json columns on FlagConfig.
 *
 * The evaluator is deliberately tolerant — it degrades instead of throwing —
 * so these schemas are what actually keep bad shapes out of the database.
 * Every write path must run the payload through `FlagRulesSchema` /
 * `RolloutSchema` before it reaches Prisma.
 */

export const OPERATORS = [
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'matches',
  'exists',
  'not_exists',
] as const

export const OPERATOR_LABELS: Record<(typeof OPERATORS)[number], string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  in: 'is one of',
  not_in: 'is not one of',
  gt: 'is greater than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  matches: 'matches regex',
  exists: 'is set',
  not_exists: 'is not set',
}

/** Operators that ignore `values` entirely. */
export const PRESENCE_OPERATORS = ['exists', 'not_exists'] as const

const AttributeValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const ConditionSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    attribute: z.string().min(1, 'Pick an attribute').max(120),
    operator: z.enum(OPERATORS),
    values: z.array(AttributeValueSchema).max(500, 'At most 500 values per condition'),
    negate: z.boolean().optional(),
  })
  .refine(
    (c) =>
      (PRESENCE_OPERATORS as readonly string[]).includes(c.operator) || c.values.length > 0,
    { message: 'This operator needs at least one value', path: ['values'] },
  )
  .refine((c) => c.operator !== 'matches' || String(c.values[0] ?? '').length <= 512, {
    message: 'Regex patterns are capped at 512 characters',
    path: ['values'],
  })
  .refine(
    (c) => {
      if (c.operator !== 'matches') return true
      try {
        new RegExp(String(c.values[0] ?? ''))
        return true
      } catch {
        return false
      }
    },
    { message: 'Not a valid regular expression', path: ['values'] },
  )

export const RolloutSchema = z
  .object({
    seed: z.string().min(1).max(64),
    bucketBy: z.string().min(1).max(120).optional(),
    buckets: z
      .array(
        z.object({
          variantKey: z.string().min(1),
          weight: z.number().int().min(0).max(100),
        }),
      )
      .min(1, 'A rollout needs at least one bucket'),
  })
  .refine((r) => r.buckets.reduce((sum, b) => sum + b.weight, 0) === 100, {
    message: 'Rollout weights must add up to exactly 100%',
    path: ['buckets'],
  })

export const RuleServeSchema = z.union([
  z.object({ variantKey: z.string().min(1) }),
  z.object({ rollout: RolloutSchema }),
])

export const RuleSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(280).optional(),
  conditions: z.array(ConditionSchema).max(25, 'At most 25 conditions per rule'),
  serve: RuleServeSchema,
})

export const FlagRulesSchema = z.array(RuleSchema).max(50, 'At most 50 rules per environment')

/** Flag keys are used verbatim in SDK calls, so keep them URL- and code-safe. */
export const FlagKeySchema = z
  .string()
  .min(2, 'At least 2 characters')
  .max(64, 'At most 64 characters')
  .regex(
    /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/,
    'Use lowercase letters, numbers, and - _ . between them',
  )

export const VariantSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, 'Use lowercase letters, numbers, - and _'),
  name: z.string().min(1).max(80),
  value: z.unknown(),
})

export type ConditionInput = z.infer<typeof ConditionSchema>
export type RuleInput = z.infer<typeof RuleSchema>
export type RolloutInput = z.infer<typeof RolloutSchema>
