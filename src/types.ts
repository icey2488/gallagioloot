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
}

/** Encounter-items.json entry (Raidbots static data). Trimmed to the fields we use. */
export type EncounterItemEntry = {
  id: number
  name: string
  inventoryType?: number
  sources: Array<{ instanceId: number; encounterId: number; veryRare?: boolean }>
}

/** instances.json entry (Raidbots static data). Trimmed to the fields we use. */
export type InstanceEntry = {
  id: number
  name: string
  type?: string
  encounters: Array<{ id: number; name: string; trash?: boolean }>
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
}
