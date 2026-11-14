import { randomInt } from "node:crypto";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth/current-account";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";

/**
 * The people with accounts, and the two things that can be done about
 * their passwords.
 *
 * There is no email provider, so there is no "forgot password" link to
 * send anyone. What there is instead: the owner can set someone a new
 * password and tell them what it is, and anyone can change their own.
 * Those two together mean nobody is ever permanently locked out, which
 * is the actual requirement. An email flow can replace the first half
 * later without touching the second.
 *
 * Every function here re-checks who is asking. The panel is hidden from
 * members in the page, and hiding a button is not a permission check.
 */

export interface Person {
  id: number;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
  /** Whether they have ever set a password. */
  has_password: boolean;
}

/**
 * Owner is a role, not an id.
 *
 * The rest of the app tests this by comparing against account id 1,
 * which is the account the migrations create. That holds today and
 * stops holding the moment an install starts from a signup instead, so
 * anything deciding who may change another person's password asks the
 * column that actually means it.
 */
export async function isOwner(): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  const row = await queryOne<{ role: string }>(
    "select role from accounts where id = $1",
    [session.accountId],
  );
  return row?.role === "owner";
}

async function requireOwner(): Promise<void> {
  if (!(await isOwner())) {
    throw new Error("Only the owner can do that.");
  }
}

export async function listPeople(): Promise<Person[]> {
  await requireOwner();
  return query<Person>(
    `select id, email, role, status, created_at,
            password_hash is not null as has_password
       from accounts
      order by case when role = 'owner' then 0 else 1 end, id`,
  );
}

/** Letters and digits that cannot be mistaken for each other when read aloud. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A temporary password, in groups, because it gets read out or typed
 * from a message rather than pasted by a password manager.
 */
function temporaryPassword(): string {
  let raw = "";
  for (let i = 0; i < 12; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return raw.match(/.{1,4}/g)!.join("-");
}

/**
 * Set someone a new password and hand it back once.
 *
 * Returned rather than stored anywhere, and never written to a log. The
 * only copy is the one on his screen, which is why the panel says to
 * send it before closing.
 */
export async function resetPassword(
  accountId: number,
): Promise<{ email: string | null; password: string }> {
  await requireOwner();

  const person = await queryOne<{ id: number; email: string | null }>(
    "select id, email from accounts where id = $1",
    [accountId],
  );
  if (!person) throw new Error("There is no account with that id.");

  const password = temporaryPassword();
  await query(
    `update accounts
        set password_hash = $1, status = 'active', updated_at = now()
      where id = $2`,
    [await hashPassword(password), accountId],
  );
  return { email: person.email, password };
}

/**
 * Change your own password, proving you know the current one first.
 *
 * Without this, a temporary password handed over in a message stays
 * that person's password forever, which makes the reset above worse
 * than useless.
 */
export async function changeOwnPassword(
  current: string,
  next: string,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("You are not signed in.");

  if (next.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const row = await queryOne<{ password_hash: string | null }>(
    "select password_hash from accounts where id = $1",
    [session.accountId],
  );
  if (!row) throw new Error("Your account could not be found.");

  if (!(await verifyPassword(current, row.password_hash))) {
    throw new Error("That is not your current password.");
  }

  await query(
    "update accounts set password_hash = $1, updated_at = now() where id = $2",
    [await hashPassword(next), session.accountId],
  );
}
