-- Content Studio: per-account Instagram connection.
--
-- WHY THIS EXISTS
-- Until now the Instagram account being synced came from two global
-- environment variables: INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN.
-- That works for exactly one person. For anyone else to use this app they
-- each need their own Instagram identity stored against their own account
-- row, obtained through Instagram's OAuth flow rather than pasted in by
-- hand.
--
-- SAFETY
-- Additive only. Every new column is nullable, so the existing deployed app
-- keeps running unchanged after this is applied. The env vars continue to
-- work as a bootstrap for the owner account (see lib/ig/token-store.ts), so
-- nothing breaks before the OAuth flow is used for the first time.
--
-- Idempotent: running it twice is harmless.

begin;

-- ---------------------------------------------------------------------
-- auth: now holds the account's Instagram identity, not just its token
-- ---------------------------------------------------------------------

-- The numeric Instagram user id this account syncs. Was INSTAGRAM_USER_ID.
alter table auth add column if not exists ig_user_id text;

-- Cached for display, so the settings page can say "connected as @handle"
-- without spending a Graph API call to find out.
alter table auth add column if not exists ig_username text;

alter table auth add column if not exists ig_connected_at timestamptz;

-- Long-lived Instagram tokens last 60 days. Storing the expiry lets the app
-- warn before a sync starts silently failing, rather than after.
alter table auth add column if not exists token_expires_at timestamptz;

-- The scopes actually granted. Instagram lets a user decline individual
-- permissions, so what we asked for and what we got can differ -- and if
-- insights were declined, the analytics half of this app cannot work and
-- should say so plainly instead of returning zeros.
alter table auth add column if not exists ig_scopes text;

-- Two accounts must never be able to connect the same Instagram profile:
-- both would sync the same posts, and each would see the other's metrics
-- as their own. Enforced at the database level so no application bug can
-- get around it.
create unique index if not exists auth_ig_user_id_key
  on auth (ig_user_id) where ig_user_id is not null;

-- ---------------------------------------------------------------------
-- data_deletion_requests
--
-- Meta requires an app to accept a data deletion request, return a URL
-- where the user can check its progress, and honour it. The status URL is
-- fetched by Meta and by the user with no session cookie, identified only
-- by the confirmation code -- so, like `accounts` and
-- `email_verification_tokens`, this table is deliberately NOT under
-- row-level account scoping. The confirmation code is the credential.
-- ---------------------------------------------------------------------
create table if not exists data_deletion_requests (
  -- Random, unguessable, and handed to Meta as the confirmation code.
  code          text primary key,
  -- Instagram's own user id, since a deletion request can arrive after the
  -- local account row is already gone.
  ig_user_id    text,
  account_id    bigint references accounts (id) on delete set null,
  status        text not null default 'pending',
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  constraint ddr_status_check check (status in ('pending', 'completed', 'failed'))
);

create index if not exists ddr_ig_user_id_idx on data_deletion_requests (ig_user_id);
create index if not exists ddr_account_id_idx on data_deletion_requests (account_id);

alter table data_deletion_requests disable row level security;

-- The restricted application role still needs to read and write it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update on data_deletion_requests to app_user;
  end if;
end
$$;

commit;
