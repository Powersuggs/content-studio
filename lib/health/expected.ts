/**
 * What the database is supposed to look like, so the app can check.
 *
 * There are already tests that prove row-level security works against a
 * throwaway database. None of them could see Aaron's. A migration that
 * was written specifically to defuse a landmine never ran on it, and
 * nobody knew for weeks: his login simply failed with a wrong-password
 * message whatever he typed, because the query could not see the
 * accounts table at all.
 *
 * A test that only runs on a database nobody uses is a test of the
 * schema, not of the system. This is the other half.
 */

/**
 * Must be readable with no account in scope.
 *
 * Signing in looks up an account BEFORE there is a session, and
 * confirming an email looks up a token the same way. Protection switched
 * on here, even with no rule attached, makes both impossible the moment
 * the app stops connecting as the table owner. That is precisely what
 * happened.
 */
export const MUST_BE_OPEN = ["accounts", "email_verification_tokens"] as const;

/**
 * Must be locked to one account, with FORCE.
 *
 * Without FORCE the owner role bypasses every policy, so the protection
 * is there on paper and absent in practice.
 */
export const MUST_BE_LOCKED = [
  "assets",
  "auth",
  "board_posts",
  "boards",
  "credit_ledger",
  "game_plan",
  "idea_outputs",
  "ideas",
  "insights",
  "lending_facts",
  "newsletters",
  "photos",
  "posts",
  "profile",
  "remakes",
  "render_jobs",
  "scripts",
  "social_handles",
  "voice_answers",
  "voice_profile",
] as const;

export interface TableState {
  table: string;
  present: boolean;
  rlsOn: boolean;
  forced: boolean;
  policies: number;
}

export type Severity = "ok" | "warn" | "danger";

export interface Finding {
  table: string;
  severity: Severity;
  /** What is wrong, in a sentence anyone can act on. */
  says: string;
  /** The exact SQL that puts it right, or null when nothing is wrong. */
  fix: string | null;
}

/**
 * Compares what is there against what should be, and says what to run.
 *
 * Pure, so it can be tested without a database. The severities matter:
 * a table that cannot be read breaks a feature and is loud; a table
 * that is readable by everyone is a data leak and is louder.
 */
export function judge(states: TableState[]): Finding[] {
  const found = new Map(states.map((s) => [s.table, s]));
  const out: Finding[] = [];

  for (const table of MUST_BE_OPEN) {
    const s = found.get(table);
    if (!s?.present) {
      out.push({
        table,
        severity: "danger",
        says: `${table} is missing. A migration has not been run.`,
        fix: null,
      });
      continue;
    }
    if (s.rlsOn) {
      out.push({
        table,
        severity: "danger",
        says:
          s.policies === 0
            ? `${table} is locked with no rule attached, so nothing can read it. This is what breaks signing in.`
            : `${table} is locked. It has to be readable before anyone is signed in.`,
        fix: `alter table ${table} disable row level security;`,
      });
      continue;
    }
    out.push({ table, severity: "ok", says: `${table} is readable at sign-in, as it must be.`, fix: null });
  }

  for (const table of MUST_BE_LOCKED) {
    const s = found.get(table);
    if (!s?.present) {
      out.push({
        table,
        severity: "warn",
        says: `${table} is missing. A migration has not been run.`,
        fix: null,
      });
      continue;
    }
    const problems: string[] = [];
    if (!s.rlsOn) problems.push("not locked at all");
    else if (!s.forced) problems.push("locked but not forced, so the owner role walks straight past it");
    if (s.policies === 0) problems.push("has no rule saying who may read it");

    if (problems.length === 0) {
      out.push({ table, severity: "ok", says: `${table} is locked to one account.`, fix: null });
      continue;
    }
    out.push({
      table,
      severity: "danger",
      says: `${table} is ${problems.join(", and ")}.`,
      fix: [
        `alter table ${table} enable row level security;`,
        `alter table ${table} force row level security;`,
        `drop policy if exists account_isolation on ${table};`,
        `create policy account_isolation on ${table}`,
        `  using (account_id = app_current_account())`,
        `  with check (account_id = app_current_account());`,
      ].join("\n"),
    });
  }

  return out;
}

/** Everything that needs doing, as one block to paste and run. */
export function repairScript(findings: Finding[]): string {
  const fixes = findings.map((f) => f.fix).filter((f): f is string => Boolean(f));
  if (fixes.length === 0) return "";
  return ["begin;", "", ...fixes, "", "commit;"].join("\n");
}
