import { describe, expect, it } from 'vitest'
import { formatBaseline, formatSimDate } from '../src/lib/format'

describe('formatSimDate', () => {
  const now = new Date('2026-09-25T12:00:00Z')

  it('prints the month and day in the given timezone', () => {
    expect(formatSimDate('2026-09-22T20:14:38.000Z', now, 'America/Los_Angeles')).toBe('Sep 22')
    // The M+ report was written 01:39 UTC on the 25th: still the 24th in US Pacific, already the 25th in UTC.
    expect(formatSimDate('2026-09-25T01:39:28.000Z', now, 'America/Los_Angeles')).toBe('Sep 24')
    expect(formatSimDate('2026-09-25T01:39:28.000Z', now, 'UTC')).toBe('Sep 25')
  })

  it("adds the year when it isn't the current one", () => {
    expect(formatSimDate('2025-12-30T12:00:00.000Z', now, 'UTC')).toBe('Dec 30, 2025')
  })

  it('is undefined for a missing or invalid date', () => {
    expect(formatSimDate(undefined, now)).toBeUndefined()
    expect(formatSimDate('nope', now)).toBeUndefined()
  })
})

describe('formatBaseline', () => {
  it('rounds and adds thousands separators', () => {
    expect(formatBaseline(572816.6281)).toBe('572,817')
    expect(formatBaseline(950)).toBe('950')
  })
})
