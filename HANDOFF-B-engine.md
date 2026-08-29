# HANDOFF — Person B, Simulation Engine

**Project:** BrickLife — London 2030 · House London #1, Newspeak House, Sat 29 Aug 2026
**Lane:** Person B — `web/src/engine/`
**Status:** Engine complete and tested. **Running on A's real model output** (`is_stub: false`,
33 boroughs). Not committed.

This document is written so another assistant can pick the work up cold. Read it top to
bottom before touching anything.

---

## 1. Where things actually are

This trips up every new session. **The BrickLife code is not in the directory sessions
usually open in.**

| What | Path |
|---|---|
| **The repo (work here)** | `C:\Users\dsouz\OneDrive\Documents\GitHub\brickLife\BrickLife` |
| GitHub remote | `github.com/shawn-d123/BrickLife` |
| **Primers + frozen contract** | `C:\Users\dsouz\OneDrive\Documents\GitHub\brickLife\Primers and refrence MD files\` |
| Unrelated older project | `...\GitHub\Hackathon-Route-planning` (finished April project — *not* this work) |

Read `00-CONTRACTS.md` (the authority) and `PRIMER-B-engine.md` (this lane) before making
design decisions.

### Lane ownership — nobody edits outside their own directory

| Person | Owns |
|---|---|
| A | the `*.py` model scripts (currently at repo root), `web/src/data/predictions.json` |
| **B (us)** | **`web/src/engine/` — entire directory, no JSX in it, ever** |
| C | `web/src/game/` |
| D | `web/src/content/`, `README.md`, places `backtest.png` |

---

## 2. Commands

```bash
cd web && npm test          # 18 engine tests, NO npm install needed (Node 24 strips TS itself)
cd web && npx tsc --noEmit  # typecheck
cd web && npm run dev       # http://localhost:5173
cd web && npm run build     # production build
```

Node 24.19.0 runs `.ts` files directly. That is why `sim.test.ts` needs no test runner and no
build step. It is also why **every relative import inside `engine/` must carry an explicit
`.ts` extension** (`import { x } from "./rng.ts"`). `tsconfig.json` sets
`allowImportingTsExtensions` for this. Do not "tidy" those extensions away — it breaks
`npm test` instantly.

---

## 3. What is built

`web/src/engine/`, ~1,800 lines, 9 files:

| File | Purpose |
|---|---|
| `types.ts` | Contract §3 verbatim + the `predictions.json` shape. Additions are **optional fields only**, each marked `// [B] optional extension`. |
| `rng.ts` | `mulberry32`, `pick`, `pickWeighted`, `range`, `round`, `yearRng(seed, year, stream)`. |
| `finance.ts` | `monthlyPayment`, `balanceAfter`, `interestOver`, `stampDuty`, `netMonthly`, `maxAffordable`, cost constants. |
| `constants.ts` | Years, mortgage term, base rate, living costs, `gbp()`, `pct()`, `clamp()`. |
| `predictions.ts` | The **only** place `predictions.json` is read. Fully defensive — see §6. |
| `events.ts` | Six event families as gated "beats", plus `canAfford` / `depositFor`. |
| `sim.ts` | `rollCircumstances`, `drawScenarioPath`, `simulate`, `counterfactual`. |
| `index.ts` | Barrel — what C imports. |
| `sim.test.ts` | 18 tests. Also validates A's export (§6). |

### The public API (all C ever calls)

```ts
rollCircumstances(seed): Circumstances
drawScenarioPath(seed): ScenarioId[]            // always length 4
simulate(seed, path, decisions): RunState
counterfactual(seed, path, decisions, swap): RunState
```

### Run structure

Year states run **2026 → 2030** (5 states). `path` has 4 entries, one per year advance.
Events fire on this schedule; a beat whose gate is shut is skipped silently and consumes no
decision:

