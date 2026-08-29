# BRICKLIFE — Shared Contracts

**Freeze this at 11:50. Everything in this file is agreed by all four people before anyone
writes a feature.** After 11:50 the four lanes do not need to talk to each other except at
merge time.

Changing anything in this file after 11:50 requires all four people to stop and agree.
Adding an optional field is fine. Renaming or removing one is not.

> **Amendment — 2026-08-29, Lane A.** Borough coverage extended from the MVP six to
> **all 33**. `boroughs.ts` (section 4) now lists every borough with real average
> prices (UK HPI, latest month) and real average rents (ONS Price Index of Private
> Rents, latest month; City of London imputed). `predictions.json` covers all 33
> with `avg_rent_monthly` populated everywhere, plus a new optional per-borough
> `rent_source` string. No field renamed or removed — additive only. Other three
> lanes: re-sync `boroughs.ts` and confirm the outlook screen handles 33 entries.

---

## 1. Repo layout and ownership

**Nobody edits outside their own directory.** This is what stops merge conflicts when four
people push every hour.

```
bricklife/
├── data/
│   └── raw/
│       ├── uk-hpi-full.csv              [A]  committed before the event
│       ├── boe_bank_rate.csv            [A]  BoE Bank Rate (series IUDBEDR)
│       ├── ons_pipr_monthly.xlsx        [A]  ONS Price Index of Private Rents
│       └── london_borough_rent.csv      [A]  built by 05_rents.py (price + rent, 33)
├── model/                                [A]  entire directory
│   ├── 01_build_panel.py
│   ├── 02_baselines.py
│   ├── 03_train_export.py
│   ├── 04_backtest_chart.py
│   ├── 05_rents.py
│   └── outputs/
│       ├── metrics.json
│       └── backtest.png                 →  copied to web/public/
├── web/
│   ├── public/
│   │   ├── backtest.png                 [A drops, D places]
│   │   └── assets/sprites/              [C]
│   └── src/
│       ├── engine/                       [B]  entire directory, no JSX in here
│       │   ├── types.ts                  ← the contract in section 3
│       │   ├── rng.ts
│       │   ├── finance.ts
│       │   ├── events.ts
│       │   ├── sim.ts
│       │   └── sim.test.ts
│       ├── game/                         [C]  entire directory
│       │   ├── App.tsx
│       │   ├── scenes/
│       │   └── components/
│       ├── content/                      [D]  entire directory
│       │   ├── copy.ts
│       │   ├── boroughs.ts
│       │   ├── WhatsReal.tsx
│       │   └── Evidence.tsx
│       └── data/
│           └── predictions.json          [D stubs 12:15 → A replaces 15:00]
└── README.md                             [D]
```

**Shared files, touch with care:**
- `web/src/data/predictions.json` — D writes the stub, A overwrites it at 15:00. Nobody else
  ever edits it.
- `web/src/engine/types.ts` — B owns it, but it is the contract. B announces any change.

---

## 2. Contract 1 — `predictions.json`

**Produced by:** A (real, 15:00) and D (stub, 12:15)
**Consumed by:** B (market moves) and C (outlook screen)

D hand-writes this at 12:15 with invented numbers in exactly this shape. B and C build
against the fake for three hours. A drops the real one in at 15:00 and nothing else changes.

```jsonc
{
  "meta": {
    "trained_through": "2024-12",
    "model": "lgbm-quantile + binary",
    "test_window": "2022-01 to 2024-12",
    "embargo_months": 12,
    "test_mae": 0.0412,
    "baseline_mae_persistence": 0.0455,
    "baseline_mae_london": 0.0438,
    "baseline_mae_mean": 0.0601,
    "direction_acc": 0.71,
    "direction_acc_majority": 0.66,
    "coverage_80": 0.81,
    "brier": 0.142,
    "brier_baserate": 0.171,
    "is_stub": true                     // A sets this false. D's stub sets it true.
  },

  "scenarios": {
    "base":       { "label": "Steady as she goes", "rate_delta_pp":  0.0 },
    "rate_shock": { "label": "Rates stay high",    "rate_delta_pp":  1.5 },
    "rate_cuts":  { "label": "Borrowing eases",    "rate_delta_pp": -1.25 }
  },

  "boroughs": {
    "E09000031": {
      "name": "Waltham Forest",
      "avg_price": 512000,
      "avg_rent_monthly": 1480,
      "forecast": {
        "base":       { "p10": -0.031, "p50":  0.018, "p90": 0.062, "p_decline": 0.31 },
        "rate_shock": { "p10": -0.068, "p50": -0.012, "p90": 0.031, "p_decline": 0.58 },
        "rate_cuts":  { "p10": -0.004, "p50":  0.041, "p90": 0.089, "p_decline": 0.14 }
      },
      "drivers": {
        "up":   ["Recent momentum", "Transaction recovery"],
        "down": ["Affordability", "Borrowing costs"]
      }
    }
    // ... one entry per borough. Minimum 6 for the MVP, all 33 if A has time.
  }
}
```

