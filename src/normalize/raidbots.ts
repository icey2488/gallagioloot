import { resolveTierEncounters } from '../lookup/tierResolve'
import { extractEquippedItemIds } from './equipped'
import { assertSupportedContentType, type DetectedContentType } from './contentType'
import { maxUpgradeWarning, parseTrackInfo, type RaidbotsDifficultyOverride, type RaidbotsUpgradeInfo } from './track'
import type { EncounterItemsLookup, NormalizedItem, NormalizedReport, Role, TargetKind } from '../types'

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
  upgrade?: RaidbotsUpgradeInfo
  /** Per-entry copy of the report's droptimizer settings; `difficulty` carries the M+ key-level object (see track.ts). */
  overrides?: { difficulty?: RaidbotsDifficultyOverride | string; itemLevelOverride?: number }
  /** Present on tier-set items (Raidbots' own "set information"); used to identify tier items for the learned tier cache. */
  itemSetId?: number
  sources?: Array<{ instanceId: number; encounterId: number }>
}

export type RaidbotsInstanceLibraryEntry = {
  id: number
  name: string
  /** e.g. "raid", "dungeon", "professionMidnightEpic", "pvp-honor", "delve-mid1" -- see contentType.ts. */
  type?: string
  encounters: Array<{ id: number; name: string }>
}

