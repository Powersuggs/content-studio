import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";
import { FORMATS, isFormatId, type FormatId } from "./formats";
import { normalize, type GeneratedOutput } from "./generate";

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

// ---------------------------------------------------------------------
// Generated drafts. An output row used to be a tick meaning "I made this
// somewhere else". It can now also hold the thing itself, written here.
// ---------------------------------------------------------------------

export interface OutputDraft {
  format: FormatId;
  content: GeneratedOutput | null;
  generatedAt: Date | null;
  scriptId: number | null;
  /**
   * Where that script stands: draft, queued, or filmed.
   *
   * Carried so the panel can tell the truth about it. Writing a reel
   * stores a script, but storing one is not the same as putting it in the
   * teleprompter queue, and the panel used to claim it was.
   */
  scriptStatus: string | null;
  newsletterId: number | null;
}

interface DraftRow {
  format: string;
  content: string | null;
  generated_at: string | null;
  script_id: string | null;
  script_status: string | null;
  newsletter_id: string | null;
}

function toDraft(r: DraftRow): OutputDraft {
  let content: GeneratedOutput | null = null;
  if (r.content) {
    try {
      content = normalize(JSON.parse(r.content), r.format as FormatId);
    } catch {
      // Hand-edited or written by an older shape. A draft that will not
      // parse should show as a plain tick, not take the page down.
      content = null;
    }
  }
  return {
    format: r.format as FormatId,
    content,
    generatedAt: r.generated_at ? new Date(r.generated_at) : null,
    scriptId: r.script_id ? Number(r.script_id) : null,
    scriptStatus: r.script_status,
    newsletterId: r.newsletter_id ? Number(r.newsletter_id) : null,
  };
}

/** Every stored draft for one idea, so the list can render them inline. */
export async function listDrafts(ideaId: number): Promise<OutputDraft[]> {
  const accountId = await currentAccountId();
  const rows = await query<DraftRow>(
    `select o.format, o.content, o.generated_at, o.script_id,
            s.status as script_status, o.newsletter_id
       from idea_outputs o
       left join scripts s
         on s.id = o.script_id and s.account_id = o.account_id
      where o.account_id = $1 and o.idea_id = $2
      order by o.created_at asc`,
    [accountId, ideaId],
  );
  return rows.map(toDraft);
}

/** Drafts for several ideas at once, keyed by idea id. */
export async function listDraftsForIdeas(
  ideaIds: number[],
): Promise<Map<number, OutputDraft[]>> {
  const out = new Map<number, OutputDraft[]>();
  if (ideaIds.length === 0) return out;
  const accountId = await currentAccountId();
  // One query rather than one per idea: a pipeline of fifty ideas would
  // otherwise be fifty round trips to render a list.
  const rows = await query<DraftRow & { idea_id: string }>(
    `select o.idea_id, o.format, o.content, o.generated_at, o.script_id,
            s.status as script_status, o.newsletter_id
       from idea_outputs o
       left join scripts s
         on s.id = o.script_id and s.account_id = o.account_id
      where o.account_id = $1 and o.idea_id = any($2::bigint[])
      order by o.created_at asc`,
    [accountId, ideaIds],
  );
  for (const r of rows) {
    const id = Number(r.idea_id);
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push(toDraft(r));
  }
  return out;
}

/** The idea itself, for generating from. Scoped, so it cannot read another account's. */
export async function getIdeaForGeneration(
  ideaId: number,
): Promise<{ id: number; title: string; note: string | null } | null> {
  const accountId = await currentAccountId();
  const row = await queryOne<{ id: string; title: string; note: string | null }>(
    `select id, title, note from ideas where id = $1 and account_id = $2`,
    [ideaId, accountId],
  );
  return row ? { id: Number(row.id), title: row.title, note: row.note } : null;
}

/**
 * Stores a generated draft against its idea and format.
 *
 * Upsert rather than insert: regenerating replaces what was there, which
 * is what pressing the button a second time plainly means. The idea_id
 * check in the select is what stops one account writing a draft onto
 * another account's idea by guessing an id.
 */
export async function saveDraft(input: {
  ideaId: number;
  format: FormatId;
  content: GeneratedOutput;
  scriptId?: number | null;
  newsletterId?: number | null;
}): Promise<void> {
  const accountId = await currentAccountId();
  await queryOne(
    `insert into idea_outputs
       (account_id, idea_id, format, content, generated_at, script_id, newsletter_id)
     select $1, i.id, $3, $4, now(), $5, $6 from ideas i
      where i.id = $2 and i.account_id = $1
     on conflict (idea_id, format) do update set
       content       = excluded.content,
       generated_at  = excluded.generated_at,
       script_id     = coalesce(excluded.script_id, idea_outputs.script_id),
       newsletter_id = coalesce(excluded.newsletter_id, idea_outputs.newsletter_id)
     returning id`,
    [
      accountId,
      input.ideaId,
      input.format,
      JSON.stringify(input.content),
      input.scriptId ?? null,
      input.newsletterId ?? null,
    ],
  );
}

/**
 * Stores how a carousel's slides are laid out.
 *
 * Reads the draft, puts the plan inside it, writes it back. Deliberately
 * not a column: the plan only means anything next to the exact text it
 * was built for, and keeping them in one value means a rewrite replaces
 * both at once instead of leaving a plan pointing at sentences that no
 * longer exist.
 */
export async function saveSlidePlan(
  ideaId: number,
  format: FormatId,
  plan: unknown,
): Promise<void> {
  const accountId = await currentAccountId();
  const row = await queryOne<{ content: string | null }>(
    `select content from idea_outputs
      where account_id = $1 and idea_id = $2 and format = $3`,
    [accountId, ideaId, format],
  );
  if (!row?.content) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(row.content) as Record<string, unknown>;
  } catch {
    return;
  }
  parsed.plan = plan;

  await query(
    `update idea_outputs set content = $4
      where account_id = $1 and idea_id = $2 and format = $3`,
    [accountId, ideaId, format, JSON.stringify(parsed)],
  );
}

/**
 * How many times each photo has been used on a slide.
 *
 * Counted from the stored plans rather than kept in a column, so it can
 * never disagree with reality: deleting a carousel or swapping a photo
 * out changes the count the moment it happens, with nothing to keep in
 * step. The table is small and this runs once per page.
 */
export async function photoUsage(): Promise<Map<number, number>> {
  const accountId = await currentAccountId();
  const rows = await query<{ content: string | null }>(
    `select content from idea_outputs
      where account_id = $1 and content is not null`,
    [accountId],
  );
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (!r.content) continue;
    try {
      const parsed = JSON.parse(r.content) as { plan?: { slides?: { photoId?: unknown }[] } };
      for (const s of parsed.plan?.slides ?? []) {
        const id = typeof s?.photoId === "number" ? s.photoId : null;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    } catch {
      // A draft whose JSON will not parse simply contributes nothing.
    }
  }
  return counts;
}
