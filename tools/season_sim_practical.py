"""
Practical-BIS season sim (companion to season_sim.py).

Difference from season_sim.py: the four catalyzed tier slots (shoulder, chest, hands, legs) are
"slot-satisfiable": ANY eligible item in that slot from ANY pool fills the slot (a player will
catalyze a well-statted piece rather than wait for the one perfect item). The head cowl and all
other named BIS stay exact items. This is the "practical BIS" a player actually finishes with.

pools: {name, row:'raid'|'mplus', pool_size (all non-curio items), bis_count (named exact BIS),
        slots:{shoulder|chest|hands|legs: count of eligible items in that slot in this pool}}
Vault: 3 raid doors uniform over the union of raid pools, 3 M+ doors over M+ pools; one pick/week.
Voidcores 1/week, 2 from week 8; one roll per boss per week; knockout draws (no replacement).
vault strategy: take a BIS door if any (named beats slot-fill, then larger pool); else Voidcore.
roll strategy: always Voidcore, greedy by hit chance.
"""
import random, statistics, json, sys
WEEK_TWO, MAX_WEEKS = 8, 80
SLOTS = ("shoulder", "chest", "hands", "legs")

def mk(pools):
    return [{"name": p["name"], "row": p["row"], "pool": p["pool_size"], "bis": p["bis_count"],
             "slots": {s: p.get("slots", {}).get(s, 0) for s in SLOTS}} for p in pools]

def hits_in(p, st):
    return p["bis"] + sum(c for s, c in p["slots"].items() if s in st["open"])

def rem(st, row=None):
    named = sum(p["bis"] for p in st["pools"] if row is None or p["row"] == row)
    slots = 0
    for s in st["open"]:
        if row is None: slots += 1
        elif any(p["row"] == row and p["slots"][s] > 0 for p in st["pools"]): slots += 1
    return named + slots

def draw(p, st):
    """uniform over p['pool']; layout [named bis][slot items by slot][other]; knockout applies."""
    r = random.randrange(p["pool"]); p["pool"] -= 1
    if r < p["bis"]:
        p["bis"] -= 1; return True
    r -= p["bis"]
    for s in SLOTS:
        c = p["slots"][s]
        if r < c:
            p["slots"][s] -= 1
            if s in st["open"]:
                st["open"].discard(s); return True
            return False
        r -= c
    return False

def door_hit(p, st):
    r = random.randrange(p["pool"])
    if r < p["bis"]: return ("named", None)
    r -= p["bis"]
    for s in SLOTS:
        c = p["slots"][s]
        if r < c: return ("slot", s) if s in st["open"] else None
        r -= c
    return None

def doors(st, row, n=3):
    ps = [p for p in st["pools"] if p["row"] == row and p["pool"] > 0]
    tot = sum(p["pool"] for p in ps); hits = []
    for _ in range(n):
        r = random.randrange(tot)
        for p in ps:
            if r < p["pool"]:
                h = door_hit(p, st)
                if h: hits.append((p, h))
                break
            r -= p["pool"]
    return hits

def take(p, h, st):
    p["pool"] -= 1
    if h[0] == "named": p["bis"] -= 1
    else:
        p["slots"][h[1]] -= 1; st["open"].discard(h[1])

def hit_chance(p, st): return hits_in(p, st) / p["pool"] if p["pool"] else 0.0

def spend(st, cores):
    rolled = set()
    for _ in range(cores):
        c = [(hit_chance(p, st), i) for i, p in enumerate(st["pools"]) if i not in rolled and hit_chance(p, st) > 0]
        if not c: return
        _, i = max(c); draw(st["pools"][i], st); rolled.add(i)

def run(pools, strategy):
    st = {"pools": mk(pools), "open": set(SLOTS)}
    t_raid = t_mp = None
    for w in range(1, MAX_WEEKS + 1):
        if t_raid is None and rem(st, "raid") == 0: t_raid = w - 1
        if t_mp is None and rem(st, "mplus") == 0: t_mp = w - 1
        if rem(st) == 0: return w - 1, t_raid, t_mp
        cores = 2 if w >= WEEK_TWO else 1
        if strategy == "vault":
            hs = doors(st, "raid") + doors(st, "mplus")
            if hs:
                p, h = max(hs, key=lambda x: (x[1][0] == "named", x[0]["pool"]))
                take(p, h, st); cores -= 1
        spend(st, cores)
    return MAX_WEEKS, t_raid or MAX_WEEKS, t_mp or MAX_WEEKS

def summ(x):
    x = sorted(x); n = len(x)
    return {"mean": round(statistics.mean(x), 1), "median": x[n//2], "p10": x[n//10], "p90": x[9*n//10]}

def simulate(pools, n=30000, seed=17):
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