**Rules:**
- `p10 <= p50 <= p90` always. A sorts them before export if quantiles cross.
- Growth figures are **fractions**, not percentages. `0.018` is 1.8%.
- `p_decline` is 0–1.
- `rate_delta_pp` is percentage points added to the mortgage rate under that scenario.
  **B applies this directly to the player's mortgage**, separately from the model forecast.
- If `is_stub` is `true`, D's "what's real" panel must say so on screen.
- `avg_rent_monthly` is populated for **all 33 boroughs** from ONS Price Index of
  Private Rents (latest month). City of London is not published by ONS and is
  imputed at the median gross yield of the other 32. Each borough carries an
  optional `rent_source` string ("ONS PIPR YYYY-MM" or "imputed …") so D's panel
  can be honest about the one estimate.

**All 33 boroughs ship** with real prices, rents and forecasts (Amendment
2026-08-29). These six stay the demo reference set, spread across the
affordability range:
Waltham Forest `E09000031`, Hackney `E09000012`, Newham `E09000025`,
Barking & Dagenham `E09000002`, Croydon `E09000008`, Camden `E09000007`.

---

## 3. Contract 2 — the engine API

**Produced by:** B · **Consumed by:** C

C only ever calls **one function**: `simulate`. C holds the decision log in React state.
Adding a decision means appending to the array and calling `simulate` again. That is the
whole integration.

```ts
// web/src/engine/types.ts

export type BoroughCode = string;                       // "E09000031"
export type ScenarioId  = "base" | "rate_shock" | "rate_cuts";
export type Tenure      = "renting" | "owning";

export type DecisionKind =
  | "accept_rent" | "move" | "buy" | "wait"
  | "remortgage"  | "sell" | "take_lodger" | "accept_job";

export interface Decision {
  year: number;                 // 2026 .. 2029
  kind: DecisionKind;
  borough?: BoroughCode;        // for "move" and "buy"
  price?: number;               // for "buy"
}

export interface Circumstances {
  name: string;
  spriteId: 0 | 1 | 2;
  age: number;
  borough: BoroughCode;
  career: string;               // "Junior Developer"
  salary: number;               // gross annual
  savings: number;
  rentMonthly: number;
  familySupport: "none" | "limited" | "strong";
}

export interface Mortgage {
  balance: number;
  ratePct: number;              // 4.75 means 4.75%
  monthly: number;
  monthsRemaining: number;
}

export interface YearState {
  year: number;                 // 2026 .. 2030
  age: number;
  borough: BoroughCode;
  tenure: Tenure;

  cash: number;
  salary: number;
  netMonthly: number;           // after tax and NI
  rentMonthly: number;          // 0 when owning
  mortgage: Mortgage | null;

  propertyValue: number;        // 0 when renting
  equity: number;
  netWorth: number;
  housingCostRatio: number;     // 0..1, housing / net income

  wellbeing: number;            // 0..100, gameplay abstraction
  stress: number;               // 0..100, gameplay abstraction

  scenario: ScenarioId;
  marketMove: number;           // realised borough growth this year, fraction
  totalRentPaid: number;
  totalMortgagePaid: number;
}

export interface GameEvent {
  id: string;                                  // "rent_increase_2026"
  kind: "rent_increase" | "buy_opportunity" | "rate_change"
      | "household" | "employment" | "mortgage_reset";
  npc: "landlord" | "estate_agent" | "bank" | "partner" | "employer";
  year: number;
  headline: string;                            // from D's copy.ts
  body: string;
  facts: { label: string; before?: string; after?: string; value?: string }[];
  choices: { kind: DecisionKind; label: string; borough?: BoroughCode; price?: number }[];
}

export interface RunState {
  circumstances: Circumstances;
  years: YearState[];           // one per completed year, index 0 = 2026
  current: YearState;           // where the player is right now
  pending: GameEvent | null;    // null means the run is finished
  finished: boolean;
  log: Decision[];
}

// ---------- the four functions C calls ----------

export function rollCircumstances(seed: number): Circumstances;

export function drawScenarioPath(seed: number): ScenarioId[];   // always length 4

export function simulate(
  seed: number,
  path: ScenarioId[],
  decisions: Decision[]
): RunState;

export function counterfactual(
  seed: number,
  path: ScenarioId[],
  decisions: Decision[],
  swap: (d: Decision) => Decision
): RunState;
```

