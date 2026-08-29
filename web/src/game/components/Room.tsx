import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sprite, NPC_SHEET, NPC_HUE, PLAYER_SHEETS } from "./Sprite";
import type { Facing, SheetName } from "./Sprite";
import { NPC_LINE, NPC_NAME } from "../wiring";
import type { GameEvent, Tenure } from "../wiring";

/** Tile coordinates inside the 28x13 room png. */
const DOOR = { x: 19.7, y: 2.2 };
const PLAYER_SPOT = { x: 15.4, y: 8.8 };

/**
 * Where callers come from. Rotated in order, one per interaction -- no
 * randomness, so a rehearsed demo shows the same three entrances every time.
 *
 * `knockAt` is where the knock indicator sits, `path` is walked in order, and
 * the last point is where they stop. Facing at each leg comes from the
 * direction of travel, and the final facing is turned toward the player.
 */
interface Route { knockAt: Pt; path: Pt[] }

const ROUTES: Route[] = [
  {
    // Through the front door and straight down, stopping on the player's right.
    knockAt: { x: 20.2, y: 2.5 },
    path: [DOOR, { x: DOOR.x, y: 8.8 }, { x: 17.6, y: 8.8 }],
  },
  {
    // In from the hallway on the left, along the near wall.
    knockAt: { x: 0.9, y: 8.5 },
    path: [{ x: -1.6, y: 8.8 }, { x: 13.2, y: 8.8 }],
  },
  {
    // Front door again, but round the far side of the room and back down, so
    // they end up on the player's other shoulder.
    knockAt: { x: 20.2, y: 2.5 },
    path: [DOOR, { x: 12.4, y: 3.4 }, { x: 12.4, y: 8.8 }, { x: 13.4, y: 8.8 }],
  },
];

/** Tiles per second. Deliberately unhurried -- you should see them walking. */
const WALK_SPEED = 2.6;

export type Beat = "idle" | "knock" | "entering" | "talking" | "done";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Pt { x: number; y: number }

function facingFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

/**
 * Walks a sprite along a list of waypoints at a fixed speed, picking the facing
 * from the direction of travel. Position is advanced per animation frame rather
 * than handed to a CSS transition, so the walk cycle and the movement stay in
 * step instead of the sprite gliding.
 */
