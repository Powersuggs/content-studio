-- Content Studio: the idea pipeline.
--
-- WHY THIS EXISTS
-- Until now the smallest thing the app could hold was a script. That means
-- a thought only enters the system once it is already most of the way to
-- being a post, and everything upstream of that -- the half-formed ones,
-- the ones worth saying three different ways -- lives in someone's head or
-- their notes app and quietly dies there.
--
-- An idea is the thing before the script. One idea is expected to produce
-- several outputs (a reel, a carousel, an email), which is why outputs are
-- their own table rather than a status column: "what have I not yet made
-- from this" is the question the pipeline exists to answer, and a single
-- status cannot answer it.
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists ideas (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id) on delete cascade,

  -- One line, the way it would be said out loud. Long enough to be a hook,
  -- short enough to scan a list of them.
  title       text not null,

  -- Anything else: the angle, who it is for, what prompted it.
  note        text,

  -- Where it came from, so the pipeline can show which routes actually
  -- produce work. 'capture' is typed or spoken straight in; the others
  -- arrive from flows that do not exist yet but will.
  source      text not null default 'capture',
  source_url  text,

  -- Set when the idea arrived as speech, kept so a bad transcription is
  -- recoverable and so the original wording is not lost to a tidy-up.
  transcript  text,

  -- Parked rather than deleted: an idea that is not working today is not
  -- the same as one that was wrong.
  archived_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint ideas_title_not_blank check (length(trim(title)) > 0),
  constraint ideas_source_check
    check (source in ('capture', 'interview', 'news', 'post', 'import'))
);

create index if not exists ideas_account_id_idx on ideas (account_id);
create index if not exists ideas_account_active_idx
  on ideas (account_id, created_at desc) where archived_at is null;

-- ---------------------------------------------------------------------
-- idea_outputs: one row per format actually made from an idea.
--
-- Absence is the point. The formats NOT in here are what the pipeline
-- shows as still on the table, so there is no need to pre-create a row
-- per possible format and no migration needed when a format is added.
-- ---------------------------------------------------------------------
create table if not exists idea_outputs (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id) on delete cascade,
  idea_id     bigint not null references ideas (id) on delete cascade,

  -- 'reel' | 'carousel' | 'story' | 'short' | 'email' | 'blog' | 'thread'.
  -- Text rather than an enum so adding one is an application change.
  format      text not null,

  -- The script this turned into, when it became one. Nullable because an
  -- output can be ticked off as made elsewhere -- plenty gets written
  -- straight into Instagram and never passes through here.
  script_id   bigint references scripts (id) on delete set null,

  created_at  timestamptz not null default now(),

  constraint idea_outputs_unique_format unique (idea_id, format)
);

create index if not exists idea_outputs_account_id_idx on idea_outputs (account_id);
create index if not exists idea_outputs_idea_id_idx on idea_outputs (idea_id);

alter table ideas enable row level security;
alter table ideas force row level security;
drop policy if exists account_isolation on ideas;
create policy account_isolation on ideas
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

alter table idea_outputs enable row level security;
alter table idea_outputs force row level security;
drop policy if exists account_isolation on idea_outputs;
create policy account_isolation on idea_outputs
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on ideas, idea_outputs to app_user;
    grant usage, select on sequence ideas_id_seq to app_user;
    grant usage, select on sequence idea_outputs_id_seq to app_user;
  end if;
end
$$;

commit;
