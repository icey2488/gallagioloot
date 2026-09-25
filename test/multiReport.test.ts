import { describe, expect, it } from 'vitest'
import { buildBossPools } from '../src/core/pool'
import { recommend } from '../src/core/rank'
import { compareVault } from '../src/core/vault'
import { addEntry, createState, createStateFor, setRollsSpent, storageKey, storageKeyFor } from '../src/core/knockout'
import { checkCandidate, checkReportSet } from '../src/core/reportSet'
import { difficultyLabel, knockoutDifficulty, targetKey } from '../src/core/targets'
import { normalizeRaidbotsReport } from '../src/normalize/raidbots'
import { buildLootTable } from '../src/lookup/lootTable'
import type { BossEval, Settings } from '../src/core/types'
import type { NormalizedItem, NormalizedReport } from '../src/types'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from './fixtures/load'

const BASELINE = 100000
const SETTINGS: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false }

function item(encounterId: number, encounterName: string, delta: number, overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return { itemId: encounterId * 10, name: `${encounterName} item`, encounterId, encounterName, instanceId: 1320, ilvl: 334, delta, pct: delta / 1000, ...overrides }
}

function raidReport(items: NormalizedItem[], overrides: Partial<NormalizedReport> = {}): NormalizedReport {
  return {
    source: 'raidbots',
    reportId: 'raid-mythic',
    character: 'Icemagus',
    realm: 'hyjal',
    region: 'us',
    spec: 'arcane',
    role: 'dps',
    metric: 'dps',
    contentType: 'raid',
    difficulty: 'raid-vault-mythic',
    baseline: BASELINE,
    instanceId: 1320,
    instanceName: 'The Venomous Abyss',
    items,
    warnings: [],
    lootSpecId: 62,
    targetKind: 'raid',
    ...overrides,
  }
}

function mplusReport(items: NormalizedItem[], overrides: Partial<NormalizedReport> = {}): NormalizedReport {
  return raidReport(
    items.map((i) => ({ ...i, instanceId: -1 })),
    {
      reportId: 'mplus',
      contentType: 'dungeon',
      difficulty: 'dungeon-mythic-weekly10',
      instanceId: -1,
      instanceName: 'Mythic+ Dungeons',
      targetKind: 'mplus',
      track: { name: 'Myth', keyLevelMin: 10, upgradeLevel: 6, upgradeMax: 6, atMaxUpgrade: true },
      ...overrides,
    }
  )
}

function evalsFor(reports: NormalizedReport[], settings: Settings): BossEval[] {
  return reports.flatMap((r) => buildBossPools(r, createStateFor(r), settings))
}

describe('target identity and labels', () => {
  it('labels raid difficulties by word and M+ by key level and track, never "Weekly10"', () => {
    expect(difficultyLabel(raidReport([]))).toBe('Mythic')
    expect(difficultyLabel(raidReport([], { difficulty: 'heroic', source: 'qelive' }))).toBe('Heroic')
    expect(difficultyLabel(raidReport([], { difficulty: 'raid-vault-lfr' }))).toBe('LFR')
    expect(difficultyLabel(mplusReport([]))).toBe('+10 (Myth)')
    // Older payloads without track info still read the key level off the difficulty id.
    expect(difficultyLabel(mplusReport([], { track: undefined }))).toBe('+10')
  })

  it('keys the same boss on two difficulties as two targets', () => {
    const mythic = raidReport([])
    const heroic = raidReport([], { difficulty: 'raid-vault-heroic' })
    expect(targetKey(mythic, 2883)).toBe('raid-vault-mythic:2883')
    expect(targetKey(heroic, 2883)).toBe('raid-vault-heroic:2883')
    expect(targetKey(mplusReport([]), 1322)).toBe('mplus-myth:1322')
  })
})

