// Does the "What if?" screen ever show a column identical to the played run?
//
// This guards C's alternates logic against the real engine. B's sim.test.ts
// covers the engine itself; this covers the screen built on top of it.
import { simulate, drawScenarioPath, canAfford, allBoroughs } from "../src/engine/index.ts";
import type { Decision } from "../src/engine/index.ts";
import { buildAlternates } from "../src/game/alternates.ts";

const round1k = (n: number) => Math.round(n / 1000) * 1000;

/** A plausible player: refuses the rent rise, buys if the card offers it. */
function play(seed: number, buyIfOffered: boolean) {
  const path = drawScenarioPath(seed);
  let ds: Decision[] = [];
  let run = simulate(seed, path, ds);
  let guard = 0;
  while (run.pending && guard++ < 14) {
    const ev = run.pending;
    let ch = ev.choices[0];
    if (ev.kind === "rent_increase") {
      ch = ev.choices.find((c) => c.kind === "wait") ?? ev.choices[0];
    }
    if (ev.kind === "buy_opportunity") {
      const buy = ev.choices.find((c) => c.kind === "buy");
      ch = buyIfOffered && buy ? buy : (ev.choices.find((c) => c.kind === "wait") ?? ev.choices[0]);
    }
    ds.push({ year: ev.year, kind: ch.kind, borough: ch.borough, price: ch.price });
    run = simulate(seed, path, ds);
  }
  return { run, ds, path };
}

let buyers = 0, nonBuyers = 0, dupes = 0, empty = 0, oneOnly = 0, unfinished = 0;
const gaps: number[] = [];

const N = 400;
for (let seed = 1; seed <= N; seed++) {
  const { run, ds, path } = play(seed, seed % 2 === 0);
  if (!run.finished) { unfinished++; continue; }
  const nw = run.current.netWorth;
  if (ds.some((d) => d.kind === "buy")) buyers++; else nonBuyers++;

  const alts = buildAlternates(seed, path, ds, run);
  if (alts.length === 0) empty++;
  else if (alts.length === 1) oneOnly++;
  for (const a of alts) {
    if (a.run.current.netWorth === nw) dupes++;
    gaps.push(Math.abs(a.run.current.netWorth - nw));
  }
}

const med = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
console.log(`\n  runs: ${buyers + nonBuyers}  (buyers ${buyers}, non-buyers ${nonBuyers})`);
console.log(`  unfinished runs                     : ${unfinished}`);
console.log(`  columns identical to the played run : ${dupes}`);
console.log(`  runs with no alternate at all       : ${empty}`);
console.log(`  runs with only one alternate        : ${oneOnly}`);
console.log(`  median gap vs played                : £${med.toLocaleString()}`);

let fail = false;
if (dupes !== 0) { console.log("\n  FAIL: a column repeated the played run"); fail = true; }
if (empty > N * 0.05) { console.log(`\n  FAIL: ${empty} runs had no alternate at all`); fail = true; }
if (!fail) console.log("\n  PASS: every alternate lands somewhere different\n");
process.exit(fail ? 1 : 0);
