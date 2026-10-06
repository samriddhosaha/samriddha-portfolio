"""Demand segmentation -> price response -> held-out forecast -> scenarios -> sensitivity.

SYNTHETIC DATA. ILLUSTRATIVE. NOT CLIENT WORK.
Run:  python generate_data.py && python analyze.py   ->  output/*.csv, output/metrics.json, output/*.svg
Only numpy, pandas and matplotlib; the regression is plain least squares so every step can be explained.
"""
import json
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

from generate_data import CAT_CAPACITY, TRUE_ELASTICITY

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

OUT = Path(__file__).parent / "output"
TRAIN_MAX_MATCH = 12             # matches 1-12 fit the model, 13-16 are held out
SCENARIO = {"Low": 0.85, "Base": 1.00, "High": 1.15}   # demand multipliers: an assumption, not an estimate
INK, RED, MUTED, GRID, PAPER = "#111111", "#c1401f", "#5b5648", "#d8d2c4", "#f5f2ec"
WINDOW_COLORS = {"Early": "#e8b4a4", "Mid": "#d0705a", "Late": RED}   # one hue, light to dark = earlier to later

df = pd.read_csv(OUT / "tickets.csv")
train, test = df[df.match_id <= TRAIN_MAX_MATCH], df[df.match_id > TRAIN_MAX_MATCH]

# ---- 1. Demand segmentation: where do tickets and revenue come from? (training matches)
seg_tbl = train.pivot_table(index=["tier", "segment"], columns="window", values="units", aggfunc="sum")[["Early", "Mid", "Late"]]
seg_tbl["Total"] = seg_tbl.sum(axis=1)
seg_tbl.to_csv(OUT / "segmentation_units.csv")
by_segment = train.groupby("segment").agg(units=("units", "sum"), revenue=("revenue", "sum"))
by_segment["avg_price"] = by_segment.revenue / by_segment.units


# ---- 2. Price response: per-segment log-log least squares
def design(d: pd.DataFrame) -> np.ndarray:
    cols = [np.ones(len(d)), np.log(d.price.values)]
    for col, base in (("tier", "A"), ("category", "Cat1"), ("window", "Early")):
        for lvl in sorted(TRAIN_LEVELS[col]):
            if lvl != base:
                cols.append((d[col] == lvl).astype(float).values)
    return np.column_stack(cols)


TRAIN_LEVELS = {c: df[c].unique() for c in ("tier", "category", "window")}
fit = {}
for seg in TRUE_ELASTICITY:
    d = train[(train.segment == seg) & (train.sold_out == 0) & (train.units > 0)]   # sold-out groups hide true demand
    X, y = design(d), np.log(d.units.values)
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    dof = len(y) - X.shape[1]
    s2 = resid @ resid / dof
    se = np.sqrt(s2 * np.linalg.inv(X.T @ X)[1, 1])
    fit[seg] = dict(beta=beta, s2=s2, e=beta[1], se=se, n=len(y))
el_tbl = pd.DataFrame(
    [{"segment": s, "estimated": f["e"], "ci_low": f["e"] - 1.96 * f["se"], "ci_high": f["e"] + 1.96 * f["se"], "true": TRUE_ELASTICITY[s], "n": f["n"]} for s, f in fit.items()]
).round(2)
el_tbl.to_csv(OUT / "elasticity.csv", index=False)


# ---- 3. Forecast the held-out matches with the actual prices charged
def predict_units(d: pd.DataFrame, price_mult: float = 1.0, e_mult: float = 1.0) -> np.ndarray:
    out = np.zeros(len(d))
    for seg, f in fit.items():
        m = (d.segment == seg).values
        dd = d[m].copy()
        dd["price"] *= price_mult
        mu = design(dd) @ f["beta"]
        mu += (e_mult - 1) * f["e"] * np.log(price_mult)          # stretch/shrink elasticity for sensitivity runs
        out[m] = np.exp(mu + f["s2"] / 2)                         # smearing correction: exp(mean of ln) understates the mean
    return out


