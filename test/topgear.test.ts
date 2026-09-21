import { describe, expect, it } from 'vitest'
import { normalizeTopGearReport, UnsupportedTopGearReportError, type RaidbotsTopGearRawReport } from '../src/normalize/topgear'
import type { LearnedTierData } from '../src/lookup/tierLearned'
import type { EncounterItemsLookup } from '../src/types'

const BASELINE = 554420.233784871

function makeLookup(overrides: Partial<EncounterItemsLookup> = {}): EncounterItemsLookup {
  return {
    itemSources: new Map([[250214, [{ instanceId: 1309, encounterId: 2771 }]]]),
    itemMeta: new Map(),
    encounterNames: new Map([[2771, 'Some Boss']]),
    instanceNames: new Map([[1309, 'Some Raid']]),
    instanceTypes: new Map([[1309, 'raid']]),
    rawItems: new Map(),
    encountersByInstance: new Map(),
    weaponSpecs: new Map(),
    ...overrides,
  }
}

/**
 * Trimmed directly from a live Top Gear · Great Vault report (miriTcb27bfGDYmV6JjvD1,
 * fetched 2026-09-20) down to the two trinket slots and the winning combination (real
 * "Combo 4": trinket1 <- Gebbo's Bottomless Bag (was equipped trinket2), trinket2 <-
 * Lightspire Core (the vault candidate, previously unequipped)). "Combo 2" (a
 * weapon+offhand swap, worse than baseline+"Combo 4" but better than baseline) and
 * "Combo 3" (a worse single-trinket swap) are kept too, to exercise sorting by pct.
 * Every other slot (head/neck/shoulder/etc.) is omitted -- itemsForGear silently skips
 * slots absent from allGear/the gear index array, so a trimmed fixture normalizes
 * identically to the full 16-slot one on the fields this test asserts.
 */
function makeRealSubsetReport(): RaidbotsTopGearRawReport {
  return {
    sim: {
      players: [{ collected_data: { dps: { mean: BASELINE } } }],
      profilesets: {
        metric: 'Damage per Second',
        results: [
          { name: 'Combo 4', mean: 556245.2394788357 },
          { name: 'Combo 3', mean: 552246.6653596365 },
          { name: 'Combo 2', mean: 554926.4860174803 },
        ],
      },
    },
    simbot: {
      simType: 'optimize',
      player: 'Icemagus',
      charClass: 'mage',
      spec: 'arcane',
      meta: {
        rawFormData: {
          optimize: {
            equippedGear: {
              trinkets: [
                { id: 250215, name: "Freightrunner's Flask", equipped: true, equippedSlot: 'trinket1', itemLevel: 308 },
                { id: 270164, name: "Gebbo's Bottomless Bag", equipped: true, equippedSlot: 'trinket2', itemLevel: 328 },
              ],
            },
            allGear: {
              trinkets: [
                { id: 250215, name: "Freightrunner's Flask", equipped: true, equippedSlot: 'trinket1', itemLevel: 308 },
                ...Array(8).fill({ id: 0, name: 'unused' }),
                { id: 270164, name: "Gebbo's Bottomless Bag", equipped: true, equippedSlot: 'trinket2', itemLevel: 328 },
                { id: 250214, name: 'Lightspire Core', equipped: false, itemLevel: 334 },
              ],
            },
            // gear index order: head,neck,shoulder,back,chest,wrist,hands,waist,legs,feet,
            // finger1,finger2,trinket1,trinket2,main_hand,off_hand -- only trinket1/trinket2
            // (indices 12/13) are exercised here; every other slot is null (absent from
            // equippedGear/allGear entirely, so itemsForGear skips them regardless).
            combinations: [
              { gear: [null, null, null, null, null, null, null, null, null, null, null, null, 0, 9, null, null] }, // Combo 1 (implicit baseline, not in profileset results)
              { gear: [null, null, null, null, null, null, null, null, null, null, null, null, 0, 9, null, null] }, // Combo 2 (real report also swaps weapon+offhand here -- omitted, not asserted)
              { gear: [null, null, null, null, null, null, null, null, null, null, null, null, 0, 10, null, null] }, // Combo 3
              { gear: [null, null, null, null, null, null, null, null, null, null, null, null, 9, 10, null, null] }, // Combo 4 (winner)
            ],
          },
        },
      },
    },
  }
}

