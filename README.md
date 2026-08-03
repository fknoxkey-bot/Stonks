# Stonks

A single-user portfolio review app. It tracks positions, updates prices
automatically, and runs a weekly review that surfaces what needs a decision.

**It is a discipline enforcement tool, not a signal generator.**

- It has no brokerage connection and cannot place an order. Read-only by design.
- It never renders a bare buy/sell directive. Every AI-generated idea carries a
  case for, a case against, and who the idea is wrong for.
- Rules produce flags. Flags produce questions. A rule states the arithmetic
  that tripped it and asks you something; it does not decide.
- Every AI claim carries a source URL. If the model can't cite it, it isn't
  rendered.
- Every brief is stored permanently, including the ones that fail validation,
  so in six months you can count how often it was right.

---

## Setup

You need **Node 20 or newer** — check with `node -v`; if that errors or shows
something lower, get the LTS installer from [nodejs.org](https://nodejs.org).

Then, from the project folder:

```bash
npm run setup     # installs, creates .env.local, builds the database
npm run dev       # http://localhost:3000
```

That's it. `npm run setup -- --seed` loads a sample portfolio that trips five
rules if you want something to look at first; `npm run db:reset` wipes it clean
again.

Leave the `npm run dev` terminal open — closing it stops the app. Start it
again the same way.

### If you'd rather not use git

You don't need it. On the GitHub page: **Code → Download ZIP**, then double-click
the download to unzip it. Open Terminal, type `cd ` (with a space), drag the
unzipped folder from Finder onto the Terminal window — that fills in the path —
and press Enter. You're now in the project folder and the two commands above
work.

### What runs without any API keys

Everything except the AI features. Positions, the rules engine, flags,
snapshots, history and the playbook all work with a completely empty
`.env.local`. Each feature that needs a key degrades to a visible "not
configured" panel rather than crashing.

`better-sqlite3` is a native module and compiles during install. On macOS that
needs Xcode Command Line Tools; if install fails asking for them, run
`xcode-select --install` and try again.

| Command | What it does |
| --- | --- |
| `npm run setup` | One-command install: dependencies, `.env.local`, database |
| `npm run dev` | Development server |
| `npm test` | Vitest with coverage thresholds |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Reset to the sample portfolio |
| `npm run db:reset` | Delete the database and re-migrate |
| `npm run cron:dev` | Weekly scheduler (add `-- now` to fire once) |
| `npm run build` / `npm start` | Production build and serve |

---

## Environment variables

All of these live in `.env.local`, which is gitignored. `.env.example` is
committed with empty values.

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `FINNHUB_API_KEY` | Price updates (primary) | [finnhub.io/register](https://finnhub.io/register) → free account → Dashboard → API Key |
| `ALPHA_VANTAGE_API_KEY` | Price updates (fallback) | [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key) → free key, emailed instantly |
| `ANTHROPIC_API_KEY` | Weekly brief, gap analysis | [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys → Create Key |
| `RESEND_API_KEY` | Emailing the brief | [resend.com](https://resend.com) → sign up → API Keys → Create |
| `BRIEF_FROM_EMAIL` | Emailing the brief | A domain verified in Resend, or `onboarding@resend.dev` for testing |
| `BRIEF_TO_EMAIL` | Emailing the brief | Wherever you read email |
| `CRON_SECRET` | Securing the cron route | Generate: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
| `ANTHROPIC_MODEL` | Optional | Defaults to `claude-opus-5` |
| `ANTHROPIC_EFFORT` | Optional | `low`–`max`. Defaults to `max` |
| `APP_URL` | Optional | Defaults to `http://localhost:3000` |
| `DATABASE_PATH` | Optional | Defaults to `./data/portfolio.db` |

**What breaks without each one:**

- No `FINNHUB_API_KEY` / `ALPHA_VANTAGE_API_KEY` → positions are valued at cost
  basis and labelled as such. Every rule that doesn't need a live price still
  runs. You can still enter and edit everything by hand.
- No `ANTHROPIC_API_KEY` → the Brief view shows "not configured". The archive
  still renders every brief already generated — it's a record, not a live
  feature.
- No Resend variables → the brief is still generated, validated, stored and
  readable in the app. It just isn't emailed.
- No `CRON_SECRET` → the cron route accepts calls from localhost only. Set it
  before deploying anywhere.

---

## Market data: why Finnhub

Evaluated Finnhub, Alpha Vantage, and Twelve Data.

| | Free tier limit | Practical meaning |
| --- | --- | --- |
| **Finnhub** | 60 calls/min | Refresh whenever you like |
| Twelve Data | 8 calls/min, 800/day | Workable, but the per-minute cap bites on a batch refresh |
| Alpha Vantage | 25 calls/day | One refresh of a 20-position portfolio uses the whole day |

**Finnhub is primary.** The rate limit is the deciding factor. This app caches
for an hour per ticker, so a 20-position portfolio refreshed hourly during
market hours costs about 130 calls/day — comfortable on Finnhub, impossible on
Alpha Vantage, and tight enough on Twelve Data's per-minute cap that a batch
refresh needs throttling.

**Alpha Vantage is the fallback**, used only when Finnhub errors. 25 calls/day
is too tight to be primary but perfectly adequate as a backstop for the rare
day Finnhub is down.

**Twelve Data was not used.** It's a fine API, but it's strictly worse than
Finnhub for this workload and adding a third provider is more error surface
than it's worth for a single-user app.

One Finnhub quirk worth knowing: it answers an unknown or delisted symbol with
an all-zero quote rather than a 404. That shape is treated as an invalid
ticker, and the symbol goes into a 24-hour negative cache so a typo doesn't get
retried on every refresh.

### How prices behave

- **Appended, never updated.** The `prices` table is a time series. Nothing
  overwrites a row.
- **Cached for an hour per ticker.** Hitting refresh repeatedly costs nothing.
- **Failures are data, not exceptions.** Invalid ticker, provider down, rate
  limited, market closed, and delisted each produce a distinct outcome the UI
  shows you. A failed fetch can't take down a page.
- **Stale prices are labelled.** Anything older than 14 days is marked inline
  and bannered, and trips the `stalePrice` rule. Old numbers are never
  presented as current. A position that has never been priced is valued at cost
  basis and says so.

---

## Changing rule thresholds

**Every threshold lives in the `RULES` object in `lib/constants.ts`.** Change a
number there and the engine changes. Nothing else in the codebase hard-codes a
threshold — if you find something that does, it's a bug.

```ts
// lib/constants.ts
export const RULES = {
  concentration: {
    pct: 25,          // ← flag any position at or above this share
    highPct: 40,      // ← escalate to high severity here
    severity: 'med',
    highSeverity: 'high',
    why: '...',       // ← rendered on the flag, so edit this if you edit the number
  },
  ...
};
```

Each rule carries a `why` string that renders on the flag itself. If you change
a threshold, change the reasoning too — a number you can't justify on screen is
a number you'll ignore.

| Rule | Fires when | Severity |
| --- | --- | --- |
| `allocationDrift` | any tier is ≥5 points off its target | med, high at ≥15 |
| `concentration` | any single position ≥25% of portfolio | med, high at ≥40 |
| `undocumented` | any position with empty thesis or invalidation | med |
| `stalePrice` | price older than 14 days | low |
| `drawdownReview` | position ≥25% below cost basis | med |
| `speculativeCreep` | high tier >40% of portfolio | high |
| `horizonMismatch` | near-term amount > (cash + low tier value) | high |
| `thinPortfolio` | fewer than 3 positions | med |

Rules are pure functions in `lib/rules.ts`: portfolio state in, `Flag | null`
out. No database, no clock, no network — `state.now` is passed in, so the
engine is deterministic under test.

Where several positions trip the same rule, the rule emits **one** flag naming
all of them rather than a burst of near-identical flags, with severity from the
worst offender. The flag's fingerprint includes that subject list, so a new
offender raises a new flag and the superseded one auto-resolves.

---

## Flags

A flag renders three things: the arithmetic that triggered it, why the
threshold exists, and a question for you to answer.

Resolving one **requires a written note** — the API returns 422 without it. The
note is the artefact worth keeping. The History view shows every flag ever
raised alongside how it was resolved, so it's visible whether you followed
through or just dismissed things.

Flags reconcile by fingerprint rather than being rebuilt each run, so
`raised_at` reflects when a condition first appeared. A flag whose condition
stops holding auto-resolves with a note saying so, rather than silently
vanishing.

---

## The weekly brief

Runs Sunday 18:00 via `POST /api/cron/weekly`, using `claude-opus-5` at effort
`max` with the web search tool.

The route re-runs the rules and takes a snapshot **first and unconditionally** —
those need no API key, so a weekly run is still worth something when the AI side
is unconfigured or failing.

The prompt asks for:

- **Invalidation checks** — for each position, quoting the invalidation
  condition you wrote, has anything happened that matches it? This is the
  highest-value output in the app and renders first, above macro. The answer is
  usually `no_evidence`, and saying so is a success.
- **Macro developments** from the past 7 days, each with the specific data point
  to watch next and when it's next published, so the claim is checkable later.
- **Already consensus** — which of its own points offer no edge.
- **Three questions** for you to answer yourself.

Output is validated with zod before storage. On schema failure it retries once
with the validation errors fed back to the model. If that also fails, the raw
text is stored with `status = 'schema_error'` and the Brief view **renders the
failure** — the errors and the raw output — rather than hiding it or rendering
garbage.

Structured outputs are deliberately not used: they aren't usable alongside the
server-side web search tool, and the required retry-then-store-raw behaviour
needs a parse step under our control anyway.

### Brief archive

Every brief is kept forever, successes and failures alike, listed with dates,
model, source count and validation status. This is a feature, not a nice-to-have:
being able to look back and count how often the model was full of it is the
point. Nothing prunes this table.

### Scheduling in production

The dev runner (`npm run cron:dev`) uses node-cron. In production use whatever
your host already has — a Vercel cron, a systemd timer, a launchd plist, or a
crontab line — pointed at the same route:

```bash
curl -X POST https://your-app/api/cron/weekly \
  -H "Authorization: Bearer $CRON_SECRET"
```

GET is accepted too, since most hosted schedulers only issue GETs.

---

## Gap analysis

`POST /api/gaps`, on demand only — never scheduled. A weekly drip of
instruments you don't own is how a discipline tool turns into a shopping feed.

Given your holdings it identifies missing exposure across geography, asset
class, sector, factor and duration, and names liquid low-cost instruments worth
researching. Every candidate **requires** `case_for`, `case_against` and
`wrong_for`, each at least 40 characters after trimming, enforced by zod. A
candidate that can't argue against itself is rejected and the request retried.
Nothing is ranked, and nothing is ordered in a way that implies preference.

---

## Views

1. **Positions** — table with inline edit, add and close. Closed positions stay
   visible with realized P/L. Stale prices marked inline.
2. **Review** — targets, cash, near-term commitments, active flags,
   resolve-with-note.
3. **Brief** — latest brief plus the full archive with dates.
4. **History** — value over time, tier allocation over time, and every flag ever
   raised with how it was resolved.
5. **Playbook** — static reference in `content/playbook.mdx`. Edit that file;
   nothing on that page is generated.

---

## Data model

SQLite via better-sqlite3, single file at `data/portfolio.db`. No cloud DB, no
auth, runs locally. The database is gitignored.

```
positions   id, ticker, name, tier, shares, cost_basis, thesis, invalidation,
            opened_at, closed_at, close_price
prices      ticker, price, as_of, source      -- append-only time series
snapshots   id, taken_at, total_value, total_basis, by_tier_json
targets     tier, target_pct
near_term   amount, need_by, label
flags       id, raised_at, rule, severity, title, body, detail_json,
            fingerprint, resolved_at, resolution_note
briefs      id, generated_at, kind, payload_json, model, sources_json,
            status, error, raw_text
```

Two things are enforced in the schema, not just in application code:

- **`positions.invalidation` is `NOT NULL` with a non-empty `CHECK`.** It's the
  most important column here. A position you can't be proven wrong about can't
  be exited on evidence, only on emotion. Three layers refuse to save without
  it: zod, the query layer, and the constraint.
- **`prices` is append-only.** Nothing in the app updates a price row in place,
  so the series is real history rather than a cache.

`flags` carries a partial unique index over open rows keyed on `fingerprint`, so
re-running the engine can't raise duplicates. Resolved flags are never deleted.

---

## Tests

```bash
npm test
```

120 tests. The rules engine is covered at 100% statements / functions / lines
and 98.7% branches — the two uncovered branches are unreachable defensive
fallbacks. Coverage thresholds are enforced at 90% and the run fails below them.

Thresholds are tested on both sides of every line (does `stalePrice` fire at
exactly 14 days? does `speculativeCreep` fire at exactly 40%?), and a directive
sweep asserts across every rule that none can emit an imperative to transact.

---

## Design

Marine chart aesthetic. Chart-paper ground `#E9EDE9`, navy ink `#12313C`,
hairline rules `#C3CFC9`. Tier colours: preservation `#2E7159`, diversified
`#B87A22`, speculative `#A72F6E`. Monospace for every number and label,
uppercase and letterspaced like chart annotations; a clean sans for prose. No
gradients, no shadows, nothing rounder than 2px.

Charts are hand-rolled SVG server components — no charting library, no client
JS. The value chart's y-axis is anchored at zero behind a named constant in
`components/charts.tsx`; the reasoning, and how to change it, is in the comment
there.

---

## What this app will not do

It has no brokerage connection and cannot place an order. It does not produce
buy or sell signals. It will not let you save a position without writing down
what would prove you wrong, and it will not let you dismiss a flag without
writing down why. Every brief it generates is kept, including the wrong ones.