describe('knockout state keyed per (character, difficulty or track)', () => {
  it('keeps raid storage keys byte-identical to the pre-M+ key, so saved raid state loads with no migration', () => {
    const report = raidReport([item(2883, 'The Coiled Altar', 1000)])
    expect(knockoutDifficulty(report)).toBe('raid-vault-mythic')
    expect(storageKeyFor(report)).toBe(storageKey({ character: 'Icemagus', realm: 'hyjal', region: 'us', difficulty: 'raid-vault-mythic' }))
    expect(storageKeyFor(report)).toBe('us:hyjal:icemagus:raid-vault-mythic')
    // A state saved the old way (createState with the report's difficulty) still applies.
    const legacy = addEntry(createState('Icemagus', 'raid-vault-mythic', 'hyjal', 'us'), {
      itemId: 28830, itemName: 'x', encounterId: 2883, receivedAt: '', source: 'manual', state: 'rolled',
    })
    const [boss] = buildBossPools(report, legacy, SETTINGS)
    expect(boss.pool[0].knockedOut).toBe(true)
    expect(boss.notes.some((n) => n.includes('not applied'))).toBe(false)
  })

  it('keys Mythic+ knockout state per track ("mplus-myth") and applies it to the dungeon pools', () => {
    const report = mplusReport([item(1322, 'Altar of Fangs', 1000), item(1322, 'Altar of Fangs', 500, { itemId: 99 })])
    expect(storageKeyFor(report)).toBe('us:hyjal:icemagus:mplus-myth')
    const state = setRollsSpent(createStateFor(report), 1322, 1)
    const [boss] = buildBossPools(report, state, SETTINGS)
    expect(boss.rollsSpent).toBe(1)
    expect(boss.remaining).toBe(1)
    // A state keyed by the raw difficulty id is a different key -- not silently applied.
    const [mismatch] = buildBossPools(report, createState('Icemagus', 'dungeon-mythic-weekly10'), SETTINGS)
    expect(mismatch.notes.some((n) => n.includes('not applied'))).toBe(true)
  })
})

describe('roll allocation across raid and Mythic+ targets', () => {
  const raid = raidReport([item(2883, 'The Coiled Altar', 800), item(2871, 'Sszorak', 700), item(2895, "Ula'tek", 300)])

  it('2 rolls, raid only: two distinct bosses', () => {
    const settings = { ...SETTINGS, rollsAvailable: 2 }
    const rec = recommend(evalsFor([raid], settings), settings, raid)
    expect(rec.allocations.map((a) => [a.encounterName, a.rolls])).toEqual([
      ['The Coiled Altar', 1],
      ['Sszorak', 1],
    ])
  })

  it('2 rolls, best target is a dungeon: both rolls go to that repeatable M+ target (run the key twice)', () => {
    const mplus = mplusReport([item(1322, 'Altar of Fangs', 1200), item(1311, 'Den of Nalorakk', 900)])
    const settings = { ...SETTINGS, rollsAvailable: 2 }
    const rec = recommend(evalsFor([raid, mplus], settings), settings, [raid, mplus])
    expect(rec.allocations).toHaveLength(1)
    expect(rec.allocations[0]).toMatchObject({ encounterName: 'Altar of Fangs', kind: 'mplus', rolls: 2, targetKey: 'mplus-myth:1322' })
    expect(rec.allocations[0].expectedGainPct).toBeCloseTo(2.4)
    expect(rec.totalExpectedGainPct).toBeCloseTo(2.4)
    // Toss-up boundary is the repeated dungeon vs the best target with no roll.
    expect(rec.tossUp).toBeNull()
  })

  it('2 rolls, raid best then a dungeon: one roll each', () => {
    const mplus = mplusReport([item(1322, 'Altar of Fangs', 750)])
    const settings = { ...SETTINGS, rollsAvailable: 2 }
    const rec = recommend(evalsFor([raid, mplus], settings), settings, [raid, mplus])
    expect(rec.allocations.map((a) => [a.encounterName, a.rolls])).toEqual([
      ['The Coiled Altar', 1],
      ['Altar of Fangs', 1],
    ])
  })

  it('3 rolls: a raid boss never takes a second roll, a dungeon keeps taking them while it is the best left', () => {
    const mplus = mplusReport([item(1322, 'Altar of Fangs', 750)])
    const settings = { ...SETTINGS, rollsAvailable: 3 }
    const rec = recommend(evalsFor([raid, mplus], settings), settings, [raid, mplus])
    expect(rec.allocations.map((a) => [a.encounterName, a.rolls])).toEqual([
      ['The Coiled Altar', 1],
      ['Altar of Fangs', 2],
    ])
    expect(rec.totalExpectedGainPct).toBeCloseTo(0.8 + 1.5)
  })

  it('allows the same boss on two difficulties as two distinct raid targets', () => {
    const heroic = raidReport([item(2883, 'The Coiled Altar', 750)], { reportId: 'raid-heroic', difficulty: 'raid-vault-heroic' })
    const mythicOnly = raidReport([item(2883, 'The Coiled Altar', 800)])
    const settings = { ...SETTINGS, rollsAvailable: 2 }
    const rec = recommend(evalsFor([mythicOnly, heroic], settings), settings, [mythicOnly, heroic])
    expect(rec.allocations.map((a) => [a.encounterName, a.difficultyLabel])).toEqual([
      ['The Coiled Altar', 'Mythic'],
      ['The Coiled Altar', 'Heroic'],
    ])
  })

  it('respects expectedTargets: an unchecked dungeon ("I will run this key" off) takes no roll', () => {
    const mplus = mplusReport([item(1322, 'Altar of Fangs', 1200)])
    const settings = { ...SETTINGS, rollsAvailable: 1, expectedTargets: ['raid-vault-mythic:2883', 'raid-vault-mythic:2871'] }
    const evals = evalsFor([raid, mplus], settings)
    expect(evals.find((b) => b.encounterId === 1322)?.deployable).toBe(false)
    expect(recommend(evals, settings, [raid, mplus]).allocations[0].encounterName).toBe('The Coiled Altar')
  })

  it('ranks across reports by EV% of each report\'s own baseline', () => {
    const mplus = mplusReport([item(1322, 'Altar of Fangs', 850)], { baseline: 110000 }) // 0.773% of its baseline
    const rec = recommend(evalsFor([raid, mplus], SETTINGS), SETTINGS, [raid, mplus])
    expect(rec.allocations[0].encounterName).toBe('The Coiled Altar') // 0.8%
  })
})