export type RaidbotsProfilesetResult = {
  name: string
  mean: number
  /** Simc's reported standard error for `mean`, when present -- absolute, same units as `mean`. */
  mean_error?: number
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
    /**
     * The raw simc profile the sim was built from. Raidbots' data.json carries the
     * character's realm/region only here (as `server=` / `region=` lines) -- there's no
     * structured field for them. Verified live 2026-09-22 against reports 6PTZ7TjgU8PdxJhZ97bMUa
     * and k3vroAKe6QvF5gN4GeCVAq (both `region=us`, `server=hyjal`).
     */
    input?: string
    meta: {
      rawFormData: {
        droptimizer: {
          instance: number
          difficulty: string
          lootSpecId?: number
          /** Bonus id of the upgrade step simmed (e.g. 12854 = Myth 6/6). Informational -- the step itself is read from itemLibrary[].upgrade. */
          upgradeLevel?: number
          /** The character's equipped gear: slot name -> item object with a numeric `id` (see extractEquippedItemIds). */
          equipped?: unknown
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

/**
 * Pulls the character's realm/region out of the simc profile string (`simbot.input`),
 * which is where Raidbots' data.json keeps them (as `server=<realm>` and `region=<region>`
 * lines) -- there is no structured field. Returns undefined for either when the input is
 * absent or the line isn't present, so the storage key falls back gracefully.
 */
export function parseCharacterLocation(input: string | undefined): { realm?: string; region?: string } {
  if (!input) return {}
  const region = /(?:^|\n)\s*region\s*=\s*([^\n#]+)/i.exec(input)?.[1]?.trim()
  const realm = /(?:^|\n)\s*server\s*=\s*([^\n#]+)/i.exec(input)?.[1]?.trim()
  return { realm: realm || undefined, region: region || undefined }
}

function classifyInstanceType(type: string | undefined): DetectedContentType {
  if (!type) return 'other'
  if (type === 'raid') return 'raid'
  if (type === 'dungeon') return 'dungeon'
  if (type.startsWith('profession')) return 'crafted'
  if (type.startsWith('pvp')) return 'pvp'
  if (type.startsWith('delve')) return 'delve'
  return 'other'
}

/**
 * Primary signal is `instanceLibrary[].type` (see contentType.ts). Falls back to the
 * difficulty string's prefix (observed live: "raid-vault-heroic", "professionMidnightEpic-331")
 * only when the instance entry carries no `type` at all.
 */
function detectRaidbotsContentType(instanceType: string | undefined, difficulty: string): DetectedContentType {
  const fromType = classifyInstanceType(instanceType)
  if (fromType !== 'other') return fromType
  if (difficulty.startsWith('raid')) return 'raid'
  if (difficulty.startsWith('dungeon')) return 'dungeon'
  return 'other'
}

/**
 * Parses a profileset row name: instanceId/encounterId/difficulty/itemId/ilvl/enchantId/slot////catalystSourceId
 * The trailing catalystSourceId segment is only present (non-empty) for catalyst conversion rows.
 */
export function parseProfilesetName(name: string): {
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
  const instanceId = raw.simbot.meta.rawFormData.droptimizer.instance

  const instanceEntry = raw.simbot.meta.instanceLibrary.find((i) => i.id === instanceId)
  const instanceType = instanceEntry?.type ?? fallbackLookup?.instanceTypes.get(instanceId)
  const detectedContentType = detectRaidbotsContentType(instanceType, difficulty)
  assertSupportedContentType(detectedContentType)
  const contentType = detectedContentType

  const itemLibraryById = new Map(raw.simbot.meta.itemLibrary.map((entry) => [entry.id, entry]))

  const encounterNameById = new Map<number, string>()
  for (const instance of raw.simbot.meta.instanceLibrary) {
    for (const encounter of instance.encounters) {
      encounterNameById.set(encounter.id, encounter.name)
    }
  }

  const instanceName = instanceEntry?.name ?? fallbackLookup?.instanceNames.get(instanceId)

  // Mythic+ droptimizers use the aggregate "Mythic+ Dungeons" instance (-1, type
  // "mplus-chest"): every profileset row is "-1/-1/...", so the dungeon is only recoverable
  // by joining the row's item to its sources (see dungeonForItem). Each dungeon becomes one
  // roll target keyed by its instance id -- the same ids `/loot-table/-1` returns as
  // pseudo-encounters -- because an end-of-key roll draws from the whole dungeon's table.
  const targetKind: TargetKind = contentType === 'dungeon' ? 'mplus' : 'raid'
  const MPLUS_AGGREGATE_INSTANCE_ID = -1
  const dungeonNameById = new Map<number, string>()
  for (const enc of raw.simbot.meta.instanceLibrary.find((i) => i.id === MPLUS_AGGREGATE_INSTANCE_ID)?.encounters ?? []) {
    dungeonNameById.set(enc.id, enc.name)
  }
  const dungeonName = (dungeonId: number) =>
    dungeonNameById.get(dungeonId) ??
    raw.simbot.meta.instanceLibrary.find((i) => i.id === dungeonId)?.name ??
    fallbackLookup?.instanceNames.get(dungeonId) ??
    `Dungeon ${dungeonId}`

  /** The M+ aggregate source (`{instanceId: -1, encounterId: <dungeon id>}`) of an item, from the report's own itemLibrary first, then encounter-items.json. */
  const dungeonForItem = (itemId: number): number | undefined => {
    const sources = itemLibraryById.get(itemId)?.sources ?? fallbackLookup?.itemSources.get(itemId) ?? []
    return sources.find((s) => s.instanceId === MPLUS_AGGREGATE_INSTANCE_ID)?.encounterId
  }

  const itemName = (itemId: number) => itemLibraryById.get(itemId)?.name ?? fallbackLookup?.itemMeta.get(itemId)?.name

  let trashExcluded = 0
  let unmappedCount = 0
  const items: NormalizedItem[] = []

  for (const result of raw.sim.profilesets.results) {
    const parsed = parseProfilesetName(result.name)

    if (targetKind === 'mplus') {
      // A single-dungeon report carries the real dungeon id in the row; the aggregate
      // report needs the join. Catalyst rows are attributed by the SOURCE item (the one
      // that actually drops), not the tier piece it converts into.
      const dungeonId = parsed.instanceId > 0 ? parsed.instanceId : dungeonForItem(parsed.catalystSourceId ?? parsed.itemId)
      if (dungeonId === undefined) {
        unmappedCount++
        continue
      }
      const delta = result.mean - baseline
      items.push({
        itemId: parsed.itemId,
        name: itemName(parsed.itemId) ?? `Item ${parsed.itemId}`,
        slot: parsed.slot || undefined,
        encounterId: dungeonId,
        encounterName: dungeonName(dungeonId),
        instanceId: MPLUS_AGGREGATE_INSTANCE_ID,
        ilvl: parsed.ilvl,
        delta,
        pct: (delta / baseline) * 100,
        catalystSourceId: parsed.catalystSourceId,
        catalystSourceName: parsed.catalystSourceId !== undefined ? itemName(parsed.catalystSourceId) : undefined,
        offSpec: itemLibraryById.get(parsed.itemId)?.offSpecItem,
        meanError: result.mean_error,
      })
      continue
    }

    // Real trash rows keep a positive instance id (e.g. "1320/-97/...") -- only the
    // encounter id is the "Trash Drop" sentinel.
    if (parsed.encounterId < 0 && parsed.instanceId > 0) {
      trashExcluded++
      continue
    }

    const libraryEntry = itemLibraryById.get(parsed.itemId)
    const delta = result.mean - baseline

    // Defensive fallback for rows pointed at an aggregate/catalyst bucket (negative
    // instance id, e.g. -100) instead of a real boss -- mirrors the QE Live tier
    // resolution. Not observed in live Sep 2026 season data (profileset rows there
    // always carry a real boss encounter id, with catalyst conversions marked via the
    // trailing catalystSourceId instead), but kept as a shared code path per spec.
    if (parsed.instanceId < 0) {
      const resolved = resolveTierEncounters(instanceId, parsed.itemId, parsed.slot || undefined, undefined)
      if (resolved.length === 0) {
        unmappedCount++
        continue
      }
      for (const { encounterId, viaCurio } of resolved) {
        const encounterName =
          encounterNameById.get(encounterId) ?? fallbackLookup?.encounterNames.get(encounterId) ?? `Encounter ${encounterId}`
        items.push({
          itemId: parsed.itemId,
          name: libraryEntry?.name ?? `Item ${parsed.itemId}`,
          slot: parsed.slot || undefined,
          encounterId,
          encounterName,
          instanceId,
          ilvl: parsed.ilvl,
          delta,
          pct: (delta / baseline) * 100,
          catalystSourceId: parsed.catalystSourceId,
          catalystSourceName: parsed.catalystSourceId !== undefined ? itemName(parsed.catalystSourceId) : undefined,
          offSpec: libraryEntry?.offSpecItem,
          viaCurio,
          tierSlot: parsed.slot || undefined,
          meanError: result.mean_error,
        })
      }
      continue
    }

    let encounterName = encounterNameById.get(parsed.encounterId) ?? fallbackLookup?.encounterNames.get(parsed.encounterId)
    if (!encounterName) {
      unmappedCount++
      encounterName = `Encounter ${parsed.encounterId}`
    }

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
      catalystSourceName: parsed.catalystSourceId !== undefined ? itemName(parsed.catalystSourceId) : undefined,
      offSpec: libraryEntry?.offSpecItem,
      meanError: result.mean_error,
    })
  }

  if (trashExcluded > 0) {
    warnings.push(`${TRASH_ENCOUNTER_NAME} entries removed (${trashExcluded})`)
  }
  if (unmappedCount > 0) {
    warnings.push(`${unmappedCount} items had no encounter mapping`)
  }

  const track = parseTrackInfo(raw.simbot.meta.itemLibrary)
  const upgradeWarning = maxUpgradeWarning(track)
  if (upgradeWarning) warnings.push(upgradeWarning)

  const { realm, region } = parseCharacterLocation(raw.simbot.input)

  return {
    source: 'raidbots',
    reportId,
    character: raw.simbot.player,
    realm,
    region,
    spec,
    charClass: raw.simbot.charClass,
    role: roleForSpec(spec),
    metric: 'dps',
    contentType,
    difficulty,
    baseline,
    // Every M+ target is a pseudo-encounter of the aggregate instance, so the loot table to
    // join against is always `/loot-table/-1` -- even for a single-dungeon report.
    instanceId: targetKind === 'mplus' ? MPLUS_AGGREGATE_INSTANCE_ID : instanceId,
    instanceName: targetKind === 'mplus' ? dungeonName(MPLUS_AGGREGATE_INSTANCE_ID) : instanceName,
    items,
    warnings,
    lootSpecId: raw.simbot.meta.rawFormData.droptimizer.lootSpecId,
    targetKind,
    track,
    equippedItemIds: extractEquippedItemIds(raw.simbot.meta.rawFormData.droptimizer.equipped),
  }
}
