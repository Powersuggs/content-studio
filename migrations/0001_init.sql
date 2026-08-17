-- Content Studio: initial schema
-- All tables get row-level security enabled with NO policies defined.
-- This is intentional default-deny: the app is single-tenant behind a
-- password gate at the middleware layer, not per-row auth. Any direct
-- DB access (other roles, leaked creds, etc.) sees zero rows by default.

begin;

-- ---------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------
create table if not exists posts (
  id                 bigint generated always as identity primary key,
  platform           text not null,
  external_id        text not null,
  url                text,
  thumb_url          text,
  caption            text,
  script             text,
  posted_at          date,
  views              bigint not null default 0,
  likes              bigint not null default 0,
  comments           bigint not null default 0,
  shares             bigint not null default 0,
  saves              bigint not null default 0,
  reach              bigint not null default 0,
  duration_s         double precision,
  avg_watch_s        double precision,
  total_watch_s      double precision,
  handle             text,
  review             text,
  verdict             text,
  created_at         timestamptz not null default now(),
  unique (platform, external_id)
);

create index if not exists posts_handle_idx on posts (handle);
create index if not exists posts_views_desc_idx on posts (views desc);
create index if not exists posts_posted_at_desc_idx on posts (posted_at desc);

alter table posts enable row level security;

-- ---------------------------------------------------------------------
-- insights (AI post-mortems / cross-library pattern analysis output)
-- ---------------------------------------------------------------------
create table if not exists insights (
  id           bigint generated always as identity primary key,
  post_id      bigint references posts (id) on delete cascade,
  kind         text not null,
  content      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists insights_post_id_idx on insights (post_id);

alter table insights enable row level security;

-- ---------------------------------------------------------------------
-- remakes (ideas/drafts spun off an existing post)
-- ---------------------------------------------------------------------
create table if not exists remakes (
  id                bigint generated always as identity primary key,
  source_post_id    bigint references posts (id) on delete set null,
  title             text,
  content           text,
  status            text,
  created_at        timestamptz not null default now()
);

create index if not exists remakes_source_post_id_idx on remakes (source_post_id);

alter table remakes enable row level security;

-- ---------------------------------------------------------------------
-- scripts (script writer / hook generator output)
-- ---------------------------------------------------------------------
create table if not exists scripts (
  id           bigint generated always as identity primary key,
  post_id      bigint references posts (id) on delete set null,
  title        text,
  hook         text,
  body         text,
  status       text,
  created_at   timestamptz not null default now()
);

create index if not exists scripts_post_id_idx on scripts (post_id);

alter table scripts enable row level security;

-- ---------------------------------------------------------------------
-- boards + board_posts (collections of posts, e.g. for comparison)
-- ---------------------------------------------------------------------
create table if not exists boards (
  id           bigint generated always as identity primary key,
  name         text not null,
  description  text,
  created_at   timestamptz not null default now()
);

alter table boards enable row level security;

create table if not exists board_posts (
  board_id     bigint not null references boards (id) on delete cascade,
  post_id      bigint not null references posts (id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (board_id, post_id)
);

create index if not exists board_posts_post_id_idx on board_posts (post_id);

alter table board_posts enable row level security;

-- ---------------------------------------------------------------------
-- profile (single row: your own account context, e.g. IG handle/tz)
-- ---------------------------------------------------------------------
create table if not exists profile (
  id            integer primary key default 1,
  handle        text,
  timezone      text,
  display_name  text,
  updated_at    timestamptz not null default now(),
  constraint profile_singleton check (id = 1)
);

alter table profile enable row level security;

-- ---------------------------------------------------------------------
-- auth (single row: password hash / session config for the app gate)
-- ---------------------------------------------------------------------
create table if not exists auth (
  id              integer primary key default 1,
  password_hash   text,
  updated_at      timestamptz not null default now(),
  constraint auth_singleton check (id = 1)
);

alter table auth enable row level security;

commit;
