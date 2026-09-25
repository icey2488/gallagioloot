import { describe, expect, it } from 'vitest'
import type { BossEval } from '@engine/core/types'
import type { LootTable } from '@engine/types'
import { orderBossEvals } from '../src/lib/bossOrder'
import table1320 from '../design/fixtures/loot-table-1320-62.json'

const boss = (encounterId: number, encounterName: string, evPct: number, extra: Partial<BossEval> = {}): BossEval =>
  ({ encounterId, encounterName, instanceId: 1320, pool: [], remaining: 1, rollsSpent: 0, rollsAttributed: 0, rollsUnattributed: 0, ev: 0, evPct, bestCase: null, deployable: true, notes: [], ...extra }) as BossEval

// EV order as the engine returns it, per the live raid report.
const EV_ORDER = [
  boss(2882, 'Vashnik the Malignant', 0.9),
  boss(2871, 'Sszorak', 0.85),
  boss(2888, "Nek'zali the Soulcoiler", 0.8),
  boss(2894, 'The Lost Explorers', 0.7),
  boss(2887, 'The Twin Fangs', 0.6),
  boss(2874, 'Entombed Sentinels', 0.5),
  boss(2895, "Ula'tek", 0.4),
  boss(2883, 'The Coiled Altar', 0.3),
]

describe('orderBossEvals', () => {
  it('raid: The Venomous Abyss (1320) follows Adventure Journal order, not EV order', () => {
    const ordered = orderBossEvals(EV_ORDER, 'raid', table1320 as unknown as LootTable)
    expect(ordered.map((b) => b.encounterName)).toEqual([
      "Nek'zali the Soulcoiler",
      'Entombed Sentinels',
      'The Lost Explorers',
      'Vashnik the Malignant',
      'Sszorak',
      'The Twin Fangs',
      'The Coiled Altar',
      "Ula'tek",
    ])
  })

  it('raid: without a loot table the incoming (EV) order is kept; unknown bosses go last', () => {
    expect(orderBossEvals(EV_ORDER, 'raid', null).map((b) => b.encounterId)).toEqual(EV_ORDER.map((b) => b.encounterId))
    const withUnknown = [boss(9999, 'Mystery', 5), ...EV_ORDER]
    const ordered = orderBossEvals(withUnknown, 'raid', table1320 as unknown as LootTable)
    expect(ordered[ordered.length - 1].encounterName).toBe('Mystery')
    expect(ordered[0].encounterName).toBe("Nek'zali the Soulcoiler")
  })

  it('mplus: dungeons sorted alphabetically, ties by key level', () => {
    const d = (id: number, name: string, keyLevel?: number) => boss(id, name, 1, { kind: 'mplus', keyLevel })
    const ordered = orderBossEvals([d(1313, 'Voidscar Arena'), d(1322, 'Altar of Fangs', 12), d(1309, 'The Blinding Vale'), d(1322, 'Altar of Fangs', 10)], 'mplus', null)
    expect(ordered.map((b) => `${b.encounterName}${b.keyLevel ?? ''}`)).toEqual(['Altar of Fangs10', 'Altar of Fangs12', 'The Blinding Vale', 'Voidscar Arena'])
  })
})