| Year | Event | Gate |
|---|---|---|
| 2026 | `rent_increase` | renting |
| 2026 | `buy_opportunity` | renting **and** the 2026 rent decision was `wait` or `move` |
| 2027 | `rate_change` | owning with a mortgage |
| 2027 | `rent_increase` (2nd) | renting — the renter's alternative to the bank letter |
| 2028 | `household` | always |
| 2029 | `employment` | always |
| 2029 | `mortgage_reset` | owning with a mortgage |

---

## 4. THE RULE THAT OVERRIDES EVERYTHING

> `simulate` is a pure function. Same three arguments in, byte-identical `RunState` out,
> every time, forever.

- **No `Math.random`, `Date.now`, `localStorage`, or module-level mutable state in `engine/`.**
- Never mutate the arguments — build new objects.
- All randomness derives from `mulberry32(seed)`, with a fresh stream per year via
  `yearRng(seed, year, stream)` so adding a 2028 decision cannot change what happened in 2026.

The counterfactual replays the *same* future against a *different* decision. If anything here
goes unseeded, that comparison silently becomes meaningless and the best moment in the demo
dies. A test scans the engine source and fails if the banned words appear in real code (it
strips comments first, so docstrings mentioning them are fine).

The seed itself is drawn **outside** the engine, in C's React state:
`useState(() => Date.now() >>> 0)`.

---

## 5. Design decisions and why — do not undo these

**Affordability: only ~25% of generated lives can buy anything at all.**
This is the headline finding, not a bug. It first came out at 0 of 200; the real blocker is
the 4.5× income cap against a single London salary. It was fixed by correcting things that
were genuinely wrong — salary bands were UK-wide rather than London (median was £26.5k), the
flat on offer was priced at the *borough average* rather than the first-flat market, and the
deposit cap was too tight for family-gift cases — **not** by loosening lending rules. A test
asserts the rate stays between 8% and 83% so nobody "fixes" it by accident. Say the number out
loud in the demo; that room will respect it.

**The scenario hits the player's mortgage directly, not through the model.**
`Mortgage.basePct` stores the rate before any scenario delta. Each year the rate is recomputed
as `basePct + rate_delta_pp`, so a rate shock moves the payment by a real, visible amount and
cannot compound into nonsense over four years. This is the loudest moment in the demo and it
comes from arithmetic.

**`DecisionKind` has no "accept"/"decline", so those map onto existing kinds.**
The frozen union has no member for the partner event or "do nothing" on a rate letter. Rather
than change a frozen contract, `household` accept → `take_lodger` ("they move in", adds
household income) and every decline/do-nothing → `wait`. **Tell C this** so it doesn't look
like a bug in their switch statements.

**"Push back" on a rent rise gives half the increase, not zero.**
Cancelling it outright made waiting a free win and made skipping the purchase costless.
Handled as a special case inside `case "wait"` in `applyDecision`.

**`GameEvent.detail` (optional extension) carries the numbers behind each event.**
Applying a decision uses exactly the figures the player was shown, rather than re-rolling
them. C can ignore this field entirely.

**Wellbeing and stress are gameplay abstractions**, driven off `housingCostRatio` and the cash
position. They are not modelled quantities. D's "what's real" panel must say so.

**Every branch of `applyDecision` is guarded.** Buying what you cannot afford or selling what
you do not own falls through to doing nothing rather than corrupting the run. This matters
because the counterfactual replays decisions against events they were not made for.

---

## 6. The predictions.json integration — LIVE

**A's real export is in place.** `web/src/data/predictions.json` is now `is_stub: false`,
33 boroughs, trained through 2025-03, model `lgbm-quantile x3 + binary; conformalised 80%
interval`. All 18 tests pass against it with **zero engine changes** — which was the whole
point of the adapter.

### How it got there (and the one thing still to fix)

A's `03_train_export.py` line 26 has `OUT = "../web/src/data/predictions.json"`, which assumes
the script lives in `model/` as the contract specifies. A's scripts sit at the **repo root**,
so the export landed at **`BrickLife/predictions.json`** instead. It was copied into
`web/src/data/predictions.json` by hand.

