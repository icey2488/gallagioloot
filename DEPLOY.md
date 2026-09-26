# Deployment

Two independent Cloudflare Workers, both in this repo, both deployed with the Wrangler CLI directly (no Git integration is wired up — git remote `origin` is https://github.com/icey2488/gallagioloot.git, but nothing deploys from it). Account: `Theicehunter@proton.me's Account` (`0e326de3f6a9e1ed9b068f05948bd302`). Zone: `icehunter.net`.

## Proxy — `gallagioloot-proxy.icehunter.net`

Config: `wrangler.toml` (repo root).

```bash
npm install
npm run typecheck && npm test
npx wrangler deploy
```

- **KV namespace**: `ENCOUNTER_ITEMS_KV`, id `d50d2ff681c24da8b3360cca19c740c5`, declared under `[[kv_namespaces]]` in `wrangler.toml`. Backs the Raidbots encounter-items lookup and the learned tier-slot cache (see README.md). If it's ever lost, recreate with `npx wrangler kv namespace create ENCOUNTER_ITEMS_KV` and paste the new `id` into `wrangler.toml` — everything repopulates lazily from live traffic, nothing to restore.
- **CORS origin**: `wrangler.toml [vars] ALLOWED_ORIGIN` (currently `https://gallagioloot.icehunter.net`). `http://localhost:<any port>` is always allowed in addition, hardcoded in `src/index.ts` (`resolveAllowedOrigin`) — not configurable via `wrangler.toml`.
- **Route**: `routes = [{ pattern = "gallagioloot-proxy.icehunter.net", custom_domain = true }]` — must appear **before** the `[vars]`/`[observability]`/`[[kv_namespaces]]` table headers in `wrangler.toml`. TOML scopes bare keys to whichever table was most recently opened; a `routes = [...]` line placed after `[[kv_namespaces]]` silently becomes a bogus field on that KV binding instead of a top-level key (hit this exact bug during the first deploy — Wrangler warns `Unexpected fields found in kv_namespaces[0] field: "routes"` and the route is silently not applied).

## Site — `gallagioloot.icehunter.net`

Config: `web/wrangler.toml` (its own file — deliberately *not* sharing the root `wrangler.toml`, see pitfall below). Deployed as a Workers static-assets project (`[assets] directory = "./dist"`), not classic Cloudflare Pages — `wrangler pages project create` on Wrangler 4.130 now redirects to "the latest version of Cloudflare Pages, now part of Cloudflare Workers" and no longer creates an actual Pages project.

```bash
cd web
npm install
npm run typecheck && npm test
npm run build              # reads web/.env.production -> VITE_PROXY_BASE_URL=https://gallagioloot-proxy.icehunter.net
npx wrangler deploy        # uses web/wrangler.toml, uploads dist/
```

- **Footer version stamp (v2.14)**: the footer shows `v2.14 · <short sha> · Source`. The version is `APP_VERSION` in `web/src/lib/buildInfo.ts`; the sha is read from git at `npm run build` time (`web/build-info.ts` via `web/vite.config.ts`), so **build from the final pushed commit with a clean tree** (`git status --short` empty, `git rev-parse HEAD` = `origin/main`), then deploy that build; a dirty tree ships a `<sha>-dirty` stamp, which `check:live` fails on. Committing after the build makes the stamp name an older commit than origin/main -- rebuild instead.
- **Proxy base URL**: `web/.env.production` (`VITE_PROXY_BASE_URL`), baked in at build time by Vite. `web/.env.development` points it at `http://localhost:8787` for local dev.
- **Route**: `web/wrangler.toml` — `routes = [{ pattern = "gallagioloot.icehunter.net", custom_domain = true }]`.
- **Pitfall — always run `wrangler deploy` from inside `web/`, with `web/wrangler.toml` present.** Wrangler resolves its config by walking up from the current directory. Before `web/wrangler.toml` existed, running a Pages/deploy command from `web/` climbed to the repo-root `wrangler.toml` (the proxy's config) and deployed the *proxy's worker script* under a new script name while reusing the root config's route — which briefly stole the `gallagioloot-proxy.icehunter.net` custom domain away from the real proxy worker. Fixed by giving `web/` its own `wrangler.toml` and by redeploying the proxy to reclaim the route. Custom domains are exclusive to one Worker script per hostname; if a hostname ever resolves to the wrong content, check which script owns it with:
  ```bash
  npx wrangler deployments list --name gallagioloot-proxy
  npx wrangler deployments list --name gallagioloot
  ```
  and redeploy the correct one to reclaim it.

## Smoke test

**Run `npm run check:live` (in `web/`) after every deploy** — it drives the live site at 1280px and 390px with a real raid droptimizer + Mythic+ droptimizer + Top Gear report and asserts (PASS/FAIL per check, non-zero exit on any failure) the compact report blocks (drop line with the Myth 9/6 (344) exception on the Mythic raid, sim dates, the closed "N notes" toggle, Voidcores on hand mirrored with Run settings, the "One more Voidcore" line), the M+ section, target EVs, Ula'tek's 4-item pool (4 / 4, no Curio row, the curio note), the none-on-hand kill-order card (Ula'tek or The Coiled Altar, One more Voidcore 0.92% vs the Vial 0.74%) and its no-saved-rolls explanation, the v2.09 Voidcore supply card at 3 on hand (ordered list; earned 1: "spend now 0.65% vs hold ~0.81% next week, playing without ~0.65% for 1 week"; earned 2: "spend now"; the strip's hold values with their clause), one toss-up determination at 1 roll (no "the pick holds" beside "Toss-up"), the footer's nine supply assumptions (incl. the re-run-after-a-win line), the v2.11 plan disclosure (3 on hand: reminder, no Mythic+ line; 6 on hand: "Plan assumes you run Altar of Fangs at +10 once this week.") and the "Holding delays the upgrade" line, the spec-specific pill, the v2.12 theme picker (Midnight default; Felt green and Craps red set `data-theme`, page background and wordmark gold, persist across a reload; an unknown stored value falls back to Midnight) the v2.13 report URL rows (per theme at 1280 and 390: add rows to the cap of 8 with "+" disabled and "Max 8 reports", remove rows, "-" only with 2+ rows, focus ring and tokens on the controls, duplicate row and already-loaded blocked, a bad URL failing on its own row, and a parallel "Fetch all" of two real reports) the v2.14 footer stamp (per theme at 1280 and 390: `v2.14 · <sha> · Source` with the sha equal to `git rev-parse --short HEAD`, no `-dirty`, the commit and repo hrefs, new-tab links with `rel="noopener noreferrer"`, focus ring, fit) and layout (screenshots/JSON land gitignored in `web/design/live-single-page-*`).

```bash
cd web
npx playwright install chromium   # first time only
npx tsx design/live-check.mts
```

Opens `https://gallagioloot.icehunter.net`, pastes a live Raidbots report URL, walks Paste → Rollable Bosses (asserts 8 rows) → recommendation card (asserts the headline and the toss-up kill-order line) → Loot Table for one boss (asserts rows render). Screenshots land in `web/design/live-*.png`.

If `gallagioloot.icehunter.net` fails to resolve locally with `Could not resolve host`, it's very likely a stale local DNS cache (seen on this machine's router after first creating the record), not a real outage — check `nslookup gallagioloot.icehunter.net 1.1.1.1` against a public resolver before assuming the deploy is broken. `design/live-check.mts` launches Chromium with `--host-resolver-rules` pointing directly at the record's IP so the test isn't affected by this.
