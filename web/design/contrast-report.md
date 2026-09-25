# Contrast audit

Computed with `design/contrast.mts` (WCAG 2.1 relative-luminance formula, no eyeballing) for every theme (v2.12: Midnight, Felt green, Craps red). Palettes are read from `src/theme.css`, so this cannot drift from what ships.

| Theme | Pairs | Pass | Fail (excluding the documented pre-fix example) |
|---|---|---|---|
| Midnight | 82 | 81 | 0 |
| Felt green | 82 | 81 | 0 |
| Craps red | 82 | 81 | 0 |

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
| v2.12 Midnight gold set (--gold/--gold-strong/--gold-text-on/--bg-hover) + two new themes | #d4af37 / #e4c158 / #17110a / #12203c | #e3b94a / #f0c75a / #0b1426 / #1a2748 | adopted the Claude Design export's brighter gold; Felt green and Craps red added as data-theme token sets; every pair re-audited on all three |
| v4b darker-base palette swap (--bg-base/--bg-panel/--bg-panel-alt/--bg-hover/--border/--border-strong/--text/--text-secondary/--text-muted) | #0b1530 / #121f42 / #16264c / #1b2c56 / #5870aa / #647aad / #f5f3ec / #b7bdda / #858fb0 | #06101f / #0b1426 / #0f1a33 / #12203c / #6b7a9c / #6b7a9c / #eef1f7 / #a3afca / #a3afca | adopted the darker base palette from the "GallagioLoot UI Redesign v4" mockup; re-ran every pair against the new values, all pass (see table below) with no further nudging needed |

