// One-off script: fetches the two live reports, normalizes them, and writes
// NormalizedReport JSON fixtures for the web app's design preview / offline dev.
// Not part of the test suite -- run manually with `npx tsx scripts/fetch-live-fixtures.mts`.
import { writeFileSync, mkdirSync } from 'node:fs'
import { buildEncounterItemsLookup, extractGameDataVersion } from '../src/lookup/encounterItems'
import { normalizeRaidbotsReport, type RaidbotsRawReport } from '../src/normalize/raidbots'
import { normalizeQELiveReport, parseQELiveResponseBody } from '../src/normalize/qelive'
import { getAllSeedInstanceIds } from '../src/lookup/tierSeed'
import { buildLootTable } from '../src/lookup/lootTable'
import type { EncounterItemEntry, InstanceEntry, WeaponSpecEntry } from '../src/types'

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

  return { hash, lookup: buildEncounterItemsLookup(items, instances, encounterNames, instanceNames, weaponSpecs) }
}

async function main() {
  mkdirSync('web/design/fixtures', { recursive: true })

  const { hash, lookup } = await fetchLiveLookup()

  const rbRes = await fetch(`https://www.raidbots.com/reports/${RAIDBOTS_REPORT_ID}/data.json`)
  const rbRaw = (await rbRes.json()) as RaidbotsRawReport
  const rbReport = normalizeRaidbotsReport(RAIDBOTS_REPORT_ID, rbRaw, lookup)
  writeFileSync('web/design/fixtures/raidbots-jk6WmLFEnBpEqWueDkyRqA.json', JSON.stringify(rbReport, null, 2))
  console.log('Wrote raidbots fixture:', rbReport.character, rbReport.instanceName, rbReport.items.length, 'items', 'lootSpecId', rbReport.lootSpecId)

  const qeRes = await fetch(`https://questionablyepic.com/api/getUpgradeReport.php?reportID=${QELIVE_REPORT_ID}`)
  const qeBodyText = await qeRes.text()
  const qeRaw = parseQELiveResponseBody(qeBodyText)
  const qeReport = normalizeQELiveReport(QELIVE_REPORT_ID, qeRaw, lookup, new Map())
  writeFileSync('web/design/fixtures/qelive-wzfyzqxqjqej.json', JSON.stringify(qeReport, null, 2))
  console.log('Wrote qelive fixture:', qeReport.character, qeReport.instanceName, qeReport.items.length, 'items', 'lootSpecId', qeReport.lootSpecId)

  if (rbReport.instanceId && rbReport.lootSpecId) {
    const encounters = buildLootTable(rbReport.instanceId, rbReport.lootSpecId, lookup)
    const lootTable = { instanceId: rbReport.instanceId, instanceName: rbReport.instanceName, lootSpecId: rbReport.lootSpecId, sourceHash: hash, encounters }
    writeFileSync('web/design/fixtures/loot-table-1320-262.json', JSON.stringify(lootTable, null, 2))
    console.log(
      'Wrote loot table fixture:',
      encounters.length,
      'bosses,',
      encounters.reduce((sum, e) => sum + e.items.length, 0),
      'items total'
    )
  }

  console.log('seed instances known:', getAllSeedInstanceIds())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
