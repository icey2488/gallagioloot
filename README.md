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

### `GET /tier-map/:instanceId`

Returns the merged seed + learned tier-slot mapping for a raid instance, for debugging:

```ts
{
  instanceId: number
  known: boolean            // registered in the static seed table (src/lookup/tierSeed.ts)?
  curioEncounterId?: number // e.g. 2895 (Ula'tek) for The Venomous Abyss
  bySlot: Record<string, number[]>  // tier slot -> encounter ids (seed ∪ learned)
  byItem: Record<number, number[]>  // item id -> encounter ids (learned cache only; the seed has no per-item data)
}
```

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
  viaCurio?: boolean            // true when encounterId is a class-neutral curio token source (e.g. Ula'tek), not a direct tier-slot boss
  tierSlot?: string             // the tier armor slot this row was resolved for (e.g. "head"); set only on tier-token rows resolved via the seed/learned lookup
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
- A `"Raid"` report's rows can span **every raid instance active in the current tier** (e.g. the main raid plus a smaller "raid lair"), since QE Live doesn't scope `dropLoc: "Raid"` to one instance. `normalizeQELiveReport` resolves every row via the encounter-items lookup, tallies which instance each resolved row belongs to, and keeps only the rows matching the dominant (most-represented) instance — the report's own `instanceId`/`instanceName` are set from that instance, matching the Raidbots normalizer's one-report-per-instance behavior. Rows resolving to a different instance are dropped with a count in `warnings`. See "Ninth boss" under Decision engine for how this was found.
- QE Live doesn't expose the equipped-set baseline directly. It's derived as `baseline = rawDiff / (percDiff / 100)`, taking the **median** across kept rows with nonzero `percDiff` for stability. If no row qualifies, `baseline = 0` and a warning is added.
- `results[]` rows carry **no encounter or item-name info** — only an item id. Both are joined from the Raidbots encounter-items lookup (below). Items with no mapping are dropped from `items` and listed by id in `warnings`.

### Raidbots static encounter-items lookup

Used to join QE Live's bare item ids to `(instanceId, encounterId, name, slot)`, and as a fallback for Raidbots rows missing library entries.

- The current data-hash is **not** embedded as a `/static/data/{hash}/...` URL anywhere in `raidbots.com`'s HTML (the spec assumed this). It's in an inline `<script>` block: `var config = {"gameDataVersion":"<32-hex-hash>", ...}`. `extractGameDataVersion()` regex-matches that field directly.
- `encounter-items.json` is an array of `{ id, name, inventoryType, sources: [{ instanceId, encounterId }], ... }` — matches the spec.
- `instances.json` is an array of `{ id, name, type, encounters: [{ id, name, trash? }] }` — matches the spec.
- **`encounter-names.json` and `instance-names.json` are flat `{ [id: string]: name }` objects, not arrays** (the spec assumed arrays). `buildEncounterItemsLookup()` handles this directly; instance/encounter names are also backfilled from `instances.json` itself so trash/negative ids (e.g. `-97` "Trash Drop") resolve even when absent from the flat name files.
- Items that are only obtainable via catalyst conversion (their `sources` point at aggregate buckets like `-100` "Catalyst Season 2" rather than a real boss) have no positive-instance source in `encounter-items.json` and so cannot be joined to a specific encounter via `pickBestSource`. Tier-set armor pieces hit this exact case (`sources: [{ instanceId: -100, encounterId: -100 }]`) — see **Tier-token resolution** below for how these are still resolved instead of dropped.

---

## Tier-token resolution

Raidbots' static `encounter-items.json` points tier-set armor items (head/shoulder/chest/hands/legs tokens) at an aggregate catalyst bucket (`instanceId: -100`) instead of a real boss, so `pickBestSource` alone can't join them to an encounter. Two layers resolve them instead, tried in order:

