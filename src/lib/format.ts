const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
]

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/**
 * "3 hours ago". Rendered on the server, so it is the server clock that wins —
 * close enough at these granularities, and it avoids a hydration mismatch from
 * the two clocks disagreeing by a second.
 */
export function formatRelative(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime()

  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return relative.format(-Math.round(elapsed / ms), unit)
    }
  }

  return 'just now'
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}
