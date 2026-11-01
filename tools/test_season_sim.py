"""Unit tests for season_sim.py / season_sim_practical.py: `python3 -m unittest discover tools`."""
import os, random, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import season_sim as ss  # noqa: E402
import season_sim_practical as sp  # noqa: E402


class StrictSim(unittest.TestCase):
    def test_voidcore_draw_never_takes_the_curio(self):
        random.seed(1)
        for _ in range(500):
            st = ss.mk([{"name": "U", "row": "raid", "pool_size": 2, "bis_count": 0, "tier_bis": 0, "curio": True},
                        {"name": "T", "row": "raid", "pool_size": 3, "bis_count": 1, "tier_bis": 1}])
            ss.draw_index(st[0], st)
            self.assertTrue(st[0]["curio_alive"])  # a bonus roll can't win the Curio
            self.assertEqual(st[1]["tier"], 1)     # ...so it never consumes a tier BIS elsewhere

    def test_hit_chance_uses_the_plain_pool(self):
        st = ss.mk([{"name": "U", "row": "raid", "pool_size": 4, "bis_count": 1, "tier_bis": 0, "curio": True, "vault_only": 2},
                    {"name": "T", "row": "raid", "pool_size": 3, "bis_count": 1, "tier_bis": 1}])
        self.assertEqual(ss.hit_chance(st[0], st), 0.25)
        self.assertEqual(ss.eff_pool(st[0]), 7)  # vault doors still see the Curio and vault-only entries

    def test_door_hits_guard_empty_row(self):
        st = ss.mk([{"name": "R", "row": "raid", "pool_size": 3, "bis_count": 1}])
        self.assertEqual(ss.door_hits(st, "mplus"), [])

    def test_week_zero_subset_is_zero_not_max_weeks(self):
        random.seed(2)
        total, raid, mplus = ss.run([{"name": "R", "row": "raid", "pool_size": 2, "bis_count": 1},
                                     {"name": "M", "row": "mplus", "pool_size": 3, "bis_count": 0}], "roll")
        self.assertEqual(mplus, 0)
        self.assertLess(raid, ss.MAX_WEEKS)


class PracticalSim(unittest.TestCase):
    def test_voidcore_draw_ignores_vault_only(self):
        random.seed(3)
        for _ in range(200):
            st = {"pools": sp.mk([{"name": "U", "row": "raid", "pool_size": 1, "bis_count": 1, "vault_only": 5}]), "open": set(sp.SLOTS)}
            self.assertTrue(sp.draw(st["pools"][0], st))  # the only Voidcore outcome is the BIS

    def test_vault_only_door_never_hits(self):
        random.seed(4)
        st = {"pools": sp.mk([{"name": "U", "row": "raid", "pool_size": 0, "bis_count": 0, "vault_only": 3}]), "open": set(sp.SLOTS)}
        self.assertEqual(sp.doors(st, "raid"), [])

    def test_doors_guard_empty_row(self):
        st = {"pools": sp.mk([{"name": "R", "row": "raid", "pool_size": 3, "bis_count": 1}]), "open": set()}
        self.assertEqual(sp.doors(st, "mplus"), [])

    def test_week_zero_subset_is_zero_not_max_weeks(self):
        random.seed(5)
        _, raid, mplus = sp.run([{"name": "R", "row": "raid", "pool_size": 2, "bis_count": 1},
                                 {"name": "M", "row": "mplus", "pool_size": 3, "bis_count": 0}], "roll")
        self.assertEqual(mplus, 0)
        self.assertLess(raid, sp.MAX_WEEKS)


if __name__ == "__main__":
    unittest.main()
