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

Rejects with `422 unsupported_content` if the droptimizer isn't for a raid boss or a Mythic+ dungeon (e.g. Epic Profession Items, PvP gear, Delves) — bonus rolls only exist for those two sources. See "Content-type classification" below.

### `GET /qelive/:id`

Fetches `https://questionablyepic.com/api/getUpgradeReport.php?reportID={id}`, normalizes it, and returns a `NormalizedReport`.

`:id` accepts a bare 12-lowercase-letter QE Live id (`wzfyzqxqjqej`) or a full report URL, same extraction rules as above.

Rejects with `422 unsupported_content` on the same basis as `/raidbots/:id`, using the report's own top-level `contentType` field (`"Crafted"`/`"Delves"`/etc.) instead of an instance-type lookup.

### `GET /topgear/:id`

Fetches a Raidbots "Top Gear" report from the same `data.json` endpoint `/raidbots/:id` uses (Raidbots serves every sim type from one URL shape), normalizes it, and returns a `NormalizedTopGear`. `:id` accepts the same bare-id-or-URL shapes as `/raidbots/:id`.

Rejects with `400 unsupported_report` if the report's `simbot.simType` isn't `"optimize"`, or it has no `simbot.meta.rawFormData.optimize` block (e.g. a droptimizer or raid-summary report was pasted here instead). **`simbot.simType` for a Top Gear report is `"optimize"`, not `"topgear"`** — verified live 2026-09-20 against a real report (`miriTcb27bfGDYmV6JjvD1`); `simbot.meta.title` reads `"Top Gear · Great Vault"` but that's cosmetic, not a stable discriminator to gate on. See "Top Gear shape notes" below for the full derivation.

```ts
type NormalizedTopGear = {
  source: 'raidbots'
  reportId: string
  character: string
  spec: string
  baseline: number             // absolute dps/hps of the equipped set
  metric: 'dps' | 'hps'
  bestSet: { delta: number; pct: number; items: TopGearItem[] }   // the highest-pct tested combination
  equippedItems: TopGearItem[]
  candidates: TopGearCandidate[]  // items in bestSet not in equippedItems, each resolved to a boss when possible
  allSets: Array<{ delta: number; pct: number; items: TopGearItem[] }>  // every tested combination, sorted by pct desc, trimmed to 10
}

type TopGearItem = { itemId: number; name: string; slot: string; ilvl: number }
type TopGearCandidate = TopGearItem & { encounterId?: number; encounterName?: string; instanceId?: number }
```

Cached like `/raidbots`/`/qelive` (10 minutes, Cache API, keyed by id).

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

### `GET /loot-table/:instanceId?lootSpec=:specId`

Returns every item a given loot spec (a WoW spec id, e.g. `262` for Elemental Shaman) can receive from an instance, grouped by boss in encounter order (trash excluded):

```ts
type LootTable = {
  instanceId: number
  instanceName?: string
  lootSpecId: number
  sourceHash: string          // the Raidbots static-data hash this table was built from -- for freshness display
  encounters: Array<{
    encounterId: number
    encounterName: string
    items: Array<{
      itemId: number
      name: string
      icon?: string
      slot?: string
      itemClass?: number
      itemSubClass?: number
      specSpecific: boolean    // true when the item carries a `specs` restriction (trinkets, cantrip weapons)
      uniqueEquipped: boolean
      onUseTrinket: boolean
      isTier: boolean          // a tier-slot token, resolved to this class's specific variant (see below)
      viaCurio: boolean        // true for the curio boss's rows (e.g. Ula'tek) -- same tier items as isTier, exchangeable for any slot
      tierSlot?: string
    }>
  }>
}
```

Cached per `(hash, instanceId, lootSpecId)` for 24h via the Cache API.

**Eligibility rules** (`src/lookup/lootEligibility.ts`), verified against live Raidbots static data 2026-09-08:

1. `item.specs`, when present, is authoritative (trinkets, cantrip weapons, Maze-roa).
2. `item.allowableClasses`, when present, is authoritative (tier tokens).
3. Weapons (`itemClass 2`): looked up in `weapon-specs.json` by `itemSubClass`.
4. Armor (`itemClass 4`): neck/ring/trinket/cloak inventory types (`2`, `11`, `12`, `16`) are always universal; `itemSubClass` `1`-`4` (cloth/leather/mail/plate) match the class's fixed armor type; anything else (misc off-hand implements, subclass `0`; shields, subclass `6`) falls back to `weapon-specs.json` if it has an entry for that `(itemClass, itemSubClass)` pair, else is treated as unrestricted.
5. Anything else (curio tokens, relics/idols without `specs`/`allowableClasses`) is unrestricted.

