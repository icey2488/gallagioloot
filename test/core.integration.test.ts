import { describe, expect, it } from 'vitest'
import { buildEncounterItemsLookup, extractGameDataVersion } from '../src/lookup/encounterItems'
import { normalizeRaidbotsReport, type RaidbotsRawReport } from '../src/normalize/raidbots'
import { normalizeQELiveReport, parseQELiveResponseBody } from '../src/normalize/qelive'
import { buildBossPools } from '../src/core/pool'
import { recommend } from '../src/core/rank'
import { createState } from '../src/core/knockout'
import { compareVault } from '../src/core/vault'
import { buildLootTable } from '../src/lookup/lootTable'
import type { BossEval, Settings } from '../src/core/types'
import type { EncounterItemsLookup, NormalizedReport, EncounterItemEntry, InstanceEntry, WeaponSpecEntry } from '../src/types'

// Hits the real Raidbots and QE Live APIs. Only runs when explicitly requested
// (npm run test:live) so normal `npm test` stays hermetic and offline.
const RUN_LIVE = process.env.RUN_LIVE === '1'

const RAIDBOTS_REPORT_ID = 'jk6WmLFEnBpEqWueDkyRqA'
const QELIVE_REPORT_ID = 'wzfyzqxqjqej'

async function fetchLiveLookup() {
  const homepage = await fetch('https://www.raidbots.com/')
  const html = await homepage.text()
  const hash = extractGameDataVersion(html)
  if (!hash) throw new Error('Could not discover Raidbots gameDataVersion from live homepage')

  const [items, instances, encounterNames, instanceNames, weaponSpecs] = await Promise.all([
    fetch(`https://www.raidbots.com/static/data/${hash}/encounter-items.json`).then((r) => r.json() as Promise<EncounterItemEntry[]>),
    fetch(`https://www.raidbots.com/static/data/${hash}/instances.json`).then((r) => r.json() as Promise<InstanceEntry[]>),
    fetch(`https://www.raidbots.com/static/data/${hash}/encounter-names.json`).then((r) => r.json() as Promise<Record<string, string>>),
    fetch(`https://www.raidbots.com/static/data/${hash}/instance-names.json`).then((r) => r.json() as Promise<Record<string, string>>),
    fetch(`https://www.raidbots.com/static/data/${hash}/weapon-specs.json`).then((r) => r.json() as Promise<WeaponSpecEntry[]>),
  ])

  return buildEncounterItemsLookup(items, instances, encounterNames, instanceNames, weaponSpecs)
}

function printReportTable(label: string, report: NormalizedReport, voidcoresToSpend: 1 | 2, lookup: EncounterItemsLookup) {
  const settings: Settings = { thresholdPct: 0.2, voidcoresToSpend, includeOffSpec: false, lootSpecId: report.lootSpecId }
  const knockout = createState(report.character, report.difficulty, report.realm, report.region)

  const bossEvalsReportOnly = buildBossPools(report, knockout, settings)

  const lootTableEncounters =
    report.instanceId && report.lootSpecId ? buildLootTable(report.instanceId, report.lootSpecId, lookup) : undefined
  const bossEvals = lootTableEncounters ? buildBossPools(report, knockout, settings, lootTableEncounters) : bossEvalsReportOnly
  const recommendation = recommend(bossEvals, settings, report)

  console.log(`\n[${label}] rolls=${voidcoresToSpend} -- own loot spec: ${report.lootSpecId} -- per-boss pool size before (report only) vs after (full loot table)`)
  console.table(
    bossEvalsReportOnly.map((b) => {
      const after = bossEvals.find((a) => a.encounterId === b.encounterId)
      return {
        encounter: b.encounterName,
        'pool size before': b.pool.length,
        'pool size after': after?.pool.length ?? b.pool.length,
        'ev% before': b.evPct.toFixed(3),
        'ev% after': (after?.evPct ?? b.evPct).toFixed(3),
      }
    })
  )

  console.log(`\n[${label}] rolls=${voidcoresToSpend} -- per-boss table (full loot table applied)`)
  console.table(
    bossEvals.map((b) => ({
      encounter: b.encounterName,
      remaining: b.remaining,
      'ev%': b.evPct.toFixed(3),
      bestCase: b.bestCase?.name ?? '-',
      'rollsToTarget(bestCase) exp/worst/trunc': b.bestCase
        ? `${b.bestCase.rollsToTargetExpected?.toFixed(2)} / ${b.bestCase.rollsToTargetWorst} / ${b.bestCase.rollsToTargetTruncated?.toFixed(2)}`
        : '-',
      deployable: b.deployable,
    }))
  )
  console.log(`[${label}] rolls=${voidcoresToSpend} -- recommendation:`, JSON.stringify(recommendation, null, 2))

  if (voidcoresToSpend === 1) {
    const topBoss = [...bossEvals].filter((b) => b.deployable).sort((a, b) => b.ev - a.ev)[0] as BossEval | undefined
    if (topBoss?.bestCase) {
      const vaultDecision = compareVault({
        vaultItem: { name: `Made-up Vault Item (from ${topBoss.encounterName})`, gainPct: 3.0, itemId: topBoss.bestCase.itemIds[0] },
        bossEvals,
        recommendation,
        settings,
        report,
      })
      console.log(`[${label}] compareVault example (vault item attributed to top boss "${topBoss.encounterName}", gainPct 3.0):`, JSON.stringify(vaultDecision, null, 2))
    }
  }

  return { bossEvals, recommendation }
}

describe.skipIf(!RUN_LIVE)('core decision engine (live)', () => {
  it('evaluates pools and recommendations for a real Raidbots droptimizer report', async () => {
    const res = await fetch(`https://www.raidbots.com/reports/${RAIDBOTS_REPORT_ID}/data.json`)
    expect(res.ok).toBe(true)
    const raw = (await res.json()) as RaidbotsRawReport
    const lookup = await fetchLiveLookup()
    const report = normalizeRaidbotsReport(RAIDBOTS_REPORT_ID, raw, lookup)

    const { bossEvals: bossEvals1, recommendation: rec1 } = printReportTable('raidbots', report, 1, lookup)
    const { recommendation: rec2 } = printReportTable('raidbots', report, 2, lookup)

    expect(bossEvals1.length).toBeGreaterThan(0)
    expect(rec1.assumptions.length).toBeGreaterThan(0)
    expect(rec2.assumptions.length).toBeGreaterThan(0)
  })

  it('evaluates pools and recommendations for a real QE Live upgrade report', async () => {
    const res = await fetch(`https://questionablyepic.com/api/getUpgradeReport.php?reportID=${QELIVE_REPORT_ID}`)
    expect(res.ok).toBe(true)
    const bodyText = await res.text()
    const raw = parseQELiveResponseBody(bodyText)
    const lookup = await fetchLiveLookup()
    const report = normalizeQELiveReport(QELIVE_REPORT_ID, raw, lookup, new Map())

    const { bossEvals: bossEvals1, recommendation: rec1 } = printReportTable('qelive', report, 1, lookup)
    const { recommendation: rec2 } = printReportTable('qelive', report, 2, lookup)

    expect(bossEvals1.length).toBeGreaterThan(0)
    expect(rec1.assumptions.length).toBeGreaterThan(0)
    expect(rec2.assumptions.length).toBeGreaterThan(0)
  })
})
