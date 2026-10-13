-- Content Studio: the other platforms.
--
-- WHY THIS EXISTS
-- Instagram is connected properly, through OAuth, because the app reads its
-- data. The other platforms are a different problem: each one needs its own
-- approval process before it will hand over a single number, and those take
-- weeks. Meanwhile the person already knows their own handles.
--
-- So this table stores what they tell us, and the app uses it immediately for
-- the parts that need no permission from anybody: showing where their accounts
-- are and linking straight to them.
--
-- WHY IT IS BUILT FOR MORE THAN THAT
-- The columns below (access_token, platform_user_id, token_expires_at,
-- connected_at) are empty for a hand-typed handle. They exist so that when a
-- platform IS connected properly later, the same row grows into a real
-- connection rather than needing a second table and a migration of everyone's
-- data. `connection` records which of the two a row is, so the UI can tell
-- "I typed this in" apart from "this is verified and syncing".
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists social_handles (
  id                bigint generated always as identity primary key,
  account_id        bigint not null references accounts (id) on delete cascade,

  -- 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin' | 'x' |
  -- 'pinterest' | 'threads'. Kept as text rather than an enum so adding a
  -- platform is an application change, not a migration.
  platform          text not null,

  -- As the person types it, without the leading @. Stored raw so it can be
  -- shown back to them exactly as they entered it.
  handle            text not null,

  -- The resolved link. Computed by the app from platform + handle, but stored
  -- so a person with an unusual profile URL can override it and keep it.
  profile_url       text,

  -- 'manual'  -- typed in; no data is read from the platform
  -- 'oauth'   -- properly connected; the token columns below are populated
  connection        text not null default 'manual',

  -- Populated only when connection = 'oauth'. Null for a typed handle.
  platform_user_id  text,
  access_token      text,
  token_expires_at  timestamptz,
  connected_at      timestamptz,
  scopes            text,

  -- Controls the order of the buttons, so the platform they care about most
  -- is not buried.
  sort_order        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One row per platform per account. Someone with two TikToks has to pick
  -- one; supporting several would mean every analytics query carries an
  -- account id AND a handle, which is a much larger change than it looks.
  constraint social_handles_unique_per_account unique (account_id, platform),
  constraint social_handles_connection_check check (connection in ('manual', 'oauth')),
  constraint social_handles_handle_not_blank check (length(trim(handle)) > 0)
);

create index if not exists social_handles_account_id_idx on social_handles (account_id);

-- Same reasoning as auth.ig_user_id: two accounts must not claim the same
-- verified profile, or each would see the other's numbers as their own. Only
-- applies to real connections -- two people may well type the same handle in
-- by mistake, and that is harmless because nothing is read from it.
create unique index if not exists social_handles_platform_user_key
  on social_handles (platform, platform_user_id)
  where platform_user_id is not null;

alter table social_handles enable row level security;
alter table social_handles force row level security;
drop policy if exists account_isolation on social_handles;
create policy account_isolation on social_handles
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on social_handles to app_user;
    grant usage, select on sequence social_handles_id_seq to app_user;
  end if;
end
$$;

commit;
