import type { Rollout } from './types'

/**
 * Helpers for deciding what actually changed in a flag config, so the audit
 * log records the right action and a diff someone can read.
 *
 * Pure and separate from the server action because the comparison has two
 * traps that are worth pinning down with tests: Postgres `jsonb` does not
 * preserve key order (it normalises on write), so the rules read back never
 * serialise the way the client sent them; and condition ids are minted by the
 * editor, so they differ between a saved config and the payload that edits it.
 * Miss either and every save looks like a rules change.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'id')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonical(nested)]),
    )
  }

  return value
}

/**
 * A string that is equal for two rule sets with the same meaning.
 *
 * Ids are dropped at every level. Rule order is not: it decides which rule
 * wins, so reordering is a real change — and it shows up as a different array,
 * not different keys.
 */
export function rulesFingerprint(rules: unknown): string {
  if (!Array.isArray(rules)) return '[]'
  return JSON.stringify(canonical(rules))
}

/** "25% on · 75% off", for a diff a human can read. Null when there is none. */
export function describeRollout(rollout: Rollout | null | undefined): string | null {
  if (!rollout || !Array.isArray(rollout.buckets) || rollout.buckets.length === 0) return null

  const serving = rollout.buckets
    .filter((bucket) => bucket.weight > 0)
    .map((bucket) => `${bucket.weight}% ${bucket.variantKey}`)

  return serving.length > 0 ? serving.join(' · ') : null
}

export interface TargetingSnapshot {
  rules: unknown
  rollout: Rollout | null
  defaultVariantKey: string | null
  offVariantKey: string | null
}

export interface TargetingChange {
  /** Nothing a reader would notice moved, so there is nothing to audit. */
  unchanged: boolean
  /** True when the rollout split is the only thing that moved. */
  rolloutOnly: boolean
  diff: Record<string, { from: string | number | null; to: string | number | null }>
}

/**
 * Everything a targeting save changed, as `{ field: { from, to } }`.
 *
 * The default and off variants belong in here too. Leaving them out recorded
 * a "changed targeting" event with an empty diff whenever one of them was the
 * only edit, so the log said something happened and nothing about what.
 */
export function describeTargetingChange(
  previous: TargetingSnapshot | null,
  next: TargetingSnapshot,
): TargetingChange {
  const diff: TargetingChange['diff'] = {}

  if (rulesFingerprint(previous?.rules) !== rulesFingerprint(next.rules)) {
    const count = (rules: unknown) => (Array.isArray(rules) ? rules.length : 0)
    diff.rules = { from: count(previous?.rules), to: count(next.rules) }
  }

  const fromRollout = describeRollout(previous?.rollout)
  const toRollout = describeRollout(next.rollout)
  if (fromRollout !== toRollout) diff.rollout = { from: fromRollout, to: toRollout }

  const fromDefault = previous?.defaultVariantKey ?? null
  if (fromDefault !== next.defaultVariantKey) {
    diff.defaultVariant = { from: fromDefault, to: next.defaultVariantKey }
  }

  const fromOff = previous?.offVariantKey ?? null
  if (fromOff !== next.offVariantKey) {
    diff.offVariant = { from: fromOff, to: next.offVariantKey }
  }

  const fields = Object.keys(diff)
  return {
    unchanged: fields.length === 0,
    rolloutOnly: fields.length === 1 && fields[0] === 'rollout',
    diff,
  }
}
