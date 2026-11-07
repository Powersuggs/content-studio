-- Content Studio: newsletters.
--
-- WHY THIS EXISTS
-- An idea that becomes a reel is one post. The same idea is usually also
-- an email, and the email is the one that reaches people who are not
-- being served an algorithm that day. The pipeline already tracks "email"
-- as a format you can tick off; this is where the email actually lives.
--
-- Drafts are kept rather than generated and thrown away. A newsletter gets
-- edited over a few sittings, and regenerating from scratch each time
-- loses whatever was good about the last pass.
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists newsletters (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id) on delete cascade,

  -- Which idea it came from, when it came from one. Nullable: plenty of
  -- emails start as an email rather than being promoted from an idea.
  idea_id     bigint references ideas (id) on delete set null,

  -- Several subject lines are generated and one is chosen, because the
  -- subject does most of the work and the first attempt is rarely best.
  subject     text not null,
  -- The alternatives, kept so a different one can be picked later without
  -- regenerating the whole thing.
  subject_alts text,

  -- Markdown. Rendered where it needs to be; pasted as-is into most email
  -- tools, which is the realistic path out of here for now.
  body        text not null,

  -- 'draft' | 'ready' | 'sent'. Nothing in this app sends anything, so
  -- 'sent' is the person recording that they sent it elsewhere.
  status      text not null default 'draft',

  -- What it was generated from, so a regeneration can be compared against
  -- the prompt that produced the current draft.
  topic       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint newsletters_subject_not_blank check (length(trim(subject)) > 0),
  constraint newsletters_status_check check (status in ('draft', 'ready', 'sent'))
);

create index if not exists newsletters_account_id_idx on newsletters (account_id);
create index if not exists newsletters_account_recent_idx
  on newsletters (account_id, created_at desc);
create index if not exists newsletters_idea_id_idx on newsletters (idea_id);

alter table newsletters enable row level security;
alter table newsletters force row level security;
drop policy if exists account_isolation on newsletters;
create policy account_isolation on newsletters
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on newsletters to app_user;
    grant usage, select on sequence newsletters_id_seq to app_user;
  end if;
end
$$;

commit;
