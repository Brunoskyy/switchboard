import type { AttributeValue } from './types'

/**
 * Turns what was typed into a condition's value box into the value saved.
 *
 * Numbers stay numbers so `gt`/`lt` compare numerically, not lexically — but
 * only when the text is exactly how that number prints. "02134" is a zip code,
 * not 2134, and "1e3" or "0x10" are almost certainly not meant as 1000 and 16;
 * converting them would save something the user never typed. Equality does not
 * depend on the choice either way: the evaluator treats `12345` and `"12345"`
 * as equal.
 */
export function coerceValue(raw: string): AttributeValue {
  if (raw === 'true') return true
  if (raw === 'false') return false

  const asNumber = Number(raw)
  return raw.trim() !== '' && String(asNumber) === raw ? asNumber : raw
}

/** Comma-separated input for the set-membership operators. */
export function parseValueList(raw: string): AttributeValue[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(coerceValue)
}
