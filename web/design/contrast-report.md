# Contrast audit

Computed with `design/contrast.mts` (WCAG 2.1 relative-luminance formula, no eyeballing). 77/78 pairs pass; 1 fail.

## Changes made

| What | Before | After | Why |
|---|---|---|---|
| --border | #26355e | #6b7a9c | was 1.24-1.51:1 against panel/input/page backgrounds, under the 3:1 UI-component floor |
| --border-strong | #34467a | #6b7a9c | was 1.63-1.98:1 against panel/input/page backgrounds; also the focus-ring color, so this doubled as the focus-ring fix |
| --text-muted | #7c86aa | #a3afca | was 4.13-4.50:1 -- under 4.5:1 on panel and well under it on the input/select fill |
| .warning-banner border | #6b4e1e | #996f2b | was 1.80:1 against the warning background, under the 3:1 floor |
| .badge-yes border-color | #3f6b4d | #467655 | was 2.63:1 against panel, under the 3:1 floor |
| tr.excluded td opacity | 0.7 (blended to ~2.90:1 against panel) | removed -- de-emphasis is font-style: italic only, color unchanged | opacity fades the rendered color toward the background, which silently drops de-emphasized text below the readable floor -- exactly what this audit's job was to catch |
| .app-footer font-size | 11px | 13px | disclaimer text must not go below 13px regardless of ratio |
| .app-footer focus handling | not focusable (axe: scrollable-region-focusable) | tabIndex={0} + focus-visible outline (reuses --border-strong, now passing) | the footer is a scrollable region (overflow-y: auto, capped height) that had no keyboard path to it |
| Gold on navy (card text + border) | #d4af37 on #121f42, 7.68:1 | unchanged -- already passing | audited because the brief called it out explicitly, but it already clears both the 4.5:1 text and 3:1 border floors with margin to spare |
| v4b darker-base palette swap (--bg-base/--bg-panel/--bg-panel-alt/--bg-hover/--border/--border-strong/--text/--text-secondary/--text-muted) | #0b1530 / #121f42 / #16264c / #1b2c56 / #5870aa / #647aad / #f5f3ec / #b7bdda / #858fb0 | #06101f / #0b1426 / #0f1a33 / #12203c / #6b7a9c / #6b7a9c / #eef1f7 / #a3afca / #a3afca | adopted the darker base palette from the "GallagioLoot UI Redesign v4" mockup; re-ran every pair against the new values, all pass (see table below) with no further nudging needed |

## All pairs

