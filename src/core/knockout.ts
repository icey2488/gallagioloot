import type { LootTableEncounter, NormalizedReport } from '../types'
import { buildBossPools } from './pool'
import { recommend } from './rank'
import { DEFAULT_SETTINGS } from './types'
import type { BossEval, KnockoutEntry, KnockoutState, Recommendation, Settings } from './types'

export function createState(character: string, difficulty: string, realm?: string, region?: string): KnockoutState {
  return { character, realm, region, difficulty, entries: [], rollsSpent: {}, version: 2 }
}

/** Upserts by itemId -- adding the same itemId twice replaces the earlier entry rather than duplicating it. */
export function addEntry(state: KnockoutState, entry: KnockoutEntry): KnockoutState {
  return { ...state, entries: [...state.entries.filter((e) => e.itemId !== entry.itemId), entry] }
}

export function removeEntry(state: KnockoutState, itemId: number): KnockoutState {
  return { ...state, entries: state.entries.filter((e) => e.itemId !== itemId) }
}

/**
 * Sets the per-boss bonus-rolls-spent counter (roll-only knockout: rolls beyond the ones
 * attributed to a specific 'rolled' item still remove one unknown item from the pool). A
 * count of 0 clears the entry. buildBossPools clamps the effective counter up to the boss's
 * attributed ('rolled') count, so this never has to be raised manually to stay consistent.
 */
export function setRollsSpent(state: KnockoutState, encounterId: number, count: number): KnockoutState {
  const rollsSpent = { ...(state.rollsSpent ?? {}) }
  if (count > 0) rollsSpent[encounterId] = Math.floor(count)
  else delete rollsSpent[encounterId]
  return { ...state, rollsSpent }
}

/** Adds 1 to the per-boss bonus-rolls-spent counter (used when a roll is recorded). */
export function incrementRollsSpent(state: KnockoutState, encounterId: number): KnockoutState {
  const current = state.rollsSpent?.[encounterId] ?? 0
  return setRollsSpent(state, encounterId, current + 1)
}

export function markSpecSpecific(state: KnockoutState, itemId: number, spec: string, lootSpecId?: number): KnockoutState {
  return {
    ...state,
    entries: state.entries.map((e) => (e.itemId === itemId ? { ...e, specSpecific: true, spec, lootSpecId: lootSpecId ?? e.lootSpecId } : e)),
  }
}

export function serialize(state: KnockoutState): string {
  return JSON.stringify(state)
}

/**
 * Tolerant of unknown/missing fields -- old or partially-written state should still load.
 * Migrates v1 (pre roll-only knockout) state: a v1 entry has no `state` and meant "removed
 * from the pool", i.e. `'rolled'` under the new model.
 */
export function deserialize(raw: string): KnockoutState {
  const parsed = JSON.parse(raw) as Partial<KnockoutState> | null
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid knockout state: expected a JSON object')
  }
  const entries: KnockoutEntry[] = Array.isArray(parsed.entries)
    ? parsed.entries
        .filter((e): e is KnockoutEntry => !!e && typeof e === 'object' && typeof e.itemId === 'number')
        .map((e) => ({
          itemId: e.itemId,
          itemName: typeof e.itemName === 'string' ? e.itemName : `Item ${e.itemId}`,
          encounterId: typeof e.encounterId === 'number' ? e.encounterId : -1,
          receivedAt: typeof e.receivedAt === 'string' ? e.receivedAt : '',
          spec: typeof e.spec === 'string' ? e.spec : undefined,
          specSpecific: typeof e.specSpecific === 'boolean' ? e.specSpecific : undefined,
          lootSpecId: typeof e.lootSpecId === 'number' ? e.lootSpecId : undefined,
          source: e.source === 'manual' ? 'manual' : 'roll',
          // Migration: a v1 checkbox meant "knocked out" -> 'rolled'. Only an explicit 'owned' stays owned.
          state: e.state === 'owned' ? 'owned' : 'rolled',
        }))
    : []
  const rollsSpent: Record<number, number> = {}
  if (parsed.rollsSpent && typeof parsed.rollsSpent === 'object') {
    for (const [k, v] of Object.entries(parsed.rollsSpent)) {
      const id = Number(k)
      if (Number.isFinite(id) && typeof v === 'number' && v > 0) rollsSpent[id] = Math.floor(v)
    }
  }
  return {
    character: typeof parsed.character === 'string' ? parsed.character : '',
    realm: typeof parsed.realm === 'string' ? parsed.realm : undefined,
    region: typeof parsed.region === 'string' ? parsed.region : undefined,
    difficulty: typeof parsed.difficulty === 'string' ? parsed.difficulty : '',
    entries,
    rollsSpent,
    version: 2,
  }
}

export function storageKey(state: Pick<KnockoutState, 'character' | 'realm' | 'region' | 'difficulty'>): string {
  return `${state.region ?? ''}:${state.realm ?? ''}:${state.character}:${state.difficulty}`.toLowerCase()
}

export interface StorageAdapter {
  load(key: string): Promise<KnockoutState | null>
  save(key: string, state: KnockoutState): Promise<void>
  list(): Promise<string[]>
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>()

  async load(key: string): Promise<KnockoutState | null> {
    const raw = this.store.get(key)
    return raw ? deserialize(raw) : null
  }

  async save(key: string, state: KnockoutState): Promise<void> {
    this.store.set(key, serialize(state))
  }

  async list(): Promise<string[]> {
    return [...this.store.keys()]
  }
}

/**
 * Records the item transmuted by a bonus roll and re-evaluates in one call, so a
 * post-kill UI screen only needs this one function. If the received item is a
 * curio constituent, the single knockout entry is enough to knock out the whole
 * collapsed curio PoolEntry -- see buildBossPools.
 */
export function reconcile(
  state: KnockoutState,
  report: NormalizedReport,
  outcome: { encounterId: number; receivedItemId: number; receivedAt: string },
  settings: Settings = DEFAULT_SETTINGS,
  lootTable?: LootTableEncounter[]
): { state: KnockoutState; bossEvals: BossEval[]; recommendation: Recommendation } {
  const item = report.items.find((i) => i.itemId === outcome.receivedItemId && i.encounterId === outcome.encounterId)

  const entry: KnockoutEntry = {
    itemId: outcome.receivedItemId,
    itemName: item?.name ?? `Item ${outcome.receivedItemId}`,
    encounterId: outcome.encounterId,
    receivedAt: outcome.receivedAt,
    lootSpecId: settings.lootSpecId,
    source: 'roll',
    // A bonus-roll outcome removes the item from the pool -- 'rolled'.
    state: 'rolled',
  }

  // Every reconcile is one bonus roll spent on this boss. Bumping the counter alongside the
  // 'rolled' entry keeps them in step for a fresh item (attributed, unattributed stays 0) and
  // correctly turns a repeat/already-recorded item into an unattributed roll (counter up,
  // attributed count unchanged) -- see buildBossPools.
  const nextState = incrementRollsSpent(addEntry(state, entry), outcome.encounterId)
  const bossEvals = buildBossPools(report, nextState, settings, lootTable)
  const recommendation = recommend(bossEvals, settings, report)

  return { state: nextState, bossEvals, recommendation }
}
