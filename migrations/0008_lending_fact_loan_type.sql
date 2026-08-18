-- Lets each fact be tagged with which loan program it applies to
-- (Conventional, FHA, VA, USDA, Jumbo, etc.) so the Sources & Facts
-- library can be organized/grouped by loan type instead of one flat
-- list, and so it's obvious at a glance which loan types still have
-- no verified facts entered.

begin;

alter table lending_facts add column if not exists loan_type text;
create index if not exists lending_facts_loan_type_idx on lending_facts (loan_type);

commit;
