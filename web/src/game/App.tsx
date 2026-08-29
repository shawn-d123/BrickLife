/**
 * THROWAWAY HARNESS — owned by [C], delete or replace freely.
 *
 * Written by [B] for two reasons:
 *  1. it proves the engine runs in the browser bundle, not just in Node;
 *  2. it is the integration from 00-CONTRACTS.md section 3, working, so C can
 *     copy the six lines that matter and throw the rest away.
 *
 * The six lines that matter are the useState block and `choose`. That is the
 * whole engine integration. Everything else here is scaffolding.
 */

import { useState } from "react";
import {
  counterfactual,
  drawScenarioPath,
  gbp,
  isStub,
  simulate,
} from "../engine/index.ts";
import type { Decision, GameEvent } from "../engine/index.ts";

export default function App() {
  // Seed is drawn OUTSIDE the engine — the engine itself never calls Date.now.
  const [seed] = useState(() => Date.now() >>> 0);
  const [path] = useState(() => drawScenarioPath(seed));
  const [decisions, setDecisions] = useState<Decision[]>([]);

  const run = simulate(seed, path, decisions); // recompute every render, it's cheap

  function choose(choice: GameEvent["choices"][number]) {
    setDecisions((ds) => [
      ...ds,
      {
        year: run.current.year,
        kind: choice.kind,
        borough: choice.borough,
        price: choice.price,
      },
    ]);
  }

  const c = run.circumstances;
  const ifWaited = run.finished
    ? counterfactual(seed, path, decisions, (d) =>
        d.kind === "buy" ? { ...d, kind: "wait" } : d,
      )
    : null;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <p style={{ background: "#fef3c7", padding: 8, fontSize: 13 }}>
        Engine smoke harness (B). C: replace this file. {isStub() ? "predictions.json is still D's stub." : "Running on A's real predictions."}
      </p>

      <h1 style={{ fontSize: 22 }}>
        {c.name}, {c.age} — {c.career} on {gbp(c.salary)}
      </h1>
      <p style={{ color: "#555" }}>
        {run.current.year} · {run.current.tenure} · net worth {gbp(run.current.netWorth)} ·
        housing {Math.round(run.current.housingCostRatio * 100)}% of take-home
      </p>

      {run.pending && (
        <section style={{ border: "1px solid #ddd", padding: 16, marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>{run.pending.headline}</h2>
          <p>{run.pending.body}</p>
          <ul>
            {run.pending.facts.map((f) => (
              <li key={f.label}>
                <strong>{f.label}:</strong>{" "}
                {f.value ?? (f.before || "") + " → " + (f.after || "")}
              </li>
            ))}
          </ul>
          {run.pending.choices.map((ch, i) => (
            <button key={i} onClick={() => choose(ch)} style={{ display: "block", margin: "6px 0", padding: 8 }}>
              {ch.label}
            </button>
          ))}
        </section>
      )}

      {run.finished && ifWaited && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>2030</h2>
          <p>
            As played: <strong>{gbp(run.current.netWorth)}</strong>
            <br />
            Same future, if they had waited: <strong>{gbp(ifWaited.current.netWorth)}</strong>
          </p>
        </section>
      )}

      <table style={{ marginTop: 24, fontSize: 13, borderCollapse: "collapse" }}>
        <tbody>
          {run.years.map((y) => (
            <tr key={y.year}>
              <td style={{ padding: "2px 10px" }}>{y.year}</td>
              <td style={{ padding: "2px 10px" }}>{y.tenure}</td>
              <td style={{ padding: "2px 10px" }}>{(y.marketMove * 100).toFixed(1)}%</td>
              <td style={{ padding: "2px 10px" }}>{gbp(y.netWorth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
