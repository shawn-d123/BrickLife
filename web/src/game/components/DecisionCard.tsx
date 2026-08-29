import { ForecastBand } from "./ForecastBand";
import { gbp } from "./fmt";
import { NOISE, NPC_NAME, boroughFacts, widenedBand, depositPower } from "../wiring";
import type { GameEvent, YearState } from "../wiring";

export interface Choice {
  kind: GameEvent["choices"][number]["kind"];
  label: string;
  borough?: string;
  price?: number;
}

/**
 * Cards appear OVER the world, never replacing it. The room stays dimmed behind.
 */
export function DecisionCard({
  event, st, onChoose, onCompare,
}: {
  event: GameEvent;
  st: YearState;
  onChoose: (c: Choice) => void;
  onCompare?: () => void;
}) {
  const noise = NOISE[event.kind] ?? [];
  const isBuy = event.kind === "buy_opportunity";
  const band = widenedBand(st.borough, st.scenario, st.year - 2026);

  // The engine decides affordability: it omits the "buy here" choice entirely
  // when the player cannot raise the money, and offers a cheaper borough
  // instead. C must not second-guess that with its own arithmetic -- two
  // different affordability tests on one screen is how you get a button that
  // looks live and does nothing.
  const canBuySomething = event.choices.some((c) => c.kind === "buy");

  return (
    <div className="overlay">
      <div className="card" role="dialog" aria-modal="true" aria-label={event.headline}>
        <div className="card-head">
          <span className="npc-tag">{NPC_NAME[event.npc] ?? event.npc} · {event.year}</span>
          <h2>{event.headline}</h2>
          <p className="quiet" style={{ margin: "6px 0 0" }}>{event.body}</p>
        </div>

        <div className="card-body">
          <table className="facts">
            <tbody>
              {event.facts.map((f, i) => (
                <tr key={i}>
                  <td>{f.label}</td>
                  <td>
                    {f.before != null ? (
                      <>
                        <span className="quiet">{f.before}</span>
                        <span className="arrow">→</span>
                        <b>{f.after}</b>
                      </>
                    ) : (
                      f.value
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {isBuy && (
            <div style={{ marginTop: 14 }}>
              <h3>{boroughFacts(st.borough).name} · 12 month model outlook</h3>
              <ForecastBand fc={band} />
            </div>
          )}

          {isBuy && !canBuySomething && (
            <p className="footnote" style={{ marginTop: 10, color: "var(--gold)" }}>
              On {gbp(st.salary)} a year with {gbp(depositPower(st))} to put down, nothing
              here is within reach. That is not a bug — it is the result.
            </p>
          )}

          {noise.length > 0 && (
            <div className="noise">
              {noise.map((n, i) => (
                <div className="row" key={i}>
                  <span className="src">{n.source}</span>
                  <span className="line">{n.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-foot">
          {event.choices.map((c, i) => (
            <button key={i} className={i === 0 ? "primary" : ""} onClick={() => onChoose(c)}>
              {c.label}
            </button>
          ))}
          {isBuy && onCompare && (
            <button onClick={onCompare}>Look at other boroughs</button>
          )}
        </div>

      </div>
    </div>
  );
}
