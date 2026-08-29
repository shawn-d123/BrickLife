// Scout for a seed that makes a good three-minute demo against the REAL engine
// and the REAL predictions:
//   - the buy card actually offers a purchase (most lives cannot afford one)
//   - a rate shock lands in 2027, for the loud middle beat
//   - buying visibly beats waiting by 2030, so the counterfactual has a punchline
import { simulate, drawScenarioPath, rollCircumstances, boroughFacts } from "../src/engine/index.ts";
import type { Decision } from "../src/engine/index.ts";
import { buildAlternates } from "../src/game/alternates.ts";

function play(seed: number) {
  const path = drawScenarioPath(seed);
  const circ = rollCircumstances(seed);
  let ds: Decision[] = [];
  let run = simulate(seed, path, ds);
  let bought: Decision | null = null;
  let guard = 0;
  while (run.pending && guard++ < 14) {
    const ev = run.pending;
    let ch = ev.choices[0];
    if (ev.kind === "rent_increase") ch = ev.choices.find((c) => c.kind === "wait") ?? ch;
    if (ev.kind === "buy_opportunity") {
      const buy = ev.choices.find((c) => c.kind === "buy");
      if (!buy) return null;                       // could not buy at all
      ch = buy;
    }
    const d: Decision = { year: ev.year, kind: ch.kind, borough: ch.borough, price: ch.price };
    if (d.kind === "buy") bought = d;
    ds.push(d);
    run = simulate(seed, path, ds);
  }
  if (!run.finished || !bought) return null;
  const alts = buildAlternates(seed, path, ds, run);
  const waited = alts.find((a) => a.key === "waited");
  if (!waited) return null;
  return {
    seed, path, circ, run, ds, bought, alts,
    gap: run.current.netWorth - waited.run.current.netWorth,
  };
}

const hits: any[] = [];
let couldBuy = 0;
let scanned = 0;
const SCAN = Number(process.argv[2] ?? 40_000);
for (let s = 1; s <= SCAN; s++) {
  scanned = s;
  const r = play(s);
  if (!r) continue;
  couldBuy++;
  if (r.path[1] !== "rate_shock") continue;
  if (r.gap < 30_000) continue;
  if (r.circ.salary < 32_000) continue;
  hits.push(r);
  if (hits.length >= 5) break;
}

console.log(`\nscanned ${scanned} seeds · ${couldBuy} could buy (${Math.round(couldBuy/scanned*100)}%) · ${hits.length} demo-grade\n`);
for (const h of hits) {
  console.log(`seed ${h.seed}`);
  console.log(`  ${h.circ.name}, ${h.circ.age}, ${h.circ.career} on £${h.circ.salary.toLocaleString()}`);
  console.log(`  ${boroughFacts(h.circ.borough).name} · rent £${h.circ.rentMonthly}/mo · savings £${h.circ.savings.toLocaleString()} · support ${h.circ.familySupport}`);
  console.log(`  path ${h.path.join(" -> ")}`);
  console.log(`  bought ${boroughFacts(h.bought.borough).name} @ £${h.bought.price.toLocaleString()}`);
  console.log(`  2030 £${h.run.current.netWorth.toLocaleString()}`);
  for (const a of h.alts) {
    console.log(`     ${a.title.padEnd(26)} £${a.run.current.netWorth.toLocaleString()}`);
  }
  console.log();
}
