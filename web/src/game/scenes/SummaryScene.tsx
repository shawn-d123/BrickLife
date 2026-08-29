import { gbp, pct0 } from "../components/fmt";
import { boroughFacts, SCENARIO_COPY } from "../wiring";
import type { Decision, RunState, ScenarioId } from "../wiring";

const NAME = (code: string) => boroughFacts(code).name;

const DECISION_LABEL: Record<string, string> = {
  accept_rent: "Accepted the rent increase",
  move: "Moved borough",
  buy: "Bought",
  wait: "Waited",
  remortgage: "Remortgaged",
  sell: "Sold up",
  take_lodger: "Took someone in",
  accept_job: "Took a new job",
};

export function SummaryScene({
  run, path, onWhatIf,
}: {
  run: RunState;
  path: ScenarioId[];
  onWhatIf: () => void;
}) {
  const st = run.current;
  const first = run.years[0];
  const avgHousing =
    run.years.reduce((a, y) => a + y.housingCostRatio, 0) / Math.max(1, run.years.length);
  const yearsOwning = run.years.filter((y) => y.tenure === "owning").length;

  return (
    <div className="screen summary scroll">
      <div className="screen-head">
        <div>
          <h3>2030</h3>
          <h2>Your London life</h2>
        </div>
        <span className="badge">Simulated future</span>
      </div>

      <div className="stats">
        <S k="Age" v={String(st.age)} />
        <S k="Borough" v={NAME(st.borough)} />
        <S k="Home" v={st.tenure === "owning" ? "Owner" : "Renting"} />
        <S k="Starting savings" v={gbp(run.circumstances.savings)} />
        <S k="Final cash" v={gbp(st.cash)} />
        <S k="Property equity" v={gbp(st.equity)} />
        <S k="Years renting" v={String(run.years.length - yearsOwning)} />
        <S k="Years owning" v={String(yearsOwning)} />
        <S k="Total rent paid" v={gbp(st.totalRentPaid)} />
        <S k="Mortgage paid" v={gbp(st.totalMortgagePaid)} />
        <S k="Avg housing cost" v={pct0(avgHousing)} />
        <S k="Wellbeing / stress" v={`${st.wellbeing} / ${st.stress}`} />
      </div>

      <div
        style={{
          border: "3px solid var(--gold)", padding: "5px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}
      >
        <div>
          <div className="tiny quiet">NET WORTH 2030</div>
          <div style={{ fontSize: 26 }} className="num bignum">{gbp(st.netWorth)}</div>
        </div>
        <div className="tiny quiet" style={{ textAlign: "right" }}>
          started at {gbp(first?.netWorth ?? run.circumstances.savings)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h3>Your decisions</h3>
          <div className="timeline">
            {run.log.map((d: Decision, i) => (
              <div className="t" key={i}>
                <span className="y">{d.year}</span>
                <span>
                  {DECISION_LABEL[d.kind] ?? d.kind}
                  {d.borough ? ` · ${NAME(d.borough)}` : ""}
                  {d.price ? ` · ${gbp(d.price)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3>The future you got</h3>
          <div className="timeline">
            {path.map((s, i) => (
              <div className="t" key={i}>
                <span className="y">{2026 + i}</span>
                <span>{SCENARIO_COPY[s].title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="footnote">
        This is one plausible future, not a forecast of destiny.
      </p>

      <div style={{ marginTop: "auto", paddingTop: 10 }}>
        <button className="primary" onClick={onWhatIf}>What if?</button>
      </div>
    </div>
  );
}

function S({ k, v }: { k: string; v: string }) {
  return (
    <div className="s">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
