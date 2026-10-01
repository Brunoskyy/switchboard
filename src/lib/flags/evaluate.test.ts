import { describe, expect, it } from 'vitest'

import { evaluate, evaluateCondition, resolveRollout } from './evaluate'
import type { EvaluableConfig, EvaluableFlag } from './evaluate'
import { bucketFor } from './hash'
import type { Rollout, Rule } from './types'

const booleanFlag: EvaluableFlag = {
  key: 'new-checkout',
  archived: false,
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
}

const baseConfig: EvaluableConfig = {
  enabled: true,
  defaultVariantKey: 'off',
  offVariantKey: 'off',
  rules: [],
  rollout: null,
}

const ctx = (key: string, attributes: Record<string, unknown> = {}) => ({
  key,
  attributes: attributes as never,
})

describe('evaluateCondition', () => {
  it('reads the reserved `key` attribute from the context key', () => {
    const condition = { attribute: 'key', operator: 'eq' as const, values: ['user-1'] }
    expect(evaluateCondition(condition, ctx('user-1'))).toBe(true)
    expect(evaluateCondition(condition, ctx('user-2'))).toBe(false)
  })

  it('treats a missing attribute as no match rather than an error', () => {
    const condition = { attribute: 'plan', operator: 'eq' as const, values: ['pro'] }
    expect(evaluateCondition(condition, ctx('u'))).toBe(false)
  })

  it('distinguishes a missing attribute from a falsy one', () => {
    const exists = { attribute: 'trial', operator: 'exists' as const, values: [] }
    expect(evaluateCondition(exists, ctx('u', { trial: false }))).toBe(true)
    expect(evaluateCondition(exists, ctx('u', {}))).toBe(false)
    expect(evaluateCondition(exists, ctx('u', { trial: null }))).toBe(false)
  })

  it('matches any element of an array attribute for positive operators', () => {
    const condition = { attribute: 'roles', operator: 'in' as const, values: ['admin', 'owner'] }
    expect(evaluateCondition(condition, ctx('u', { roles: ['member', 'admin'] }))).toBe(true)
    expect(evaluateCondition(condition, ctx('u', { roles: ['member'] }))).toBe(false)
  })

  it('requires every element to match for negative operators', () => {
    const condition = { attribute: 'roles', operator: 'not_in' as const, values: ['admin'] }
    expect(evaluateCondition(condition, ctx('u', { roles: ['member', 'viewer'] }))).toBe(true)
    // "not in [admin]" must be false when any role IS admin.
    expect(evaluateCondition(condition, ctx('u', { roles: ['member', 'admin'] }))).toBe(false)
  })

  it('treats a number and its string form as equal for eq', () => {
    // The editor saves "12345" as a number; SDKs often send zip codes as strings.
    const condition = { attribute: 'zip', operator: 'eq' as const, values: [12345] }
    expect(evaluateCondition(condition, ctx('u', { zip: '12345' }))).toBe(true)
    expect(evaluateCondition(condition, ctx('u', { zip: 12345 }))).toBe(true)
    expect(evaluateCondition(condition, ctx('u', { zip: '12346' }))).toBe(false)

    const asString = { attribute: 'zip', operator: 'eq' as const, values: ['12345'] }
    expect(evaluateCondition(asString, ctx('u', { zip: 12345 }))).toBe(true)
  })

  it('applies the same equality to in, not_in and neq', () => {
    const inList = { attribute: 'zip', operator: 'in' as const, values: [10001, 94105] }
    expect(evaluateCondition(inList, ctx('u', { zip: '94105' }))).toBe(true)

    const notIn = { attribute: 'zip', operator: 'not_in' as const, values: [10001, 94105] }
    expect(evaluateCondition(notIn, ctx('u', { zip: '94105' }))).toBe(false)
    expect(evaluateCondition(notIn, ctx('u', { zip: '60601' }))).toBe(true)

    const neq = { attribute: 'zip', operator: 'neq' as const, values: [94105] }
    expect(evaluateCondition(neq, ctx('u', { zip: '94105' }))).toBe(false)
  })

  it('compares by printed form, so a leading zero still matters', () => {
    const condition = { attribute: 'zip', operator: 'eq' as const, values: ['02134'] }
    expect(evaluateCondition(condition, ctx('u', { zip: 2134 }))).toBe(false)
    expect(evaluateCondition(condition, ctx('u', { zip: '02134' }))).toBe(true)
  })

  it('matches a boolean against its string form but never against a number', () => {
    const condition = { attribute: 'beta', operator: 'eq' as const, values: [true] }
    expect(evaluateCondition(condition, ctx('u', { beta: 'true' }))).toBe(true)
    expect(evaluateCondition(condition, ctx('u', { beta: 1 }))).toBe(false)
  })

  it('compares numerically for gt/lte, coercing numeric strings', () => {
    const gt = { attribute: 'seats', operator: 'gt' as const, values: [10] }
    expect(evaluateCondition(gt, ctx('u', { seats: 25 }))).toBe(true)
    expect(evaluateCondition(gt, ctx('u', { seats: '25' }))).toBe(true)
    expect(evaluateCondition(gt, ctx('u', { seats: 4 }))).toBe(false)
  })

  it('does not match when a numeric comparison gets non-numeric input', () => {
    const gt = { attribute: 'seats', operator: 'gt' as const, values: [10] }
    expect(evaluateCondition(gt, ctx('u', { seats: 'many' }))).toBe(false)
  })

  it('fails closed on an invalid regex instead of throwing', () => {
    const condition = { attribute: 'email', operator: 'matches' as const, values: ['([a-z'] }
    expect(() => evaluateCondition(condition, ctx('u', { email: 'a@b.com' }))).not.toThrow()
    expect(evaluateCondition(condition, ctx('u', { email: 'a@b.com' }))).toBe(false)
  })

  it('refuses to compile a pattern beyond the length cap', () => {
    const condition = { attribute: 'email', operator: 'matches' as const, values: ['a'.repeat(513)] }
    expect(evaluateCondition(condition, ctx('u', { email: 'a'.repeat(600) }))).toBe(false)
  })

  it('inverts the outcome when negate is set', () => {
    const condition = {
      attribute: 'country',
      operator: 'eq' as const,
      values: ['BR'],
      negate: true,
    }
    expect(evaluateCondition(condition, ctx('u', { country: 'BR' }))).toBe(false)
    expect(evaluateCondition(condition, ctx('u', { country: 'PT' }))).toBe(true)
  })
})

