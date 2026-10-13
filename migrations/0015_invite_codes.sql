-- Content Studio: letting other people in.
--
-- WHY THIS EXISTS
-- The app has had accounts, per-account isolation and per-account Instagram
-- for a while. What it has never had is a way for anyone except the owner to
-- GET an account. Everything was built for multiple people and only one
-- person could ever sign in.
--
-- WHY INVITE CODES RATHER THAN OPEN SIGNUP
-- Open signup on a public URL needs email verification to stop it filling
-- with junk, and email verification needs an email provider that is not set
-- up yet. An invite code is the same gate without the dependency: the owner
-- hands a code to someone they actually want in. It also fits how this is
-- really going to be used first, which is a handful of known people rather
-- than the public.
--
-- WHY RLS IS OFF HERE
-- Signup reads this table BEFORE a session exists, same as `accounts` and
-- `email_verification_tokens`. Locking it to an account id that does not
-- exist yet would make redeeming a code impossible. The code itself is the
-- credential: 16 random characters, and consuming one is a single atomic
-- UPDATE that cannot be raced past its use limit.
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists invite_codes (
  code          text primary key,

  -- Who issued it, so the settings page can list a person's own codes and
  -- an audit question has an answer.
  created_by    bigint references accounts (id) on delete set null,

  -- Free text so the owner can remember who a code was for.
  note          text,

  -- A code may be handed to one person or pinned in a group chat. Defaults
  -- to single use, which is the safer of the two to get wrong.
  max_uses      integer not null default 1,
  uses          integer not null default 0,

  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),

  constraint invite_codes_max_uses_check check (max_uses >= 1),
  constraint invite_codes_uses_check     check (uses >= 0)
);

create index if not exists invite_codes_created_by_idx on invite_codes (created_by);

-- Which code an account came in on. Answers "how did this person get here",
-- and makes a compromised code's damage visible rather than guessed at.
alter table accounts add column if not exists invited_with text;
alter table accounts add column if not exists created_via text;

alter table invite_codes disable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update on invite_codes to app_user;
  end if;
end
$$;

commit;
