"""
02_baselines.py  --  BRICKLIFE / House London, Lane A
The idea-lock deliverable: three baseline MAEs for 12-month-ahead borough growth,
scored chronologically on 2022-01 .. 2024-12.

B0  persistence     -- next year's growth = last year's growth
B1  London factor   -- next year's growth = the London-wide average growth  <-- the one that matters
B2  naive mean      -- next year's growth = the single training-period average, everywhere
"""

import pandas as pd

d = pd.read_parquet("../data/london_panel.parquet").dropna(subset=["y"])
test = d[(d.Date >= "2022-01-01") & (d.Date <= "2024-12-01")]

mae = lambda p: (test["y"] - p).abs().mean()

# B0 -- persistence
b0 = mae(test["growth_12m"])

# B1 -- London common factor (mean growth_12m across boroughs, per date)
london_g = d.groupby("Date")["growth_12m"].transform("mean")
b1 = mae(london_g.loc[test.index])

# B2 -- naive mean: a single constant, the training-period average growth,
#       predicted for every borough-month. No lookahead.
train_mean = d[d.Date <= "2015-12-01"]["y"].mean()
b2 = mae(pd.Series(train_mean, index=test.index))

# reference only: the in-sample per-borough test-window mean (peeks at test
# outcomes, so not a fair baseline -- shown to bound within-borough variance)
b2_oracle = mae(test.groupby("AreaCode")["y"].transform("mean"))

print(f"test rows          {len(test)}  ({test['Date'].min().date()} .. {test['Date'].max().date()})")
print(f"B0 persistence     {b0:.4f}")
print(f"B1 London factor   {b1:.4f}   <-- the one that matters")
print(f"B2 naive mean      {b2:.4f}   (train mean = {train_mean:.4f})")
print(f"   [ref] oracle borough mean {b2_oracle:.4f}  (in-sample, not a fair baseline)")
