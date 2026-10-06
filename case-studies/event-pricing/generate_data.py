"""Synthetic ticket sales for a fictional 16-match event. Seeded, so output is reproducible.

SYNTHETIC DATA. ILLUSTRATIVE. NOT CLIENT WORK. Every number below is invented for this exercise.
Run:  python generate_data.py   ->  output/tickets.csv
"""
import numpy as np
import pandas as pd
from pathlib import Path

SEED = 42
TIERS = ["B", "C", "A", "C", "B", "C", "A", "B", "C", "B", "A", "C", "B", "A", "C", "A"]  # match 1..16
TIER_DEMAND = {"A": 1.6, "B": 1.0, "C": 0.6}      # how many people want to go
TIER_PRICE = {"A": 1.5, "B": 1.0, "C": 0.7}       # price multiplier set by the organiser
CAT_BASE_PRICE = {"Cat1": 450, "Cat2": 250, "Cat3": 120}
CAT_DEMAND = {"Cat1": 0.25, "Cat2": 0.9, "Cat3": 2.6}
CAT_CAPACITY = {"Cat1": 1200, "Cat2": 3300, "Cat3": 9000}   # seats per match
SEGMENT_BASE = {"Local": 1200, "Domestic travel": 700, "International": 450}
TRUE_ELASTICITY = {"Local": -1.6, "Domestic travel": -1.1, "International": -0.6}  # the "truth" the analysis tries to recover
WINDOW_SHARE = {"Early": 0.25, "Mid": 0.45, "Late": 0.30}   # >60 days, 15-60 days, <15 days before the match
WINDOW_PRICE = {"Early": 0.9, "Mid": 1.0, "Late": 1.1}


def generate(seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for m, tier in enumerate(TIERS, start=1):
        for cat in CAT_BASE_PRICE:
            ref = CAT_BASE_PRICE[cat] * TIER_PRICE[tier]
            group = []
            for seg, base in SEGMENT_BASE.items():
                for win, share in WINDOW_SHARE.items():
                    price = ref * WINDOW_PRICE[win] * rng.lognormal(0, 0.10)   # promos / adjustments add price variation
                    mean = base * TIER_DEMAND[tier] * CAT_DEMAND[cat] * share * (price / ref) ** TRUE_ELASTICITY[seg]
                    units = rng.poisson(mean * rng.lognormal(0, 0.08))
                    group.append([m, tier, cat, seg, win, round(price, 2), units])
            total = sum(g[-1] for g in group)
            sold_out = int(total > CAT_CAPACITY[cat])
            if sold_out:                                   # scale everyone down to the seats available
                k = CAT_CAPACITY[cat] / total
                for g in group:
                    g[-1] = int(g[-1] * k)
            rows += [g + [sold_out] for g in group]
    df = pd.DataFrame(rows, columns=["match_id", "tier", "category", "segment", "window", "price", "units", "sold_out"])
    df["revenue"] = (df["price"] * df["units"]).round(2)
    return df


if __name__ == "__main__":
    out = Path(__file__).parent / "output"
    out.mkdir(exist_ok=True)
    df = generate()
    df.to_csv(out / "tickets.csv", index=False)
    print(f"{len(df)} rows, {df.units.sum():,} tickets, sold-out match/category groups: {df.groupby(['match_id','category']).sold_out.max().sum()}")
