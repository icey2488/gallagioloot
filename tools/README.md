# season_sim

Monte Carlo simulator answering: for a given spec's BIS list, is it faster over a full season
to prioritize the Great Vault (vault-first) or to always spend Voidcores on the highest-odds
boss (roll-first)? Reports weeks to collect all BIS, weeks to finish the raid-BIS subset, and
weeks to finish the M+-BIS subset, for both strategies.

Season structure modeled:
- Great Vault: 3 raid doors (uniform over the union of all raid boss pools, including the
  Curio entry where present) + 3 M+ doors (uniform over all M+ pools), one pick per week.
- Voidcores: 1/week, increasing to 2/week starting week 8. One roll per boss per week, and
  drawing an item removes it from that boss's pool (knockout, no duplicates).
- Curio (Ula'tek): a wildcard extra pool entry. While any tier BIS is still outstanding
  anywhere, drawing the Curio counts as a BIS hit and removes one outstanding tier BIS from
  its slot boss (the one with the largest remaining pool, i.e. worst odds). Once no tier BIS
  remains, the Curio is a dead roll.
- vault strategy: each week, take a BIS-hitting vault door if any is offered (preferring the
  door with the largest pool, i.e. worst odds / most valuable to lock in), then spend
  remaining Voidcores; roll strategy: never uses the vault door choice for BIS-securing
  purposes, always spends Voidcores on the highest hit-chance boss.

## Running it

```
python tools/season_sim.py tools/pools/arcane-mage-s2.json
```

Requires Python 3.8+, no third-party dependencies.

## Building a pools file for another spec

For each raid boss and M+ dungeon, get `pool_size` (count of non-Curio, non-BIS-excluded
lootable items) from the proxy's `/loot-table/{instanceId}?lootSpec={specId}` endpoint.
Season 2 instance IDs used here: Abyss 1320, Tidebound Grotto 1317, and dungeons Altar of
Fangs 1322, Murder Row 1304, Den of Nalorakk 1311, The Blinding Vale 1309, Voidscar Arena
1313, Ruby Life Pools 1202, Kings' Rest 1041, Temple of Sethraliss 1030.

- Count Ula'tek's `pool_size` WITHOUT the 5 viaCurio rows, and set `"curio": true` on it.
- Set `bis_count` to the number of items in that pool that are BIS for the spec.
- Set `tier_bis` to the subset of `bis_count` that are set/tier pieces (these are what the
  Curio can substitute for).

## Modeling assumptions / not modeled

- Raid drops that are not myth-track are ignored (only myth-track items count toward pools).
- End-of-dungeon loot is Hero track and is ignored; only Vault/Voidcore-eligible myth loot
  is modeled.
- Vault doors draw uniformly over the *entire* row's pool (all raid bosses / all dungeons),
  not just from content the player farmed that week — dungeon and raid vault doors always
  draw from the full seasonal pool regardless of which bosses/dungeons were actually run.
- Ties between multiple BIS-hitting vault doors in a week are broken toward the door with the
  larger remaining pool (worse odds elsewhere, so locking it in is more valuable).
- Delves and the world loot row are not modeled. Crafted items are excluded.

## Catalyst and tier (Season 2)

The Catalyst converts any eligible item into a tier piece while keeping the *original* item's
stat allocation — so getting the set bonus is easy (catalyze any decent piece for the slot),
but the perfect BIS for a tier slot is a specific item with the right secondaries, catalyzed.
For Arcane that's the Venomcursed cowl from Ula'tek (head, keeps its cantrip on catalyzing), a
Twin Fangs cloth shoulder, the Altar of Fangs dungeon chest, Coiled Altar gloves, and Nek'zali
legs. Anything labeled Venomcursed carries a cantrip.

Consequence for the model: the Curio is **not** a BIS hit — it yields a default-stat token, not
the catalyzed-original-item stats — so it's set to a plain non-BIS pool entry (no `curio` flag)
rather than a wildcard BIS substitute. `tier_bis` is no longer used for Arcane: tier tokens
under slot bosses still count toward `pool_size` (they're still draws that knock out), but
they're not tracked as a separate substitutable category.

## Reference results

Arcane Mage, Season 2, 14 BIS total (11 raid incl. Wavecaller ring + 3 M+), 50,000 runs each:

- All BIS: vault-first 18.9 weeks mean (p10 15, p90 23) vs roll-first 24.8 weeks (p10 20, p90 29)
- Raid BIS done: vault-first 13.6 weeks vs roll-first 16.0 weeks
- M+ BIS done: vault-first 18.6 weeks vs roll-first 24.8 weeks
- Delta (roll − vault): 5.9 weeks; vault-first faster in 87% of seasons; tie in 4%

Interpretation: roll-first players are unlikely to finish a full-clear BIS chase within a
season; vault BIS whenever offered plus Voidcore by hit chance on the other weeks is the
strategy that does.

**Superseded** — an earlier "token-model" run (kept for reference in
`tools/pools/arcane-mage-s2-token-model.json`) treated the Curio as a BIS-hitting wildcard that
could substitute for any outstanding tier piece, and found: vault-first 17.1 weeks vs
roll-first 22.3 weeks (+5.2 weeks, vault-first faster in 85% of seasons). That's wrong per the
catalyst mechanics above — the Curio yields default stats, not a catalyzed-original-item token
— so it undercounted weeks-to-BIS by treating a non-BIS drop as a BIS hit.

For context, an earlier M+-only variant (2 M+ BIS items, single 80-item vault pool, 50,000
runs each) found a smaller edge: vault-first 8.4 weeks vs roll-first 10.0 weeks (+1.6 weeks,
vault-first faster in 58% of seasons). A prior version of that variant, which drew vault doors
only from dungeons the player had farmed that week, was wrong — vault doors always draw from
the full seasonal pool, not just farmed content — and has been superseded by the full-pool
model above.
