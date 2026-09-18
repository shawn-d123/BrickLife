// ============================================================================
//  THE INTEGRATION POINT. The game reads everything through this file.
//
//  Wired to:
//    web/src/engine      simulate / counterfactual / finance / events
//    web/src/content     copy.ts, boroughs.ts
//    web/src/data         predictions.json  (is_stub: false)
//
//  Nothing in web/src/game/ imports engine/, content/ or data/ directly, and
//  nothing in web/src/game/ writes outside web/src/game/.
// ============================================================================

// ---- ENGINE -----------------------------------------------------------------
export {
  rollCircumstances,
  drawScenarioPath,
  simulate,
  counterfactual,
  // finance, used by the buying and outlook screens
  monthlyPayment,
  stampDuty,
  netMonthly,
  maxAffordable,
  MAX_LTI,
  MIN_DEPOSIT,
  // affordability, so the game's "can you reach this?" matches the engine exactly
  canAfford,
  depositFor,
  cashNeededToBuy,
  // predictions access
  PREDICTIONS,
  getForecast,
  boroughFacts,
  allBoroughs,
  scenarioDelta,
  scenarioLabel,
  isStub,
} from "../engine/index.ts";

export type {
  BoroughCode, ScenarioId, Tenure, DecisionKind, Decision, Circumstances,
  Mortgage, YearState, GameEvent, RunState, Forecast, Predictions, Outlook,
} from "../engine/index.ts";
export type { BoroughFacts } from "../engine/index.ts";

// ---- CONTENT ------------------------------------------------------------
export { EVENT_COPY, SCENARIO_COPY, CAREERS } from "../content/copy.ts";
export { BOROUGHS, boroughByCode } from "../content/boroughs.ts";

// ---- PRESENTATION FLAVOUR (not part of the content contract) --------------
export { NOISE, NPC_LINE, NPC_NAME } from "./flavour.ts";

// ---- MODEL DATA ------------------------------------------------------------
import { isStub as engineIsStub } from "../engine/index.ts";

/** Drives the "what's real" disclosure. False now the real export has landed. */
export const IS_STUB: boolean = engineIsStub();

/**
 * The model's export carries provenance fields beyond the frozen contract's
 * meta block. `PredictionsMeta` is the contract and stays as it is; the game
 * reads the extras through this widened view instead of editing the engine's
 * own types.
 */
export interface ExtraMeta {
  trained_from?: string;
  backtest?: string;
  scenario_method?: string;
  rent_source?: string;
  caveat?: string;
  go_no_go?: string;
}
import type { Predictions as P } from "../engine/index.ts";
import { PREDICTIONS as PRED } from "../engine/index.ts";
export const META = PRED.meta as P["meta"] & ExtraMeta;

// ---- C-side presentation helpers ------------------------------------------
// These are display maths, not simulation state, so they live in the game, not the engine.
import { getForecast as fc, boroughFacts as facts, canAfford as engineCanAfford,
         cashNeededToBuy as engineCashNeeded } from "../engine/index.ts";
import type { BoroughCode as Code, Forecast as Fc, ScenarioId as Scn,
              YearState as YS } from "../engine/index.ts";
import { mulberry32, round as roundTo } from "../engine/rng.ts";

export { mulberry32 };

/**
 * The forecast band widened for later years, matching how the engine's realised
 * move spreads out as the scenario compounds. Presentation only -- the engine
 * draws its own realisation.
 */
export function widenedBand(borough: Code, scenario: Scn, yearIndex: number): Fc {
  const f = fc(borough, scenario);
  const w = 1 + 0.35 * Math.max(0, yearIndex);
  return {
    p10: f.p50 + (f.p10 - f.p50) * w,
    p50: f.p50,
    p90: f.p50 + (f.p90 - f.p50) * w,
    p_decline: f.p_decline,
  };
}

/**
 * Entry-level asking price for a borough, for the comparison table.
 *
 * Matches the engine's own out-of-borough listing (avgPrice x 0.55, rounded to
 * £1,000), so a borough the table calls reachable is one the engine will
 * actually let the player buy. The decision card quotes a specific flat drawn
 * separately by the engine, which is why the two numbers differ -- the table is
 * "entry level here", the card is "this flat".
 */
export function offerPrice(borough: Code): number {
  return roundTo(facts(borough).avgPrice * 0.55, 1000);
}

/** What this player can actually put on the table, after the emergency buffer. */
export function depositPower(st: YS): number {
  return Math.max(0, st.cash - 5_000);
}

/** Could they buy this, on the engine's own test? */
export function reachable(st: YS, price: number): boolean {
  return engineCanAfford(st, price);
}

export { engineCashNeeded as cashNeeded };
