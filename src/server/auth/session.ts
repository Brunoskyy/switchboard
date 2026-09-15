import 'server-only'

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'sb_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export interface SessionPayload {
  userId: string
  email: string
}

/**
 * Sessions are stateless JWTs in an httpOnly cookie rather than rows in a
 * Session table.
 *
 * Tradeoff, stated plainly: this buys edge-compatible middleware and no DB
 * round trip per request, and costs the ability to revoke a single session
 * before it expires. The window is capped at 7 days. A product that needs
 * "sign out everywhere" should add a `tokenVersion` column on User and check
 * it here — that is the smallest change that restores revocation.
 */
function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET
  if (!value || value.length < 16) {
    throw new Error('AUTH_SECRET is missing or too short. Generate one: openssl rand -base64 32')
  }
  return new TextEncoder().encode(value)
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret())

  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secret())
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null
    return { userId: payload.userId, email: payload.email }
  } catch {
    // Expired, tampered with, or signed by a rotated secret — all mean "no session".
    return null
  }
}

export async function destroySession(): Promise<void> {
  ;(await cookies()).delete(COOKIE_NAME)
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
