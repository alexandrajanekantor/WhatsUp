-- Home page: geocoded home city + cached per-user feed of upcoming events.
alter table profiles add column if not exists home_lat double precision;
alter table profiles add column if not exists home_lng double precision;

create table if not exists home_feed (
  user_id uuid primary key references auth.users on delete cascade,
  events jsonb not null default '[]',
  settings_key text not null,
  generated_at timestamptz not null default now()
);

create index if not exists searches_user_created_idx on searches (user_id, created_at desc);
create index if not exists favorites_user_created_idx on favorites (user_id, created_at desc);

alter table events add column if not exists listing_page boolean default false;
