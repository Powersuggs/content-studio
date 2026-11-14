/**
 * Turning a database error into something a person can act on.
 *
 * The problem this solves: a page that reads a table the database does not
 * have fails in a way that tells the reader nothing. Either it throws and
 * they get "Application error: a server-side exception has occurred", or
 * worse, the page catches it and renders an empty list, so a broken install
 * is indistinguishable from having no data yet.
 *
 * Both happened in this app. The second is the dangerous one, because it
 * looks like everything is fine.
 *
 * Note that Next.js strips server error messages in production before they
 * reach a client error boundary, so this has to be read and rendered on the
 * server, by the page itself. There is no global place to put it.
 */

/**
 * Which migration creates which table. Hand-maintained, and checked by
 * scripts/check-migration-map.mjs so adding a table without adding it here
 * fails loudly rather than producing a vague message years later.
 */
export const MIGRATION_FOR_TABLE: Record<string, string> = {
  accounts: "0009_accounts.sql",
  assets: "0009_accounts.sql",
  auth: "0001_init.sql",
  board_posts: "0001_init.sql",
  book_chapters: "0026_books.sql",
  books: "0026_books.sql",
  boards: "0001_init.sql",
  credit_ledger: "0009_accounts.sql",
  data_deletion_requests: "0013_instagram_oauth.sql",
  email_verification_tokens: "0009_accounts.sql",
  game_plan: "0017_game_plan.sql",
  hook_patterns: "0027_hook_patterns.sql",
  idea_outputs: "0016_ideas.sql",
  ideas: "0016_ideas.sql",
  insights: "0001_init.sql",
  invite_codes: "0015_invite_codes.sql",
  leads: "0024_leads.sql",
  lending_facts: "0007_lending_facts.sql",
  newsletters: "0018_newsletters.sql",
  photos: "0021_photos.sql",
  posts: "0001_init.sql",
  profile: "0001_init.sql",
  remakes: "0001_init.sql",
  render_jobs: "0009_accounts.sql",
  scripts: "0001_init.sql",
  social_handles: "0014_social_handles.sql",
  voice_answers: "0012_voice_profile.sql",
  voice_profile: "0012_voice_profile.sql",
};

/**
 * The newest migration file. Named in the missing-column message, since
 * that is the one almost certainly not yet run. Asserted against the
 * migrations directory by scripts/check-migration-map.mjs.
 */
export const LATEST_MIGRATION = "0029_pattern_applies_to.sql";

/** Thrown by requireMyHandle when no Instagram handle is set yet. */
const NO_HANDLE = "NO_HANDLE";

/** Postgres: relation does not exist. */
const UNDEFINED_TABLE = "42P01";
/** Postgres: column does not exist, which a half-applied migration causes. */
const UNDEFINED_COLUMN = "42703";

function codeOf(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}

/**
 * The column and table out of a missing-column error.
 *
 * Checked BEFORE missingTable, and this ordering is load-bearing. Postgres
 * words a missing column on an insert or update as
 *
 *   column "content" of relation "idea_outputs" does not exist
 *
 * which contains the exact phrase a missing TABLE produces. A loose search
 * for `relation "x" does not exist` therefore matched it and announced that
 * idea_outputs did not exist, sending someone to the migration that creates
 * a table they already had. Shapes Postgres actually emits, all verified
 * against a real server:
 *
 *   42703  column "no_such_col" does not exist
 *   42703  column "no_such_col" of relation "ideas" does not exist
 *   42703  column i.no_such_col does not exist          (no quotes)
 *   42P01  relation "no_such_table" does not exist
 */
export function missingColumn(
  err: unknown,
): { column: string; table: string | null } | null {
  const message = messageOf(err);
  if (codeOf(err) !== UNDEFINED_COLUMN && !/^column /i.test(message)) return null;

  const withTable = /^column "([^"]+)" of relation "([^"]+)" does not exist/i.exec(message);
  if (withTable) return { column: withTable[1], table: withTable[2] };

  const quoted = /^column "([^"]+)" does not exist/i.exec(message);
  if (quoted) return { column: quoted[1], table: null };

  const qualified = /^column (?:([A-Za-z0-9_]+)\.)?([A-Za-z0-9_]+) does not exist/i.exec(message);
  if (qualified) return { column: qualified[2], table: qualified[1] ?? null };

  return { column: "", table: null };
}

/**
 * The table name out of `relation "ideas" does not exist`.
 *
 * Anchored to the start of the message so it cannot match the tail of a
 * missing-column error (see missingColumn above for why that mattered).
 */
export function missingTable(err: unknown): string | null {
  if (missingColumn(err)) return null;
  const message = messageOf(err);
  if (codeOf(err) !== UNDEFINED_TABLE && !/does not exist/i.test(message)) {
    return null;
  }
  const match = /^relation "([^"]+)" does not exist/i.exec(message);
  return match ? match[1] : null;
}

/**
 * A sentence worth showing, or null when this is not a setup problem and
 * should be treated as a real fault.
 */
export function explainDbError(err: unknown): string | null {
  // Not a database fault, but the same shape of problem from the reader's
  // side: something has to be set up before this page can say anything.
  // Without this, a new account that has not connected Instagram gets
  // "Application error" on half the app.
  if (codeOf(err) === NO_HANDLE) {
    return "This page needs your Instagram handle, which is not set yet. Connect Instagram on the Sources & Facts page, or set the handle on your dashboard, then come back.";
  }

  const table = missingTable(err);
  if (table) {
    const migration = MIGRATION_FOR_TABLE[table];
    return migration
      ? `This page needs the "${table}" table, which is not in the database yet. Run migrations/${migration} against it, then reload.`
      : `This page needs the "${table}" table, which is not in the database yet. Run the migration that creates it, then reload.`;
  }

  const column = missingColumn(err);
  if (column) {
    // Naming the newest migration rather than saying "the most recent one"
    // because the person reading this is standing in front of a broken page
    // and should not have to go and work out which file that is. A column
    // the code wants but the database lacks is almost always the newest
    // migration not having been run yet; check-migration-map.mjs keeps this
    // constant honest.
    const which = column.column
      ? `the "${column.column}" column${column.table ? ` on "${column.table}"` : ""}`
      : "a column";
    return `The database is missing ${which}, which this needs. That almost always means the newest migration has not been run yet. Run migrations/${LATEST_MIGRATION} against it, then reload.`;
  }

  return null;
}

/**
 * Run a database read and hand back both the data and, when the read failed
 * for a reason worth explaining, the explanation.
 *
 * A fault that is NOT a setup problem is rethrown rather than swallowed. A
 * dead connection should not quietly render as an empty page: that is the
 * failure mode this whole file exists to stop.
 */
export async function safeLoad<T>(
  fn: () => Promise<T>,
  fallback: T,
  context = "page",
): Promise<[T, string | null]> {
  try {
    return [await fn(), null];
  } catch (err) {
    const explained = explainDbError(err);
    if (!explained) throw err;
    console.error(`[${context}] setup problem:`, err);
    return [fallback, explained];
  }
}
