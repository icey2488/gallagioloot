# GallagioLoot Proxy

A Cloudflare Worker that fetches Raidbots droptimizer reports and Questionably Epic (QE) Live upgrade reports, and normalizes both into a single common shape (`NormalizedReport`). Data layer only — no ranking, EV, or UI logic lives here.

Companion site: `gallagioloot.icehunter.net`. This worker is intended to run at `gallagioloot-proxy.icehunter.net` (not deployed by this job — config only).

---

## Endpoints

All endpoints are `GET`, return JSON, and support CORS for `https://gallagioloot.icehunter.net` and `http://localhost:*` (any port, for local dev).

### `GET /raidbots/:id`

Fetches `https://www.raidbots.com/reports/{id}/data.json`, normalizes it, and returns a `NormalizedReport`.

`:id` accepts either a bare 22-character Raidbots report id (`jk6WmLFEnBpEqWueDkyRqA`) or a full report URL containing one — the id is extracted with a regex, so `/raidbots/jk6WmLFEnBpEqWueDkyRqA` and a URL-encoded full report link both work. A `url` or `id` query parameter is also accepted as a fallback.

Rejects with `400 unsupported_report` if the report's `simbot.simType` isn't `"droptimizer"` (e.g. raid-summary reports).

### `GET /qelive/:id`

Fetches `https://questionablyepic.com/api/getUpgradeReport.php?reportID={id}`, normalizes it, and returns a `NormalizedReport`.

`:id` accepts a bare 12-lowercase-letter QE Live id (`wzfyzqxqjqej`) or a full report URL, same extraction rules as above.

### `GET /encounter-items`

Returns the cached Raidbots item → encounter/instance lookup as JSON, for debugging. Not meant for production consumption — it's a full dump of the lookup maps built from Raidbots' static data files.

### `GET /` or `GET /health`

Health check.

### Caching

Normalized reports are cached in the Cloudflare Cache API for ~10 minutes, keyed by `source + id`. The Raidbots static-data lookup (see below) is cached separately for 24 hours, keyed by the data hash — in Workers KV if an `ENCOUNTER_ITEMS_KV` binding is configured, otherwise via the Cache API so everything still works under `wrangler dev` with no KV setup.

---

## Normalized schema

Both sources are normalized into exactly this shape:

```ts
type NormalizedReport = {
  source: 'raidbots' | 'qelive'
  reportId: string
  character: string
  realm?: string
  region?: string
  spec: string                 // lowercase spec name, e.g. "elemental", "restoration"
  charClass?: string
  role: 'dps' | 'healer' | 'tank'
  metric: 'dps' | 'hps'
  contentType: 'raid' | 'dungeon' | 'other'
  difficulty: string
  baseline: number              // absolute dps/hps of the equipped set
  instanceId?: number
  instanceName?: string
  items: NormalizedItem[]
  warnings: string[]            // e.g. "Trash Drop entries removed (4)"
}

type NormalizedItem = {
  itemId: number
  name: string
  slot?: string
  encounterId: number
  encounterName: string
  instanceId: number
  ilvl: number
  delta: number                 // absolute gain vs baseline (can be negative)
  pct: number                   // delta / baseline * 100
  catalystSourceId?: number     // raidbots only, when the row is a catalyst conversion
  offSpec?: boolean
}
```

---

## Upstream shape notes

### Raidbots `data.json`

- Baseline: `sim.players[0].collected_data.dps.mean`.
- `simbot.simType` must be `"droptimizer"`.
- `simbot.meta.rawFormData.droptimizer.{instance,difficulty}` give the report's instance id and difficulty string (e.g. `"raid-vault-heroic"`).
- `simbot.meta.itemLibrary[]` and `simbot.meta.instanceLibrary[]` provide item names/slots and encounter names for everything in the report.
- `sim.profilesets.results[].name` is slash-delimited: `instanceId/encounterId/difficulty/itemId/ilvl/enchantId/slot////catalystSourceId`. The trailing segment is only non-empty for catalyst-conversion rows. `delta = result.mean - baseline`.
- Negative `encounterId`s (e.g. `-97` = "Trash Drop") are excluded from `items` and rolled into a `warnings` entry.
- The same `itemId` can appear under multiple `encounterId`s (tier tokens drop from several bosses) — one `NormalizedItem` is emitted per `(itemId, encounterId, catalystSourceId)` row.

