import type { EncounterItemsLookup, NormalizedItem, NormalizedReport, Role } from '../types'

export class UnsupportedReportError extends Error {}

const TANK_SPECS = new Set(['protection', 'blood', 'brewmaster', 'guardian', 'vengeance'])

export type RaidbotsItemLibraryEntry = {
  id: number
  name: string
  encounterId?: number
  instanceId?: number
  difficulty?: string
  itemLevel?: number
  dropLevel?: number
  inventoryType?: number
  offSpecItem?: boolean
  upgrade?: { fullName?: string }
}

export type RaidbotsInstanceLibraryEntry = {
  id: number
  name: string
  encounters: Array<{ id: number; name: string }>
}

export type RaidbotsProfilesetResult = {
  name: string
  mean: number
}

export type RaidbotsRawReport = {
  sim: {
    players: Array<{ collected_data: { dps: { mean: number } } }>
    profilesets: {
      metric: string
      results: RaidbotsProfilesetResult[]
    }
  }
  simbot: {
    simType: string
    player: string
    charClass: string
    spec: string
    meta: {
      rawFormData: {
        droptimizer: {
          instance: number
          difficulty: string
        }
      }
      itemLibrary: RaidbotsItemLibraryEntry[]
      instanceLibrary: RaidbotsInstanceLibraryEntry[]
    }
  }
}

const TRASH_ENCOUNTER_NAME = 'Trash Drop'

function roleForSpec(spec: string): Role {
  return TANK_SPECS.has(spec.toLowerCase()) ? 'tank' : 'dps'
}

function contentTypeFromDifficulty(difficulty: string): 'raid' | 'dungeon' | 'other' {
  if (difficulty.startsWith('raid')) return 'raid'
  if (difficulty.startsWith('dungeon')) return 'dungeon'
  return 'other'
}

/**
 * Parses a profileset row name: instanceId/encounterId/difficulty/itemId/ilvl/enchantId/slot////catalystSourceId
 * The trailing catalystSourceId segment is only present (non-empty) for catalyst conversion rows.
 */
function parseProfilesetName(name: string): {
  instanceId: number
  encounterId: number
  difficulty: string
  itemId: number
  ilvl: number
  slot: string
  catalystSourceId?: number
} {
  const parts = name.split('/')
  const catalystRaw = parts[parts.length - 1]
  return {
    instanceId: Number(parts[0]),
    encounterId: Number(parts[1]),
    difficulty: parts[2],
    itemId: Number(parts[3]),
    ilvl: Number(parts[4]),
    slot: parts[6],
    catalystSourceId: catalystRaw ? Number(catalystRaw) : undefined,
  }
}

export function normalizeRaidbotsReport(
  reportId: string,
  raw: RaidbotsRawReport,
  fallbackLookup?: EncounterItemsLookup
): NormalizedReport {
  if (raw.simbot.simType !== 'droptimizer') {
    throw new UnsupportedReportError(`Unsupported simType: ${raw.simbot.simType} (expected "droptimizer")`)
  }

  const warnings: string[] = []
  const baseline = raw.sim.players[0].collected_data.dps.mean
  const spec = raw.simbot.spec.toLowerCase()
  const difficulty = raw.simbot.meta.rawFormData.droptimizer.difficulty
  const contentType = contentTypeFromDifficulty(difficulty)
  const instanceId = raw.simbot.meta.rawFormData.droptimizer.instance

  const itemLibraryById = new Map(raw.simbot.meta.itemLibrary.map((entry) => [entry.id, entry]))

  const encounterNameById = new Map<number, string>()
  for (const instance of raw.simbot.meta.instanceLibrary) {
    for (const encounter of instance.encounters) {
      encounterNameById.set(encounter.id, encounter.name)
    }
  }

  const instanceName =
    raw.simbot.meta.instanceLibrary.find((i) => i.id === instanceId)?.name ??
    fallbackLookup?.instanceNames.get(instanceId)

  let trashExcluded = 0
  let unmappedCount = 0
  const items: NormalizedItem[] = []

  for (const result of raw.sim.profilesets.results) {
    const parsed = parseProfilesetName(result.name)

    if (parsed.encounterId < 0) {
      trashExcluded++
      continue
    }

    const libraryEntry = itemLibraryById.get(parsed.itemId)

    let encounterName = encounterNameById.get(parsed.encounterId) ?? fallbackLookup?.encounterNames.get(parsed.encounterId)
    if (!encounterName) {
      unmappedCount++
      encounterName = `Encounter ${parsed.encounterId}`
    }

    const delta = result.mean - baseline

    items.push({
      itemId: parsed.itemId,
      name: libraryEntry?.name ?? `Item ${parsed.itemId}`,
      slot: parsed.slot || undefined,
      encounterId: parsed.encounterId,
      encounterName,
      instanceId: parsed.instanceId,
      ilvl: parsed.ilvl,
      delta,
      pct: (delta / baseline) * 100,
      catalystSourceId: parsed.catalystSourceId,
      offSpec: libraryEntry?.offSpecItem,
    })
  }

  if (trashExcluded > 0) {
    warnings.push(`${TRASH_ENCOUNTER_NAME} entries removed (${trashExcluded})`)
  }
  if (unmappedCount > 0) {
    warnings.push(`${unmappedCount} items had no encounter mapping`)
  }

  return {
    source: 'raidbots',
    reportId,
    character: raw.simbot.player,
    spec,
    charClass: raw.simbot.charClass,
    role: roleForSpec(spec),
    metric: 'dps',
    contentType,
    difficulty,
    baseline,
    instanceId,
    instanceName,
    items,
    warnings,
  }
}
