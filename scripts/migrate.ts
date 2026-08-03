import { getDb, DB_PATH } from '../lib/db';

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => (r as { name: string }).name);

console.log(`[migrate] database: ${DB_PATH}`);
console.log(`[migrate] tables:   ${tables.join(', ')}`);
db.close();
