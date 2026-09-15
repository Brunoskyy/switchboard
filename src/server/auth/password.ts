import 'server-only'

import bcrypt from 'bcryptjs'

/**
 * Cost 12 is ~250ms on a modern server — slow enough to make offline cracking
 * expensive, fast enough that login does not feel broken. Revisit if hardware
 * moves; the hash records its own cost, so raising it stays backward compatible.
 */
const COST = 12

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
