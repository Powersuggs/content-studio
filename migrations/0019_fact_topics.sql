-- Content Studio: facts are about topics now, not loan types.
--
-- WHY THIS EXISTS
-- The facts library was built when every piece of content was about
-- lending, so the category column was called loan_type and the whole
-- guardrail was phrased around loan programs. The content has moved to
-- recruiting agents and winning transactions, and those carry numbers
-- that need protecting just as badly: commission splits, caps, revenue
-- share, licensing hours and costs. A number stated wrong while
-- recruiting someone to spend money is not a smaller problem than a
-- number stated wrong about an FHA loan.
--
-- So the column becomes `topic` and holds whatever category the fact
-- belongs to. Existing loan facts keep their value: "VA" simply becomes
-- a topic rather than a loan type, and nothing is lost.
--
-- The TABLE keeps its old name. Renaming it would mean touching the RLS
-- policy, the grants, the migration map and four test scripts for no
-- visible gain, and the name never reaches the screen.
--
-- Idempotent: running it twice is harmless.

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_name = 'lending_facts' and column_name = 'loan_type'
  ) and not exists (
    select 1 from information_schema.columns
     where table_name = 'lending_facts' and column_name = 'topic'
  ) then
    alter table lending_facts rename column loan_type to topic;
  end if;
end
$$;

-- The old index was named for the old column. Same deal: harmless either
-- way, but a name that lies is a name that costs someone an hour later.
do $$
begin
  if exists (select 1 from pg_class where relname = 'lending_facts_loan_type_idx') then
    alter index lending_facts_loan_type_idx rename to lending_facts_topic_idx;
  end if;
end
$$;

create index if not exists lending_facts_topic_idx on lending_facts (topic);

commit;
