import { describe, expect, it } from 'vitest'
import { normalizeRaidbotsReport, UnsupportedReportError, type RaidbotsRawReport } from '../src/normalize/raidbots'

const BASELINE = 100000

function makeReport(overrides: Partial<RaidbotsRawReport> = {}): RaidbotsRawReport {
  return {
    sim: {
      players: [{ collected_data: { dps: { mean: BASELINE } } }],
      profilesets: {
        metric: 'Damage per Second',
        results: [
          { name: '1320/2895/raid-vault-heroic/271484/334/0/hands////', mean: 110000 },
        ],
      },
    },
    simbot: {
      simType: 'droptimizer',
      player: 'Iceshaman',
      charClass: 'shaman',
      spec: 'elemental',
      meta: {
        rawFormData: { droptimizer: { instance: 1320, difficulty: 'raid-vault-heroic' } },
        itemLibrary: [{ id: 271484, name: 'Hexing Grips of the Ophidian Oracle', offSpecItem: false }],
        instanceLibrary: [
          {
            id: 1320,
            name: 'The Venomous Abyss',
            encounters: [
              { id: 2895, name: "Ula'tek" },
              { id: -97, name: 'Trash Drop' },
            ],
          },
        ],
      },
    },
    ...overrides,
  }
}

describe('normalizeRaidbotsReport', () => {
  it('rejects reports whose simType is not droptimizer', () => {
    const report = makeReport()
    report.simbot.simType = 'raidSummary'
    expect(() => normalizeRaidbotsReport('abc', report)).toThrow(UnsupportedReportError)
  })

  it('computes baseline, delta, and pct for a basic row', () => {
    const result = normalizeRaidbotsReport('abc', makeReport())
    expect(result.baseline).toBe(BASELINE)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      itemId: 271484,
      name: 'Hexing Grips of the Ophidian Oracle',
      slot: 'hands',
      encounterId: 2895,
      encounterName: "Ula'tek",
      instanceId: 1320,
      ilvl: 334,
      delta: 10000,
      pct: 10,
    })
  })

  it('excludes Trash Drop (negative encounter id) rows and warns', () => {
    const report = makeReport({
      sim: {
        players: [{ collected_data: { dps: { mean: BASELINE } } }],
        profilesets: {
          metric: 'Damage per Second',
          results: [
            { name: '1320/2895/raid-vault-heroic/271484/334/0/hands////', mean: 110000 },
            { name: '1320/-97/raid-vault-heroic/271440/334/7993/feet////', mean: 108000 },
          ],
        },
      },
    })
    const result = normalizeRaidbotsReport('abc', report)
    expect(result.items).toHaveLength(1)
    expect(result.items.find((i) => i.encounterId === -97)).toBeUndefined()
    expect(result.warnings).toContain('Trash Drop entries removed (1)')
  })

  it('parses the catalyst source id from the trailing slash segment', () => {
    const report = makeReport({
      sim: {
        players: [{ collected_data: { dps: { mean: BASELINE } } }],
        profilesets: {
          metric: 'Damage per Second',
          results: [
            { name: '1320/2888/raid-vault-heroic/271483/334/7959/head////268230', mean: 112000 },
          ],
        },
      },
      simbot: {
        ...makeReport().simbot,
        meta: {
          ...makeReport().simbot.meta,
          itemLibrary: [{ id: 271483, name: 'Serpent Crown of the Ophidian Oracle' }],
          instanceLibrary: [
            {
              id: 1320,
              name: 'The Venomous Abyss',
              encounters: [{ id: 2888, name: "Nek'zali the Soulcoiler" }],
            },
          ],
        },
      },
    })
    const result = normalizeRaidbotsReport('abc', report)
    expect(result.items[0].catalystSourceId).toBe(268230)
  })

  it('does not set catalystSourceId for a normal (non-catalyst) row', () => {
    const result = normalizeRaidbotsReport('abc', makeReport())
    expect(result.items[0].catalystSourceId).toBeUndefined()
  })

  it('emits one item per (itemId, encounterId) pair when a tier token drops from multiple bosses', () => {
    const report = makeReport({
      sim: {
        players: [{ collected_data: { dps: { mean: BASELINE } } }],
        profilesets: {
          metric: 'Damage per Second',
          results: [
            { name: '1320/2895/raid-vault-heroic/271483/334/0/head////', mean: 111000 },
            { name: '1320/2888/raid-vault-heroic/271483/334/0/head////', mean: 109000 },
          ],
        },
      },
      simbot: {
        ...makeReport().simbot,
        meta: {
          ...makeReport().simbot.meta,
          itemLibrary: [{ id: 271483, name: 'Serpent Crown of the Ophidian Oracle' }],
          instanceLibrary: [
            {
              id: 1320,
              name: 'The Venomous Abyss',
              encounters: [
                { id: 2895, name: "Ula'tek" },
                { id: 2888, name: "Nek'zali the Soulcoiler" },
              ],
            },
          ],
        },
      },
    })
    const result = normalizeRaidbotsReport('abc', report)
    expect(result.items).toHaveLength(2)
    expect(result.items.map((i) => i.encounterId).sort()).toEqual([2888, 2895])
    expect(result.items.every((i) => i.itemId === 271483)).toBe(true)
  })

  it('falls back to a placeholder encounter name and warns when the encounter has no mapping', () => {
    const report = makeReport({
      sim: {
        players: [{ collected_data: { dps: { mean: BASELINE } } }],
        profilesets: {
          metric: 'Damage per Second',
          results: [{ name: '1320/9999/raid-vault-heroic/271484/334/0/hands////', mean: 110000 }],
        },
      },
    })
    const result = normalizeRaidbotsReport('abc', report)
    expect(result.items[0].encounterName).toBe('Encounter 9999')
    expect(result.warnings).toContain('1 items had no encounter mapping')
  })

  it('resolves rows pointed at an aggregate/catalyst bucket (negative instanceId) via the seed tier fallback', () => {
    const report = makeReport({
      sim: {
        players: [{ collected_data: { dps: { mean: BASELINE } } }],
        profilesets: {
          metric: 'Damage per Second',
          results: [{ name: '-100/-100/raid-vault-heroic/271483/334/0/head////', mean: 110000 }],
        },
      },
      simbot: {
        ...makeReport().simbot,
        meta: {
          ...makeReport().simbot.meta,
          rawFormData: { droptimizer: { instance: 1320, difficulty: 'raid-vault-heroic' } },
          itemLibrary: [{ id: 271483, name: 'Serpent Crown of the Ophidian Oracle', itemSetId: 2065 }],
          instanceLibrary: [
            {
              id: 1320,
              name: 'The Venomous Abyss',
              encounters: [
                { id: 2887, name: 'The Twin Fangs' },
                { id: 2895, name: "Ula'tek" },
              ],
            },
          ],
        },
      },
    })
    const result = normalizeRaidbotsReport('abc', report)
    expect(result.items.map((i) => i.encounterId).sort()).toEqual([2887, 2895])
    expect(result.items.every((i) => i.itemId === 271483 && i.instanceId === 1320 && i.tierSlot === 'head')).toBe(true)
    expect(result.items.find((i) => i.encounterId === 2895)?.viaCurio).toBe(true)
    expect(result.items.find((i) => i.encounterId === 2887)?.viaCurio).toBe(false)
  })

  it('drops and warns when an aggregate-bucket row has no seed tier mapping', () => {
    const report = makeReport({
      sim: {
        players: [{ collected_data: { dps: { mean: BASELINE } } }],
        profilesets: {
          metric: 'Damage per Second',
          results: [{ name: '-100/-100/raid-vault-heroic/999999/334/0/waist////', mean: 110000 }],
        },
      },
    })
    const result = normalizeRaidbotsReport('abc', report)
    expect(result.items).toHaveLength(0)
    expect(result.warnings).toContain('1 items had no encounter mapping')
  })

  it('derives role from spec, marking tank specs as tank and others as dps', () => {
    const dpsResult = normalizeRaidbotsReport('abc', makeReport())
    expect(dpsResult.role).toBe('dps')

    const tankReport = makeReport()
    tankReport.simbot.spec = 'Protection'
    const tankResult = normalizeRaidbotsReport('abc', tankReport)
    expect(tankResult.role).toBe('tank')
    expect(tankResult.spec).toBe('protection')
  })
})
