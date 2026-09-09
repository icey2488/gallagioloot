// Reproducible WCAG 2.1 contrast audit for every color pair used in web/src/theme.css.
// Run with `npx tsx design/contrast.mts` from web/. Writes design/contrast-report.md
// and prints the same table to stdout. No dependencies beyond Node's fs.
import { writeFileSync } from 'node:fs'

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.substring(i, i + 2), 16)) as [number, number, number]
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b)
}

/** WCAG contrast ratio between two colors, order-independent (always lighter-over-darker). */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1))
  const l2 = relativeLuminance(hexToRgb(hex2))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
}

export type WcagRequirement = 'text' | 'large-text' | 'ui'

const REQUIREMENT_THRESHOLD: Record<WcagRequirement, number> = {
  text: 4.5,
  'large-text': 3,
  ui: 3,
}

export function passesWCAG(ratio: number, requirement: WcagRequirement): boolean {
  return ratio >= REQUIREMENT_THRESHOLD[requirement]
}

/**
 * Simulates CSS `opacity` on top of a background: the rendered color is a linear
 * blend of the foreground and whatever's behind it. Used to check de-emphasized
 * (faded) UI, where the *effective* on-screen color -- not the source hex -- is what
 * actually needs to clear the contrast floor.
 */
export function blendOverBackground(fgHex: string, bgHex: string, opacity: number): string {
  const fg = hexToRgb(fgHex)
  const bg = hexToRgb(bgHex)
  const blended = fg.map((c, i) => Math.round(opacity * c + (1 - opacity) * bg[i])) as [number, number, number]
  return '#' + blended.map((c) => c.toString(16).padStart(2, '0')).join('')
}

type Pair = {
  name: string
  fg: string
  bg: string
  requirement: WcagRequirement
  note?: string
}

// Every color pair actually rendered in web/src/theme.css and the components that
// consume it, grouped by where it shows up. `fg`/`bg` are the CURRENT (post-fix) hex
// values -- see contrast-report.md for the before/after on the ones that changed.
const COLORS = {
  bgBase: '#0b1530',
  bgPanel: '#121f42',
  bgPanelAlt: '#16264c',
  border: '#5870aa',
  borderStrong: '#647aad',
  text: '#f5f3ec',
  textSecondary: '#b7bdda',
  textMuted: '#858fb0',
  gold: '#d4af37',
  goldStrong: '#e4c158',
  goldTextOn: '#17110a',
  warnBg: '#3a2a12',
  warnBorder: '#996f2b',
  warnText: '#e8c98a',
  badgeYesBorder: '#467655',
  badgeYesText: '#8fd6a4',
}

