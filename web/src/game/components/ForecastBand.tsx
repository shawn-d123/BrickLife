import { pct, pct0 } from "./fmt";
import type { Forecast } from "../wiring";

/**
 * Never a single confident number without its band. The whole pitch is that
 * uncertainty is the point, so the band is the primary object and the median
 * is just a marker on it.
 */
export function ForecastBand({ fc, compact = false }: { fc: Forecast; compact?: boolean }) {
  const lo = Math.min(fc.p10, -0.005);
  const hi = Math.max(fc.p90, 0.005);
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="band">
      <div className="band-track">
        <div className="band-marker" style={{ left: `calc(${at(fc.p50)}% - 1.5px)` }} />
      </div>
      <div className="band-scale">
        <div>
          <span className="quiet">Downside</span>
          <b className="down">{pct(fc.p10)}</b>
        </div>
        <div style={{ textAlign: "center" }}>
          <span className="quiet">Median</span>
          <b className={fc.p50 >= 0 ? "up" : "down"}>{pct(fc.p50)}</b>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="quiet">Upside</span>
          <b className="up">{pct(fc.p90)}</b>
        </div>
      </div>
      {!compact && (
        <div className="prob">
          <span className="tiny quiet">RISK OF DECLINE</span>
          <div className="prob-bar">
            <i style={{ width: `${fc.p_decline * 100}%` }} />
          </div>
          <b className="num">{pct0(fc.p_decline)}</b>
        </div>
      )}
    </div>
  );
}
