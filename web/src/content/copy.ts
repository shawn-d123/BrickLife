// PLACEHOLDER written by [B] at 12:35 so the engine has event text to attach.
// Shape is exactly 00-CONTRACTS.md section 4. [D] owns this file — overwrite
// freely. The engine falls back to its own text for any missing key, so D can
// rewrite every string here without touching engine logic.

import type { ScenarioId } from "../engine/types.ts";

export const EVENT_COPY: Record<string, { headline: string; body: string }> = {
  rent_increase: {
    headline: "Your landlord is raising the rent",
    body: "The tenancy is up for renewal and the new figure is on the table.",
  },
  buy_opportunity: {
    headline: "A flat has come on the market",
    body: "Two bedrooms, ten minutes from the station, and the agent is keen.",
  },
  rate_change: {
    headline: "Your lender has written to you",
    body: "Borrowing costs have moved and your payment moves with them.",
  },
  household: {
    headline: "Your partner wants to move in",
    body: "Two incomes, one kitchen. It changes what you can afford and what you owe.",
  },
  employment: {
    headline: "You have been offered a new role",
    body: "More money, longer commute, and a probation period you would rather not think about.",
  },
  mortgage_reset: {
    headline: "Your fixed rate is ending",
    body: "The introductory rate rolls off and the lender wants to know your plan.",
  },
};

export const SCENARIO_COPY: Record<ScenarioId, { title: string; line: string }> = {
  base: { title: "Steady as she goes", line: "Nothing much changes. Which is its own kind of news." },
  rate_shock: { title: "Rates stay high", line: "Borrowing costs hold above expectations for another year." },
  rate_cuts: { title: "Borrowing eases", line: "Rates fall faster than forecasters expected." },
};

export const CAREERS = [
  "Junior Developer",
  "Nurse",
  "Teaching Assistant",
  "Barista",
  "Account Manager",
  "Care Worker",
];

// [B] added: the engine needs names to roll a character. D can replace the list.
export const NAMES = [
  "Amara", "Ravi", "Sinead", "Tomasz", "Nadia", "Kofi",
  "Elif", "Danny", "Priya", "Marcus", "Yusuf", "Chloe",
];
