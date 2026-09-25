// One-off script: builds the web design-preview fixtures for the multi-report screenshots
// (web/design/single-page-shots.mts) from the hermetic test fixtures -- no network. Run from
// the repo root:
//   npx tsx scripts/build-design-fixtures.mts [path/to/topgear-k3vro-data.json]
// The optional argument is a Raidbots data.json download of Top Gear report
// k3vroAKe6QvF5gN4GeCVAq; without it the Top Gear fixture is left as-is.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { normalizeRaidbotsReport } from '../src/normalize/raidbots'
import { normalizeTopGearReport, type RaidbotsTopGearRawReport } from '../src/normalize/topgear'
import { buildLootTable } from '../src/lookup/lootTable'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from '../test/fixtures/load'
import type { LootTable } from '../src/types'

const OUT = 'web/design/fixtures'
const ARCANE = 62
const lookup = loadLookup()
const hash = (JSON.parse(readFileSync('test/fixtures/static-data.json', 'utf8')) as { hash: string }).hash

const write = (name: string, value: unknown) => {
  const text = JSON.stringify(value, null, 2)
  writeFileSync(`${OUT}/${name}`, text)
  console.log(`wrote ${OUT}/${name} (${text.length} bytes)`)
}

const raid = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
const mplus = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), lookup)
write(`raidbots-${RAID_REPORT_ID}.json`, raid)
write(`raidbots-${MPLUS_REPORT_ID}.json`, mplus)

for (const report of [raid, mplus]) {
  const instanceId = report.instanceId!
  const table: LootTable = {
    instanceId,
    instanceName: lookup.instanceNames.get(instanceId) ?? report.instanceName,
    lootSpecId: ARCANE,
    sourceHash: hash,
    encounters: buildLootTable(instanceId, ARCANE, lookup),
  }
  write(`loot-table-${instanceId}-${ARCANE}.json`, table)
}

const topGearPath = process.argv[2]
if (topGearPath && existsSync(topGearPath)) {
  const raw = JSON.parse(readFileSync(topGearPath, 'utf8')) as RaidbotsTopGearRawReport
  write('topgear-k3vroAKe6QvF5gN4GeCVAq.json', normalizeTopGearReport('k3vroAKe6QvF5gN4GeCVAq', raw, lookup, new Map()))
}
