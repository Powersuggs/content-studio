-- Content Studio: make sure app_user can actually use the tables.
--
-- WHAT WENT WRONG
-- Every migration that creates a table ends with a block shaped like
--
--   if exists (select 1 from pg_roles where rolname = 'app_user')
--   then grant ... end if;
--
-- which is correct for an install where the role already exists, and
-- silently does nothing on one where it does not. If the role is
-- created afterwards, every one of those grants was skipped and is
-- never retried, because a migration only runs once.
--
-- The symptom is not an error at deploy time. It is a button that fails
-- months later. Creating an invite code failed from the day the feature
-- shipped: the owner pressed it, got a server error, and the only way
-- to find out why was to read the logs. Codes handed out before that
-- would not have worked either, because nothing was ever stored.
--
-- WHY THIS IS NOT JUST "GRANT THE ONE TABLE"
-- The same silent skip applies to every table in every migration, so
-- fixing invite_codes alone would leave the rest to be discovered one
-- angry afternoon at a time. This grants the lot.
--
-- WHY IT IS SAFE
-- Row-level security is what decides which ROWS a query sees. These
-- grants decide which TABLES the role may touch at all. Granting
-- broadly here does not widen what any account can read: FORCE row
-- level security still applies to every table that holds an
-- account_id, and scripts/test-rls.mjs proves it.
--
-- Idempotent: running it twice is harmless.

begin;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant usage on schema public to app_user;
    grant select, insert, update, delete on all tables in schema public to app_user;
    grant usage, select on all sequences in schema public to app_user;

    -- Anything created after this migration runs, so a new table does
    -- not reintroduce the same hole. Applies to objects created by the
    -- role running this statement, which is the migration role.
    alter default privileges in schema public
      grant select, insert, update, delete on tables to app_user;
    alter default privileges in schema public
      grant usage, select on sequences to app_user;
  end if;
end
$$;

-- Read before a session exists, so these three cannot be account-scoped.
-- Re-asserted here because the same skipped-block problem applied to the
-- migrations that first set them.
alter table accounts                   disable row level security;
alter table invite_codes               disable row level security;
alter table email_verification_tokens  disable row level security;

commit;