### The purity rule

`simulate` **must** be a pure function. Same three arguments in, byte-identical `RunState`
out, every time, forever.

- **No `Math.random()` anywhere in `web/src/engine/`.** Everything random comes from
  `mulberry32(seed)` in `rng.ts`.
- No `Date.now()`, no `localStorage`, no module-level mutable state.
- No mutation of the arguments. Build new objects.

If this breaks, the counterfactual screen produces nonsense and you lose the best moment in
the demo. **Check it at 14:00:** call `simulate` twice with identical arguments and
`JSON.stringify` both results. They must be equal.

### How C drives it

```tsx
const [seed]      = useState(() => Date.now() >>> 0);   // once, at "New life", outside the engine
const [path]      = useState(() => drawScenarioPath(seed));
const [decisions, setDecisions] = useState<Decision[]>([]);

const run = simulate(seed, path, decisions);            // recompute every render, it's cheap

function choose(choice: GameEvent["choices"][number]) {
  setDecisions(ds => [...ds, {
    year: run.current.year, kind: choice.kind,
    borough: choice.borough, price: choice.price
  }]);
}

// at the end, the counterfactual is free:
const ifWaited = counterfactual(seed, path, decisions,
  d => d.kind === "buy" ? { ...d, kind: "wait" } : d);
```

---

## 4. Contract 3 — copy and content

**Produced by:** D · **Consumed by:** B (event text) and C (screen text)

```ts
// web/src/content/copy.ts

export const EVENT_COPY: Record<string, { headline: string; body: string }> = {
  rent_increase:   { headline: "Your landlord is raising the rent",
                     body: "The tenancy is up for renewal and the new figure is on the table." },
  buy_opportunity: { headline: "A flat has come on the market",
                     body: "Two bedrooms, ten minutes from the station, and the agent is keen." },
  rate_change:     { headline: "Your lender has written to you", body: "..." },
  household:       { headline: "Your partner wants to move in",   body: "..." },
  employment:      { headline: "You have been offered a new role", body: "..." },
  mortgage_reset:  { headline: "Your fixed rate is ending",       body: "..." },
};

export const SCENARIO_COPY: Record<ScenarioId, { title: string; line: string }> = {
  base:       { title: "Steady as she goes", line: "Nothing much changes. Which is its own kind of news." },
  rate_shock: { title: "Rates stay high",    line: "Borrowing costs hold above expectations for another year." },
  rate_cuts:  { title: "Borrowing eases",    line: "Rates fall faster than forecasters expected." },
};

export const CAREERS = ["Junior Developer", "Nurse", "Teaching Assistant",
                        "Barista", "Account Manager", "Care Worker"];
```

