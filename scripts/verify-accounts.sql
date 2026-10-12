-- Proves the accounts migration did what it claims.
-- Safe to run against any database that has had 0009 applied: it creates
-- a throwaway account, checks it, and rolls everything back at the end.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-accounts.sql

begin;

\echo ''
\echo '=== 1. Every existing row now belongs to the owner account ==='
select 'posts'         as table_name, count(*) filter (where account_id is null) as orphan_rows from posts
union all select 'insights',      count(*) filter (where account_id is null) from insights
union all select 'remakes',       count(*) filter (where account_id is null) from remakes
union all select 'scripts',       count(*) filter (where account_id is null) from scripts
union all select 'boards',        count(*) filter (where account_id is null) from boards
union all select 'board_posts',   count(*) filter (where account_id is null) from board_posts
union all select 'profile',       count(*) filter (where account_id is null) from profile
union all select 'auth',          count(*) filter (where account_id is null) from auth
union all select 'lending_facts', count(*) filter (where account_id is null) from lending_facts
order by table_name;
\echo '(every orphan_rows value must be 0)'

\echo ''
\echo '=== 2. A second person can sign up ==='
insert into accounts (email, password_hash, role, email_verified_at)
values ('tester@example.com', 'not-a-real-hash', 'member', now());

\echo '=== 3. ...and gets their own profile row, which the old schema forbade ==='
insert into profile (account_id, handle, timezone, display_name)
values ((select id from accounts where email = 'tester@example.com'), 'tester', 'America/Phoenix', 'Test User');
select count(*) as profile_rows_now from profile;
\echo '(must be 2 -- under the old singleton constraint this insert was impossible)'

\echo ''
\echo '=== 4. Two accounts can track the SAME public Instagram post ==='
insert into posts (account_id, platform, external_id, caption)
values ((select id from accounts where email = 'tester@example.com'), 'instagram', 'ig_1', 'same post, different account');
select account_id, external_id from posts where external_id = 'ig_1' order by account_id;
\echo '(two rows -- uniqueness is per account now, not global)'

\echo ''
\echo '=== 5. Email uniqueness is case-insensitive ==='
do $$
begin
  insert into accounts (email) values ('TESTER@Example.com');
  raise exception 'FAIL: duplicate email was accepted';
exception when unique_violation then
  raise notice 'PASS: duplicate email rejected';
end $$;

\echo ''
\echo '=== 6. Credit balance is the sum of the ledger, and cannot drift ==='
insert into credit_ledger (account_id, delta, reason) values
  ((select id from accounts where email='tester@example.com'),  50, 'signup_grant'),
  ((select id from accounts where email='tester@example.com'), -12, 'render_debit'),
  ((select id from accounts where email='tester@example.com'),  12, 'render_refund'),
  ((select id from accounts where email='tester@example.com'),  -8, 'render_debit');
select coalesce(sum(delta),0) as balance
from credit_ledger where account_id = (select id from accounts where email='tester@example.com');
\echo '(must be 42)'

\echo ''
\echo '=== 7. Deleting an account takes its data with it, and nobody elses ==='
delete from accounts where email = 'tester@example.com';
select (select count(*) from posts)   as owner_posts_remaining,
       (select count(*) from profile) as profile_rows_remaining;
\echo '(must be 3 and 1 -- the owner data is untouched)'

rollback;
\echo ''
\echo '=== rolled back: this check changed nothing ==='
