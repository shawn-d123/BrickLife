/**
 * BrickLife simulation engine. OWNER: [B].
 *
 * THE RULE THAT MATTERS MORE THAN ANYTHING ELSE:
 *
 *   `simulate` is a pure function. Same three arguments in, byte-identical
 *   RunState out, every time, forever.
 *
 * No Math.random, no Date.now, no localStorage, no module-level mutable state,
 * no mutation of the arguments. The counterfactual screen replays the SAME
 * future against a DIFFERENT decision — if any randomness here were unseeded,
 * that comparison would be meaningless.
 *
 * The market comes from the model (`predictions.json`). Life comes from game
 * logic. That boundary is what makes the project defensible: nobody is
 * predicting marriages with gradient boosting.
 */

import type {
  Circumstances,
  Decision,
  GameEvent,
  Mortgage,
  Outlook,
  RunState,
  ScenarioId,
  YearState,
} from "./types.ts";
import type { Forecast } from "./types.ts";
import { mulberry32, pick, pickWeighted, range, round, yearRng } from "./rng.ts";
import type { Rng } from "./rng.ts";
import {
  LEGAL_AND_SURVEY,
  MOVING_COST,
  REMORTGAGE_FEE,
  SELLING_COST_RATE,
  balanceAfter,
  monthlyPayment,
  netMonthly,
  stampDuty,
} from "./finance.ts";
import { allBoroughs, boroughFacts, getForecast, scenarioDelta } from "./predictions.ts";
import { SCHEDULE, beatFires, buildEvent, canAfford, depositFor } from "./events.ts";
import { CAREERS, NAMES } from "../content/copy.ts";
import {
  BASE_MORTGAGE_RATE,
  FINAL_YEAR,
  MORTGAGE_TERM_MONTHS,
  OWNER_UPKEEP_MONTHLY,
  RATE_FLOOR_PCT,
  REMORTGAGE_DISCOUNT_PP,
  START_YEAR,
  YEARS_SIMULATED,
  clamp,
  livingCostMonthly,
} from "./constants.ts";

// ---------------------------------------------------------------- character

/**
 * London pay, not UK-wide pay. ONS puts median full-time London earnings around
 * 44k, and NHS bands carry inner-London weighting, so UK-average bands would
 * understate every one of these roles.
 */
const CAREER_SALARY: Record<string, [number, number]> = {
  "Junior Developer": [35_000, 50_000],
  Nurse: [33_000, 42_000],
  "Teaching Assistant": [24_000, 28_500],
  Barista: [23_000, 27_000],
  "Account Manager": [35_000, 50_000],
  "Care Worker": [24_000, 29_000],
};
const FALLBACK_SALARY: [number, number] = [28_000, 42_000];

const FAMILY_SUPPORT = ["none", "limited", "strong"] as const;
/**
 * The bank of mum and dad, which is how most London first-time buyers actually
 * get there. These are the numbers that decide whether a life can buy at all.
 */
const FAMILY_GIFT: Record<Circumstances["familySupport"], number> = {
  none: 0,
  limited: 12_000,
  strong: 40_000,
};

export function rollCircumstances(seed: number): Circumstances {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const name = pick(r, NAMES.length ? NAMES : ["Alex"]);
  const spriteId = Math.floor(r() * 3) as 0 | 1 | 2;
  const age = Math.floor(range(r, 24, 35));
  const home = pick(r, allBoroughs());
  const career = pick(r, CAREERS.length ? CAREERS : ["Barista"]);
  const [lo, hi] = CAREER_SALARY[career] ?? FALLBACK_SALARY;
  const salary = round(range(r, lo, hi), 500);
  const familySupport = pickWeighted(r, FAMILY_SUPPORT, [0.45, 0.35, 0.2]);
  const savings = round(range(r, 3_000, 34_000) + FAMILY_GIFT[familySupport], 500);
  const rentMonthly = round(home.avgRent * range(r, 0.68, 1.02), 5);

  return {
    name,
    spriteId,
    age,
    borough: home.code,
    career,
    salary,
    savings,
    rentMonthly,
    familySupport,
  };
}

