-- Content Studio: the voice profile.
--
-- One interview, answered once, that every piece of writing is then shaped by.
-- Without it the AI writes competent generic content; with it, it writes
-- something that sounds like the person who answered.
--
-- Two tables rather than one: the raw answers are kept separately from the
-- synthesised profile, so the profile can be rebuilt from the answers whenever
-- the synthesis prompt improves, without making anyone sit through the
-- interview again.

begin;

-- ---------------------------------------------------------------------
-- voice_answers: one row per question answered.
-- ---------------------------------------------------------------------
create table if not exists voice_answers (
  id             bigint generated always as identity primary key,
  account_id     bigint not null references accounts (id) on delete cascade,
  question_key   text not null,
  answer_text    text not null,
  -- How it arrived, so we can tell typed answers from spoken ones when
  -- judging quality later. 'typed' | 'spoken'
  source         text not null default 'typed',
  -- The raw transcript before jargon correction, kept so a bad correction is
  -- recoverable and so we can see how often correction was needed.
  raw_transcript text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint voice_answers_source_check check (source in ('typed', 'spoken')),
  constraint voice_answers_unique_per_account unique (account_id, question_key)
);

create index if not exists voice_answers_account_id_idx on voice_answers (account_id);

-- ---------------------------------------------------------------------
-- voice_profile: one row per account. The synthesised result.
-- ---------------------------------------------------------------------
create table if not exists voice_profile (
  account_id        bigint primary key references accounts (id) on delete cascade,
  -- The block of text injected into every generation prompt.
  profile_prompt    text,
  -- Human-readable summary shown back to the person, so the profile is
  -- something they can read and disagree with rather than a black box.
  summary           text,
  -- Phrases they would never say. Worth storing separately: negative
  -- instructions do more for voice than positive ones.
  never_say         text,
  -- Whether the synthesis also read their existing posts.
  posts_analysed    integer not null default 0,
  answers_used      integer not null default 0,
  built_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table voice_answers enable row level security;
alter table voice_answers force row level security;
drop policy if exists account_isolation on voice_answers;
create policy account_isolation on voice_answers
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

alter table voice_profile enable row level security;
alter table voice_profile force row level security;
drop policy if exists account_isolation on voice_profile;
create policy account_isolation on voice_profile
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

grant select, insert, update, delete on voice_answers, voice_profile to app_user;
grant usage, select on sequence voice_answers_id_seq to app_user;

commit;