| Pair | Foreground | Background | Ratio | Requirement | Pass |
|---|---|---|---|---|---|
| Body text on page background | `#eef1f7` | `#06101f` | 16.85:1 | 4.5:1 (text) | ✅ |
| Body text on panel | `#eef1f7` | `#0b1426` | 16.25:1 | 4.5:1 (text) | ✅ |
| Body text on input/select fill | `#eef1f7` | `#0f1a33` | 15.27:1 | 4.5:1 (text) | ✅ |
| Secondary text on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Secondary text on page background | `#a3afca` | `#06101f` | 8.66:1 | 4.5:1 (text) | ✅ |
| Secondary text on input/select fill | `#a3afca` | `#0f1a33` | 7.85:1 | 4.5:1 (text) | ✅ |
| Muted text (field hint, eyebrow, badge-no) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Muted text on page background | `#a3afca` | `#06101f` | 8.66:1 | 4.5:1 (text) | ✅ |
| Muted text on input/select fill | `#a3afca` | `#0f1a33` | 7.85:1 | 4.5:1 (text) | ✅ |
| Footer disclaimer text on footer background (13px) | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Footer "Show/Hide assumptions" summary toggle text on footer background | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Excluded-row reason text on panel (de-emphasized, no opacity) | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel) (Pre-fix behavior, kept here to document the regression this audit caught.) | `#5a6482` | `#0b1426` | 3.13:1 | 4.5:1 (text) | ❌ |
| Panel/input border on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Panel/input border on input/select fill | `#6b7a9c` | `#0f1a33` | 4.02:1 | 3:1 (UI component) | ✅ |
| Panel/input border on page background | `#6b7a9c` | `#06101f` | 4.44:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on input/select fill | `#6b7a9c` | `#0f1a33` | 4.02:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on page background | `#6b7a9c` | `#06101f` | 4.44:1 | 3:1 (UI component) | ✅ |
| Gold headline text on panel (rec-card) | `#d4af37` | `#0b1426` | 8.74:1 | 3:1 (large text) | ✅ |
| Gold card border on panel | `#d4af37` | `#0b1426` | 8.74:1 | 3:1 (UI component) | ✅ |
| Gold card border on page background | `#d4af37` | `#06101f` | 9.07:1 | 3:1 (UI component) | ✅ |
| btn-gold label text on gold fill | `#17110a` | `#d4af37` | 8.91:1 | 4.5:1 (text) | ✅ |
| btn-gold:hover label text on gold-strong fill | `#17110a` | `#e4c158` | 10.77:1 | 4.5:1 (text) | ✅ |
| Warning banner text on warning background | `#e8c98a` | `#3a2a12` | 8.65:1 | 4.5:1 (text) | ✅ |
| Warning banner border on warning background | `#996f2b` | `#3a2a12` | 3.07:1 | 3:1 (UI component) | ✅ |
| Badge-yes text on panel | `#8fd6a4` | `#0b1426` | 10.79:1 | 4.5:1 (text) | ✅ |
| Badge-yes border on panel | `#467655` | `#0b1426` | 3.49:1 | 3:1 (UI component) | ✅ |
| Badge-no text (muted) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Badge-no border on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (bottom bar) on header panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (mid bar) on header panel | `#a3afca` | `#0b1426` | 8.35:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (top bar) on header panel | `#a3afca` | `#0b1426` | 8.35:1 | 3:1 (UI component) | ✅ |
| Tooltip trigger underline on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Tooltip info icon on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble text on tooltip bubble background | `#eef1f7` | `#0b1426` | 16.25:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble border on tooltip bubble background | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Deployable dot fill on panel | `#eef1f7` | `#0b1426` | 16.25:1 | 3:1 (UI component) | ✅ |
| Not-deployable dot ring on panel | `#a3afca` | `#0b1426` | 8.35:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner border (gold) on compare-option fill | `#d4af37` | `#0f1a33` | 8.21:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner label (gold) on compare-option fill | `#d4af37` | `#0f1a33` | 8.21:1 | 4.5:1 (text) | ✅ |
| Rec-card verb/meta (secondary text) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Screen-header meta (Rollable Bosses/Loot Table threshold+spec line) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Footer aside column (Delves/Prey Hunts note) text on footer background | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Reconcile knockout-list Scope dot fill (all-specs) on panel | `#eef1f7` | `#0b1426` | 16.25:1 | 3:1 (UI component) | ✅ |
| Reconcile knockout-list Scope dot ring (spec-only) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 3:1 (UI component) | ✅ |
| Item-tag (Tier/Curio small-caps meta) text on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| btn-secondary label text on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| btn-secondary border on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Nav tab label (secondary text) on header panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Active nav tab / active boss-list item text on hover fill (--bg-hover) | `#eef1f7` | `#12203c` | 14.30:1 | 4.5:1 (text) | ✅ |
| Run-settings sidebar border on its own panel fill | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Stat-trio label (muted) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Loot boss list rank (muted) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Light-filled primary button (Fetch report / Price my roll) label on off-white fill | `#06101f` | `#eef1f7` | 16.85:1 | 4.5:1 (text) | ✅ |
| Disabled Loot spec/Difficulty placeholder text ("From report") on input fill | `#a3afca` | `#0f1a33` | 7.85:1 | 4.5:1 (text) | ✅ |
| Paste empty-state title text on panel | `#eef1f7` | `#0b1426` | 16.25:1 | 4.5:1 (text) | ✅ |
| Paste empty-state description text on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Paste empty-state dashed border on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Disabled Fetch button hint ("Needs a report URL") on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Input/textarea placeholder text on input fill | `#a3afca` | `#0f1a33` | 7.85:1 | 4.5:1 (text) | ✅ |
| Paste screen primary button (Fetch report / Price my roll) label on gold fill | `#17110a` | `#d4af37` | 8.91:1 | 4.5:1 (text) | ✅ |
| Paste screen primary button label on gold-strong hover fill | `#17110a` | `#e4c158` | 10.77:1 | 4.5:1 (text) | ✅ |
| Reconcile screen Confirm button label on gold fill | `#17110a` | `#d4af37` | 8.91:1 | 4.5:1 (text) | ✅ |
| Loot table selected-row gold inset stripe on hover fill (--bg-hover) | `#d4af37` | `#12203c` | 7.70:1 | 3:1 (UI component) | ✅ |
| Recommendation screen "Rollable Bosses" heading gold bar on panel | `#d4af37` | `#0b1426` | 8.74:1 | 3:1 (UI component) | ✅ |
| App wordmark (gold text) on header panel | `#d4af37` | `#0b1426` | 8.74:1 | 4.5:1 (text) | ✅ |
| Active nav-tab gold underline (inset box-shadow) on hover fill (--bg-hover) | `#d4af37` | `#12203c` | 7.70:1 | 3:1 (UI component) | ✅ |
| Header Voidcores pill count (gold text) on header panel | `#d4af37` | `#0b1426` | 8.74:1 | 4.5:1 (text) | ✅ |
| Voidcores chip-stack glyph (gold stroke) on header panel | `#d4af37` | `#0b1426` | 8.74:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on panel | `#d4af37` | `#0b1426` | 8.74:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on input/select fill | `#d4af37` | `#0f1a33` | 8.21:1 | 3:1 (UI component) | ✅ |
| Deployability "Yes" status dot (gold fill) on panel | `#d4af37` | `#0b1426` | 8.74:1 | 3:1 (UI component) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold fill | `#17110a` | `#d4af37` | 8.91:1 | 4.5:1 (text) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold-strong hover fill | `#17110a` | `#e4c158` | 10.77:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button label (enabled) on panel | `#eef1f7` | `#0b1426` | 16.25:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button border (enabled) on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Outline "Fetch report" button label (disabled) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |

