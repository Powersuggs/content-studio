import { cookies } from "next/headers";
import { verifySessionToken, type Session } from "@/lib/auth/session";

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