1. **Learned cache** (`src/lookup/tierLearned.ts`) — every `/raidbots/:id` request extracts `(instanceId, itemId) -> encounterId[]` and `(instanceId, tierSlot) -> encounterId[]` from that report's own `simbot.meta.itemLibrary`/profileset rows (which *do* carry real per-boss encounter ids) and merges it (union, never replace) into a persistent cache keyed by instance, TTL 30 days. Backed by `ENCOUNTER_ITEMS_KV` if bound, else the Cache API, else an in-memory map (so it's exercisable under plain `vitest`, which has neither).
   - **Tier-item detection**: an item is treated as a tier item if its itemLibrary entry carries `itemSetId` — confirmed live (2026-09-08) that Raidbots inlines this directly on tier items (e.g. item 271483 carries `itemSetId: 2065`, matching static `item-sets.json` entry "Ophidian Oracle's Prophecy", which lists all 5 armor pieces for the set). This made a separate `item-sets.json` fetch unnecessary at request time. Fallback (not exercised by current season data): an item with more than one distinct source encounter in the report, one of which is the seed's curio encounter, is also treated as a tier item.
   - Catalyst-conversion rows (profileset name has a non-empty trailing `catalystSourceId` segment) and trash rows are excluded from what's learned — only direct token drops are recorded.
2. **Static seed** (`src/lookup/tierSeed.ts`) — a hand-maintained `(instanceId, tierSlot) -> encounterId[]` table, one entry per current raid tier. Doesn't hardcode item ids (they differ per class/armor type); joins on slot instead. Used when the learned cache has nothing yet for that item.

If neither has anything, the row is dropped with the existing "no encounter mapping" warning.

**Resolution order** (for a QE Live row, or a Raidbots row whose profileset entry itself points at an aggregate bucket — rare, not observed in live season data, but the code path is shared):
1. `pickBestSource`/direct profileset encounter id, if positive.
2. Else determine the item's slot from `encounter-items.json`'s `inventoryType` (`1`→head, `3`→shoulder, `5`/`20`→chest, `7`→legs, `10`→hands — `INVENTORY_TYPE_TO_SLOT` in `src/normalize/qelive.ts`). QE Live's own rows carry no slot info at all.
3. Learned cache for that exact item id, if present.
4. Else the static seed for that slot.
5. Else drop with a warning.

One `NormalizedItem` is emitted per `(itemId, encounterId)` the item resolves to — a tier item typically resolves to two rows (its direct slot boss, and the curio boss), both with `tierSlot` set and `viaCurio: true` only on the curio row.

QE Live reports carry no instance id of their own, so when a row needs the tier fallback, the "current" instance is inferred as whichever instance the report's other (directly-resolved) rows most commonly belong to.

### Seed table contents (`src/lookup/tierSeed.ts`)

Verified 2026-09-08 against a live Raidbots report (`jk6WmLFEnBpEqWueDkyRqA`) and a live QE Live report (`wzfyzqxqjqej`):

| Instance | Boss | Tier slot |
|---|---|---|
| The Venomous Abyss (1320) | Nek'zali the Soulcoiler (2888) | — |
| | Entombed Sentinels (2874) | hands |
| | The Lost Explorers (2894) | shoulder |
| | Vashnik the Malignant (2882) | chest |
| | Sszorak (2871) | legs |
| | The Twin Fangs (2887) | head |
| | The Coiled Altar (2883) | — |
| | Ula'tek (2895) | all five (curio: "Slumbering Coil Curio") |
| The Tidebound Grotto (1317) | Nymrissa Wavecaller (2849) | — (not yet open for bonus rolls) |

**Contradicts the original task spec:** the spec that seeded this table said Tidebound Grotto was `instanceId 1322`, `encounterId 2878`. Live Raidbots static data shows `1322` is actually a *different*, unrelated zone ("Altar of Fangs", a 3-boss Mythic+ dungeon whose first boss happens to be `2878` "Rav'i"). The real Tidebound Grotto — a single-boss raid Lair — is `instanceId 1317`, boss `2849` ("Nymrissa Wavecaller"). The seed table uses the verified values (1317/2849); registering the spec's original numbers would have silently corrupted the unrelated Altar of Fangs dungeon's entry.

---

## Decision engine

`src/core/` decides where to spend a Nebulous Voidcore bonus roll, given a `NormalizedReport` and a per-character knockout state. It's pure TypeScript with zero Worker/runtime dependencies (no `fetch`, no Cache API/KV, no `Date.now()` except via caller-supplied timestamps) so a future frontend can import it directly instead of going through this Worker.

### Mechanics modeled

