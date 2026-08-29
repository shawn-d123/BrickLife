import { PREDICTIONS, IS_STUB, META } from "../wiring";

const M = PREDICTIONS.meta;
// A's meta fields are optional in the contract, so every read is guarded --
// a missing metric shows a dash rather than crashing the judges' screen.
const p3 = (n?: number) => (typeof n === "number" ? n.toFixed(4) : "—");
const pc = (n?: number) => (typeof n === "number" ? Math.round(n * 100) + "%" : "—");

/**
 * Spec section 31. The judges care about this more than the animation, and it
 * is the difference between "a game with data in it" and an honest experiment.
 */
type Verdict = { text: string; tone: "good" | "bad" | "flat" };

/** Does the model beat its baseline on this measure, or not? */
function verdict(model?: number, base?: number, better: "lower" | "higher" = "lower"): Verdict {
  if (typeof model !== "number" || typeof base !== "number") return { text: "—", tone: "flat" };
  const wins = better === "lower" ? model < base : model > base;
  const margin = Math.abs(model - base) / Math.max(1e-9, Math.abs(base));
  if (margin < 0.02) return { text: "matches", tone: "flat" };
  return wins ? { text: "beats", tone: "good" } : { text: "below", tone: "bad" };
}

function coverageVerdict(c?: number): Verdict {
  if (typeof c !== "number") return { text: "—", tone: "flat" };
  return Math.abs(c - 0.8) <= 0.05
    ? { text: "on target", tone: "good" }
    : { text: c > 0.8 ? "wide" : "narrow", tone: "bad" };
}

function Row({ label, model, baseline, verdict: v }: {
  label: string; model: string; baseline: string; verdict: Verdict;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td className="right">{model}</td>
      <td className="right quiet">{baseline}</td>
      <td className={"right verdict " + v.tone}>{v.text}</td>
    </tr>
  );
}

export function WhatsRealScene({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen about scroll">
      <div className="screen-head">
        <div>
          <h3>About the data</h3>
          <h2>What's real, and what isn't</h2>
        </div>
        {IS_STUB && <span className="badge stub">Placeholder model output</span>}
      </div>

      {IS_STUB && (
        <p style={{ color: "var(--gold)", margin: 0 }}>
          These forecast numbers are a hand-written placeholder in the real export's shape.
          They are not model output. The screen will say so until the trained model's
          <code> predictions.json </code> lands.
        </p>
      )}

      <div className="whatsreal">
        <div className="box">
          <h3 style={{ color: "var(--green)" }}>Real</h3>
          <ul>
            <li>Historical London housing data</li>
            <li>Model training and chronological validation</li>
            <li>Mortgage arithmetic — amortisation, not approximation</li>
            <li>Stamp duty bands, including first-time-buyer relief</li>
            <li>PAYE and National Insurance (approximate, on purpose)</li>
            <li>Lender income multiples and deposit minimums</li>
          </ul>
        </div>
        <div className="box">
          <h3 style={{ color: "var(--teal)" }}>Predicted</h3>
          <ul>
            <li>Short-horizon borough house-price response</li>
            <li>Downside, median and upside band</li>
            <li>Probability of a decline over twelve months</li>
          </ul>
        </div>
        <div className="box">
          <h3 style={{ color: "var(--gold)" }}>Simulated</h3>
          <ul>
            <li>Future macroeconomic scenarios after the first year</li>
            <li>Which future you happened to get</li>
            <li>Personal life events and their timing</li>
            <li>The specific flat the agent puts in front of you</li>
          </ul>
        </div>
        <div className="box">
          <h3 style={{ color: "#e07a6a" }}>Gameplay abstractions</h3>
          <ul>
            <li>Wellbeing and stress — driven off housing cost, not modelled</li>
            <li>Relationship and employment outcomes</li>
            <li>Living costs outside housing</li>
          </ul>
        </div>
      </div>

      <div>
        <h3>Model scorecard</h3>
        <table className="grid scorecard">
          <thead>
            <tr>
              <th>Measure</th>
              <th className="right">Model</th>
              <th className="right">Baseline</th>
              <th className="right">Verdict</th>
            </tr>
          </thead>
          <tbody>
            <Row
              label="Mean absolute error"
              model={p3(M.test_mae)}
              baseline={`${p3(M.baseline_mae_persistence)} persistence`}
              verdict={verdict(M.test_mae, M.baseline_mae_persistence, "lower")}
            />
            <Row
              label="Mean absolute error"
              model={p3(M.test_mae)}
              baseline={`${p3(M.baseline_mae_london)} London trend`}
              verdict={verdict(M.test_mae, M.baseline_mae_london, "lower")}
            />
            <Row
              label="Direction accuracy"
              model={pc(M.direction_acc)}
              baseline={`${pc(M.direction_acc_majority)} majority class`}
              verdict={verdict(M.direction_acc, M.direction_acc_majority, "higher")}
            />
            <Row
              label="80% interval coverage"
              model={pc(M.coverage_80)}
              baseline="80% target"
              verdict={coverageVerdict(M.coverage_80)}
            />
            <Row
              label="Brier score"
              model={p3(M.brier)}
              baseline={`${p3(M.brier_baserate)} base rate`}
              verdict={verdict(M.brier, M.brier_baserate, "lower")}
            />
          </tbody>
        </table>

        {META.caveat && (
          <div className="caveat">
            <h3>What the model does not do well</h3>
            <p>{META.caveat}</p>
            <p className="tiny quiet" style={{ marginBottom: 0 }}>
              Straight from the model's own export. We are showing you the measures it
              loses on as well as the ones it wins on, because a scorecard that only
              reports wins is not a scorecard.
            </p>
          </div>
        )}

        <p className="footnote" style={{ marginTop: 10 }}>
          Trained {META.trained_from ?? ""} to {M.trained_through} ·{" "}
          {META.backtest ?? "chronological backtest"}. No random train/test split: the test
          years come strictly after the training years, so the model is scored on periods it
          never saw.
          {META.scenario_method && <> Scenarios: {META.scenario_method}.</>}
          {META.rent_source && <> Rents: {META.rent_source}.</>}
          {" "}Sprites: LimeZu "Modern Interiors" free version, non-commercial.
        </p>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 12 }}>
        <button onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
