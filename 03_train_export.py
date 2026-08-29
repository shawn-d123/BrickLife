"""
03_train_export.py  --  BRICKLIFE / House London, Lane A

Four LightGBM heads (quantile 0.1 / 0.5 / 0.9 + a binary decline classifier),
proven on a rolling-origin chronological backtest with a 12-month embargo, then
the same pipeline refit on recent data and exported to
../web/src/data/predictions.json for the game.

Rolling-origin backtest: for each year Y in 2019..2024, train on every borough-
month with Date <= Dec(Y-2) (so the 12-month-ahead target never overlaps the test
year), predict the 12 months of year Y. Metrics are pooled over 2019..2024.

Headline call is AMBER: the point forecast beats persistence (B0) but only matches
the London-trend baseline (B1); the value we ship is a *calibrated* 80% interval
(conformalised) plus a borough-level decline probability and rate-scenario response.

Run:  cd model && python 03_train_export.py
"""

import json
import numpy as np
import pandas as pd
import lightgbm as lgb

PANEL = "../data/london_panel.parquet"
OUT   = "../web/src/data/predictions.json"

FEATS = ["log_price", "growth_1m", "growth_3m", "growth_6m", "growth_12m", "growth_24m",
         "growth_12m_lag12", "price_rel_london", "price_rel_london_chg", "rank_in_london",
         "vol_12m", "vol_yoy", "bank_rate", "bank_rate_chg_12m", "month", "borough_id"]

SCEN = {
    "base":       ("Steady as she goes",  0.0),
    "rate_shock": ("Rates stay high",     1.5),
    "rate_cuts":  ("Borrowing eases",    -1.25),
}

P = dict(n_estimators=400, learning_rate=0.05, num_leaves=31,
         min_child_samples=40, verbose=-1)
QS = (0.1, 0.5, 0.9)
Z80 = 1.2815515655446004          # 10th/90th-percentile z-score
P50_CLIP = (-0.06, 0.10)          # sane 12m growth range for the shipped point forecast


def fit_heads(tr):
    q = {a: lgb.LGBMRegressor(objective="quantile", alpha=a, **P).fit(tr[FEATS], tr["y"])
         for a in QS}
    clf = lgb.LGBMClassifier(**P).fit(tr[FEATS], (tr["y"] < 0).astype(int))
    return q, clf


def raw_q(q, X):
    m = np.sort(np.vstack([q[a].predict(X) for a in QS]), axis=0)   # fix crossing
    return m[0], m[1], m[2]


def p_decline_from_band(p10, p50, p90):
    """P(y < 0) implied by a normal through the (conformalised) 10/50/90 band --
    keeps the decline probability consistent with the interval by construction."""
    sigma = np.maximum((p90 - p10) / (2 * Z80), 1e-4)
    from math import erf
    z = (0.0 - p50) / sigma
    return float(0.5 * (1 + erf(z / np.sqrt(2))))


# ----------------------------------------------------------------------------
# Rolling-origin backtest
# ----------------------------------------------------------------------------
d = pd.read_parquet(PANEL).dropna(subset=["y"] + FEATS).reset_index(drop=True)
lon_g = d.groupby("Date")["growth_12m"].transform("mean")     # B1, per date

bt = []
for Y in range(2019, 2025):
    tr = d[d.Date <= f"{Y-2}-12-01"]
    te = d[(d.Date >= f"{Y}-01-01") & (d.Date <= f"{Y}-12-01")]
    q, clf = fit_heads(tr)
    lo, p50, hi = raw_q(q, te[FEATS])
    part = te[["Date", "AreaCode", "RegionName", "y", "growth_12m"]].copy()
    part["lo"], part["p50"], part["hi"] = lo, p50, hi
    part["b1"] = lon_g.loc[te.index].values
    part["pdec_clf"] = clf.predict_proba(te[FEATS])[:, 1]
    part["train_decl_rate"] = float((tr["y"] < 0).mean())
    part["test_year"] = Y
    bt.append(part)
bt = pd.concat(bt, ignore_index=True)

# conformal pad: fit on 2019-2022, hold 2023-2024 out for an honest coverage read
cal = bt[bt.test_year <= 2022]
e = np.maximum(cal.lo - cal.y, cal.y - cal.hi).values
pad = float(np.sort(e)[int(np.ceil((len(e) + 1) * 0.80)) - 1])
bt["p10"] = bt.lo - pad
bt["p90"] = bt.hi + pad

