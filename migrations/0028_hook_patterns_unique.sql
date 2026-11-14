-- Content Studio: one pattern per name, and clean up any duplicates.
--
-- WHAT WENT WRONG
-- 0027 created hook_patterns with nothing stopping the same pattern
-- being added twice. Running the seed insert a second time put every
-- pattern in again, and the result reads as eight patterns when there
-- are four, with the duplicate copies silently doubling their weight in
-- the prompt.
--
-- Nothing errored, which is the problem. A seed script that is safe to
-- run twice is the normal expectation, and this one was not.
--
-- WHAT THIS DOES
-- Removes duplicates, keeping the oldest of each name, then adds the
-- index that stops it recurring. The index is on lower(name), because
-- "Away from pain" and "away from pain" are the same pattern typed
-- twice, not two patterns.
--
-- Idempotent: running it twice is harmless.

begin;

delete from hook_patterns a
 using hook_patterns b
 where a.account_id = b.account_id
   and lower(a.name) = lower(b.name)
   and a.id > b.id;

create unique index if not exists hook_patterns_account_name_idx
  on hook_patterns (account_id, lower(name));

commit;
