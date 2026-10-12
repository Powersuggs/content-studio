import { Pool, types, type PoolClient } from "pg";
import { currentAccountIdOrNull } from "./auth/current-account";

// --- Type parser overrides -------------------------------------------------
// By default node-postgres returns bigint (OID 20) as a string (since it
// exceeds JS's safe integer range in the general case) and DATE (OID 1082)
// as a JS Date object in local time, which silently shifts calendar days.
// For this app we want:
//   - int2 / int4 / int8 / numeric -> JS number
//   - date -> raw "YYYY-MM-DD" string, untouched
const INT2_OID = 21;
const INT4_OID = 23;
const INT8_OID = 20;
const NUMERIC_OID = 1700;
const DATE_OID = 1082;

types.setTypeParser(INT2_OID, (val) => (val === null ? null : Number(val)));
types.setTypeParser(INT4_OID, (val) => (val === null ? null : Number(val)));
types.setTypeParser(INT8_OID, (val) => (val === null ? null : Number(val)));
types.setTypeParser(NUMERIC_OID, (val) => (val === null ? null : Number(val)));
// Identity parser: keep the raw "YYYY-MM-DD" string pg gives us for DATE,
// rather than letting pg construct a Date (which is UTC-midnight based
// and can display as the previous day depending on local TZ).
types.setTypeParser(DATE_OID, (val) => val);

// --- Pool --------------------------------------------------------------
let pool: Pool | undefined;

/**
 * Best-effort heuristic, NOT a hard check: common pooler hostnames/ports
 * (Supabase's pgbouncer on :6543, Neon/Render's "-pooler" host segment)
 * vs. the plain default Postgres port 5432. This can't be made fully
 * reliable across every provider, so it only warns -- the actual
 * requirement (use the transaction pooler connection string from your
 * provider, not the direct one) is enforced by what you put in
 * DATABASE_URL, documented in .env.example and DEPLOY.md.
 *
 * Why this matters here specifically: direct database connections are
 * commonly IPv6-only, while serverless functions run over IPv4. A
 * direct connection string passes every local test (most dev machines
 * have IPv6) and then fails only once deployed.
 */
function warnIfLikelyDirectConnection(connectionString: string): void {
  if (process.env.NODE_ENV !== "production") return;
  try {
    const url = new URL(connectionString);
    const looksPooled =
      url.port === "6543" ||
      url.hostname.includes("pooler") ||
      url.hostname.includes("pgbouncer");
    const looksDirectPort = url.port === "5432" || url.port === "";
    if (!looksPooled && looksDirectPort) {
      console.warn(
        "[db] DATABASE_URL doesn't look like a transaction pooler connection string " +
          "(expected something like a :6543 port or a '-pooler'/'pgbouncer' host). " +
          "Direct connections are commonly IPv6-only and can fail in serverless " +
          "production even though they work locally. Double-check you copied the " +
          "pooled connection string from your provider's dashboard.",
      );
    }
  } catch {
    // Not a parseable URL -- let pg's own connection attempt surface the real error.
  }
}

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    warnIfLikelyDirectConnection(connectionString);
    pool = new Pool({
      connectionString,
      // Serverless functions are short-lived and many instances can run
      // concurrently, each with their own small pool -- keep this pool
      // itself small so we don't multiply into the pooler's own
      // connection limit, and recycle idle connections quickly rather
      // than holding them open across invocations.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

// --- Query helpers -------------------------------------------------------

// --- Row-level security ----------------------------------------------------
//
// Postgres decides what a query may see, from `app.account_id` set on the
// connection. Policies compare it against each row's account_id, so a query
// that forgets its own filter returns nothing instead of another account's
// rows. See migrations/0011_row_level_security.sql.
//
// The setting has to be LOCAL to a transaction. Connections are shared across
// requests through a pooler, so a session-level setting would leak to whoever
// got that connection next -- which would be worse than having none at all.
//
// Cost: an account-scoped query becomes BEGIN + set + query + COMMIT. BEGIN
// and the set go in one round trip, so it is three instead of one. Set
// DISABLE_DB_RLS_SCOPING=true to fall back to plain queries if this ever needs
// to be switched off in a hurry; the application-level account filters are
// still there underneath and remain the primary protection.

function rlsDisabled(): boolean {
  return process.env.DISABLE_DB_RLS_SCOPING === "true";
}

/**
 * Declare the account for the current transaction. The id is checked to be a
 * positive integer before interpolation, because set_config's third argument
 * being `true` (local) cannot be combined with a parameterized value in the
 * same round trip as BEGIN.
 */
function beginScoped(accountId: number): string {
  if (!Number.isInteger(accountId) || accountId < 1) {
    throw new Error(`beginScoped: refusing to scope to ${accountId}`);
  }
  return `begin; select set_config('app.account_id', '${accountId}', true);`;
}

/**
 * Run a parameterized query and return all rows.
 *
 * With an account in scope, runs inside a transaction that declares it, so
 * row-level security can enforce ownership. Without one -- signing in, before
 * any session exists -- runs plainly, and the policies then hide every
 * per-account table from it, which is the correct answer.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const accountId = rlsDisabled() ? null : await currentAccountIdOrNull();

  if (accountId === null) {
    const result = await getPool().query(text, params);
    return result.rows as T[];
  }

  return withClient(async (client) => {
    await client.query(beginScoped(accountId));
    try {
      const result = await client.query(text, params);
      await client.query("commit");
      return result.rows as T[];
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  });
}

/**
 * Run a parameterized query and return the first row, or null if none.
 */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run a callback inside a single client checked out from the pool,
 * useful for transactions (BEGIN/COMMIT/ROLLBACK) or when several
 * statements need to share connection-local state.
 */
export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Run a callback inside a transaction: BEGIN, run fn, COMMIT on success,
 * ROLLBACK on error.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const accountId = rlsDisabled() ? null : await currentAccountIdOrNull();
  return withClient(async (client) => {
    await client.query(accountId === null ? "begin" : beginScoped(accountId));
    try {
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
  });
}
