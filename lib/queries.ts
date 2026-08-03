import { getDb } from './db';
import type {
  BriefKind,
  BriefRow,
  Flag,
  NearTerm,
  PortfolioState,
  Position,
  PriceRow,
  RuleFlag,
  Snapshot,
  Target,
  Tier,
} from './types';
import { TIERS } from './types';
import { pricePositions, openPositions, totalValue, totalBasis, tierValues } from './portfolio';

/* ------------------------------------------------------------------ *
 * positions
 * ------------------------------------------------------------------ */

export function listPositions(includeClosed = true): Position[] {
  const db = getDb();
  const sql = includeClosed
    ? 'SELECT * FROM positions ORDER BY closed_at IS NOT NULL, ticker'
    : 'SELECT * FROM positions WHERE closed_at IS NULL ORDER BY ticker';
  return db.prepare(sql).all() as Position[];
}

export function getPosition(id: number): Position | null {
  const db = getDb();
  return (db.prepare('SELECT * FROM positions WHERE id = ?').get(id) as Position) ?? null;
}

export interface PositionInput {
  ticker: string;
  name?: string;
  tier: Tier;
  shares: number;
  cost_basis: number;
  thesis: string;
  invalidation: string;
  opened_at?: string;
}

/**
 * Refuses to save a position without an invalidation condition. This is
 * enforced here *and* by a CHECK constraint in the schema — it is the one
 * rule the app will not let you route around.
 */
