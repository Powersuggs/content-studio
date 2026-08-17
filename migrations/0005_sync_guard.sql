-- A simple DB-backed lock for the sync job. Two triggers can fire it
-- (the nightly cron and the manual "Sync now" button); this makes sure
-- only one actually runs at a time, and that a crashed run doesn't
-- leave the lock stuck forever (sync_started_at lets us treat a
-- too-old "running" row as abandoned rather than truly in progress).

begin;

alter table profile add column if not exists sync_status text not null default 'idle';
alter table profile add column if not exists sync_started_at timestamptz;

commit;
