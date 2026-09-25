import { describe, expect, it } from 'vitest'
import { formatDropLine, summarizeDrops } from '../src/core/drops'
import { addEntry, createStateFor } from '../src/core/knockout'
import { buildBossPools } from '../src/core/pool'
import { recommend } from '../src/core/rank'
import { checkReportSet } from '../src/core/reportSet'
import { normalizeRaidbotsReport, type RaidbotsRawReport } from '../src/normalize/raidbots'
import { maxUpgradeWarning, parseTrackInfo } from '../src/normalize/track'
import { toIsoDate } from '../src/normalize/simDate'
import type { Settings } from '../src/core/types'
import { loadLookup, loadMplusRaw, loadRaidRaw, MPLUS_REPORT_ID, RAID_REPORT_ID } from './fixtures/load'

const SETTINGS: Settings = { thresholdPct: 0.2, voidcoresToSpend: 2, includeOffSpec: false }
const lookup = loadLookup()

describe('per-boss drop step read off the Mythic raid fixture (6PTZ7TjgU8PdxJhZ97bMUa)', () => {
  const report = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)

  it("every boss drops Myth 6/6 (334) except The Coiled Altar and Ula'tek at Myth 9/6 (344)", () => {
    const perBoss = new Map<string, Set<number>>()
    for (const i of report.items.filter((i) => i.encounterId >= 0)) perBoss.set(i.encounterName, (perBoss.get(i.encounterName) ?? new Set()).add(i.ilvl))
    expect(Object.fromEntries([...perBoss].map(([name, ilvls]) => [name, [...ilvls]]))).toEqual({
      Sszorak: [334],
      'Entombed Sentinels': [334],
      'The Lost Explorers': [334],
      "Nek'zali the Soulcoiler": [334],
      'The Twin Fangs': [334],
      'Vashnik the Malignant': [334],
      'The Coiled Altar': [344],
      "Ula'tek": [344],
    })
    expect(summarizeDrops(report)).toEqual({
      common: { ilvl: 334, label: 'Myth 6/6' },
      exceptions: [{ ilvl: 344, label: 'Myth 9/6', targets: ['The Coiled Altar', "Ula'tek"] }],
      targetCount: 8,
    })
  })

  it('formats the drop line with the 344 exception', () => {
    expect(formatDropLine(summarizeDrops(report))).toBe("Drops Myth 6/6 (334) · The Coiled Altar, Ula'tek Myth 9/6 (344)")
  })

  it('labels both steps from the report itself: 334 -> Myth 6/6, 344 -> Myth 9/6 (the 344 items carry only "Myth 9")', () => {
    expect(report.track?.upgradeLabelsByIlvl).toEqual({ '334': 'Myth 6/6', '344': 'Myth 9/6' })
  })

  it('is at max upgrade: no warning, and the 9/6 step neither lowers the track step nor flags it', () => {
    expect(report.track).toMatchObject({ name: 'Myth', upgradeLevel: 6, upgradeMax: 6, upgradeFullName: 'Myth 6/6', atMaxUpgrade: true, simmedIlvl: 334 })
    expect(report.warnings.some((w) => w.includes('max upgrade'))).toBe(false)
  })
})

describe('per-dungeon drop step read off the Mythic+ fixture (a8URThoNZqEXDW3tBtavHq)', () => {
  const report = normalizeRaidbotsReport(MPLUS_REPORT_ID, loadMplusRaw(), lookup)

  it('all 8 dungeons drop Myth 6/6 (334): no exceptions', () => {
    expect(summarizeDrops(report)).toEqual({ common: { ilvl: 334, label: 'Myth 6/6' }, exceptions: [], targetCount: 8 })
    expect(formatDropLine({ ...summarizeDrops(report), dungeons: 8 })).toBe('Drops Myth 6/6 (334) · 8 dungeons')
  })
})

