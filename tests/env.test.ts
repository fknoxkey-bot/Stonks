import { afterEach, describe, expect, it } from 'vitest';
import { env, envRaw, hasEnv, requireEnv } from '../lib/env';
import fs from 'node:fs';
import path from 'node:path';

const KEY = 'STONKS_TEST_VAR';

afterEach(() => {
  delete process.env[KEY];
});

/**
 * The bug these guard against: `.env.example` ships every value blank, setup
 * copies it to `.env.local`, Next.js loads it — so an unconfigured variable
 * arrives as "" rather than undefined. `??` does not catch that, and the app
 * silently opened a nameless database while the real one sat untouched.
 */
describe('empty means unset', () => {
  it('treats an empty string as unset', () => {
    process.env[KEY] = '';
    expect(envRaw(KEY)).toBeUndefined();
    expect(hasEnv(KEY)).toBe(false);
    expect(env(KEY, 'fallback')).toBe('fallback');
  });

  it('treats whitespace-only as unset', () => {
    process.env[KEY] = '   ';
    expect(envRaw(KEY)).toBeUndefined();
    expect(hasEnv(KEY)).toBe(false);
    expect(env(KEY, 'fallback')).toBe('fallback');
  });

  it('treats a genuinely absent variable as unset', () => {
    expect(envRaw(KEY)).toBeUndefined();
    expect(hasEnv(KEY)).toBe(false);
    expect(env(KEY, 'fallback')).toBe('fallback');
  });

  it('returns a real value', () => {
    process.env[KEY] = 'actual';
    expect(envRaw(KEY)).toBe('actual');
    expect(hasEnv(KEY)).toBe(true);
    expect(env(KEY, 'fallback')).toBe('actual');
  });

  it('trims surrounding whitespace off a real value', () => {
    // `KEY= value ` in a .env file should not yield a padded config value.
    process.env[KEY] = '  actual  ';
    expect(env(KEY, 'fallback')).toBe('actual');
  });

  it('keeps a value that is falsy but meaningful', () => {
    process.env[KEY] = '0';
    expect(env(KEY, 'fallback')).toBe('0');
    expect(hasEnv(KEY)).toBe(true);
  });

  it('requireEnv names the variable and the file it belongs in', () => {
    process.env[KEY] = '';
    expect(() => requireEnv(KEY)).toThrow(new RegExp(`${KEY}.*\\.env\\.local`));
  });

  it('requireEnv returns the value when set', () => {
    process.env[KEY] = 'actual';
    expect(requireEnv(KEY)).toBe('actual');
  });
});

describe('no env read bypasses the helper', () => {
  const roots = ['lib', 'app', 'scripts'];

  function walk(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.(ts|tsx|mjs)$/.test(e.name) ? [full] : [];
    });
  }

  const files = roots.flatMap((r) => walk(path.join(process.cwd(), r)));

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('has no `process.env.X ?? fallback` left anywhere', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(path.join('lib', 'env.ts'))) continue; // documents the bug
      const source = fs.readFileSync(file, 'utf8');
      source.split('\n').forEach((line, i) => {
        if (/process\.env\.[A-Z_]+\s*\?\?/.test(line) || /process\.env\[[^\]]+\]\s*\?\?/.test(line)) {
          offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
        }
      });
    }
    expect(offenders, `?? on an env var silently accepts "" — use env() from lib/env.ts`).toEqual(
      [],
    );
  });

  it('every variable .env.example ships blank is read through the helper', () => {
    const example = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    const blanks = [...example.matchAll(/^([A-Z_]+)=$/gm)].map((m) => m[1]);
    expect(blanks.length).toBeGreaterThan(5);

    const sources = files
      .filter((f) => !f.endsWith(path.join('lib', 'env.ts')))
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');

    const direct = blanks.filter((name) =>
      new RegExp(`process\\.env\\.${name}\\b`).test(sources),
    );
    expect(direct, 'read these via env()/envRaw()/hasEnv() instead of process.env').toEqual([]);
  });
});
