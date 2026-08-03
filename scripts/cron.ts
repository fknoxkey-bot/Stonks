/**
 * Development scheduler. Runs the weekly cron route Sunday at 18:00 local.
 *
 *   npm run cron:dev        # alongside `npm run dev`
 *   npm run cron:dev -- now # fire once immediately and exit
 *
 * In production use whatever your host already has — a Vercel cron, a
 * systemd timer, a launchd plist, or a line in crontab hitting the same
 * route with the CRON_SECRET bearer token.
 */
import 'dotenv/config';
import cron from 'node-cron';
import { env, envRaw } from '../lib/env';

const APP_URL = env('APP_URL', 'http://localhost:3000');
const SCHEDULE = env('CRON_SCHEDULE', '0 18 * * 0'); // Sunday 18:00

async function fire(): Promise<void> {
  const started = new Date();
  console.log(`[cron] ${started.toISOString()} — POST ${APP_URL}/api/cron/weekly`);

  try {
    const res = await fetch(`${APP_URL}/api/cron/weekly`, {
      method: 'POST',
      headers: envRaw('CRON_SECRET')
        ? { Authorization: `Bearer ${envRaw('CRON_SECRET')}` }
        : {},
    });
    const body = await res.text();
    console.log(`[cron] ${res.status} ${body}`);
  } catch (err) {
    console.error('[cron] failed:', err instanceof Error ? err.message : err);
  }
}

if (process.argv.includes('now')) {
  void fire().then(() => process.exit(0));
} else {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[cron] invalid CRON_SCHEDULE: ${SCHEDULE}`);
    process.exit(1);
  }
  cron.schedule(SCHEDULE, () => void fire());
  console.log(`[cron] scheduled "${SCHEDULE}" against ${APP_URL}. Ctrl-C to stop.`);
}