describe('resolveRollout', () => {
  const rollout: Rollout = {
    seed: 'seed-1',
    buckets: [
      { variantKey: 'on', weight: 50 },
      { variantKey: 'off', weight: 50 },
    ],
  }

  /** Narrowing helper: the variant a successful resolution served. */
  const served = (result: ReturnType<typeof resolveRollout>) =>
    result.status === 'ok' ? result.variantKey : null

  it('reports weights that do not sum to 100 as a misconfiguration', () => {
    const result = resolveRollout(
      { ...rollout, buckets: [{ variantKey: 'on', weight: 60 }] },
      'f',
      ctx('u'),
    )
    expect(result.status).toBe('invalid')
  })

  it('reports an empty bucket list as a misconfiguration', () => {
    expect(resolveRollout({ ...rollout, buckets: [] }, 'f', ctx('u')).status).toBe('invalid')
  })

  it('separates a missing bucketBy attribute from a broken config', () => {
    // An anonymous visitor against a rollout bucketed by accountId is an
    // ordinary miss, not something anyone needs to go and fix.
    expect(resolveRollout({ ...rollout, bucketBy: 'accountId' }, 'f', ctx('u')).status)
      .toBe('no-identity')
  })

  it('is stable for the same identity', () => {
    const a = resolveRollout(rollout, 'new-checkout', ctx('user-42'))
    const b = resolveRollout(rollout, 'new-checkout', ctx('user-42'))
    expect(a).toEqual(b)
  })

  it('buckets whole accounts together when bucketBy is set', () => {
    const byAccount = { ...rollout, bucketBy: 'accountId' }
    const one = resolveRollout(byAccount, 'new-checkout', ctx('user-1', { accountId: 'acct-9' }))
    const two = resolveRollout(byAccount, 'new-checkout', ctx('user-2', { accountId: 'acct-9' }))
    expect(served(one)).toBe(served(two))
  })

  it('changes the assignment when the seed changes', () => {
    const identities = Array.from({ length: 200 }, (_, i) => `user-${i}`)
    const withSeedA = identities.map((id) => served(resolveRollout(rollout, 'f', ctx(id))))
    const withSeedB = identities.map((id) =>
      served(resolveRollout({ ...rollout, seed: 'seed-2' }, 'f', ctx(id))),
    )
    expect(withSeedA).not.toEqual(withSeedB)
  })

  it('distributes roughly according to the declared weights', () => {
    const tenPercent: Rollout = {
      seed: 'dist',
      buckets: [
        { variantKey: 'on', weight: 10 },
        { variantKey: 'off', weight: 90 },
      ],
    }
    const sampleSize = 20_000
    let on = 0
    for (let i = 0; i < sampleSize; i++) {
      if (served(resolveRollout(tenPercent, 'new-checkout', ctx(`user-${i}`))) === 'on') on++
    }
    const share = on / sampleSize
    // Tolerance is wide enough not to flake, tight enough to catch a hash that
    // clusters (a broken hash typically lands at 0%, 50% or 100%).
    expect(share).toBeGreaterThan(0.085)
    expect(share).toBeLessThan(0.115)
  })
})