A Voidcore is spent on a specific boss **on its first kill per difficulty per week** and transmutes into an item from that boss's loot pool for the player's current spec, at Great Vault item level (which the source reports already reflect). There is no rolling the same boss twice at one difficulty in a week — the offer is a first-kill-only bonus, not a repeatable one, so a second Voidcore always has to go to a *different* boss. Each successful roll "knocks out" that item from the pool for that character at that difficulty — it won't drop again until every eligible item has been transmuted. Voidcores are character-bound.

**Community-reported, not documented in-game (treated as an assumption and surfaced in every `Recommendation`):** the knockout table is shared across a character's specs at a given difficulty — except for spec-specific drops — and is **not** shared across difficulties.

### The model

- **Pool** (`buildBossPools` in `src/core/pool.ts`): groups a report's items by boss (encounter), excluding trash (negative encounter ids) and off-spec items (unless `includeOffSpec`). Duplicate rows for the same item within a boss (catalyst variants, multiple slots) collapse into one `PoolEntry`, taking the max delta across them. A downgrade (`delta < 0`) floors to `value: 0` — the player just won't equip it, so it's not a loss, only a wasted roll. Applying a knockout state whose `difficulty` doesn't match the report's difficulty is refused (with a note on every affected boss) rather than silently misapplied.
- **Curio**: a class-neutral token (e.g. Ula'tek's "Slumbering Coil Curio") is exchangeable for *any* missing tier slot, so all `viaCurio` rows for that boss collapse into a single `PoolEntry` of kind `'curio'` — one item in the pool, knocked out as one item, valued at the best of the slots it could fill.
- **EV**: `ev` is the uniform-draw mean over the boss's remaining (non-knocked-out) pool; `evPct = ev / baseline * 100`. A boss is `deployable` when it has a remaining pool, `evPct >= thresholdPct` (default `0.2`, i.e. 0.2% of baseline — low by design, since with an empty knockout state almost every boss clears it; the threshold mostly bites once a character has knocked out most of a boss's upgrades), and — if `settings.expectedKills` is set — its encounter id is in that list.
- **Expected kills** (`settings.expectedKills?: number[]`): optional list of encounter ids the player expects to kill this week. Undefined (the default) means every boss in the report is in play. When set, a boss whose encounter id isn't listed is still evaluated — it still shows up in the per-boss table with its real `ev`/`evPct` — but is forced `deployable: false` with a note (`"not in expected kills this week"`) and excluded from allocation. This is the intended way to scope a report down to one raid instance's bosses, or to a subset of a week's planned clears; see the "Ninth boss" note below for why a QE Live report can otherwise span more bosses than one instance actually has.
- **Allocation** (`recommend` in `src/core/rank.ts`):
  - 1 roll: pick the deployable boss with the highest `ev` (ties: highest `bestCase` value, then encounter order).
  - 2 rolls (from season week 8 on — the caller supplies `rollsAvailable`, this code never computes it from dates): since a boss only offers its bonus roll on the first kill, the two rolls must land on two *distinct* bosses — the top two deployable bosses by `ev` (same tie-break as above). There is no same-boss-twice case to weigh against it.
  - If no boss is deployable, `allocations` is empty and `fallback` explains why (`'below-threshold'` vs `'no-pool'`) with a message suggesting the Great Vault's Thalassian Tokens of Merit instead — exported as `fallbackMessage()` so a frontend can override the copy.
  - `assumptions` always lists the modeling assumptions above — including the unverified cross-spec knockout sharing, the first-kill-only bonus roll, and that ranking is limited to bosses you expect to kill this week — regardless of whether a recommendation was possible.
- **Knockout state** (`src/core/knockout.ts`): `createState`/`addEntry` (idempotent per item id)/`removeEntry`/`markSpecSpecific`/`serialize`/`deserialize` (tolerant of unknown/missing fields) plus a `StorageAdapter` interface (`load`/`save`/`list`) with an in-memory implementation for tests — a browser adapter (e.g. `localStorage`) is left to the frontend. `storageKey()` builds the persistence key as `${region}:${realm}:${character}:${difficulty}`, lowercased. `reconcile(state, report, outcome)` records a roll's outcome and returns the updated state plus freshly rebuilt `BossEval[]`/`Recommendation` in one call, for a post-kill UI screen; a curio constituent knockout naturally knocks out the whole collapsed curio entry, since `buildBossPools` matches on any of a `PoolEntry`'s `itemIds`.

