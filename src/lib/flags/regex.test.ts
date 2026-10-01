import { describe, expect, it } from 'vitest'

import { evaluateCondition } from './evaluate'
import { hasNestedQuantifier, MAX_MATCH_INPUT_LENGTH, patternProblem } from './regex'
import { ConditionSchema } from './schema'

describe('hasNestedQuantifier', () => {
  it.each(['(a+)+$', '(a*)*', '(\\w+\\s?)*$', '(?:x+y){2,}', '((ab)+c)+', '(a{1,5})+'])(
    'flags %s',
    (pattern) => {
      expect(hasNestedQuantifier(pattern)).toBe(true)
    },
  )

  it.each([
    '^(alpha|beta){1,3}$',
    '@acme\\.test$',
    '^[a-z]+-[0-9]+$',
    '(\\d{3})+',
    '(a+)?',
    '(ab)+',
    '[(a+)]+',
    '\\(a+\\)+',
  ])('allows %s', (pattern) => {
    expect(hasNestedQuantifier(pattern)).toBe(false)
  })
})

describe('patternProblem', () => {
  it('accepts an ordinary pattern', () => {
    expect(patternProblem('^user-[0-9]+$')).toBeNull()
  })

  it('rejects patterns that are too long, invalid or catastrophic', () => {
    expect(patternProblem('a'.repeat(513))).toMatch(/512/)
    expect(patternProblem('([a-z')).toMatch(/valid/)
    expect(patternProblem('(a+)+$')).toMatch(/hang/)
  })
})

describe('ConditionSchema for matches', () => {
  const condition = (pattern: string) => ({
    attribute: 'email',
    operator: 'matches' as const,
    values: [pattern],
  })

  it('refuses a nested quantifier on write', () => {
    expect(ConditionSchema.safeParse(condition('(a+)+$')).success).toBe(false)
  })

  it('still accepts a safe pattern', () => {
    expect(ConditionSchema.safeParse(condition('^(alpha|beta){1,3}$')).success).toBe(true)
  })
})

describe('evaluating matches', () => {
  const ctx = (value: string) => ({ key: 'u', attributes: { name: value } })

  it('fails closed on a stored catastrophic pattern instead of hanging', () => {
    const condition = { attribute: 'name', operator: 'matches' as const, values: ['(a+)+$'] }
    // ~30 characters is enough to stall V8 for seconds if this is ever compiled.
    const started = performance.now()
    expect(evaluateCondition(condition, ctx(`${'a'.repeat(30)}!`))).toBe(false)
    expect(performance.now() - started).toBeLessThan(100)
  })

  it('fails closed on input past the length bound, without throwing', () => {
    const condition = { attribute: 'name', operator: 'matches' as const, values: ['^a'] }
    expect(evaluateCondition(condition, ctx('a'.repeat(MAX_MATCH_INPUT_LENGTH)))).toBe(true)
    expect(evaluateCondition(condition, ctx('a'.repeat(MAX_MATCH_INPUT_LENGTH + 1)))).toBe(false)
  })
})
