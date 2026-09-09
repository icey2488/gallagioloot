// Single source of truth for tooltip copy attached to jargon terms across the app.
// Edit here -- the Tooltip component and every screen that uses a term pull from
// this file rather than hardcoding copy inline.
export type GlossaryTerm = 'threshold' | 'ev' | 'rollsToTarget' | 'tossUp' | 'deployable' | 'knockout' | 'specSpecific' | 'lootSpec'

export const GLOSSARY: Record<GlossaryTerm, { label: string; copy: string }> = {
  threshold: {
    label: 'Threshold',
    copy: 'The minimum expected gain, as % of your sim baseline, for a roll to be worth spending. Below it, take the tokens. Default 0.2%; adjust in settings.',
  },
  ev: {
    label: 'EV',
    copy: "Expected gain if you roll this boss: average of every remaining item's gain, since a Voidcore picks uniformly from what you haven't received.",
  },
  rollsToTarget: {
    label: 'Rolls to target',
    copy: "How many rolls, on average, until this specific item lands, given the pool shrinks with each miss. 'Up to' is the worst case.",
  },
  tossUp: {
    label: 'Toss-up',
    copy: 'These bosses are within sim noise of each other. Roll whichever you kill first.',
  },
  deployable: {
    label: 'Rollable',
    copy: 'A boss you expect to kill this week whose expected gain clears your threshold. Worth a Voidcore.',
  },
  knockout: {
    label: 'Knockout',
    copy: 'Items you have already received from a Voidcore at this difficulty. They cannot drop again this cycle, so they leave the pool.',
  },
  specSpecific: {
    label: 'Spec-specific',
    copy: 'This item only drops for certain specs, so a knockout for it only counts for the loot spec you rolled with.',
  },
  lootSpec: {
    label: 'Loot spec',
    copy: 'The spec the game uses to decide what you can receive. Set it in-game before you roll; this tool must match it.',
  },
}
