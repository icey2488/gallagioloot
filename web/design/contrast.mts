// Reproducible WCAG 2.1 contrast audit for every color pair used in web/src/theme.css.
// Run with `npx tsx design/contrast.mts` from web/. Writes design/contrast-report.md
// and prints the same table to stdout. No dependencies beyond Node's fs.
import { readFileSync, writeFileSync } from 'node:fs'

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
// The palettes are READ FROM src/theme.css (:root = Midnight, :root[data-theme='...'] = the others), so the audit
// cannot drift from what ships. Tokens a theme block doesn't define (the warn-*/ok-* status colors) fall back to :root.
export const THEME_LABELS = { midnight: 'Midnight', green: 'Felt green', red: 'Craps red' } as const
export type ThemeId = keyof typeof THEME_LABELS

const CSS = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8')

function tokensOf(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector + ' {')
  if (start < 0) throw new Error('theme.css has no ' + selector + ' block')
  const end = CSS.indexOf('\n}', start)
  const body = CSS.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase()
  return out
}

function colorsFor(theme: ThemeId) {
  const t = { ...tokensOf(':root'), ...(theme === 'midnight' ? {} : tokensOf(":root[data-theme='" + theme + "']")) }
  const need = (k: string) => {
    if (!t[k]) throw new Error('missing token ' + k + ' for ' + theme)
    return t[k]
  }
  return {
    bgBase: need('--bg-base'),
    bgPanel: need('--bg-panel'),
    bgPanelAlt: need('--bg-panel-alt'),
    bgHover: need('--bg-hover'),
    border: need('--border'),
    borderStrong: need('--border-strong'),
    text: need('--text'),
    textSecondary: need('--text-secondary'),
    textMuted: need('--text-muted'),
    gold: need('--gold'),
    goldStrong: need('--gold-strong'),
    goldTextOn: need('--gold-text-on'),
    warnBg: need('--warn-bg'),
    warnBorder: need('--warn-border'),
    warnText: need('--warn-text'),
    badgeYesBorder: need('--ok-border'),
    badgeYesText: need('--ok-text'),
  }
}
type Colors = ReturnType<typeof colorsFor>


