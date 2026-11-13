-- Content Studio: writing a book, a chapter at a time.
--
-- WHY THIS EXISTS
-- He wants to write a book, and the reason to write it inside this app
-- rather than in a document is that this app already knows how he sounds
-- and what he actually knows. The voice profile, his own posts, the facts
-- he has verified, the takes he has talked through: a chapter drafted
-- from those is his chapter. A chapter drafted in a blank document by a
-- general model is nobody's.
--
-- TWO TABLES, NOT ONE
-- A book is a thing with a premise and a reader. A chapter is a thing
-- with a position and a draft. Keeping them apart is what lets the
-- outline be rearranged without touching any prose, which is most of
-- what writing a book actually is.
--
-- WHAT A CHAPTER HOLDS
-- summary   what the chapter is supposed to do, written before the prose.
--           This is the part that gets rewritten most and it is cheap.
-- body      the draft itself. Markdown, because it has to survive being
--           exported to a document and back without carrying styling
--           nobody asked for.
-- status    where it is: outlined, drafted, or done. Three states, not
--           seven. More states than a person can hold in their head make
--           a list of chapters harder to read, not easier.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No versions table. Keeping every draft of every chapter sounds prudent
-- and means the page has to ask which one he meant, forever. Rewriting a
-- chapter replaces it, the same way it does in a document.
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists books (
  id            bigint generated always as identity primary key,
  account_id    bigint not null references accounts (id) on delete cascade,

  title         text not null,
  subtitle      text,

  -- What the book argues, in his words. This is what every chapter is
  -- drafted against, so it is the one field worth insisting on.
  premise       text,

  -- Who it is for. A book for agents thinking about leaving their
  -- brokerage is a different book from one for buyers, and the drafting
  -- is useless without knowing which.
  audience      text,

  status        text not null default 'outlining',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint books_title_not_blank check (length(trim(title)) > 0),
  constraint books_status_check check (status in ('outlining', 'writing', 'done'))
);

create table if not exists book_chapters (
  id            bigint generated always as identity primary key,
  account_id    bigint not null references accounts (id) on delete cascade,
  book_id       bigint not null references books (id) on delete cascade,

  -- Order in the book. Gaps are fine and expected: moving a chapter
  -- renumbers the pair it swapped with and nothing else.
  position      int not null,

  title         text not null,
  summary       text,
  body          text,

  status        text not null default 'outlined',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint chapters_title_not_blank check (length(trim(title)) > 0),
  constraint chapters_status_check check (status in ('outlined', 'drafted', 'done'))
);

create index if not exists books_account_idx on books (account_id, updated_at desc);
create index if not exists chapters_book_idx on book_chapters (book_id, position);

-- One chapter per position per book. Two tabs open on the same outline is
-- all it takes to put two chapters at number four, and the database is the
-- only place that can refuse it.
create unique index if not exists chapters_book_position_idx
  on book_chapters (book_id, position);

alter table books enable row level security;
alter table books force row level security;
drop policy if exists account_isolation on books;
create policy account_isolation on books
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

alter table book_chapters enable row level security;
alter table book_chapters force row level security;
drop policy if exists account_isolation on book_chapters;
create policy account_isolation on book_chapters
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on books, book_chapters to app_user;
    grant usage, select on sequence books_id_seq to app_user;
    grant usage, select on sequence book_chapters_id_seq to app_user;
  end if;
end
$$;

commit;
