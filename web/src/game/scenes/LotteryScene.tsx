import { useEffect, useState } from "react";
import { gbp } from "../components/fmt";
import { boroughFacts } from "../wiring";
import type { Circumstances } from "../wiring";

/**
 * Fifteen seconds of the demo, and it is almost entirely setInterval. Best
 * effort-to-impact ratio in the build.
 */
export function LotteryScene({
  circ, name, onDone,
}: {
  circ: Circumstances;
  name: string;
  onDone: () => void;
}) {
  const rows: [string, string][] = [
    ["Borough", boroughFacts(circ.borough).name],
    ["Age", String(circ.age)],
    ["Career", circ.career],
    ["Salary", gbp(circ.salary)],
    ["Savings", gbp(circ.savings)],
    ["Home", "Renting · " + gbp(circ.rentMonthly) + "/mo"],
    ["Family support", circ.familySupport],
  ];

  const [shown, setShown] = useState(0);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) { setShown(rows.length); return; }
    const id = setInterval(() => {
      setShown((n) => (n >= rows.length ? (clearInterval(id), n) : n + 1));
    }, 420);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = shown >= rows.length;

  return (
    <div className="screen center">
      <h3>The London lottery</h3>
      <h2 style={{ marginBottom: 8 }}>{name.toUpperCase()}</h2>
      <div className="lottery">
        {rows.slice(0, shown).map(([k, v]) => (
          <div className="row" key={k}>
            <span className="k">{k.toUpperCase()}</span>
            <span className="dots" />
            <span className="v">{String(v).toUpperCase()}</span>
          </div>
        ))}
      </div>

      {done && (
        <>
          <p style={{ marginTop: 18, fontSize: 17 }}>This is the hand you were dealt.</p>
          <button className="primary" autoFocus onClick={onDone}>Begin</button>
        </>
      )}
      {!done && (
        <button className="tiny" style={{ marginTop: 16 }} onClick={() => setShown(rows.length)}>
          Skip
        </button>
      )}
    </div>
  );
}