## Midnight -- all pairs

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
| Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel) (Pre-fix behavior, kept here to document the regression this audit caught.) | `#5a6482` | `#0b1426` | 3.13:1 | 4.5:1 (text) | ❌ (expected) |
| Panel/input border on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Panel/input border on input/select fill | `#6b7a9c` | `#0f1a33` | 4.02:1 | 3:1 (UI component) | ✅ |
| Panel/input border on page background | `#6b7a9c` | `#06101f` | 4.44:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on input/select fill | `#6b7a9c` | `#0f1a33` | 4.02:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on page background | `#6b7a9c` | `#06101f` | 4.44:1 | 3:1 (UI component) | ✅ |
| Gold headline text on panel (rec-card) | `#e3b94a` | `#0b1426` | 9.90:1 | 3:1 (large text) | ✅ |
| Gold card border on panel | `#e3b94a` | `#0b1426` | 9.90:1 | 3:1 (UI component) | ✅ |
| Gold card border on page background | `#e3b94a` | `#06101f` | 10.26:1 | 3:1 (UI component) | ✅ |
| btn-gold label text on gold fill | `#0b1426` | `#e3b94a` | 9.90:1 | 4.5:1 (text) | ✅ |
| btn-gold:hover label text on gold-strong fill | `#0b1426` | `#f0c75a` | 11.40:1 | 4.5:1 (text) | ✅ |
| Warning banner text on warning background | `#e8c98a` | `#3a2a12` | 8.65:1 | 4.5:1 (text) | ✅ |
| Below-threshold roll flag (warn text) on the rec-card panel (v2.09 roll list) | `#e8c98a` | `#0b1426` | 11.51:1 | 4.5:1 (text) | ✅ |
| Warning banner border on panel (the banner sits on the panel fill) | `#996f2b` | `#0b1426` | 4.08:1 | 3:1 (UI component) | ✅ |
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
| Vault-compare winner border (gold) on compare-option fill | `#e3b94a` | `#0f1a33` | 9.30:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner label (gold) on compare-option fill | `#e3b94a` | `#0f1a33` | 9.30:1 | 4.5:1 (text) | ✅ |
| Rec-card verb/meta (secondary text) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Screen-header meta (Rollable Bosses/Loot Table threshold+spec line) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Footer aside column (Delves/Prey Hunts note) text on footer background | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Reconcile knockout-list Scope dot fill (all-specs) on panel | `#eef1f7` | `#0b1426` | 16.25:1 | 3:1 (UI component) | ✅ |
| Reconcile knockout-list Scope dot ring (spec-only) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 3:1 (UI component) | ✅ |
| Item-tag (Tier/Curio small-caps meta) text on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| btn-secondary label text on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| btn-secondary border on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Nav tab label (secondary text) on header panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Active nav tab / active boss-list item text on hover fill (--bg-hover) | `#eef1f7` | `#1a2748` | 13.00:1 | 4.5:1 (text) | ✅ |
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
| Paste screen primary button (Fetch report / Price my roll) label on gold fill | `#0b1426` | `#e3b94a` | 9.90:1 | 4.5:1 (text) | ✅ |
| Paste screen primary button label on gold-strong hover fill | `#0b1426` | `#f0c75a` | 11.40:1 | 4.5:1 (text) | ✅ |
| Reconcile screen Confirm button label on gold fill | `#0b1426` | `#e3b94a` | 9.90:1 | 4.5:1 (text) | ✅ |
| Loot table selected-row gold inset stripe on hover fill (--bg-hover) | `#e3b94a` | `#1a2748` | 7.92:1 | 3:1 (UI component) | ✅ |
| Recommendation screen "Rollable Bosses" heading gold bar on panel | `#e3b94a` | `#0b1426` | 9.90:1 | 3:1 (UI component) | ✅ |
| App wordmark (gold text) on header panel | `#e3b94a` | `#0b1426` | 9.90:1 | 4.5:1 (text) | ✅ |
| Active nav-tab gold underline (inset box-shadow) on hover fill (--bg-hover) | `#e3b94a` | `#1a2748` | 7.92:1 | 3:1 (UI component) | ✅ |
| Header Voidcores pill count (gold text) on header panel | `#e3b94a` | `#0b1426` | 9.90:1 | 4.5:1 (text) | ✅ |
| Voidcores chip-stack glyph (gold stroke) on header panel | `#e3b94a` | `#0b1426` | 9.90:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on panel | `#e3b94a` | `#0b1426` | 9.90:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on input/select fill | `#e3b94a` | `#0f1a33` | 9.30:1 | 3:1 (UI component) | ✅ |
| Deployability "Yes" status dot (gold fill) on panel | `#e3b94a` | `#0b1426` | 9.90:1 | 3:1 (UI component) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold fill | `#0b1426` | `#e3b94a` | 9.90:1 | 4.5:1 (text) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold-strong hover fill | `#0b1426` | `#f0c75a` | 11.40:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button label (enabled) on panel | `#eef1f7` | `#0b1426` | 16.25:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button border (enabled) on panel | `#6b7a9c` | `#0b1426` | 4.28:1 | 3:1 (UI component) | ✅ |
| Outline "Fetch report" button label (disabled) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Top Gear "Vault item: name · pct% · boss" summary line on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |
| Top Gear "Also added: ..." extra-candidates line (11px, inherits parent color) on panel | `#a3afca` | `#0b1426` | 8.35:1 | 4.5:1 (text) | ✅ |

## Felt green -- all pairs

