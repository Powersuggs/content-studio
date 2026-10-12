-- Content Studio: make the database enforce account ownership.
--
-- Until now, one account could not see another's data because every query
-- filters by account_id. That is correct, and tested, but it is correct
-- because the code is right. This makes it correct because the database
-- refuses to be otherwise: a query that forgets its filter returns nothing
-- rather than someone else's rows.
--
-- How it works: lib/db.ts opens a transaction and sets `app.account_id`
-- before each query. The policies below compare that against each row. If the
-- setting is absent the comparison is NULL, so no rows match -- it fails
-- closed, which is the behaviour we want for anything that forgets to declare
-- an account.
--
-- FORCE is the important word. RLS is normally bypassed by the table's owner,
-- and the app connects as the owner, so without FORCE these policies would do
-- nothing at all while appearing to be in place.
--
-- `accounts` and `email_verification_tokens` are deliberately NOT covered:
-- both are read before a session exists (signing in, confirming an email), so
-- locking them to an account id that does not exist yet would break login.
-- Neither holds per-account content, only identity.
--
-- Run this AFTER deploying the code that sets app.account_id, not before.

begin;

create or replace function app_current_account() returns bigint
language sql stable
as $$
  select nullif(current_setting('app.account_id', true), '')::bigint
$$;

comment on function app_current_account() is
  'The account the current transaction is acting as, or NULL if none was declared. NULL matches no rows, so policies fail closed.';

-- `accounts` and `email_verification_tokens` must stay readable without an
-- account in scope, because signing in looks up an account BEFORE there is a
-- session, and confirming an email looks up a token the same way. 0009 enabled
-- row-level security on accounts with no policy attached, which is harmless
-- while the app connects as the table owner but makes login impossible the
-- moment it does not. Turn it off explicitly rather than leave that landmine.
--
-- What that leaves exposed: the app's database role can read every row of
-- accounts, which is email addresses and scrypt password hashes. That is the
-- normal arrangement for a login table, and the hashes are not reversible.
-- Per-account CONTENT is what the policies below protect.
alter table accounts                  disable row level security;
alter table email_verification_tokens disable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'posts', 'insights', 'remakes', 'scripts', 'boards', 'board_posts',
    'profile', 'auth', 'lending_facts', 'credit_ledger', 'render_jobs', 'assets'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    -- Without FORCE, the owner role bypasses every policy below.
    execute format('alter table %I force row level security', t);

    execute format('drop policy if exists account_isolation on %I', t);
    execute format(
      'create policy account_isolation on %I
         using (account_id = app_current_account())
         with check (account_id = app_current_account())', t);
  end loop;
end $$;

commit;