/** Always length 4: one scenario per year advance, 2026→27, 27→28, 28→29, 29→30. */
export function drawScenarioPath(seed: number): ScenarioId[] {
  const r = mulberry32(seed ^ 0x5f356495);
  const ids: ScenarioId[] = ["base", "rate_shock", "rate_cuts"];
  const path: ScenarioId[] = [];
  for (let i = 0; i < YEARS_SIMULATED; i++) path.push(pickWeighted(r, ids, [0.5, 0.3, 0.2]));
  // A run where nothing ever happens is a bad demo. Guarantee one turn.
  // The `: boolean` matters — without it TS infers a type predicate and
  // narrows `path` to "base"[], which makes the assignment below an error.
  const allQuiet = path.every((s): boolean => s === "base");
  if (allQuiet) path[1] = "rate_shock";
  return path;
}

// ---------------------------------------------------------------- market

/**
 * Draw one realisation from inside the forecast band, seeded.
 *
 * Years 2-4 are scenario-conditioned and compound, so the spread widens. That
 * widening is the honest representation and it is also the best-looking chart
 * in the app — `YearState.outlook` exposes the same widened band to C.
 */
export function realiseMove(r: Rng, fc: Forecast, yearIndex: number): number {
  const u = r();
  const move =
    u < 0.5
      ? fc.p10 + (fc.p50 - fc.p10) * (u / 0.5)
      : fc.p50 + (fc.p90 - fc.p50) * ((u - 0.5) / 0.5);
  const widen = 1 + 0.35 * yearIndex;
  return fc.p50 + (move - fc.p50) * widen;
}

function outlookFor(state: YearState, path: ScenarioId[]): Outlook | undefined {
  const idx = state.year - START_YEAR;
  if (idx < 0 || idx >= path.length) return undefined;
  const fc = getForecast(state.borough, path[idx]);
  const widen = 1 + 0.35 * idx;
  return {
    p10: fc.p50 + (fc.p10 - fc.p50) * widen,
    p50: fc.p50,
    p90: fc.p50 + (fc.p90 - fc.p50) * widen,
    pDecline: fc.p_decline,
  };
}

// ---------------------------------------------------------------- state

const housingMonthly = (s: YearState): number =>
  s.tenure === "owning" ? (s.mortgage?.monthly ?? 0) + OWNER_UPKEEP_MONTHLY : s.rentMonthly;

/**
 * Recompute every derived field. Wellbeing and stress are GAMEPLAY
 * ABSTRACTIONS driven off the housing cost ratio and the cash position — they
 * are not modelled quantities, and D's "what's real" panel says so.
 */
function derive(s: YearState, path: ScenarioId[]): YearState {
  const balance = s.mortgage?.balance ?? 0;
  const equity = s.tenure === "owning" ? s.propertyValue - balance : 0;
  const income = s.netMonthly + (s.lodgerIncomeMonthly ?? 0);
  const housing = housingMonthly(s);
  const housingCostRatio = income > 0 ? clamp(housing / income, 0, 3) : 1;

  const stress = clamp(
    Math.round(
      16 +
        150 * Math.max(0, housingCostRatio - 0.3) +
        (s.cash < 0 ? 20 : 0) +
        (s.tenure === "renting" ? 6 : 0),
    ),
    0,
    100,
  );
  const wellbeing = clamp(
    Math.round(92 - 0.72 * stress + (s.tenure === "owning" ? 6 : 0) + (s.cash > 15_000 ? 4 : 0)),
    0,
    100,
  );

  return {
    ...s,
    equity,
    netWorth: s.cash + equity,
    housingCostRatio,
    stress,
    wellbeing,
    outlook: outlookFor(s, path),
  };
}

function initialState(c: Circumstances, path: ScenarioId[]): YearState {
  return derive(
    {
      year: START_YEAR,
      age: c.age,
      borough: c.borough,
      tenure: "renting",
      cash: c.savings,
      salary: c.salary,
      netMonthly: netMonthly(c.salary),
      rentMonthly: c.rentMonthly,
      mortgage: null,
      propertyValue: 0,
      equity: 0,
      netWorth: c.savings,
      housingCostRatio: 0,
      wellbeing: 70,
      stress: 30,
      scenario: "base",
      marketMove: 0,
      totalRentPaid: 0,
      totalMortgagePaid: 0,
      lodgerIncomeMonthly: 0,
    },
    path,
  );
}

