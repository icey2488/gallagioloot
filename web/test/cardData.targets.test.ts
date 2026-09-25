import { describe, expect, it } from 'vitest'
import { buildCardData, catalystText, targetDisplayName, targetPhraseText } from '../src/lib/cardData'
import { formatDifficulty } from '../src/lib/format'
import type { BossEval, PoolEntry, Recommendation } from '@engine/core/types'

function makeEval(overrides: Partial<BossEval>): BossEval {
  return {
    encounterId: 2883,
    encounterName: 'The Coiled Altar',
    instanceId: 1320,
    pool: [],
    remaining: 5,
    rollsSpent: 0,
    rollsAttributed: 0,
    rollsUnattributed: 0,
    ev: 812,
    evPct: 0.812,
    bestCase: null,
    deployable: true,
    notes: [],
    targetKey: 'raid-vault-mythic:2883',
    kind: 'raid',
    difficultyLabel: 'Mythic',
    ...overrides,
  }
}

const ALTAR = makeEval({ encounterId: 1322, encounterName: 'Altar of Fangs', instanceId: -1, evPct: 1.2, ev: 1200, targetKey: 'mplus-myth:1322', kind: 'mplus', difficultyLabel: '+10 (Myth)', keyLevel: 10 })

function rec(overrides: Partial<Recommendation>): Recommendation {
  return { allocations: [], totalExpectedGainPct: 0, fallback: null, assumptions: [], warnings: [], tossUp: null, ...overrides }
}

