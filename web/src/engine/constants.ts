/** Engine-wide constants. OWNER: [B]. */

export const START_YEAR = 2026;
export const FINAL_YEAR = 2030;
/** 4 advances, 5 year states. */
export const YEARS_SIMULATED = FINAL_YEAR - START_YEAR;

/** Headline 25-year term, and the market rate before any scenario delta. */
export const MORTGAGE_TERM_MONTHS = 300;
export const BASE_MORTGAGE_RATE = 4.75;
/** A remortgage shops around and beats the shelf rate by this much. */
export const REMORTGAGE_DISCOUNT_PP = 0.35;
export const RATE_FLOOR_PCT = 0.5;

/** Owning is not just the mortgage: service charge, insurance, repairs. */
export const OWNER_UPKEEP_MONTHLY = 210;

/** Non-housing living costs: a floor plus a share of take-home. */
export const LIVING_COST_BASE = 780;
export const LIVING_COST_SHARE = 0.18;

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const livingCostMonthly = (netMonthlyPay: number) =>
  LIVING_COST_BASE + LIVING_COST_SHARE * netMonthlyPay;

export const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

export const pct = (fraction: number, dp = 1) => (fraction * 100).toFixed(dp) + "%";
