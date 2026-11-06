-- Content Studio: the game plan.
--
-- WHY THIS EXISTS
-- The dashboard is full of numbers and none of them mean anything on their
-- own. 403 followers is good or bad depending entirely on what was being
-- aimed at, and "5 posts this week" only matters next to the number that
-- was supposed to happen. Without a target the dashboard reports; with one
-- it can say "behind", which is the only version that changes behaviour.
--
-- One row per account. Goals are a small, singular thing and giving them
-- history would mean every read needs an "as of when" and every write
-- needs to decide whether it supersedes. Not worth it to answer "am I on
-- track today".
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists game_plan (
  account_id          bigint primary key references accounts (id) on delete cascade,

  -- How many posts a week is the commitment. Null means not set, which is
  -- different from zero: zero is a stated intention to post nothing.
  posts_per_week      integer,

  -- Where the follower count is heading, and by when. Both or neither:
  -- a target with no date cannot produce a pace, and a date with no target
  -- is a deadline for nothing.
  follower_goal       integer,
  follower_goal_date  date,

  -- What the follower count was when the goal was set, so progress is
  -- measured from the starting line rather than from zero. Without it, a
  -- goal of 500 set at 400 would read as 80% done on the day it was made.
  follower_baseline   integer,
  goal_set_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint game_plan_posts_sane check (posts_per_week is null or (posts_per_week >= 0 and posts_per_week <= 100)),
  constraint game_plan_goal_sane  check (follower_goal is null or follower_goal >= 0),
  constraint game_plan_goal_pairs check (
    (follower_goal is null and follower_goal_date is null)
    or (follower_goal is not null and follower_goal_date is not null)
  )
);

alter table game_plan enable row level security;
alter table game_plan force row level security;
drop policy if exists account_isolation on game_plan;
create policy account_isolation on game_plan
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on game_plan to app_user;
  end if;
end
$$;

commit;
