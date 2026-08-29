import { useCallback, useMemo, useState } from "react";
import "./styles.css";

import { drawScenarioPath, simulate, rollCircumstances } from "./wiring";
import type { Decision, ScenarioId } from "./wiring";

import { Hud } from "./components/Hud";
import { Room } from "./components/Room";
import type { Beat } from "./components/Room";
import { DecisionCard } from "./components/DecisionCard";
import type { Choice } from "./components/DecisionCard";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { TitleScene } from "./scenes/TitleScene";
import { CharacterScene } from "./scenes/CharacterScene";
import { LotteryScene } from "./scenes/LotteryScene";
import { PremiseScene } from "./scenes/PremiseScene";
import { OutlookScene } from "./scenes/OutlookScene";
import { ScenarioScene } from "./scenes/ScenarioScene";
import { SummaryScene } from "./scenes/SummaryScene";
import { CounterfactualScene } from "./scenes/CounterfactualScene";
import { WhatsRealScene } from "./scenes/WhatsRealScene";

type Screen =
  | "title" | "character" | "lottery" | "premise"
  | "play" | "outlook" | "scenario" | "summary" | "counterfactual" | "about";

/**
 * Demo safety. `?seed=12345` pins the run so a rehearsed playthrough is
 * reproducible on the projector; without it every load is a fresh life.
 * The seed is the only entropy in the whole app -- everything downstream is a
 * pure function of it, so pinning it pins the entire five years.
 */
function seedFromUrl(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n >>> 0 : null;
}

export default function App() {
  return (
    <div className="app">
      <div className="stage">
        <ErrorBoundary>
          <Game />
        </ErrorBoundary>
      </div>
    </div>
  );
}

function Game() {
  // Nothing derived lives in state. Only the seed, the future, and the choices.
  const [seed, setSeed] = useState(() => seedFromUrl() ?? (Date.now() >>> 0));
  const [path, setPath] = useState<ScenarioId[]>(() => drawScenarioPath(seed));
  const [decisions, setDecisions] = useState<Decision[]>([]);

  const [screen, setScreen] = useState<Screen>("title");
  const [beforeAbout, setBeforeAbout] = useState<Screen>("title");
  const [name, setName] = useState("You");
  const [spriteId, setSpriteId] = useState<0 | 1 | 2>(0);
  const [beat, setBeat] = useState<Beat>("idle");
  const [seenYear, setSeenYear] = useState(2026);
  const [sound, setSound] = useState(true);

  // Recomputed every render. It is a pure function over five years, it costs nothing.
  const run = useMemo(() => simulate(seed, path, decisions), [seed, path, decisions]);
  const circ = useMemo(() => rollCircumstances(seed), [seed]);

  const choose = useCallback((c: Choice) => {
    setDecisions((ds) => [
      ...ds,
      { year: run.current.year, kind: c.kind, borough: c.borough, price: c.price },
    ]);
    setBeat("idle");
  }, [run.current.year]);

  function newLife() {
    // A pinned seed stays pinned across "new life" so a rehearsal repeats exactly.
    const s = seedFromUrl() ?? (Date.now() >>> 0);
    setSeed(s);
    setPath(drawScenarioPath(s));
    setDecisions([]);
    setSeenYear(2026);
    setBeat("idle");
    setScreen("character");
  }

  function openAbout() {
    setBeforeAbout(screen);
    setScreen("about");
  }

  // ---- non-play screens -------------------------------------------------

  if (screen === "about") {
    return <WhatsRealScene onBack={() => setScreen(beforeAbout)} />;
  }
  if (screen === "title") {
    return <TitleScene onStart={newLife} onAbout={openAbout} />;
  }
  if (screen === "character") {
    return (
      <CharacterScene
        onDone={(n, sid) => { setName(n); setSpriteId(sid); setScreen("lottery"); }}
      />
    );
  }
  if (screen === "lottery") {
    return <LotteryScene circ={circ} name={name} onDone={() => setScreen("premise")} />;
  }
  if (screen === "premise") {
    return <PremiseScene onBegin={() => setScreen("play")} />;
  }
  if (screen === "outlook") {
    return (
      <OutlookScene
        st={run.current}
        onBack={() => setScreen("play")}
        onBuy={(borough, price) => {
          setDecisions((ds) => [...ds, { year: run.current.year, kind: "buy", borough, price }]);
          setBeat("idle");
          setScreen("play");
        }}
      />
    );
  }
  if (screen === "scenario") {
    return (
      <ScenarioScene
        year={run.current.year}
        scenario={run.current.scenario}
        onContinue={() => { setSeenYear(run.current.year); setScreen("play"); }}
      />
    );
  }
  if (screen === "summary") {
    return <SummaryScene run={run} path={path} onWhatIf={() => setScreen("counterfactual")} />;
  }
  if (screen === "counterfactual") {
    return (
      <CounterfactualScene
        seed={seed}
        path={path}
        decisions={decisions}
        asPlayed={run}
        onRestart={() => setScreen("title")}
        onAbout={openAbout}
      />
    );
  }

  // ---- the room ---------------------------------------------------------

  // A year has turned since the player last saw a scenario card.
  if (!run.finished && run.current.year > seenYear) {
    setScreen("scenario");
    return null;
  }
  if (run.finished) {
    setScreen("summary");
    return null;
  }

  return (
    <>
      <Hud st={run.current} sound={sound} />
      <Room
        tenure={run.current.tenure}
        spriteId={spriteId}
        event={run.pending}
        beat={beat}
        onBeat={setBeat}
        routeIndex={decisions.length}
      >
        {run.pending && beat === "done" && (
          <DecisionCard
            event={run.pending}
            st={run.current}
            onChoose={choose}
            onCompare={
              run.pending.kind === "buy_opportunity" ? () => setScreen("outlook") : undefined
            }
          />
        )}
      </Room>
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "7px 12px", borderTop: "2px solid var(--line)", background: "var(--panel)",
        }}
      >
        <span style={{ display: "flex", gap: 7 }}>
          <button className="tiny" onClick={openAbout}>What's real?</button>
          <button
            className="tiny sound-toggle"
            aria-pressed={sound}
            title={sound ? "Alerts are audible" : "Alerts are silent"}
            onClick={() => setSound((s) => !s)}
          >
            {sound ? "♪ on" : "♪ off"}
          </button>
        </span>
        <span className="tiny quiet">
          {name} · {run.current.year} · one plausible future · seed {seed}
        </span>
        {beat !== "done" && run.pending && (
          <button className="tiny" onClick={() => setBeat("done")}>Skip →</button>
        )}
        {(!run.pending || beat === "done") && <span />}
      </div>
    </>
  );
}
