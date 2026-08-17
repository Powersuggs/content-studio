-- Support for the Instagram Graph API sync:
--   - auth: persist the (rotating) long-lived access token so a refresh
--     during sync survives past this process's lifetime.
--   - profile: which IG business account to sync, and when we last did.
--   - posts: when we last backfilled watch-time for a post (null = never).

begin;

alter table auth add column if not exists access_token text;
alter table auth add column if not exists token_refreshed_at timestamptz;

alter table profile add column if not exists ig_user_id text;
alter table profile add column if not exists ig_media_count bigint;
alter table profile add column if not exists last_synced_at timestamptz;

alter table posts add column if not exists watch_time_synced_at timestamptz;
create index if not exists posts_watch_time_synced_at_idx on posts (watch_time_synced_at);

commit;
