import { gbp } from "../components/fmt";
import { boroughFacts, SCENARIO_COPY } from "../wiring";
import { buildAlternates } from "../alternates";
import type { Decision, RunState, ScenarioId } from "../wiring";

const NAME = (code: string) => boroughFacts(code).name;

export function CounterfactualScene({
  seed, path, decisions, asPlayed, onRestart, onAbout,
}: {
  seed: number;
  path: ScenarioId[];
  decisions: Decision[];
  asPlayed: RunState;
  onRestart: () => void;
  onAbout: () => void;
}) {
  const bought = decisions.find((d) => d.kind === "buy");

  // Alternate lives are replayed event by event rather than by swapping decision
  // kinds, so a column can never come back identical to the played run.
  const alternates = buildAlternates(seed, path, decisions, asPlayed);

  const cols = [
    {
      key: "you",
      title: "Your life",
      sub: bought
        ? `Bought ${bought.year} · ${NAME(bought.borough ?? asPlayed.current.borough)}`
        : "Rented throughout",
      run: asPlayed,
      you: true,
    },
    ...alternates.map((a) => ({ key: a.key, title: a.title, sub: a.sub, run: a.run, you: false })),
  ];

  const best = Math.max(...cols.map((c) => c.run.current.netWorth));

  return (
    <div className="screen scroll">
      <div className="screen-head">
        <div>
          <h3>What if?</h3>
          <h2>The same future, a different choice</h2>
        </div>
        <span className="badge">Simulated future</span>
      </div>

      <div className="cols3">
        {cols.map((c) => (
          <div className={`col ${c.you ? "you" : ""}`} key={c.key}>
            <h3>{c.title}</h3>
            <div className="tiny quiet" style={{ minHeight: 30 }}>{c.sub}</div>
            <div className="nw" style={{ color: c.run.current.netWorth === best ? "var(--gold)" : undefined }}>
              {gbp(c.run.current.netWorth)}
            </div>
            <div className="tiny quiet" style={{ marginTop: 8 }}>
              {c.run.current.tenure === "owning"
                ? `equity ${gbp(c.run.current.equity)}`
                : `rent paid ${gbp(c.run.current.totalRentPaid)}`}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 7, marginTop: 14 }}>
        {cols.map((c) => (
          <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="tiny quiet" style={{ width: 118, textAlign: "right" }}>{c.title}</span>
            <div style={{ flex: 1, height: 16, background: "#1b100c", border: "2px solid var(--line)", borderRadius: 4 }}>
              <div
                style={{
                  width: `${Math.max(2, (c.run.current.netWorth / best) * 100)}%`,
                  height: "100%",
                  background: c.you ? "var(--gold)" : "var(--line)",
                  transition: "width 600ms ease",
                }}
              />
            </div>
            <span className="tiny num" style={{ width: 78 }}>{gbp(c.run.current.netWorth)}</span>
          </div>
        ))}
      </div>

      <p style={{ textAlign: "center", fontSize: 17, margin: "14px 0 4px" }}>
        Same future. Different choice.
      </p>
      <p className="footnote" style={{ textAlign: "center" }}>
        Seed {seed} · all three lives were run against the identical market path
        ({path.map((s) => SCENARIO_COPY[s].title).join(" → ")}). Only the decision changed.
      </p>

      {!bought && (
        <p className="footnote" style={{ textAlign: "center" }}>
          You never bought. On {gbp(asPlayed.circumstances.salary)} a year, a 4.5&times;
          income multiple does not stretch far across London — so the comparison here is
          against the other things you could have done with the same four years.
        </p>
      )}
      {alternates.length === 0 && (
        <p className="footnote" style={{ textAlign: "center" }}>
          Every alternative we replayed against this future landed in the same place.
          That happens: some hands do not have a better line through them.
        </p>
      )}

      <div style={{ display: "flex", gap: 9, justifyContent: "center", marginTop: "auto", paddingTop: 14 }}>
        <button onClick={onAbout}>What's real?</button>
        <button className="primary" onClick={onRestart}>New life</button>
      </div>
    </div>
  );
}
