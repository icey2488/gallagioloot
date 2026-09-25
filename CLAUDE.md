# GallagioLoot Proxy — Project Instructions for Claude Code

Data layer + decision engine for GallagioLoot (WoW bonus roll optimizer): a Cloudflare Worker that fetches Raidbots droptimizer reports and QE Live upgrade reports and normalizes both into a shared `NormalizedReport` schema, plus a pure `src/core/` module (no Worker/runtime dependencies) that turns a normalized report and a knockout state into a bonus-roll recommendation. No UI here — that's a separate job/repo.

## Code style

- **TypeScript, with a build-free Workers runtime.** Wrangler bundles `src/index.ts` directly; no separate build step to run locally.
- Keep normalizer logic (`src/normalize/raidbots.ts`, `src/normalize/qelive.ts`), the encounter-items lookup (`src/lookup/encounterItems.ts`), and the decision engine (`src/core/`) **pure** — no `fetch`, no Cache API/KV access, no `Date.now()` (timestamps are caller-supplied) — so they're testable with plain fixtures and importable by a future frontend. `src/index.ts` (the Worker handler) does all I/O and calls into these.
- Minimal dependencies: standard library + Workers runtime API + `@cloudflare/workers-types` only.

## Testing

- `npm test` runs the fixture-based unit tests (`test/*.test.ts`, vitest). These must stay hermetic — no real network calls.
- `npm run test:live` runs `test/integration.test.ts` against the real Raidbots/QE Live APIs. Skipped by default (gated on `RUN_LIVE=1`); don't let it run in CI.
- `npm run typecheck` runs `tsc --noEmit`. CI runs typecheck + unit tests on every push (`.github/workflows/ci.yml`).
- Don't merge a normalizer or lookup change without unit test coverage for it.

## Deployment

- Not deployed automatically. `wrangler.toml` has a commented-out route for `gallagioloot-proxy.icehunter.net` — don't uncomment/deploy without explicit instruction.

## Design (web/)

Hard rules for the `web/` UI (Cloudflare Worker static site, see `web/CLAUDE.md`-equivalent context below -- there's no separate file, this is the canonical copy):

- No gradients, glow, or neon effects.
- WCAG AA contrast (verified with `web/design/contrast.mts`).
- Tabular figures for numbers (`font-variant-numeric: tabular-nums`).
- Disclaimers live in the in-flow footer, not a modal/overlay.
- No external assets (fonts/icons are bundled, not fetched from a CDN at runtime beyond the one Google Fonts `<link>` already in use).
- Gold accent rule (superseded 2026-09-20; previously "exactly one gold accent per screen, card only"): The recommendation card carries the strongest gold treatment on any screen (border + headline + primary action); everywhere else gold is accent-weight only: wordmark, active-tab underline, Voidcores pill glyph/number, section expander "+" marks, selected-row stripe, primary buttons, small heading bars. Never gold on body text, table numbers, or large fills.

## Behavior

- Endpoints: `GET /raidbots/:id`, `GET /qelive/:id`, `GET /encounter-items` (debug), `GET /tier-map/:instanceId` (debug), `GET /loot-table/:instanceId?lootSpec=:specId`, `GET /health` (reports the current Raidbots static-data hash + its age). See `README.md` for the full schema and upstream shape notes, including mismatches found against the original spec (the Raidbots data-hash discovery location, `encounter-names.json`/`instance-names.json` being flat objects rather than arrays, and the Tidebound Grotto instance/encounter id in the tier seed table — see "Tier-token resolution" in README.md).
- `getEncounterItemsLookup` re-discovers the Raidbots static-data hash automatically if the cached one starts 404ing (the hash rotates periodically) — see `src/lookup/encounterItems.ts` and its regression test.
- Loot-spec eligibility (`src/lookup/lootEligibility.ts`, `src/lookup/lootTable.ts`) and the static spec table (`src/lookup/specs.ts`) back the `/loot-table` endpoint and `PoolEntry.specSpecific` in `src/core/`. See README.md's "Loot specs" and the `/loot-table` endpoint section for the eligibility rules and one open uncertainty (shield/off-hand item restrictions, and the invented "Devourer" Demon Hunter spec's role).
- Loot eligibility also filters on **primary stat** (`stats[]` ids 3/4/5, multi-primary 71-74 vs `SpecEntry.primaryStat`): `weapon-specs.json` is equip-based, so without it a Strength sword or Agility dagger showed up in a Mage's pool (Jaw of the Shackled Goddess, Zatha'tek). Ula'tek's Arcane pool is pinned to the journal's 4 items in `test/lootTable.primaryStat.test.ts`.
- Tier-set armor items (head/shoulder/chest/hands/legs tokens) aren't joinable via `encounter-items.json` alone (Raidbots points them at an aggregate catalyst bucket). `src/lookup/tierSeed.ts` (static, hand-maintained) and `src/lookup/tierLearned.ts` (persistent cache learned from Raidbots reports) resolve them instead; see README.md for the full design and detection method.
- Mythic+ droptimizers (aggregate instance -1, every row `-1/-1/...`) are attributed to dungeons via the itemLibrary sources join; each dungeon is a repeatable `mplus` target. Several reports (raid difficulties + one M+) can be ranked together (`src/core/targets.ts`, `src/core/reportSet.ts`); catalyst rows credit their source item at max(own, catalyzed). See README.md "Raidbots Mythic+ droptimizer" and "Decision engine".
- **Curio is not a bonus-roll outcome** (Erick's Adventure Journal ruling, 2026-09-24; supersedes the earlier "Curio is one pool entry" rule): Ula'tek's Slumbering Coil Curio (tier seed 2895, `viaCurio` rows) can't be won with a bonus roll, so it is never a `PoolEntry` -- not in the pool, the denominator, best case, rolls-to-target or knockout (`src/core/pool.ts`, `src/core/curio.ts`). Catalyst credit for real items is unchanged. The web UI hides the curio row and notes why under Ula'tek's table; stored knockout entries that reference it are ignored on load and dropped on save.
- CORS: `https://gallagioloot.icehunter.net` (configurable via `wrangler.toml [vars] ALLOWED_ORIGIN`) plus `http://localhost:*` for dev.
