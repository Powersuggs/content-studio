-- Content Studio: accounts, credits, and render jobs.
--
-- SAFETY NOTE, read this before running it:
-- This migration is ADDITIVE ONLY. It creates new tables, adds nullable
-- columns to existing ones, and backfills them. It drops no data, renames
-- nothing, and makes no column NOT NULL. The currently deployed app does
-- not read any of these columns, so it keeps running unchanged after this
-- is applied. The lockdown (NOT NULL + row-level security policies) is a
-- separate later migration that runs only once the app code is scoping
-- queries by account.
--
-- It is also idempotent: running it twice is harmless.

begin;

-- ---------------------------------------------------------------------
-- accounts: one row per person who can log in
-- ---------------------------------------------------------------------
create table if not exists accounts (
  id                  bigint generated always as identity primary key,
  email               text,
  password_hash       text,
  email_verified_at   timestamptz,
  role                text not null default 'member',
  status              text not null default 'active',
  -- Spend ceiling, in credits, enforced per rolling 24h by the app.
  daily_credit_limit  integer not null default 200,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint accounts_role_check   check (role in ('owner','member','admin')),
  constraint accounts_status_check check (status in ('active','suspended'))
);

-- Email is case-insensitive and unique, but may be null (the owner row is
-- created by this migration before an email is known). A partial unique
-- index gives us both.
create unique index if not exists accounts_email_lower_key
  on accounts (lower(email)) where email is not null;

-- ---------------------------------------------------------------------
-- email verification: one-shot tokens, hashed at rest
-- ---------------------------------------------------------------------
create table if not exists email_verification_tokens (
  token_hash   text primary key,
  account_id   bigint not null references accounts (id) on delete cascade,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists evt_account_id_idx on email_verification_tokens (account_id);

-- ---------------------------------------------------------------------
-- credit_ledger: append-only. Balance is the sum of deltas, never a
-- column that can drift out of sync with its own history.
--   delta > 0  grant, top-up, refund
--   delta < 0  hold, debit
-- ---------------------------------------------------------------------
create table if not exists credit_ledger (
  id           bigint generated always as identity primary key,
  account_id   bigint not null references accounts (id) on delete cascade,
  delta        integer not null,
  reason       text not null,
  job_id       bigint,
  created_at   timestamptz not null default now(),
  constraint credit_ledger_delta_nonzero check (delta <> 0)
);

create index if not exists credit_ledger_account_id_idx on credit_ledger (account_id);
create index if not exists credit_ledger_account_created_idx on credit_ledger (account_id, created_at desc);

-- ---------------------------------------------------------------------
-- render_jobs: the queue and the receipt in one row
-- ---------------------------------------------------------------------
create table if not exists render_jobs (
  id               bigint generated always as identity primary key,
  account_id       bigint not null references accounts (id) on delete cascade,
  kind             text not null default 'video',
  model            text,
  prompt           text,
  input_image_url  text,
  status           text not null default 'queued',
  quoted_credits   integer,
  settled_credits  integer,
  gpu_seconds      double precision,
  provider_job_id  text,
  output_url       text,
  error            text,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  constraint render_jobs_status_check
    check (status in ('queued','running','succeeded','failed','cancelled'))
);

create index if not exists render_jobs_account_id_idx on render_jobs (account_id);
create index if not exists render_jobs_status_idx on render_jobs (status);
create index if not exists render_jobs_account_created_idx on render_jobs (account_id, created_at desc);

-- ---------------------------------------------------------------------
-- assets: every finished file, owned by an account, stored by us
-- ---------------------------------------------------------------------
create table if not exists assets (
  id           bigint generated always as identity primary key,
  account_id   bigint not null references accounts (id) on delete cascade,
  job_id       bigint references render_jobs (id) on delete set null,
  kind         text not null,
  url          text not null,
  bytes        bigint,
  created_at   timestamptz not null default now()
);

create index if not exists assets_account_id_idx on assets (account_id);
create index if not exists assets_job_id_idx on assets (job_id);

-- Now that render_jobs exists, point the ledger's job_id at it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'credit_ledger_job_id_fkey'
  ) then
    alter table credit_ledger
      add constraint credit_ledger_job_id_fkey
      foreign key (job_id) references render_jobs (id) on delete set null;
  end if;
end $$;

alter table accounts                  enable row level security;
alter table email_verification_tokens enable row level security;
alter table credit_ledger             enable row level security;
alter table render_jobs               enable row level security;
alter table assets                    enable row level security;

-- ---------------------------------------------------------------------
-- The owner account: your existing data belongs to it.
-- Email and password are set separately by scripts/create-owner.mjs so
-- that no credential is ever written into a file in the repo.
-- ---------------------------------------------------------------------
insert into accounts (id, role, daily_credit_limit)
  overriding system value
  values (1, 'owner', 100000)
  on conflict (id) do nothing;

-- Keep the identity sequence ahead of the row we just forced in.
select setval(pg_get_serial_sequence('accounts','id'),
              greatest((select max(id) from accounts), 1));

-- ---------------------------------------------------------------------
-- Scope every existing table to an account.
-- Nullable for now, backfilled to the owner, locked down in 0010.
-- ---------------------------------------------------------------------
alter table posts         add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table insights      add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table remakes       add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table scripts       add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table boards        add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table board_posts   add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table profile       add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table auth          add column if not exists account_id bigint references accounts (id) on delete cascade;
alter table lending_facts add column if not exists account_id bigint references accounts (id) on delete cascade;

update posts         set account_id = 1 where account_id is null;
update insights      set account_id = 1 where account_id is null;
update remakes       set account_id = 1 where account_id is null;
update scripts       set account_id = 1 where account_id is null;
update boards        set account_id = 1 where account_id is null;
update board_posts   set account_id = 1 where account_id is null;
update profile       set account_id = 1 where account_id is null;
update auth          set account_id = 1 where account_id is null;
update lending_facts set account_id = 1 where account_id is null;

create index if not exists posts_account_id_idx         on posts (account_id);
create index if not exists insights_account_id_idx      on insights (account_id);
create index if not exists remakes_account_id_idx       on remakes (account_id);
create index if not exists scripts_account_id_idx       on scripts (account_id);
create index if not exists boards_account_id_idx        on boards (account_id);
create index if not exists board_posts_account_id_idx   on board_posts (account_id);
create index if not exists lending_facts_account_id_idx on lending_facts (account_id);

-- posts.external_id was globally unique. Two accounts must be able to
-- track the same public Instagram post, so uniqueness becomes per account.
alter table posts drop constraint if exists posts_platform_external_id_key;
create unique index if not exists posts_account_platform_external_key
  on posts (account_id, platform, external_id);

-- ---------------------------------------------------------------------
-- profile and auth were hard-coded single-row tables. Free them.
-- ---------------------------------------------------------------------
alter table profile drop constraint if exists profile_singleton;
alter table auth    drop constraint if exists auth_singleton;

create sequence if not exists profile_id_seq owned by profile.id;
select setval('profile_id_seq', greatest((select coalesce(max(id),1) from profile), 1));
alter table profile alter column id set default nextval('profile_id_seq');

create sequence if not exists auth_id_seq owned by auth.id;
select setval('auth_id_seq', greatest((select coalesce(max(id),1) from auth), 1));
alter table auth alter column id set default nextval('auth_id_seq');

create unique index if not exists profile_account_id_key on profile (account_id);
create unique index if not exists auth_account_id_key    on auth (account_id);

commit;
