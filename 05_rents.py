"""
05_rents.py  --  BRICKLIFE / House London, Lane A

Average monthly private rent for all 33 London boroughs, so the game has a rent
figure everywhere and not just the MVP six.

Source: ONS Price Index of Private Rents, UK -- monthly price statistics
        (Table 1, "Rental price" column, latest month in the file).
        Download once to data/raw/ons_pipr_monthly.xlsx from
        https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics

ONS does not publish City of London (low sample). It is imputed at the median
gross rental yield of the other 32 boroughs, applied to its UK HPI average price,
and labelled as imputed in the output.

Output: data/raw/london_borough_rent.csv   (code, name, avg_price, avg_rent_monthly, rent_source)
"""

import numpy as np
import pandas as pd

PIPR  = "../data/raw/ons_pipr_monthly.xlsx"
PANEL = "../data/london_panel.parquet"
OUT   = "../data/raw/london_borough_rent.csv"

# ONS PIPR: rent (GBP/month) by local authority, latest month, London only
rent = pd.read_excel(PIPR, sheet_name="Table 1", header=2)
rent["Time period"] = pd.to_datetime(rent["Time period"])
rent = rent[rent["Area code"].astype(str).str.startswith("E09")]
latest = rent["Time period"].max()
rent = (rent[rent["Time period"] == latest][["Area code", "Rental price"]]
        .rename(columns={"Area code": "code", "Rental price": "avg_rent_monthly"}))
rent["avg_rent_monthly"] = rent["avg_rent_monthly"].astype(float).round()
rent["rent_source"] = f"ONS PIPR {latest.strftime('%Y-%m')}"

# UK HPI average price, latest row per borough (all 33)
price = (pd.read_parquet(PANEL).sort_values("Date").groupby("AreaCode").tail(1)
         [["AreaCode", "RegionName", "AveragePrice"]]
         .rename(columns={"AreaCode": "code", "RegionName": "name",
                          "AveragePrice": "avg_price"}))
price["avg_price"] = price["avg_price"].round().astype(int)

m = price.merge(rent, on="code", how="left")

# impute the missing one (City of London) at the median gross yield
known = m.dropna(subset=["avg_rent_monthly"])
pr_ratio = float(np.median(known["avg_price"] / (known["avg_rent_monthly"] * 12)))
miss = m["avg_rent_monthly"].isna()
m.loc[miss, "avg_rent_monthly"] = (m.loc[miss, "avg_price"] / (pr_ratio * 12)).round()
m.loc[miss, "rent_source"] = f"imputed (median gross yield {100 / pr_ratio:.1f}%)"

m["avg_rent_monthly"] = m["avg_rent_monthly"].astype(int)
m = m.sort_values("name").reset_index(drop=True)
m.to_csv(OUT, index=False)

print(f"rent month {latest.strftime('%Y-%m')}   price/rent ratio {pr_ratio:.1f}")
print(m.to_string(index=False))
print(f"\nwrote {OUT}   {len(m)} boroughs, all with a rent figure "
      f"({miss.sum()} imputed)")
