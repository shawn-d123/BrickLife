/**
 * Engine tests. OWNER: [B]. Run with `npm test` (no install needed — Node 24
 * strips the types itself).
 *
 * Covers the definition of done from PRIMER-B:
 *   - four finance assertions
 *   - the purity check
 *   - no Math.random / Date.now / mutation anywhere in engine/
 *   - all five years run without a decision producing an impossible state
 *   - the counterfactual gives three different net worths on the same future
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { counterfactual, drawScenarioPath, rollCircumstances, simulate } from "./sim.ts";
import { balanceAfter, monthlyPayment, netMonthly, stampDuty, maxAffordable } from "./finance.ts";
import { allBoroughs, boroughCodes, boroughFacts, getForecast, isStub, scenarioDelta, SCENARIO_IDS } from "./predictions.ts";
import { FINAL_YEAR, START_YEAR, gbp } from "./constants.ts";
import type { Decision, GameEvent, RunState, ScenarioId } from "./types.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("  ok  " + name);
}
const near = (a: number, b: number, tol: number, what: string) =>
  assert.ok(Math.abs(a - b) <= tol, what + ": expected ~" + b + ", got " + a);

// ---------------------------------------------------------------- finance

console.log("\nfinance");

test("a 283,500 mortgage at 4.75% over 25 years is about 1,616 a month", () => {
  near(monthlyPayment(283_500, 4.75, 300), 1616, 5, "monthlyPayment");
});

test("a rate shock of 1.5pp on that balance costs about 250 a month", () => {
  const before = monthlyPayment(283_500, 4.75, 300);
  const after = monthlyPayment(283_500, 6.25, 300);
  near(after - before, 253, 15, "rate shock delta");
});

test("the balance amortises to zero over the full term", () => {
  near(balanceAfter(283_500, 4.75, 300, 300), 0, 1, "balance at term");
  assert.ok(balanceAfter(283_500, 4.75, 300, 12) < 283_500, "balance must fall in year one");
  // Early payments are mostly interest: under 2.2% of the balance repaid in year one.
  const repaidYearOne = 283_500 - balanceAfter(283_500, 4.75, 300, 12);
  assert.ok(repaidYearOne / 283_500 < 0.022, "year-one principal repaid should be small");
});

test("stamp duty matches the England residential bands", () => {
  assert.equal(stampDuty(450_000, true), 7_500); // FTB: 5% on 300k-500k
  assert.equal(stampDuty(450_000, false), 12_500); // 2% on 125-250k + 5% on 250-450k
  assert.equal(stampDuty(300_000, true), 0); // FTB relief in full
  assert.equal(stampDuty(120_000, false), 0); // below the nil-rate threshold
  assert.equal(stampDuty(600_000, true), stampDuty(600_000, false)); // no FTB relief above 500k
});

test("net pay lands in the right place for a basic-rate salary", () => {
  near(netMonthly(35_000) * 12, 28_720, 60, "net annual on 35k");
  assert.ok(netMonthly(12_000) * 12 === 12_000, "no tax below the personal allowance");
  assert.ok(netMonthly(60_000) > netMonthly(50_000), "net pay must rise with gross");
});

test("affordability is capped by both the income multiple and the deposit", () => {
  // Ordinary case: 4.5x income plus the deposit binds. 35k + 20k usable.
  assert.equal(maxAffordable(35_000, 25_000), 177_500);
  // High earner, thin deposit: the 10% minimum deposit binds instead.
  assert.equal(maxAffordable(100_000, 25_000), 200_000);
  // Fat deposit: back to the income multiple.
  assert.equal(maxAffordable(35_000, 205_000), 357_500);
});

// ------------------------------------------------- predictions.json contract
// This section doubles as a validator for A's real export. When the 15:00 swap
// lands, `npm test` tells you immediately whether it is usable.

console.log("");
console.log("predictions.json (" + (isStub() ? "D's stub" : "A's real export") + ")");

test("every borough exposes a usable, ordered forecast under every scenario", () => {
  const codes = boroughCodes();
  assert.ok(codes.length >= 6, "need at least 6 boroughs for the MVP, got " + codes.length);
  for (const code of codes) {
    for (const scenario of SCENARIO_IDS) {
      const f = getForecast(code, scenario);
      for (const [k, v] of Object.entries(f)) {
        assert.ok(Number.isFinite(v), code + "/" + scenario + ": " + k + " is not a number");
      }
      assert.ok(f.p10 <= f.p50 && f.p50 <= f.p90, code + "/" + scenario + ": quantiles cross");
      assert.ok(f.p_decline >= 0 && f.p_decline <= 1, code + "/" + scenario + ": p_decline out of 0-1");
      // Growth figures are FRACTIONS, not percentages. 0.018 is 1.8%.
      assert.ok(Math.abs(f.p50) < 1, code + "/" + scenario + ": p50 looks like a percentage, not a fraction");
    }
  }
});

test("every borough has a usable name, price and rent", () => {
  for (const b of allBoroughs()) {
    assert.ok(b.name && b.name.length > 0, b.code + ": no name");
    assert.ok(Number.isFinite(b.avgPrice) && b.avgPrice > 0, b.code + ": bad avg_price");
    assert.ok(Number.isFinite(b.avgRent) && b.avgRent > 0, b.code + ": bad avg_rent_monthly");
  }
  // An unknown code must degrade, never throw or return NaN.
  const unknown = boroughFacts("E09999999");
  assert.ok(Number.isFinite(unknown.avgPrice) && unknown.avgPrice > 0, "unknown borough gave a bad price");
});

test("the scenario rate deltas are present and point the right way", () => {
  assert.equal(scenarioDelta("base"), 0, "base must not move the rate");
  assert.ok(scenarioDelta("rate_shock") > 0, "rate_shock must raise the rate");
  assert.ok(scenarioDelta("rate_cuts") < 0, "rate_cuts must lower the rate");
});

// ---------------------------------------------------------------- purity

console.log("\npurity");

const PATH_1 = drawScenarioPath(1);

test("drawScenarioPath returns four scenarios and never an all-quiet run", () => {
  assert.equal(PATH_1.length, FINAL_YEAR - START_YEAR);
  for (let seed = 1; seed <= 200; seed++) {
    const p = drawScenarioPath(seed);
    assert.equal(p.length, 4);
    assert.ok(p.some((s) => s !== "base"), "seed " + seed + " produced an all-base path");
    assert.deepEqual(p, drawScenarioPath(seed), "path must be stable for a seed");
  }
});

test("simulate(1, path, []) is byte-identical on a rerun", () => {
  const a = JSON.stringify(simulate(1, PATH_1, []));
  const b = JSON.stringify(simulate(1, PATH_1, []));
  assert.equal(a, b);
});

test("a finished run is byte-identical on a rerun", () => {
  for (const seed of [1, 7, 42, 99, 1234]) {
    const path = drawScenarioPath(seed);
    const run = autoplay(seed, path, firstChoice);
    const a = JSON.stringify(simulate(seed, path, run.log));
    const b = JSON.stringify(simulate(seed, path, run.log));
    assert.equal(a, b, "seed " + seed + " is not reproducible");
  }
});

test("simulate does not mutate its arguments", () => {
  const path: ScenarioId[] = [...PATH_1];
  const decisions: Decision[] = [{ year: 2026, kind: "wait" }];
  const pathCopy = JSON.stringify(path);
  const decisionsCopy = JSON.stringify(decisions);
  simulate(1, path, decisions);
  assert.equal(JSON.stringify(path), pathCopy, "path was mutated");
  assert.equal(JSON.stringify(decisions), decisionsCopy, "decisions were mutated");
});

test("no Math.random, Date.now or localStorage anywhere in engine/", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const banned = ["Math.random", "Date.now", "localStorage", "sessionStorage"];
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const file of readdirSync(here).filter((f) => f.endsWith(".ts") && f !== "sim.test.ts")) {
    const src = stripComments(readFileSync(join(here, file), "utf8"));
    for (const needle of banned) {
      assert.ok(!src.includes(needle), file + " contains " + needle);
    }
  }
});

// ---------------------------------------------------------------- playthrough

console.log("\nplaythrough");

// Function declarations, not consts: the purity tests above call these.
function firstChoice(e: GameEvent) {
  return e.choices[0];
}
function lastChoice(e: GameEvent) {
  return e.choices[e.choices.length - 1];
}
function buyIfPossible(e: GameEvent) {
  // "wait" on the rent increase is what opens the buy_opportunity gate.
  return (
    e.choices.find((c) => c.kind === "buy") ??
    e.choices.find((c) => c.kind === "wait") ??
    e.choices[0]
  );
}

function autoplay(seed: number, path: ScenarioId[], chooser: (e: GameEvent) => GameEvent["choices"][number]): RunState {
  let decisions: Decision[] = [];
  let run = simulate(seed, path, decisions);
  let guard = 0;
  while (!run.finished) {
    assert.ok(guard++ < 24, "run did not terminate for seed " + seed);
    const event = run.pending;
    assert.ok(event, "an unfinished run must have a pending event");
    assert.ok(event.choices.length > 0, event.id + " offered no choices");
    const choice = chooser(event);
    decisions = [
      ...decisions,
      { year: run.current.year, kind: choice.kind, borough: choice.borough, price: choice.price },
    ];
    run = simulate(seed, path, decisions);
  }
  return run;
}

function assertSane(run: RunState, label: string) {
  const finite = (n: number, what: string) =>
    assert.ok(Number.isFinite(n), label + ": " + what + " is not finite (" + n + ")");

  assert.equal(run.years[0].year, START_YEAR, label + ": first year must be " + START_YEAR);
  assert.equal(run.current.year, FINAL_YEAR, label + ": run must end in " + FINAL_YEAR);
  assert.equal(run.years.length, 5, label + ": five year states expected");
  assert.equal(run.pending, null, label + ": a finished run has no pending event");

  for (const y of run.years) {
    finite(y.cash, "cash");
    finite(y.netWorth, "netWorth");
    finite(y.housingCostRatio, "housingCostRatio");
    assert.ok(y.salary > 0, label + " " + y.year + ": salary must be positive");
    assert.ok(y.netMonthly > 0, label + " " + y.year + ": net pay must be positive");
    assert.ok(y.wellbeing >= 0 && y.wellbeing <= 100, label + " " + y.year + ": wellbeing out of range");
    assert.ok(y.stress >= 0 && y.stress <= 100, label + " " + y.year + ": stress out of range");

    if (y.tenure === "renting") {
      assert.equal(y.mortgage, null, label + " " + y.year + ": a renter cannot hold a mortgage");
      assert.equal(y.propertyValue, 0, label + " " + y.year + ": a renter cannot own property");
      assert.equal(y.equity, 0, label + " " + y.year + ": a renter has no equity");
      assert.ok(y.rentMonthly > 0, label + " " + y.year + ": a renter must pay rent");
    } else {
      assert.equal(y.rentMonthly, 0, label + " " + y.year + ": an owner pays no rent");
      assert.ok(y.propertyValue > 0, label + " " + y.year + ": an owner must own something");
      if (y.mortgage) {
        assert.ok(y.mortgage.balance >= 0, label + " " + y.year + ": negative mortgage balance");
        assert.ok(y.mortgage.monthsRemaining > 0, label + " " + y.year + ": stale mortgage term");
        assert.ok(y.mortgage.ratePct > 0, label + " " + y.year + ": non-positive rate");
        finite(y.mortgage.monthly, "mortgage.monthly");
      }
    }
    near(y.netWorth, y.cash + y.equity, 0.01, label + " " + y.year + ": netWorth");
  }
}

test("every seed plays all five years without an impossible state", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const path = drawScenarioPath(seed);
    for (const [name, chooser] of [
      ["first", firstChoice],
      ["last", lastChoice],
      ["buy", buyIfPossible],
    ] as const) {
      assertSane(autoplay(seed, path, chooser), "seed " + seed + "/" + name);
    }
  }
});

test("a mortgage_reset is never offered to somebody who does not own", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const path = drawScenarioPath(seed);
    let decisions: Decision[] = [];
    let run = simulate(seed, path, decisions);
    while (!run.finished) {
      const event = run.pending as GameEvent;
      if (event.kind === "mortgage_reset" || event.kind === "rate_change") {
        assert.equal(run.current.tenure, "owning", event.id + " fired for a renter (seed " + seed + ")");
        assert.ok(run.current.mortgage, event.id + " fired without a mortgage (seed " + seed + ")");
      }
      if (event.kind === "rent_increase") {
        assert.equal(run.current.tenure, "renting", event.id + " fired for an owner (seed " + seed + ")");
      }
      const choice = lastChoice(event);
      decisions = [
        ...decisions,
        { year: run.current.year, kind: choice.kind, borough: choice.borough, price: choice.price },
      ];
      run = simulate(seed, path, decisions);
    }
  }
});

test("a buyer really does end up owning, and rate shocks reach their payment", () => {
  const owners = [];
  for (let seed = 1; seed <= 60; seed++) {
    const run = autoplay(seed, drawScenarioPath(seed), buyIfPossible);
    if (run.years.some((y) => y.tenure === "owning")) owners.push(seed);
  }
  // Neither impossible nor trivial. On the current numbers roughly a quarter of
  // generated lives can buy anything at all, and nearly all of those have
  // family money behind them — which is the finding, not a bug.
  assert.ok(owners.length >= 5, "only " + owners.length + " of 60 seeds could ever buy");
  assert.ok(owners.length <= 50, owners.length + " of 60 seeds could buy — too easy to be honest");
  console.log("       (" + owners.length + " of 60 lives could buy at all)");

  const seed = owners[0];
  const path = drawScenarioPath(seed);
  const run = autoplay(seed, path, buyIfPossible);
  const owned = run.years.filter((y) => y.mortgage);
  assert.ok(owned.length >= 2, "expected at least two mortgaged years");
  const rates = new Set(owned.map((y) => y.mortgage!.ratePct.toFixed(2)));
  assert.ok(
    rates.size > 1 || path.every((s) => s === "base"),
    "the scenario never reached the player's rate",
  );
});

// ---------------------------------------------------------------- counterfactual

console.log("\ncounterfactual");

test("three endings against the same future give three different net worths", () => {
  let found = 0;
  for (let seed = 1; seed <= 60 && found < 5; seed++) {
    const path = drawScenarioPath(seed);
    const played = autoplay(seed, path, buyIfPossible);
    if (!played.log.some((d) => d.kind === "buy")) continue;
    found++;

    const asPlayed = simulate(seed, path, played.log);
    const ifWaited = counterfactual(seed, path, played.log, (d) =>
      d.kind === "buy" ? { ...d, kind: "wait" } : d,
    );
    // Swap to a borough they did NOT buy in — swapping to the one they already
    // chose is a no-op, which is correct behaviour and a useless comparison.
    const bought = played.log.find((d) => d.kind === "buy");
    const elsewhere = bought?.borough === "E09000002" ? "E09000012" : "E09000002";
    const ifMoved = counterfactual(seed, path, played.log, (d) =>
      d.kind === "buy" ? { ...d, borough: elsewhere } : d,
    );

    assert.notEqual(
      Math.round(asPlayed.current.netWorth),
      Math.round(ifWaited.current.netWorth),
      "seed " + seed + ": waiting produced the same net worth as buying",
    );
    assert.notEqual(
      Math.round(asPlayed.current.netWorth),
      Math.round(ifMoved.current.netWorth),
      "seed " + seed + ": moving produced the same net worth as buying",
    );
    // Same future, so the market path itself must be untouched.
    //
    // Compared over the years the two runs share, not their full length: since
    // the schedule gives renters their own beats, swapping a purchase for a
    // wait puts the alternate life on the renter branch, which has more events
    // than were played. `counterfactual()` then runs out of decisions and stops
    // early. That is a property of this helper, not a divergence in the market
    // -- the screen uses game/alternates.ts, which replays event by event and
    // always reaches 2030.
    const shared = Math.min(asPlayed.years.length, ifWaited.years.length);
    assert.ok(shared > 0, "seed " + seed + ": the counterfactual produced no years");
    assert.deepEqual(
      asPlayed.years.slice(0, shared).map((y) => y.scenario),
      ifWaited.years.slice(0, shared).map((y) => y.scenario),
      "seed " + seed + ": the counterfactual changed the scenario path",
    );
  }
  assert.ok(found > 0, "no seed in 1..60 produced a buy decision");
});

// ---------------------------------------------------------------- demo output

const demoSeed = 42;
const demoPath = drawScenarioPath(demoSeed);
const demoRun = autoplay(demoSeed, demoPath, buyIfPossible);
const c = rollCircumstances(demoSeed);

console.log("\n--- seed " + demoSeed + " -----------------------------------------");
console.log(c.name + ", " + c.age + ", " + c.career + " on " + gbp(c.salary));
console.log("scenario path: " + demoPath.join(" -> "));
console.log("predictions.json is_stub: " + isStub());
for (const y of demoRun.years) {
  console.log(
    "  " +
      y.year +
      "  " +
      y.tenure.padEnd(7) +
      "  market " +
      (y.marketMove * 100).toFixed(1).padStart(5) +
      "%  housing " +
      (y.housingCostRatio * 100).toFixed(0).padStart(3) +
      "%  net worth " +
      gbp(y.netWorth).padStart(10),
  );
}
const ifWaited = counterfactual(demoSeed, demoPath, demoRun.log, (d) =>
  d.kind === "buy" ? { ...d, kind: "wait" } : d,
);
console.log("as played: " + gbp(demoRun.current.netWorth) + "   if they had waited: " + gbp(ifWaited.current.netWorth));

console.log("\n" + passed + " tests passed.\n");