**That copy is manual and will go stale if A reruns the model.** The permanent fix is A's:
move the four `.py` files into `model/` (as the contract says), or change `OUT` to
`"web/src/data/predictions.json"` and run from the repo root. Until then, after any rerun:

```bash
cp predictions.json web/src/data/predictions.json && cd web && npm test
```

### Defensive reads

`predictions.ts` is the single read point and every read is defensive: scenario falls back to
`base` then to a neutral forecast; quantiles are coerced to finite numbers and sorted so
`p10 <= p50 <= p90`; unknown borough codes fall back to the first exported one; missing price
falls back to D's `boroughs.ts` then a constant.

**This was not paranoia.** Testing against a deliberately broken export produced 16 crashes or
NaN runs out of 300. After hardening: 300 of 300 clean. A's real export then turned out to
have exactly one of those defects (below), which the adapter absorbed silently.

### Rent estimation — 27 of 33 boroughs

A's export fills `avg_rent_monthly` for only the six MVP boroughs; the `RENT` dict at
`03_train_export.py` line 182 returns `None` for the other 27, so they arrive as `null`.

Rather than give Richmond and Barking the same flat fallback, `predictions.ts` computes the
**mean gross rental yield** across whichever boroughs *do* carry a rent, and derives the rest
from price. On the current export the six known boroughs sit in a tight 3.37–4.58% band
(mean 3.94%), so the estimate is reasonable and correctly ordered:

| Borough | Price | Rent | Source |
|---|---|---|---|
| Kensington and Chelsea | £1,300,757 | £4,270 | estimated |
| City of Westminster | £856,885 | £2,810 | estimated |
| Brent | £543,292 | £1,780 | estimated |
| Croydon | £391,303 | £1,290 | from export |
| Barking and Dagenham | £356,464 | £1,310 | from export |

It self-calibrates as more rents are filled and disappears entirely once all 33 are present.
Two helpers exist for D's "what's real" panel — **this should be disclosed on screen**:

```ts
rentIsEstimated(code): boolean
estimatedRentCount(): number     // currently 27
```

**Ask A or D to fill the `RENT` dict.** It is a five-minute job and removes the caveat.

### The export validator

Three tests in `sim.test.ts` validate the file directly — borough count, finite and ordered
quantiles under every scenario, `p_decline` in 0–1, fractions not percentages, usable
name/price/rent, and correctly-signed rate deltas. After any model rerun, `npm test` confirms
usability in seconds and names the offending borough if not.

---

## 7. Verification status — what has actually been proven

- **18/18 tests pass against A's real 33-borough export.** Typecheck clean. Build clean.
- Purity verified on both an empty run and a finished run; arguments provably not mutated.
- 60 seeds × 3 play styles all reach 2030 with no impossible state.
- Full playthrough clicked through in a real browser on the real data, no console errors; the
  UI correctly reports "Running on A's real predictions."
- Previously verified against a deliberately corrupted export (missing rents, missing
  scenarios, null prices, crossed quantiles): 300/300 runs clean.

---

## 8. Open items and blockers

### BLOCKER — nothing is committed
The entire `web/` tree, `.gitignore`, `HANDOFF-B-engine.md` and `.claude/launch.json` are
untracked. The work exists only on this disk. A `.gitignore` is in place so `node_modules` and
`dist` stay out; total committed payload is ~1.9 MB, which is fine. There are also two
unstaged deletions (`backtest_rolling.parquet`, `metrics.json` at root — A moved them into
`outputs/`) that should be resolved in the same commit. **This is the single biggest risk.**

### Item — A's export path is manual (see §6)
Move the `.py` files into `model/`, or fix `OUT`. Until then re-copy after every rerun.

### Item — 27 boroughs have estimated rents (see §6)
Ask A or D to fill the `RENT` dict in `03_train_export.py`.

### Item — files that belong to other people
Written as placeholders because they were not on main when the engine needed them. Each is
marked "owned by [X], overwrite freely" at the top. **Tell the owners so they overwrite rather
than add alongside:**

