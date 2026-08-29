/**
 * The six event families. OWNER: [B].
 *
 * Data-driven on purpose: every string comes from D's `copy.ts` with an engine
 * fallback, so D can rewrite the copy without touching this logic. Each beat
 * carries a `gate` — miss one and you get the "sell the house you do not have"
 * bug that surfaces at 17:32.
 *
 * Every number shown to the player is also stashed on `event.detail`, so
 * applying the decision uses exactly what was on screen.
 */

import type {
  Decision,
  EventChoice,
  EventFact,
  EventKind,
  GameEvent,
  NpcId,
  ScenarioId,
  YearState,
} from "./types.ts";
import { EVENT_COPY } from "../content/copy.ts";
import { allBoroughs, boroughFacts, scenarioDelta, scenarioLabel } from "./predictions.ts";
import { range, round, yearRng } from "./rng.ts";
import type { Rng } from "./rng.ts";
import {
  DEPOSIT_BUFFER,
  LEGAL_AND_SURVEY,
  MAX_LTI,
  MIN_DEPOSIT,
  MOVING_COST,
  REMORTGAGE_FEE,
  maxAffordable,
  monthlyPayment,
  stampDuty,
} from "./finance.ts";
import {
  BASE_MORTGAGE_RATE,
  MORTGAGE_TERM_MONTHS,
  REMORTGAGE_DISCOUNT_PP,
  gbp,
  pct,
} from "./constants.ts";

export interface BeatContext {
  state: YearState;
  /** Decisions already applied, in order. */
  log: Decision[];
  /** Scenario governing the year this beat sits in. */
  scenario: ScenarioId;
  rng: Rng;
}

export interface Beat {
  year: number;
  kind: EventKind;
  npc: NpcId;
  /** Separates rng streams for two beats in the same year. */
  stream: number;
  gate: (ctx: BeatContext) => boolean;
  build: (ctx: BeatContext) => GameEvent;
}

const copyFor = (kind: EventKind, fallback: { headline: string; body: string }) =>
  EVENT_COPY[kind] ?? fallback;

/**
 * Deposit this player could actually put down on `price`.
 *
 * They put in everything above the emergency buffer, up to 35% — a big deposit
 * is the only way a single London income clears the 4.5x lending cap, which is
 * exactly why the bank of mum and dad matters so much in this game.
 */
export function depositFor(cash: number, price: number): number {
  const available = Math.max(0, cash - DEPOSIT_BUFFER);
  return Math.min(available, price * 0.5);
}

/** Total cash needed at completion: deposit, stamp duty, legals, moving. */
export function cashNeededToBuy(cash: number, price: number, firstTimeBuyer: boolean): number {
  return depositFor(cash, price) + stampDuty(price, firstTimeBuyer) + LEGAL_AND_SURVEY + MOVING_COST;
}

export function canAfford(state: YearState, price: number): boolean {
  const deposit = depositFor(state.cash, price);
  if (deposit < price * MIN_DEPOSIT) return false;
  if (price - deposit > state.salary * MAX_LTI) return false;
  return state.cash >= cashNeededToBuy(state.cash, price, true);
}

const lastDecision = (log: Decision[]): Decision | undefined => log[log.length - 1];

// ---------------------------------------------------------------- beats

