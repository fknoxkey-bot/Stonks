/**
 * Environment variable access, where an empty value means "not set".
 *
 * This distinction is not academic. `.env.example` ships with every value
 * blank — that is deliberate, it documents the full set of knobs — and
 * `npm run setup` copies it to `.env.local`. Next.js then loads that file, so
 * an unconfigured variable arrives as `""`, not `undefined`.
 *
 * `??` does not catch that. `process.env.DATABASE_PATH ?? 'data/portfolio.db'`
 * evaluates to `""`, and the app opens a nameless temporary database while the
 * real one sits untouched — no error, no warning, just an empty portfolio.
 *
 * Every environment read in this codebase goes through here so that cannot
 * happen again. Whitespace-only counts as unset too, because a stray space
 * after `=` should not silently become a config value.
 */

/** The raw value, or undefined when unset, empty, or whitespace-only. */
export function envRaw(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The value, or `fallback` when unset. */
export function env(name: string, fallback: string): string {
  return envRaw(name) ?? fallback;
}

/** Whether the variable carries an actual value. */
export function hasEnv(name: string): boolean {
  return envRaw(name) !== undefined;
}

/** The value, or throw with a message naming the variable and the file. */
export function requireEnv(name: string): string {
  const value = envRaw(name);
  if (value === undefined) {
    throw new Error(`${name} is not set. Add it to .env.local and restart the app.`);
  }
  return value;
}
