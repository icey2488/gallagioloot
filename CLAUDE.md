# GallagioLoot Proxy — Project Instructions for Claude Code

Data layer for GallagioLoot (WoW bonus roll optimizer): a Cloudflare Worker that fetches Raidbots droptimizer reports and QE Live upgrade reports and normalizes both into a shared `NormalizedReport` schema. No ranking/EV/UI logic here — that's a separate job/repo.

## Code style

- **TypeScript, with a build-free Workers runtime.** Wrangler bundles `src/index.ts` directly; no separate build step to run locally.
- Keep normalizer logic (`src/normalize/raidbots.ts`, `src/normalize/qelive.ts`) and the encounter-items lookup (`src/lookup/encounterItems.ts`) **pure** — no `fetch`, no Cache API/KV access — so they're testable with plain fixtures. `src/index.ts` (the Worker handler) does all I/O and calls into these.
- Minimal dependencies: standard library + Workers runtime API + `@cloudflare/workers-types` only.

## Testing

- `npm test` runs the fixture-based unit tests (`test/*.test.ts`, vitest). These must stay hermetic — no real network calls.
- `npm run test:live` runs `test/integration.test.ts` against the real Raidbots/QE Live APIs. Skipped by default (gated on `RUN_LIVE=1`); don't let it run in CI.
- `npm run typecheck` runs `tsc --noEmit`. CI runs typecheck + unit tests on every push (`.github/workflows/ci.yml`).
- Don't merge a normalizer or lookup change without unit test coverage for it.

## Deployment

- Not deployed automatically. `wrangler.toml` has a commented-out route for `gallagioloot-proxy.icehunter.net` — don't uncomment/deploy without explicit instruction.

## Behavior

- Endpoints: `GET /raidbots/:id`, `GET /qelive/:id`, `GET /encounter-items` (debug), `GET /health`. See `README.md` for the full schema and upstream shape notes, including two mismatches found against the original spec (the Raidbots data-hash discovery location, and `encounter-names.json`/`instance-names.json` being flat objects rather than arrays).
- CORS: `https://gallagioloot.icehunter.net` (configurable via `wrangler.toml [vars] ALLOWED_ORIGIN`) plus `http://localhost:*` for dev.