describe('bucketFor', () => {
  it('always lands inside [0, 100)', () => {
    for (let i = 0; i < 1000; i++) {
      const bucket = bucketFor('s', 'f', `user-${i}`)
      expect(bucket).toBeGreaterThanOrEqual(0)
      expect(bucket).toBeLessThan(100)
    }
  })

  it('handles non-ASCII identities without collapsing', () => {
    const a = bucketFor('s', 'f', 'usuário-ção')
    const b = bucketFor('s', 'f', 'usuario-cao')
    expect(a).not.toBe(b)
  })
})

describe('evaluate', () => {
  it('serves the off variant when the flag is disabled', () => {
    const result = evaluate<boolean>(booleanFlag, { ...baseConfig, enabled: false }, ctx('u'))
    expect(result).toMatchObject({ value: false, variantKey: 'off', reason: 'FLAG_OFF' })
  })

  it('serves the off variant when the flag is archived, even if enabled', () => {
    const result = evaluate<boolean>({ ...booleanFlag, archived: true }, baseConfig, ctx('u'))
    expect(result.reason).toBe('FLAG_ARCHIVED')
    expect(result.value).toBe(false)
  })

  it('falls through to the default variant when no rule matches', () => {
    const result = evaluate<boolean>(booleanFlag, baseConfig, ctx('u'))
    expect(result).toMatchObject({ reason: 'DEFAULT', variantKey: 'off' })
  })

  it('serves the first matching rule and reports its index', () => {
    const rules: Rule[] = [
      {
        id: 'r1',
        conditions: [{ attribute: 'plan', operator: 'eq', values: ['free'] }],
        serve: { variantKey: 'off' },
      },
      {
        id: 'r2',
        conditions: [{ attribute: 'plan', operator: 'eq', values: ['pro'] }],
        serve: { variantKey: 'on' },
      },
    ]
    const result = evaluate<boolean>(booleanFlag, { ...baseConfig, rules }, ctx('u', { plan: 'pro' }))
    expect(result).toMatchObject({ value: true, reason: 'RULE_MATCH', ruleIndex: 1 })
  })

  it('stops at the first match even when a later rule would also match', () => {
    const rules: Rule[] = [
      { id: 'r1', conditions: [], serve: { variantKey: 'off' } },
      { id: 'r2', conditions: [], serve: { variantKey: 'on' } },
    ]
    const result = evaluate<boolean>(booleanFlag, { ...baseConfig, rules }, ctx('u'))
    expect(result.ruleIndex).toBe(0)
    expect(result.value).toBe(false)
  })

  it('ANDs every condition inside a rule', () => {
    const rules: Rule[] = [
      {
        id: 'r1',
        conditions: [
          { attribute: 'plan', operator: 'eq', values: ['pro'] },
          { attribute: 'country', operator: 'in', values: ['BR', 'PT'] },
        ],
        serve: { variantKey: 'on' },
      },
    ]
    const config = { ...baseConfig, rules }
    expect(evaluate(booleanFlag, config, ctx('u', { plan: 'pro', country: 'BR' })).reason)
      .toBe('RULE_MATCH')
    expect(evaluate(booleanFlag, config, ctx('u', { plan: 'pro', country: 'US' })).reason)
      .toBe('DEFAULT')
  })

  it('applies the config-level rollout when no rule matches', () => {
    const config: EvaluableConfig = {
      ...baseConfig,
      rollout: {
        seed: 'r',
        buckets: [
          { variantKey: 'on', weight: 100 },
          { variantKey: 'off', weight: 0 },
        ],
      },
    }
    const result = evaluate<boolean>(booleanFlag, config, ctx('u'))
    expect(result).toMatchObject({ value: true, reason: 'ROLLOUT' })
    expect(result.bucket).toBeGreaterThanOrEqual(0)
  })

  it('falls through to the default when the context cannot be bucketed', () => {
    const config: EvaluableConfig = {
      ...baseConfig,
      defaultVariantKey: 'off',
      rollout: {
        seed: 'r',
        bucketBy: 'accountId',
        buckets: [
          { variantKey: 'on', weight: 100 },
          { variantKey: 'off', weight: 0 },
        ],
      },
    }

    // No accountId on the context: valid config, ordinary miss.
    const result = evaluate<boolean>(booleanFlag, config, ctx('u'))
    expect(result.reason).toBe('DEFAULT')
    expect(result.error).toBeUndefined()
  })

  it('still reports genuinely broken rollout weights as an error', () => {
    const config: EvaluableConfig = {
      ...baseConfig,
      rollout: { seed: 'r', buckets: [{ variantKey: 'on', weight: 60 }] },
    }
    expect(evaluate(booleanFlag, config, ctx('u')).reason).toBe('ERROR')
  })

  it('falls through to the default when a matched rule cannot bucket the context', () => {
    const rules: Rule[] = [
      {
        id: 'r1',
        conditions: [],
        serve: {
          rollout: {
            seed: 's',
            bucketBy: 'accountId',
            buckets: [
              { variantKey: 'on', weight: 100 },
              { variantKey: 'off', weight: 0 },
            ],
          },
        },
      },
    ]
    const result = evaluate<boolean>(booleanFlag, { ...baseConfig, rules }, ctx('u'))
    expect(result.reason).toBe('DEFAULT')
    expect(result.error).toBeUndefined()
  })

  it('degrades to the off variant when a rule names an unknown variant', () => {
    const rules: Rule[] = [{ id: 'r1', conditions: [], serve: { variantKey: 'ghost' } }]
    const result = evaluate<boolean>(booleanFlag, { ...baseConfig, rules }, ctx('u'))
    expect(result.reason).toBe('ERROR')
    expect(result.value).toBe(false)
    expect(result.error).toContain('ghost')
  })

  it('degrades to the off variant when the default variant is missing', () => {
    const config = { ...baseConfig, defaultVariantKey: null }
    const result = evaluate<boolean>(booleanFlag, config, ctx('u'))
    expect(result.reason).toBe('ERROR')
    expect(result.value).toBe(false)
  })

  it('never throws on a structurally broken config', () => {
    const broken = { ...baseConfig, rules: [{ id: 'x' }] as unknown as Rule[] }
    expect(() => evaluate(booleanFlag, broken, ctx('u'))).not.toThrow()
    expect(evaluate(booleanFlag, broken, ctx('u')).reason).toBe('ERROR')
  })

  it('supports multivariate flags, not just booleans', () => {
    const themeFlag: EvaluableFlag = {
      key: 'checkout-theme',
      archived: false,
      variants: [
        { key: 'control', value: { color: 'blue' } },
        { key: 'treatment', value: { color: 'green' } },
      ],
    }
    const config: EvaluableConfig = {
      enabled: true,
      offVariantKey: 'control',
      defaultVariantKey: 'treatment',
      rules: [],
      rollout: null,
    }
    expect(evaluate<{ color: string }>(themeFlag, config, ctx('u')).value).toEqual({
      color: 'green',
    })
  })
})
