import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * SDK keys are hashed with SHA-256, not bcrypt.
 *
 * bcrypt exists to make *low-entropy* secrets — passwords people choose —
 * expensive to brute force. A key generated here carries 256 bits of entropy
 * from a CSPRNG, so there is nothing to brute force, and a deliberately slow
 * hash would only tax every SDK request. The same reasoning is why passwords
 * in this app do use bcrypt: see src/server/auth/password.ts.
 */
const KEY_BYTES = 32

export interface GeneratedKey {
  /** Shown to the user exactly once. */
  plaintext: string
  /** Stored, so the key can be recognised in a list without revealing it. */
  prefix: string
  hashedKey: string
}

export function generateSdkKey(environmentKey: string): GeneratedKey {
  const scope = environmentKey.slice(0, 4).toLowerCase().replace(/[^a-z]/g, '') || 'env'
  const secret = randomBytes(KEY_BYTES).toString('base64url')
  const plaintext = `sb_${scope}_${secret}`

  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    hashedKey: hashSdkKey(plaintext),
  }
}

export function hashSdkKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/** Constant-time comparison, so a failed match leaks nothing through timing. */
export function sdkKeyMatches(plaintext: string, hashedKey: string): boolean {
  const candidate = Buffer.from(hashSdkKey(plaintext), 'hex')
  const expected = Buffer.from(hashedKey, 'hex')

  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}