describe('card target phrasing', () => {
  it('raid: "Roll <boss> (<difficulty>)"', () => {
    const coiled = makeEval({})
    const card = buildCardData({
      recommendation: rec({ allocations: [{ encounterId: 2883, encounterName: 'The Coiled Altar', targetKey: coiled.targetKey, kind: 'raid', difficultyLabel: 'Mythic', rolls: 1, expectedGain: 812, expectedGainPct: 0.812 }] }),
      bossEvals: [coiled],
      vaultDecision: null,
    })
    expect(card.headline).toBe('Roll The Coiled Altar (Mythic)')
    expect([card.verb, card.bossName, card.qualifier]).toEqual(['Roll', 'The Coiled Altar', '(Mythic)'])
  })

  it('M+: "Run <dungeon> at +10 and roll", and names the number of keys when the dungeon takes both rolls', () => {
    const one = buildCardData({
      recommendation: rec({ allocations: [{ encounterId: 1322, encounterName: 'Altar of Fangs', targetKey: ALTAR.targetKey, kind: 'mplus', difficultyLabel: '+10 (Myth)', keyLevel: 10, rolls: 1, expectedGain: 1200, expectedGainPct: 1.2 }] }),
      bossEvals: [ALTAR],
      vaultDecision: null,
    })
    expect(one.headline).toBe('Run Altar of Fangs at +10 and roll')
    expect([one.verb, one.bossName, one.qualifier]).toEqual(['Run', 'Altar of Fangs', 'at +10 and roll'])

    const two = buildCardData({
      recommendation: rec({ allocations: [{ encounterId: 1322, encounterName: 'Altar of Fangs', targetKey: ALTAR.targetKey, kind: 'mplus', keyLevel: 10, rolls: 2, expectedGain: 2400, expectedGainPct: 2.4 }] }),
      bossEvals: [ALTAR],
      vaultDecision: null,
    })
    expect(two.headline).toBe('Run Altar of Fangs at +10 and roll (2 keys)')
    expect(two.voidcoresToSpend).toBe(2)
  })

  it('voidcore verdict uses the same verb', () => {
    const card = buildCardData({
      recommendation: rec({ allocations: [{ encounterId: 1322, encounterName: 'Altar of Fangs', targetKey: ALTAR.targetKey, kind: 'mplus', keyLevel: 10, rolls: 1, expectedGain: 1200, expectedGainPct: 1.2 }] }),
      bossEvals: [ALTAR],
      vaultDecision: { voidcoreGainPct: 1.2, vaultItemGainPct: 0.5, savedRolls: 0, verdict: 'voidcore', explanation: '', notes: [] },
      vaultItemName: 'Vial',
    })
    expect(card.headline).toBe('Take the Voidcore. Run Altar of Fangs at +10 and roll.')
  })

  it('the vault adds one Voidcore: the headline names roll 1 however many rolls the week has, or says to hold it', () => {
    const coiled = makeEval({})
    const ulatek = makeEval({ encounterId: 2895, encounterName: "Ula'tek", targetKey: 'raid-vault-mythic:2895', evPct: 0.8 })
    const alloc = (b: BossEval, pct: number) => ({ encounterId: b.encounterId, encounterName: b.encounterName, targetKey: b.targetKey, kind: 'raid' as const, difficultyLabel: 'Mythic', rolls: 1, expectedGain: pct * 1000, expectedGainPct: pct })
    const recommendation = rec({ allocations: [alloc(coiled, 0.812), alloc(ulatek, 0.8)] })
    const target = { encounterId: 2895, encounterName: "Ula'tek", targetKey: 'raid-vault-mythic:2895', kind: 'raid' as const, difficultyLabel: 'Mythic', evPct: 0.8, belowThreshold: false }
    const spend = buildCardData({
      recommendation,
      bossEvals: [coiled, ulatek],
      vaultDecision: { voidcoreGainPct: 0.5, voidcoreUse: { use: 'spend', roll: 3, target: { ...target, encounterName: 'Sszorak', evPct: 0.5 }, valuePct: 0.5, holdPct: 0.4 }, vaultItemGainPct: 0.2, savedRolls: 0, verdict: 'voidcore', explanation: '', notes: [] },
      vaultItemName: 'Vial',
    })
    expect(spend.headline).toBe('Take the Voidcore. Roll The Coiled Altar (Mythic).')
    expect(spend.vaultCompare?.voidcoreWhere).toBe('roll 3: Sszorak (Mythic)')
    const hold = buildCardData({
      recommendation,
      bossEvals: [coiled, ulatek],
      vaultDecision: { voidcoreGainPct: 0.8, voidcoreUse: { use: 'hold', target, valuePct: 0.8, spendPct: 0.5 }, vaultItemGainPct: 0.2, savedRolls: 0, verdict: 'voidcore', explanation: '', notes: [] },
      vaultItemName: 'Vial',
    })
    expect(hold.headline).toBe('Take the Voidcore and hold it for next week.')
    expect(hold.vaultCompare?.voidcoreWhere).toBe("hold: Ula'tek (Mythic) next week")
  })

  it('carries the no-saved-rolls explanation through to vaultCompare', () => {
    const note = `Altar of Fangs isn't a target you'd roll this week, so taking "Vial" saves no rolls.`
    const card = buildCardData({
      recommendation: rec({ allocations: [{ encounterId: 2883, encounterName: 'The Coiled Altar', targetKey: 'raid-vault-mythic:2883', kind: 'raid', difficultyLabel: 'Mythic', rolls: 1, expectedGain: 812, expectedGainPct: 0.812 }] }),
      bossEvals: [makeEval({})],
      vaultDecision: { voidcoreGainPct: 0.81, vaultItemGainPct: 0.74, savedRolls: 0, savedRollsNote: note, verdict: 'toss-up', explanation: '', notes: [note] },
      vaultItemName: 'Vial',
    })
    expect(card.vaultCompare?.savedRollsNote).toBe(note)
  })

  it('toss-up sides resolve by target key: the same boss on two difficulties stays distinguishable', () => {
    const mythic = makeEval({})
    const heroic = makeEval({ targetKey: 'raid-vault-heroic:2883', difficultyLabel: 'Heroic', evPct: 0.8 })
    const card = buildCardData({
      recommendation: rec({
        allocations: [{ encounterId: 2883, encounterName: 'The Coiled Altar', targetKey: mythic.targetKey, kind: 'raid', difficultyLabel: 'Mythic', rolls: 1, expectedGain: 812, expectedGainPct: 0.812 }],
        tossUp: { bosses: ['The Coiled Altar', 'The Coiled Altar'], gapPct: 0.012, targetKeys: [mythic.targetKey!, heroic.targetKey!] },
      }),
      bossEvals: [mythic, heroic],
      vaultDecision: null,
    })
    expect(card.headline).toBe('Roll The Coiled Altar (Mythic) or The Coiled Altar (Heroic)')
    expect(card.tossUpBosses).toEqual([
      { name: 'The Coiled Altar (Mythic)', pct: 0.812 },
      { name: 'The Coiled Altar (Heroic)', pct: 0.8 },
    ])
  })

  it('a mixed raid/M+ toss-up reads as two actions', () => {
    const coiled = makeEval({ evPct: 1.21 })
    const card = buildCardData({
      recommendation: rec({
        allocations: [{ encounterId: 2883, encounterName: 'The Coiled Altar', targetKey: coiled.targetKey, kind: 'raid', difficultyLabel: 'Mythic', rolls: 1, expectedGain: 1210, expectedGainPct: 1.21 }],
        tossUp: { bosses: ['The Coiled Altar', 'Altar of Fangs'], gapPct: 0.01, targetKeys: [coiled.targetKey!, ALTAR.targetKey!] },
      }),
      bossEvals: [coiled, ALTAR],
      vaultDecision: null,
    })
    expect(card.headline).toBe('Roll The Coiled Altar (Mythic) or run Altar of Fangs at +10 and roll')
    expect(card.tossUpVerb).toBeUndefined()
  })

  it('names the catalyzed tier piece in the best-case text when catalyzing wins', () => {
    const best = { key: 'item:268243', name: 'Grasps of the Eternal Shadow', catalyst: { itemId: 271565, name: "Primal Leywarden's Manashapers", pct: 1.489, ownPct: 0 } } as PoolEntry
    const coiled = makeEval({ bestCase: best })
    const card = buildCardData({
      recommendation: rec({ allocations: [{ encounterId: 2883, encounterName: 'The Coiled Altar', targetKey: coiled.targetKey, kind: 'raid', difficultyLabel: 'Mythic', rolls: 1, expectedGain: 812, expectedGainPct: 0.812 }] }),
      bossEvals: [coiled],
      vaultDecision: null,
    })
    expect(card.bestRoll).toMatchObject({ name: 'The Coiled Altar (Mythic)', bestCaseItemName: 'Grasps of the Eternal Shadow', bestCaseCatalyst: "Catalyze into Primal Leywarden's Manashapers: +1.49%" })
    expect(catalystText({ catalyst: undefined })).toBeUndefined()
  })

  it('display names and phrases', () => {
    expect(targetDisplayName(ALTAR)).toBe('Altar of Fangs at +10')
    expect(targetPhraseText({ encounterName: 'Sszorak' })).toBe('Roll Sszorak')
  })
})

describe('formatDifficulty', () => {
  it('renders the Raidbots M+ difficulty id as a key level, never "Weekly10"', () => {
    expect(formatDifficulty('dungeon-mythic-weekly10', 'dungeon')).toBe('+10')
    expect(formatDifficulty('raid-vault-mythic', 'raid')).toBe('Mythic')
  })
})
