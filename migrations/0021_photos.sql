-- Content Studio: a bank of photos to build slides from.
--
-- WHY THIS EXISTS
-- The slide renderer can put an image behind the text, and there was
-- nowhere to keep images. Generating them costs money per picture and
-- comes out looking like AI; real photographs do not. So the bank holds
-- what the person already has: their own shots, and anything they pick up
-- from a free stock site or make elsewhere.
--
-- WHY THE BYTES LIVE IN POSTGRES
-- The obvious answer is object storage, and it would mean a second
-- service, a bucket, two more environment variables and a client library,
-- all to hold a few dozen photographs. Here the bytes ride on the database
-- that already exists, already has row level security, and already backs
-- itself up. Account isolation comes free rather than being configured
-- twice and getting it wrong once.
--
-- The trade is database size. Uploads are downscaled in the browser before
-- they are sent, so a photo lands at a few hundred kilobytes rather than
-- the several megabytes a phone produces. A hundred photos is well inside
-- the free tier. If this ever outgrows that, moving to object storage
-- changes this table and nothing else, because everything reads photos
-- through one route.
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists photos (
  id          bigint generated always as identity primary key,
  account_id  bigint not null references accounts (id) on delete cascade,

  -- What it is, in the person's own words. Used for picking, and shown
  -- under the thumbnail.
  label       text,

  -- Free text, comma separated. Deliberately not a tag table: a tag table
  -- is three joins and a management screen to solve a problem nobody has
  -- at this size.
  tags        text,

  -- image/jpeg or image/png. Stored rather than assumed so the serving
  -- route can set the right header.
  mime        text not null,
  bytes       bytea not null,
  byte_size   integer not null,
  width       integer,
  height      integer,

  -- Where it came from, so a licence question can be answered later:
  -- 'upload' for their own, or the name of the site it was taken from.
  source      text,

  created_at  timestamptz not null default now(),

  constraint photos_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint photos_size_check check (byte_size > 0 and byte_size <= 6 * 1024 * 1024)
);

create index if not exists photos_account_id_idx on photos (account_id);
create index if not exists photos_account_recent_idx on photos (account_id, created_at desc);

alter table photos enable row level security;
alter table photos force row level security;
drop policy if exists account_isolation on photos;
create policy account_isolation on photos
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on photos to app_user;
    grant usage, select on sequence photos_id_seq to app_user;
  end if;
end
$$;

commit;
