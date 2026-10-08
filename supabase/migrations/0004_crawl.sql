-- Crawled events: cities we cover, the calendar sources we discovered per city, and crawl bookkeeping on events.
create table if not exists crawl_cities (
  city_key text primary key,              -- slug of the geocoded city, e.g. "portland-oregon-united-states"
  display_name text not null,
  lat double precision not null,
  lng double precision not null,
  timezone text not null,
  last_crawled_at timestamptz,
  last_discovered_at timestamptz
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  city_key text not null references crawl_cities on delete cascade,
  name text,
  url text not null,
  kind text,                              -- jsonld | ics | tribe | localist | mixed
  status text not null default 'candidate', -- candidate | active | failing | rejected
  discovered_by text not null default 'seed', -- seed | ai
  last_fetched_at timestamptz,
  last_event_count int default 0,
  fail_count int default 0,
  created_at timestamptz default now(),
  unique (city_key, url)
);

alter table events add column if not exists city_key text;
alter table events add column if not exists crawl_source_id uuid references sources(id) on delete set null;
alter table events add column if not exists vibes_tagged boolean default false;
alter table events add column if not exists tagged_by text;
create index if not exists events_city_start_idx on events (city_key, start_at);
