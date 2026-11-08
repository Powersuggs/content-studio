-- Content Studio: when a finished draft is going out.
--
-- WHY THIS EXISTS
-- The app can write a week's content in an afternoon and had nothing to
-- say about when any of it should go out. Deciding that every morning,
-- in front of a list of finished drafts, is the step where posting
-- actually stalls.
--
-- Three columns on the draft rather than a table of its own. What is
-- being scheduled IS the draft: this idea, in this format. A separate
-- table would need its own key back to exactly that pair, and would make
-- it possible for a draft to be scheduled twice, which is not a state
-- that should be able to exist.
--
-- scheduled_for   the day, as a plain date. No time: the slot carries
--                 that, and a timestamp would invite a timezone bug on
--                 every read for no gain.
-- scheduled_slot  'midday' or 'evening', his two posting windows.
-- posted_at       when he ticked it off. Also what takes it out of the
--                 queue, so a posted draft stops being a thing to do
--                 without being deleted.
--
-- Idempotent: running it twice is harmless.

begin;

alter table idea_outputs add column if not exists scheduled_for date;
alter table idea_outputs add column if not exists scheduled_slot text;
alter table idea_outputs add column if not exists posted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'idea_outputs_slot_check'
  ) then
    alter table idea_outputs
      add constraint idea_outputs_slot_check
      check (scheduled_slot is null or scheduled_slot in ('midday', 'evening'));
  end if;
end
$$;

-- A day cannot hold the same slot twice. Enforced here rather than in the
-- app, because two tabs open on the same morning is all it takes to book
-- one slot twice and the database is the only place that can refuse it.
create unique index if not exists idea_outputs_one_per_slot
  on idea_outputs (account_id, scheduled_for, scheduled_slot)
  where scheduled_for is not null and posted_at is null;

-- The queue reads "what is scheduled and not yet posted", in date order.
create index if not exists idea_outputs_schedule_idx
  on idea_outputs (account_id, scheduled_for)
  where scheduled_for is not null and posted_at is null;

commit;
