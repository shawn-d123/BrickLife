import { useMemo, useState } from "react";
import { ForecastBand } from "../components/ForecastBand";
import { gbp, gbpK, pct } from "../components/fmt";
import {
  PREDICTIONS, widenedBand, offerPrice, depositPower, reachable,
  depositFor, stampDuty, monthlyPayment, cashNeeded, boroughFacts, IS_STUB, META,
} from "../wiring";
import type { YearState } from "../wiring";

type Reach = "yes" | "stretch" | "no";

const REACH_COLOUR: Record<Reach, string> = {
  yes: "var(--green)", stretch: "var(--gold)", no: "var(--red)",
};
const REACH_LABEL: Record<Reach, string> = {
  yes: "In reach", stretch: "A stretch", no: "Out of reach",
};

export function OutlookScene({
  st, onBuy, onBack,
}: {
  st: YearState;
  onBuy: (borough: string, price: number) => void;
  onBack: () => void;
}) {
  const [sel, setSel] = useState(st.borough);
  const yearIndex = st.year - 2026;
  const power = depositPower(st);

  const rows = useMemo(() => {
    return Object.keys(PREDICTIONS.boroughs)
      .map((code) => {
        const price = offerPrice(code);
        // The engine's own test, so a green dot always means the purchase works.
        const reach: Reach = reachable(st, price)
          ? "yes"
          : reachable({ ...st, cash: st.cash * 1.2 }, price)
            ? "stretch"
            : "no";
        return {
          code,
          name: boroughFacts(code).name,
          price,
          band: widenedBand(code, st.scenario, yearIndex),
          reach,
        };
      })
      .sort((a, b) => a.price - b.price);
  }, [st, yearIndex]);

  const selRow = rows.find((r) => r.code === sel) ?? rows[0];
  const drivers = PREDICTIONS.boroughs[selRow.code].drivers;
  const deposit = depositFor(st.cash, selRow.price);
  const loan = Math.max(0, selRow.price - deposit);
  const needed = cashNeeded(st.cash, selRow.price, true);

  return (
    <div className="screen scroll">
      <div className="screen-head">
        <div>
          <h3>Where could you live?</h3>
          <h2>{selRow.name} · 12 month model outlook</h2>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="tiny quiet">You can put down</div>
          <b className="num" style={{ fontSize: 18 }}>{gbp(power)}</b>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="borough-table">
            <table className="grid">
              <thead>
                <tr>
                  <th>Borough</th>
                  <th className="right">Entry flat</th>
                  <th className="right">Outlook</th>
                  <th className="right">Decline</th>
                  <th className="right">You</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.code}
                    className={`clickable ${r.code === sel ? "sel" : ""}`}
                    onClick={() => setSel(r.code)}
                  >
                    <td>
                      {r.name}
                      {r.code === st.borough && <span className="badge here">here</span>}
                    </td>
                    <td className="right">{gbpK(r.price)}</td>
                    <td className={"right " + (r.band.p50 >= 0 ? "up" : "down")}>{pct(r.band.p50)}</td>
                    <td className="right quiet">{Math.round(r.band.p_decline * 100)}%</td>
                    <td className="right">
                      <span className="dot" style={{ background: REACH_COLOUR[r.reach] }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="footnote" style={{ marginTop: 8 }}>
            Entry flat = roughly the bottom of the borough's market, not its average.
            Outlook is the model's median for the next twelve months under{" "}
            <b>{PREDICTIONS.scenarios[st.scenario].label}</b>. All {rows.length} London
            boroughs, cheapest first.
          </p>
          <p className="footnote" style={{ marginTop: 6 }}>
            <span className="dot" style={{ background: REACH_COLOUR.yes }} /> in reach{"  ·  "}
            <span className="dot" style={{ background: REACH_COLOUR.stretch }} /> a stretch{"  ·  "}
            <span className="dot" style={{ background: REACH_COLOUR.no }} /> out of reach —
            lenders cap borrowing at 4.5&times; income, so what you earn decides where you
            can live more than what you have saved.
          </p>
        </div>

        <div>
          <ForecastBand fc={selRow.band} />

          <div className="drivers">
            <div>
              <h3 style={{ color: "var(--green)" }}>Pushing up</h3>
              <ul>{drivers.up.map((d) => <li key={d}>{d} ↑</li>)}</ul>
            </div>
            <div>
              <h3 style={{ color: "#e07a6a" }}>Pushing down</h3>
              <ul>{drivers.down.map((d) => <li key={d}>{d} ↓</li>)}</ul>
            </div>
          </div>

          <table className="facts" style={{ marginTop: 14 }}>
            <tbody>
              <tr><td>Price</td><td>{gbp(selRow.price)}</td></tr>
              <tr>
                <td>Deposit</td>
                <td>
                  {gbp(deposit)}{" "}
                  <span className="quiet">({Math.round((deposit / selRow.price) * 100)}%)</span>
                </td>
              </tr>
              <tr><td>Stamp duty (FTB)</td><td>{gbp(stampDuty(selRow.price, true))}</td></tr>
              <tr><td>Mortgage</td><td>{gbp(loan)}</td></tr>
              <tr><td>Payment at 4.75%</td><td>{gbp(monthlyPayment(loan, 4.75))}/mo</td></tr>
              <tr><td>Cash needed on the day</td><td>{gbp(needed)}</td></tr>
              <tr>
                <td>For you</td>
                <td style={{ color: REACH_COLOUR[selRow.reach] }}>{REACH_LABEL[selRow.reach]}</td>
              </tr>
            </tbody>
          </table>

          <p className="footnote" style={{ marginTop: 10 }}>
            Trained {META.trained_from ?? "2010"} to {META.trained_through} ·{" "}
            {META.backtest ?? "chronological backtest"}.
            {IS_STUB && <> · <span className="badge stub">placeholder numbers</span></>}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 9, marginTop: "auto", paddingTop: 12 }}>
        <button onClick={onBack}>Back</button>
        <button
          className="primary"
          disabled={selRow.reach !== "yes"}
          title={selRow.reach !== "yes" ? "You cannot raise the deposit for this one." : undefined}
          onClick={() => onBuy(selRow.code, selRow.price)}
        >
          Make an offer in {selRow.name}
        </button>
      </div>
    </div>
  );
}