/** One year passes: market moves, the loan amortises and reprices, cash accrues. */
function advanceYear(state: YearState, seed: number, path: ScenarioId[]): YearState {
  const idx = state.year - START_YEAR;
  const scenario: ScenarioId = path[idx] ?? "base";
  const r = yearRng(seed, state.year, 9);
  const marketMove = realiseMove(r, getForecast(state.borough, scenario), idx);

  const lodger = state.lodgerIncomeMonthly ?? 0;
  const cashFlow =
    (state.netMonthly + lodger - housingMonthly(state) - livingCostMonthly(state.netMonthly)) * 12;

  let totalRentPaid = state.totalRentPaid;
  let totalMortgagePaid = state.totalMortgagePaid;
  let mortgage: Mortgage | null = null;

  const owning = state.tenure === "owning";
  const propertyValue = owning ? state.propertyValue * (1 + marketMove) : 0;

  if (owning && state.mortgage) {
    const m = state.mortgage;
    const monthsPaid = Math.min(12, m.monthsRemaining);
    totalMortgagePaid += m.monthly * monthsPaid;
    const balance = balanceAfter(m.balance, m.ratePct, m.monthsRemaining, monthsPaid);
    const monthsRemaining = m.monthsRemaining - monthsPaid;
    // The scenario applies DIRECTLY to the player's rate. This is real
    // arithmetic and it hits hard regardless of what the model says.
    const basePct = m.basePct ?? BASE_MORTGAGE_RATE;
    const ratePct = Math.max(RATE_FLOOR_PCT, basePct + scenarioDelta(scenario));
    mortgage =
      monthsRemaining > 0
        ? {
            balance,
            ratePct,
            basePct,
            monthsRemaining,
            monthly: monthlyPayment(balance, ratePct, monthsRemaining),
          }
        : null;
  } else if (!owning) {
    totalRentPaid += state.rentMonthly * 12;
  }

  const salary = round(state.salary * (1 + range(r, 0.005, 0.045)), 100);
  const rentGrowth = clamp(0.018 + 0.55 * marketMove + range(r, -0.008, 0.014), -0.03, 0.14);

  return derive(
    {
      ...state,
      year: state.year + 1,
      age: state.age + 1,
      cash: state.cash + cashFlow,
      salary,
      netMonthly: netMonthly(salary),
      rentMonthly: owning ? 0 : round(state.rentMonthly * (1 + rentGrowth), 5),
      mortgage,
      propertyValue,
      scenario,
      marketMove,
      totalRentPaid,
      totalMortgagePaid,
    },
    path,
  );
}

/**
 * Apply one decision. Every branch is guarded so no decision can produce an
 * impossible state — buying what you cannot afford or selling what you do not
 * own falls through to doing nothing rather than corrupting the run.
 */