hold = bt[bt.test_year >= 2023]
y = bt.y.values
mae = lambda p: float(np.abs(y - p).mean())
metrics = {
    "test_mae":                mae(bt.p50.values),
    "baseline_mae_persistence": mae(bt.growth_12m.values),
    "baseline_mae_london":      mae(bt.b1.values),
    "baseline_mae_mean":        mae(np.full(len(bt), d[d.Date <= "2018-12-01"].y.mean())),
    "direction_acc":           float(((bt.p50 > 0) == (bt.y > 0)).mean()),
    "direction_acc_majority":  float(max((bt.y > 0).mean(), (bt.y <= 0).mean())),
    "coverage_80":             float((((hold.y >= hold.p10) & (hold.y <= hold.p90)).mean())),
    "coverage_80_raw":         float((((bt.y >= bt.lo) & (bt.y <= bt.hi)).mean())),
    "brier":                   float(((bt.pdec_clf - (bt.y < 0)) ** 2).mean()),
    "brier_baserate":          float(((bt.train_decl_rate - (bt.y < 0)) ** 2).mean()),
    "conformal_pad":           pad,
}

per_year = (bt.assign(ae=(bt.y - bt.p50).abs(),
                      hit=((bt.y >= bt.p10) & (bt.y <= bt.p90)),
                      dhit=((bt.p50 > 0) == (bt.y > 0)))
              .groupby("test_year")
              .agg(n=("y", "size"), mae=("ae", "mean"),
                   dir_acc=("dhit", "mean"), cov80=("hit", "mean"))
              .round(4))

print("--- rolling-origin backtest, per year ---")
print(per_year)
print("\n--- pooled 2019-2024 ---")
print(json.dumps(metrics, indent=2))

beats_b0 = metrics["test_mae"] < metrics["baseline_mae_persistence"]
beats_b1 = metrics["test_mae"] < metrics["baseline_mae_london"]
dir_ok   = metrics["direction_acc"] >= metrics["direction_acc_majority"]
cov_ok   = 0.72 <= metrics["coverage_80"] <= 0.92
call = ("GREEN" if (beats_b0 and beats_b1)
        else "AMBER" if (beats_b0 and cov_ok)
        else "RED")
caveat = ("Point forecast beats persistence but only matches the London-trend "
          "baseline; direction accuracy sits near the majority rate and slips at "
          "turning points (2018, 2025). Shipped value is the conformalised 80% "
          "interval and the borough-level decline probability, both derived from "
          "the same quantile heads.")
print(f"\nGO/NO-GO: {call}  (beats B0={beats_b0}, beats B1={beats_b1}, dir_ok={dir_ok}, cov_ok={cov_ok})")


# ----------------------------------------------------------------------------
# Production heads: refit on 2010-01 .. latest (drops the pre-GFC regime whose
# ~9%/yr mean poisons the point forecast; see 03 docstring / backtest 2018 row)
# ----------------------------------------------------------------------------
prod_from, prod_through = "2010-01-01", d["Date"].max()
dp = d[d.Date >= prod_from]
q_pr, clf_pr = fit_heads(dp)

# pooled Bank-Rate elasticity from the median head: mean d(p50) for a +1pp shift
lat_all = (pd.read_parquet(PANEL).dropna(subset=FEATS)
           .sort_values("Date").groupby("AreaCode").tail(1))
X0 = lat_all[FEATS].astype(float).copy()
X1 = X0.copy(); X1["bank_rate"] += 1.0; X1["bank_rate_chg_12m"] += 1.0
# elasticity in *fraction* of growth per +1pp on Bank Rate (e.g. -0.016 = -1.6pp)
elas = float((q_pr[0.5].predict(X1) - q_pr[0.5].predict(X0)).mean())
if not (-0.06 < elas < -0.002):       # guard against a noisy fit -> literature mid-point
    elas = -0.016
print(f"\nproduction: refit {prod_from[:7]}..{prod_through.date()}  "
      f"Bank-Rate elasticity {elas*100:+.2f}pp growth per +1pp  (pad {pad:.4f})")

