#!/usr/bin/env node
/**
 * One-command setup. Checks the Node version, installs dependencies, creates
 * .env.local, and builds the database.
 *
 * Written to be read by someone who is not a developer: every failure says
 * what went wrong and what to do about it, in a full sentence.
 *
 *   npm run setup
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const MIN_NODE = 20;

const say = (s = '') => console.log(s);
const step = (n, total, s) => say(`\n[${n}/${total}] ${s}`);

function die(problem, fix) {
  say(`\n  ✕  ${problem}\n`);
  say(`     ${fix}\n`);
  process.exit(1);
}

say('');
say('  Stonks — setup');
say('  ──────────────');

/* 1. Node version ---------------------------------------------------- */

step(1, 4, 'Checking Node…');

const major = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(major) || major < MIN_NODE) {
  die(
    `This needs Node ${MIN_NODE} or newer. You have ${process.versions.node}.`,
    'Download the "LTS" installer from https://nodejs.org, run it, then close and\n     reopen your terminal and try this again.',
  );
}
say(`      Node ${process.versions.node} — fine.`);

/* 2. Dependencies ---------------------------------------------------- */

step(2, 4, 'Installing dependencies… (a minute or two the first time)');

try {
  execSync('npm install --no-audit --no-fund', { cwd: root, stdio: 'inherit' });
} catch {
  die(
    'npm install failed.',
    'Scroll up — the real error is in the output above. Copy the last 20 lines\n     and paste them to me and I will tell you what it means.',
  );
}

/* 3. .env.local ------------------------------------------------------ */

step(3, 4, 'Setting up .env.local…');

const envLocal = path.join(root, '.env.local');
const envExample = path.join(root, '.env.example');

if (fs.existsSync(envLocal)) {
  say('      Already there — leaving your keys alone.');
} else {
  fs.copyFileSync(envExample, envLocal);
  say('      Created .env.local (every value blank — that is fine, the app runs without them).');
}

/* 4. Database -------------------------------------------------------- */

step(4, 4, 'Building the database…');

fs.mkdirSync(path.join(root, 'data'), { recursive: true });

try {
  execSync('npx tsx scripts/migrate.ts', { cwd: root, stdio: 'inherit' });
} catch {
  die(
    'Could not create the database.',
    'This is usually a permissions problem in the project folder. Paste the error\n     above to me.',
  );
}

/* Done --------------------------------------------------------------- */

const seeded = process.argv.includes('--seed');
if (seeded) {
  say('\n      Loading sample data…');
  execSync('npx tsx scripts/seed.ts', { cwd: root, stdio: 'inherit' });
}

say('');
say('  ──────────────────────────────────────────────────────────────');
say('  Done. Start the app with:');
say('');
say('      npm run dev');
say('');
say('  Then open http://localhost:3000 in your browser.');
say('  Leave that terminal window open — closing it stops the app.');
say('');
if (!seeded) {
  say('  Want sample data to look at first?  npm run setup -- --seed');
  say('  (and `npm run db:reset` wipes it clean again)');
  say('');
}
say('  Prices need a free key from https://finnhub.io/register —');
say('  paste it into .env.local as FINNHUB_API_KEY, then restart the app.');
say('  Everything else works without any keys at all.');
say('  ──────────────────────────────────────────────────────────────');
say('');
