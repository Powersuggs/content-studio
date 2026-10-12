import { cache } from "react";
import { cookies } from "next/headers";
import { verifySessionToken, type Session } from "@/lib/auth/session";
import { getBackgroundAccountId } from "@/lib/auth/background-account";

/**
 * Who is making this request, read from the signed session cookie.
 *
 * Middleware already rejects unauthenticated requests before any page or
 * route handler runs, so this returning null in a protected route means
 * something is wrong rather than "a logged-out visitor". Callers that need
 * an id should use requireAccountId().
 */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get("session")?.value;
  return verifySessionToken(token);
}

export async function requireAccountId(): Promise<number> {
  const session = await getSession();
  if (!session) {
    throw new Error(
      "requireAccountId() found no valid session. This should be unreachable " +
        "behind middleware -- check that the route is covered by the matcher " +
        "in middleware.ts.",
    );
  }
  return session.accountId;
}

/**
 * The account every query in this request belongs to.
 *
 * This is THE scoping boundary for the whole app. Queries call it rather than
 * taking an accountId parameter, so there is one place that decides whose data
 * is being read, instead of 39 call sites that each have to remember.
 *
 * Resolution order:
 *   1. An explicit background account, if we are inside runAsAccount()
 *      (the nightly sync and anything else without a request).
 *   2. The signed session cookie.
 * If neither exists it throws, so a query can never quietly fall back to
 * "all accounts" or to account 1.
 *
 * react cache() dedupes it, so a page rendering twenty components resolves
 * the account once rather than parsing the cookie twenty times.
 */
export const currentAccountId = cache(async (): Promise<number> => {
  const background = getBackgroundAccountId();
  if (background !== null) return background;

  const session = await getSession();
  if (session) return session.accountId;

  throw new Error(
    "No account in scope. A request-path query must run behind middleware " +
      "with a valid session; background work must be wrapped in runAsAccount().",
  );
});
