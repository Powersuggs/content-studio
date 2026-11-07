import { query, queryOne } from "@/lib/db";
import { currentAccountId } from "@/lib/auth/current-account";

export type NewsletterStatus = "draft" | "ready" | "sent";

export interface Newsletter {
  id: number;
  ideaId: number | null;
  subject: string;
  subjectAlts: string[];
  body: string;
  status: NewsletterStatus;
  topic: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Row {
  id: string;
  idea_id: string | null;
  subject: string;
  subject_alts: string | null;
  body: string;
  status: string;
  topic: string | null;
  created_at: string;
  updated_at: string;
}

function toNewsletter(r: Row): Newsletter {
  let alts: string[] = [];
  if (r.subject_alts) {
    try {
      const parsed = JSON.parse(r.subject_alts);
      if (Array.isArray(parsed)) alts = parsed.filter((x) => typeof x === "string");
    } catch {
      // Written before this was JSON, or hand-edited. Not worth failing a
      // page over a spare subject line.
    }
  }
  return {
    id: Number(r.id),
    ideaId: r.idea_id ? Number(r.idea_id) : null,
    subject: r.subject,
    subjectAlts: alts,
    body: r.body,
    status: (["draft", "ready", "sent"] as const).includes(r.status as NewsletterStatus)
      ? (r.status as NewsletterStatus)
      : "draft",
    topic: r.topic,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

const COLUMNS =
  "id, idea_id, subject, subject_alts, body, status, topic, created_at, updated_at";

export async function listNewsletters(limit = 50): Promise<Newsletter[]> {
  const accountId = await currentAccountId();
  const rows = await query<Row>(
    `select ${COLUMNS} from newsletters
      where account_id = $1
      order by created_at desc
      limit $2`,
    [accountId, limit],
  );
  return rows.map(toNewsletter);
}

export async function getNewsletter(id: number): Promise<Newsletter | null> {
  const accountId = await currentAccountId();
  const row = await queryOne<Row>(
    `select ${COLUMNS} from newsletters where id = $1 and account_id = $2`,
    [id, accountId],
  );
  return row ? toNewsletter(row) : null;
}

export async function saveNewsletter(input: {
  ideaId?: number | null;
  subject: string;
  subjectAlts?: string[];
  body: string;
  topic?: string | null;
}): Promise<number> {
  const accountId = await currentAccountId();
  const row = await queryOne<{ id: string }>(
    `insert into newsletters (account_id, idea_id, subject, subject_alts, body, topic)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      accountId,
      input.ideaId ?? null,
      input.subject.trim().slice(0, 300),
      JSON.stringify(input.subjectAlts ?? []),
      input.body,
      input.topic?.trim() || null,
    ],
  );
  return Number(row!.id);
}

export async function updateNewsletter(
  id: number,
  input: { subject?: string; body?: string; status?: NewsletterStatus },
): Promise<void> {
  const accountId = await currentAccountId();
  // coalesce so a partial edit does not blank the fields it left alone.
  await query(
    `update newsletters
        set subject    = coalesce($3, subject),
            body       = coalesce($4, body),
            status     = coalesce($5, status),
            updated_at = now()
      where id = $1 and account_id = $2`,
    [
      id,
      accountId,
      input.subject?.trim() || null,
      input.body ?? null,
      input.status ?? null,
    ],
  );
}

export async function deleteNewsletter(id: number): Promise<void> {
  const accountId = await currentAccountId();
  await query(`delete from newsletters where id = $1 and account_id = $2`, [
    id,
    accountId,
  ]);
}
