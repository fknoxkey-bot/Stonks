import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DB_DIR, 'portfolio.db');
const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

let instance: Database.Database | null = null;

/** Applies every migrations/*.sql not yet recorded, in filename order. */
export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const record = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
    // eslint-disable-next-line no-console
    console.log(`[db] applied ${file}`);
  }
}

export function getDb(): Database.Database {
  if (instance) return instance;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);

  instance = db;
  return db;
}

export { DB_PATH };
