// Loads the trimmed live fixtures written by scripts/trim-fixtures.mts. Hermetic: plain file reads.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildEncounterItemsLookup } from '../../src/lookup/encounterItems'
import type { RaidbotsRawReport } from '../../src/normalize/raidbots'
import type { EncounterItemEntry, EncounterItemsLookup, InstanceEntry, WeaponSpecEntry } from '../../src/types'

const read = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, name), 'utf8'))

/** Droptimizer 6PTZ7TjgU8PdxJhZ97bMUa: Icemagus (Arcane), The Venomous Abyss, raid-vault-mythic, Myth 6/6. */
export const RAID_REPORT_ID = '6PTZ7TjgU8PdxJhZ97bMUa'
/** Droptimizer a8URThoNZqEXDW3tBtavHq: Icemagus (Arcane), Mythic+ Dungeons, +10 Vault, Myth 6/6. */
export const MPLUS_REPORT_ID = 'a8URThoNZqEXDW3tBtavHq'

export function loadRaidRaw(): RaidbotsRawReport {
  return read('raidbots-raid-6PTZ7.json')
}

export function loadMplusRaw(): RaidbotsRawReport {
  return read('raidbots-mplus-a8URT.json')
}

let lookup: EncounterItemsLookup | undefined

/** encounter-items.json etc. trimmed to instance 1320, the M+ aggregate (-1) and its 8 dungeons. */
export function loadLookup(): EncounterItemsLookup {
  if (!lookup) {
    const data = read('static-data.json') as {
      encounterItems: EncounterItemEntry[]
      instances: InstanceEntry[]
      encounterNames: Record<string, string>
      instanceNames: Record<string, string>
      weaponSpecs: WeaponSpecEntry[]
    }
    lookup = buildEncounterItemsLookup(data.encounterItems, data.instances, data.encounterNames, data.instanceNames, data.weaponSpecs)
  }
  return lookup
}