const rentIncrease = (year: number, stream: number): Beat => ({
  year,
  kind: "rent_increase",
  npc: "landlord",
  stream,
  gate: (ctx) => ctx.state.tenure === "renting",
  build: ({ state, rng }) => {
    const hike = range(rng, 0.05, 0.14);
    const newRent = round(state.rentMonthly * (1 + hike), 5);
    const cheaper = allBoroughs()
      .filter((b) => b.code !== state.borough)
      .sort((a, b) => a.avgRent - b.avgRent)[0];
    const moveRent = round(cheaper.avgRent * 0.86, 5);
    const copy = copyFor("rent_increase", {
      headline: "Your landlord is raising the rent",
      body: "The tenancy is up for renewal and the new figure is on the table.",
    });

    const facts: EventFact[] = [
      { label: "Rent", before: gbp(state.rentMonthly) + "/mo", after: gbp(newRent) + "/mo" },
      {
        label: "Increase",
        value: "+" + pct(hike) + " (" + gbp(newRent - state.rentMonthly) + "/mo)",
      },
      {
        label: "Share of take-home",
        before: pct(state.rentMonthly / state.netMonthly, 0),
        after: pct(newRent / state.netMonthly, 0),
      },
      { label: "Cheapest move", value: cheaper.name + ", about " + gbp(moveRent) + "/mo" },
    ];

    const choices: EventChoice[] = [
      { kind: "accept_rent", label: "Sign for " + gbp(newRent) + " a month" },
      { kind: "move", label: "Move to " + cheaper.name, borough: cheaper.code },
      { kind: "wait", label: "Push back and stay on the old rent for now" },
    ];

    return {
      id: "rent_increase_" + year,
      kind: "rent_increase",
      npc: "landlord",
      year,
      headline: copy.headline,
      body: copy.body,
      facts,
      choices,
      detail: { oldRent: state.rentMonthly, newRent, moveBorough: cheaper.code, moveRent },
    };
  },
});

const buyOpportunity: Beat = {
  year: 2026,
  kind: "buy_opportunity",
  npc: "estate_agent",
  stream: 2,
  // Only fires if they did not just sign a new tenancy, and only while renting.
  gate: ({ state, log }) => {
    const last = lastDecision(log);
    return state.tenure === "renting" && !!last && (last.kind === "wait" || last.kind === "move");
  },
  build: ({ state, rng, scenario }) => {
    const home = boroughFacts(state.borough);
    // A first flat sits well below the borough average, which is dragged up by
    // houses. 66-86% of the average is roughly the one/two-bed flat market.
    const price = round(home.avgPrice * range(rng, 0.66, 0.86), 1000);
    const budget = maxAffordable(state.salary, state.cash);
    const deposit = depositFor(state.cash, price);
    const duty = stampDuty(price, true);
    const rate = BASE_MORTGAGE_RATE + scenarioDelta(scenario);
    const monthly = monthlyPayment(price - deposit, rate, MORTGAGE_TERM_MONTHS);
    const copy = copyFor("buy_opportunity", {
      headline: "A flat has come on the market",
      body: "Two bedrooms, ten minutes from the station, and the agent is keen.",
    });

    const affordable = canAfford(state, price);

    // If the local flat is out of reach, the agent has one in a cheaper borough.
    const fallback = allBoroughs()
      .filter((b) => b.code !== state.borough)
      .map((b) => ({ b, p: round(b.avgPrice * 0.55, 1000) }))
      .filter((x) => canAfford(state, x.p))
      .sort((x, y) => y.p - x.p)[0];

    const facts: EventFact[] = [
      { label: "Asking price", value: gbp(price) },
      { label: "Your budget", value: gbp(budget) },
      {
        label: "Deposit you could put down",
        value: gbp(deposit) + " (" + pct(deposit / price, 0) + ")",
      },
      { label: "Stamp duty, first-time buyer", value: duty === 0 ? "£0" : gbp(duty) },
      { label: "Monthly", before: gbp(state.rentMonthly) + " rent", after: gbp(monthly) + " mortgage" },
      { label: "Rate", value: rate.toFixed(2) + "% · " + scenarioLabel(scenario) },
    ];

    const choices: EventChoice[] = [];
    if (affordable) {
      choices.push({
        kind: "buy",
        label: "Buy in " + home.name + " for " + gbp(price),
        borough: state.borough,
        price,
      });
    }
    if (fallback) {
      choices.push({
        kind: "buy",
        label: "Buy in " + fallback.b.name + " for " + gbp(fallback.p) + " instead",
        borough: fallback.b.code,
        price: fallback.p,
      });
    }
    choices.push({
      kind: "wait",
      label: affordable ? "Not yet — keep saving" : "Out of reach. Keep renting.",
    });

    return {
      id: "buy_opportunity_2026",
      kind: "buy_opportunity",
      npc: "estate_agent",
      year: 2026,
      headline: copy.headline,
      body: copy.body,
      facts,
      choices,
      detail: { price, deposit, stampDuty: duty, budget, newRate: rate, newMonthly: monthly },
    };
  },
};