## Failing pairs

- **Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel)**: 3.13:1, needs 4.5:1 (text)

## axe-core (Playwright), all 5 screens, live fixture

Run via `npx tsx design/renderScreens.tsx && npx tsx design/screenshotAndAudit.mts` -- statically renders paste/deployability/roll/reconcile/loot-table with the live Raidbots fixture (+ the loot-table fixture at Elemental, generated by `scripts/fetch-live-fixtures.mts`), then runs `@axe-core/playwright` (wcag2a/wcag2aa/wcag21a/wcag21aa tags) against each.

| Screen | Before (serious/critical) | After |
|---|---|---|
| paste | 1 (`scrollable-region-focusable` on footer) | 0 |
| deployability | 1 (`scrollable-region-focusable` on footer) | 0 |
| roll | 1 (`scrollable-region-focusable` on footer) | 0 |
| reconcile | 1 (`scrollable-region-focusable` on footer) | 0 |
| loot-table (new, Feature 1/2, 2026-09-08) | n/a (new screen) | 0 |
| **total** | **4** | **0** |

Fix: the footer is a scrollable region (`overflow-y: auto`, capped `max-height`) with no keyboard path to it. Added `tabIndex={0}` to `<footer>` and a `:focus-visible` outline (reusing the now-passing `--border-strong`).

