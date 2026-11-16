-- Content Studio: studied patterns can apply to a book title.
--
-- WHY
-- The book title suggester is built on the two Myron Golden covers that
-- could actually be confirmed, which is a thin basis for something he
-- said needs to be "spot on". He also says Myron describes the method in
-- his videos, and I cannot watch a video.
--
-- So rather than me guessing harder, this makes the suggester read from
-- the same studied-patterns library Hook Lab uses. He writes down what
-- Myron actually says once, and every title suggestion from then on is
-- written with it. That is the mechanism that already turned four hook
-- observations into something the app writes from, and it is the only
-- version of "spot on" that does not depend on my reading of two book
-- covers.
--
-- THE NEW VALUE
-- book_title   the title and subtitle of a book, which is a different
--              job from a video title. A video title competes in a feed
--              and is read in half a second. A book title has to survive
--              being said out loud by someone recommending it.
--
-- The constraint is dropped and re-added rather than guarded with "if not
-- exists", because it already exists from 0029 and a guarded add would
-- silently do nothing, leaving the new value refused by the database
-- while this file looks like it ran.
--
-- Idempotent: running it twice is harmless.

begin;

alter table hook_patterns
  drop constraint if exists hook_patterns_applies_to_check;

alter table hook_patterns
  add constraint hook_patterns_applies_to_check
  check (applies_to in ('hook', 'title', 'thumbnail', 'caption', 'book_title'));

commit;