Steps 3 and the shield/off-hand half of step 4 are a judgment call beyond what the task's explicit armor-type table covers — `weapon-specs.json` isn't scoped to "weapons" only (it also carries an `itemClass 4` entry for shields and one for a caster-only off-hand implement), and it wasn't obvious whether that entry was meant to be read for armor at all. Applying it seemed clearly more correct than leaving shields/off-hands unrestricted (a Fury Warrior would otherwise see every shield drop), but this is **not verified against an authoritative source** the way the cloth/leather/mail/plate table is — flagged here as the one open uncertainty in the eligibility rules.

**`weapon-specs.json`** (Raidbots static data, fetched alongside the other four files): an array of `{ itemClass, itemSubClass, specsCanDrop, specsCanUse }`. `specsCanUse` is what eligibility filtering reads; `specsCanDrop` is unused (a narrower Raidbots-internal set of specs the *droptimizer sim itself* would offer the item to, not the same thing as "can the spec use it").

**Tier-token resolution for the loot table** (no item ids hardcoded, purely data-driven): the curio boss's own encounter-items.json entry carries a `contains` array listing every class's variant of every tier slot (e.g. 65 entries = 13 classes × 5 slots for The Venomous Abyss's "Slumbering Coil Curio"). `buildLootTable` finds that curio item by its `contains` field, filters `contains` down to the requesting class via each candidate's `allowableClasses`, and groups by slot via `inventoryType` — giving a `(slot -> item)` map for that class with zero hardcoded item ids. The slot's direct boss gets that one item (`isTier: true, viaCurio: false`); the curio boss gets all five (`isTier: true, viaCurio: true`).

### `GET /` or `GET /health`

Health check. Also reports the current Raidbots static-data hash and how long ago it was discovered/cached:

```ts
{ service, version, status, endpoints, dataHash: string, dataHashDiscoveredAt: string /* ISO */, dataHashAgeSeconds: number }
```

If a cached hash's static-data files start 404ing (Raidbots rotated the hash since it was cached), `getEncounterItemsLookup` re-discovers a fresh hash from the homepage once and retries automatically — see `src/lookup/encounterItems.ts` and its regression test in `test/encounterItems.test.ts`.

### Caching

Normalized reports are cached in the Cloudflare Cache API for ~10 minutes, keyed by `source + id`. The Raidbots static-data lookup and the loot table (see below) are cached separately for 24 hours, keyed by the data hash — in Workers KV if an `ENCOUNTER_ITEMS_KV` binding is configured, otherwise via the Cache API so everything still works under `wrangler dev` with no KV setup.

---

## Content-type classification

Bonus rolls only exist for raid bosses and Mythic+ dungeons, so a droptimizer/report for anything
else is rejected with `422 unsupported_content` rather than silently normalized into an empty or
garbage report. This was found live: a droptimizer run against "Epic Profession Items" (crafted
gear, report id `9QDMaj22bvRDSvbCzjsHfQ`) came back with 0 items, spec `arcane`, and
`difficulty: "professionMidnightEpic-331"` — the UI showed the raw string "331" in the Difficulty
box.

**Raidbots** (`src/normalize/raidbots.ts`): classified from `simbot.meta.instanceLibrary[].type`,
the same instance-type field Raidbots' own `instances.json` static data uses. Values seen live:

| `type` | classified as |
| --- | --- |
| `raid` | raid |
| `dungeon` | dungeon |
| `professionMidnightEpic` / `professionMidnightPvp` / `professionMidnightRare` | crafted |
| `pvp-honor` / `pvp-world` / `pvp-conquest` | pvp |
| `delve-mid1` / `delve-mid2` | delve |
| anything else (e.g. `expansion-dungeon`, `mplus-chest`, `catalyst`, `bonus-roll` — container types that never appear as a droptimizer's own instance) | other |

Verified against three live reports: the crafted report above (`instanceLibrary[0].type ===
"professionMidnightEpic"`, `difficulty: "professionMidnightEpic-331"`); the known-good raid report
`jk6WmLFEnBpEqWueDkyRqA` (`instanceLibrary[0].type === "raid"`, `instance: 1320`, `difficulty:
"raid-vault-heroic"`); and `instances.json` itself, which confirms the `raid`/`dungeon` type values
independently of any single report. Old Mythic+ droptimizer report links found for cross-reference
(e.g. `simbot/report/2aqK5obaaRHgFKsNLe1iA1`) had already expired (Raidbots purges old report JSON
from S3), so the dungeon path is additionally backed by a difficulty-string fallback: if
`instanceLibrary[].type` is absent, the report's `difficulty` string is checked for a `"raid"` or
`"dungeon"` prefix (both Raidbots difficulty strings observed live follow a `"{type}-{qualifier}"`
shape, e.g. `"raid-vault-heroic"`, `"professionMidnightEpic-331"`).

**QE Live** (`src/normalize/qelive.ts`): classified directly from the report's own top-level
`contentType` field (`"Raid"` / `"Dungeon"` / `"Crafted"` / `"Delves"`, case-insensitive) — no
instance-type lookup needed since QE Live reports carry it already.

Either normalizer throws `UnsupportedContentError` (`src/normalize/contentType.ts`) for anything
that isn't raid or dungeon; `src/index.ts` catches it and returns:

```json
{
  "error": "unsupported_content",
  "contentType": "crafted",
  "detail": "This droptimizer is for crafted gear, not a raid boss or Mythic+ dungeon.",
  "hint": "Run the droptimizer for a raid or a Mythic+ dungeon; bonus rolls only apply there."
}
```

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
  warnings: string[]            // e.g. "Trash Drop entries removed (4)"; also a max-upgrade warning (see below)
  lootSpecId?: number
  targetKind?: 'raid' | 'mplus' // undefined on older payloads = 'raid'
  track?: {                     // raidbots only, from itemLibrary (src/normalize/track.ts)
    name?: string               // "Myth"
    keyLevelMin?: number        // M+ only: overrides.difficulty.keyLevels[0], e.g. 10 = "+10 and above"
    dropIlvl?: number           // M+: overrides.difficulty.itemLevelOverride (318); raid: itemLibrary dropLevel
    simmedIlvl?: number         // most common itemLibrary itemLevel (334)
    upgradeLevel?: number       // lowest upgrade step simmed (6)
    upgradeMax?: number         // (6)
    upgradeFullName?: string    // "Myth 6/6"
    atMaxUpgrade?: boolean      // false -> report gets a "not simmed at max upgrade" warning
  }
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
  catalystSourceName?: string   // name of the catalystSourceId item, when known
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

### Raidbots Mythic+ droptimizer (verified 2026-09-24, report `a8URThoNZqEXDW3tBtavHq`)

- `rawFormData.droptimizer.instance` is `-1`, the aggregate "Mythic+ Dungeons" instance (`instanceLibrary` type `"mplus-chest"`, whose `encounters` are the 8 season dungeons). `difficulty` is `"dungeon-mythic-weekly10"`.
- **Every profileset row is `-1/-1/...`**: the name carries no dungeon or boss. The normalizer attributes each row to its dungeon by joining `itemId` (or `catalystSourceId` for catalyst rows, since the source item is what drops) to `itemLibrary[].sources[]` (falling back to encounter-items.json), taking the source whose `instanceId` is `-1` — its `encounterId` is the dungeon id. All 101 rows of the fixture attribute to exactly one of 8 dungeons.
- Each dungeon becomes one roll target: `NormalizedItem.encounterId` = dungeon id, `instanceId` = `-1`, `encounterName` = dungeon name, `NormalizedReport.targetKind = 'mplus'`. This matches `/loot-table/-1`, which already returns the 8 dungeons as pseudo-encounters (80 items at Arcane). A single-dungeon Raidbots report (rows with a real positive dungeon id) is normalized to the same shape.
- There is no key-level field anywhere except `itemLibrary[].overrides.difficulty` (an object on M+ reports, a plain string on raid reports): `{ name: "+10 Vault", keyLevels: [10, 999], itemLevelOverride: 318, ... }`. The report sims every item at the chosen upgrade step (`itemLibrary[].upgrade = { name: "Myth", level: 6, max: 6, fullName: "Myth 6/6", itemLevel: 334 }`), not the 318 drop level. The UI labels this "+10 (Myth)", never "Weekly10".
- **Max upgrade**: every report is expected to be simmed at max upgrade of its track (anything below is treated as noise). `track.atMaxUpgrade` is false when any upgradeable itemLibrary entry has `level < max`, and the report gets a warning. QE Live reports carry no upgrade info (`track` undefined, no warning).

### QE Live `getUpgradeReport.php`

- **The response body is double-JSON-encoded.** `JSON.parse(bodyText)` yields a *string*; `JSON.parse()` that string again to get the actual report object. (`parseQELiveResponseBody` in `src/normalize/qelive.ts` does this and throws if the first parse doesn't yield a string.)
- Only `results[]` rows with `dropType === "bonus"` are used — QE already prices these at bonus-roll item level. `rawDiff` is the absolute HPS gain; `percDiff` is already a percentage — used directly as `delta`/`pct`, no re-derivation.
- Rows are further filtered by `dropLoc`: `"Raid"` rows for a `contentType: "Raid"` report, `"Dungeon"` rows for `"Dungeon"`. `"Crafted"` and `"Delves"` bonus rows are excluded with a warning.
- A `"Raid"` report's rows can span **every raid instance active in the current tier** (e.g. the main raid plus a smaller "raid lair"), since QE Live doesn't scope `dropLoc: "Raid"` to one instance. `normalizeQELiveReport` resolves every row via the encounter-items lookup, tallies which instance each resolved row belongs to, and keeps only the rows matching the dominant (most-represented) instance — the report's own `instanceId`/`instanceName` are set from that instance, matching the Raidbots normalizer's one-report-per-instance behavior. Rows resolving to a different instance are dropped with a count in `warnings`. See "Ninth boss" under Decision engine for how this was found.
- QE Live doesn't expose the equipped-set baseline directly. It's derived as `baseline = rawDiff / (percDiff / 100)`, taking the **median** across kept rows with nonzero `percDiff` for stability. If no row qualifies, `baseline = 0` and a warning is added.
- `results[]` rows carry **no encounter or item-name info** — only an item id. Both are joined from the Raidbots encounter-items lookup (below). Items with no mapping are dropped from `items` and listed by id in `warnings`.

### Raidbots "Top Gear" report (`optimize` simType)

**Contradicts the original task spec:** the task assumed `simbot.simType === "topgear"`. Fetching a real Top Gear report (`miriTcb27bfGDYmV6JjvD1`, a "Top Gear · Great Vault" run, verified live 2026-09-20) shows `simbot.simType` is actually `"optimize"` — the same value Raidbots' plain "Quick Sim"/gear-optimizer reports use. `simbot.meta.title` (`"Top Gear · Great Vault"` for this report) names the feature, but it's free-text UI copy, not a stable field to gate on; `/topgear` instead requires `simbot.simType === "optimize"` **and** a `simbot.meta.rawFormData.optimize` block being present (a plain droptimizer report has `simType: "droptimizer"` and no `optimize` block at all, so this combination still rejects it cleanly).

Unlike a droptimizer report, an "optimize" report has no `sim.profilesets.results[].name` slash-delimited shape, no `itemLibrary`, and no `rawFormData.droptimizer.{instance,difficulty}` — its own shape instead:

- **Baseline**: `sim.players[0].collected_data.dps.mean`, same field as droptimizer.
- **`rawFormData.optimize.combinations[]`**: one entry per tested gear/talent combination, each a 16-element `gear` index array in a fixed slot order (`head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet, finger1, finger2, trinket1, trinket2, main_hand, off_hand`). Each slot's value indexes into that slot's candidate pool in `rawFormData.optimize.allGear` — **not** into the differently-scoped `rawFormData.optimize.gear` ("selected for combination generation" subset, despite the near-identical name) or `.selected`. Both ring slots (`finger1`/`finger2`) share one pool, `allGear.rings`; both trinket slots share `allGear.trinkets`.
- **`sim.profilesets.results[].name`** is `"Combo N"` (1-indexed into `combinations[]`), with a plain `mean` (no slash-delimited item/encounter info to parse). **Combination 1 (the currently-equipped gear) is never present in `results[]`** — its mean already equals the top-level baseline, so simc doesn't re-test it as a profileset. Confirmed on the live sample: `numCombinations: 4`, but only `"Combo 2"`/`"Combo 3"`/`"Combo 4"` appear in `results[]`.
- **Equipped set**: `rawFormData.optimize.equippedGear`, keyed by pool name (`head`, `trinkets`, `rings`, etc.) with one entry per equipped item, each carrying its own `equippedSlot` (e.g. `"trinket2"`) — used directly, rather than assuming `combinations[0]` is always the baseline (true on the sample, but the seed table lesson elsewhere in this doc is not to trust an unverified structural assumption when the data itself says otherwise).
- **Candidates**: for the winning (highest-`pct`) combination, every item not present in the equipped set, resolved to a boss via the same encounter-items lookup + tier-token seed/learned fallback QE Live uses (`resolveTierEncounters`) — a Top Gear candidate has no instance id of its own either, so a "dominant instance" is established the same way (from whichever other candidates in the same winning combination resolve directly), and a resolved source is only kept if its instance type is actually `raid`/`dungeon` (Top Gear happily tests crafted/PvP/world-content candidates too, which should surface as "not a raid/dungeon item", not a wrong boss).
- On the live sample, the winning combination ("Combo 4", +0.33%) swaps **Lightspire Core** into `trinket2`, replacing the equipped Freightrunner's Flask (the other trinket, Gebbo's Bottomless Bag, just moves slots — not a new candidate). Lightspire Core resolves to a real boss via a direct `encounter-items.json` source (not a tier token), landing on `instanceId 1309`, encounter "Lightwarden Ruia".

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

## Loot specs (`src/lookup/specs.ts`)

A hand-maintained, static table of all 40 current WoW specs (`{ specId, specName, classId, className, role }`), verified 2026-09-08 against Raidbots' own static `talents.json` (which lists exactly 40 spec entries with these fields — a cleaner source than hand-transcribing class/spec ids). Also carries the fixed per-class armor type (cloth/leather/mail/plate) used by the loot-table eligibility rules above.

**Uncertain:** Demon Hunter's third spec, **"Devourer"** (spec id `1480`), is new and not documented in-game anywhere available to this job — Demon Hunter's two known specs are Havoc (dps) and Vengeance (tank). It's classified `role: 'dps'` here as the best inference (a "devouring" theme reads as damage, and `1480` shows up in `weapon-specs.json`'s melee-weapon subclass lists alongside other physical dps specs) — not a confirmed value.

---

## Decision engine

`src/core/` decides where to spend a Nebulous Voidcore bonus roll, given a `NormalizedReport` and a per-character knockout state. It's pure TypeScript with zero Worker/runtime dependencies (no `fetch`, no Cache API/KV, no `Date.now()` except via caller-supplied timestamps) so a future frontend can import it directly instead of going through this Worker.

### Mechanics modeled

A Voidcore is spent on a specific boss **on its first kill per difficulty per week** and transmutes into an item from that boss's loot pool for the player's current spec, at Great Vault item level (which the source reports already reflect). There is no rolling the same boss twice at one difficulty in a week — the offer is a first-kill-only bonus, not a repeatable one, so a second Voidcore always has to go to a *different* boss. Each successful roll "knocks out" that item from the pool for that character at that difficulty — it won't drop again until every eligible item has been transmuted. Voidcores are character-bound.

**Mythic+**: a Voidcore can also be spent at the end of a completed key. It draws from that dungeon's *whole* loot table (all bosses pooled) at the Great Vault track for the key level (+10 and above = Myth). One roll per completed key, and the same dungeon can be rerun, so an M+ target is **repeatable** — there is no distinct-target rule. Knockout is roll-only for both raid and M+.

**Community-reported, not documented in-game (treated as an assumption and surfaced in every `Recommendation`):** the knockout table is shared across a character's specs at a given difficulty — except for spec-specific drops — and is **not** shared across difficulties.

### The model

- **Pool** (`buildBossPools` in `src/core/pool.ts`): groups a report's items by boss (encounter), excluding trash (negative encounter ids) and off-spec items (unless `includeOffSpec`). Duplicate rows for the same item within a boss (multiple slots) collapse into one `PoolEntry`, taking the max delta across them.
  - **Catalyst** (raid and M+ alike): a catalyst row (tier piece, `catalystSourceId` = the item it converts from) is never a pool entry of its own — a roll yields the source item. It credits the source item instead: value = `max(own delta, catalyzed delta)`. When the catalyzed value wins and is a net upgrade, `PoolEntry.catalyst = { itemId, name, tierSlot, pct, ownPct }` and the UI shows "Catalyze into <tier piece>: +x%". Catalyst rows never feed a curio (the curio isn't in the pool at all, see below). *Before 2026-09-24 each catalyst row was an extra pool entry keyed by the tier piece (not in the boss's loot table) while the source kept its own, usually 0, value; on raid 6PTZ7 (Arcane) this moved Coiled Altar 0.676 → 0.812, Ula'tek 0.588 → 0.798, Lost Explorers 0.461 → 0.614, Twin Fangs 0.495 → 0.366, Nek'zali 0.279 → 0.349 (EV%).* A downgrade (`delta < 0`) floors to `value: 0` — the player just won't equip it, so it's not a loss, only a wasted roll. Applying a knockout state whose `difficulty` doesn't match the report's difficulty is refused (with a note on every affected boss) rather than silently misapplied.
  - **Full-table pool denominator**: `buildBossPools` takes an optional 4th argument, the per-instance `LootTable` (see `/loot-table` above) at the report's loot spec. When supplied, each boss's pool is built from the *full* loot table, not just what the report happened to sim — items in the loot table absent from the report are added at `value: 0` (`PoolEntry.notInSimReport: true`, boss note "not in sim report") so the denominator a Voidcore actually draws from is correct; items the report has that the loot table doesn't (an off-spec/off-instance leak, or a stale loot table) are kept with a boss-level warning note instead of dropped. Omitting the loot table preserves the exact old report-only behavior — every existing caller/test is unaffected.
  - **`PoolEntry.specSpecific`**: derived from the loot table's `specSpecific` flag on a match (`false` when no loot table was supplied). Combined with `Settings.lootSpecId` and `KnockoutEntry.lootSpecId`, this makes the "spec-specific knockouts only apply to their own loot spec" rule automatic instead of requiring the manual `specSpecific` toggle on every entry — the manual toggle still exists as an override (e.g. for a spec restriction the loot table hasn't caught up to yet), and every new `KnockoutEntry` records the `lootSpecId` it was received under.
