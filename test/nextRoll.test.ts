import { describe, expect, it } from 'vitest'
import { buildBossPools } from '../src/core/pool'
import { createStateFor } from '../src/core/knockout'
import { nextRollValue, recommend } from '../src/core/rank'
import type { BossEval, PoolEntry, Settings } from '../src/core/types'
import { normalizeRaidbotsReport } from '../src/normalize/raidbots'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from './fixtures/load'

const BASELINE = 100000

function boss(encounterId: number, name: string, evPct: number, opts: { kind?: 'raid' | 'mplus'; deployable?: boolean } = {}): BossEval {
  const ev = (evPct / 100) * BASELINE
  const entry: PoolEntry = {
    key: `item:${encounterId}`,
    itemIds: [encounterId],
    name: `${name} item`,
    value: ev,
    rawDelta: ev,
    pct: evPct,
    kind: 'item',
    specSpecific: false,
    ownership: 'none',
    isDud: false,
    knockedOut: false,
  }
  return {
    encounterId,
    encounterName: name,
    instanceId: 1320,
    targetKey: `${opts.kind ?? 'raid'}:${encounterId}`,
    kind: opts.kind ?? 'raid',
    difficultyLabel: opts.kind === 'mplus' ? '+10 (Myth)' : 'Mythic',
    baseline: BASELINE,
    pool: [entry],
    remaining: 1,
    rollsSpent: 0,
    rollsAttributed: 0,
    rollsUnattributed: 0,
    ev,
    evPct,
    bestCase: entry,
    deployable: opts.deployable ?? true,
    notes: [],
  }
}

const settings = (rollsAvailable: number): Settings => ({ thresholdPct: 0.2, rollsAvailable, includeOffSpec: false })

describe('nextRollValue: the (N+1)th roll of the week', () => {
  it('raid targets are distinct per week: the next roll goes to the best target that has none, at its own EV', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.7), boss(3, 'C', 0.4)]
    expect(nextRollValue(evals, settings(1))).toMatchObject({ encounterName: 'B', expectedGainPct: 0.7 })
    expect(nextRollValue(evals, settings(2))).toMatchObject({ encounterName: 'C', expectedGainPct: 0.4 })
  })

  it('raid-only, every deployable target already holding a roll: nothing left', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.7)]
    expect(nextRollValue(evals, settings(2))).toBeNull()
    expect(nextRollValue(evals, settings(3))).toBeNull()
    // A single deployable target is exhausted by the first roll.
    expect(nextRollValue([boss(1, 'A', 0.9)], settings(1))).toBeNull()
  })

  it('non-deployable targets (not expected, below threshold, empty pool) are never offered', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.7, { deployable: false })]
    expect(nextRollValue(evals, settings(1))).toBeNull()
  })

  it('Mythic+ repeats: the next roll goes back to the best dungeon at the same EV, however many rolls are already there', () => {
    const evals = [boss(10, 'Altar of Fangs', 0.5, { kind: 'mplus' })]
    for (const n of [1, 2, 5]) expect(nextRollValue(evals, settings(n))).toMatchObject({ encounterName: 'Altar of Fangs', kind: 'mplus', expectedGainPct: 0.5 })
  })

  it('a repeatable Mythic+ target that outranks the raid bosses takes every roll, so the extra roll repeats it', () => {
    const evals = [boss(10, 'Altar of Fangs', 0.95, { kind: 'mplus' }), boss(1, 'A', 0.9), boss(2, 'B', 0.7)]
    expect(recommend(evals, settings(2), []).allocations).toMatchObject([{ encounterName: 'Altar of Fangs', rolls: 2 }])
    expect(nextRollValue(evals, settings(2))).toMatchObject({ encounterName: 'Altar of Fangs', expectedGainPct: 0.95 })
  })

  it('raid bosses beat a weaker Mythic+ dungeon until they are used up, then the extra roll falls to Mythic+', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.7), boss(10, 'Den', 0.5, { kind: 'mplus' })]
    expect(nextRollValue(evals, settings(1))).toMatchObject({ encounterName: 'B', expectedGainPct: 0.7 })
    expect(nextRollValue(evals, settings(2))).toMatchObject({ encounterName: 'Den', expectedGainPct: 0.5 })
    expect(nextRollValue(evals, settings(3))).toMatchObject({ encounterName: 'Den', expectedGainPct: 0.5 })
  })

  it('agrees with recommend(): the extra roll equals what one more rollsAvailable adds to the total', () => {
    const evals = [boss(1, 'A', 0.9), boss(2, 'B', 0.7), boss(10, 'Den', 0.5, { kind: 'mplus' })]
    for (const n of [1, 2, 3, 4]) {
      const extra = nextRollValue(evals, settings(n))!.expectedGainPct
      const gain = (k: number) => recommend(evals, settings(k), []).totalExpectedGainPct
      expect(extra).toBeCloseTo(gain(n + 1) - gain(n), 10)
    }
  })

  it('treats rollsAvailable below 1 as 1, like recommend()', () => {
    expect(nextRollValue([boss(1, 'A', 0.9), boss(2, 'B', 0.7)], settings(0))).toMatchObject({ encounterName: 'B' })
  })

  it('has nothing to offer when no target is deployable', () => {
    expect(nextRollValue([], settings(1))).toBeNull()
  })
})

describe('nextRollValue on the Icemagus fixtures (Mythic raid 6PTZ7 + Mythic+ a8URT)', () => {
  const lookup = loadLookup()
  const raid = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
  const mplus = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), lookup)
  const evals = [raid, mplus].flatMap((r) => buildBossPools(r, createStateFor(r), settings(1)))

  it('with one roll available the next Voidcore goes to the second-best raid boss (The Coiled Altar) at its EV', () => {
    const next = nextRollValue(evals, settings(1))!
    const top = evals.filter((e) => e.deployable).sort((a, b) => b.evPct - a.evPct)
    expect(next.encounterName).toBe(top[1].encounterName)
    expect(next.expectedGainPct).toBeCloseTo(top[1].evPct, 10)
  })

  it('once the deployable raid bosses are all used, extra rolls repeat the best Mythic+ dungeon', () => {
    const raidCount = evals.filter((e) => e.deployable && e.kind === 'raid').length
    const bestMplus = evals.filter((e) => e.deployable && e.kind === 'mplus').sort((a, b) => b.evPct - a.evPct)[0]
    const next = nextRollValue(evals, settings(raidCount + 3))!
    expect(next).toMatchObject({ kind: 'mplus', encounterName: bestMplus.encounterName })
    expect(next.expectedGainPct).toBeCloseTo(bestMplus.evPct, 10)
  })
})