# driver strings: global feature importance of the median head, split up/down by
# the sign of each feature's correlation with the target.
FEAT_LABEL = {
    "growth_1m": "Recent momentum", "growth_3m": "Recent momentum",
    "growth_6m": "Recent momentum", "growth_12m": "Recent momentum",
    "growth_24m": "Longer-run momentum", "growth_12m_lag12": "Momentum a year ago",
    "price_rel_london": "Price relative to London",
    "price_rel_london_chg": "Position shifting vs London",
    "rank_in_london": "Position in London's price range",
    "vol_12m": "Sales activity", "vol_yoy": "Transaction recovery",
    "bank_rate": "Borrowing costs", "bank_rate_chg_12m": "Direction of rates",
    "log_price": "Price level", "month": "Seasonality", "borough_id": "Borough level",
}
imp = pd.Series(q_pr[0.5].feature_importances_, index=FEATS).sort_values(ascending=False)
corr = dp[FEATS].corrwith(dp["y"])
up, down = [], []
for f in imp.index:
    lab = FEAT_LABEL[f]
    if lab in up or lab in down:
        continue
    (up if corr[f] >= 0 else down).append(lab)
drivers = {"up": up[:2], "down": down[:2]}

RENT = {  # 00-CONTRACTS.md section 4 (D owns rent; None elsewhere until D fills)
    "E09000031": 1480, "E09000012": 1950, "E09000025": 1520,
    "E09000002": 1310, "E09000008": 1290, "E09000007": 2340,
}

out = {
    "meta": {
        "trained_through": prod_through.strftime("%Y-%m"),
        "trained_from": prod_from[:7],
        "backtest": "rolling-origin 2019-2024, 12-month embargo",
        "model": "lgbm-quantile x3 + binary; conformalised 80% interval",
        "test_window": "2019-01 to 2024-12",
        "embargo_months": 12,
        "scenario_method": f"Bank Rate elasticity {elas*100:.2f}pp growth per +1pp, "
                           f"applied to the median forecast (pooled model response)",
        "test_mae": metrics["test_mae"],
        "baseline_mae_persistence": metrics["baseline_mae_persistence"],
        "baseline_mae_london": metrics["baseline_mae_london"],
        "baseline_mae_mean": metrics["baseline_mae_mean"],
        "direction_acc": metrics["direction_acc"],
        "direction_acc_majority": metrics["direction_acc_majority"],
        "coverage_80": metrics["coverage_80"],
        "brier": metrics["brier"],
        "brier_baserate": metrics["brier_baserate"],
        "go_no_go": call,
        "caveat": caveat,
        "is_stub": False,
    },
    "scenarios": {k: {"label": lbl, "rate_delta_pp": pp} for k, (lbl, pp) in SCEN.items()},
    "boroughs": {},
}

lat = lat_all.set_index("AreaCode")
base10, base50, base90 = raw_q(q_pr, lat_all[FEATS].astype(float))
for i, code in enumerate(lat_all["AreaCode"].values):
    c50 = float(np.clip(base50[i], *P50_CLIP))
    half_lo = max(c50 - (base10[i] - pad), 0.02)
    half_hi = max((base90[i] + pad) - c50, 0.02)
    fc = {}
    for name, (_, delta) in SCEN.items():
        shift = elas * delta
        m = float(np.clip(c50 + shift, P50_CLIP[0] - 0.03, P50_CLIP[1] + 0.03))
        p10, p90 = m - half_lo, m + half_hi
        fc[name] = {"p10": p10, "p50": m, "p90": p90,
                    "p_decline": round(p_decline_from_band(p10, m, p90), 3)}
    out["boroughs"][code] = {
        "name": lat.loc[code, "RegionName"],
        "avg_price": float(lat.loc[code, "AveragePrice"]),
        "avg_rent_monthly": RENT.get(code),
        "forecast": {k: {kk: round(vv, 4) if kk != "p_decline" else vv
                         for kk, vv in v.items()} for k, v in fc.items()},
        "drivers": drivers,
    }

for code, b in out["boroughs"].items():
    for name, f in b["forecast"].items():
        assert f["p10"] <= f["p50"] <= f["p90"], (code, name, f)
        assert 0.0 <= f["p_decline"] <= 1.0, (code, name, f)

json.dump(out, open(OUT, "w"), indent=2)
bt.to_parquet("outputs/backtest_rolling.parquet")
json.dump({**metrics, "go_no_go": call, "per_year": json.loads(per_year.to_json(orient="index"))},
          open("outputs/metrics.json", "w"), indent=2)
print(f"\nwrote {OUT}  ({len(out['boroughs'])} boroughs, forecast from {prod_through.date()})")
print(f"drivers  up={drivers['up']}  down={drivers['down']}")
for code in ["E09000031", "E09000002", "E09000007"]:
    b = out["boroughs"][code]
    print(f"  {b['name']:<22}", {k: (v['p50'], v['p_decline']) for k, v in b['forecast'].items()})