function applyDecision(
  state: YearState,
  d: Decision,
  event: GameEvent,
  path: ScenarioId[],
): YearState {
  const detail = event.detail ?? {};
  const s: YearState = { ...state, mortgage: state.mortgage ? { ...state.mortgage } : null };

  switch (d.kind) {
    case "accept_rent": {
      s.rentMonthly = detail.newRent ?? s.rentMonthly;
      break;
    }
    case "move": {
      const target = boroughFacts(d.borough ?? detail.moveBorough ?? s.borough);
      s.borough = target.code;
      s.rentMonthly = detail.moveRent ?? round(target.avgRent * 0.86, 5);
      s.cash -= MOVING_COST;
      break;
    }
    case "buy": {
      const price = d.price ?? detail.price ?? 0;
      if (price <= 0 || s.tenure === "owning" || !canAfford(state, price)) break;
      const deposit = depositFor(s.cash, price);
      s.cash -= deposit + stampDuty(price, true) + LEGAL_AND_SURVEY + MOVING_COST;
      const basePct = BASE_MORTGAGE_RATE;
      const ratePct = Math.max(RATE_FLOOR_PCT, basePct + scenarioDelta(s.scenario));
      const balance = price - deposit;
      s.mortgage = {
        balance,
        ratePct,
        basePct,
        monthsRemaining: MORTGAGE_TERM_MONTHS,
        monthly: monthlyPayment(balance, ratePct, MORTGAGE_TERM_MONTHS),
      };
      s.borough = d.borough ?? s.borough;
      s.tenure = "owning";
      s.propertyValue = price;
      s.rentMonthly = 0;
      break;
    }
    case "remortgage": {
      if (!s.mortgage) break;
      const basePct = (s.mortgage.basePct ?? BASE_MORTGAGE_RATE) - REMORTGAGE_DISCOUNT_PP;
      const ratePct = Math.max(RATE_FLOOR_PCT, basePct + scenarioDelta(s.scenario));
      s.cash -= REMORTGAGE_FEE;
      s.mortgage = {
        ...s.mortgage,
        basePct,
        ratePct,
        monthly: monthlyPayment(s.mortgage.balance, ratePct, s.mortgage.monthsRemaining),
      };
      break;
    }
    case "sell": {
      if (s.tenure !== "owning") break;
      s.cash += s.propertyValue * (1 - SELLING_COST_RATE) - (s.mortgage?.balance ?? 0);
      s.mortgage = null;
      s.propertyValue = 0;
      s.tenure = "renting";
      s.rentMonthly = round(boroughFacts(s.borough).avgRent * 0.92, 5);
      break;
    }
    case "take_lodger": {
      s.lodgerIncomeMonthly = (s.lodgerIncomeMonthly ?? 0) + (detail.extraIncomeMonthly ?? 0);
      break;
    }
    case "accept_job": {
      s.salary = detail.newSalary ?? s.salary;
      s.netMonthly = netMonthly(s.salary);
      break;
    }
    case "wait": {
      // Pushing back on a rent rise buys you a compromise, not a cancellation.
      // Without this, waiting is a free win and the buy decision never costs
      // anything to skip.
      if (event.kind === "rent_increase" && detail.newRent && detail.oldRent) {
        s.rentMonthly = round((detail.oldRent + detail.newRent) / 2, 5);
      }
      break;
    }
  }

  return derive(s, path);
}

// ---------------------------------------------------------------- the API C calls

/**
 * The whole integration. C holds the decision log in React state, appends to
 * it, and calls this again. Recomputing the entire run every render is cheap
 * and is what makes the counterfactual one line of code.
 */
export function simulate(seed: number, path: ScenarioId[], decisions: Decision[]): RunState {
  const circumstances = rollCircumstances(seed);
  const log: Decision[] = decisions.map((d) => ({ ...d }));
  const years: YearState[] = [];
  const applied: Decision[] = [];
  let state = initialState(circumstances, path);
  let di = 0;

  for (const beat of SCHEDULE) {
    while (state.year < beat.year) {
      years.push(state);
      state = advanceYear(state, seed, path);
    }

    if (!beatFires(beat, state, applied, state.scenario, seed)) continue;
    const event = buildEvent(beat, state, applied, state.scenario, seed);

    if (di >= log.length) {
      return { circumstances, years, current: state, pending: event, finished: false, log };
    }

    const decision = log[di++];
    applied.push(decision);
    state = applyDecision(state, decision, event, path);
  }

  while (state.year < FINAL_YEAR) {
    years.push(state);
    state = advanceYear(state, seed, path);
  }
  years.push(state);

  return { circumstances, years, current: state, pending: null, finished: true, log };
}

/**
 * The same future, a different decision. Because `simulate` is pure, this is
 * genuinely one line — and the three endings below are all drawn against an
 * identical market, so the difference is entirely down to the choice.
 */
export function counterfactual(
  seed: number,
  path: ScenarioId[],
  decisions: Decision[],
  swap: (d: Decision) => Decision,
): RunState {
  return simulate(seed, path, decisions.map(swap));
}