const rateChange: Beat = {
  year: 2027,
  kind: "rate_change",
  npc: "bank",
  stream: 1,
  gate: ({ state }) => state.tenure === "owning" && state.mortgage !== null,
  build: ({ state, scenario }) => {
    const m = state.mortgage as NonNullable<YearState["mortgage"]>;
    const base = m.basePct ?? BASE_MORTGAGE_RATE;
    const newRate = base + scenarioDelta(scenario);
    const newMonthly = monthlyPayment(m.balance, newRate, m.monthsRemaining);
    const betterRate = base - REMORTGAGE_DISCOUNT_PP + scenarioDelta(scenario);
    const copy = copyFor("rate_change", {
      headline: "Your lender has written to you",
      body: "Borrowing costs have moved and your payment moves with them.",
    });

    const facts: EventFact[] = [
      { label: "Scenario", value: scenarioLabel(scenario) },
      { label: "Rate", before: m.ratePct.toFixed(2) + "%", after: newRate.toFixed(2) + "%" },
      { label: "Monthly payment", before: gbp(m.monthly) + "/mo", after: gbp(newMonthly) + "/mo" },
      {
        label: "Change",
        value:
          (newMonthly >= m.monthly ? "+" : "-") +
          gbp(Math.abs(newMonthly - m.monthly)) +
          " a month",
      },
      { label: "Balance outstanding", value: gbp(m.balance) },
    ];

    const choices: EventChoice[] = [
      { kind: "wait", label: "Accept the new payment" },
      {
        kind: "remortgage",
        label: "Remortgage at " + betterRate.toFixed(2) + "% (" + gbp(REMORTGAGE_FEE) + " fee)",
      },
    ];

    return {
      id: "rate_change_2027",
      kind: "rate_change",
      npc: "bank",
      year: 2027,
      headline: copy.headline,
      body: copy.body,
      facts,
      choices,
      detail: { oldRate: m.ratePct, newRate, oldMonthly: m.monthly, newMonthly },
    };
  },
};

const household: Beat = {
  year: 2028,
  kind: "household",
  npc: "partner",
  stream: 1,
  gate: () => true,
  build: ({ state, rng }) => {
    const partnerSalary = round(range(rng, 24_000, 46_000), 500);
    const contribution = round((partnerSalary / 12) * 0.42, 10);
    const copy = copyFor("household", {
      headline: "Your partner wants to move in",
      body: "Two incomes, one kitchen. It changes what you can afford and what you owe.",
    });
    const housing = state.tenure === "owning" ? state.mortgage?.monthly ?? 0 : state.rentMonthly;

    const facts: EventFact[] = [
      { label: "Their salary", value: gbp(partnerSalary) + " a year" },
      { label: "Towards the bills", value: gbp(contribution) + " a month" },
      {
        label: "Your housing cost share",
        before: pct(housing / state.netMonthly, 0),
        after: pct(housing / (state.netMonthly + contribution), 0),
      },
      { label: "Household", before: "1 income", after: "2 incomes" },
    ];

    const choices: EventChoice[] = [
      { kind: "take_lodger", label: "They move in" },
      { kind: "wait", label: "Not yet — keep things as they are" },
    ];

    return {
      id: "household_2028",
      kind: "household",
      npc: "partner",
      year: 2028,
      headline: copy.headline,
      body: copy.body,
      facts,
      choices,
      detail: { extraIncomeMonthly: contribution },
    };
  },
};

const employment: Beat = {
  year: 2029,
  kind: "employment",
  npc: "employer",
  stream: 1,
  gate: () => true,
  build: ({ state, rng }) => {
    const uplift = range(rng, 0.12, 0.28);
    const newSalary = round(state.salary * (1 + uplift), 500);
    const commute = round(range(rng, 90, 220), 5);
    const copy = copyFor("employment", {
      headline: "You have been offered a new role",
      body: "More money, longer commute, and a probation period you would rather not think about.",
    });

    const facts: EventFact[] = [
      { label: "Salary", before: gbp(state.salary), after: gbp(newSalary) },
      { label: "Uplift", value: "+" + pct(uplift, 0) },
      { label: "Extra commuting", value: gbp(commute) + " a month" },
      { label: "Probation", value: "6 months" },
    ];

    const choices: EventChoice[] = [
      { kind: "accept_job", label: "Take the job at " + gbp(newSalary) },
      { kind: "wait", label: "Stay where you are" },
    ];

    return {
      id: "employment_2029",
      kind: "employment",
      npc: "employer",
      year: 2029,
      headline: copy.headline,
      body: copy.body,
      facts,
      choices,
      detail: { newSalary },
    };
  },
};

