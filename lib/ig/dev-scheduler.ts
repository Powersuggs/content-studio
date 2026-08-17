import { runInstagramSync } from "./sync";

// Dev convenience only, so you don't have to hit the trigger button
// constantly while developing. This must NEVER run in production:
// serverless instances are too short-lived to hold a setInterval (the
// process can be frozen or killed between requests, so the interval
// might fire zero times, or the "handle" becomes meaningless once the
// instance that created it is gone). Production uses a real platform
// scheduled function instead -- see vercel.json + app/api/sync/cron.
const DEV_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

declare global {
  // eslint-disable-next-line no-var
  var __contentStudioDevSyncTimer: ReturnType<typeof setInterval> | undefined;
}

export function startDevSyncSchedulerIfApplicable(): void {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.DISABLE_DEV_SYNC_SCHEDULER === "true") return;
  if (globalThis.__contentStudioDevSyncTimer) return; // avoid duplicate timers across hot reloads

  globalThis.__contentStudioDevSyncTimer = setInterval(() => {
    runInstagramSync().catch((err) => {
      console.error("[dev-scheduler] sync failed:", err);
    });
  }, DEV_SYNC_INTERVAL_MS);
}
