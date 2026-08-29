/**
 * BrickLife — engine contract types.
 *
 * OWNER: [B]. This file is the contract from `00-CONTRACTS.md` section 3 and
 * C builds against it. Any change here is announced to the team.
 *
 * Additions beyond the frozen contract are OPTIONAL fields only (allowed by
 * the contract rules) and are marked `// [B] optional extension`.
 */

export type BoroughCode = string; // "E09000031"
export type ScenarioId = "base" | "rate_shock" | "rate_cuts";
export type Tenure = "renting" | "owning";

export type DecisionKind =
  | "accept_rent" | "move" | "buy" | "wait"
  | "remortgage" | "sell" | "take_lodger" | "accept_job";

export interface Decision {
  year: number;                 // 2026 .. 2029
  kind: DecisionKind;
  borough?: BoroughCode;        // for "move" and "buy"
  price?: number;               // for "buy"
}

export interface Circumstances {
  name: string;
  spriteId: 0 | 1 | 2;
  age: number;
  borough: BoroughCode;
  career: string;               // "Junior Developer"
  salary: number;               // gross annual
  savings: number;
  rentMonthly: number;
  familySupport: "none" | "limited" | "strong";
}

export interface Mortgage {
  balance: number;
  ratePct: number;              // 4.75 means 4.75%
  monthly: number;
  monthsRemaining: number;
  basePct?: number;             // [B] optional extension: rate before the scenario delta
}

/** [B] optional extension: the widened forecast band for the year ahead, for C's fan chart. */
export interface Outlook {
  p10: number;
  p50: number;
  p90: number;
  pDecline: number;
}

export interface YearState {
  year: number;                 // 2026 .. 2030
  age: number;
  borough: BoroughCode;
  tenure: Tenure;

  cash: number;
  salary: number;
  netMonthly: number;           // after tax and NI
  rentMonthly: number;          // 0 when owning
  mortgage: Mortgage | null;

  propertyValue: number;        // 0 when renting
  equity: number;
  netWorth: number;
  housingCostRatio: number;     // 0..1, housing / net income

  wellbeing: number;            // 0..100, gameplay abstraction
  stress: number;               // 0..100, gameplay abstraction

  scenario: ScenarioId;
  marketMove: number;           // realised borough growth this year, fraction
  totalRentPaid: number;
  totalMortgagePaid: number;

  lodgerIncomeMonthly?: number; // [B] optional extension
  outlook?: Outlook;            // [B] optional extension
}

export interface EventFact {
  label: string;
  before?: string;
  after?: string;
  value?: string;
}

export interface EventChoice {
  kind: DecisionKind;
  label: string;
  borough?: BoroughCode;
  price?: number;
}

export type EventKind =
  | "rent_increase" | "buy_opportunity" | "rate_change"
  | "household" | "employment" | "mortgage_reset"
  // [C] extension, agreed at merge: renters were seeing four events to an
  // owner's six, two of them the same rent rise. This is the renter's own
  // pressure beat, so every year has two decisions whatever your tenure.
  | "landlord_sells";

export type NpcId = "landlord" | "estate_agent" | "bank" | "partner" | "employer";

/**
 * [B] optional extension: the numbers behind an event, so applying a decision
 * uses exactly what the player was shown. C can ignore this entirely.
 */
export interface EventDetail {
  oldRent?: number;
  newRent?: number;
  moveBorough?: BoroughCode;
  moveRent?: number;
  price?: number;
  deposit?: number;
  stampDuty?: number;
  budget?: number;
  oldRate?: number;
  newRate?: number;
  oldMonthly?: number;
  newMonthly?: number;
  newSalary?: number;
  extraIncomeMonthly?: number;
}

export interface GameEvent {
  id: string;                   // "rent_increase_2026"
  kind: EventKind;
  npc: NpcId;
  year: number;
  headline: string;             // from D's copy.ts
  body: string;
  facts: EventFact[];
  choices: EventChoice[];
  detail?: EventDetail;         // [B] optional extension
}

export interface RunState {
  circumstances: Circumstances;
  years: YearState[];           // one per completed year, index 0 = 2026
  current: YearState;           // where the player is right now
  pending: GameEvent | null;    // null means the run is finished
  finished: boolean;
  log: Decision[];
}

// ---------- shape of predictions.json (produced by D at 12:15, A at 15:00) ----------

export interface Forecast {
  p10: number;
  p50: number;
  p90: number;
  p_decline: number;
}

export interface ScenarioDef {
  label: string;
  rate_delta_pp: number;        // percentage points added to the mortgage rate
}

export interface BoroughPrediction {
  name: string;
  avg_price: number;
  avg_rent_monthly: number;
  forecast: Record<ScenarioId, Forecast>;
  drivers: { up: string[]; down: string[] };
}

export interface PredictionsMeta {
  is_stub: boolean;
  trained_through?: string;
  model?: string;
  test_window?: string;
  embargo_months?: number;
  test_mae?: number;
  baseline_mae_persistence?: number;
  baseline_mae_london?: number;
  baseline_mae_mean?: number;
  direction_acc?: number;
  direction_acc_majority?: number;
  coverage_80?: number;
  brier?: number;
  brier_baserate?: number;
}

export interface Predictions {
  meta: PredictionsMeta;
  scenarios: Record<ScenarioId, ScenarioDef>;
  boroughs: Record<BoroughCode, BoroughPrediction>;
}
