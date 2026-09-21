import { describe, expect, it } from 'vitest'
import { detectSource, friendlyReportMismatch } from '../src/lib/urlDetect'

describe('detectSource', () => {
  it('detects Raidbots from a full report URL', () => {
    expect(detectSource('https://www.raidbots.com/reports/jk6WmLFEnBpEqWueDkyRqA')).toBe('raidbots')
  })

  it('detects Raidbots from a bare hostname without www', () => {
    expect(detectSource('https://raidbots.com/reports/jk6WmLFEnBpEqWueDkyRqA')).toBe('raidbots')
  })

  it('detects QE Live from a full report URL', () => {
    expect(detectSource('https://questionablyepic.com/live/upgrade-report/wzfyzqxqjqej')).toBe('qelive')
  })

  it('detects Raidbots from a bare 22-character id', () => {
    expect(detectSource('jk6WmLFEnBpEqWueDkyRqA')).toBe('raidbots')
  })

  it('detects QE Live from a bare 12-letter id', () => {
    expect(detectSource('wzfyzqxqjqej')).toBe('qelive')
  })

  it('returns null for an unrecognized hostname', () => {
    expect(detectSource('https://example.com/reports/jk6WmLFEnBpEqWueDkyRqA')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(detectSource('')).toBeNull()
    expect(detectSource('   ')).toBeNull()
  })

  it('returns null for garbage input that is not a URL or a valid bare id', () => {
    expect(detectSource('not a url and not an id')).toBeNull()
  })
})

describe('friendlyReportMismatch', () => {
  it('flags a Top Gear ("optimize") report pasted into the main sim report field', () => {
    expect(friendlyReportMismatch('Unsupported simType: optimize (expected "droptimizer")', 'sim')).toBe(
      "That's a Top Gear report; paste a Raidbots droptimizer or QE Live report."
    )
  })

  it('flags a droptimizer report pasted into the Top Gear field', () => {
    expect(friendlyReportMismatch('Unsupported simType: droptimizer (expected a Raidbots Top Gear "optimize" report)', 'topgear')).toBe(
      "That's a droptimizer; paste a Top Gear report."
    )
  })

  it('returns null for an unrelated error detail', () => {
    expect(friendlyReportMismatch('Failed to fetch report: 404', 'sim')).toBeNull()
  })

  it('returns null when the simType in the detail does not indicate a cross-field paste', () => {
    expect(friendlyReportMismatch('Unsupported simType: raidSummary (expected "droptimizer")', 'sim')).toBeNull()
  })
})
