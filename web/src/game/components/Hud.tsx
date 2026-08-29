import { useEffect, useRef } from "react";
import { gbp } from "./fmt";
import { boroughFacts } from "../wiring";
import type { YearState } from "../wiring";
import { useBleep } from "./useBleep";

/**
 * What counts as a stat going bad. Housing over half your take-home, a mood at
 * either extreme, and any figure underwater.
 */
const THRESHOLD = {
  housing: 0.5,
  wellbeing: 30,
  stress: 70,
} as const;

function badStats(st: YearState) {
  const bad = new Set<string>();
  if (st.cash < 0) bad.add("cash");
  if (st.netWorth < 0) bad.add("networth");
  if (st.housingCostRatio > THRESHOLD.housing) bad.add("housing");
  if (st.wellbeing < THRESHOLD.wellbeing) bad.add("wellbeing");
  if (st.stress > THRESHOLD.stress) bad.add("stress");
  return bad;
}

/** Money underwater is the loud one; the rest are a warning. */
const isAlarm = (k: string) => k === "cash" || k === "networth";

function Cell({
  k, bad = false, children,
}: {
  k: string;
  bad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`hud-cell${bad ? " bad" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </div>
  );
}

function Meter({
  k, value, bad = false, invert = false,
}: {
  k: string; value: number; bad?: boolean; invert?: boolean;
}) {
  const warn = invert ? value > 45 : value < 55;
  return (
    <div className={`hud-cell${bad ? " bad" : ""}`}>
      <div className="k">{k}</div>
      <div className="v">{Math.round(value)}</div>
      <div className={`meter ${bad ? "bad" : warn ? "warn" : ""}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/** Only the essentials, per spec section 14. Detail lives in the menu. */
export function Hud({ st, sound = true }: { st: YearState; sound?: boolean }) {
  const bad = badStats(st);
  const bleep = useBleep(sound);
  const prev = useRef<Set<string>>(new Set());

  // Sound the alert only when a stat crosses INTO trouble, not on every render
  // it stays there -- a HUD that beeps continuously is a HUD you mute.
  useEffect(() => {
    const fresh = [...bad].filter((k) => !prev.current.has(k));
    if (fresh.length) bleep(fresh.some(isAlarm) ? "alarm" : "warn");
    prev.current = bad;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [[...bad].sort().join(",")]);

  const housing = st.tenure === "owning" ? (st.mortgage?.monthly ?? 0) : st.rentMonthly;

  return (
    <div className="hud">
      <Cell k="Year">
        {st.year} <small>· age {st.age}</small>
      </Cell>
      <Cell k="Cash" bad={bad.has("cash")}>{gbp(st.cash)}</Cell>
      <Cell k="Income">
        {gbp(st.netMonthly)}<small>/mo</small>
      </Cell>
      <Cell k="Home">
        {st.tenure === "owning" ? "Owner" : "Renting"}
        <br />
        <small>{boroughFacts(st.borough).name}</small>
      </Cell>
      <Cell k={st.tenure === "owning" ? "Mortgage" : "Rent"}>
        {gbp(housing)}<small>/mo</small>
      </Cell>
      <Meter k="Housing %" value={st.housingCostRatio * 100} bad={bad.has("housing")} invert />
      <Meter k="Wellbeing" value={st.wellbeing} bad={bad.has("wellbeing")} />
      <Meter k="Stress" value={st.stress} bad={bad.has("stress")} invert />
      <Cell k="Net worth" bad={bad.has("networth")}>{gbp(st.netWorth)}</Cell>
    </div>
  );
}