export function createPosition(input: PositionInput): Position {
  assertDocumented(input);
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO positions (ticker, name, tier, shares, cost_basis, thesis, invalidation, opened_at)
       VALUES (@ticker, @name, @tier, @shares, @cost_basis, @thesis, @invalidation, @opened_at)`,
    )
    .run({
      ticker: input.ticker.trim().toUpperCase(),
      name: (input.name ?? '').trim(),
      tier: input.tier,
      shares: input.shares,
      cost_basis: input.cost_basis,
      thesis: input.thesis.trim(),
      invalidation: input.invalidation.trim(),
      opened_at: input.opened_at ?? new Date().toISOString(),
    });
  return getPosition(Number(info.lastInsertRowid))!;
}

export function updatePosition(id: number, input: Partial<PositionInput>): Position {
  const existing = getPosition(id);
  if (!existing) throw new Error(`No position with id ${id}`);

  const merged = {
    ticker: (input.ticker ?? existing.ticker).trim().toUpperCase(),
    name: (input.name ?? existing.name).trim(),
    tier: input.tier ?? existing.tier,
    shares: input.shares ?? existing.shares,
    cost_basis: input.cost_basis ?? existing.cost_basis,
    thesis: (input.thesis ?? existing.thesis).trim(),
    invalidation: (input.invalidation ?? existing.invalidation).trim(),
  };
  assertDocumented(merged);

  const db = getDb();
  db.prepare(
    `UPDATE positions
        SET ticker = @ticker, name = @name, tier = @tier, shares = @shares,
            cost_basis = @cost_basis, thesis = @thesis, invalidation = @invalidation
      WHERE id = @id`,
  ).run({ ...merged, id });
  return getPosition(id)!;
}

export function closePosition(id: number, closePrice: number, closedAt?: string): Position {
  const db = getDb();
  db.prepare('UPDATE positions SET closed_at = ?, close_price = ? WHERE id = ?').run(
    closedAt ?? new Date().toISOString(),
    closePrice,
    id,
  );
  return getPosition(id)!;
}

export function reopenPosition(id: number): Position {
  const db = getDb();
  db.prepare('UPDATE positions SET closed_at = NULL, close_price = NULL WHERE id = ?').run(id);
  return getPosition(id)!;
}

export function deletePosition(id: number): void {
  getDb().prepare('DELETE FROM positions WHERE id = ?').run(id);
}

function assertDocumented(p: { thesis?: string; invalidation?: string; ticker?: string }): void {
  if (!p.ticker || !p.ticker.trim()) throw new Error('Ticker is required.');
  if (!p.thesis || !p.thesis.trim()) {
    throw new Error('Thesis is required. Why do you own this?');
  }
  if (!p.invalidation || !p.invalidation.trim()) {
    throw new Error(
      'Invalidation is required. What specifically would have to happen for you to conclude you were wrong?',
    );
  }
}

/* ------------------------------------------------------------------ *
 * prices — append-only
 * ------------------------------------------------------------------ */

export function insertPrice(ticker: string, price: number, source: string, asOf?: string): void {
  getDb()
    .prepare('INSERT INTO prices (ticker, price, as_of, source) VALUES (?, ?, ?, ?)')
    .run(ticker.toUpperCase(), price, asOf ?? new Date().toISOString(), source);
}

export function latestPrice(ticker: string): PriceRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM prices WHERE ticker = ? ORDER BY as_of DESC, id DESC LIMIT 1')
      .get(ticker.toUpperCase()) as PriceRow) ?? null
  );
}

/** Most recent price per ticker, keyed by uppercase ticker. */
export function latestPrices(): Map<string, PriceRow> {
  const rows = getDb()
    .prepare(
      `SELECT p.* FROM prices p
        JOIN (SELECT ticker, MAX(as_of) AS as_of FROM prices GROUP BY ticker) m
          ON p.ticker = m.ticker AND p.as_of = m.as_of
        GROUP BY p.ticker`,
    )
    .all() as PriceRow[];
  return new Map(rows.map((r) => [r.ticker.toUpperCase(), r]));
}

export function priceHistory(ticker: string, limit = 500): PriceRow[] {
  return getDb()
    .prepare('SELECT * FROM prices WHERE ticker = ? ORDER BY as_of DESC LIMIT ?')
    .all(ticker.toUpperCase(), limit) as PriceRow[];
}

/* ------------------------------------------------------------------ *
 * targets / near-term / cash
 * ------------------------------------------------------------------ */

export function listTargets(): Record<Tier, number> {
  const rows = getDb().prepare('SELECT * FROM targets').all() as Target[];
  const out = {} as Record<Tier, number>;
  for (const t of TIERS) out[t] = 0;
  for (const r of rows) out[r.tier] = r.target_pct;
  return out;
}

export function setTarget(tier: Tier, pct: number): void {
  getDb()
    .prepare(
      'INSERT INTO targets (tier, target_pct) VALUES (?, ?) ON CONFLICT(tier) DO UPDATE SET target_pct = excluded.target_pct',
    )
    .run(tier, pct);
}

export function listNearTerm(): NearTerm[] {
  return getDb().prepare('SELECT * FROM near_term ORDER BY need_by').all() as NearTerm[];
}

export function createNearTerm(amount: number, needBy: string, label: string): NearTerm {
  const info = getDb()
    .prepare('INSERT INTO near_term (amount, need_by, label) VALUES (?, ?, ?)')
    // A need-by is a day, not a moment — store it that way.
    .run(amount, needBy.slice(0, 10), label);
  return getDb()
    .prepare('SELECT * FROM near_term WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as NearTerm;
}

export function deleteNearTerm(id: number): void {
  getDb().prepare('DELETE FROM near_term WHERE id = ?').run(id);
}

/**
 * Uninvested cash. Stored as a single-row setting rather than its own table —
 * the spec's data model has no cash table, and inventing one would be more
 * schema than the number deserves.
 */
export function getCash(): number {
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = db.prepare("SELECT value FROM settings WHERE key = 'cash'").get() as
    | { value: string }
    | undefined;
  return row ? Number(row.value) : 0;
}

export function setCash(amount: number): void {
  const db = getDb();
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('cash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(String(amount));
}

/* ------------------------------------------------------------------ *
 * portfolio state — the single input to the rules engine
 * ------------------------------------------------------------------ */

export function buildPortfolioState(now: Date = new Date()): PortfolioState {
  return {
    positions: pricePositions(listPositions(true), latestPrices()),
    targets: listTargets(),
    nearTerm: listNearTerm(),
    cash: getCash(),
    now,
  };
}

/* ------------------------------------------------------------------ *
 * flags
 * ------------------------------------------------------------------ */

export function listFlags(opts: { open?: boolean } = {}): Flag[] {
  const db = getDb();
  if (opts.open === true) {
    return db
      .prepare('SELECT * FROM flags WHERE resolved_at IS NULL ORDER BY raised_at DESC')
      .all() as Flag[];
  }
  if (opts.open === false) {
    return db
      .prepare('SELECT * FROM flags WHERE resolved_at IS NOT NULL ORDER BY resolved_at DESC')
      .all() as Flag[];
  }
  return db.prepare('SELECT * FROM flags ORDER BY raised_at DESC').all() as Flag[];
}

/**
 * Persists the current rule output. A flag whose fingerprint already has an
 * open row is left alone (so `raised_at` reflects when the condition first
 * appeared). Open flags whose condition no longer holds are auto-resolved
 * with a note saying so — they stay in history either way.
 */
export function syncFlags(ruleFlags: RuleFlag[], now: Date = new Date()): void {
  const db = getDb();
  const nowIso = now.toISOString();
  const open = db.prepare('SELECT * FROM flags WHERE resolved_at IS NULL').all() as Flag[];
  const openByFingerprint = new Map(open.map((f) => [f.fingerprint, f]));
  const incoming = new Set(ruleFlags.map((f) => f.fingerprint));

  const insert = db.prepare(
    `INSERT INTO flags (raised_at, rule, severity, title, body, detail_json, fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const refresh = db.prepare(
    'UPDATE flags SET severity = ?, title = ?, body = ?, detail_json = ? WHERE id = ?',
  );
  const autoResolve = db.prepare(
    'UPDATE flags SET resolved_at = ?, resolution_note = ? WHERE id = ?',
  );

  db.transaction(() => {
    for (const f of ruleFlags) {
      const existing = openByFingerprint.get(f.fingerprint);
      if (existing) {
        // Same cause, possibly moved numbers — keep raised_at, refresh text.
        refresh.run(f.severity, f.title, f.body, JSON.stringify(f.detail), existing.id);
      } else {
        insert.run(
          nowIso,
          f.rule,
          f.severity,
          f.title,
          f.body,
          JSON.stringify(f.detail),
          f.fingerprint,
        );
      }
    }
    for (const f of open) {
      if (!incoming.has(f.fingerprint)) {
        autoResolve.run(
          nowIso,
          'Auto-resolved: the condition that raised this flag no longer holds.',
          f.id,
        );
      }
    }
  })();
}

export function resolveFlag(id: number, note: string, now: Date = new Date()): void {
  if (!note.trim()) {
    throw new Error('A resolution note is required. Dismissing without writing why defeats the point.');
  }
  getDb()
    .prepare('UPDATE flags SET resolved_at = ?, resolution_note = ? WHERE id = ?')
    .run(now.toISOString(), note.trim(), id);
}

/* ------------------------------------------------------------------ *
 * snapshots
 * ------------------------------------------------------------------ */

export function listSnapshots(limit = 730): Snapshot[] {
  return getDb()
    .prepare('SELECT * FROM snapshots ORDER BY taken_at ASC LIMIT ?')
    .all(limit) as Snapshot[];
}

export function takeSnapshot(state?: PortfolioState, now: Date = new Date()): Snapshot {
  const s = state ?? buildPortfolioState(now);
  const info = getDb()
    .prepare(
      'INSERT INTO snapshots (taken_at, total_value, total_basis, by_tier_json) VALUES (?, ?, ?, ?)',
    )
    .run(
      now.toISOString(),
      totalValue(s),
      totalBasis(s),
      JSON.stringify({ ...tierValues(s), cash: s.cash, positions: openPositions(s).length }),
    );
  return getDb()
    .prepare('SELECT * FROM snapshots WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Snapshot;
}

/* ------------------------------------------------------------------ *
 * briefs — append-only archive
 * ------------------------------------------------------------------ */

export interface BriefInsert {
  kind: BriefKind;
  payload: unknown;
  model: string;
  sources: string[];
  status?: 'ok' | 'schema_error';
  error?: string | null;
  raw_text?: string | null;
}

export function insertBrief(input: BriefInsert, now: Date = new Date()): BriefRow {
  const info = getDb()
    .prepare(
      `INSERT INTO briefs (generated_at, kind, payload_json, model, sources_json, status, error, raw_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      now.toISOString(),
      input.kind,
      JSON.stringify(input.payload ?? null),
      input.model,
      JSON.stringify(input.sources ?? []),
      input.status ?? 'ok',
      input.error ?? null,
      input.raw_text ?? null,
    );
  return getDb()
    .prepare('SELECT * FROM briefs WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as BriefRow;
}

export function listBriefs(kind?: BriefKind, limit = 200): BriefRow[] {
  const db = getDb();
  return kind
    ? (db
        .prepare('SELECT * FROM briefs WHERE kind = ? ORDER BY generated_at DESC LIMIT ?')
        .all(kind, limit) as BriefRow[])
    : (db
        .prepare('SELECT * FROM briefs ORDER BY generated_at DESC LIMIT ?')
        .all(limit) as BriefRow[]);
}

export function getBrief(id: number): BriefRow | null {
  return (getDb().prepare('SELECT * FROM briefs WHERE id = ?').get(id) as BriefRow) ?? null;
}

export function latestBrief(kind: BriefKind): BriefRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM briefs WHERE kind = ? ORDER BY generated_at DESC LIMIT 1')
      .get(kind) as BriefRow) ?? null
  );
}
