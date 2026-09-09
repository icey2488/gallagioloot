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

## Reference results

Arcane Mage, Season 2, 14 BIS total (11 from Abyss + Wavecaller ring + 2 M+), 50,000 runs each:

- All BIS: vault-first 17.1 weeks mean (p10 13, p90 22) vs roll-first 22.3 weeks (p10 18, p90 27)
- Raid BIS done: vault-first 13.5 weeks vs roll-first 16.4 weeks
- M+ BIS done: vault-first 16.3 weeks vs roll-first 22.3 weeks
- Delta (roll − vault): 5.2 weeks; vault-first faster in 85% of seasons; tie in 4.5%

For context, an earlier M+-only variant (2 M+ BIS items, single 80-item vault pool, 50,000
runs each) found a smaller edge: vault-first 8.4 weeks vs roll-first 10.0 weeks (+1.6 weeks,
vault-first faster in 58% of seasons). A prior version of that variant, which drew vault doors
only from dungeons the player had farmed that week, was wrong — vault doors always draw from
the full seasonal pool, not just farmed content — and has been superseded by the full-pool
model above.
