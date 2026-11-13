-- Content Studio: people worth reaching out to.
--
-- WHY THIS EXISTS
-- Aaron is on Instagram to recruit agents. Every time he saves someone's
-- post to a board, reverse-engineers one on the Inspiration page, or
-- tears a profile apart, he is looking at a real person who is already
-- doing the thing he wants them doing on his team. Those handles were
-- scattered across three features and nowhere was there a list saying
-- "these are the people, here is who you have spoken to".
--
-- So this is that list. Nothing here is scraped or bought: every row
-- comes from an account he has already chosen to look at.
--
-- WHY A TABLE RATHER THAN A QUERY OVER posts
-- The handles can be found by querying, and that is how a row first
-- appears. What cannot be found by querying is what he has DONE about
-- them: who he messaged, who replied, who was not a fit. That state is
-- the whole point of the page and it has to live somewhere.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No names, emails or phone numbers. A public handle and his own notes,
-- which is what he has a right to and what he actually needs. People who
-- liked or commented on his posts would be the richer source and need
-- Meta's approval first; when that lands it adds rows here and changes
-- nothing else.
--
-- Idempotent: running it twice is harmless.

begin;

create table if not exists leads (
  id            bigint generated always as identity primary key,
  account_id    bigint not null references accounts (id) on delete cascade,

  -- The public handle, without a leading "@". Stored lower case so the
  -- same person found twice under different capitalisation is one row.
  handle        text not null,
  platform      text not null default 'instagram',

  -- How this person turned up: 'reference' from the Inspiration page,
  -- 'board' from a saved board, 'teardown' from a profile breakdown, or
  -- 'manual' when he added them himself.
  source        text not null default 'manual',

  -- Where he is with them.
  status        text not null default 'new',

  -- His own words. Spoken or typed.
  note          text,

  first_seen    timestamptz not null default now(),
  last_touched  timestamptz,
  created_at    timestamptz not null default now(),

  constraint leads_status_check check (
    status in ('new', 'to contact', 'contacted', 'replied', 'not a fit')
  ),
  constraint leads_handle_check check (handle <> '' and handle = lower(handle))
);

-- One row per person. The find step relies on this to stay quiet when it
-- runs again over handles it has already seen.
create unique index if not exists leads_account_handle_idx
  on leads (account_id, platform, handle);
create index if not exists leads_account_status_idx
  on leads (account_id, status);

alter table leads enable row level security;
alter table leads force row level security;
drop policy if exists account_isolation on leads;
create policy account_isolation on leads
  using (account_id = app_current_account())
  with check (account_id = app_current_account());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    grant select, insert, update, delete on leads to app_user;
    grant usage, select on sequence leads_id_seq to app_user;
  end if;
end
$$;

commit;
