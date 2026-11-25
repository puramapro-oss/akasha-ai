export const TIME_MARGINS = [5, 15, 30, 60] as const
export type TimeMargin = typeof TIME_MARGINS[number]

const DAY = 86_400 // All arithmetic below uses integer seconds.
const FORMATTER_LIMIT = 16
const formatters = new Map<string, Intl.DateTimeFormat>()

function zoneFormatter(zone: string): Intl.DateTimeFormat {
  if (typeof zone !== 'string' || zone.length > 100 || !/^[A-Za-z][A-Za-z0-9_+./-]*$/.test(zone)) {
    throw new RangeError('Fuseau horaire IANA invalide.')
  }
  const cached = formatters.get(zone)
  if (cached) return cached
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
  } catch (error) {
    if (error instanceof RangeError) throw new RangeError('Fuseau horaire IANA inconnu sur cet appareil.')
    throw error
  }
  if (formatters.size >= FORMATTER_LIMIT) {
    const oldest = formatters.keys().next()
    if (!oldest.done) formatters.delete(oldest.value)
  }
  formatters.set(zone, formatter)
  return formatter
}

function offsetAt(formatter: Intl.DateTimeFormat, instant: number): number {
  const label = formatter.formatToParts(instant * 1000).find(part => part.type === 'timeZoneName')?.value
  if (label === 'GMT' || label === 'UTC') return 0
  const match = /^(?:GMT|UTC)([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(label ?? '')
  if (!match) throw new RangeError('Décalage du fuseau horaire illisible.')
  const seconds = Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4] ?? 0)
  return match[1] === '-' ? -seconds : seconds
}

type Interval = { start: number; end: number }

// Each stretch of constant offset maps UTC to civil time by simple addition.
// Six-hour probes separate tzdb transitions in the supported years. Locate each
// clock change to the second; older offsets need not be whole minutes.
function matchingIntervals(formatter: Intl.DateTimeFormat, start: number, end: number): Interval[] {
  const matches: Interval[] = []
  const limit = end + DAY
  let segment = start - DAY
  let offset = offsetAt(formatter, segment)
  function intersect(segmentEnd: number) {
    const from = Math.max(segment, start - offset)
    const to = Math.min(segmentEnd, end - offset)
    if (from < to) matches.push({ start: from, end: to })
  }
  for (let probe = segment; probe < limit;) {
    const next = Math.min(probe + DAY / 4, limit)
    const nextOffset = offsetAt(formatter, next)
    if (nextOffset !== offset) {
      let left = probe
      let right = next
      while (right - left > 1) {
        const middle = Math.floor((left + right) / 2)
        if (offsetAt(formatter, middle) === offset) left = middle
        else right = middle
      }
      intersect(right)
      segment = right
      offset = nextOffset
    }
    probe = next
  }
  intersect(limit)
  return matches
}

type NatalTimeResult =
  | { kind: 'exact' | 'ambiguous' | 'gap'; instants: Date[] }
  | { kind: 'day'; instants: Date[]; intervals: { start: Date; end: Date }[] }

/**
 * Resolve a Gregorian date in 1900–2100 using the host's IANA timezone data.
 * A clock reading (HH:mm or HH:mm:ss) returns all matches, earlier first.
 * For an empty time, instants retains the outer bounds for existing callers.
 * Intervals contain exactly the UTC stretches belonging to that local date
 * (inclusive start, exclusive end). A skipped date or time returns no matches.
 */
export function resolveNatalTime(date: string, time: string, zone: string): NatalTimeResult {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError('Date attendue au format AAAA-MM-JJ.')
  }
  const [year, month, day] = date.split('-').map(Number)
  const midnight = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || year > 2100 || midnight.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Date de naissance invalide ou hors de la plage 1900–2100.')
  }
  let start = midnight.getTime() / 1000
  if (time !== '') {
    const clock = typeof time === 'string' && /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(time)
    if (!clock) throw new RangeError('Heure attendue au format HH:mm ou HH:mm:ss.')
    start += Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0)
  }
  const matches = matchingIntervals(zoneFormatter(zone), start, start + (time === '' ? DAY : 1))
  if (!matches.length) return { kind: 'gap', instants: [] }
  if (time === '') {
    const intervals: { start: Date; end: Date }[] = []
    for (const match of matches) {
      const previous = intervals.at(-1)
      const end = new Date(match.end * 1000)
      if (previous && previous.end.getTime() === match.start * 1000) previous.end = end
      else intervals.push({ start: new Date(match.start * 1000), end })
    }
    return { kind: 'day', instants: [intervals[0].start, intervals[intervals.length - 1].end], intervals }
  }
  return {
    kind: matches.length === 1 ? 'exact' : 'ambiguous',
    instants: matches.map(interval => new Date(interval.start * 1000)),
  }
}