| Pair | Foreground | Background | Ratio | Requirement | Pass |
|---|---|---|---|---|---|
| Body text on page background | `#f1f5ec` | `#03140c` | 17.14:1 | 4.5:1 (text) | ✅ |
| Body text on panel | `#f1f5ec` | `#082116` | 15.34:1 | 4.5:1 (text) | ✅ |
| Body text on input/select fill | `#f1f5ec` | `#0c2c1d` | 13.64:1 | 4.5:1 (text) | ✅ |
| Secondary text on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Secondary text on page background | `#a9c6b4` | `#03140c` | 10.30:1 | 4.5:1 (text) | ✅ |
| Secondary text on input/select fill | `#a9c6b4` | `#0c2c1d` | 8.20:1 | 4.5:1 (text) | ✅ |
| Muted text (field hint, eyebrow, badge-no) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Muted text on page background | `#a9c6b4` | `#03140c` | 10.30:1 | 4.5:1 (text) | ✅ |
| Muted text on input/select fill | `#a9c6b4` | `#0c2c1d` | 8.20:1 | 4.5:1 (text) | ✅ |
| Footer disclaimer text on footer background (13px) | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Footer "Show/Hide assumptions" summary toggle text on footer background | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Excluded-row reason text on panel (de-emphasized, no opacity) | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel) (Pre-fix behavior, kept here to document the regression this audit caught.) | `#59687e` | `#082116` | 2.99:1 | 4.5:1 (text) | ❌ (expected) |
| Panel/input border on panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Panel/input border on input/select fill | `#6a9682` | `#0c2c1d` | 4.52:1 | 3:1 (UI component) | ✅ |
| Panel/input border on page background | `#6a9682` | `#03140c` | 5.68:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on input/select fill | `#6a9682` | `#0c2c1d` | 4.52:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on page background | `#6a9682` | `#03140c` | 5.68:1 | 3:1 (UI component) | ✅ |
| Gold headline text on panel (rec-card) | `#e3b94a` | `#082116` | 9.12:1 | 3:1 (large text) | ✅ |
| Gold card border on panel | `#e3b94a` | `#082116` | 9.12:1 | 3:1 (UI component) | ✅ |
| Gold card border on page background | `#e3b94a` | `#03140c` | 10.19:1 | 3:1 (UI component) | ✅ |
| btn-gold label text on gold fill | `#082116` | `#e3b94a` | 9.12:1 | 4.5:1 (text) | ✅ |
| btn-gold:hover label text on gold-strong fill | `#082116` | `#f0c75a` | 10.51:1 | 4.5:1 (text) | ✅ |
| Warning banner text on warning background | `#e8c98a` | `#3a2a12` | 8.65:1 | 4.5:1 (text) | ✅ |
| Below-threshold roll flag (warn text) on the rec-card panel (v2.09 roll list) | `#e8c98a` | `#082116` | 10.61:1 | 4.5:1 (text) | ✅ |
| Warning banner border on panel (the banner sits on the panel fill) | `#996f2b` | `#082116` | 3.76:1 | 3:1 (UI component) | ✅ |
| Warning banner border on warning background | `#996f2b` | `#3a2a12` | 3.07:1 | 3:1 (UI component) | ✅ |
| Badge-yes text on panel | `#8fd6a4` | `#082116` | 9.94:1 | 4.5:1 (text) | ✅ |
| Badge-yes border on panel | `#467655` | `#082116` | 3.21:1 | 3:1 (UI component) | ✅ |
| Badge-no text (muted) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Badge-no border on panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (bottom bar) on header panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (mid bar) on header panel | `#a9c6b4` | `#082116` | 9.22:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (top bar) on header panel | `#a9c6b4` | `#082116` | 9.22:1 | 3:1 (UI component) | ✅ |
| Tooltip trigger underline on panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Tooltip info icon on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble text on tooltip bubble background | `#f1f5ec` | `#082116` | 15.34:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble border on tooltip bubble background | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Deployable dot fill on panel | `#f1f5ec` | `#082116` | 15.34:1 | 3:1 (UI component) | ✅ |
| Not-deployable dot ring on panel | `#a9c6b4` | `#082116` | 9.22:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner border (gold) on compare-option fill | `#e3b94a` | `#0c2c1d` | 8.11:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner label (gold) on compare-option fill | `#e3b94a` | `#0c2c1d` | 8.11:1 | 4.5:1 (text) | ✅ |
| Rec-card verb/meta (secondary text) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Screen-header meta (Rollable Bosses/Loot Table threshold+spec line) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Footer aside column (Delves/Prey Hunts note) text on footer background | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Reconcile knockout-list Scope dot fill (all-specs) on panel | `#f1f5ec` | `#082116` | 15.34:1 | 3:1 (UI component) | ✅ |
| Reconcile knockout-list Scope dot ring (spec-only) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 3:1 (UI component) | ✅ |
| Item-tag (Tier/Curio small-caps meta) text on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| btn-secondary label text on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| btn-secondary border on panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Nav tab label (secondary text) on header panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Active nav tab / active boss-list item text on hover fill (--bg-hover) | `#f1f5ec` | `#16402c` | 10.54:1 | 4.5:1 (text) | ✅ |
| Run-settings sidebar border on its own panel fill | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Stat-trio label (muted) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Loot boss list rank (muted) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Light-filled primary button (Fetch report / Price my roll) label on off-white fill | `#03140c` | `#f1f5ec` | 17.14:1 | 4.5:1 (text) | ✅ |
| Disabled Loot spec/Difficulty placeholder text ("From report") on input fill | `#a9c6b4` | `#0c2c1d` | 8.20:1 | 4.5:1 (text) | ✅ |
| Paste empty-state title text on panel | `#f1f5ec` | `#082116` | 15.34:1 | 4.5:1 (text) | ✅ |
| Paste empty-state description text on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Paste empty-state dashed border on panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Disabled Fetch button hint ("Needs a report URL") on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Input/textarea placeholder text on input fill | `#a9c6b4` | `#0c2c1d` | 8.20:1 | 4.5:1 (text) | ✅ |
| Paste screen primary button (Fetch report / Price my roll) label on gold fill | `#082116` | `#e3b94a` | 9.12:1 | 4.5:1 (text) | ✅ |
| Paste screen primary button label on gold-strong hover fill | `#082116` | `#f0c75a` | 10.51:1 | 4.5:1 (text) | ✅ |
| Reconcile screen Confirm button label on gold fill | `#082116` | `#e3b94a` | 9.12:1 | 4.5:1 (text) | ✅ |
| Loot table selected-row gold inset stripe on hover fill (--bg-hover) | `#e3b94a` | `#16402c` | 6.27:1 | 3:1 (UI component) | ✅ |
| Recommendation screen "Rollable Bosses" heading gold bar on panel | `#e3b94a` | `#082116` | 9.12:1 | 3:1 (UI component) | ✅ |
| App wordmark (gold text) on header panel | `#e3b94a` | `#082116` | 9.12:1 | 4.5:1 (text) | ✅ |
| Active nav-tab gold underline (inset box-shadow) on hover fill (--bg-hover) | `#e3b94a` | `#16402c` | 6.27:1 | 3:1 (UI component) | ✅ |
| Header Voidcores pill count (gold text) on header panel | `#e3b94a` | `#082116` | 9.12:1 | 4.5:1 (text) | ✅ |
| Voidcores chip-stack glyph (gold stroke) on header panel | `#e3b94a` | `#082116` | 9.12:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on panel | `#e3b94a` | `#082116` | 9.12:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on input/select fill | `#e3b94a` | `#0c2c1d` | 8.11:1 | 3:1 (UI component) | ✅ |
| Deployability "Yes" status dot (gold fill) on panel | `#e3b94a` | `#082116` | 9.12:1 | 3:1 (UI component) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold fill | `#082116` | `#e3b94a` | 9.12:1 | 4.5:1 (text) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold-strong hover fill | `#082116` | `#f0c75a` | 10.51:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button label (enabled) on panel | `#f1f5ec` | `#082116` | 15.34:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button border (enabled) on panel | `#6a9682` | `#082116` | 5.08:1 | 3:1 (UI component) | ✅ |
| Outline "Fetch report" button label (disabled) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Top Gear "Vault item: name · pct% · boss" summary line on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |
| Top Gear "Also added: ..." extra-candidates line (11px, inherits parent color) on panel | `#a9c6b4` | `#082116` | 9.22:1 | 4.5:1 (text) | ✅ |

