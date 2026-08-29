# HANDOFF — Person B, Simulation Engine

**Project:** BrickLife — London 2030 · House London #1, Newspeak House, Sat 29 Aug 2026
**Lane:** Person B — `web/src/engine/`
**Status:** Engine complete, tested, committed and pushed. Verified against A's latest
33-borough real-rent export in a throwaway swap — **but that export is not yet in the live
app**, because it landed in the wrong folder (again — see §6). One `cp` away from fully live.

This document is written so another assistant (GPT or otherwise) can pick the work up cold.
Read it top to bottom before touching anything. It supersedes any earlier version of this
file you may find in chat history — this one reflects the state **after** `git pull`.

---

## 1. Where things actually are

This trips up every new session. **The BrickLife code is not in the directory sessions
usually open in.**

| What | Path |
|---|---|
| **The repo (work here)** | `C:\Users\dsouz\OneDrive\Documents\GitHub\brickLife\BrickLife` |
| GitHub remote | `github.com/shawn-d123/BrickLife` |
| **Primers + original frozen contract** | `C:\Users\dsouz\OneDrive\Documents\GitHub\brickLife\Primers and refrence MD files\` |
| **Amended contract (now also in-repo)** | `BrickLife/00-CONTRACTS.md` — A added a copy with an amendment note at the top; verified byte-identical to the original in the section that matters to us (§4 below) |
| Unrelated older project | `...\GitHub\Hackathon-Route-planning` (finished April project — *not* this work) |

Read `00-CONTRACTS.md` at the repo root (it is now the live copy, amended) and
`PRIMER-B-engine.md` in the primers folder before making design decisions.

### Lane ownership — nobody edits outside their own directory

| Person | Owns | Status as of this handoff |
|---|---|---|
| A | model scripts (root, should be `model/`), `predictions.json` | 33 boroughs, real rents, pushed — see §6 for the path issue |
| **B (us)** | **`web/src/engine/` — entire directory, no JSX in it, ever** | **done, committed, pushed** |
| C | `web/src/game/` | not started — `App.tsx` is still B's throwaway harness |
| D | `web/src/content/`, `README.md` | not synced — `boroughs.ts` still has only 6 of 33 boroughs |

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

`web/src/engine/`, ~1,800 lines, 9 files, all committed on `main`:

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
| `sim.test.ts` | 18 tests. Also validates any predictions.json placed at `web/src/data/`. |

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

**This is verified, not asserted:** confirmed against the current `00-CONTRACTS.md` at the
repo root — A's amendment (see §6) touched only borough coverage; Section 3 (the engine
contract, `types.ts`) diffs **byte-identical** to the original frozen version in the primers
folder. Nothing about the API or the purity rule has changed.

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

## 6. The predictions.json integration — the ONE thing left to do

### Current live state

`web/src/data/predictions.json` — the file the app and `npm test` actually read — has
**`is_stub: false`, 33 boroughs, but only 6 of them with real rent.** The other 27 use the
engine's yield-derived estimate (see below). This is a snapshot from earlier today, copied in
by hand from A's first export.

### What just arrived and is NOT yet applied

A pushed a new commit (`02da6e9`, "Lane A: ONS rents for all 33 boroughs...") containing a
fresh `predictions.json` with **real ONS-sourced rent for all 33 boroughs** (field
`rent_source: "ONS PIPR 2026-07"` on each). This file landed at:

```
BrickLife/predictions.json          <- the fresh one, repo root, NOT live
BrickLife/web/src/data/predictions.json   <- what the app reads, still the OLDER copy
```

**This is the exact same path bug as before, recurring.** `03_train_export.py` line 26 is
`OUT = "../web/src/data/predictions.json"`, which only resolves correctly if the script is run
from inside a `model/` subdirectory. The README now documents `cd model && python
03_train_export.py`, but **no `model/` directory exists in the repo** — the `.py` files are
still sitting at the repo root. So every time A reruns the export, it writes one level up from
where the app actually looks, and someone has to notice and copy it by hand.

### The one thing to do

```bash
cp predictions.json web/src/data/predictions.json
cd web && npm test
```

**This was verified to work in this session** — swapped the fresh file into place temporarily,
ran the full suite: typecheck clean, 18/18 tests pass, `estimatedRentCount()` correctly drops
to 0 of 33 (no more estimation needed, every borough now has real ONS rent). Then the working
tree was restored to the pulled state, so the live app is still on the older file as of this
handoff. **Do the `cp` above, rerun `npm test` to confirm, then commit.**

**Permanent fix, still not done:** ask A to either move the four/five `.py` scripts into
`model/` (as both contracts specify) or change `OUT` and `PANEL` to resolve from the repo
root. Until one of those happens, this manual copy-and-verify step will be needed after every
model rerun.

### The contract amendment (confirmed safe)

A also amended `00-CONTRACTS.md` and committed it into the repo (previously it only lived in
the primers folder). The amendment note, verbatim:

> **Amendment — 2026-08-29, Lane A.** Borough coverage extended from the MVP six to **all
> 33**. `boroughs.ts` (section 4) now lists every borough with real average prices (UK HPI,
> latest month) and real average rents (ONS Price Index of Private Rents, latest month; City
> of London imputed). `predictions.json` covers all 33 with `avg_rent_monthly` populated
> everywhere, plus a new optional per-borough `rent_source` string. No field renamed or
> removed — additive only. Other three lanes: re-sync `boroughs.ts` and confirm the outlook
> screen handles 33 entries.

Verified in this session by diffing the two contract files: **Section 3 (the engine API,
`types.ts`) is byte-for-byte identical** to the original frozen version. The amendment only
touches borough coverage and is additive, exactly as it claims. No engine change required.

### Defensive reads (already handles all of the above)

`predictions.ts` is the single read point and every read is defensive: scenario falls back to
`base` then to a neutral forecast; quantiles are coerced to finite numbers and sorted so
`p10 <= p50 <= p90`; unknown borough codes fall back to the first exported one; missing price
falls back to D's `boroughs.ts` then a constant.

**Rent estimation, for as long as any borough is missing one:** rather than a flat fallback,
`predictions.ts` computes the mean gross rental yield across whichever boroughs *do* carry a
real rent, and derives the rest from price at that yield. This is what covered the 27 missing
boroughs before A's latest push, and it disappears automatically (drops to 0 estimated) the
moment the file in §6 is swapped in. Two helpers exist for D's "what's real" panel:

```ts
rentIsEstimated(code): boolean
estimatedRentCount(): number
```

**Once the `cp` above is done, `estimatedRentCount()` returns 0 — tell D this can come off the
"what's real" panel, or be left in as evidence of the pipeline working.**

### The export validator

Three tests in `sim.test.ts` validate the file directly — borough count, finite and ordered
quantiles under every scenario, `p_decline` in 0–1, fractions not percentages, usable
name/price/rent, and correctly-signed rate deltas. After any model rerun, `npm test` confirms
usability in seconds and names the offending borough if not.

---

## 7. Verification status — what has actually been proven

- **18/18 tests pass** against both the currently-live file and A's fresh 33-real-rent export
  (tested via a temporary swap in this session, then reverted — see §6).
- Typecheck clean, production build clean.
- Purity verified on both an empty run and a finished run; arguments provably not mutated.
- 60 seeds × 3 play styles all reach 2030 with no impossible state.
- Full playthrough clicked through in a real browser, no console errors.
- Previously verified against a deliberately corrupted export (missing rents, missing
  scenarios, null prices, crossed quantiles): 300/300 runs clean.
- Confirmed via git log that D and C have not touched their lanes since the engine was
  committed — nothing to re-sync with on their side yet.
- Confirmed via diff that the amended `00-CONTRACTS.md` leaves the engine's API section
  byte-identical.

---

## 8. Open items and blockers

### Not a blocker anymore — everything is committed and pushed
Repo history: `part1` (this engine + scaffold) → `Lane A: ONS rents...` (A's 33-borough
update) → a clean merge, all on `origin/main`. `git status` is clean. This was the single
biggest risk in the previous handoff; it is resolved.

### The one live action item — apply A's fresh export (see §6 in full)
```bash
cp predictions.json web/src/data/predictions.json && cd web && npm test
```
Verified to work. Not yet applied to the tracked file as of this handoff.

### A's export path is still broken (see §6)
Ask A to move the `.py` scripts into `model/`, or fix the `OUT`/`PANEL` paths. This will keep
recurring otherwise.

### D has not synced `boroughs.ts`
Still 6 of 33 boroughs. A's amendment explicitly asked for this. Not a blocker for the engine
— `predictions.json` is authoritative and will cover all 33 once the copy above is done — but
C's UI may read `boroughs.ts` directly, so D should still do it.

### C has not started
`web/src/game/App.tsx` is still B's throwaway smoke-test harness — the exact integration from
the contract, working, meant to be copied from and then deleted. No conflict risk yet, but
worth checking in on.

### Model quality caveats (A's lane, affects the pitch)
From the shipped export's `meta` (unchanged by the rent update):

- **Good:** test MAE **0.0414** beats persistence (**0.0616**) *and* London-wide growth
  (**0.0476**). That clears the "common-factor trap" the plan warned about — this is the
  number to show, and it is a genuinely defensible result.
- **Weak:** `direction_acc` **0.605** is *below* `direction_acc_majority` **0.660** — worse
  than always guessing the majority class. Per-year it degrades badly (2023: 0.477, 2024:
  0.437).
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

- **Check `is_stub` and the actual file path, never assume a swap worked.** This happened
  twice: A's export landed at repo root, not `web/src/data/`, and the app kept quietly running
  on the stub / stale file both times with no error. Always confirm
  `require('./web/src/data/predictions.json').meta.is_stub` directly.
- **Check git log before assuming a lane caught up.** `git log --oneline -- <path>` is the
  fast way to see whether D or C have touched their files since your last check, rather than
  re-reading everything.
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
  editing. The `bricklife-web` entry was added to a different repo's config, pointing at this
  repo's `web/` via `npm --prefix`.
- **When told "don't make changes, just answer" and you need to verify something,** copy the
  file, test, then explicitly restore the working tree and confirm `git status` is clean
  again before reporting back. Verifying and leaving a mess behind is not the same as not
  making changes.

---

## 10. If you are short of time

Per `PRIMER-B-engine.md`, B is done building and becomes a second pair of hands on C. Priority
order from here:

1. **Apply the pending `cp` from §6 and re-run `npm test`, then commit.** This is the only
   thing standing between the app and fully-real data for all 33 boroughs.
2. **Tell A** to fix the export path so this stops recurring.
3. **Tell D** their content files are placeholders — `boroughs.ts` needs the 33-borough sync
   the amendment asked for.
4. **Tell C** about `App.tsx` (copy from it, then delete it), the `DecisionKind` mapping in
   §5, and the borough-swap gotcha in §9.
5. Help C render. Do not add engine features. If time runs out, the minimum viable demo is
   three events — `rent_increase`, `buy_opportunity`, `rate_change` — plus the counterfactual.
   **Never cut the counterfactual.**

---

## 11. Working style to continue in

Verify rather than assert — every claim in §7 was produced by actually running something, not
by reading a commit message and assuming it worked. When a test fails, work out whether the
code or the expectation is wrong before changing either; several failures during this build
were bad test expectations, not bugs. Keep the honest number (the 25% affordability rate)
rather than tuning it away. Stay inside the engine lane, and when another lane's file is
missing or misplaced, write a clearly-labelled placeholder or make the adapter absorb it —
then tell the owner, and record the permanent fix here rather than leaving a silent manual
step. When asked to just report status without changing anything, verify by testing in a
throwaway swap and always leave the working tree exactly as you found it.
