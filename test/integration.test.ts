import { describe, expect, it } from 'vitest'
import { buildEncounterItemsLookup, extractGameDataVersion } from '../src/lookup/encounterItems'
import { normalizeRaidbotsReport, type RaidbotsRawReport } from '../src/normalize/raidbots'
import { normalizeQELiveReport, parseQELiveResponseBody } from '../src/normalize/qelive'
import type { EncounterItemEntry, InstanceEntry } from '../src/types'

// Hits the real Raidbots and QE Live APIs plus the real Raidbots static-data
// lookup. Only runs when explicitly requested (npm run test:live) so normal
// `npm test` stays hermetic and offline.
const RUN_LIVE = process.env.RUN_LIVE === '1'

const RAIDBOTS_REPORT_ID = 'jk6WmLFEnBpEqWueDkyRqA'
const QELIVE_REPORT_ID = 'wzfyzqxqjqej'

async function fetchLiveLookup() {
  const homepage = await fetch('https://www.raidbots.com/')
  const html = await homepage.text()
  const hash = extractGameDataVersion(html)
  if (!hash) throw new Error('Could not discover Raidbots gameDataVersion from live homepage')

  const [items, instances, encounterNames, instanceNames] = await Promise.all([
    fetch(`https://www.raidbots.com/static/data/${hash}/encounter-items.json`).then((r) => r.json() as Promise<EncounterItemEntry[]>),
    fetch(`https://www.raidbots.com/static/data/${hash}/instances.json`).then((r) => r.json() as Promise<InstanceEntry[]>),
    fetch(`https://www.raidbots.com/static/data/${hash}/encounter-names.json`).then((r) => r.json() as Promise<Record<string, string>>),
    fetch(`https://www.raidbots.com/static/data/${hash}/instance-names.json`).then((r) => r.json() as Promise<Record<string, string>>),
  ])

  return buildEncounterItemsLookup(items, instances, encounterNames, instanceNames)
}

describe.skipIf(!RUN_LIVE)('live integration', () => {
  it('normalizes a real Raidbots droptimizer report', async () => {
    const res = await fetch(`https://www.raidbots.com/reports/${RAIDBOTS_REPORT_ID}/data.json`)
    expect(res.ok).toBe(true)
    const raw = (await res.json()) as RaidbotsRawReport
    const lookup = await fetchLiveLookup()

    const result = normalizeRaidbotsReport(RAIDBOTS_REPORT_ID, raw, lookup)

    const top3 = [...result.items].sort((a, b) => b.pct - a.pct).slice(0, 3)
    console.log('[raidbots] baseline:', result.baseline)
    console.log('[raidbots] item count:', result.items.length)
    console.log('[raidbots] encounter count:', new Set(result.items.map((i) => i.encounterId)).size)
    console.log('[raidbots] top 3 by pct:', top3.map((i) => `${i.name} (${i.pct.toFixed(2)}%)`))

    expect(result.baseline).toBeGreaterThan(0)
    expect(result.items.length).toBeGreaterThan(0)
  })

  it('normalizes a real QE Live upgrade report', async () => {
    const res = await fetch(`https://questionablyepic.com/api/getUpgradeReport.php?reportID=${QELIVE_REPORT_ID}`)
    expect(res.ok).toBe(true)
    const bodyText = await res.text()
    const raw = parseQELiveResponseBody(bodyText)
    const lookup = await fetchLiveLookup()

    const result = normalizeQELiveReport(QELIVE_REPORT_ID, raw, lookup)

    const top3 = [...result.items].sort((a, b) => b.pct - a.pct).slice(0, 3)
    console.log('[qelive] baseline:', result.baseline)
    console.log('[qelive] item count:', result.items.length)
    console.log('[qelive] top 3 by pct:', top3.map((i) => `${i.name} (${i.pct.toFixed(2)}%)`))

    expect(result.items.length).toBeGreaterThan(0)
  })
})
