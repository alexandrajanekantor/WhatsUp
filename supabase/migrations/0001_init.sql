-- WhatsUp initial schema. RLS intentionally deferred; API routes scope by user id.
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  home_location text,
  default_radius_km int default 40,
  default_vibes text[] default '{}',
  created_at timestamptz default now()
);

create table searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  location_text text not null,
  lat double precision, lng double precision,
  radius_km int,
  start_date date, end_date date,
  filters jsonb default '{}',
  created_at timestamptz default now()
);

create table events (
  id text primary key, -- source:source_id
  source text not null,
  source_id text not null,
  title text not null,
  description text,
  start_at timestamptz, end_at timestamptz,
  venue text, address text,
  lat double precision, lng double precision,
  price_min numeric, price_max numeric,
  vibes text[] default '{}',
  image_url text,
  source_url text not null,
  fetched_at timestamptz default now(),
  unique (source, source_id)
);

create table favorites (
  user_id uuid not null references auth.users on delete cascade,
  event_id text not null references events(id) on delete cascade,
  note text,
  created_at timestamptz default now(),
  primary key (user_id, event_id)
);
