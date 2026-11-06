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

export interface PipelineSnapshot {
  /** Formats ticked off as made here, last 30 days. */
  made: number;
  /** Posts that actually went out on Instagram, last 30 days. */
  posted: number;
  /** Ideas captured that have produced nothing at all. */
  untouchedIdeas: number;
  /** Formats still available across every active idea. */
  formatsWaiting: number;
}

/**
 * The gap between what gets planned here and what actually goes out.
 *
 * The two counts are deliberately NOT presented as a conversion rate.
 * Nothing links an idea_output to the post it became -- plenty gets
 * written straight into Instagram and never passes through this app -- so
 * a percentage would be invented precision. Two honest numbers and the
 * size of the backlog say more than a made-up ratio.
 */
export async function getPipelineSnapshot(
  totalFormats: number,
): Promise<PipelineSnapshot> {
  const accountId = await currentAccountId();

  const row = await queryOne<{
    made: string;
    posted: string;
    untouched_ideas: string;
    outputs_on_active: string;
    active_ideas: string;
  }>(
    `select
       (select count(*) from idea_outputs o
         where o.account_id = $1
           and o.created_at >= now() - interval '30 days') as made,
       (select count(*) from posts p
         where p.account_id = $1
           and p.posted_at >= now() - interval '30 days') as posted,
       (select count(*) from ideas i
         where i.account_id = $1
           and i.archived_at is null
           and not exists (
             select 1 from idea_outputs o
              where o.idea_id = i.id and o.account_id = $1
           )) as untouched_ideas,
       (select count(*) from idea_outputs o
          join ideas i on i.id = o.idea_id and i.account_id = $1
         where o.account_id = $1
           and i.archived_at is null) as outputs_on_active,
       (select count(*) from ideas i
         where i.account_id = $1 and i.archived_at is null) as active_ideas`,
    [accountId],
  );

  const activeIdeas = Number(row?.active_ideas ?? 0);
  const outputsOnActive = Number(row?.outputs_on_active ?? 0);

  return {
    made: Number(row?.made ?? 0),
    posted: Number(row?.posted ?? 0),
    untouchedIdeas: Number(row?.untouched_ideas ?? 0),
    // Every active idea could still produce every format it has not yet.
    formatsWaiting: Math.max(activeIdeas * totalFormats - outputsOnActive, 0),
  };
}