describe('report set validation', () => {
  const base = raidReport([])

  it('refuses a report for a different character, realm or loot spec', () => {
    expect(checkCandidate([base], mplusReport([], { character: 'Othermage' })).errors[0]).toMatch(/Othermage.*Icemagus.*one character at a time/)
    expect(checkCandidate([base], mplusReport([], { realm: 'area-52' })).errors).toHaveLength(1)
    expect(checkCandidate([base], mplusReport([], { lootSpecId: 63 })).errors[0]).toMatch(/loot spec 63/)
    expect(checkCandidate([base], mplusReport([])).errors).toEqual([])
  })

  it('warns on baseline drift above 0.5% and refuses above 3% (defaults), with adjustable limits', () => {
    expect(checkCandidate([base], mplusReport([], { baseline: BASELINE * 1.004 }))).toEqual({ errors: [], warnings: [] })
    const warn = checkCandidate([base], mplusReport([], { baseline: BASELINE * 1.006 }))
    expect(warn.errors).toEqual([])
    expect(warn.warnings[0]).toMatch(/differs from the first report by 0\.60%/)
    const refuse = checkCandidate([base], mplusReport([], { baseline: BASELINE * 0.965 }))
    expect(refuse.errors[0]).toMatch(/3\.50% \(limit 3%\)/)
    expect(checkCandidate([base], mplusReport([], { baseline: BASELINE * 0.965 }), { warnPct: 1, refusePct: 5 }).errors).toEqual([])
  })

  it('refuses a duplicate report, a second report for the same instance+difficulty, and a second M+ report', () => {
    const mplus = mplusReport([])
    expect(checkCandidate([base], base).errors[0]).toMatch(/already loaded/)
    expect(checkCandidate([base], raidReport([], { reportId: 'other' })).errors[0]).toMatch(/Venomous Abyss \(Mythic\) is already loaded/)
    expect(checkCandidate([base, mplus], mplusReport([], { reportId: 'mplus-2' })).errors[0]).toMatch(/Mythic\+ report is already loaded/)
    expect(checkCandidate([base], raidReport([], { reportId: 'heroic', difficulty: 'raid-vault-heroic' })).errors).toEqual([])
  })

  it('re-checks a whole loaded set', () => {
    expect(checkReportSet([base, mplusReport([], { baseline: BASELINE * 1.04 })]).errors).toHaveLength(1)
  })
})

