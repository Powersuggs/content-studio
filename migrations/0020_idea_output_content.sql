-- Content Studio: an idea's outputs hold the draft, not just a tick.
--
-- WHY THIS EXISTS
-- The format chips on an idea were a tracker: ticking Carousel recorded
-- that a carousel had been made somewhere else. The obvious expectation,
-- and the one people actually have when they click it, is that the app
-- writes the carousel. So the row that records "this format was made"
-- becomes the row that holds what was made.
--
-- content is JSON in a text column rather than jsonb, matching how
-- subject_alts is stored on newsletters. Nothing queries inside it; it is
-- read whole, rendered, and copied out.
--
-- Two formats already have a proper home elsewhere and keep it: an email
-- becomes a real newsletter so it appears on the Newsletter page, and a
-- reel or short becomes a real script so it reaches Session Mode. Those
-- rows point at them rather than duplicating the text.
--
-- Idempotent: running it twice is harmless.

begin;

alter table idea_outputs add column if not exists content text;
alter table idea_outputs add column if not exists generated_at timestamptz;
alter table idea_outputs
  add column if not exists newsletter_id bigint references newsletters (id) on delete set null;

create index if not exists idea_outputs_newsletter_id_idx
  on idea_outputs (newsletter_id);

commit;