describe('normalizeTopGearReport', () => {
  it('rejects reports whose simType is not "optimize"', () => {
    const report = makeRealSubsetReport()
    report.simbot.simType = 'droptimizer'
    expect(() => normalizeTopGearReport('abc', report, makeLookup())).toThrow(UnsupportedTopGearReportError)
  })

  it('rejects an "optimize" report with no rawFormData.optimize (defensive -- not observed live)', () => {
    const report = makeRealSubsetReport()
    delete report.simbot.meta.rawFormData.optimize
    expect(() => normalizeTopGearReport('abc', report, makeLookup())).toThrow(UnsupportedTopGearReportError)
  })

  it('picks the highest-pct combination as bestSet and computes delta/pct off the real baseline', () => {
    const result = normalizeTopGearReport('abc', makeRealSubsetReport(), makeLookup())
    expect(result.baseline).toBe(BASELINE)
    expect(result.bestSet.delta).toBeCloseTo(556245.2394788357 - BASELINE, 6)
    expect(result.bestSet.pct).toBeCloseTo(0.3292, 3)
  })

  it('derives equippedItems straight from rawFormData.optimize.equippedGear, tagged with equippedSlot', () => {
    const result = normalizeTopGearReport('abc', makeRealSubsetReport(), makeLookup())
    expect(result.equippedItems).toEqual(
      expect.arrayContaining([
        { itemId: 250215, name: "Freightrunner's Flask", slot: 'trinket1', ilvl: 308 },
        { itemId: 270164, name: "Gebbo's Bottomless Bag", slot: 'trinket2', ilvl: 328 },
      ])
    )
  })

  it('emits exactly the one item the winning combo adds over equipped as a candidate (Lightspire Core, not Gebbo\'s -- which was already equipped, just in the other trinket slot)', () => {
    const result = normalizeTopGearReport('abc', makeRealSubsetReport(), makeLookup())
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]).toMatchObject({ itemId: 250214, name: 'Lightspire Core', slot: 'trinket2', ilvl: 334 })
  })

  it('resolves a candidate to its boss via pickBestSource when it has a real raid/dungeon source', () => {
    const result = normalizeTopGearReport('abc', makeRealSubsetReport(), makeLookup())
    expect(result.candidates[0]).toMatchObject({ instanceId: 1309, encounterId: 2771, encounterName: 'Some Boss' })
  })

  it('leaves boss fields undefined for a candidate with no raid/dungeon source', () => {
    const lookup = makeLookup({ itemSources: new Map() })
    const result = normalizeTopGearReport('abc', makeRealSubsetReport(), lookup)
    expect(result.candidates[0].encounterId).toBeUndefined()
    expect(result.candidates[0].encounterName).toBeUndefined()
    expect(result.candidates[0].instanceId).toBeUndefined()
  })

  it('leaves boss fields undefined when the source resolves to a non-raid/dungeon instance (e.g. Delves/world content)', () => {
    const lookup = makeLookup({
      itemSources: new Map([[250214, [{ instanceId: 4000, encounterId: 1 }]]]),
      instanceTypes: new Map([[4000, 'delves']]),
    })
    const result = normalizeTopGearReport('abc', makeRealSubsetReport(), lookup)
    expect(result.candidates[0].encounterId).toBeUndefined()
  })

  it('sorts allSets by pct descending and excludes the equipped baseline', () => {
    const result = normalizeTopGearReport('abc', makeRealSubsetReport(), makeLookup())
    expect(result.allSets.map((s) => s.pct)).toEqual([...result.allSets.map((s) => s.pct)].sort((a, b) => b - a))
    // Combo 3 (552246.67) is a downgrade vs baseline -- confirms allSets isn't filtered to gains only.
    expect(result.allSets.some((s) => s.pct < 0)).toBe(true)
    expect(result.allSets).toHaveLength(3)
  })

  it('trims allSets to the top 10 combinations', () => {
    const report = makeRealSubsetReport()
    const optimize = report.simbot.meta.rawFormData.optimize!
    // Combo 4 stays the winner (556245...); pad with 10 more strictly-worse combos.
    for (let i = 5; i <= 14; i++) {
      optimize.combinations.push({ gear: [null, null, null, null, null, null, null, null, null, null, null, null, 0, 9, 0, null] })
      report.sim.profilesets.results.push({ name: `Combo ${i}`, mean: BASELINE - i })
    }
    const result = normalizeTopGearReport('abc', report, makeLookup())
    expect(result.allSets).toHaveLength(10)
    expect(result.allSets[0].pct).toBeCloseTo(0.3292, 3)
  })

  it('derives metric "hps" from a "Healing per Second" profileset metric label, "dps" otherwise', () => {
    const dpsResult = normalizeTopGearReport('abc', makeRealSubsetReport(), makeLookup())
    expect(dpsResult.metric).toBe('dps')

    const healReport = makeRealSubsetReport()
    healReport.sim.profilesets.metric = 'Healing per Second'
    const hpsResult = normalizeTopGearReport('abc', healReport, makeLookup())
    expect(hpsResult.metric).toBe('hps')
  })

  it('skips a profileset result whose "Combo N" name has no matching combinations entry (defensive)', () => {
    const report = makeRealSubsetReport()
    report.sim.profilesets.results.push({ name: 'Combo 99', mean: 999999 })
    const result = normalizeTopGearReport('abc', report, makeLookup())
    expect(result.allSets.find((s) => s.delta === 999999 - BASELINE)).toBeUndefined()
  })
})

