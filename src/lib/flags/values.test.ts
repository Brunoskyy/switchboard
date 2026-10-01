import { describe, expect, it } from 'vitest'

import { coerceValue, parseValueList } from './values'

describe('coerceValue', () => {
  it('keeps numbers numeric so gt/lt compare numerically', () => {
    expect(coerceValue('25')).toBe(25)
    expect(coerceValue('-1.5')).toBe(-1.5)
  })

  it('reads true and false as booleans', () => {
    expect(coerceValue('true')).toBe(true)
    expect(coerceValue('false')).toBe(false)
  })

  it('keeps text that only parses as a number as text', () => {
    // A zip code with a leading zero is not the number 2134.
    expect(coerceValue('02134')).toBe('02134')
    expect(coerceValue('1e3')).toBe('1e3')
    expect(coerceValue('0x10')).toBe('0x10')
    expect(coerceValue(' 42')).toBe(' 42')
  })

  it('does not swallow a trailing dot while a decimal is being typed', () => {
    expect(coerceValue('1.')).toBe('1.')
  })

  it('leaves blank text alone', () => {
    expect(coerceValue(' ')).toBe(' ')
  })
})

describe('parseValueList', () => {
  it('splits on commas, trims and drops empty parts', () => {
    expect(parseValueList('us, ca,, 02134 , 7')).toEqual(['us', 'ca', '02134', 7])
  })
})