### QE Live `getUpgradeReport.php`

- **The response body is double-JSON-encoded.** `JSON.parse(bodyText)` yields a *string*; `JSON.parse()` that string again to get the actual report object. (`parseQELiveResponseBody` in `src/normalize/qelive.ts` does this and throws if the first parse doesn't yield a string.)
- Only `results[]` rows with `dropType === "bonus"` are used — QE already prices these at bonus-roll item level. `rawDiff` is the absolute HPS gain; `percDiff` is already a percentage — used directly as `delta`/`pct`, no re-derivation.
- Rows are further filtered by `dropLoc`: `"Raid"` rows for a `contentType: "Raid"` report, `"Dungeon"` rows for `"Dungeon"`. `"Crafted"` and `"Delves"` bonus rows are excluded with a warning.
- QE Live doesn't expose the equipped-set baseline directly. It's derived as `baseline = rawDiff / (percDiff / 100)`, taking the **median** across kept rows with nonzero `percDiff` for stability. If no row qualifies, `baseline = 0` and a warning is added.
- `results[]` rows carry **no encounter or item-name info** — only an item id. Both are joined from the Raidbots encounter-items lookup (below). Items with no mapping are dropped from `items` and listed by id in `warnings`.

### Raidbots static encounter-items lookup

Used to join QE Live's bare item ids to `(instanceId, encounterId, name, slot)`, and as a fallback for Raidbots rows missing library entries.

- The current data-hash is **not** embedded as a `/static/data/{hash}/...` URL anywhere in `raidbots.com`'s HTML (the spec assumed this). It's in an inline `<script>` block: `var config = {"gameDataVersion":"<32-hex-hash>", ...}`. `extractGameDataVersion()` regex-matches that field directly.
- `encounter-items.json` is an array of `{ id, name, inventoryType, sources: [{ instanceId, encounterId }], ... }` — matches the spec.
- `instances.json` is an array of `{ id, name, type, encounters: [{ id, name, trash? }] }` — matches the spec.
- **`encounter-names.json` and `instance-names.json` are flat `{ [id: string]: name }` objects, not arrays** (the spec assumed arrays). `buildEncounterItemsLookup()` handles this directly; instance/encounter names are also backfilled from `instances.json` itself so trash/negative ids (e.g. `-97` "Trash Drop") resolve even when absent from the flat name files.
- Items that are only obtainable via catalyst conversion (their `sources` point at aggregate buckets like `-100` "Catalyst Season 2" rather than a real boss) have no positive-instance source in `encounter-items.json` and so cannot be joined to a specific encounter — these surface as "no encounter mapping" warnings rather than a bug. Observed on the live Sep 2026 season 2 gear (tier-set pieces like "Serpent Crown of the Ophidian Oracle").

---

## Local development

```bash
npm install
npm run typecheck
npm test          # unit tests (fixture-based, offline)
npm run dev        # wrangler dev on http://localhost:8787
```

### Live integration test

`test/integration.test.ts` hits the real Raidbots and QE Live APIs and the real Raidbots static-data lookup. It's skipped by default; run it explicitly with:

```bash
npm run test:live
```

---

## Configuration

`wrangler.toml [vars] ALLOWED_ORIGIN` sets the production CORS origin (defaults to `https://gallagioloot.icehunter.net`). `http://localhost:<any port>` is always allowed in addition, for local dev.

An optional `ENCOUNTER_ITEMS_KV` KV namespace binding enables persistent caching of the Raidbots lookup across requests/deploys; without it, the Cache API is used instead (works fine locally, but is best-effort/per-colocation in production).

---

## Deployment

Not deployed by this job. `wrangler.toml` includes a commented-out `[[routes]]` block for `gallagioloot-proxy.icehunter.net/*` — fill in a `zone_name`/`zone_id` and deploy manually or wire up Cloudflare's Git integration when ready.
