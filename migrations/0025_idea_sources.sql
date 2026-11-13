-- Content Studio: let the idea sources the app actually writes be stored.
--
-- WHAT WAS WRONG
-- 0016 created `ideas` with a check constraint listing five allowed
-- sources: capture, interview, news, post, import. The app writes two
-- values that are not on that list.
--
-- One of them, 'suggested', has been written since the Suggest Ideas
-- button existed. Keeping a suggested idea failed on the insert every
-- time, with a raw constraint error. It was never caught because nothing
-- exercised that path end to end and the error looks like a server
-- hiccup rather than a missing value.
--
-- The other, 'talk', is new: an idea captured by talking it through.
--
-- WHY THE CONSTRAINT STAYS
-- The honest alternative is to drop the check entirely, and that would
-- trade a loud failure for a silent one: a typo in a source string would
-- then be stored and show up as a nonsense word on the card forever. The
-- list is the right shape, it was simply not kept up to date. So it is
-- widened, and scripts/test-idea-sources.mjs now asserts that every
-- source the code can write is on it, which is what stops this
-- recurring.
--
-- Idempotent: running it twice is harmless.

begin;

alter table ideas drop constraint if exists ideas_source_check;

alter table ideas add constraint ideas_source_check
  check (source in (
    'capture',    -- he typed or spoke one line into the capture box
    'talk',       -- he talked the whole thing through; the transcript is kept
    'interview',  -- it came out of the voice interview
    'suggested',  -- the app proposed it from his own posts and he kept it
    'news',       -- a reaction to something that happened
    'post',       -- derived from one of his existing posts
    'import'      -- brought in from somewhere else
  ));

commit;
