import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import { FORMATS, isFormatId, type FormatId } from "./formats";

/**
 * Reading and writing the idea pipeline.
 *
 * Every query is account-scoped the usual way, so row-level security backs
 * up the filters rather than the filters being the only thing standing
 * between two customers' ideas.
 */

export interface Idea {
  id: number;
  title: string;
  note: string | null;
  source: string;
  sourceUrl: string | null;
  createdAt: Date;
  /** Formats already produced from this idea. */
  made: FormatId[];
  /** Formats still available, which is what the pipeline is really for. */
  remaining: FormatId[];
}

export type IdeaFilter = "all" | "in-progress" | "untouched";

interface IdeaRow {
  id: string;
  title: string;
  note: string | null;
  source: string;
  source_url: string | null;
  created_at: string;
  made: string[] | null;
}

export async function listIdeas(filter: IdeaFilter = "all"): Promise<Idea[]> {
  const accountId = await currentAccountId();

  // One query with an aggregate rather than a query per idea: a pipeline
  // of fifty ideas would otherwise be fifty-one round trips to show a list.
  const rows = await query<IdeaRow>(
    `select i.id, i.title, i.note, i.source, i.source_url, i.created_at,
            coalesce(
              array_agg(o.format order by o.created_at)
                filter (where o.format is not null),
              '{}'
            ) as made
       from ideas i
       left join idea_outputs o
         on o.idea_id = i.id and o.account_id = i.account_id
      where i.account_id = $1
        and i.archived_at is null
      group by i.id
      order by i.created_at desc
      limit 200`,
    [accountId],
  );

  const ideas = rows.map((row) => {
    const made = (row.made ?? []).filter(isFormatId);
    return {
      id: Number(row.id),
      title: row.title,
      note: row.note,
      source: row.source,
      sourceUrl: row.source_url,
      createdAt: new Date(row.created_at),
      made,
      remaining: FORMATS.map((f) => f.id).filter((f) => !made.includes(f)),
    };
  });

  if (filter === "untouched") return ideas.filter((i) => i.made.length === 0);
  if (filter === "in-progress") {
    return ideas.filter((i) => i.made.length > 0 && i.remaining.length > 0);
  }
  return ideas;
}

export async function createIdea(input: {
  title: string;
  note?: string | null;
  source?: string;
  sourceUrl?: string | null;
  transcript?: string | null;
}): Promise<number> {
  const accountId = await currentAccountId();
  const title = input.title.trim();
  if (!title) throw new Error("An idea needs a title.");

  const row = await queryOne<{ id: string }>(
    `insert into ideas (account_id, title, note, source, source_url, transcript)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      accountId,
      title.slice(0, 500),
      input.note?.trim() || null,
      input.source ?? "capture",
      input.sourceUrl?.trim() || null,
      input.transcript ?? null,
    ],
  );
  return Number(row!.id);
}

/** Ticks a format off, or unticks it if it was already there. */
export async function toggleOutput(
  ideaId: number,
  format: string,
): Promise<void> {
  if (!isFormatId(format)) throw new Error(`Unknown format: ${format}`);
  const accountId = await currentAccountId();

  const existing = await queryOne<{ id: string }>(
    `select o.id from idea_outputs o
      where o.account_id = $1 and o.idea_id = $2 and o.format = $3`,
    [accountId, ideaId, format],
  );

  if (existing) {
    await query(
      `delete from idea_outputs
        where account_id = $1 and idea_id = $2 and format = $3`,
      [accountId, ideaId, format],
    );
    return;
  }

  // The idea_id check in the WHERE is what stops one account ticking a
  // format onto another account's idea by guessing an id.
  await queryOne(
    `insert into idea_outputs (account_id, idea_id, format)
     select $1, i.id, $3 from ideas i
      where i.id = $2 and i.account_id = $1
     on conflict (idea_id, format) do nothing
     returning id`,
    [accountId, ideaId, format],
  );
}

/** Parks an idea without destroying it. */
export async function archiveIdea(ideaId: number): Promise<void> {
  const accountId = await currentAccountId();
  await query(
    `update ideas set archived_at = now(), updated_at = now()
      where id = $1 and account_id = $2`,
    [ideaId, accountId],
  );
}

export async function countIdeas(): Promise<{ total: number; untouched: number }> {
  const accountId = await currentAccountId();
  const row = await queryOne<{ total: string; untouched: string }>(
    `select count(*) as total,
            count(*) filter (
              where not exists (
                select 1 from idea_outputs o where o.idea_id = i.id
              )
            ) as untouched
       from ideas i
      where i.account_id = $1 and i.archived_at is null`,
    [accountId],
  );
  return {
    total: Number(row?.total ?? 0),
    untouched: Number(row?.untouched ?? 0),
  };
}
