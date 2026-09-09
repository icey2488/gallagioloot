"""
Full-season BIS chase with Curio.
pools: {name, row:'raid'|'mplus', pool_size (non-curio items), bis_count, tier_bis (subset of bis that are tier), curio: bool}
- Ula'tek has curio=True: its pool has +1 entry (the Curio). The Curio counts as a BIS hit while
  any tier BIS remains anywhere; drawing it removes one outstanding tier BIS from its slot boss.
- Vault: 3 raid doors uniform over union of raid pools (incl. Curio entry), 3 M+ doors over M+ pools; one pick/week.
- Voidcores 1/week, 2 from week 8; one roll per boss per week; knockout draws.
- vault strategy: take a BIS door if any (prefer the one whose pool is largest); else Voidcore.
- roll strategy: always Voidcore.
"""
import random, statistics, json, sys
WEEK_TWO, MAX_WEEKS = 8, 80

def mk(pools):
    st = []
    for p in pools:
        st.append({"name": p["name"], "row": p["row"], "pool": p["pool_size"], "bis": p["bis_count"],
                   "tier": p.get("tier_bis", 0), "curio": p.get("curio", False), "curio_alive": p.get("curio", False)})
    return st

def tier_left(st): return sum(p["tier"] for p in st)
def rem(st, row=None): return sum(p["bis"] for p in st if row is None or p["row"] == row)
def eff_pool(p): return p["pool"] + (1 if p["curio_alive"] else 0)

def curio_hits(p, st):  # does this pool's curio count as BIS right now
    return p["curio_alive"] and tier_left(st) > 0

def draw_index(p, st):
    """uniform over eff_pool; returns 'bis' | 'curio' | 'miss' and applies knockout."""
    n = eff_pool(p)
    r = random.randrange(n)
    if p["curio_alive"] and r == n - 1:
        p["curio_alive"] = False
        if tier_left(st) > 0:
            # consume one tier BIS from the slot boss with the worst odds (largest pool)
            q = max((x for x in st if x["tier"] > 0), key=lambda x: x["pool"])
            q["tier"] -= 1; q["bis"] -= 1; q["pool"] -= 1
            return "bis"
        return "miss"
    p["pool"] -= 1
    if r < p["bis"]:
        p["bis"] -= 1
        if p["tier"] > 0 and r < p["tier"]: p["tier"] -= 1
        return "bis"
    return "miss"

def door_hits(st, row, n=3):
    ps = [p for p in st if p["row"] == row and eff_pool(p) > 0]
    tot = sum(eff_pool(p) for p in ps); hits = []
    for _ in range(n):
        r = random.randrange(tot)
        for p in ps:
            e = eff_pool(p)
            if r < e:
                if r < p["bis"] or (p["curio_alive"] and r == e - 1 and tier_left(st) > 0):
                    hits.append(p)
                break
            r -= e
    return hits

def take_vault(p, st):
    # vault shows a specific item; take the guaranteed BIS (or curio -> tier piece)
    if p["bis"] > 0:
        p["bis"] -= 1; p["pool"] -= 1
        if p["tier"] > 0: p["tier"] -= 1
    else:  # curio door
        p["curio_alive"] = False
        q = max((x for x in st if x["tier"] > 0), key=lambda x: x["pool"])
        q["tier"] -= 1; q["bis"] -= 1; q["pool"] -= 1

def hit_chance(p, st):
    n = eff_pool(p)
    if n == 0: return 0.0
    return (p["bis"] + (1 if curio_hits(p, st) else 0)) / n

def spend(st, cores):
    rolled = set()
    for _ in range(cores):
        c = [(hit_chance(p, st), i) for i, p in enumerate(st) if i not in rolled and hit_chance(p, st) > 0]
        if not c: return
        _, i = max(c); draw_index(st[i], st); rolled.add(i)

def run(pools, strategy):
    st = mk(pools); t_raid = t_mp = None
    for w in range(1, MAX_WEEKS + 1):
        if t_raid is None and rem(st, "raid") == 0: t_raid = w - 1
        if t_mp is None and rem(st, "mplus") == 0: t_mp = w - 1
        if rem(st) == 0: return w - 1, t_raid, t_mp
        cores = 2 if w >= WEEK_TWO else 1
        if strategy == "vault":
            hits = door_hits(st, "raid") + door_hits(st, "mplus")
            if hits:
                take_vault(max(hits, key=eff_pool), st); cores -= 1
        spend(st, cores)
    return MAX_WEEKS, t_raid or MAX_WEEKS, t_mp or MAX_WEEKS

def summ(x):
    x = sorted(x); n = len(x)
    return {"mean": round(statistics.mean(x), 1), "median": x[n//2], "p10": x[n//10], "p90": x[9*n//10]}

def simulate(pools, n=30000, seed=11):
    random.seed(seed); out = {}
    res = {s: [run(pools, s) for _ in range(n)] for s in ("vault", "roll")}
    for s, r in res.items():
        out[s] = {"all_bis": summ([a for a, _, _ in r]), "raid_done": summ([b for _, b, _ in r]), "mplus_done": summ([c for _, _, c in r])}
    d = [rb[0] - va[0] for va, rb in zip(res["vault"], res["roll"])]
    out["delta_weeks_roll_minus_vault"] = summ(d)
    out["p_vault_faster"] = round(sum(1 for x in d if x > 0) / n, 3)
    out["p_tie"] = round(sum(1 for x in d if x == 0) / n, 3)
    return out

if __name__ == "__main__":
    print(json.dumps(simulate(json.load(open(sys.argv[1]))), indent=1))