describe('compareVault across reports', () => {
  it('finds the vault item in a dungeon pool and takes the alternative from the best OTHER target', () => {
    const raid = raidReport([item(2883, 'The Coiled Altar', 800)])
    const mplus = mplusReport([item(1322, 'Altar of Fangs', 740, { itemId: 273796, name: 'Vile Vial' }), item(1322, 'Altar of Fangs', 100, { itemId: 5 })])
    const evals = evalsFor([raid, mplus], SETTINGS)
    const rec = recommend(evals, SETTINGS, [raid, mplus])
    const vd = compareVault({ vaultItem: { name: 'Vile Vial', gainPct: 0.74, itemId: 273796 }, bossEvals: evals, recommendation: rec, settings: SETTINGS, report: raid })
    expect(vd.savedRolls).toBeGreaterThan(0)
    expect(vd.notes[0]).toMatch(/Altar of Fangs's roll pool/)
    expect(vd.vaultItemGainPct).toBeCloseTo(0.74 + vd.savedRolls * 0.8)
  })
})

describe('live fixtures: raid 6PTZ7 + M+ a8URT + Top Gear vault item k3vro', () => {
  const lookup = loadLookup()
  const raid = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
  const mplus = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), lookup)
  const settings: Settings = { thresholdPct: 0.2, rollsAvailable: 1, includeOffSpec: false, lootSpecId: 62 }
  const evals = [
    ...buildBossPools(raid, createStateFor(raid), settings, buildLootTable(1320, 62, lookup)),
    ...buildBossPools(mplus, createStateFor(mplus), settings, buildLootTable(-1, 62, lookup)),
  ]

  it('is one valid set (same character and loot spec, baseline drift 0.02%)', () => {
    expect(checkReportSet([raid, mplus])).toEqual({ errors: [], warnings: [] })
  })

  it('ranks 8 raid bosses and 8 dungeons on one scale', () => {
    expect(evals).toHaveLength(16)
    const ranked = [...evals].sort((a, b) => b.evPct - a.evPct).map((b) => `${b.encounterName} ${b.evPct.toFixed(3)}`)
    expect(ranked).toEqual([
      'The Coiled Altar 0.812',
      "Ula'tek 0.798",
      'Sszorak 0.648',
      'The Lost Explorers 0.614',
      'The Twin Fangs 0.366',
      'Altar of Fangs 0.354',
      "Nek'zali the Soulcoiler 0.349",
      'Den of Nalorakk 0.348',
      'Murder Row 0.312',
      'Ruby Life Pools 0.290',
      'Temple of Sethraliss 0.284',
      'Entombed Sentinels 0.278',
      "Kings' Rest 0.277",
      'Voidscar Arena 0.266',
      'Vashnik the Malignant 0.245',
      'The Blinding Vale 0.154',
    ])
  })

  it('1 roll: Coiled Altar, a toss-up with Ula\'tek; the Top Gear vault item now matches the Altar of Fangs pool', () => {
    const rec = recommend(evals, settings, [raid, mplus])
    expect(rec.allocations.map((a) => a.encounterName)).toEqual(['The Coiled Altar'])
    expect(rec.tossUp?.bosses).toEqual(['The Coiled Altar', "Ula'tek"])
    const vd = compareVault({
      vaultItem: { name: 'Vile Vial of Volatile Venom', gainPct: 0.7439364712473122, itemId: 273796, encounterId: 2878 },
      bossEvals: evals,
      recommendation: rec,
      settings,
      report: raid,
    })
    expect(vd.savedRolls).toBeCloseTo(5.7026, 3)
    expect(vd.verdict).toBe('vault')
    expect(vd.vaultItemGainPct).toBeCloseTo(0.7439 + 5.7026 * 0.8117, 2)
  })
})
