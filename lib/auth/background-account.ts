import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which account background work belongs to.
 *
 * Request-driven code reads the account from the session cookie. Background
 * work (the nightly Instagram sync, anything triggered by the cron route)
 * has no cookie, so it declares the account explicitly by running inside
 * runAsAccount(). Everything underneath, including every query, then resolves
 * to that account without needing it passed through each call.
 *
 * Node-only: never import this from Edge middleware.
 */
const store = new AsyncLocalStorage<number>();

export function runAsAccount<T>(accountId: number, fn: () => Promise<T>): Promise<T> {
  if (!Number.isInteger(accountId) || accountId < 1) {
    throw new Error(`runAsAccount: invalid accountId ${accountId}`);
  }
  return store.run(accountId, fn);
}

export function getBackgroundAccountId(): number | null {
  return store.getStore() ?? null;
}
