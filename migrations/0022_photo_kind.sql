-- Content Studio: what kind of photograph this is.
--
-- WHY THIS EXISTS
-- A headshot placed in the band layout, which is a wide strip across the
-- top of the slide, gets cropped to shoulders and chin. The person
-- disappears and the slide is ruined. The app had no way to know a photo
-- had a face in it, so it put one wherever the rotation landed.
--
-- 'person'  someone is the subject. Needs a layout that keeps them whole.
-- 'scene'   a place, an object, a texture. Crops to any shape safely.
--
-- Defaulting to 'scene' is the safe way round: a scene used where a
-- person was wanted is merely a dull slide, while a person cropped into
-- a letterbox is an unusable one.
--
-- Idempotent: running it twice is harmless.

begin;

alter table photos add column if not exists kind text not null default 'scene';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photos_kind_check'
  ) then
    alter table photos
      add constraint photos_kind_check check (kind in ('person', 'scene'));
  end if;
end
$$;

create index if not exists photos_account_kind_idx on photos (account_id, kind);

-- A first pass at the existing bank, so nothing has to be sorted by hand
-- from scratch. Only touches rows whose label makes it obvious; the
-- Photos page can correct anything this gets wrong, and the automatic
-- sorter looks at the actual pictures.
update photos
   set kind = 'person'
 where kind = 'scene'
   and (
     label ~* '(headshot|portrait|aaron|suit|team|agent|people|person|group)'
   );

commit;
