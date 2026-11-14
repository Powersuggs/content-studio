-- Content Studio: say what each studied pattern is FOR.
--
-- WHY
-- 0027 gave every pattern one destination: Hook Lab, which writes the
-- spoken opening line. The moment he writes down something he noticed
-- about thumbnails or titles, that advice gets handed to the model
-- every time it writes a spoken hook, where it does not apply and can
-- only make the hook worse.
--
-- Nothing would error. The library would just quietly fill with mixed
-- advice and degrade the thing it exists to improve, which is the worst
-- kind of failure because the feature still looks like it is working.
--
-- THE VALUES
-- hook       the spoken first line. What Hook Lab writes today.
-- title      a video or post title, read rather than heard.
-- thumbnail  the words burned onto the cover image.
-- caption    the written post body.
--
-- Everything already stored is a spoken-hook pattern, so that is the
-- default and the backfill.
--
-- Idempotent: running it twice is harmless.

begin;

alter table hook_patterns
  add column if not exists applies_to text not null default 'hook';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hook_patterns_applies_to_check'
  ) then
    alter table hook_patterns
      add constraint hook_patterns_applies_to_check
      check (applies_to in ('hook', 'title', 'thumbnail', 'caption'));
  end if;
end
$$;

-- The unique index was on name alone. Two patterns can reasonably share
-- a name when they apply to different places: "away from pain" is a
-- real thing to do in both a spoken hook and a thumbnail, and they are
-- not the same note.
drop index if exists hook_patterns_account_name_idx;
create unique index if not exists hook_patterns_account_where_name_idx
  on hook_patterns (account_id, applies_to, lower(name));

create index if not exists hook_patterns_applies_idx
  on hook_patterns (account_id, applies_to, active);

commit;
