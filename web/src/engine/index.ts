/**
 * Public surface of the engine. OWNER: [B].
 *
 * C only ever needs these four functions plus the types:
 *
 *   import { rollCircumstances, drawScenarioPath, simulate, counterfactual }
 *     from "../engine";
 */

export type {
  BoroughCode,
  Circumstances,
  Decision,
  DecisionKind,
  EventChoice,
  EventDetail,
  EventFact,
  EventKind,
  Forecast,
  GameEvent,
  Mortgage,
  NpcId,
  Outlook,
  Predictions,
  RunState,
  ScenarioId,
  Tenure,
  YearState,
} from "./types.ts";

export { rollCircumstances, drawScenarioPath, simulate, counterfactual, realiseMove } from "./sim.ts";

export {
  allBoroughs,
  boroughFacts,
  getForecast,
  isStub,
  scenarioDelta,
  scenarioLabel,
  PREDICTIONS,
} from "./predictions.ts";
export type { BoroughFacts } from "./predictions.ts";

export {
  monthlyPayment,
  balanceAfter,
  interestOver,
  stampDuty,
  netMonthly,
  maxAffordable,
  MAX_LTI,
  MIN_DEPOSIT,
} from "./finance.ts";

export { canAfford, depositFor, cashNeededToBuy } from "./events.ts";
export { gbp, pct, START_YEAR, FINAL_YEAR } from "./constants.ts";