describe('max-upgrade detection with a step past the track max', () => {
  const upgrade = (level: number, max = 6) => ({ name: 'Myth', level, max, fullName: `Myth ${level}/${max}` })

  it('6/6 is at max', () => {
    const track = parseTrackInfo([{ itemLevel: 334, upgrade: upgrade(6) }])
    expect(track).toMatchObject({ atMaxUpgrade: true, upgradeFullName: 'Myth 6/6', upgradeLabelsByIlvl: { '334': 'Myth 6/6' } })
    expect(maxUpgradeWarning(track)).toBeNull()
  })

  it('9/6 by itself (an upgrade object past max) is at max, not mis-parsed', () => {
    const track = parseTrackInfo([{ itemLevel: 344, upgrade: upgrade(9) }])
    expect(track).toMatchObject({ atMaxUpgrade: true, upgradeLevel: 9, upgradeMax: 6, upgradeFullName: 'Myth 9/6' })
    expect(maxUpgradeWarning(track)).toBeNull()
  })

  it('9/6 alongside 6/6 keeps the report at Myth 6/6 with no warning', () => {
    const track = parseTrackInfo([
      { itemLevel: 334, upgrade: upgrade(6) },
      { itemLevel: 344, upgrade: upgrade(9) },
    ])
    expect(track).toMatchObject({ atMaxUpgrade: true, upgradeLevel: 6, upgradeFullName: 'Myth 6/6' })
    expect(maxUpgradeWarning(track)).toBeNull()
  })

  it('a label-only "Myth 9" entry (no upgrade object) borrows the track max and does not warn', () => {
    const track = parseTrackInfo([
      { itemLevel: 334, upgrade: upgrade(6) },
      { itemLevel: 344, overrides: { itemLevel: 'Myth 9' } },
    ])
    expect(track).toMatchObject({ atMaxUpgrade: true, upgradeFullName: 'Myth 6/6', upgradeLabelsByIlvl: { '334': 'Myth 6/6', '344': 'Myth 9/6' } })
    expect(maxUpgradeWarning(track)).toBeNull()
  })

  it('a label-only entry BELOW max still warns, naming that step', () => {
    const track = parseTrackInfo([
      { itemLevel: 334, upgrade: upgrade(6) },
      { itemLevel: 321, overrides: { itemLevel: 'Myth 3' } },
    ])
    expect(track).toMatchObject({ atMaxUpgrade: false, upgradeLevel: 3, upgradeFullName: 'Myth 3/6' })
    expect(maxUpgradeWarning(track)).toContain('Simmed at Myth 3/6, not Myth 6/6')
  })

  it('a label-only entry with no max anywhere to borrow is ignored', () => {
    expect(parseTrackInfo([{ itemLevel: 344, overrides: { itemLevel: 'Myth 9' } }]).atMaxUpgrade).toBeUndefined()
  })
})

describe('formatDropLine', () => {
  it('prints a bare ilvl when the report labels no step, and says so when there are no targets', () => {
    expect(formatDropLine({ common: { ilvl: 271 }, exceptions: [] })).toBe('Drops 271')
    expect(formatDropLine({ common: null, exceptions: [] })).toBe('Drops item level unknown')
  })

  it('joins several exception groups and pluralizes dungeons', () => {
    expect(
      formatDropLine({
        common: { ilvl: 334, label: 'Myth 6/6' },
        exceptions: [
          { ilvl: 337, targets: ['A'] },
          { ilvl: 344, label: 'Myth 9/6', targets: ['B', 'C'] },
        ],
        dungeons: 1,
      })
    ).toBe('Drops Myth 6/6 (334) · A 337 · B, C Myth 9/6 (344) · 1 dungeon')
    expect(formatDropLine({ common: { ilvl: 1 }, exceptions: [], dungeons: 0 })).toBe('Drops 1')
    expect(formatDropLine({ common: { ilvl: 1 }, exceptions: [], dungeons: -3 })).toBe('Drops 1')
  })

  it('takes the shared step as the most common, a tie going to the lower ilvl', () => {
    const rows = (n: number, ilvl: number) => Array.from({ length: n }, (_, i) => ({ encounterId: ilvl * 10 + i, encounterName: `B${ilvl}-${i}`, ilvl })) as never[]
    expect(summarizeDrops({ items: [...rows(2, 344), ...rows(2, 334)] }).common).toEqual({ ilvl: 334, label: undefined })
    expect(summarizeDrops({ items: [...rows(3, 344), ...rows(2, 334)] }).common).toEqual({ ilvl: 344, label: undefined })
    expect(summarizeDrops({ items: [] })).toEqual({ common: null, exceptions: [], targetCount: 0 })
  })
})

describe('simmedAt', () => {
  it('normalizes an HTTP-date to ISO, and is undefined when absent or unparseable', () => {
    expect(toIsoDate('Tue, 22 Sep 2026 20:14:38 GMT')).toBe('2026-09-22T20:14:38.000Z')
    expect(toIsoDate(null)).toBeUndefined()
    expect(toIsoDate('not a date')).toBeUndefined()
  })

  it('is set from the caller-supplied Last-Modified on Raidbots reports', () => {
    const raw = loadRaidRaw()
    expect(normalizeRaidbotsReport(RAID_REPORT_ID, raw, lookup, { lastModified: 'Tue, 22 Sep 2026 20:14:38 GMT' }).simmedAt).toBe('2026-09-22T20:14:38.000Z')
    expect(normalizeRaidbotsReport(RAID_REPORT_ID, raw, lookup).simmedAt).toBeUndefined()
  })
})