describe('normalizeTopGearReport candidate resolution', () => {
  function reportWithTwoCandidateSlots(): RaidbotsTopGearRawReport {
    return {
      sim: {
        players: [{ collected_data: { dps: { mean: BASELINE } } }],
        profilesets: { metric: 'Damage per Second', results: [{ name: 'Combo 2', mean: BASELINE + 3000 }] },
      },
      simbot: {
        simType: 'optimize',
        player: 'Testmage',
        charClass: 'mage',
        spec: 'arcane',
        meta: {
          rawFormData: {
            optimize: {
              equippedGear: {
                head: [{ id: 500, name: 'Old Hood', equipped: true, equippedSlot: 'head', itemLevel: 300 }],
                trinkets: [
                  { id: 100, name: 'Old Trinket 1', equipped: true, equippedSlot: 'trinket1', itemLevel: 300 },
                  { id: 101, name: 'Old Trinket 2', equipped: true, equippedSlot: 'trinket2', itemLevel: 300 },
                ],
              },
              allGear: {
                head: [
                  { id: 500, name: 'Old Hood', equipped: true, equippedSlot: 'head', itemLevel: 300 },
                  { id: 271483, name: 'Serpent Crown of the Ophidian Oracle', itemLevel: 334 },
                ],
                trinkets: [
                  { id: 100, name: 'Old Trinket 1', equipped: true, equippedSlot: 'trinket1', itemLevel: 300 },
                  { id: 101, name: 'Old Trinket 2', equipped: true, equippedSlot: 'trinket2', itemLevel: 300 },
                  { id: 250214, name: 'Lightspire Core', itemLevel: 334 },
                ],
              },
              // Combo 1 (equipped baseline): head=idx0, trinket1=idx0, trinket2=idx1.
              // Combo 2 (winner): head=idx1 (tier token candidate), trinket1 unchanged, trinket2=idx2 (direct-source candidate).
              combinations: [
                { gear: [0, null, null, null, null, null, null, null, null, null, null, null, 0, 1, null, null] },
                { gear: [1, null, null, null, null, null, null, null, null, null, null, null, 0, 2, null, null] },
              ],
            },
          },
        },
      },
    }
  }

  it('emits both candidates in slot order (head before trinket2) when the winning combo swaps two items at once', () => {
    const lookup = makeLookup({
      itemSources: new Map([
        [271483, [{ instanceId: -100, encounterId: -100 }]], // tier token -- aggregate bucket, needs the tier fallback
        [250214, [{ instanceId: 1320, encounterId: 2894 }]], // direct raid source -- also anchors the dominant instance
      ]),
      encounterNames: new Map([
        [2894, 'The Lost Explorers'],
        [2887, 'The Twin Fangs'],
        [2895, "Ula'tek"],
      ]),
      instanceNames: new Map([[1320, 'The Venomous Abyss']]),
      instanceTypes: new Map([[1320, 'raid']]),
    })
    const result = normalizeTopGearReport('abc', reportWithTwoCandidateSlots(), lookup)

    expect(result.candidates.map((c) => c.itemId)).toEqual([271483, 250214])
    // Direct resolution: the trinket resolves straight off encounter-items.json.
    expect(result.candidates[1]).toMatchObject({ instanceId: 1320, encounterId: 2894, encounterName: 'The Lost Explorers' })
    // Tier fallback: the head token has no positive source, so it resolves via the real
    // seed table (src/lookup/tierSeed.ts) for instance 1320 -- established as the
    // "dominant" instance from the trinket's direct resolution above -- landing on its
    // direct slot boss (The Twin Fangs), not the curio (Ula'tek).
    expect(result.candidates[0]).toMatchObject({ instanceId: 1320, encounterId: 2887, encounterName: 'The Twin Fangs' })
  })

  it('prefers the learned cache over the seed for the tier-token fallback, same as QE Live', () => {
    const lookup = makeLookup({
      itemSources: new Map([
        [271483, [{ instanceId: -100, encounterId: -100 }]],
        [250214, [{ instanceId: 1320, encounterId: 2894 }]],
      ]),
      encounterNames: new Map([[2894, 'The Lost Explorers'], [9001, 'Learned Boss']]),
      instanceTypes: new Map([[1320, 'raid']]),
    })
    const learnedByInstance = new Map<number, LearnedTierData>([[1320, { byItem: { 271483: [9001] }, bySlot: {} }]])
    const result = normalizeTopGearReport('abc', reportWithTwoCandidateSlots(), lookup, learnedByInstance)
    expect(result.candidates[0]).toMatchObject({ encounterId: 9001, encounterName: 'Learned Boss' })
  })
})
