export async function register() {
  // Only in the Node.js runtime (not edge), and the function itself
  // still checks NODE_ENV -- this file runs in production too, but the
  // scheduler it starts is a no-op there. Production sync is driven by
  // the platform's scheduled function hitting /api/sync/cron instead.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDevSyncSchedulerIfApplicable } = await import(
      "./lib/ig/dev-scheduler"
    );
    startDevSyncSchedulerIfApplicable();
  }
}
