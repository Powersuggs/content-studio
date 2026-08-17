-- Pattern-analysis insights (the dashboard's AI insight cards) summarize
-- across many posts at once, so they can't rely on a single post_id join
-- to know whose data they belong to. Store handle directly so the same
-- "never let reference posts contaminate my data" rule applies here too.

begin;

alter table insights add column if not exists handle text;
create index if not exists insights_handle_idx on insights (handle);

commit;
