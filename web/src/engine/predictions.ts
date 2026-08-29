/**
 * Adapter over `web/src/data/predictions.json`. OWNER: [B].
 *
 * D writes the stub at 12:15, A overwrites it at 15:00 with the real export.
 * Nothing in here changes when that swap happens — that is the point.
 *
 * EVERY read of the file goes through this module, and every read is
 * defensive. A is exporting from a notebook against a 17:00 deadline; if a
 * borough comes through missing a rent figure, a scenario branch, or with
 * quantiles crossed, the game degrades to a sane number instead of putting
 * NaN on screen or throwing during the demo.
 */

import raw from "../data/predictions.json" with { type: "json" };
import { boroughByCode } from "../content/boroughs.ts";
import type {
  BoroughCode,
  BoroughPrediction,
  Forecast,
  Predictions,
  ScenarioId,
} from "./types.ts";
import { clamp } from "./constants.ts";

export const PREDICTIONS = raw as unknown as Predictions;

export const SCENARIO_IDS: ScenarioId[] = ["base", "rate_shock", "rate_cuts"];

/** Last-resort values if the export is unusable. London-ish, deliberately dull. */
const NEUTRAL_FORECAST: Forecast = { p10: -0.03, p50: 0.01, p90: 0.05, p_decline: 0.35 };
const NEUTRAL_PRICE = 480_000;
const NEUTRAL_RENT = 1_600;
const NEUTRAL_YIELD = 0.04;

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/**
 * Mean gross rental yield across whichever boroughs actually carry a rent
 * figure, used to estimate rent for the ones that do not.
 *
 * A's export only fills `avg_rent_monthly` for the six MVP boroughs (the RENT
 * dict in 03_train_export.py); the other 27 come through as null. A flat
 * fallback would give Richmond and Barking the same rent, which is absurd and
 * visible on screen. Deriving it from price keeps the ordering sane.
 *
 * On the current export the six known boroughs sit in a tight 3.4-4.6% band,
 * so this is a reasonable approximation — but it IS an approximation, and it
 * disappears entirely the moment A or D fill the remaining rents.
 *
 * Derived once from a static import: deterministic, immutable, not state.
 */
const MEAN_GROSS_YIELD: number = (() => {
  const ys: number[] = [];
  for (const b of Object.values(PREDICTIONS.boroughs ?? {})) {
    const price = b?.avg_price;
    const rent = b?.avg_rent_monthly;
    if (typeof price === "number" && Number.isFinite(price) && price > 0 &&
        typeof rent === "number" && Number.isFinite(rent) && rent > 0) {
      ys.push((rent * 12) / price);
    }
  }
  if (ys.length === 0) return NEUTRAL_YIELD;
  return ys.reduce((a, b) => a + b, 0) / ys.length;
})();

/** True when a borough's rent is estimated from price rather than exported. */
export function rentIsEstimated(code: BoroughCode): boolean {
  const r = getBorough(code)?.avg_rent_monthly;
  return !(typeof r === "number" && Number.isFinite(r) && r > 0);
}

/** How many boroughs are running on an estimated rent. For D's "what's real" panel. */
export const estimatedRentCount = (): number =>
  boroughCodes().filter(rentIsEstimated).length;

/** True while D's hand-written stub is in place. D's "what's real" panel reads this. */
export const isStub = (): boolean => PREDICTIONS.meta?.is_stub === true;

export const boroughCodes = (): BoroughCode[] => Object.keys(PREDICTIONS.boroughs ?? {});

/** Never throws: an unknown borough falls back to the first exported one. */
export function getBorough(code: BoroughCode): BoroughPrediction | undefined {
  const boroughs = PREDICTIONS.boroughs ?? {};
  return boroughs[code] ?? boroughs[boroughCodes()[0]];
}

/**
 * Forecast for a borough under a scenario.
 *
 * Falls back scenario -> base -> neutral, coerces every quantile to a finite
 * number, and sorts them so p10 <= p50 <= p90 even if the model exported them
 * crossed (A said they would sort before export; this does not rely on it).
 */
export function getForecast(code: BoroughCode, scenario: ScenarioId): Forecast {
  const forecasts = getBorough(code)?.forecast;
  const f = forecasts?.[scenario] ?? forecasts?.base;
  if (!f) return { ...NEUTRAL_FORECAST };
  const [p10, p50, p90] = [
    num(f.p10, NEUTRAL_FORECAST.p10),
    num(f.p50, NEUTRAL_FORECAST.p50),
    num(f.p90, NEUTRAL_FORECAST.p90),
  ].sort((a, b) => a - b);
  return { p10, p50, p90, p_decline: clamp(num(f.p_decline, NEUTRAL_FORECAST.p_decline), 0, 1) };
}

/** Percentage points this scenario adds to the player's mortgage rate. */
export function scenarioDelta(scenario: ScenarioId): number {
  return num(PREDICTIONS.scenarios?.[scenario]?.rate_delta_pp, 0);
}

export function scenarioLabel(scenario: ScenarioId): string {
  return PREDICTIONS.scenarios?.[scenario]?.label ?? scenario;
}

// ---------- borough facts ----------
// predictions.json is authoritative for price and rent (A supersedes D's
// boroughs.ts at 15:00). D's file is the fallback for all three fields.

export interface BoroughFacts {
  code: BoroughCode;
  name: string;
  avgPrice: number;
  avgRent: number;
}

export function boroughFacts(code: BoroughCode): BoroughFacts {
  const boroughs = PREDICTIONS.boroughs ?? {};
  const resolved = boroughs[code] ? code : boroughCodes()[0] ?? code;
  const bp = getBorough(resolved);
  const fromD = boroughByCode(resolved);
  const avgPrice = num(bp?.avg_price, num(fromD?.avgPrice, NEUTRAL_PRICE));
  // Rent: A's export first, then D's boroughs.ts, then estimated from price at
  // the mean gross yield, then a flat constant.
  const estimated = Math.round((avgPrice * MEAN_GROSS_YIELD) / 12 / 10) * 10;
  return {
    code: resolved,
    name: bp?.name ?? fromD?.name ?? resolved,
    avgPrice,
    avgRent: num(bp?.avg_rent_monthly, num(fromD?.avgRent, num(estimated, NEUTRAL_RENT))),
  };
}

export const allBoroughs = (): BoroughFacts[] => boroughCodes().map(boroughFacts);