function useWalker(active: boolean, path: Pt[], speed: number, onArrive: () => void) {
  const [pos, setPos] = useState<Pt>(path[0]);
  const [facing, setFacing] = useState<Facing>("down");
  const [moving, setMoving] = useState(false);
  const arrivedRef = useRef(false);
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  useEffect(() => {
    if (!active) {
      setPos(path[0]);
      setMoving(false);
      arrivedRef.current = false;
      return;
    }
    arrivedRef.current = false;

    const last = path[path.length - 1];
    const prev = path[path.length - 2] ?? last;
    if (reduced()) {
      setPos(last);
      setFacing(facingFor(last.x - prev.x, last.y - prev.y));
      setMoving(false);
      arrivedRef.current = true;
      onArriveRef.current();
      return;
    }

    setPos(path[0]);
    setMoving(true);
    let raf = 0;
    let leg = 0;
    let legStart = performance.now();

    const step = (now: number) => {
      const a = path[leg];
      const b = path[leg + 1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const dur = dist === 0 ? 0 : (dist / speed) * 1000;
      const t = dur === 0 ? 1 : Math.min(1, (now - legStart) / dur);

      setPos({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      setFacing(facingFor(b.x - a.x, b.y - a.y));

      if (t >= 1) {
        leg += 1;
        legStart = now;
        if (leg >= path.length - 1) {
          setMoving(false);
          if (!arrivedRef.current) {
            arrivedRef.current = true;
            onArriveRef.current();
          }
          return;
        }
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, speed, path.map((p) => `${p.x},${p.y}`).join(" ")]);

  return { x: pos.x, y: pos.y, facing, moving };
}

/**
 * Section 17 of the spec: events happen physically first. Knock, NPC walks in,
 * speech bubble -- and then it waits. The player clicks to open the decision.
 */
export function Room({
  tenure, spriteId, event, beat, onBeat, routeIndex = 0, children,
}: {
  tenure: Tenure;
  spriteId: 0 | 1 | 2;
  event: GameEvent | null;
  beat: Beat;
  onBeat: (b: Beat) => void;
  /** Which entrance this caller uses. Rotates one per interaction. */
  routeIndex?: number;
  children?: React.ReactNode;
}) {
  const route = ROUTES[((routeIndex % ROUTES.length) + ROUTES.length) % ROUTES.length];
  const arrival = route.path[route.path.length - 1];
  // Whichever side they stopped on, both of them turn to face each other.
  const npcRestFacing: Facing = arrival.x > PLAYER_SPOT.x ? "left" : "right";
  const playerFacing: Facing = arrival.x > PLAYER_SPOT.x ? "right" : "left";
  const wrapRef = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(3);

  // Fit the room to whatever the projector gives us, in half-pixel steps so the
  // pixel art never lands on a fractional scale.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const pad = 16;
      const k = Math.min((el.clientWidth - pad) / 448, (el.clientHeight - pad) / 208);
      // Quarter steps. Halving threw away up to a third of the available room on
      // a short viewport, which is how the room ended up rendering at 1x.
      setS(Math.max(1, Math.min(4, Math.floor(k * 4) / 4)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const npcKey = event?.npc ?? null;

  // Only the knock is on a timer. Walking ends when the walk ends, and the
  // bubble ends when the player says so.
  useEffect(() => {
    if (!event) { onBeat("idle"); return; }
    if (reduced()) { onBeat("talking"); return; }
    onBeat("knock");
    const id = setTimeout(() => onBeat("entering"), 900);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const walker = useWalker(
    beat === "entering",
    route.path,
    WALK_SPEED,
    () => onBeat("talking")
  );

  const npcVisible = !!event && (beat === "entering" || beat === "talking" || beat === "done");
  const npcAt = beat === "entering"
    ? walker
    : { ...arrival, facing: npcRestFacing, moving: false };
  const dimmed = beat === "done";
  const awaitingClick = beat === "talking";

  const playerSheet: SheetName = PLAYER_SHEETS[spriteId] ?? "Adam";

  return (
    <div className="room-wrap" ref={wrapRef}>
      <div
        className={`room ${dimmed ? "dimmed" : ""}`}
        style={{
          ["--s" as string]: s,
          backgroundImage: `url(/assets/rooms/${tenure}.png)`,
        }}
      >
        <Sprite
          sheet={playerSheet}
          facing={npcVisible ? playerFacing : "down"}
          x={PLAYER_SPOT.x}
          y={PLAYER_SPOT.y}
        />

        {beat === "knock" && (
          <div
            className="knock"
            style={{
              left: `calc(${route.knockAt.x} * var(--tile) * var(--s) * 1px)`,
              top: `calc(${route.knockAt.y} * var(--tile) * var(--s) * 1px)`,
            }}
          >
            knock knock
          </div>
        )}

        {npcKey && npcVisible && (
          <Sprite
            sheet={NPC_SHEET[npcKey] ?? "Bob"}
            hue={NPC_HUE[npcKey] ?? 0}
            facing={npcAt.facing}
            moving={npcAt.moving}
            x={npcAt.x}
            y={npcAt.y}
          />
        )}

        {npcKey && awaitingClick && (
          <div
            className="bubble"
            style={{
              left: `calc(${arrival.x + 0.5} * var(--tile) * var(--s) * 1px)`,
              top: `calc(${arrival.y - 1.1} * var(--tile) * var(--s) * 1px)`,
            }}
          >
            <b className="tiny">{NPC_NAME[npcKey]}</b>
            <div>{NPC_LINE[npcKey]}</div>
            <span className="go">▼ click to continue</span>
          </div>
        )}
      </div>

      {/* The bubble waits for the player. Clicking anywhere, or pressing
          enter/space, opens the decision. */}
      {awaitingClick && (
        <button
          className="click-catch"
          aria-label="Continue"
          autoFocus
          onClick={() => onBeat("done")}
        />
      )}

      {children}
    </div>
  );
}
