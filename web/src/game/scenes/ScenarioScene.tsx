import { SCENARIO_COPY, PREDICTIONS } from "../wiring";
import type { ScenarioId } from "../wiring";

/** Wire copy per scenario, so the bulletin reads like a broadcast, not a label. */
const WIRE: Record<ScenarioId, string[]> = {
  base: [
    "BANK HOLDS · NO CHANGE TO BASE RATE",
    "LENDERS REPRICE QUIETLY, NOBODY BLINKS",
    "\"A YEAR OF NOT MUCH,\" SAYS ANALYST",
  ],
  rate_shock: [
    "RATES HELD HIGHER FOR LONGER",
    "FIXED DEALS RESET AT PAINFUL LEVELS",
    "TRANSACTIONS SLOW ACROSS THE CAPITAL",
  ],
  rate_cuts: [
    "BORROWING COSTS FALL FASTER THAN FORECAST",
    "LENDERS COMPETE, DEALS RETURN TO MARKET",
    "BUYERS EDGE BACK INTO THE CAPITAL",
  ],
};

/** The between-years beat, as a retro news bulletin. */
export function ScenarioScene({
  year, scenario, onContinue,
}: {
  year: number;
  scenario: ScenarioId;
  onContinue: () => void;
}) {
  const copy = SCENARIO_COPY[scenario];
  const delta = PREDICTIONS.scenarios[scenario].rate_delta_pp;

  return (
    <div className="screen center">
      <div className="news">
        <div className="news-head">
          <span className="news-flag">◆ BrickLife Wire</span>
          <span className="news-date">JANUARY {year}</span>
        </div>

        <div className="news-body">
          <div className="news-kicker">Economic outlook changes</div>
          <h2 className="news-hed">{copy.title}</h2>
          <p className="news-standfirst">{copy.line}</p>

          {delta !== 0 && (
            <div className="news-stat">
              <span>MORTGAGE RATES</span>
              <b className={delta > 0 ? "down" : "up"}>
                {delta > 0 ? "▲ +" : "▼ "}{delta.toFixed(2)} POINTS
              </b>
            </div>
          )}

          <ul className="news-wire">
            {WIRE[scenario].map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>

        <div className="news-ticker">
          <span>
            {WIRE[scenario].join("   ///   ")}   ///   {WIRE[scenario].join("   ///   ")}
          </span>
        </div>
      </div>

      <button className="primary" autoFocus onClick={onContinue}>Continue</button>
    </div>
  );
}
