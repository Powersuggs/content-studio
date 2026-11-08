import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import { DEFAULT_APP_TIMEZONE } from "@/lib/analytics-sql";
import { isFormatId, type FormatId } from "@/lib/ideas/formats";

/**
 * When things go out.
 *
 * The app could write a week of content in an afternoon and had nothing
 * to say about when any of it should be posted. Deciding that every
 * morning, in front of a pile of finished drafts, is the step where
 * posting actually stalls.
 */

/**
 * The two windows, from his own posting rules.
 *
 * Verified October 2026 and sitting in his facts library: the primary
 * window is 11:30 to 12:30, the secondary is 6:30 in the evening. Two
 * slots a day rather than an open calendar, because a calendar asks what
 * time, and "what time" is a question he already answered.
 */
export const SLOTS = [
  { id: "midday", label: "Midday", when: "11:30 to 12:30" },
  { id: "evening", label: "Evening", when: "around 6:30" },
] as const;

export type SlotId = (typeof SLOTS)[number]["id"];

export function isSlotId(v: unknown): v is SlotId {
  return typeof v === "string" && SLOTS.some((s) => s.id === v);
}

export interface QueuedPost {
  ideaId: number;
  format: FormatId;
  title: string;
  /** The hook, where there is one, since that is what he recognises it by. */
  hook: string | null;
  scheduledFor: string | null;
  slot: SlotId | null;
  postedAt: string | null;
}

interface QueueRow {
  idea_id: string;
  format: string;
  title: string;
  hook: string | null;
  scheduled_for: string | null;
  scheduled_slot: string | null;
  posted_at: string | null;
}

function toQueued(r: QueueRow): QueuedPost {
  return {
    ideaId: Number(r.idea_id),
    format: r.format as FormatId,
    title: r.title,
    hook: r.hook,
    scheduledFor: r.scheduled_for,
    slot: isSlotId(r.scheduled_slot) ? r.scheduled_slot : null,
    postedAt: r.posted_at,
  };
}

/**
 * The hook, pulled out of the stored draft in SQL.
 *
 * The content column is the generated JSON, and its title field is the
 * first slide or the spoken opening. Reading it here rather than parsing
 * every row in JavaScript keeps the queue to one query, and a row whose
 * content is not valid JSON comes back as null rather than throwing.
 */
const HOOK_EXPR = `
  case
    when o.content is not null and o.content::jsonb ? 'title'
      then nullif(btrim(o.content::jsonb ->> 'title'), '')
    else null
  end`;

/** Today where he lives, not where the server is. */
export async function today(): Promise<string> {
  const row = await queryOne<{ d: string }>(
    `select (now() at time zone $1)::date::text as d`,
    [DEFAULT_APP_TIMEZONE],
  );
  return row!.d;
}

/** Everything booked in and not yet posted, soonest first. */
export async function getScheduled(): Promise<QueuedPost[]> {
  const accountId = await currentAccountId();
  const rows = await query<QueueRow>(
    `select o.idea_id, o.format, i.title,
            ${HOOK_EXPR} as hook,
            o.scheduled_for::text as scheduled_for,
            o.scheduled_slot, o.posted_at::text as posted_at
       from idea_outputs o
       join ideas i on i.id = o.idea_id and i.account_id = o.account_id
      where o.account_id = $1
        and o.scheduled_for is not null
        and o.posted_at is null
      order by o.scheduled_for asc,
               case o.scheduled_slot when 'midday' then 0 else 1 end asc`,
    [accountId],
  );
  return rows.map(toQueued);
}

/**
 * Finished drafts with nowhere to be.
 *
 * Only drafts that were actually written here: a tick meaning "I made
 * this elsewhere" has nothing to schedule. Archived ideas are left out,
 * because an idea he put on the shelf is not a thing waiting to go out.
 */
export async function getReadyToPost(): Promise<QueuedPost[]> {
  const accountId = await currentAccountId();
  const rows = await query<QueueRow>(
    `select o.idea_id, o.format, i.title,
            ${HOOK_EXPR} as hook,
            o.scheduled_for::text as scheduled_for,
            o.scheduled_slot, o.posted_at::text as posted_at
       from idea_outputs o
       join ideas i on i.id = o.idea_id and i.account_id = o.account_id
      where o.account_id = $1
        and o.content is not null
        and o.scheduled_for is null
        and o.posted_at is null
        and i.archived_at is null
      order by o.created_at desc`,
    [accountId],
  );
  return rows.map(toQueued);
}

/** What has gone out, newest first, for the done list. */
export async function getRecentlyPosted(limit = 10): Promise<QueuedPost[]> {
  const accountId = await currentAccountId();
  const rows = await query<QueueRow>(
    `select o.idea_id, o.format, i.title,
            ${HOOK_EXPR} as hook,
            o.scheduled_for::text as scheduled_for,
            o.scheduled_slot, o.posted_at::text as posted_at
       from idea_outputs o
       join ideas i on i.id = o.idea_id and i.account_id = o.account_id
      where o.account_id = $1 and o.posted_at is not null
      order by o.posted_at desc
      limit $2`,
    [accountId, limit],
  );
  return rows.map(toQueued);
}

/**
 * Books a draft into a day and a slot.
 *
 * The database refuses a second booking for the same slot, so the clash
 * is reported rather than silently overwriting whatever was there. Two
 * tabs open on the same morning is all it takes.
 */
export async function scheduleDraft(input: {
  ideaId: number;
  format: string;
  day: string;
  slot: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isFormatId(input.format)) throw new Error(`Unknown format: ${input.format}`);
  if (!isSlotId(input.slot)) throw new Error(`Unknown slot: ${input.slot}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw new Error("A day must be YYYY-MM-DD");

  const accountId = await currentAccountId();
  try {
    await query(
      `update idea_outputs
          set scheduled_for = $4::date, scheduled_slot = $5
        where account_id = $1 and idea_id = $2 and format = $3`,
      [accountId, input.ideaId, input.format, input.day, input.slot],
    );
    return { ok: true };
  } catch (err) {
    if (String((err as { code?: string })?.code) === "23505") {
      return { ok: false, reason: "Something is already in that slot." };
    }
    throw err;
  }
}

/** Takes it back off the calendar, leaving the draft alone. */
export async function unscheduleDraft(ideaId: number, format: string): Promise<void> {
  if (!isFormatId(format)) throw new Error(`Unknown format: ${format}`);
  const accountId = await currentAccountId();
  await query(
    `update idea_outputs
        set scheduled_for = null, scheduled_slot = null
      where account_id = $1 and idea_id = $2 and format = $3`,
    [accountId, ideaId, format],
  );
}

/**
 * Ticks it off.
 *
 * Posting is recorded rather than the row being cleared, so the slot
 * frees up, the draft stays readable, and the done list has something to
 * show. Un-posting is the same call with posted set false, because the
 * mis-tick is the likeliest mistake on this page.
 */
export async function setPosted(
  ideaId: number,
  format: string,
  posted: boolean,
): Promise<void> {
  if (!isFormatId(format)) throw new Error(`Unknown format: ${format}`);
  const accountId = await currentAccountId();
  await query(
    `update idea_outputs
        set posted_at = case when $4 then now() else null end
      where account_id = $1 and idea_id = $2 and format = $3`,
    [accountId, ideaId, format, posted],
  );
}
