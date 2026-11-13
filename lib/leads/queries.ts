import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import type { Lead, LeadSource, LeadStatus } from "./types";
import { COLLECTED_HANDLES_SQL } from "./sql";

export type { Lead, LeadSource, LeadStatus } from "./types";
export { LEAD_STATUSES } from "./types";

/**
 * Handles the app has already collected, other than his own.
 *
 * Every one is an account he chose to look at: saved to a board,
 * reverse-engineered on the Inspiration page, or torn down. Nothing here
 * was scraped. His own handles are excluded by name, taken from the
 * profile and from the connected accounts, because a reference post can
 * be saved under his own handle and he is not a lead.
 */
export async function findCollectedHandles(): Promise<
  { handle: string; source: LeadSource; posts: number }[]
> {
  const account = await currentAccountId();
  return query<{ handle: string; source: LeadSource; posts: number }>(
    COLLECTED_HANDLES_SQL,
    [account],
  );
}

/**
 * Add anyone collected who is not on the list yet.
 *
 * Returns how many were added. Running it again adds nothing, which is
 * what lets the button be pressed whenever without thinking about it.
 */
export async function addCollectedLeads(): Promise<number> {
  const account = await currentAccountId();
  const found = await findCollectedHandles();
  if (found.length === 0) return 0;

  let added = 0;
  for (const row of found) {
    const inserted = await queryOne<{ id: number }>(
      `insert into leads (account_id, handle, platform, source, status)
       values ($1, $2, 'instagram', $3, 'new')
       on conflict (account_id, platform, handle) do nothing
       returning id`,
      [account, row.handle, row.source],
    );
    if (inserted) added += 1;
  }
  return added;
}

export async function getLeads(status?: LeadStatus): Promise<Lead[]> {
  const account = await currentAccountId();
  return query<Lead>(
    `select l.id, l.handle, l.platform, l.source, l.status, l.note,
            l.first_seen, l.last_touched,
            (select count(*)::int from posts p
              where p.account_id = l.account_id and lower(p.handle) = l.handle) as posts_seen
       from leads l
      where l.account_id = $1
        ${status ? "and l.status = $2" : ""}
      order by
        -- Anything waiting on him first, then by how much he has of them.
        case l.status when 'to contact' then 0 when 'new' then 1
                      when 'replied' then 2 when 'contacted' then 3 else 4 end,
        l.first_seen desc`,
    status ? [account, status] : [account],
  );
}

export async function countLeadsByStatus(): Promise<Record<string, number>> {
  const account = await currentAccountId();
  const rows = await query<{ status: string; n: number }>(
    `select status, count(*)::int as n from leads where account_id = $1 group by status`,
    [account],
  );
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export async function addLead(handle: string, note?: string): Promise<{ id: number }> {
  const account = await currentAccountId();
  const clean = handle.trim().replace(/^@+/, "").toLowerCase();
  if (!clean) throw new Error("A handle is needed.");
  const row = await queryOne<{ id: number }>(
    `insert into leads (account_id, handle, platform, source, status, note)
     values ($1, $2, 'instagram', 'manual', 'to contact', $3)
     on conflict (account_id, platform, handle)
       do update set note = coalesce(excluded.note, leads.note)
     returning id`,
    [account, clean, note?.trim() || null],
  );
  if (!row) throw new Error("Could not save that one.");
  return row;
}

export async function setLeadStatus(id: number, status: LeadStatus): Promise<void> {
  const account = await currentAccountId();
  // last_touched only moves when he has actually done something, so
  // "new" and "not a fit" leave it where it was.
  await query(
    `update leads
        set status = $1,
            last_touched = case when $1 in ('contacted', 'replied') then now() else last_touched end
      where id = $2 and account_id = $3`,
    [status, id, account],
  );
}

export async function setLeadNote(id: number, note: string): Promise<void> {
  const account = await currentAccountId();
  await query(`update leads set note = $1 where id = $2 and account_id = $3`, [
    note.trim() || null,
    id,
    account,
  ]);
}

export async function deleteLead(id: number): Promise<void> {
  const account = await currentAccountId();
  await query(`delete from leads where id = $1 and account_id = $2`, [id, account]);
}