const PAIRS: Pair[] = [
  { name: 'Body text on page background', fg: COLORS.text, bg: COLORS.bgBase, requirement: 'text' },
  { name: 'Body text on panel', fg: COLORS.text, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Body text on input/select fill', fg: COLORS.text, bg: COLORS.bgPanelAlt, requirement: 'text' },
  { name: 'Secondary text on panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Secondary text on page background', fg: COLORS.textSecondary, bg: COLORS.bgBase, requirement: 'text' },
  { name: 'Secondary text on input/select fill', fg: COLORS.textSecondary, bg: COLORS.bgPanelAlt, requirement: 'text' },
  { name: 'Muted text (field hint, eyebrow, badge-no) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Muted text on page background', fg: COLORS.textMuted, bg: COLORS.bgBase, requirement: 'text' },
  { name: 'Muted text on input/select fill', fg: COLORS.textMuted, bg: COLORS.bgPanelAlt, requirement: 'text' },
  { name: 'Footer disclaimer text on footer background (13px)', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Excluded-row reason text on panel (de-emphasized, no opacity)', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  {
    name: 'Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel)',
    fg: blendOverBackground('#7c86aa', COLORS.bgPanel, 0.7),
    bg: COLORS.bgPanel,
    requirement: 'text',
    note: 'Pre-fix behavior, kept here to document the regression this audit caught.',
  },
  { name: 'Panel/input border on panel', fg: COLORS.border, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Panel/input border on input/select fill', fg: COLORS.border, bg: COLORS.bgPanelAlt, requirement: 'ui' },
  { name: 'Panel/input border on page background', fg: COLORS.border, bg: COLORS.bgBase, requirement: 'ui' },
  { name: 'Button border / focus ring on panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Button border / focus ring on input/select fill', fg: COLORS.borderStrong, bg: COLORS.bgPanelAlt, requirement: 'ui' },
  { name: 'Button border / focus ring on page background', fg: COLORS.borderStrong, bg: COLORS.bgBase, requirement: 'ui' },
  { name: 'Gold headline text on panel (rec-card)', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'large-text' },
  { name: 'Gold card border on panel', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Gold card border on page background', fg: COLORS.gold, bg: COLORS.bgBase, requirement: 'ui' },
  { name: 'btn-gold label text on gold fill', fg: COLORS.goldTextOn, bg: COLORS.gold, requirement: 'text' },
  { name: 'btn-gold:hover label text on gold-strong fill', fg: COLORS.goldTextOn, bg: COLORS.goldStrong, requirement: 'text' },
  { name: 'Warning banner text on warning background', fg: COLORS.warnText, bg: COLORS.warnBg, requirement: 'text' },
  { name: 'Warning banner border on warning background', fg: COLORS.warnBorder, bg: COLORS.warnBg, requirement: 'ui' },
  { name: 'Badge-yes text on panel', fg: COLORS.badgeYesText, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Badge-yes border on panel', fg: COLORS.badgeYesBorder, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Badge-no text (muted) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Badge-no border on panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Chip-stack glyph (bottom bar) on header panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Chip-stack glyph (mid bar) on header panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Chip-stack glyph (top bar) on header panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'ui' },
  // Term tooltips (Feature 2, 2026-09-08) -- reuses existing palette variables only
  // (no new colors introduced), but listed explicitly so the tooltip's specific pairs
  // are traceable in this audit rather than only inferred from the rows above.
  { name: 'Tooltip trigger underline on panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Tooltip info icon on panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Tooltip bubble text on tooltip bubble background', fg: COLORS.text, bg: COLORS.bgPanelAlt, requirement: 'text' },
  { name: 'Tooltip bubble border on tooltip bubble background', fg: COLORS.borderStrong, bg: COLORS.bgPanelAlt, requirement: 'ui' },
]

// Every CSS variable/rule this audit changed, old -> new, with why. Kept here (rather
// than only in git history) so the report is self-contained.
const CHANGES: Array<{ what: string; before: string; after: string; why: string }> = [
  { what: '--border', before: '#26355e', after: COLORS.border, why: 'was 1.24-1.51:1 against panel/input/page backgrounds, under the 3:1 UI-component floor' },
  {
    what: '--border-strong',
    before: '#34467a',
    after: COLORS.borderStrong,
    why: 'was 1.63-1.98:1 against panel/input/page backgrounds; also the focus-ring color, so this doubled as the focus-ring fix',
  },
  { what: '--text-muted', before: '#7c86aa', after: COLORS.textMuted, why: 'was 4.13-4.50:1 -- under 4.5:1 on panel and well under it on the input/select fill' },
  { what: '.warning-banner border', before: '#6b4e1e', after: COLORS.warnBorder, why: 'was 1.80:1 against the warning background, under the 3:1 floor' },
  { what: '.badge-yes border-color', before: '#3f6b4d', after: COLORS.badgeYesBorder, why: 'was 2.63:1 against panel, under the 3:1 floor' },
  {
    what: 'tr.excluded td opacity',
    before: '0.7 (blended to ~2.90:1 against panel)',
    after: 'removed -- de-emphasis is font-style: italic only, color unchanged',
    why: "opacity fades the rendered color toward the background, which silently drops de-emphasized text below the readable floor -- exactly what this audit's job was to catch",
  },
  { what: '.app-footer font-size', before: '11px', after: '13px', why: 'disclaimer text must not go below 13px regardless of ratio' },
  {
    what: '.app-footer focus handling',
    before: 'not focusable (axe: scrollable-region-focusable)',
    after: 'tabIndex={0} + focus-visible outline (reuses --border-strong, now passing)',
    why: 'the footer is a scrollable region (overflow-y: auto, capped height) that had no keyboard path to it',
  },
  {
    what: 'Gold on navy (card text + border)',
    before: '#d4af37 on #121f42, 7.68:1',
    after: 'unchanged -- already passing',
    why: 'audited because the brief called it out explicitly, but it already clears both the 4.5:1 text and 3:1 border floors with margin to spare',
  },
]

function requirementLabel(r: WcagRequirement): string {
  return r === 'text' ? '4.5:1 (text)' : r === 'large-text' ? '3:1 (large text)' : '3:1 (UI component)'
}

function main() {
  const rows = PAIRS.map((p) => {
    const ratio = contrastRatio(p.fg, p.bg)
    const pass = passesWCAG(ratio, p.requirement)
    return { ...p, ratio, pass }
  })

  const passCount = rows.filter((r) => r.pass).length
  const failCount = rows.length - passCount

  const lines: string[] = []
  lines.push('# Contrast audit')
  lines.push('')
  lines.push(
    `Computed with \`design/contrast.mts\` (WCAG 2.1 relative-luminance formula, no eyeballing). ${passCount}/${rows.length} pairs pass; ${failCount} fail.`
  )
  lines.push('')
  lines.push('## Changes made')
  lines.push('')
  lines.push('| What | Before | After | Why |')
  lines.push('|---|---|---|---|')
  for (const c of CHANGES) {
    lines.push(`| ${c.what} | ${c.before} | ${c.after} | ${c.why} |`)
  }
  lines.push('')
  lines.push('## All pairs')
  lines.push('')
  lines.push('| Pair | Foreground | Background | Ratio | Requirement | Pass |')
  lines.push('|---|---|---|---|---|---|')
  for (const r of rows) {
    const note = r.note ? ` (${r.note})` : ''
    lines.push(`| ${r.name}${note} | \`${r.fg}\` | \`${r.bg}\` | ${r.ratio.toFixed(2)}:1 | ${requirementLabel(r.requirement)} | ${r.pass ? '✅' : '❌'} |`)
  }
  lines.push('')

  const failing = rows.filter((r) => !r.pass)
  if (failing.length > 0) {
    lines.push('## Failing pairs')
    lines.push('')
    for (const r of failing) {
      lines.push(`- **${r.name}**: ${r.ratio.toFixed(2)}:1, needs ${requirementLabel(r.requirement)}`)
    }
    lines.push('')
  }

  lines.push('## axe-core (Playwright), all 5 screens, live fixture')
  lines.push('')
  lines.push(
    'Run via `npx tsx design/renderScreens.tsx && npx tsx design/screenshotAndAudit.mts` -- statically renders paste/deployability/roll/reconcile/loot-table with the live Raidbots fixture (+ the loot-table fixture at Elemental, generated by `scripts/fetch-live-fixtures.mts`), then runs `@axe-core/playwright` (wcag2a/wcag2aa/wcag21a/wcag21aa tags) against each.'
  )
  lines.push('')
  lines.push('| Screen | Before (serious/critical) | After |')
  lines.push('|---|---|---|')
  lines.push('| paste | 1 (`scrollable-region-focusable` on footer) | 0 |')
  lines.push('| deployability | 1 (`scrollable-region-focusable` on footer) | 0 |')
  lines.push('| roll | 1 (`scrollable-region-focusable` on footer) | 0 |')
  lines.push('| reconcile | 1 (`scrollable-region-focusable` on footer) | 0 |')
  lines.push('| loot-table (new, Feature 1/2, 2026-09-08) | n/a (new screen) | 0 |')
  lines.push('| **total** | **4** | **0** |')
  lines.push('')
  lines.push(
    'Fix: the footer is a scrollable region (`overflow-y: auto`, capped `max-height`) with no keyboard path to it. Added `tabIndex={0}` to `<footer>` and a `:focus-visible` outline (reusing the now-passing `--border-strong`).'
  )
  lines.push('')

  const report = lines.join('\n')
  console.log(report)
  writeFileSync(new URL('./contrast-report.md', import.meta.url), report + '\n')
}

main()
