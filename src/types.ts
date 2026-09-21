export type ReportSource = 'raidbots' | 'qelive'
export type Role = 'dps' | 'healer' | 'tank'
export type Metric = 'dps' | 'hps'
export type ContentType = 'raid' | 'dungeon' | 'other'

export type NormalizedItem = {
  itemId: number
  name: string
  slot?: string
  encounterId: number
  encounterName: string
  instanceId: number
  ilvl: number
  delta: number
  pct: number
  catalystSourceId?: number
  offSpec?: boolean
  /** True when encounterId is a class-neutral "curio" token source (e.g. Ula'tek's Slumbering Coil Curio) rather than a direct tier-slot boss. */
  viaCurio?: boolean
  /** The tier armor slot this row was resolved for (e.g. "head"), set only for tier-token rows resolved via the seed/learned tier lookup. */
  tierSlot?: string
  /** Raidbots profileset row's `mean_error`, same absolute units as `delta`. Raidbots-only; QE Live never sets this. */
  meanError?: number
}

export type NormalizedReport = {
  source: ReportSource
  reportId: string
  character: string
  realm?: string
  region?: string
  spec: string
  charClass?: string
  role: Role
  metric: Metric
  contentType: ContentType
  difficulty: string
  baseline: number
  instanceId?: number
  instanceName?: string
  items: NormalizedItem[]
  warnings: string[]
  /**
   * The WoW spec id the game uses to decide what this character can receive.
   * Raidbots: `rawFormData.droptimizer.lootSpecId` directly. QE Live: derived from
   * the report's `spec` string via `src/lookup/specs.ts` (QE Live carries no numeric
   * spec id of its own). Undefined only if neither source could resolve it.
   */
  lootSpecId?: number
}

/** Encounter-items.json entry (Raidbots static data). Trimmed to the fields we use. */
export type EncounterItemEntry = {
  id: number
  name: string
  icon?: string
  inventoryType?: number
  itemClass?: number
  itemSubClass?: number
  itemSetId?: number
  uniqueEquipped?: boolean
  onUseTrinket?: boolean
  /** WoW spec ids that can receive/use this item, when the item is spec-restricted (trinkets, cantrip weapons, Maze-roa). */
  specs?: number[]
  /** WoW class ids that can use this item, when class-restricted (tokens). */
  allowableClasses?: number[]
  /** Per-class/per-slot item ids this token resolves to (tier tokens, class-neutral curios). */
  contains?: number[]
  sources: Array<{ instanceId: number; encounterId: number; veryRare?: boolean }>
}

/** instances.json entry (Raidbots static data). Trimmed to the fields we use. */
export type InstanceEntry = {
  id: number
  name: string
  type?: string
  encounters: Array<{ id: number; name: string; trash?: boolean }>
}

/** weapon-specs.json entry (Raidbots static data): which specs can use/receive a given (itemClass, itemSubClass) weapon type. */
export type WeaponSpecEntry = {
  itemClass: number
  itemSubClass: number
  specsCanDrop: number[]
  specsCanUse: number[]
}

export type EncounterItemsLookup = {
  /** itemId -> list of {instanceId, encounterId} sources */
  itemSources: Map<number, Array<{ instanceId: number; encounterId: number }>>
  /** itemId -> { name, inventoryType } */
  itemMeta: Map<number, { name: string; inventoryType?: number }>
  /** encounterId -> encounter name */
  encounterNames: Map<number, string>
  /** instanceId -> instance name */
  instanceNames: Map<number, string>
  /** instanceId -> instance type, e.g. "raid" | "dungeon" */
  instanceTypes: Map<number, string>
  /** itemId -> the full encounter-items.json entry, for the loot-table endpoint (needs specs/allowableClasses/contains/etc). */
  rawItems: Map<number, EncounterItemEntry>
  /** instanceId -> ordered encounter list (including trash), for the loot-table endpoint. */
  encountersByInstance: Map<number, Array<{ id: number; name: string; trash?: boolean }>>
  /** "{itemClass}:{itemSubClass}" -> {specsCanDrop, specsCanUse}, from weapon-specs.json. */
  weaponSpecs: Map<string, { specsCanDrop: number[]; specsCanUse: number[] }>
}

export type LootTableItem = {
  itemId: number
  name: string
  icon?: string
  slot?: string
  itemClass?: number
  itemSubClass?: number
  /** True when the item carries a `specs` restriction (trinkets, cantrip weapons) -- see LootTableItemRow.specSpecific. */
  specSpecific: boolean
  uniqueEquipped: boolean
  onUseTrinket: boolean
  isTier: boolean
  viaCurio: boolean
  tierSlot?: string
}

export type LootTableEncounter = {
  encounterId: number
  encounterName: string
  items: LootTableItem[]
}

export type LootTable = {
  instanceId: number
  instanceName?: string
  lootSpecId: number
  /** Raidbots static-data hash this table was built from, so the UI can show data freshness. */
  sourceHash: string
  encounters: LootTableEncounter[]
}

export type TopGearItem = {
  itemId: number
  name: string
  slot: string
  ilvl: number
}

/** A TopGearItem present in the best set but not in the currently-equipped set. */
export type TopGearCandidate = TopGearItem & {
  encounterId?: number
  encounterName?: string
  instanceId?: number
}

export type TopGearSet = {
  /** Absolute dps/hps gain over `NormalizedTopGear.baseline`. */
  delta: number
  pct: number
  items: TopGearItem[]
}

/**
 * A Raidbots "Top Gear" report (`simbot.simType === "optimize"`, not `"topgear"` -- see
 * README.md's Top Gear shape notes for how this was verified against a live report),
 * normalized down to the equipped set, the best-scoring combination it tested, and the
 * items that combination adds over what's currently equipped (candidates).
 */
export type NormalizedTopGear = {
  source: 'raidbots'
  reportId: string
  character: string
  spec: string
  baseline: number
  metric: Metric
  bestSet: TopGearSet
  equippedItems: TopGearItem[]
  /** Items in `bestSet` not in `equippedItems`, each resolved to a boss when possible (undefined fields when the item isn't a raid/dungeon drop). */
  candidates: TopGearCandidate[]
  /** Every tested combination (excluding the equipped baseline), sorted by `pct` descending, trimmed to 10. */
  allSets: TopGearSet[]
}
