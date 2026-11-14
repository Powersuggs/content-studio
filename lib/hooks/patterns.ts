import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import type { HookPattern } from "./render";

export type { HookPattern } from "./render";
export { renderPatterns } from "./render";

/**
 * Patterns he has taken from creators he studies.
 *
 * Hook Lab's eight archetypes are the same eight for everybody. These
 * are his: what he noticed in someone's work, in his words, fed to the
 * model alongside the built-in ones so the app gets better at the thing
 * he is actually trying to learn.
 */


export async function listPatterns(): Promise<HookPattern[]> {
  const account = await currentAccountId();
  return query<HookPattern>(
    `select id, name, source, what_it_does, example, active
       from hook_patterns
      where account_id = $1
      order by active desc, created_at desc`,
    [account],
  );
}

export async function addPattern(input: {
  name: string;
  source?: string | null;
  whatItDoes: string;
  example?: string | null;
}): Promise<number> {
  const account = await currentAccountId();
  const name = input.name.trim();
  const what = input.whatItDoes.trim();
  if (!name) throw new Error("A pattern needs a name.");
  if (!what) throw new Error("Say what the pattern actually does, or it will not change anything.");

  try {
    const row = await queryOne<{ id: string }>(
      `insert into hook_patterns (account_id, name, source, what_it_does, example)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        account,
        name.slice(0, 120),
        input.source?.trim() || null,
        what.slice(0, 1000),
        input.example?.trim()?.slice(0, 500) || null,
      ],
    );
    return Number(row!.id);
  } catch (err) {
    // A unique index stops the same pattern being added twice, which
    // used to be possible and quietly doubled its weight in the prompt.
    // The database's own message for that is not something to show him.
    if (err && typeof err === "object" && (err as { code?: string }).code === "23505") {
      throw new Error(`You already have a pattern called "${name}".`);
    }
    throw err;
  }
}

export async function setPatternActive(id: number, active: boolean): Promise<void> {
  const account = await currentAccountId();
  await query(
    `update hook_patterns set active = $1 where id = $2 and account_id = $3`,
    [active, id, account],
  );
}

export async function deletePattern(id: number): Promise<void> {
  const account = await currentAccountId();
  await query(`delete from hook_patterns where id = $1 and account_id = $2`, [id, account]);
}
