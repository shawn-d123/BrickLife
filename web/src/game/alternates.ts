// Building the "What if?" lives.
//
// The old approach mapped over the decision log swapping one kind for another.
// That is silently a no-op whenever the kind you are swapping is not in the log
// -- a player who chose "start looking to buy" never has an `accept_rent` to
// swap, so their alternate life replayed their exact choices and the column
// showed the same number twice.
//
// Instead: replay the alternate life event by event. At each event, take the
// forced choice if this alternate has one, otherwise the choice the player
// actually made at that same event, otherwise a neutral default. That keeps
// everything except the one decision under test, works whether or not the
// player made that decision, and always reaches 2030.
import { simulate, PREDICTIONS, offerPrice, reachable as canReach } from "./wiring.ts";
import type {
  Circumstances, Decision, DecisionKind, GameEvent, RunState, ScenarioId, YearState,
} from "./wiring.ts";

const BOROUGH_CODES = Object.keys(PREDICTIONS.boroughs);
const NAME = (code: string) => PREDICTIONS.boroughs[code]?.name ?? code;

interface Pick { kind: DecisionKind; borough?: string; price?: number }

/**
 * The two events that put a renter under pressure. A seed gets one or the
 * other in a given year, so anything that wants to swap "what you did about
 * the rent" has to match both -- keying only on rent_increase silently
 * no-opped on every seed that drew a sale instead.
 */
const isRentPressure = (kind: GameEvent["kind"]) =>
  kind === "rent_increase" || kind === "landlord_sells";
type Override = (ev: GameEvent, st: YearState) => Pick | null;

interface Answered { kind: GameEvent["kind"]; year: number; decision: Decision }

/** Which event did each played decision actually answer? */
function annotate(seed: number, path: ScenarioId[], decisions: Decision[]): Answered[] {
  const out: Answered[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const r = simulate(seed, path, decisions.slice(0, i));
    if (!r.pending) break;
    out.push({ kind: r.pending.kind, year: r.pending.year, decision: decisions[i] });
  }
  return out;
}

function replayWith(
  seed: number, path: ScenarioId[], answered: Answered[], override: Override
): RunState {
  const ds: Decision[] = [];
  let run = simulate(seed, path, ds);
  let guard = 0;

  while (run.pending && guard++ < 16) {
    const ev = run.pending;
    const offers = (k: DecisionKind) => ev.choices.some((c) => c.kind === k);

    const forced = override(ev, run.current);
    const prior = answered.find((a) => a.kind === ev.kind && a.year === ev.year)?.decision;

    let pick: Pick;
    if (forced && offers(forced.kind)) {
      pick = forced;
    } else if (prior && offers(prior.kind)) {
      pick = { kind: prior.kind, borough: prior.borough, price: prior.price };
    } else {
      const f = ev.choices.find((c) => c.kind === "wait") ?? ev.choices[0];
      pick = { kind: f.kind, borough: f.borough, price: f.price };
    }

    ds.push({ year: ev.year, kind: pick.kind, borough: pick.borough, price: pick.price });
    run = simulate(seed, path, ds);
  }
  return run;
}

/** Boroughs this player could actually have bought in, cheapest first. */
export function reachable(st: YearState) {
  return BOROUGH_CODES
    .map((code) => ({ code, price: offerPrice(code) }))
    .filter(({ price }) => canReach(st, price))
    .sort((a, b) => a.price - b.price);
}

export interface Alternate {
  key: string;
  title: string;
  sub: string;
  run: RunState;
}

/**
 * Candidate alternate lives, in preference order. We run each and keep the
 * first two that actually land somewhere different from the played run, so the
 * screen never shows the same number twice.
 */
export function buildAlternates(
  seed: number, path: ScenarioId[], decisions: Decision[], asPlayed: RunState
): Alternate[] {
  const answered = annotate(seed, path, decisions);
  const circ = asPlayed.circumstances;
  const bought = decisions.find((d) => d.kind === "buy");
  const homeBorough = bought?.borough ?? asPlayed.current.borough;

  // Somewhere with a genuinely different market to the one they ended up in.
  const elsewhere =
    BOROUGH_CODES
      .filter((c) => c !== homeBorough)
      .sort((a, b) => PREDICTIONS.boroughs[a].avg_price - PREDICTIONS.boroughs[b].avg_price)[0];

  const candidates: { key: string; title: string; sub: string; override: Override }[] = [];

  if (bought) {
    candidates.push({
      key: "waited",
      title: "If you waited",
      sub: "Never bought",
      override: (ev) => (ev.kind === "buy_opportunity" ? { kind: "wait" } : null),
    });
    candidates.push({
      key: "elsewhere",
      title: "If you'd bought elsewhere",
      sub: NAME(elsewhere),
      override: (ev) =>
        ev.kind === "buy_opportunity"
          ? { kind: "buy", borough: elsewhere, price: offerPrice(elsewhere) }
          : null,
    });
  } else {
    // They never bought. The interesting question is the opposite one.
    candidates.push({
      key: "bought",
      title: "If you'd bought",
      sub: "The cheapest you could reach",
      override: (ev, st) => {
        if (ev.kind === "buy_opportunity") {
          const best = reachable(st)[0];
          return best ? { kind: "buy", borough: best.code, price: best.price } : null;
        }
        return null;
      },
    });
  }

  candidates.push({
    key: "moved",
    title: "If you'd moved",
    sub: `Cheaper rent in ${NAME(elsewhere)}`,
    override: (ev) =>
      isRentPressure(ev.kind) ? { kind: "move", borough: elsewhere } : null,
  });
  candidates.push({
    key: "stayed",
    title: "If you'd stayed put",
    sub: "Took the rent rise",
    override: (ev) => (isRentPressure(ev.kind) ? { kind: "accept_rent" } : null),
  });
  candidates.push({
    key: "lodger",
    title: "If you'd taken someone in",
    sub: "A second income under the roof",
    override: (ev) => (ev.kind === "household" ? { kind: "take_lodger" } : null),
  });

  const out: Alternate[] = [];
  for (const c of candidates) {
    if (out.length >= 2) break;
    const run = replayWith(seed, path, answered, c.override);
    // Only worth a column if it lands somewhere else.
    if (run.current.netWorth === asPlayed.current.netWorth) continue;
    if (out.some((o) => o.run.current.netWorth === run.current.netWorth)) continue;
    out.push({ key: c.key, title: c.title, sub: c.sub, run });
  }
  return out;
}
