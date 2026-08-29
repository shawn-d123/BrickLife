"""
01_build_panel.py  --  BRICKLIFE / House London, Lane A

Build a borough-by-month panel of London house prices from the UK HPI full file,
plus a small set of features that carry borough-level signal, plus the Bank of
England Bank Rate as a macro feature so the scenario re-runs are model-derived.

Input :  ../data/raw/uk-hpi-full.csv        (UK HPI full file, monthly, from 1995)
         ../data/raw/boe_bank_rate.csv      (BoE series IUDBEDR, daily)
Output:  ../data/london_panel.parquet
"""

import pandas as pd
import numpy as np

RAW_HPI = "../data/raw/uk-hpi-full.csv"
RAW_BOE = "../data/raw/boe_bank_rate.csv"
OUT     = "../data/london_panel.parquet"


# ----------------------------------------------------------------------------
# 1. Load UK HPI, keep the 33 London boroughs
# ----------------------------------------------------------------------------
df = pd.read_csv(RAW_HPI, parse_dates=["Date"], dayfirst=True)

lon = df[df["AreaCode"].astype(str).str.startswith("E09")].copy()
lon = lon[["Date", "AreaCode", "RegionName", "AveragePrice", "Index", "SalesVolume"]]
lon = lon.sort_values(["AreaCode", "Date"]).reset_index(drop=True)

# SalesVolume lags ~2 months and gets revised -- drop the unstable tail
lon = lon[lon["Date"] <= lon["Date"].max() - pd.DateOffset(months=3)].copy()


# ----------------------------------------------------------------------------
# 2. Bank Rate -> monthly, merged onto each borough-month (as-of, backward)
# ----------------------------------------------------------------------------
boe = pd.read_csv(RAW_BOE)
boe.columns = ["Date", "bank_rate"]
boe["Date"] = pd.to_datetime(boe["Date"], format="%d %b %Y")
boe = boe.sort_values("Date").reset_index(drop=True)

lon = lon.sort_values("Date")
lon = pd.merge_asof(lon, boe, on="Date", direction="backward")
lon = lon.sort_values(["AreaCode", "Date"]).reset_index(drop=True)
# 12-month change in the rate: captures "rates rising / falling into next year"
lon["bank_rate_chg_12m"] = lon.groupby("AreaCode")["bank_rate"].diff(12)


# ----------------------------------------------------------------------------
# 3. Momentum features off the price Index
# ----------------------------------------------------------------------------
g = lon.groupby("AreaCode")["Index"]
for k in (1, 3, 6, 12, 24):
    lon[f"growth_{k}m"] = g.pct_change(k)
lon["growth_12m_lag12"] = lon.groupby("AreaCode")["growth_12m"].shift(12)

lon["log_price"] = np.log(lon["AveragePrice"])
lon["vol_12m"] = lon.groupby("AreaCode")["SalesVolume"].transform(lambda s: s.rolling(12).sum())
lon["vol_yoy"] = lon.groupby("AreaCode")["vol_12m"].pct_change(12)


# ----------------------------------------------------------------------------
# 4. The block that actually carries borough-level signal:
#    where each borough sits relative to London, and how that is moving
# ----------------------------------------------------------------------------
london_idx = lon.groupby("Date")["Index"].transform("mean")
lon["price_rel_london"]     = lon["Index"] / london_idx
lon["price_rel_london_chg"] = lon.groupby("AreaCode")["price_rel_london"].pct_change(12)
lon["rank_in_london"]       = lon.groupby("Date")["AveragePrice"].rank(pct=True)

lon["month"]      = lon["Date"].dt.month
lon["borough_id"] = lon["AreaCode"].astype("category").cat.codes


# ----------------------------------------------------------------------------
# 5. Target: 12-month-ahead growth of the price Index
# ----------------------------------------------------------------------------
lon["y"] = lon.groupby("AreaCode")["Index"].shift(-12) / lon["Index"] - 1

lon.to_parquet(OUT)

# ----------------------------------------------------------------------------
# Sanity
# ----------------------------------------------------------------------------
print(f"panel shape        {lon.shape}")
print(f"date range         {lon['Date'].min().date()} -> {lon['Date'].max().date()}")
print(f"boroughs           {lon['AreaCode'].nunique()}")
print(f"months per borough {lon.groupby('AreaCode').size().min()}"
      f" .. {lon.groupby('AreaCode').size().max()}")
print(f"y null (last 12m)  {lon['y'].isna().sum()} rows")
print(f"bank_rate null     {lon['bank_rate'].isna().sum()} rows")
peak = lon.loc[lon['growth_12m'].idxmax()]
print(f"max growth_12m     {peak['growth_12m']:.3f}  ({peak['RegionName']}, {peak['Date'].date()})")
