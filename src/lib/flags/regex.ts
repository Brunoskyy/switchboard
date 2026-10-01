/**
 * Guards for `matches` conditions.
 *
 * Patterns are authored by org admins in the dashboard, never by end users, so
 * the threat model is a careless teammate rather than an attacker. Still, a
 * catastrophically backtracking pattern would stall evaluation for everyone in
 * the environment, and JavaScript's RegExp has no timeout. A hard one would
 * need a worker per evaluation, so instead the shapes that backtrack
 * exponentially are refused, and the input is bounded so that what remains —
 * at worst polynomial, like `.*.*=` — stays cheap.
 *
 * The schema rejects unsafe patterns on write. The evaluator runs the same
 * check, so a config saved before the check existed fails closed instead of
 * hanging.
 */

/** Longest pattern we will compile. */
export const MAX_PATTERN_LENGTH = 512

/** Longest attribute value a pattern is run against; longer fails closed. */
export const MAX_MATCH_INPUT_LENGTH = 1024

/**
 * True when a group that contains a variable quantifier is itself repeated —
 * `(a+)+`, `(\w*)*`, `(?:x+y?){2,}` — the shape behind nearly every
 * catastrophic-backtracking report.
 *
 * A heuristic, not a proof: it reads the pattern's structure, not the language
 * it matches, so overlapping alternation like `(a|a)+` gets through. It errs
 * towards allowing; `(\d{3})+` is fine because an exact `{3}` cannot be
 * split two ways.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  // One entry per open group: whether it contains a variable quantifier.
  const groups: boolean[] = []
  let inClass = false
  let closedRepeatableGroup = false

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    const followsRepeatableGroup = closedRepeatableGroup
    closedRepeatableGroup = false

    if (ch === '\\') {
      i++
      continue
    }
    if (inClass) {
      if (ch === ']') inClass = false
      continue
    }
    if (ch === '[') {
      inClass = true
      continue
    }
    if (ch === '(') {
      groups.push(false)
      continue
    }
    if (ch === ')') {
      const hadQuantifier = groups.pop() ?? false
      closedRepeatableGroup = hadQuantifier
      // The enclosing group now contains a quantified piece too.
      if (hadQuantifier && groups.length > 0) groups[groups.length - 1] = true
      continue
    }

    const quantifier = variableQuantifierAt(pattern, i)
    if (quantifier === 0) continue

    if (followsRepeatableGroup) return true
    if (groups.length > 0) groups[groups.length - 1] = true
    i += quantifier - 1
  }

  return false
}

/**
 * Length of the quantifier at `i` if it can match a varying number of times
 * (`*`, `+`, `{n,}`, `{n,m}` with m > n), else 0. `?` is left out: it repeats
 * at most once, so nesting it cannot multiply the ways to match.
 */
function variableQuantifierAt(pattern: string, i: number): number {
  const ch = pattern[i]
  if (ch === '*' || ch === '+') return 1
  if (ch !== '{') return 0

  const braces = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i))
  if (!braces) return 0

  const [whole, min, comma, max] = braces
  if (!comma) return 0
  if (max !== '' && Number(max) <= Number(min)) return 0
  return whole.length
}

/** Why a pattern cannot be used, or null when it can. */
export function patternProblem(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `Regex patterns are capped at ${MAX_PATTERN_LENGTH} characters`
  }
  try {
    new RegExp(pattern)
  } catch {
    return 'Not a valid regular expression'
  }
  if (hasNestedQuantifier(pattern)) {
    return 'Repeating a group that already repeats, like (a+)+, can hang evaluation'
  }
  return null
}
