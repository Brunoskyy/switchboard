import { describe, expect, it } from 'vitest'

import { generateSdkKey, hashSdkKey, sdkKeyMatches } from './keys'

describe('generateSdkKey', () => {
  it('scopes the key to its environment and keeps a recognisable prefix', () => {
    const key = generateSdkKey('production')
    expect(key.plaintext.startsWith('sb_prod_')).toBe(true)
    expect(key.prefix).toBe(key.plaintext.slice(0, 12))
    expect(key.plaintext.startsWith(key.prefix)).toBe(true)
  })

  it('falls back to a valid scope for an environment key with no letters', () => {
    expect(generateSdkKey('123').plaintext.startsWith('sb_env_')).toBe(true)
    expect(generateSdkKey('').plaintext.startsWith('sb_env_')).toBe(true)
  })

  it('never repeats a key', () => {
    const keys = new Set(Array.from({ length: 500 }, () => generateSdkKey('dev').plaintext))
    expect(keys.size).toBe(500)
  })

  it('stores a hash, never the key itself', () => {
    const key = generateSdkKey('staging')
    expect(key.hashedKey).not.toContain(key.plaintext)
    expect(key.hashedKey).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('sdkKeyMatches', () => {
  it('accepts the key it was generated from', () => {
    const key = generateSdkKey('production')
    expect(sdkKeyMatches(key.plaintext, key.hashedKey)).toBe(true)
  })

  it('rejects any other key', () => {
    const a = generateSdkKey('production')
    const b = generateSdkKey('production')
    expect(sdkKeyMatches(b.plaintext, a.hashedKey)).toBe(false)
  })

  it('rejects a near miss rather than matching on a prefix', () => {
    const key = generateSdkKey('production')
    expect(sdkKeyMatches(key.plaintext.slice(0, -1), key.hashedKey)).toBe(false)
    expect(sdkKeyMatches(`${key.plaintext}x`, key.hashedKey)).toBe(false)
  })

  it('returns false instead of throwing on a malformed stored hash', () => {
    const key = generateSdkKey('production')
    expect(() => sdkKeyMatches(key.plaintext, 'not-a-hash')).not.toThrow()
    expect(sdkKeyMatches(key.plaintext, 'not-a-hash')).toBe(false)
    expect(sdkKeyMatches(key.plaintext, '')).toBe(false)
  })

  it('is deterministic', () => {
    const key = generateSdkKey('dev')
    expect(hashSdkKey(key.plaintext)).toBe(hashSdkKey(key.plaintext))
  })
})
