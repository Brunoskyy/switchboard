import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { z } from 'zod'

import { PermissionError } from '@/server/tenancy/scope'

export interface ActionResult {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

/**
 * Turns a thrown error into a result the form can render.
 *
 * Permission and validation failures are expected outcomes and get a useful
 * message; anything else is a bug, so it is logged server-side under `source`
 * and the client gets a generic string rather than a stack trace.
 */
export function toResult(error: unknown, source: string): ActionResult {
  // `redirect()` and `notFound()` work by throwing. Without this, an expired
  // session would be caught here and shown as "something went wrong" forever
  // instead of sending the user to the login page.
  unstable_rethrow(error)

  if (error instanceof PermissionError) return { ok: false, error: error.message }
  if (error instanceof z.ZodError) {
    return { ok: false, fieldErrors: z.flattenError(error).fieldErrors }
  }
  console.error(`[${source}]`, error)
  return { ok: false, error: 'Something went wrong. Please try again.' }
}
