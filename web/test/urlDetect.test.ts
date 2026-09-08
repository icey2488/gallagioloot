import { describe, expect, it } from 'vitest'
import { detectSource } from '../src/lib/urlDetect'

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