function buildPairs(COLORS: Colors): Pair[] {
return [
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
  { name: 'Footer "Show/Hide assumptions" summary toggle text on footer background', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
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
  { name: 'Below-threshold roll flag (warn text) on the rec-card panel (v2.09 roll list)', fg: COLORS.warnText, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Warning banner border on panel (the banner sits on the panel fill)', fg: COLORS.warnBorder, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Warning banner border on warning background', fg: COLORS.warnBorder, bg: COLORS.warnBg, requirement: 'ui' },
  { name: 'Badge-yes text on panel', fg: COLORS.badgeYesText, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Badge-yes border on panel', fg: COLORS.badgeYesBorder, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Badge-no text (muted) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Badge-no border on panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  // Report URL rows (v2.13): + / - controls and the per-row status lines. Existing tokens only; listed so the new
  // locations are traceable. (The disabled "+" at 8 rows is exempt from WCAG contrast, but its "Max 8 reports" hint is muted text on panel, above.)
  { name: 'Report row +/- control label on panel', fg: COLORS.text, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Report row +/- control label on hover fill (--bg-hover)', fg: COLORS.text, bg: COLORS.bgHover, requirement: 'text' },
  { name: 'Report row +/- control border and focus ring on panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Report row error status (warn text) on panel', fg: COLORS.warnText, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Report row loaded status (ok text) on panel', fg: COLORS.badgeYesText, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Report row invalid-input border (warn border) on input fill', fg: COLORS.warnBorder, bg: COLORS.bgPanelAlt, requirement: 'ui' },
  // Footer version stamp (v2.14, License link added v2.15): "v2.15 · <sha> · Source · License". Muted text with the global secondary-text links, a --border hairline above it, and the
  // --border-strong focus ring on the links. Existing tokens only; listed so the new locations are traceable.
  { name: 'Footer stamp text (version, separators) on footer background (13px)', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Footer stamp links (sha, Source, License) on footer background (13px)', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Footer stamp rule (--border) on footer background', fg: COLORS.border, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Footer stamp link focus ring on footer background', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Chip-stack glyph (bottom bar) on header panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Chip-stack glyph (mid bar) on header panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Chip-stack glyph (top bar) on header panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'ui' },
  // Term tooltips (Feature 2, 2026-09-08) -- reuses existing palette variables only
  // (no new colors introduced), but listed explicitly so the tooltip's specific pairs
  // are traceable in this audit rather than only inferred from the rows above.
  { name: 'Tooltip trigger underline on panel', fg: COLORS.borderStrong, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Tooltip info icon on panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Tooltip bubble text on tooltip bubble background', fg: COLORS.text, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Tooltip bubble border on tooltip bubble background', fg: COLORS.border, bg: COLORS.bgPanel, requirement: 'ui' },
  // Design pass (2026-09-09) -- card/deployability redesign pulled from the Claude Design
  // export. No new hex values were introduced (every design color mapped cleanly onto an
  // existing token), but these are new element/background pairings, so audited explicitly.
  { name: 'Deployable dot fill on panel', fg: COLORS.text, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Not-deployable dot ring on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Vault-compare winner border (gold) on compare-option fill', fg: COLORS.gold, bg: COLORS.bgPanelAlt, requirement: 'ui' },
  { name: 'Vault-compare winner label (gold) on compare-option fill', fg: COLORS.gold, bg: COLORS.bgPanelAlt, requirement: 'text' },
  { name: 'Rec-card verb/meta (secondary text) on panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  // Design pass (2026-09-09, full-app parity) -- IBM Plex Sans + the panel/table/meta
  // language extended to every screen. No new hex values introduced here either; every
  // new element reuses an existing token, but each is a new UI location so audited
  // explicitly, same rationale as the tooltip block above.
  { name: 'Screen-header meta (Rollable Bosses/Loot Table threshold+spec line) on panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Footer aside column (Delves/Prey Hunts note) text on footer background', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Reconcile knockout-list Scope dot fill (all-specs) on panel', fg: COLORS.text, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Reconcile knockout-list Scope dot ring (spec-only) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Item-tag (Tier/Curio small-caps meta) text on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'btn-secondary label text on panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'btn-secondary border on panel', fg: COLORS.border, bg: COLORS.bgPanel, requirement: 'ui' },
  // v2 design pass (2026-09-10) -- header nav tabs, Paste run-settings sidebar, and the
  // Loot Table boss list. No new hex values beyond --bg-hover (already used for
  // .btn-secondary:hover/.app-header__controls hover states, just not previously listed
  // here); every other element reuses an already-audited token.
  { name: 'Nav tab label (secondary text) on header panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Active nav tab / active boss-list item text on hover fill (--bg-hover)', fg: COLORS.text, bg: COLORS.bgHover, requirement: 'text' },
  { name: 'Run-settings sidebar border on its own panel fill', fg: COLORS.border, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Stat-trio label (muted) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Loot boss list rank (muted) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  // Paste-screen redesign (2026-09-10) -- two-column layout live from first paint,
  // light-filled primary button, and disabled placeholder selects before a report loads.
  { name: 'Light-filled primary button (Fetch report / Price my roll) label on off-white fill', fg: COLORS.bgBase, bg: COLORS.text, requirement: 'text' },
  { name: 'Disabled Loot spec/Difficulty placeholder text ("From report") on input fill', fg: COLORS.textMuted, bg: COLORS.bgPanelAlt, requirement: 'text' },
  // Paste pre-report empty state (v3 mockup "3a", 2026-09-10) -- dashed-border card
  // replacing the single "Paste a report to begin." sentence, plus a hint line under the
  // disabled Fetch button and an explicit input/textarea placeholder color. No new hex
  // values: every element reuses an already-defined token, audited here as new locations.
  { name: 'Paste empty-state title text on panel', fg: COLORS.text, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Paste empty-state description text on panel', fg: COLORS.textSecondary, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Paste empty-state dashed border on panel', fg: COLORS.border, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Disabled Fetch button hint ("Needs a report URL") on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Input/textarea placeholder text on input fill', fg: COLORS.textSecondary, bg: COLORS.bgPanelAlt, requirement: 'text' },
  // v4 gold-accent pass (2026-09-20) -- one gold touch added per screen (Paste/Reconcile/
  // Loot table/Recommendation), confined to that screen's own card per the hard-rule
  // override on top of the v4 mockup (which put gold on the wordmark, nav, icons,
  // checkboxes and dots everywhere -- not reproduced here). No new hex values: every
  // touch reuses --gold/--gold-strong/--gold-text-on, already audited above for
  // .btn-gold/.rec-card; these are just new consumers/locations, audited explicitly.
  { name: 'Paste screen primary button (Fetch report / Price my roll) label on gold fill', fg: COLORS.goldTextOn, bg: COLORS.gold, requirement: 'text' },
  { name: 'Paste screen primary button label on gold-strong hover fill', fg: COLORS.goldTextOn, bg: COLORS.goldStrong, requirement: 'text' },
  { name: 'Reconcile screen Confirm button label on gold fill', fg: COLORS.goldTextOn, bg: COLORS.gold, requirement: 'text' },
  { name: 'Loot table selected-row gold inset stripe on hover fill (--bg-hover)', fg: COLORS.gold, bg: COLORS.bgHover, requirement: 'ui' },
  { name: 'Recommendation screen "Rollable Bosses" heading gold bar on panel', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'ui' },
  // v4a gold-accent pass (2026-09-20, full mockup parity) -- every gold element the v4
  // mockup drew that the prior pass declined under the now-retired one-accent-per-screen
  // rule (see CLAUDE.md's "Design (web/)" section for the replacement rule). No new hex
  // values: every element below reuses --gold/--gold-strong/--gold-text-on, all already
  // audited above; these rows just cover the new consumers/locations.
  { name: 'App wordmark (gold text) on header panel', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Active nav-tab gold underline (inset box-shadow) on hover fill (--bg-hover)', fg: COLORS.gold, bg: COLORS.bgHover, requirement: 'ui' },
  { name: 'Header Voidcores pill count (gold text) on header panel', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Voidcores chip-stack glyph (gold stroke) on header panel', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Checked checkbox (accent-color gold) on panel', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Checked checkbox (accent-color gold) on input/select fill', fg: COLORS.gold, bg: COLORS.bgPanelAlt, requirement: 'ui' },
  { name: 'Deployability "Yes" status dot (gold fill) on panel', fg: COLORS.gold, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold fill', fg: COLORS.goldTextOn, bg: COLORS.gold, requirement: 'text' },
  { name: 'Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold-strong hover fill', fg: COLORS.goldTextOn, bg: COLORS.goldStrong, requirement: 'text' },
  // v4b darker-base pass (2026-09-20) -- palette swap to the mockup's darker base (see
  // theme.css :root comment) plus the pre-fetch "Fetch report" outline button
  // (transparent fill over its parent .run-settings-panel, which is --bg-panel).
  { name: 'Outline "Fetch report" button label (enabled) on panel', fg: COLORS.text, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Outline "Fetch report" button border (enabled) on panel', fg: COLORS.border, bg: COLORS.bgPanel, requirement: 'ui' },
  { name: 'Outline "Fetch report" button label (disabled) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  // Top Gear vault-item field (2026-09-20) -- replaces the old manual "Best vault item
  // gain %" number input. Reuses the existing field-hint token (--text-muted on panel)
  // for both the auto-filled "Vault item: name · +pct% · boss" summary line and the
  // smaller "Also added: ..." extra-candidates line nested inside it (11px, no new
  // color -- inherits the parent field-hint's color, so it clears the same 4.5:1 floor
  // as the parent, stricter than the 3:1 large-text floor its own size would allow).
  { name: 'Top Gear "Vault item: name · pct% · boss" summary line on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
  { name: 'Top Gear "Also added: ..." extra-candidates line (11px, inherits parent color) on panel', fg: COLORS.textMuted, bg: COLORS.bgPanel, requirement: 'text' },
]
}

// Every CSS variable/rule this audit changed, old -> new, with why. Kept here (rather
// than only in git history) so the report is self-contained.
const CHANGES = (COLORS: Colors): Array<{ what: string; before: string; after: string; why: string }> => [
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
  {
    what: 'v2.12 Midnight gold set (--gold/--gold-strong/--gold-text-on/--bg-hover) + two new themes',
    before: '#d4af37 / #e4c158 / #17110a / #12203c',
    after: [COLORS.gold, COLORS.goldStrong, COLORS.goldTextOn, COLORS.bgHover].join(' / '),
    why: "adopted the Claude Design export's brighter gold; Felt green and Craps red added as data-theme token sets; every pair re-audited on all three",
  },
  {
    what: 'v4b darker-base palette swap (--bg-base/--bg-panel/--bg-panel-alt/--bg-hover/--border/--border-strong/--text/--text-secondary/--text-muted)',
    before: '#0b1530 / #121f42 / #16264c / #1b2c56 / #5870aa / #647aad / #f5f3ec / #b7bdda / #858fb0',
    after: '#06101f / #0b1426 / #0f1a33 / #12203c / #6b7a9c / #6b7a9c / #eef1f7 / #a3afca / #a3afca',
    why: 'adopted the darker base palette from the "GallagioLoot UI Redesign v4" mockup; re-ran every pair against the new values, all pass (see table below) with no further nudging needed',
  },
]

function requirementLabel(r: WcagRequirement): string {
  return r === 'text' ? '4.5:1 (text)' : r === 'large-text' ? '3:1 (large text)' : '3:1 (UI component)'
}

function main() {
  const themes = Object.keys(THEME_LABELS) as ThemeId[]
  const results = themes.map((theme) => {
    const colors = colorsFor(theme)
    const rows = buildPairs(colors).map((p) => {
      const ratio = contrastRatio(p.fg, p.bg)
      return { ...p, ratio, pass: passesWCAG(ratio, p.requirement) }
    })
    return { theme, colors, rows }
  })
  // The one documented pre-fix regression example is EXPECTED to fail (it exists to show what the audit caught).
  const isHistorical = (name: string) => name.includes('OLD approach')
  const failing = results.flatMap((r) => r.rows.filter((x) => !x.pass && !isHistorical(x.name)).map((x) => ({ theme: r.theme, ...x })))

  const lines: string[] = []
  lines.push('# Contrast audit')
  lines.push('')
  lines.push(
    'Computed with `design/contrast.mts` (WCAG 2.1 relative-luminance formula, no eyeballing) for every theme (v2.12: Midnight, Felt green, Craps red). Palettes are read from `src/theme.css`, so this cannot drift from what ships.'
  )
  lines.push('')
  lines.push('| Theme | Pairs | Pass | Fail (excluding the documented pre-fix example) |')
  lines.push('|---|---|---|---|')
  for (const r of results) {
    const fails = r.rows.filter((x) => !x.pass && !isHistorical(x.name)).length
    lines.push(`| ${THEME_LABELS[r.theme]} | ${r.rows.length} | ${r.rows.filter((x) => x.pass).length} | ${fails} |`)
  }
  lines.push('')
  lines.push('## Changes made')
  lines.push('')
  lines.push('| What | Before | After | Why |')
  lines.push('|---|---|---|---|')
  for (const c of CHANGES(results[0].colors)) {
    lines.push(`| ${c.what} | ${c.before} | ${c.after} | ${c.why} |`)
  }
  for (const r of results) {
    lines.push('')
    lines.push(`## ${THEME_LABELS[r.theme]} -- all pairs`)
    lines.push('')
    lines.push('| Pair | Foreground | Background | Ratio | Requirement | Pass |')
    lines.push('|---|---|---|---|---|---|')
    for (const x of r.rows) {
      const note = x.note ? ` (${x.note})` : ''
      const mark = x.pass ? '✅' : isHistorical(x.name) ? '❌ (expected)' : '❌'
      lines.push(`| ${x.name}${note} | \`${x.fg}\` | \`${x.bg}\` | ${x.ratio.toFixed(2)}:1 | ${requirementLabel(x.requirement)} | ${mark} |`)
    }
  }
  lines.push('')

  if (failing.length > 0) {
    lines.push('## Failing pairs')
    lines.push('')
    for (const r of failing) {
      lines.push(`- **${THEME_LABELS[r.theme]}: ${r.name}**: ${r.ratio.toFixed(2)}:1, needs ${requirementLabel(r.requirement)}`)
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
  if (failing.length > 0) process.exit(1)
}

main()
