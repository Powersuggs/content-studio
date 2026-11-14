-- Content Studio: patterns he has taken from creators he studies.
--
-- WHY THIS EXISTS
-- Hook Lab writes from eight archetypes baked into its prompt. They are
-- decent and they are the same eight for everybody, which means the app
-- cannot get better at the specific thing he is trying to learn.
--
-- He studies particular creators and wants what he notices to change
-- what the app writes. That only works if the noticing is stored: a
-- pattern spotted on a Tuesday and not written down is gone by Friday.
--
-- WHAT A PATTERN IS
-- name        what he calls it, short enough to pick from a list
-- source      who he saw it in, so a pattern that stops working can be
--             traced back rather than argued about
-- what_it_does  the mechanism, in his words. This is what the model is
--             actually told, so it matters more than the name.
-- example     one line showing the shape. A pattern with no example
--             gets interpreted as whatever the model already wanted
--             to write, which is how it has no effect.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No "borrowed from" field pointing at a URL. The pattern is the thing
-- worth keeping, not the post it came from, and a table full of dead
-- links to other people's reels ages badly.
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists hook_patterns (
  id            bigint generated always as identity primary key,
  account_id    bigint not null references accounts (id) on delete cascade,

  name          text not null,
  source        text,
  what_it_does  text not null,
  example       text,

  -- Off rather than deleted, so a pattern he is unsure about can be
  -- parked without losing what he wrote about it.
  active        boolean not null default true,

  created_at    timestamptz not null default now(),

  constraint hook_patterns_name_not_blank check (length(trim(name)) > 0),
  constraint hook_patterns_what_not_blank check (length(trim(what_it_does)) > 0)
);

create index if not exists hook_patterns_account_idx
  on hook_patterns (account_id, active, created_at desc);

alter table hook_patterns enable row level security;
alter table hook_patterns force row level security;
drop policy if exists account_isolation on hook_patterns;
create policy account_isolation on hook_patterns
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on hook_patterns to app_user;
    grant usage, select on sequence hook_patterns_id_seq to app_user;
  end if;
end
$$;

commit;
