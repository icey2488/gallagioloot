# Contrast audit

Computed with `design/contrast.mts` (WCAG 2.1 relative-luminance formula, no eyeballing). 40/41 pairs pass; 1 fail.

## Changes made

| What | Before | After | Why |
|---|---|---|---|
| --border | #26355e | #5870aa | was 1.24-1.51:1 against panel/input/page backgrounds, under the 3:1 UI-component floor |
| --border-strong | #34467a | #647aad | was 1.63-1.98:1 against panel/input/page backgrounds; also the focus-ring color, so this doubled as the focus-ring fix |
| --text-muted | #7c86aa | #858fb0 | was 4.13-4.50:1 -- under 4.5:1 on panel and well under it on the input/select fill |
| .warning-banner border | #6b4e1e | #996f2b | was 1.80:1 against the warning background, under the 3:1 floor |
| .badge-yes border-color | #3f6b4d | #467655 | was 2.63:1 against panel, under the 3:1 floor |
| tr.excluded td opacity | 0.7 (blended to ~2.90:1 against panel) | removed -- de-emphasis is font-style: italic only, color unchanged | opacity fades the rendered color toward the background, which silently drops de-emphasized text below the readable floor -- exactly what this audit's job was to catch |
| .app-footer font-size | 11px | 13px | disclaimer text must not go below 13px regardless of ratio |
| .app-footer focus handling | not focusable (axe: scrollable-region-focusable) | tabIndex={0} + focus-visible outline (reuses --border-strong, now passing) | the footer is a scrollable region (overflow-y: auto, capped height) that had no keyboard path to it |
| Gold on navy (card text + border) | #d4af37 on #121f42, 7.68:1 | unchanged -- already passing | audited because the brief called it out explicitly, but it already clears both the 4.5:1 text and 3:1 border floors with margin to spare |

## All pairs

| Pair | Foreground | Background | Ratio | Requirement | Pass |
|---|---|---|---|---|---|
| Body text on page background | `#f5f3ec` | `#0b1530` | 16.25:1 | 4.5:1 (text) | ✅ |
| Body text on panel | `#f5f3ec` | `#121f42` | 14.54:1 | 4.5:1 (text) | ✅ |
| Body text on input/select fill | `#f5f3ec` | `#16264c` | 13.36:1 | 4.5:1 (text) | ✅ |
| Secondary text on panel | `#b7bdda` | `#121f42` | 8.69:1 | 4.5:1 (text) | ✅ |
| Secondary text on page background | `#b7bdda` | `#0b1530` | 9.71:1 | 4.5:1 (text) | ✅ |
| Secondary text on input/select fill | `#b7bdda` | `#16264c` | 7.99:1 | 4.5:1 (text) | ✅ |
| Muted text (field hint, eyebrow, badge-no) on panel | `#858fb0` | `#121f42` | 5.04:1 | 4.5:1 (text) | ✅ |
| Muted text on page background | `#858fb0` | `#0b1530` | 5.63:1 | 4.5:1 (text) | ✅ |
| Muted text on input/select fill | `#858fb0` | `#16264c` | 4.63:1 | 4.5:1 (text) | ✅ |
| Footer disclaimer text on footer background (13px) | `#858fb0` | `#121f42` | 5.04:1 | 4.5:1 (text) | ✅ |
| Excluded-row reason text on panel (de-emphasized, no opacity) | `#858fb0` | `#121f42` | 5.04:1 | 4.5:1 (text) | ✅ |
| Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel) (Pre-fix behavior, kept here to document the regression this audit caught.) | `#5c678b` | `#121f42` | 2.90:1 | 4.5:1 (text) | ❌ |
| Panel/input border on panel | `#5870aa` | `#121f42` | 3.32:1 | 3:1 (UI component) | ✅ |
| Panel/input border on input/select fill | `#5870aa` | `#16264c` | 3.05:1 | 3:1 (UI component) | ✅ |
| Panel/input border on page background | `#5870aa` | `#0b1530` | 3.70:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on panel | `#647aad` | `#121f42` | 3.79:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on input/select fill | `#647aad` | `#16264c` | 3.48:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on page background | `#647aad` | `#0b1530` | 4.23:1 | 3:1 (UI component) | ✅ |
| Gold headline text on panel (rec-card) | `#d4af37` | `#121f42` | 7.68:1 | 3:1 (large text) | ✅ |
| Gold card border on panel | `#d4af37` | `#121f42` | 7.68:1 | 3:1 (UI component) | ✅ |
| Gold card border on page background | `#d4af37` | `#0b1530` | 8.58:1 | 3:1 (UI component) | ✅ |
| btn-gold label text on gold fill | `#17110a` | `#d4af37` | 8.91:1 | 4.5:1 (text) | ✅ |
| btn-gold:hover label text on gold-strong fill | `#17110a` | `#e4c158` | 10.77:1 | 4.5:1 (text) | ✅ |
| Warning banner text on warning background | `#e8c98a` | `#3a2a12` | 8.65:1 | 4.5:1 (text) | ✅ |
| Warning banner border on warning background | `#996f2b` | `#3a2a12` | 3.07:1 | 3:1 (UI component) | ✅ |
| Badge-yes text on panel | `#8fd6a4` | `#121f42` | 9.48:1 | 4.5:1 (text) | ✅ |
| Badge-yes border on panel | `#467655` | `#121f42` | 3.06:1 | 3:1 (UI component) | ✅ |
| Badge-no text (muted) on panel | `#858fb0` | `#121f42` | 5.04:1 | 4.5:1 (text) | ✅ |
| Badge-no border on panel | `#647aad` | `#121f42` | 3.79:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (bottom bar) on header panel | `#647aad` | `#121f42` | 3.79:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (mid bar) on header panel | `#858fb0` | `#121f42` | 5.04:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (top bar) on header panel | `#b7bdda` | `#121f42` | 8.69:1 | 3:1 (UI component) | ✅ |
| Tooltip trigger underline on panel | `#647aad` | `#121f42` | 3.79:1 | 3:1 (UI component) | ✅ |
| Tooltip info icon on panel | `#b7bdda` | `#121f42` | 8.69:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble text on tooltip bubble background | `#f5f3ec` | `#16264c` | 13.36:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble border on tooltip bubble background | `#647aad` | `#16264c` | 3.48:1 | 3:1 (UI component) | ✅ |
| Deployable dot fill on panel | `#f5f3ec` | `#121f42` | 14.54:1 | 3:1 (UI component) | ✅ |
| Not-deployable dot ring on panel | `#858fb0` | `#121f42` | 5.04:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner border (gold) on compare-option fill | `#d4af37` | `#16264c` | 7.05:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner label (gold) on compare-option fill | `#d4af37` | `#16264c` | 7.05:1 | 4.5:1 (text) | ✅ |
| Rec-card verb/meta (secondary text) on panel | `#b7bdda` | `#121f42` | 8.69:1 | 4.5:1 (text) | ✅ |

## Failing pairs

- **Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel)**: 2.90:1, needs 4.5:1 (text)

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

