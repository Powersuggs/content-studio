-- Content pillars: a free-text label the creator assigns to their own
-- posts (e.g. "VA Loans", "Client Story", "Motivation") so performance
-- can be compared by content category, not just post-by-post. Left as
-- free text (not a fixed enum) since pillars are creator-specific and
-- the app has no way to know them in advance.

begin;

alter table posts add column if not exists pillar text;
create index if not exists posts_pillar_idx on posts (pillar);

commit;