const mortgageReset: Beat = {
  year: 2029,
  kind: "mortgage_reset",
  npc: "bank",
  stream: 2,
  // Never offer "sell" to somebody who does not own.
  gate: ({ state }) => state.tenure === "owning" && state.mortgage !== null,
  build: ({ state, scenario, rng }) => {
    const m = state.mortgage as NonNullable<YearState["mortgage"]>;
    const base = m.basePct ?? BASE_MORTGAGE_RATE;
    const svr = base + 1.4 + scenarioDelta(scenario);
    const svrMonthly = monthlyPayment(m.balance, svr, m.monthsRemaining);
    const fixedRate = base - REMORTGAGE_DISCOUNT_PP + scenarioDelta(scenario);
    const fixedMonthly = monthlyPayment(m.balance, fixedRate, m.monthsRemaining);
    const lodger = round(range(rng, 620, 890), 10);
    const equity = Math.max(0, state.propertyValue - m.balance);
    const copy = copyFor("mortgage_reset", {
      headline: "Your fixed rate is ending",
      body: "The introductory rate rolls off and the lender wants to know your plan.",
    });

    const facts: EventFact[] = [
      { label: "If you do nothing", value: svr.toFixed(2) + "% · " + gbp(svrMonthly) + "/mo" },
      { label: "New fixed rate", value: fixedRate.toFixed(2) + "% · " + gbp(fixedMonthly) + "/mo" },
      { label: "Balance", value: gbp(m.balance) },
      { label: "Equity in the flat", value: gbp(equity) },
      { label: "A lodger would bring in", value: gbp(lodger) + " a month" },
    ];

    const choices: EventChoice[] = [
      {
        kind: "remortgage",
        label: "Fix at " + fixedRate.toFixed(2) + "% (" + gbp(REMORTGAGE_FEE) + " fee)",
      },
      { kind: "take_lodger", label: "Take a lodger at " + gbp(lodger) + " a month" },
      { kind: "sell", label: "Sell and go back to renting" },
    ];

    return {
      id: "mortgage_reset_2029",
      kind: "mortgage_reset",
      npc: "bank",
      year: 2029,
      headline: copy.headline,
      body: copy.body,
      facts,
      choices,
      detail: {
        oldRate: m.ratePct,
        newRate: fixedRate,
        oldMonthly: m.monthly,
        newMonthly: fixedMonthly,
        extraIncomeMonthly: lodger,
      },
    };
  },
};

/**
 * The run, in order. A beat whose gate is closed is skipped silently and
 * consumes no decision.
 *
 * 2027 has two mutually exclusive beats: owners hear from the bank, renters
 * get another letter from the landlord.
 */
export const SCHEDULE: Beat[] = [
  rentIncrease(2026, 1),
  buyOpportunity,
  rateChange,
  rentIncrease(2027, 3),
  household,
  employment,
  mortgageReset,
];

function beatContext(
  beat: Beat,
  state: YearState,
  log: Decision[],
  scenario: ScenarioId,
  seed: number,
): BeatContext {
  return { state, log, scenario, rng: yearRng(seed, beat.year, beat.stream) };
}

/** Does this beat fire, given where the player has got to? */
export function beatFires(
  beat: Beat,
  state: YearState,
  log: Decision[],
  scenario: ScenarioId,
  seed: number,
): boolean {
  return beat.gate(beatContext(beat, state, log, scenario, seed));
}

/** Build the event for a beat, on the beat's own seeded stream. */
export function buildEvent(
  beat: Beat,
  state: YearState,
  log: Decision[],
  scenario: ScenarioId,
  seed: number,
): GameEvent {
  return beat.build(beatContext(beat, state, log, scenario, seed));
}
