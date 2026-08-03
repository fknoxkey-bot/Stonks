-- 001_init.sql — initial schema.
--
-- Design notes that matter:
--   * `prices` is an append-only time series. Nothing in this app updates a
--     price row in place. Ever. History is the point.
--   * `positions.invalidation` is NOT NULL and CHECK'd non-empty. A position
--     you cannot be proven wrong about is not a position, it is a hope.
--   * `briefs` is append-only too. Old briefs are never edited or deleted so
--     you can look back and count how often the model was full of it.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker       TEXT    NOT NULL,
  name         TEXT    NOT NULL DEFAULT '',
  tier         TEXT    NOT NULL CHECK (tier IN ('low', 'med', 'high')),
  shares       REAL    NOT NULL CHECK (shares > 0),
  cost_basis   REAL    NOT NULL CHECK (cost_basis >= 0),
  thesis       TEXT    NOT NULL CHECK (length(trim(thesis)) > 0),
  -- The most important column in the schema. What would have to happen for
  -- you to conclude you were wrong?
  invalidation TEXT    NOT NULL CHECK (length(trim(invalidation)) > 0),
  opened_at    TEXT    NOT NULL,
  closed_at    TEXT,
  -- Realized proceeds per share, recorded when the position is closed.
  close_price  REAL
);

CREATE INDEX IF NOT EXISTS idx_positions_ticker ON positions (ticker);
CREATE INDEX IF NOT EXISTS idx_positions_open   ON positions (closed_at);

-- Append-only price time series. One row per fetch, never overwritten.
CREATE TABLE IF NOT EXISTS prices (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  price  REAL NOT NULL CHECK (price >= 0),
  as_of  TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prices_ticker_asof ON prices (ticker, as_of DESC);

CREATE TABLE IF NOT EXISTS snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at     TEXT NOT NULL,
  total_value  REAL NOT NULL,
  total_basis  REAL NOT NULL,
  by_tier_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_taken_at ON snapshots (taken_at DESC);

CREATE TABLE IF NOT EXISTS targets (
  tier       TEXT PRIMARY KEY CHECK (tier IN ('low', 'med', 'high')),
  target_pct REAL NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100)
);

-- Money you know you need soon. Drives the horizonMismatch rule.
CREATE TABLE IF NOT EXISTS near_term (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  amount  REAL NOT NULL CHECK (amount >= 0),
  need_by TEXT NOT NULL,
  label   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS flags (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  raised_at       TEXT NOT NULL,
  rule            TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('low', 'med', 'high')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  -- The arithmetic, why the threshold exists, and the question. Stored as
  -- JSON so the UI can render each part distinctly.
  detail_json     TEXT NOT NULL DEFAULT '{}',
  -- Stable identity for a flag's cause, so re-running the engine updates the
  -- open flag instead of raising a duplicate every time.
  fingerprint     TEXT NOT NULL,
  resolved_at     TEXT,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_flags_resolved  ON flags (resolved_at);
CREATE INDEX IF NOT EXISTS idx_flags_raised_at ON flags (raised_at DESC);
-- At most one *open* flag per cause. Resolved ones stay forever as history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_flags_open_fingerprint
  ON flags (fingerprint) WHERE resolved_at IS NULL;

-- Every AI-generated brief, permanently. This table is never pruned.
CREATE TABLE IF NOT EXISTS briefs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('weekly', 'gaps')),
  payload_json TEXT NOT NULL,
  model        TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  -- 'ok' when the payload validated, 'schema_error' when it did not. A failed
  -- brief is still stored, with the raw text, so the failure is visible
  -- rather than silently swallowed.
  status       TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'schema_error')),
  error        TEXT,
  raw_text     TEXT
);

CREATE INDEX IF NOT EXISTS idx_briefs_kind_generated ON briefs (kind, generated_at DESC);

INSERT OR IGNORE INTO targets (tier, target_pct) VALUES
  ('low', 50),
  ('med', 35),
  ('high', 15);