- **Curio (not a roll outcome)**: Ula'tek's "Slumbering Coil Curio" (tier seed 2895, `viaCurio` rows) **cannot be won with a bonus roll** — Erick's in-game Adventure Journal ruling, 2026-09-24, superseding the earlier "one merged curio pool entry" rule. `buildBossPools` never puts a `viaCurio` row (from the loot table or the report) in the pool: not a pool entry, not in the denominator, not a best case, no state control, no phantom entry. Catalyst credit for real items is unchanged (e.g. Cowl → Crown: the Cowl is credited `max(own, catalyzed)`). The loot-table endpoint still lists the five `viaCurio` tier rows (they are what the curio contains); the web UI hides them and shows "Slumbering Coil Curio drops from Ula'tek but can't be won with a bonus roll." under Ula'tek's table. `PoolEntry.kind` is `'item' | 'tier-token'` only. A stored knockout entry keyed to a curio row (`${encounterId}:${itemId}`, recorded by older builds) is ignored on load (`curioEntryKeys` in `src/core/curio.ts`) and dropped at the next save (`dropCurioEntries`); it is never matched against the same tier piece at the boss that really drops it.
- **EV**: `ev` is the uniform-draw mean over the boss's remaining (non-knocked-out) pool; `evPct = ev / baseline * 100`. A boss is `deployable` when it has a remaining pool, `evPct >= thresholdPct` (default `0.2`, i.e. 0.2% of baseline — low by design, since with an empty knockout state almost every boss clears it; the threshold mostly bites once a character has knocked out most of a boss's upgrades), and — if `settings.expectedKills` is set — its encounter id is in that list.
- **Expected kills** (`settings.expectedKills?: number[]`): optional list of encounter ids the player expects to kill this week. Undefined (the default) means every boss in the report is in play. When set, a boss whose encounter id isn't listed is still evaluated — it still shows up in the per-boss table with its real `ev`/`evPct` — but is forced `deployable: false` with a note (`"not in expected kills this week"`) and excluded from allocation. This is the intended way to scope a report down to one raid instance's bosses, or to a subset of a week's planned clears; see the "Ninth boss" note below for why a QE Live report can otherwise span more bosses than one instance actually has.
- **Several reports** (`src/core/targets.ts`, `src/core/reportSet.ts`): a character can load several raid droptimizers (difficulties, other instances) and one Mythic+ droptimizer at once. `buildBossPools` runs per report; every `BossEval` carries a `targetKey` unique across reports (`"raid-vault-mythic:2883"`, `"mplus-myth:1322"` — the same boss on two difficulties is two targets), its `kind`, a `difficultyLabel` ("Mythic", "+10 (Myth)"), `keyLevel` (M+) and its report's `baseline`. `settings.expectedTargets` (target keys) replaces `expectedKills` when set. `checkCandidate`/`checkReportSet` refuse a report for a different character (name/realm/region) or loot spec, a duplicate target set, or a second M+ report; baseline drift against the first report warns above 0.5% and refuses above 3% (`DEFAULT_DRIFT_LIMITS`, adjustable).
- **Allocation** (`recommend` in `src/core/rank.ts`; takes one report or the whole loaded set):
  - Targets from every report are ranked on one scale by `evPct` (EV as % of each report's own baseline — identical to ranking by `ev` within one report; ties: best-case pct, then order).
  - `rollsAvailable` rolls are allocated greedily down that ranking. A raid target takes at most one roll (first kill per boss per difficulty per week), so raid rolls land on distinct targets; an M+ target is repeatable and keeps taking rolls while it's the best left (`Allocation.rolls` can be > 1). Under uniform draw without replacement the k-th draw from a pool has the same expected value as the first, so a repeat roll on a dungeon is worth its same EV. `totalExpectedGainPct` is the sum of `expectedGainPct` over allocations.
  - If no boss is rollable, `allocations` is empty and `fallback` explains why (`'below-threshold'` vs `'no-pool'`) with a message suggesting the Great Vault's Thalassian Tokens of Merit instead — exported as `fallbackMessage()` so a frontend can override the copy.
  - `assumptions` always lists the modeling assumptions above — including the unverified cross-spec knockout sharing, the first-kill-only bonus roll, and that ranking is limited to bosses you expect to kill this week — regardless of whether a recommendation was possible.
  - **Toss-up detection**: `recommend()` also compares the boundary of its allocation (the lowest-ranked target that got a roll) against the best target that got none — rank 1 vs rank 2 for `rollsAvailable: 1`, rank 2 vs rank 3 for two distinct raid rolls, rank 1 vs rank 2 when a repeatable M+ target took both rolls. `tossUp.targetKeys` identifies the two sides. When the gap is small enough to be sim noise rather than a real ranking, `Recommendation.tossUp` is set to `{ bosses: [name, name], gapPct }`; otherwise it's `null`. The allocation itself is unaffected — a toss-up only annotates the recommendation, it never changes which boss gets the roll. "Small enough" (`isTossUpGap` in `src/core/tossup.ts`, shared with `compareVault`'s own toss-up verdict) means either:
    - the gap is inside a fixed band, `max(0.1, 5% of the boundary boss's evPct)`; or
    - both bosses carry a per-boss sim error (`BossEval.evErrorPct`, only ever set for Raidbots reports — see below) and the gap is smaller than their *combined* error.

    A real example: a live Raidbots report ranked The Lost Explorers at evPct 2.30% and Ula'tek at 2.27% — a 0.03-point gap, well inside the fixed band (`max(0.1, 0.115) = 0.115`), so `tossUp` is set and the frontend card headlines it as "Roll The Lost Explorers or Ula'tek" rather than picking one. QE Live reports never carry a sim error, so they always fall back to the fixed band.
  - **Sim error propagation**: Raidbots' `sim.profilesets.results[]` rows carry an optional `mean_error` (simc's standard error for that row's `mean`) alongside `mean`. It's propagated as `NormalizedItem.meanError` (absolute, same units as `delta`), converted to `PoolEntry.errorPct` (percentage of baseline, mirroring `pct`) in `buildBossPools`, and rolled up to `BossEval.evErrorPct` as the mean `errorPct` of the boss's remaining (non-knocked-out) pool. QE Live rows never set `meanError`, so QE Live bosses never get an `evErrorPct` and always toss-up on the fixed band alone.