def capped(d: pd.DataFrame, demand: np.ndarray) -> np.ndarray:
    """Seats are finite: scale a match/category's demand down to capacity."""
    t = d.assign(demand=demand)
    tot = t.groupby(["match_id", "category"]).demand.transform("sum")
    cap = t.category.map(CAT_CAPACITY)
    return (t.demand * np.minimum(1, cap / tot)).values


test = test.copy()
test["pred_units"] = capped(test, predict_units(test))
wape_units = np.abs(test.units - test.pred_units).sum() / test.units.sum()
test["pred_rev"] = test.pred_units * test.price
match_rev = test.groupby("match_id").agg(tier=("tier", "first"), actual=("revenue", "sum"), base=("pred_rev", "sum"))
wape_match_rev = (match_rev.actual - match_rev.base).abs().sum() / match_rev.actual.sum()
bias = (test.pred_units.sum() - test.units.sum()) / test.units.sum()

# naive comparison: predict every cell as the training average for its segment x window x category (no price, no tier)
naive_mean = train.groupby(["segment", "window", "category"]).units.mean()
naive = test.set_index(["segment", "window", "category"]).index.map(naive_mean).values
wape_naive = np.abs(test.units - naive).sum() / test.units.sum()

# ---- 4. Scenarios: scale demand, re-apply the capacity cap
for name, k in SCENARIO.items():
    u = capped(test, predict_units(test) * k)
    match_rev[name] = pd.Series(u * test.price.values, index=test.index).groupby(test.match_id).sum()
match_rev["inside_band"] = (match_rev.actual >= match_rev.Low) & (match_rev.actual <= match_rev.High)
match_rev.round(0).to_csv(OUT / "scenarios_by_match.csv")

# ---- 5. Sensitivity: change prices on the held-out set, revenue vs the base forecast
base_rev = (capped(test, predict_units(test)) * test.price.values).sum()
rows = []
for pc in (-0.10, -0.05, 0.0, 0.05, 0.10):
    r = {"price_change": f"{pc:+.0%}"}
    for em in (0.7, 1.0, 1.3):
        u = capped(test, predict_units(test, 1 + pc, em))
        r[f"elasticity x{em}"] = (u * test.price.values * (1 + pc)).sum() / base_rev - 1
    rows.append(r)
sens = pd.DataFrame(rows)
sens.to_csv(OUT / "sensitivity.csv", index=False)
seg_sens = []
u0_all, u1_all = capped(test, predict_units(test)), capped(test, predict_units(test, 1.05))
for seg in TRUE_ELASTICITY:
    m = (test.segment == seg).values
    p = test.price.values[m]
    seg_sens.append({"segment": seg, "revenue_change_at_+5%_price": (u1_all[m] * p * 1.05).sum() / (u0_all[m] * p).sum() - 1})
seg_sens = pd.DataFrame(seg_sens)
seg_sens.to_csv(OUT / "sensitivity_by_segment.csv", index=False)

metrics = {
    "train_rows": len(train), "test_rows": len(test),
    "wape_units_cell": round(wape_units, 4), "wape_units_cell_naive": round(wape_naive, 4),
    "wape_revenue_match": round(wape_match_rev, 4), "bias_units": round(bias, 4),
    "matches_inside_scenario_band": f"{int(match_rev.inside_band.sum())} of {len(match_rev)}",
    "sold_out_groups_total": int(df.groupby(["match_id", "category"]).sold_out.max().sum()),
    "by_segment": by_segment.round(1).reset_index().to_dict("records"),
}
(OUT / "metrics.json").write_text(json.dumps(metrics, indent=2))