- `web/src/content/boroughs.ts`, `web/src/content/copy.ts` (D) — verbatim from the contract.
- `web/src/game/App.tsx` (C) — a throwaway engine smoke harness that *is* the contract's
  integration, working. C copies the six lines that matter and deletes the rest.
- `web/` scaffold, `index.html`, `main.tsx`, `vite.config.ts`, `tsconfig.json`, `package.json`
  — unowned; the repo was bare and someone had to scaffold it.

### Item — model quality caveats (A's lane, affects the pitch)
From the shipped export's `meta`:

- **Good:** test MAE **0.0414** beats persistence (**0.0616**) *and* London-wide growth
  (**0.0476**). That clears the "common-factor trap" the plan warned about — this is the
  number to show, and it is a genuinely defensible result.
- **Weak:** `direction_acc` **0.605** is *below* `direction_acc_majority` **0.660** — worse
  than always guessing the majority class. Per-year it degrades badly (2023: 0.477, 2024: 0.437).
- **Weak:** `brier` **0.297** is *worse* than `brier_baserate` **0.253** — the decline
  probability underperforms the base rate.
- Raw 80% coverage was 0.490 against a target of 0.80; conformal padding lifts it to **0.836**.

**Implication for the game:** the *bands* are defensible, the *direction and decline
probability are not*. `p_decline` flows into `YearState.outlook`. Do not make it a headline
number on screen, and if a judge asks, say plainly that the interval is calibrated but the
directional classifier does not beat its baseline. That room will respect the honesty far more
than a claim they can poke a hole in.

---

## 9. Gotchas that cost time — do not rediscover these

- **Counterfactual borough swap.** The primer's example swaps a purchase to Barking
  (`E09000002`). If the player *already* bought there it is a no-op and both endings look
  identical. Pick a borough the player did not choose. C needs telling.
- **TypeScript narrows `.every()`.** `path.every(s => s === "base")` makes TS 5.5+ infer a type
  predicate and narrow `path` to `"base"[]`, breaking the next assignment. Annotate the
  callback return as `: boolean`.
- **JSON imports need `with { type: "json" }`.** This is the one form that works in *both*
  Node's type stripping and Vite/esbuild.
- **Bash heredocs choke on the larger TS files.** Use the Write tool for anything substantial;
  a silent parse failure wrote nothing at all once.
- **`.claude/launch.json` is read from the primary working directory**, not the repo you are
  editing. The `bricklife-web` entry was added to the Hackathon-Route-planning one, pointing at
  this repo's `web/` via `npm --prefix`.
- **Check where A's files actually landed.** The export was at the repo root, not
  `web/src/data/`, and the app happily kept running on the stub with `is_stub: true`. Always
  confirm `is_stub` rather than assuming a swap worked.

---

## 10. If you are short of time

Per `PRIMER-B-engine.md`, B is done building and becomes a second pair of hands on C. Priority
order from here:

1. **Commit and push.** Everything else is worthless if this is lost.
2. **Tell C** about `App.tsx`, the `DecisionKind` mapping, and the borough-swap gotcha.
3. **Tell D** their content files are placeholders, that `is_stub` is now `false`, and that
   27 boroughs carry estimated rents that the "what's real" panel should disclose.
4. **Ask A** to fix the export path and fill the `RENT` dict.
5. Help C render. Do not add engine features. If time runs out, the minimum viable demo is
   three events — `rent_increase`, `buy_opportunity`, `rate_change` — plus the counterfactual.
   **Never cut the counterfactual.**

---

## 11. Working style to continue in

Verify rather than assert — every claim in §7 was produced by actually running something. When
a test fails, work out whether the code or the expectation is wrong before changing either;
three of the failures during this build were bad test expectations, not bugs. Keep the honest
number (the 25% affordability rate) rather than tuning it away. Stay inside the engine lane,
and when another lane's file is missing or misplaced, write a clearly-labelled placeholder or
make the adapter absorb it — then tell the owner, and record the permanent fix here rather than
leaving a silent manual step.
