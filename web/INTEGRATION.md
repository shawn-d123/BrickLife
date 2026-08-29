# Integration — all four lanes, merged

The lanes are combined. This file records how they fit together and what to
touch if a lane ships again.

## Wiring

**Everything lane C renders goes through one file: [`src/game/wiring.ts`](src/game/wiring.ts).**
Nothing in `src/game/` imports `engine/`, `content/` or `data/` directly, so a
new drop from any lane is a change to that one file.

| Lane | Owns | C consumes |
|---|---|---|
| **A** | `predictions.json`, the model scripts | 33 boroughs, forecasts, `meta` scorecard — via B's `predictions.ts` |
| **B** | `src/engine/` | `simulate`, `counterfactual`, `rollCircumstances`, `drawScenarioPath`, finance, `canAfford`, `boroughFacts` |
| **C** | `src/game/`, `public/assets/` | — |
| **D** | `src/content/` | `EVENT_COPY`, `SCENARIO_COPY`, `CAREERS` |

## Decisions taken during the merge

- **Affordability is the engine's, not C's.** B's buy event omits the "buy here"
  choice when the player cannot raise the money and offers a cheaper borough
  instead, and `applyDecision` silently refuses a purchase that fails
  `canAfford`. C's screens therefore call `canAfford` rather than doing their own
  arithmetic — two affordability tests on one screen is how you get a button
  that looks live and does nothing.
- **Borough names come from the engine.** `content/boroughs.ts` is still B's
  six-entry placeholder from 12:35, but `predictions.json` has all 33. Anything
  in C that shows a borough name calls `boroughFacts(code).name`, so a player
  dealt Bexley does not see a raw ONS code. **D: overwriting `boroughs.ts` with
  33 entries is safe and changes nothing in C.**
- **Two prices, deliberately.** The decision card quotes a specific flat the
  engine draws at 66–86% of the borough average. The comparison table quotes an
  entry-level flat at 55%, matching how the engine prices an out-of-borough
  fallback. They differ because they are different questions: "this flat" versus
  "the bottom of this borough's market".
- **C-side flavour lives in `src/game/flavour.ts`.** The news/noise voices and
  NPC greeting lines are not in D's contract. If D wants them, move them into
  `content/copy.ts` and re-export from `wiring.ts`.
- **A's extra meta fields** (`caveat`, `go_no_go`, `backtest`, `scenario_method`,
  `rent_source`) are outside B's `PredictionsMeta` type. C reads them through
  the widened `META` view in `wiring.ts` rather than editing B's file.

## Presentation details worth knowing

- **Stat alerts.** A HUD cell turns red and blinks when it crosses into trouble:
  cash or net worth below zero, housing over 50% of take-home, wellbeing under
  30, stress over 70. Crossing *into* trouble also sounds a short square-wave
  bleep — synthesised in `useBleep.ts`, so there is no audio asset and it works
  offline. Money underwater gets a lower, longer alarm than the rest. It fires on
  the transition, not continuously, and there is a `♪ on/off` toggle in the
  footer for a room where sound is not wanted.
- **Three entrances, rotated.** Callers arrive by one of three routes in
  `Room.tsx` — through the front door and straight down, in from the hallway on
  the left, or through the door and round the far side. The route is
  `decisions.length % 3`, so it rotates one per interaction with no randomness
  and a rehearsed demo shows the same sequence every time. Both characters turn
  to face each other wherever the caller stops.

## The event schedule

Two decisions a year. Before the merge polish, an owner saw six events and a
renter saw four — and two of the renter's four were the same rent rise, so
**every renting run played out identically**: measured across 300 seeds, a
player who accepted the rent got exactly one sequence, 100% of the time.

The cause was gating: `buy_opportunity`, `rate_change` and `mortgage_reset` are
all owner- or path-gated, and roughly three-quarters of lives never buy. What
was left was `rent_increase → rent_increase → household → employment`.

Three changes fixed it, all in `engine/events.ts`:

- **`landlord_sells`** — a renter's own pressure beat (new `EventKind`). Paired
  with `rent_increase` on the same year *and stream*, so they share an rng draw
  and act as exact complements: one or the other fires, decided by the seed.
- **`buy_opportunity` is parameterised by year** and no longer requires that you
  said you would look. Signing the 2026 tenancy used to close home ownership for
  the whole game. Renters now get a look in 2026, 2027 and 2029.
- **`rate_change` is parameterised by year** and fires in 2027 and 2028, so
  owners get a second decision in the middle years too.

Result, measured the same way: 8 distinct sequences for a renter (was 1), 13 for
someone trying to buy (was 2), and the share of players who manage to buy went
from 24% to 45%.

**If you touch the schedule, re-run `scripts/check-counterfactual.ts`.** It
caught two regressions during this work: alternate lives that silently repeated
the played run because they keyed on `rent_increase` and the seed had drawn
`landlord_sells` instead.

## Checks

```bash
node src/engine/sim.test.ts            # B's engine: purity, finance, playthrough (18 tests)
node scripts/check-counterfactual.ts   # C's alternate lives never repeat the played run
node scripts/find-demo-seed.ts 2000    # scout a seed that demos well
npx tsc --noEmit && npx vite build
```

## Demo safety

`?seed=1` pins a rehearsed run: Sinead, 32, Account Manager on £45,000 in Bexley,
rate shock in 2027, buys in Bexley, ends 2030 at £186,275 against £110,274 if she
had waited. Every number in the app is a pure function of the seed.

**Only about a quarter of generated lives can buy at all.** That is the engine and
the real prices talking, not a bug — but it means a random seed will often show a
renter's ending, so pin the seed for the demo.