## Craps red -- all pairs

| Pair | Foreground | Background | Ratio | Requirement | Pass |
|---|---|---|---|---|---|
| Body text on page background | `#fff3f0` | `#2a0508` | 17.20:1 | 4.5:1 (text) | ✅ |
| Body text on panel | `#fff3f0` | `#3d0810` | 15.58:1 | 4.5:1 (text) | ✅ |
| Body text on input/select fill | `#fff3f0` | `#520b16` | 13.63:1 | 4.5:1 (text) | ✅ |
| Secondary text on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Secondary text on page background | `#f0c4c4` | `#2a0508` | 11.92:1 | 4.5:1 (text) | ✅ |
| Secondary text on input/select fill | `#f0c4c4` | `#520b16` | 9.45:1 | 4.5:1 (text) | ✅ |
| Muted text (field hint, eyebrow, badge-no) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Muted text on page background | `#f0c4c4` | `#2a0508` | 11.92:1 | 4.5:1 (text) | ✅ |
| Muted text on input/select fill | `#f0c4c4` | `#520b16` | 9.45:1 | 4.5:1 (text) | ✅ |
| Footer disclaimer text on footer background (13px) | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Footer "Show/Hide assumptions" summary toggle text on footer background | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Excluded-row reason text on panel (de-emphasized, no opacity) | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Excluded-row text, OLD approach (text-muted @ 0.7 opacity over panel) (Pre-fix behavior, kept here to document the regression this audit caught.) | `#69607c` | `#3d0810` | 2.87:1 | 4.5:1 (text) | ❌ (expected) |
| Panel/input border on panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Panel/input border on input/select fill | `#c07880` | `#520b16` | 4.40:1 | 3:1 (UI component) | ✅ |
| Panel/input border on page background | `#c07880` | `#2a0508` | 5.55:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on input/select fill | `#c07880` | `#520b16` | 4.40:1 | 3:1 (UI component) | ✅ |
| Button border / focus ring on page background | `#c07880` | `#2a0508` | 5.55:1 | 3:1 (UI component) | ✅ |
| Gold headline text on panel (rec-card) | `#f0c75a` | `#3d0810` | 10.50:1 | 3:1 (large text) | ✅ |
| Gold card border on panel | `#f0c75a` | `#3d0810` | 10.50:1 | 3:1 (UI component) | ✅ |
| Gold card border on page background | `#f0c75a` | `#2a0508` | 11.59:1 | 3:1 (UI component) | ✅ |
| btn-gold label text on gold fill | `#3d0810` | `#f0c75a` | 10.50:1 | 4.5:1 (text) | ✅ |
| btn-gold:hover label text on gold-strong fill | `#3d0810` | `#f8d470` | 11.80:1 | 4.5:1 (text) | ✅ |
| Warning banner text on warning background | `#e8c98a` | `#3a2a12` | 8.65:1 | 4.5:1 (text) | ✅ |
| Below-threshold roll flag (warn text) on the rec-card panel (v2.09 roll list) | `#e8c98a` | `#3d0810` | 10.60:1 | 4.5:1 (text) | ✅ |
| Warning banner border on panel (the banner sits on the panel fill) | `#996f2b` | `#3d0810` | 3.76:1 | 3:1 (UI component) | ✅ |
| Warning banner border on warning background | `#996f2b` | `#3a2a12` | 3.07:1 | 3:1 (UI component) | ✅ |
| Badge-yes text on panel | `#8fd6a4` | `#3d0810` | 9.93:1 | 4.5:1 (text) | ✅ |
| Badge-yes border on panel | `#467655` | `#3d0810` | 3.21:1 | 3:1 (UI component) | ✅ |
| Badge-no text (muted) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Badge-no border on panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (bottom bar) on header panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (mid bar) on header panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 3:1 (UI component) | ✅ |
| Chip-stack glyph (top bar) on header panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 3:1 (UI component) | ✅ |
| Tooltip trigger underline on panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Tooltip info icon on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble text on tooltip bubble background | `#fff3f0` | `#3d0810` | 15.58:1 | 4.5:1 (text) | ✅ |
| Tooltip bubble border on tooltip bubble background | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Deployable dot fill on panel | `#fff3f0` | `#3d0810` | 15.58:1 | 3:1 (UI component) | ✅ |
| Not-deployable dot ring on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner border (gold) on compare-option fill | `#f0c75a` | `#520b16` | 9.18:1 | 3:1 (UI component) | ✅ |
| Vault-compare winner label (gold) on compare-option fill | `#f0c75a` | `#520b16` | 9.18:1 | 4.5:1 (text) | ✅ |
| Rec-card verb/meta (secondary text) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Screen-header meta (Rollable Bosses/Loot Table threshold+spec line) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Footer aside column (Delves/Prey Hunts note) text on footer background | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Reconcile knockout-list Scope dot fill (all-specs) on panel | `#fff3f0` | `#3d0810` | 15.58:1 | 3:1 (UI component) | ✅ |
| Reconcile knockout-list Scope dot ring (spec-only) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 3:1 (UI component) | ✅ |
| Item-tag (Tier/Curio small-caps meta) text on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| btn-secondary label text on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| btn-secondary border on panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Nav tab label (secondary text) on header panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Active nav tab / active boss-list item text on hover fill (--bg-hover) | `#fff3f0` | `#6e1220` | 10.92:1 | 4.5:1 (text) | ✅ |
| Run-settings sidebar border on its own panel fill | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Stat-trio label (muted) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Loot boss list rank (muted) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Light-filled primary button (Fetch report / Price my roll) label on off-white fill | `#2a0508` | `#fff3f0` | 17.20:1 | 4.5:1 (text) | ✅ |
| Disabled Loot spec/Difficulty placeholder text ("From report") on input fill | `#f0c4c4` | `#520b16` | 9.45:1 | 4.5:1 (text) | ✅ |
| Paste empty-state title text on panel | `#fff3f0` | `#3d0810` | 15.58:1 | 4.5:1 (text) | ✅ |
| Paste empty-state description text on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Paste empty-state dashed border on panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Disabled Fetch button hint ("Needs a report URL") on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Input/textarea placeholder text on input fill | `#f0c4c4` | `#520b16` | 9.45:1 | 4.5:1 (text) | ✅ |
| Paste screen primary button (Fetch report / Price my roll) label on gold fill | `#3d0810` | `#f0c75a` | 10.50:1 | 4.5:1 (text) | ✅ |
| Paste screen primary button label on gold-strong hover fill | `#3d0810` | `#f8d470` | 11.80:1 | 4.5:1 (text) | ✅ |
| Reconcile screen Confirm button label on gold fill | `#3d0810` | `#f0c75a` | 10.50:1 | 4.5:1 (text) | ✅ |
| Loot table selected-row gold inset stripe on hover fill (--bg-hover) | `#f0c75a` | `#6e1220` | 7.36:1 | 3:1 (UI component) | ✅ |
| Recommendation screen "Rollable Bosses" heading gold bar on panel | `#f0c75a` | `#3d0810` | 10.50:1 | 3:1 (UI component) | ✅ |
| App wordmark (gold text) on header panel | `#f0c75a` | `#3d0810` | 10.50:1 | 4.5:1 (text) | ✅ |
| Active nav-tab gold underline (inset box-shadow) on hover fill (--bg-hover) | `#f0c75a` | `#6e1220` | 7.36:1 | 3:1 (UI component) | ✅ |
| Header Voidcores pill count (gold text) on header panel | `#f0c75a` | `#3d0810` | 10.50:1 | 4.5:1 (text) | ✅ |
| Voidcores chip-stack glyph (gold stroke) on header panel | `#f0c75a` | `#3d0810` | 10.50:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on panel | `#f0c75a` | `#3d0810` | 10.50:1 | 3:1 (UI component) | ✅ |
| Checked checkbox (accent-color gold) on input/select fill | `#f0c75a` | `#520b16` | 9.18:1 | 3:1 (UI component) | ✅ |
| Deployability "Yes" status dot (gold fill) on panel | `#f0c75a` | `#3d0810` | 10.50:1 | 3:1 (UI component) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold fill | `#3d0810` | `#f0c75a` | 10.50:1 | 4.5:1 (text) | ✅ |
| Recommendation/Rollable-Bosses screen "Roll this boss" button label on gold-strong hover fill | `#3d0810` | `#f8d470` | 11.80:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button label (enabled) on panel | `#fff3f0` | `#3d0810` | 15.58:1 | 4.5:1 (text) | ✅ |
| Outline "Fetch report" button border (enabled) on panel | `#c07880` | `#3d0810` | 5.03:1 | 3:1 (UI component) | ✅ |
| Outline "Fetch report" button label (disabled) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Top Gear "Vault item: name · pct% · boss" summary line on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |
| Top Gear "Also added: ..." extra-candidates line (11px, inherits parent color) on panel | `#f0c4c4` | `#3d0810` | 10.80:1 | 4.5:1 (text) | ✅ |

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

