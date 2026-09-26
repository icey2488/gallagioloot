import { describe, expect, it } from 'vitest'
import { normalizeReportUrl } from '../src/lib/reportUrl'
import { addRow, checkRows, MAX_REPORT_ROWS, removeRow, type ReportRow } from '../src/lib/reportRows'

const RB = '6PTZ7TjgU8PdxJhZ97bMUa'
const RB2 = 'a8URThoNZqEXDW3tBtavHq'
const QE = 'wzfyzqxqjqej'

describe('normalizeReportUrl', () => {
  it('trims, ignores host case, trailing slash, query string and fragment', () => {
    expect(normalizeReportUrl(`  HTTPS://WWW.Raidbots.com/simbot/report/${RB}/?x=1#top `)).toBe(`raidbots:${RB}`)
    expect(normalizeReportUrl(`https://www.raidbots.com/simbot/report/${RB}`)).toBe(`raidbots:${RB}`)
    expect(normalizeReportUrl(`https://raidbots.com/reports/${RB}/`)).toBe(`raidbots:${RB}`)
    expect(normalizeReportUrl(`https://www.raidbots.com/simbot/report/${RB}#x`)).toBe(`raidbots:${RB}`)
  })

  it('recognizes QE Live urls and bare ids of both kinds', () => {
    expect(normalizeReportUrl(`https://questionablyepic.com/live/upgradereport/${QE}`)).toBe(`qelive:${QE}`)
    expect(normalizeReportUrl(`https://QuestionablyEpic.com/live/upgradereport/${QE}/?a=b`)).toBe(`qelive:${QE}`)
    expect(normalizeReportUrl(RB)).toBe(`raidbots:${RB}`)
    expect(normalizeReportUrl(` ${QE} `)).toBe(`qelive:${QE}`)
  })

  it('keeps the id case (Raidbots ids are case-sensitive)', () => {
    expect(normalizeReportUrl(`https://www.raidbots.com/simbot/report/${RB}`)).not.toBe(normalizeReportUrl(`https://www.raidbots.com/simbot/report/${RB.toLowerCase()}`))
  })

  it('takes the last valid id segment in the path, not one in the query', () => {
    expect(normalizeReportUrl(`https://www.raidbots.com/reports/${RB2}/${RB}`)).toBe(`raidbots:${RB}`)
    expect(normalizeReportUrl(`https://www.raidbots.com/simbot/report/${RB}?ref=${RB2}`)).toBe(`raidbots:${RB}`)
  })

  it('returns null for empty input, foreign hosts, hosts without an id, and junk', () => {
    expect(normalizeReportUrl('')).toBeNull()
    expect(normalizeReportUrl('   ')).toBeNull()
    expect(normalizeReportUrl(`https://example.com/${RB}`)).toBeNull()
    expect(normalizeReportUrl(`https://notraidbots.com/${RB}`)).toBeNull()
    expect(normalizeReportUrl('https://www.raidbots.com/simbot')).toBeNull()
    expect(normalizeReportUrl('not a report')).toBeNull()
    expect(normalizeReportUrl(`https://questionablyepic.com/live/upgradereport/${RB}`)).toBeNull()
  })
})

describe('report rows: add / remove / cap', () => {
  const one: ReportRow[] = [{ id: 0, url: '' }]

  it('adds empty rows up to the cap of 8, then is a no-op', () => {
    let rows = one
    for (let i = 1; i < MAX_REPORT_ROWS; i++) rows = addRow(rows, i)
    expect(rows).toHaveLength(8)
    expect(addRow(rows, 99)).toBe(rows)
    expect(MAX_REPORT_ROWS).toBe(8)
  })

  it('removes a row by id but never the last one', () => {
    const rows = addRow(addRow(one, 1), 2)
    expect(removeRow(rows, 1).map((r) => r.id)).toEqual([0, 2])
    expect(removeRow(one, 0)).toBe(one)
  })
})

describe('checkRows: duplicates', () => {
  const row = (id: number, url: string): ReportRow => ({ id, url })
  const none = new Set<string>()

  it('flags the later of two rows naming the same report, however it is spelled', () => {
    const errors = checkRows([row(0, `https://www.raidbots.com/simbot/report/${RB}`), row(1, `https://WWW.RAIDBOTS.COM/reports/${RB}/?x=1`)], none)
    expect(errors).toEqual({ 1: 'Duplicate of row 1' })
  })

  it('numbers the earlier row by position, counting empty rows, and flags every later copy', () => {
    const errors = checkRows([row(5, ''), row(6, RB), row(7, RB2), row(8, RB), row(9, ` ${RB} `)], none)
    expect(errors).toEqual({ 8: 'Duplicate of row 2', 9: 'Duplicate of row 2' })
  })

  it('flags a row whose report is already loaded', () => {
    const errors = checkRows([row(0, RB), row(1, RB2)], new Set([`raidbots:${RB}`]))
    expect(errors).toEqual({ 0: 'Already loaded' })
  })

  it('an already-loaded report wins over a duplicate label, and later copies are still errors', () => {
    const errors = checkRows([row(0, RB), row(1, RB)], new Set([`raidbots:${RB}`]))
    expect(errors[0]).toBe('Already loaded')
    expect(errors[1]).toBe('Already loaded')
  })

  it('ignores empty and unrecognized rows, and the same id on a different source is not a duplicate', () => {
    const errors = checkRows([row(0, ''), row(1, 'junk'), row(2, 'junk'), row(3, RB), row(4, QE)], none)
    expect(errors).toEqual({})
  })
})