- **Knockout state** (`src/core/knockout.ts`): `createState`/`addEntry` (idempotent per item id)/`removeEntry`/`markSpecSpecific`/`serialize`/`deserialize` (tolerant of unknown/missing fields) plus a `StorageAdapter` interface (`load`/`save`/`list`) with an in-memory implementation for tests — a browser adapter (e.g. `localStorage`) is left to the frontend. `storageKey()` builds the persistence key as `${region}:${realm}:${character}:${difficulty}`, lowercased. `storageKeyFor(report)`/`createStateFor(report)` key raid state by the report's difficulty exactly as before (no migration) and M+ state per track (`…:mplus-myth`, via `knockoutDifficulty`); M+ `rollsSpent` is keyed by dungeon id. `reconcile(state, report, outcome)` records a roll's outcome and returns the updated state plus freshly rebuilt `BossEval[]`/`Recommendation` in one call, for a post-kill UI screen; a curio tier piece is not a roll outcome, so reconciling one leaves the curio boss's pool unchanged (see "Curio (not a roll outcome)").

### Vault comparison (`src/core/vault.ts`)

The player faces a Great Vault choice each week: take a specific vault item outright, or take the Nebulous Voidcore and spend the week's bonus roll(s) instead.

- **`rollsToTarget(pool, entryKey, thresholdValue)`**: with knockout, a roll is a uniform draw *without replacement* from the remaining pool, so the expected number of rolls to land one specific entry in a pool of `n` remaining is `(n+1)/2` and the worst case is `n` (standard without-replacement rank argument). It also computes a threshold-truncated version: the expected number of rolls a player would *actually* spend hunting the target, given they'd abandon the pool once — after a miss — its remaining mean value (over the entries still left, target included) falls below `thresholdValue` (absolute, `thresholdPct/100 × baseline`). The truncated case is computed exactly via a recurrence over remaining subsets (memoized on the subset's sorted keys), not simulation — each state's continuation depends only on which entries remain, not the draw order that got there — and cross-checked in tests against brute-force enumeration of all removal orders on a 4-item pool. Every non-knocked-out `PoolEntry` on a `BossEval` carries its own `rollsToTargetExpected`/`rollsToTargetWorst`/`rollsToTargetTruncated`, computed against that boss's remaining pool, so a frontend can show "about K rolls to land this" for any item.
- **`compareVault({ vaultItem, bossEvals, recommendation, settings, report })`**: returns a `VaultDecision`.
  - **Voidcore option**: `voidcoreGainPct = recommendation.totalExpectedGainPct` (for `settings.rollsAvailable` rolls).
  - With several reports loaded, `bossEvals` spans all of them: the vault item is matched against every target's pool (raid and M+), the threshold uses the matched target's own baseline, and the alternative roll excludes the matched target by `targetKey`.
  - **Vault item option**: `vaultItemGainPct = vaultItem.gainPct + savedRolls × altRollEvPct`. `savedRolls` is the `expectedTruncated` rolls to hit that item via bonus roll, if its loot pool is identifiable — matched by `itemId` against a `PoolEntry` across all bosses first, falling back to `encounterId` against a whole `BossEval` (using its `bestCase` entry as the target, since the vault item may represent a whole dungeon/boss's reward rather than one specific item) — capped at the pool's remaining count; if no pool is identifiable, `savedRolls = 0` with a note. **The credit only applies when the vault item's target is among the targets `recommendation.allocations` spends this week's rolls on** (by target key): you can't save rolls you would never have spent hunting there. Otherwise `savedRolls = 0`, the comparison is the plain vault gain vs the Voidcore path, and `VaultDecision.savedRollsNote` (also in `notes`, shown on the card) says why, e.g. "Altar of Fangs isn't a target you'd roll this week, so taking \"Vile Vial of Volatile Venom\" saves no rolls." With the M+ report loaded, Altar of Fangs ranks 6th, so the Vial no longer earns a 5.7-roll credit (0.81% vs 0.74% is a toss-up at 1 roll, Voidcore at 2). `altRollEvPct` is the `evPct` of the best rollable boss *other than* the vault item's own pool (`0` if none).
  - **Verdict**: `'tokens'` when neither option clears `thresholdPct`; else `'toss-up'` when `|voidcoreGainPct − vaultItemGainPct| < max(0.1, 10% of the larger)` (with a note to prefer the vault item on a toss-up if it removes a dungeon from the weekly farm); else `'vault'` or `'voidcore'`, whichever is larger.
  - Returns both option values, `savedRolls`, the verdict, a one-sentence `explanation`, and any `notes` (warnings, the toss-up tip).

### Live sanity check

`npm run test:live` (via `test/core.integration.test.ts`) runs the full pipeline — normalize → `buildBossPools` → `recommend` — against both live fixture reports with an empty knockout state at the default 0.2% threshold, for 1 and 2 rolls, and prints the per-boss table. With no knockouts yet, every boss in both reports clears the threshold, and the 2-roll allocation always lands on the top two distinct bosses by `ev`.

**"Ninth boss" investigation (2026-09-08):** a live QE Live run (report `wzfyzqxqjqej`) was seen reporting 9 rollable bosses for The Venomous Abyss (instance 1320), which only has 8. The 9th was `2849` "Nymrissa Wavecaller" — a real boss, correctly resolved by `pickBestSource` (not a Dungeon/Delves leak, not a tier-token misattachment), but belonging to a *different* raid instance (`1317`, "The Tidebound Grotto"). QE Live's "Raid" `dropLoc` rows span every raid instance active in the current tier, not just one, while the Raidbots normalizer's reports (and the schema's singular `NormalizedReport.instanceId`) assume one instance per report. `normalizeQELiveReport` now resolves every row first, tallies instances across all of them (not just the tier-fallback rows, which is all the old code tallied), keeps only the rows matching the dominant (most-represented) instance, and sets `instanceId`/`instanceName` on the report from that — excluded rows are counted in a warning. Combine this with `settings.expectedKills` to scope a report down further (e.g. to just the bosses you're actually killing this week within that instance).

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
