# Lane A — Model & Data

Borough-by-month forecast of London house-price growth, 12 months ahead, feeding
the game via `web/src/data/predictions.json` and `web/public/backtest.png`.

## Run

```bash
cd model
python 01_build_panel.py       # -> data/london_panel.parquet
python 02_baselines.py         # B0/B1/B2 console print (idea-lock deliverable)
python 05_rents.py             # -> data/raw/london_borough_rent.csv  (run before 03)
python 03_train_export.py      # -> web/src/data/predictions.json  (+ outputs/metrics.json)
python 04_backtest_chart.py    # -> web/public/backtest.png
```

`03` is self-contained: it runs the backtest, prints the go/no-go, refits, and
writes the export.

```
pip install pandas numpy scikit-learn lightgbm matplotlib pyarrow openpyxl
```

## Data

- **UK HPI full file** (`data/raw/uk-hpi-full.csv`) — borough-level monthly price
  index and sales volume, 1995–2026. 33 London boroughs (`AreaCode` starts `E09`).
- **Bank of England Bank Rate** (`data/raw/boe_bank_rate.csv`, series IUDBEDR) —
  merged as-of onto each borough-month. This makes the rate scenarios a model
  input rather than a hand-wave.
- Bank Rate is the only macro series used. Affordability ratios were not merged
  (time); momentum and relative-position features carry the borough signal.
- **ONS Price Index of Private Rents** (`data/raw/ons_pipr_monthly.xlsx`) — average
  monthly rent by borough, latest month. `05_rents.py` extracts it and writes
  `data/raw/london_borough_rent.csv` (price + rent, all 33). Not a model feature;
  it only fills `avg_rent_monthly` in the export. City of London is not published
  by ONS, so it is imputed at the median gross yield of the other 32 and labelled
  `rent_source: "imputed …"`. Every other borough is `rent_source: "ONS PIPR …"`.

## Model

Four LightGBM heads on the same features: quantile regression at 0.1 / 0.5 / 0.9,
plus a binary "will decline" classifier. The 80% interval is **conformalised** —
padded by the 80th-percentile out-of-sample residual so the band is honestly
sized, not just whatever the quantile heads emit.

Features (16): log price; 1/3/6/12/24-month index growth; growth_12m lagged 12;
price relative to the London mean and its 12-month change; price rank within
London; 12-month sales volume and its YoY change; Bank Rate and its 12-month
change; calendar month; borough id.

Target: `Index.shift(-12) / Index - 1` — realised growth over the next 12 months.

## Backtest — rolling origin, 12-month embargo

For each year Y in 2019–2024, train on every borough-month with `Date <= Dec(Y-2)`
(so the forward-looking target never overlaps the test year), predict the 12
months of Y. Pooled over 2019–2024 (2,376 borough-months):

| metric | model | baseline | read |
|---|---|---|---|
| MAE | **0.0414** | B0 persistence 0.0616 · B1 London-trend 0.0476 · B2 naive mean 0.0691 | beats all three |
| direction accuracy | 0.605 | majority class 0.660 | **below majority — the weak spot** |
| 80% interval coverage | 0.836 (held-out 2023–24) | target 0.80 | calibrated, slightly conservative |
| Brier (decline) | 0.297 | base rate 0.253 | classifier alone does **not** beat the base rate |

Per year: strong in 2019 and 2022 (MAE ~0.03, direction ~0.78); weakest in 2021
(COVID stamp-duty spike) and on direction in 2023–24. Momentum-based forecasting
lags at turning points — that is the honest limitation.

## Go / no-go call

> **GREEN on error, with a direction caveat.** Point forecast beats persistence
> and the London-trend baseline across a six-year rolling backtest (MAE 0.041 vs
> 0.048–0.062). It does **not** beat the majority-class rate on up/down direction,
> and the standalone decline classifier does not beat its base rate. Lead the
> pitch with the **calibrated 80% interval** (coverage 0.84 out of sample) and the
> **borough-level decline probability**, both derived from the same quantile heads.

## `predictions.json` notes for D's "what's real" panel

- `meta.is_stub` = `false`. All three baseline MAEs are in `meta`.
- `meta.test_window` = `2019-01 to 2024-12` (pooled rolling backtest).
- Shipped forecasts are made from **March 2025** feature rows (latest fully-formed
  features), model refit on **2010–2025** data — pre-2010 was dropped because its
  ~9%/yr average growth is a different regime and it dragged the point forecast
  (visible in the weak 2018 backtest year).
- `meta.scenario_method`: the rate scenarios shift Bank Rate by the stated
  `rate_delta_pp`, and the median forecast moves by a **−1.6pp growth per +1pp**
  elasticity (the pooled model response was noisy at borough level, so a single
  pooled/literature-midpoint elasticity is applied; label this as post-hoc, not a
  separate model fit). `p_decline` is recomputed from the shifted interval, so it
  stays consistent with the band. B also applies `rate_delta_pp` to the player's
  mortgage separately.
- `drivers` are **global** feature-importance labels (median head), split up/down
  by each feature's correlation sign — not per-borough attribution.
- `p50` is clipped to [−6%, +10%]. City of London and Westminster sit at the top
  of that range: both are thin, volatile markets. None of the six MVP boroughs
  are affected.

## Files

```
data/raw/uk-hpi-full.csv          UK HPI full file
data/raw/boe_bank_rate.csv        BoE Bank Rate (IUDBEDR)
data/london_panel.parquet         built panel, 12,375 borough-months
model/01_build_panel.py           panel + features
model/02_baselines.py             B0 / B1 / B2
model/03_train_export.py          backtest, refit, export
model/04_backtest_chart.py        backtest.png
model/outputs/metrics.json        pooled + per-year metrics
model/outputs/backtest_rolling.parquet   every backtest prediction
web/src/data/predictions.json     the contract-1 export (33 boroughs)
web/public/backtest.png           demo chart (Hackney)
```
