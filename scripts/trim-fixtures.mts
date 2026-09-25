// One-off script: trims raw Raidbots reports + static data down to the fields the
// normalizers/engine read, and writes them as hermetic test fixtures under test/fixtures/.
// Not part of the test suite. Run from the repo root with:
//   npx tsx scripts/trim-fixtures.mts <dir>
// where <dir> holds raid-6PTZ7.json, mplus-a8URT.json (Raidbots data.json downloads) and the
// five static-data files (encounter-items.json, instances.json, encounter-names.json,
// instance-names.json, weapon-specs.json) plus hash.txt from https://www.raidbots.com/static/data/<hash>/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Json = Record<string, unknown>

const dir = process.argv[2]
if (!dir) throw new Error('usage: npx tsx scripts/trim-fixtures.mts <dir>')
const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'))

function pick(obj: Json | undefined, keys: string[]): Json | undefined {
  if (!obj) return undefined
  const out: Json = {}
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

function trimReport(raw: Json): Json {
  const sim = raw.sim as Json
  const simbot = raw.simbot as Json
  const meta = simbot.meta as Json
  const rawFormData = meta.rawFormData as Json
  const players = sim.players as Array<{ collected_data: { dps: { mean: number } } }>
  const profilesets = sim.profilesets as { metric: string; results: Json[] }
  const input = String(simbot.input ?? '')
  return {
    sim: {
      players: [{ collected_data: { dps: { mean: players[0].collected_data.dps.mean } } }],
      profilesets: { metric: profilesets.metric, results: profilesets.results.map((r) => pick(r, ['name', 'mean', 'mean_error'])) },
    },
    simbot: {
      simType: simbot.simType,
      title: simbot.title,
      player: simbot.player,
      charClass: simbot.charClass,
      spec: simbot.spec,
      // Only the lines parseCharacterLocation reads (region/server) plus the header comment.
      input: input
        .split('\n')
        .filter((l) => /^#|^\s*(region|server|level|race)\s*=/.test(l))
        .slice(0, 6)
        .join('\n'),
      meta: {
        title: meta.title,
        rawFormData: {
          droptimizer: pick(rawFormData.droptimizer as Json, ['instance', 'encounter', 'difficulty', 'upgradeLevel', 'classId', 'specId', 'lootSpecId', 'includeConversions']),
        },
        itemLibrary: (meta.itemLibrary as Json[]).map((e) => ({
          ...pick(e, ['id', 'name', 'inventoryType', 'itemLevel', 'dropLevel', 'offSpecItem', 'itemSetId', 'sources', 'instanceId', 'encounterId', 'difficulty']),
          upgrade: pick(e.upgrade as Json | undefined, ['name', 'level', 'max', 'fullName', 'itemLevel']),
          overrides: pick(e.overrides as Json | undefined, ['difficulty', 'itemLevelOverride', 'itemLevel', 'repeatable']),
        })),
        instanceLibrary: (meta.instanceLibrary as Json[]).map((i) => ({
          ...pick(i, ['id', 'name', 'type']),
          encounters: (i.encounters as Json[]).map((e) => pick(e, ['id', 'name', 'trash'])),
        })),
      },
    },
  }
}

const raid = read('raid-6PTZ7.json')
const mplus = read('mplus-a8URT.json')

const encounterItems = read('encounter-items.json') as Array<Json & { id: number; sources?: Array<{ instanceId: number }>; contains?: number[] }>
const instances = read('instances.json') as Array<Json & { id: number }>

const mplusDungeonIds = ((mplus.simbot.meta.instanceLibrary as Array<{ id: number; encounters: Array<{ id: number }> }>).find((i) => i.id === -1)?.encounters ?? []).map((e) => e.id)
const keepInstances = new Set<number>([1320, -1, ...mplusDungeonIds])

const rowItemIds = new Set<number>()
for (const report of [raid, mplus]) {
  for (const r of report.sim.profilesets.results as Array<{ name: string }>) {
    const parts = r.name.split('/')
    rowItemIds.add(Number(parts[3]))
    if (parts[parts.length - 1]) rowItemIds.add(Number(parts[parts.length - 1]))
  }
}

const keptItems = new Map<number, Json>()
for (const item of encounterItems) {
  if (rowItemIds.has(item.id) || (item.sources ?? []).some((s) => keepInstances.has(s.instanceId))) keptItems.set(item.id, item)
}
// Curio `contains` constituents (tier pieces for every class) resolve through the aggregate catalyst bucket.
for (const item of [...keptItems.values()]) {
  for (const id of (item.contains as number[] | undefined) ?? []) {
    const constituent = encounterItems.find((e) => e.id === id)
    if (constituent) keptItems.set(id, constituent)
  }
}

mkdirSync('test/fixtures', { recursive: true })
const write = (name: string, value: unknown) => {
  const text = JSON.stringify(value)
  writeFileSync(join('test/fixtures', name), text)
  console.log(`wrote test/fixtures/${name} (${text.length} bytes)`)
}

write('raidbots-raid-6PTZ7.json', trimReport(raid))
write('raidbots-mplus-a8URT.json', trimReport(mplus))
write('static-data.json', {
  hash: readFileSync(join(dir, 'hash.txt'), 'utf8').trim(),
  encounterItems: [...keptItems.values()],
  instances: instances.filter((i) => keepInstances.has(i.id)),
  encounterNames: read('encounter-names.json'),
  instanceNames: read('instance-names.json'),
  weaponSpecs: read('weapon-specs.json'),
})