# ---- 6. Charts (SVG, text kept as text)
plt.rcParams.update({"svg.fonttype": "none", "font.family": ["Arial", "sans-serif"], "font.size": 11, "text.color": INK, "axes.edgecolor": INK,
                     "axes.labelcolor": INK, "xtick.color": MUTED, "ytick.color": MUTED, "axes.facecolor": PAPER, "figure.facecolor": PAPER, "savefig.facecolor": PAPER})


def tidy(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.spines["left"].set_linewidth(1.5)
    ax.spines["bottom"].set_linewidth(1.5)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


# 6a stacked bars: units by segment x purchase window (training matches)
w = train.pivot_table(index="segment", columns="window", values="units", aggfunc="sum")[["Early", "Mid", "Late"]].loc[list(TRUE_ELASTICITY)]
fig, ax = plt.subplots(figsize=(7, 3.6))
left = np.zeros(len(w))
for win in w.columns:
    ax.barh(w.index, w[win] / 1000, left=left, color=WINDOW_COLORS[win], edgecolor=PAPER, linewidth=2, label=win)
    left += w[win].values / 1000
ax.invert_yaxis()
ax.set_xlabel("Tickets sold, thousands (matches 1-12)")
tidy(ax)
ax.grid(axis="x", color=GRID)
ax.grid(axis="y", visible=False)
ax.legend(title="Purchase window", frameon=False, ncol=3, loc="lower right", bbox_to_anchor=(1, 1.0), fontsize=10, title_fontsize=10)
fig.tight_layout()
fig.savefig(OUT / "chart-demand-mix.svg")
plt.close(fig)

# 6b elasticity: estimate with 95% interval, true value as a marker
fig, ax = plt.subplots(figsize=(7, 3.2))
y = np.arange(len(el_tbl))
ax.hlines(y, el_tbl.ci_low, el_tbl.ci_high, color=INK, linewidth=2.5)
ax.plot(el_tbl.estimated, y, "o", color=INK, markersize=9, label="Estimate (95% interval)")
ax.plot(el_tbl.true, y, "D", color=RED, markersize=8, markeredgecolor=PAPER, label="Value used to generate the data")
ax.axvline(-1, color=MUTED, linewidth=1, linestyle=(0, (4, 3)))
ax.text(-1, 2.55, "-1: revenue-neutral", ha="center", color=MUTED, fontsize=9)
ax.set_yticks(y, el_tbl.segment)
ax.invert_yaxis()
ax.set_xlabel("Price elasticity of demand")
tidy(ax)
ax.grid(axis="x", color=GRID)
ax.grid(axis="y", visible=False)
ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, 1.22), ncol=2, fontsize=9)
fig.tight_layout()
fig.savefig(OUT / "chart-elasticity.svg")
plt.close(fig)

# 6c held-out forecast: Low-High band, base marker, actual marker
fig, ax = plt.subplots(figsize=(7.5, 3.8))
x = np.arange(len(match_rev))
ax.vlines(x, match_rev.Low / 1e6, match_rev.High / 1e6, color=GRID, linewidth=16, label="Low to High scenario", zorder=1)
ax.plot(x, match_rev.base / 1e6, "_", color=INK, markersize=22, markeredgewidth=3, label="Base forecast", zorder=2)
ax.plot(x, match_rev.actual / 1e6, "o", color=RED, markersize=9, markeredgecolor=PAPER, label="Actual (held out)", zorder=3)
ax.set_xticks(x, [f"Match {m}\nTier {t}" for m, t in zip(match_rev.index, match_rev.tier)])
ax.set_ylabel("Revenue, $ millions (synthetic)")
tidy(ax)
ax.set_ylim(0, None)
ax.legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, 1.18), ncol=3, fontsize=9)
fig.tight_layout()
fig.savefig(OUT / "chart-forecast.svg")
plt.close(fig)

print(json.dumps(metrics, indent=2))
print(el_tbl.to_string(index=False))
print(match_rev.round(0).to_string())
print(sens.round(3).to_string(index=False))
print(seg_sens.round(3).to_string(index=False))
print(seg_tbl.to_string())