```ts
// web/src/content/boroughs.ts
// All 33 London boroughs. Values from Lane A (Amendment 2026-08-29):
//   avgPrice -- UK HPI full file, latest month per borough
//   avgRent  -- ONS Price Index of Private Rents, latest month
//              (City of London: ONS does not publish it -> imputed at median yield)
// predictions.json carries the same numbers plus per-borough rent_source.

export const BOROUGHS = [
  { code: "E09000002", name: "Barking and Dagenham",   avgPrice:  356464, avgRent: 1696 },
  { code: "E09000003", name: "Barnet",                 avgPrice:  585670, avgRent: 1945 },
  { code: "E09000004", name: "Bexley",                 avgPrice:  405250, avgRent: 1534 },
  { code: "E09000005", name: "Brent",                  avgPrice:  543292, avgRent: 2012 },
  { code: "E09000006", name: "Bromley",                avgPrice:  515593, avgRent: 1681 },
  { code: "E09000007", name: "Camden",                 avgPrice:  799206, avgRent: 2800 },
  { code: "E09000001", name: "City of London",         avgPrice:  626489, avgRent: 2322 }, // rent imputed
  { code: "E09000033", name: "City of Westminster",    avgPrice:  856885, avgRent: 3179 },
  { code: "E09000008", name: "Croydon",                avgPrice:  391303, avgRent: 1581 },
  { code: "E09000009", name: "Ealing",                 avgPrice:  570211, avgRent: 2085 },
  { code: "E09000010", name: "Enfield",                avgPrice:  467558, avgRent: 1821 },
  { code: "E09000011", name: "Greenwich",              avgPrice:  470363, avgRent: 1980 },
  { code: "E09000012", name: "Hackney",                avgPrice:  616278, avgRent: 2644 },
  { code: "E09000013", name: "Hammersmith and Fulham", avgPrice:  736006, avgRent: 2796 },
  { code: "E09000014", name: "Haringey",               avgPrice:  642235, avgRent: 2213 },
  { code: "E09000015", name: "Harrow",                 avgPrice:  529169, avgRent: 1773 },
  { code: "E09000016", name: "Havering",               avgPrice:  444227, avgRent: 1564 },
  { code: "E09000017", name: "Hillingdon",             avgPrice:  471602, avgRent: 1565 },
  { code: "E09000018", name: "Hounslow",               avgPrice:  505371, avgRent: 1945 },
  { code: "E09000019", name: "Islington",              avgPrice:  684506, avgRent: 2854 },
  { code: "E09000020", name: "Kensington and Chelsea", avgPrice: 1300757, avgRent: 3629 },
  { code: "E09000021", name: "Kingston upon Thames",   avgPrice:  565988, avgRent: 1807 },
  { code: "E09000022", name: "Lambeth",                avgPrice:  549780, avgRent: 2519 },
  { code: "E09000023", name: "Lewisham",               avgPrice:  492857, avgRent: 1828 },
  { code: "E09000024", name: "Merton",                 avgPrice:  612269, avgRent: 2153 },
  { code: "E09000025", name: "Newham",                 avgPrice:  398566, avgRent: 1927 },
  { code: "E09000026", name: "Redbridge",              avgPrice:  492434, avgRent: 1724 },
  { code: "E09000027", name: "Richmond upon Thames",   avgPrice:  788952, avgRent: 2318 },
  { code: "E09000028", name: "Southwark",              avgPrice:  569158, avgRent: 2431 },
  { code: "E09000029", name: "Sutton",                 avgPrice:  451049, avgRent: 1553 },
  { code: "E09000030", name: "Tower Hamlets",          avgPrice:  455666, avgRent: 2439 },
  { code: "E09000031", name: "Waltham Forest",         avgPrice:  526831, avgRent: 1765 },
  { code: "E09000032", name: "Wandsworth",             avgPrice:  677165, avgRent: 2620 },
];
```

---

## 5. Integration checkpoints

| Time | Who | What must be true |
|---|---|---|
| **11:50** | All | This file is agreed. Repo created, everyone has pushed an empty file in their own directory so the folders exist. |
| **12:15** | D → all | Stub `predictions.json` and `boroughs.ts` are on `main`. B and C are unblocked. |
| **12:15** | A | B0/B1/B2 baseline MAE printed. This is the idea-lock deliverable. |
| **13:30** | B → C | `simulate` returns a valid `RunState` with hardcoded market moves. C can render it. |
| **14:00** | All | **Purity check.** `JSON.stringify(simulate(1,p,d)) === JSON.stringify(simulate(1,p,d))`. **Go/no-go on the model.** |
| **15:00** | A → all | Real `predictions.json` on `main`, `is_stub: false`. |
| **15:30** | B | Engine reads real predictions. Market moves come from `p50` plus seeded noise inside the `p10`–`p90` band. |
| **16:00** | All | **Feature freeze.** Full playthrough works end to end. |
| **16:30** | D | Screen recording captured. |
| **16:45** | D | Submitted. |

---

## 6. Two commands everyone should be able to run

```bash
# model
cd model && python 03_train_export.py      # writes web/src/data/predictions.json

# game
cd web && npm run dev                      # http://localhost:5173
```

If either of these does not work on your machine by 12:30, say so in the group chat rather
than debugging quietly for an hour.
