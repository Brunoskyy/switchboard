import { describe, expect, it } from 'vitest'

import { describeRollout, describeTargetingChange, rulesFingerprint } from './diff'
import type { TargetingSnapshot } from './diff'
import type { Rule } from './types'

const rule = (overrides: Partial<Rule> = {}): Rule => ({
  id: 'r1',
  description: 'Always on for the team',
  conditions: [{ attribute: 'email', operator: 'ends_with', values: ['@acme.test'] }],
  serve: { variantKey: 'on' },
  ...overrides,
})

describe('rulesFingerprint', () => {
  it('ignores key order, because jsonb reorders keys on write', () => {
    // What the client sends...
    const sent = [
      {
        id: 'r1',
        description: 'Always on for the team',
        conditions: [{ attribute: 'email', operator: 'ends_with', values: ['@acme.test'] }],
        serve: { variantKey: 'on' },
      },
    ]

    // ...and the same rule as Postgres hands it back.
    const stored = [
      {
        id: 'r1',
        serve: { variantKey: 'on' },
        conditions: [{ values: ['@acme.test'], operator: 'ends_with', attribute: 'email' }],
        description: 'Always on for the team',
      },
    ]

    expect(rulesFingerprint(sent)).toBe(rulesFingerprint(stored))
  })

  it('ignores ids the editor mints on load', () => {
    const withoutIds = [rule()]
    const withIds = [
      {
        ...rule(),
        conditions: [
          { id: 'cond-abc123', attribute: 'email', operator: 'ends_with', values: ['@acme.test'] },
        ],
      },
    ]

    expect(rulesFingerprint(withoutIds)).toBe(rulesFingerprint(withIds))
  })

  it('still notices a real edit', () => {
    const before = [rule()]
    const after = [
      { ...rule(), conditions: [{ attribute: 'email', operator: 'eq' as const, values: ['a@b.c'] }] },
    ]

    expect(rulesFingerprint(before)).not.toBe(rulesFingerprint(after))
  })

  it('notices reordering, since order decides which rule wins', () => {
    const a = rule({ id: 'a', serve: { variantKey: 'on' } })
    const b = rule({ id: 'b', serve: { variantKey: 'off' } })

    expect(rulesFingerprint([a, b])).not.toBe(rulesFingerprint([b, a]))
  })

  it('notices a changed description, which is what a reader sees', () => {
    expect(rulesFingerprint([rule()])).not.toBe(
      rulesFingerprint([rule({ description: 'Something else' })]),
    )
  })

  it('treats anything that is not an array as empty', () => {
    expect(rulesFingerprint(null)).toBe('[]')
    expect(rulesFingerprint(undefined)).toBe('[]')
    expect(rulesFingerprint({ nope: true })).toBe('[]')
  })
})

describe('describeRollout', () => {
  it('lists the serving buckets', () => {
    expect(
      describeRollout({
        seed: 's',
        buckets: [
          { variantKey: 'on', weight: 25 },
          { variantKey: 'off', weight: 75 },
        ],
      }),
    ).toBe('25% on · 75% off')
  })

  it('leaves out buckets nobody lands in', () => {
    expect(
      describeRollout({
        seed: 's',
        buckets: [
          { variantKey: 'on', weight: 100 },
          { variantKey: 'off', weight: 0 },
        ],
      }),
    ).toBe('100% on')
  })

  it('returns null when there is no rollout to describe', () => {
    expect(describeRollout(null)).toBeNull()
    expect(describeRollout(undefined)).toBeNull()
    expect(describeRollout({ seed: 's', buckets: [] })).toBeNull()
  })

  it('returns null when every weight is zero', () => {
    expect(describeRollout({ seed: 's', buckets: [{ variantKey: 'on', weight: 0 }] })).toBeNull()
  })
})

describe('describeTargetingChange', () => {
  const saved: TargetingSnapshot = {
    rules: [rule()],
    rollout: null,
    defaultVariantKey: 'off',
    offVariantKey: 'off',
  }

  it('records a default-variant-only change instead of an empty diff', () => {
    const change = describeTargetingChange(saved, { ...saved, defaultVariantKey: 'on' })
    expect(change.diff).toEqual({ defaultVariant: { from: 'off', to: 'on' } })
    expect(change.unchanged).toBe(false)
    expect(change.rolloutOnly).toBe(false)
  })

  it('records an off-variant-only change', () => {
    const change = describeTargetingChange(saved, { ...saved, offVariantKey: 'on' })
    expect(change.diff).toEqual({ offVariant: { from: 'off', to: 'on' } })
  })

  it('flags a change to the rollout alone as rollout-only', () => {
    const change = describeTargetingChange(saved, {
      ...saved,
      rollout: { seed: 's', buckets: [{ variantKey: 'on', weight: 100 }] },
    })
    expect(change.diff).toEqual({ rollout: { from: null, to: '100% on' } })
    expect(change.rolloutOnly).toBe(true)
  })

  it('is not rollout-only when something else moved with it', () => {
    const change = describeTargetingChange(saved, {
      ...saved,
      rollout: { seed: 's', buckets: [{ variantKey: 'on', weight: 100 }] },
      defaultVariantKey: 'on',
    })
    expect(change.rolloutOnly).toBe(false)
  })

  it('counts rules when the rules change', () => {
    const change = describeTargetingChange(saved, { ...saved, rules: [] })
    expect(change.diff).toEqual({ rules: { from: 1, to: 0 } })
  })

  it('reports nothing when only editor-minted ids differ', () => {
    const withIds = [{ ...rule(), conditions: [{ ...rule().conditions[0], id: 'cond-x' }] }]
    expect(describeTargetingChange(saved, { ...saved, rules: withIds }).unchanged).toBe(true)
  })

  it('treats a missing previous config as empty', () => {
    const change = describeTargetingChange(null, saved)
    expect(change.diff).toEqual({
      rules: { from: 0, to: 1 },
      defaultVariant: { from: null, to: 'off' },
      offVariant: { from: null, to: 'off' },
    })
  })
})
