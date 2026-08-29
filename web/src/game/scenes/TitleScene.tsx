import { useEffect, useState } from "react";
import { Sprite } from "../components/Sprite";
import type { SheetName } from "../components/Sprite";

/**
 * The queue outside a viewing. Everything here is decoration -- it never touches
 * the run, and the title screen renders fine if you delete the whole thing.
 */
const QUEUE: { sheet: SheetName; hue: number; x: number; facing: "right" | "up" | "down"; lines: string[] }[] = [
  {
    sheet: "Amelia", hue: 0, x: 252, facing: "right",
    lines: [
      "“Deceptively spacious.”",
      "“It's got a lot of potential.”",
      "“The photos were taken in 2011.”",
    ],
  },
  {
    sheet: "Bob", hue: 210, x: 320, facing: "right",
    lines: [
      "“Two bed. One is a cupboard.”",
      "“Chain-free! (there is a chain)”",
      "“Vintage boiler. Very characterful.”",
    ],
  },
  {
    sheet: "Adam", hue: 95, x: 388, facing: "right",
    lines: [
      "“Forty minutes from a station.”",
      "“Bills not included. Obviously.”",
      "“Have you considered Zone 6?”",
    ],
  },
  {
    sheet: "Alex", hue: 300, x: 456, facing: "up",
    lines: [
      "“I'm just here for the biscuits.”",
      "“Is the queue for the flat?”",
      "“I've been here since Tuesday.”",
    ],
  },
];

export function TitleScene({ onStart, onAbout }: { onStart: () => void; onAbout: () => void }) {
  // Rotate one speech bubble around the queue. Deliberately not random: the same
  // beat every time is easier to talk over in a demo.
  const [tick, setTick] = useState(0);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), 2600);
    return () => clearInterval(id);
  }, [reduced]);

  const speaker = tick % QUEUE.length;
  const person = QUEUE[speaker];
  const line = person.lines[Math.floor(tick / QUEUE.length) % person.lines.length];

  return (
    <div className="screen center title-screen">
      <div className="title-plate">
        <h1>BrickLife</h1>
        <div className="sub">London 2030</div>
        <div className="tag">Nobody knows what comes next.</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="primary" onClick={onStart} autoFocus>New life</button>
        <button onClick={onAbout}>About the data</button>
      </div>

      <div className="crowd" aria-hidden>
        <div className="crowd-sign">VIEWING<br />TODAY 11AM</div>

        {QUEUE.map((p, i) => (
          <div className="crowd-slot" key={p.sheet} style={{ left: `${p.x}px` }}>
            {i === speaker && !reduced && <div className="crowd-bubble">{line}</div>}
            <Sprite sheet={p.sheet} hue={p.hue} facing={p.facing} x={0} y={1} />
          </div>
        ))}

        {/* Someone who gave up and is walking to the next viewing. */}
        <div className="crowd-stroller">
          <Sprite sheet="Bob" hue={40} facing="right" moving x={0} y={1} />
        </div>
      </div>

      <p className="footnote" style={{ marginTop: 4, maxWidth: 480 }}>
        An interactive forecasting experiment that puts people inside London's housing data.
      </p>
    </div>
  );
}
