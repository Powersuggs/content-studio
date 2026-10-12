-- Content Studio: make account ownership mandatory.
--
-- 0009 added a nullable account_id to every table and backfilled it to the
-- owner, deliberately, so the app could keep running unchanged while the code
-- caught up. The code has now caught up: every query is scoped and every write
-- supplies an account. This closes the door behind it.
--
-- After this, the database itself refuses a row that belongs to nobody, so a
-- future bug produces a loud error instead of an invisible orphan that no
-- account can see and no query filters out.
--
-- Run this AFTER deploying the scoping change, not before: the old code wrote
-- rows without an account_id and would start failing the moment this applies.

begin;

-- Defensive re-backfill. 0009 already did this, but rows could have been
-- created in between by code that predates the scoping work. Anything still
-- unowned belongs to the owner, which is who created it.
update posts         set account_id = 1 where account_id is null;
update insights      set account_id = 1 where account_id is null;
update remakes       set account_id = 1 where account_id is null;
update scripts       set account_id = 1 where account_id is null;
update boards        set account_id = 1 where account_id is null;
update board_posts   set account_id = 1 where account_id is null;
update profile       set account_id = 1 where account_id is null;
update auth          set account_id = 1 where account_id is null;
update lending_facts set account_id = 1 where account_id is null;

alter table posts         alter column account_id set not null;
alter table insights      alter column account_id set not null;
alter table remakes       alter column account_id set not null;
alter table scripts       alter column account_id set not null;
alter table boards        alter column account_id set not null;
alter table board_posts   alter column account_id set not null;
alter table profile       alter column account_id set not null;
alter table auth          alter column account_id set not null;
alter table lending_facts alter column account_id set not null;

-- A board and the posts pinned to it must belong to the same account.
-- Without this, a bug could pin your post onto someone else's board and the
-- join table would happily store it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boards_id_account_key') then
    alter table boards add constraint boards_id_account_key unique (id, account_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_id_account_key') then
    alter table posts add constraint posts_id_account_key unique (id, account_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'board_posts_board_same_account_fkey') then
    alter table board_posts
      add constraint board_posts_board_same_account_fkey
      foreign key (board_id, account_id) references boards (id, account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'board_posts_post_same_account_fkey') then
    alter table board_posts
      add constraint board_posts_post_same_account_fkey
      foreign key (post_id, account_id) references posts (id, account_id) on delete cascade;
  end if;
end $$;

-- Same reasoning for the other tables that reference a post: an insight,
-- script or remake must belong to the same account as the post it describes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'insights_post_same_account_fkey') then
    alter table insights
      add constraint insights_post_same_account_fkey
      foreign key (post_id, account_id) references posts (id, account_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scripts_post_same_account_fkey') then
    alter table scripts
      add constraint scripts_post_same_account_fkey
      foreign key (post_id, account_id) references posts (id, account_id) on delete set null;
  end if;
end $$;

commit;