### Vault comparison (`src/core/vault.ts`)

The player faces a Great Vault choice each week: take a specific vault item outright, or take the Nebulous Voidcore and spend the week's bonus roll(s) instead.

- **`rollsToTarget(pool, entryKey, thresholdValue)`**: with knockout, a roll is a uniform draw *without replacement* from the remaining pool, so the expected number of rolls to land one specific entry in a pool of `n` remaining is `(n+1)/2` and the worst case is `n` (standard without-replacement rank argument). It also computes a threshold-truncated version: the expected number of rolls a player would *actually* spend hunting the target, given they'd abandon the pool once — after a miss — its remaining mean value (over the entries still left, target included) falls below `thresholdValue` (absolute, `thresholdPct/100 × baseline`). The truncated case is computed exactly via a recurrence over remaining subsets (memoized on the subset's sorted keys), not simulation — each state's continuation depends only on which entries remain, not the draw order that got there — and cross-checked in tests against brute-force enumeration of all removal orders on a 4-item pool. Every non-knocked-out `PoolEntry` on a `BossEval` carries its own `rollsToTargetExpected`/`rollsToTargetWorst`/`rollsToTargetTruncated`, computed against that boss's remaining pool, so a frontend can show "about K rolls to land this" for any item.
- **`compareVault({ vaultItem, bossEvals, recommendation, settings, report })`**: returns a `VaultDecision`.
  - **Voidcore option**: `voidcoreGainPct = recommendation.totalExpectedGainPct` (for `settings.rollsAvailable` rolls).
  - **Vault item option**: `vaultItemGainPct = vaultItem.gainPct + savedRolls × altRollEvPct`. `savedRolls` is the `expectedTruncated` rolls to hit that item via bonus roll, if its loot pool is identifiable — matched by `itemId` against a `PoolEntry` across all bosses first, falling back to `encounterId` against a whole `BossEval` (using its `bestCase` entry as the target, since the vault item may represent a whole dungeon/boss's reward rather than one specific item) — capped at the pool's remaining count; if no pool is identifiable, `savedRolls = 0` with a note. `altRollEvPct` is the `evPct` of the best deployable boss *other than* the vault item's own pool (`0` if none).
  - **Verdict**: `'tokens'` when neither option clears `thresholdPct`; else `'toss-up'` when `|voidcoreGainPct − vaultItemGainPct| < max(0.1, 10% of the larger)` (with a note to prefer the vault item on a toss-up if it removes a dungeon from the weekly farm); else `'vault'` or `'voidcore'`, whichever is larger.
  - Returns both option values, `savedRolls`, the verdict, a one-sentence `explanation`, and any `notes` (warnings, the toss-up tip).

### Live sanity check

`npm run test:live` (via `test/core.integration.test.ts`) runs the full pipeline — normalize → `buildBossPools` → `recommend` — against both live fixture reports with an empty knockout state at the default 0.2% threshold, for 1 and 2 rolls, and prints the per-boss table. With no knockouts yet, every boss in both reports clears the threshold, and the 2-roll allocation always lands on the top two distinct bosses by `ev`.

**"Ninth boss" investigation (2026-09-08):** a live QE Live run (report `wzfyzqxqjqej`) was seen reporting 9 deployable bosses for The Venomous Abyss (instance 1320), which only has 8. The 9th was `2849` "Nymrissa Wavecaller" — a real boss, correctly resolved by `pickBestSource` (not a Dungeon/Delves leak, not a tier-token misattachment), but belonging to a *different* raid instance (`1317`, "The Tidebound Grotto"). QE Live's "Raid" `dropLoc` rows span every raid instance active in the current tier, not just one, while the Raidbots normalizer's reports (and the schema's singular `NormalizedReport.instanceId`) assume one instance per report. `normalizeQELiveReport` now resolves every row first, tallies instances across all of them (not just the tier-fallback rows, which is all the old code tallied), keeps only the rows matching the dominant (most-represented) instance, and sets `instanceId`/`instanceName` on the report from that — excluded rows are counted in a warning. Combine this with `settings.expectedKills` to scope a report down further (e.g. to just the bosses you're actually killing this week within that instance).

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
