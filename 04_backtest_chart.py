"""
04_backtest_chart.py  --  BRICKLIFE / House London, Lane A

One panel, three lines, big fonts. Actual vs predicted median 12-month-ahead
growth for one recognisable borough across the rolling-origin backtest, with the
conformalised p10-p90 band shaded and the persistence baseline dashed.

Run:  cd model && python 04_backtest_chart.py   ->  ../web/public/backtest.png
"""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

BOROUGH = "E09000012"          # Hackney -- in the MVP six, widely recognised
OUT = "../web/public/backtest.png"

bt = pd.read_parquet("outputs/backtest_rolling.parquet")
g = bt[bt.AreaCode == BOROUGH].sort_values("Date").copy()
name = g["RegionName"].iloc[0]

# x = the month the 12-month growth actually applies to (feature month + 12)
g["applies"] = g["Date"] + pd.DateOffset(months=12)

mae_model = (g.y - g.p50).abs().mean()
mae_pers  = (g.y - g.growth_12m).abs().mean()
cov = ((g.y >= g.p10) & (g.y <= g.p90)).mean()

plt.rcParams.update({"font.size": 17})
fig, ax = plt.subplots(figsize=(12, 6.5))

ax.fill_between(g.applies, g.p10 * 100, g.p90 * 100, color="#4c78a8", alpha=0.18,
                label="Model 80% interval (p10-p90)")
ax.plot(g.applies, g.y * 100, color="#111111", lw=3, marker="o", ms=5,
        label="Actual 12-month growth")
ax.plot(g.applies, g.p50 * 100, color="#4c78a8", lw=3, marker="o", ms=5,
        label=f"Model median  (MAE {mae_model*100:.1f} pp)")
ax.plot(g.applies, g.growth_12m * 100, color="#e45756", lw=2.5, ls="--",
        label=f"Persistence baseline  (MAE {mae_pers*100:.1f} pp)")

ax.axhline(0, color="#999999", lw=1)
ax.set_title(f"{name}: 12-month-ahead price growth\n"
             f"rolling-origin backtest, trained only on data 12+ months earlier",
             fontsize=19, fontweight="bold")
ax.set_ylabel("Growth over next 12 months (%)")
ax.set_xlabel("Month the growth applies to")
ax.legend(loc="upper right", framealpha=0.95, fontsize=13)
ax.text(0.015, 0.04, f"Interval coverage {cov*100:.0f}%  (target 80%)",
        transform=ax.transAxes, fontsize=13, color="#333333")
ax.grid(alpha=0.25)
fig.tight_layout()
fig.savefig(OUT, dpi=140)
print(f"wrote {OUT}   {name}  model MAE {mae_model*100:.2f}pp  "
      f"persistence {mae_pers*100:.2f}pp  coverage {cov*100:.0f}%")
