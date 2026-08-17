-- Adds the fields the profile header needs beyond the original singleton
-- shape: a bio and a manually-tracked follower count (Instagram's Graph
-- API does not expose historical follower counts on-demand, so this is
-- kept as an editable field on the profile row itself).

begin;

alter table profile add column if not exists bio text;
alter table profile add column if not exists followers_count bigint not null default 0;

commit;