/** The Mythic raid fixture rewritten as a Heroic droptimizer: every row and library entry at Myth 6/6 (334), with slightly different means. */
function heroicRaw(): RaidbotsRawReport {
  const raw = loadRaidRaw()
  raw.simbot.meta.rawFormData.droptimizer.difficulty = 'raid-vault-heroic'
  for (const entry of raw.simbot.meta.itemLibrary) {
    entry.difficulty = 'raid-vault-heroic'
    entry.itemLevel = 334
    entry.dropLevel = 334
    entry.upgrade = { name: 'Myth', level: 6, max: 6, fullName: 'Myth 6/6', itemLevel: 334 }
    entry.overrides = { difficulty: 'raid-vault-heroic', itemLevelOverride: 334, itemLevel: 'Myth 6/6' }
  }
  // Scale the baseline with the means so every delta stays proportional (a separate sim, not a constant shift).
  raw.sim.players[0].collected_data.dps.mean *= 0.9995
  raw.sim.profilesets.results = raw.sim.profilesets.results.map((row) => {
    const p = row.name.split('/')
    p[2] = 'raid-vault-heroic'
    p[4] = '334'
    // Heroic bosses give the same items at the same ilvl -- a hair different from Mythic, as two separate sims are.
    return { ...row, name: p.join('/'), mean: row.mean * 0.9995 }
  })
  return raw
}

describe('Heroic and Mythic loaded together (synthetic Heroic report)', () => {
  const mythic = normalizeRaidbotsReport(RAID_REPORT_ID, loadRaidRaw(), lookup)
  const heroic = normalizeRaidbotsReport('HeroicSynthetic00000000', heroicRaw(), lookup)
  const settings: Settings = { ...SETTINGS, expectedTargets: undefined }

  it('the Heroic report drops Myth 6/6 (334) on every boss: no exceptions, no warning', () => {
    expect(heroic.difficulty).toBe('raid-vault-heroic')
    expect(summarizeDrops(heroic)).toEqual({ common: { ilvl: 334, label: 'Myth 6/6' }, exceptions: [], targetCount: 8 })
    expect(formatDropLine(summarizeDrops(heroic))).toBe('Drops Myth 6/6 (334)')
    expect(heroic.warnings.some((w) => w.includes('max upgrade'))).toBe(false)
  })

  it('is a legal set: no report-set errors, the same items on a shared boss', () => {
    expect(checkReportSet([mythic, heroic]).errors).toEqual([])
    const names = (r: typeof mythic) => new Set(r.items.filter((i) => i.encounterId === 2871).map((i) => i.name))
    expect(names(heroic)).toEqual(names(mythic))
  })

  it('both difficulties show as separate targets and rank independently, with near-identical EVs on the shared bosses', () => {
    const evals = [mythic, heroic].flatMap((r) => buildBossPools(r, createStateFor(r), settings))
    const keys = evals.map((e) => e.targetKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(evals.filter((e) => e.difficultyLabel === 'Mythic')).toHaveLength(8)
    expect(evals.filter((e) => e.difficultyLabel === 'Heroic')).toHaveLength(8)

    const ev = (label: string, id: number) => evals.find((e) => e.difficultyLabel === label && e.encounterId === id)!.evPct
    for (const id of [2871, 2874, 2882, 2887, 2888, 2894]) expect(Math.abs(ev('Mythic', id) - ev('Heroic', id))).toBeLessThan(0.02)
    // The last two bosses drop higher on Mythic, but both difficulties exist as targets.
    expect(ev('Mythic', 2895)).toBeGreaterThan(0)
    expect(ev('Heroic', 2895)).toBeGreaterThan(0)

    // Two rolls go to two distinct targets, ranked across both difficulties (a raid target takes at most one roll).
    const rec = recommend(evals, settings, [mythic, heroic])
    expect(rec.allocations).toHaveLength(2)
    expect(new Set(rec.allocations.map((a) => a.targetKey)).size).toBe(2)
  })

  it('knockout state is per difficulty: rolling an item on Heroic leaves the Mythic target untouched', () => {
    const mythicBefore = buildBossPools(mythic, createStateFor(mythic), SETTINGS).find((e) => e.encounterId === 2871)!
    const heroicBefore = buildBossPools(heroic, createStateFor(heroic), SETTINGS).find((e) => e.encounterId === 2871)!
    const top = heroicBefore.pool.reduce((a, b) => (b.value > a.value ? b : a))
    const heroicState = addEntry(createStateFor(heroic), {
      itemId: top.itemIds[0],
      itemName: top.name,
      encounterId: 2871,
      receivedAt: '2026-09-25T00:00:00.000Z',
      source: 'manual',
      state: 'rolled',
    })
    const heroicAfter = buildBossPools(heroic, heroicState, SETTINGS).find((e) => e.encounterId === 2871)!
    expect(heroicAfter.remaining).toBe(heroicBefore.remaining - 1)
    expect(heroicAfter.evPct).not.toBe(heroicBefore.evPct)
    // Mythic evaluated with its own (unchanged) state: identical to before.
    expect(buildBossPools(mythic, createStateFor(mythic), SETTINGS).find((e) => e.encounterId === 2871)).toEqual(mythicBefore)
    // ...and the Heroic state is not applied to the Mythic report at all.
    const crossed = buildBossPools(mythic, heroicState, SETTINGS).find((e) => e.encounterId === 2871)!
    expect(crossed.notes.some((n) => n.includes('knockout state not applied'))).toBe(true)
  })
})
