import { describe, expect, it } from 'vitest'

import { evenBuckets, targetingReducer, totalWeight } from './targeting-reducer'
import type { TargetingState } from './targeting-reducer'

const base: TargetingState = {
  enabled: true,
  rules: [],
  rollout: null,
  defaultVariantKey: 'off',
  offVariantKey: 'off',
}

const withRules = (count: number): TargetingState => ({
  ...base,
  rules: Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    description: `rule ${i}`,
    conditions: [],
    serve: { variantKey: 'on' as const },
  })),
})

describe('evenBuckets', () => {
  it('splits evenly when the count divides 100', () => {
    expect(evenBuckets(['on', 'off'])).toEqual([
      { variantKey: 'on', weight: 50 },
      { variantKey: 'off', weight: 50 },
    ])
  })

  it('gives the remainder to the first bucket so the total is exactly 100', () => {
    const buckets = evenBuckets(['a', 'b', 'c'])
    expect(buckets).toEqual([
      { variantKey: 'a', weight: 34 },
      { variantKey: 'b', weight: 33 },
      { variantKey: 'c', weight: 33 },
    ])
    expect(buckets.reduce((sum, b) => sum + b.weight, 0)).toBe(100)
  })

  it('always sums to 100 for any variant count', () => {
    for (let n = 1; n <= 17; n++) {
      const keys = Array.from({ length: n }, (_, i) => `v${i}`)
      expect(evenBuckets(keys).reduce((sum, b) => sum + b.weight, 0)).toBe(100)
    }
  })

  it('returns nothing for an empty variant list', () => {
    expect(evenBuckets([])).toEqual([])
  })
})

describe('targetingReducer', () => {
  it('appends a new rule with one blank condition', () => {
    const next = targetingReducer(base, { type: 'addRule', variantKey: 'on' })
    expect(next.rules).toHaveLength(1)
    expect(next.rules[0].conditions).toHaveLength(1)
    expect(next.rules[0].serve).toEqual({ variantKey: 'on' })
  })

  it('gives each added rule a distinct id', () => {
    let state = base
    for (let i = 0; i < 20; i++) {
      state = targetingReducer(state, { type: 'addRule', variantKey: 'on' })
    }
    expect(new Set(state.rules.map((r) => r.id)).size).toBe(20)
  })

  it('removes the rule at the given index and leaves the rest in order', () => {
    const next = targetingReducer(withRules(3), { type: 'removeRule', index: 1 })
    expect(next.rules.map((r) => r.id)).toEqual(['r0', 'r2'])
  })

  it('swaps adjacent rules, because order decides which one wins', () => {
    const next = targetingReducer(withRules(3), { type: 'moveRule', index: 0, direction: 1 })
    expect(next.rules.map((r) => r.id)).toEqual(['r1', 'r0', 'r2'])
  })

  it('ignores a move past either end instead of wrapping', () => {
    const state = withRules(3)
    expect(targetingReducer(state, { type: 'moveRule', index: 0, direction: -1 })).toBe(state)
    expect(targetingReducer(state, { type: 'moveRule', index: 2, direction: 1 })).toBe(state)
  })

  it('does not mutate the state it was given', () => {
    const state = withRules(2)
    const snapshot = JSON.stringify(state)
    targetingReducer(state, { type: 'moveRule', index: 0, direction: 1 })
    targetingReducer(state, { type: 'removeRule', index: 0 })
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('patches one condition without touching its siblings', () => {
    const state = targetingReducer(
      targetingReducer(base, { type: 'addRule', variantKey: 'on' }),
      { type: 'addCondition', ruleIndex: 0 },
    )

    const next = targetingReducer(state, {
      type: 'updateCondition',
      ruleIndex: 0,
      conditionIndex: 1,
      patch: { attribute: 'plan', operator: 'in', values: ['pro'] },
    })

    expect(next.rules[0].conditions[0].attribute).toBe('')
    expect(next.rules[0].conditions[1]).toMatchObject({ attribute: 'plan', operator: 'in' })
  })

  it('ignores edits addressed to a rule or condition that is gone', () => {
    expect(targetingReducer(base, { type: 'removeRule', index: 5 }).rules).toEqual([])
    expect(
      targetingReducer(base, {
        type: 'updateCondition',
        ruleIndex: 9,
        conditionIndex: 0,
        patch: { attribute: 'x' },
      }),
    ).toEqual(base)
  })

  it('creates an evenly split rollout that satisfies the 100% invariant', () => {
    const next = targetingReducer(base, {
      type: 'enableRollout',
      variantKeys: ['control', 'a', 'b'],
    })
    expect(totalWeight(next.rollout)).toBe(100)
  })

  it('clamps a bucket weight to 0-100 and rounds it', () => {
    const rolled = targetingReducer(base, { type: 'enableRollout', variantKeys: ['on', 'off'] })

    const high = targetingReducer(rolled, {
      type: 'setBucketWeight',
      variantKey: 'on',
      weight: 140,
    })
    expect(high.rollout?.buckets.find((b) => b.variantKey === 'on')?.weight).toBe(100)

    const low = targetingReducer(rolled, {
      type: 'setBucketWeight',
      variantKey: 'on',
      weight: -20,
    })
    expect(low.rollout?.buckets.find((b) => b.variantKey === 'on')?.weight).toBe(0)

    const fractional = targetingReducer(rolled, {
      type: 'setBucketWeight',
      variantKey: 'on',
      weight: 33.7,
    })
    expect(fractional.rollout?.buckets.find((b) => b.variantKey === 'on')?.weight).toBe(34)
  })

  it('lets weights go out of balance while editing, so the UI can warn instead of fighting the user', () => {
    const rolled = targetingReducer(base, { type: 'enableRollout', variantKeys: ['on', 'off'] })
    const edited = targetingReducer(rolled, {
      type: 'setBucketWeight',
      variantKey: 'on',
      weight: 80,
    })
    expect(totalWeight(edited.rollout)).toBe(130)
  })

  it('drops bucketBy entirely when cleared, rather than storing an empty string', () => {
    const rolled = targetingReducer(base, { type: 'enableRollout', variantKeys: ['on', 'off'] })
    const withKey = targetingReducer(rolled, {
      type: 'setRolloutBucketBy',
      bucketBy: 'accountId',
    })
    expect(withKey.rollout?.bucketBy).toBe('accountId')

    const cleared = targetingReducer(withKey, { type: 'setRolloutBucketBy', bucketBy: '   ' })
    expect(cleared.rollout && 'bucketBy' in cleared.rollout).toBe(false)
  })

  it('ignores rollout edits when there is no rollout', () => {
    expect(targetingReducer(base, { type: 'setBucketWeight', variantKey: 'on', weight: 50 }))
      .toBe(base)
    expect(targetingReducer(base, { type: 'setRolloutBucketBy', bucketBy: 'x' })).toBe(base)
  })
})
