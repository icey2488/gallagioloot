import { describe, expect, it } from 'vitest'
import { buildEncounterItemsLookup, extractGameDataVersion } from '../src/lookup/encounterItems'
import { extractLearnedTierData, getLearnedTierData, mergeLearnedTierData, saveLearnedTierData, type LearnedTierData } from '../src/lookup/tierLearned'
import { getSeedTierMap } from '../src/lookup/tierSeed'
import { normalizeRaidbotsReport, type RaidbotsRawReport } from '../src/normalize/raidbots'
import { normalizeQELiveReport, parseQELiveResponseBody } from '../src/normalize/qelive'
import { normalizeTopGearReport, type RaidbotsTopGearRawReport } from '../src/normalize/topgear'
import type { EncounterItemEntry, InstanceEntry } from '../src/types'
import type { LookupEnv } from '../src/lookup/encounterItems'

// Hits the real Raidbots and QE Live APIs plus the real Raidbots static-data
// lookup. Only runs when explicitly requested (npm run test:live) so normal
// `npm test` stays hermetic and offline.
const RUN_LIVE = process.env.RUN_LIVE === '1'

const RAIDBOTS_REPORT_ID = 'jk6WmLFEnBpEqWueDkyRqA'
const QELIVE_REPORT_ID = 'wzfyzqxqjqej'
const TOPGEAR_REPORT_ID = 'miriTcb27bfGDYmV6JjvD1'
// A live droptimizer run against "Epic Profession Items" (crafted gear) -- see
// "Content-type classification" in README.md. Bonus rolls don't apply to crafted gear.
const CRAFTED_REPORT_ID = '9QDMaj22bvRDSvbCzjsHfQ'
const PROXY_BASE_URL = process.env.PROXY_BASE_URL || 'https://gallagioloot-proxy.icehunter.net'

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
  it('normalizes a real Raidbots droptimizer report and learns tier-boss mappings for /tier-map', async () => {
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
    // Item count should be unchanged by the tier-mapping work: this report's profileset
    // rows already carry real per-boss encounter ids (no aggregate/-100 rows), so none
    // of them hit the new tier-fallback path.
    expect(result.items.length).toBe(51)

    // Simulate what handleRaidbots/handleTierMap in src/index.ts do with this report:
    // extract + persist the learned tier data, then read back the merged seed+learned
    // /tier-map/1320 view (using an in-memory env, since this test doesn't run the
    // actual Worker HTTP server -- same pure functions the endpoint is built from).
    const instanceId = raw.simbot.meta.rawFormData.droptimizer.instance
    expect(instanceId).toBe(1320)
    const env: LookupEnv = {}
    const learnedUpdate = extractLearnedTierData(raw, instanceId)
    await saveLearnedTierData(env, instanceId, learnedUpdate)
    const learned = await getLearnedTierData(env, instanceId)
    const tierMap = mergeLearnedTierData({ byItem: {}, bySlot: getSeedTierMap(instanceId) }, learned)

    console.log('[tier-map/1320] bySlot:', tierMap.bySlot)
    console.log('[tier-map/1320] byItem (learned only):', learned.byItem)

    expect(tierMap.bySlot.head).toBeDefined()
    expect(tierMap.bySlot.shoulder).toBeDefined()
    expect(tierMap.bySlot.hands).toBeDefined()
    expect(tierMap.bySlot.legs).toBeDefined()
    if (!tierMap.bySlot.chest) {
      console.log('[tier-map/1320] chest absent from this report (expected per task spec)')
    }
  })

  it('normalizes a real QE Live upgrade report, mapping every raid bonus row (including the 5 tier items via the seed) with zero unmapped items', async () => {
    const res = await fetch(`https://questionablyepic.com/api/getUpgradeReport.php?reportID=${QELIVE_REPORT_ID}`)
    expect(res.ok).toBe(true)
    const bodyText = await res.text()
    const raw = parseQELiveResponseBody(bodyText)
    const lookup = await fetchLiveLookup()

    // No learned cache seeded for this test -- exercises the seed (Layer 1) fallback
    // path on its own, independent of the Raidbots-report test above.
    const learnedByInstance = new Map<number, LearnedTierData>()
    const result = normalizeQELiveReport(QELIVE_REPORT_ID, raw, lookup, learnedByInstance)

    const top3 = [...result.items].sort((a, b) => b.pct - a.pct).slice(0, 3)
    console.log('[qelive] baseline:', result.baseline)
    console.log('[qelive] item count:', result.items.length)
    console.log('[qelive] warnings:', result.warnings)
    console.log('[qelive] top 3 by pct:', top3.map((i) => `${i.name} (${i.pct.toFixed(2)}%)`))

    const TIER_ITEM_IDS = [271481, 271482, 271483, 271484, 271486]
    const tierItems = result.items.filter((i) => TIER_ITEM_IDS.includes(i.itemId))
    console.log(
      '[qelive] tier items:',
      tierItems.map((i) => `${i.name} <- ${i.encounterName} (${i.encounterId})${i.viaCurio ? ' [curio]' : ''}`)
    )

    // The upstream QE Live report's row count drifts over time as Questionably Epic
    // updates it, so assert structurally instead of pinning an exact distinct-item
    // count: a healthy mapping has a reasonable floor of distinct items, resolves
    // across all 8 raid encounters, includes at least one curio-routed row, and
    // leaves zero unmapped items.
    const distinctItemIds = new Set(result.items.map((i) => i.itemId))
    expect(distinctItemIds.size).toBeGreaterThanOrEqual(20)
    expect(new Set(result.items.map((i) => i.encounterId)).size).toBe(8)
    expect(result.items.some((i) => i.viaCurio)).toBe(true)
    expect(result.warnings.filter((w) => w.includes('no encounter mapping'))).toEqual([])

    // Each of the 5 tier items should appear at least under its slot boss and under
    // Ula'tek (2895) with viaCurio: true.
    for (const itemId of TIER_ITEM_IDS) {
      const rows = result.items.filter((i) => i.itemId === itemId)
      expect(rows.length).toBeGreaterThanOrEqual(2)
      const curioRow = rows.find((r) => r.encounterId === 2895)
      expect(curioRow?.viaCurio).toBe(true)
      expect(rows.some((r) => r.encounterId !== 2895 && !r.viaCurio)).toBe(true)
    }
  })

  it('normalizes a real Raidbots Top Gear report (simbot.simType "optimize", not "topgear") into a best set and resolved candidates', async () => {
    const res = await fetch(`https://www.raidbots.com/reports/${TOPGEAR_REPORT_ID}/data.json`)
    expect(res.ok).toBe(true)
    const raw = (await res.json()) as RaidbotsTopGearRawReport
    console.log('[topgear] simbot.simType:', raw.simbot.simType)
    expect(raw.simbot.simType).toBe('optimize')

    const lookup = await fetchLiveLookup()
    const learnedByInstance = new Map<number, LearnedTierData>()
    const result = normalizeTopGearReport(TOPGEAR_REPORT_ID, raw, lookup, learnedByInstance)

    console.log('[topgear] character/spec:', result.character, result.spec)
    console.log('[topgear] baseline:', result.baseline)
    console.log('[topgear] bestSet delta/pct:', result.bestSet.delta, result.bestSet.pct)
    console.log('[topgear] bestSet items:', result.bestSet.items.map((i) => `${i.name} (${i.slot})`))
    console.log(
      '[topgear] candidates:',
      result.candidates.map((c) => `${c.name} (${c.slot}) <- ${c.encounterName ?? 'not a raid/dungeon item'}`)
    )
    console.log('[topgear] allSets:', result.allSets.map((s) => s.pct.toFixed(4)))

    expect(result.baseline).toBeGreaterThan(0)
    expect(result.bestSet.pct).toBeGreaterThan(0)
    expect(result.candidates.length).toBeGreaterThanOrEqual(1)
    // Verified 2026-09-20 against this exact live report: the winning combination swaps
    // in Lightspire Core (a trinket) over the equipped Freightrunner's Flask -- see
    // README.md's Top Gear shape notes for the full derivation.
    expect(result.candidates.some((c) => c.itemId === 250214)).toBe(true)
    const lightspireCore = result.candidates.find((c) => c.itemId === 250214)!
    expect(lightspireCore.encounterId).toBeDefined()
    expect(lightspireCore.encounterName).toBeDefined()
  })

  it('rejects a crafted-gear droptimizer with 422 unsupported_content on the deployed proxy, while a raid droptimizer still returns 200', async () => {
    const craftedRes = await fetch(`${PROXY_BASE_URL}/raidbots/${CRAFTED_REPORT_ID}`)
    console.log('[proxy] crafted report status:', craftedRes.status)
    expect(craftedRes.status).toBe(422)
    const craftedBody = (await craftedRes.json()) as { error: string; contentType: string }
    expect(craftedBody.error).toBe('unsupported_content')
    expect(craftedBody.contentType).toBe('crafted')

    const raidRes = await fetch(`${PROXY_BASE_URL}/raidbots/${RAIDBOTS_REPORT_ID}`)
    console.log('[proxy] raid report status:', raidRes.status)
    expect(raidRes.status).toBe(200)
    const raidBody = (await raidRes.json()) as { items: unknown[] }
    expect(raidBody.items.length).toBe(51)
  })
})
