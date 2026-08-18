-- A real "sources & research" library: verified facts about loan
-- programs and lending rules (seller concession caps, program-specific
-- requirements, etc.), each tied to where it came from. Every AI
-- writing feature treats these as ground truth instead of generating
-- specifics from general model knowledge -- which, as observed, can
-- get details wrong in ways that matter for a licensed lender's
-- public content.
--
-- Structured as its own table (fact + source name + source URL) rather
-- than a single free-text blob, so the app has an actual "location"
-- for sources/research that can be listed, cited, and deleted
-- individually.

begin;

create table if not exists lending_facts (
  id serial primary key,
  fact text not null,
  source_name text,
  source_url text,
  created_at timestamptz not null default now()
);

commit;
