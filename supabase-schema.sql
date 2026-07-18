-- Jonathan Runs — Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- Supabase dashboard > SQL Editor > New Query > paste > Run

-- Settings table (stores Strava tokens, cached run data, etc.)
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Auto-update updated_at on upsert
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger settings_updated_at
  before update on settings
  for each row execute function update_updated_at();

-- Journal posts
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  body text not null,
  tag text default 'Training',
  run_miles numeric,
  run_time text,
  avg_hr integer,
  calories integer,
  published boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger posts_updated_at
  before update on posts
  for each row execute function update_updated_at();

-- Race results
create table if not exists results (
  id uuid default gen_random_uuid() primary key,
  race_name text not null,
  race_date date not null,
  location text,
  distance text default '5K',
  chip_time text not null,
  gun_time text,
  overall_place integer,
  overall_total integer,
  ag_place integer,
  ag_total integer,
  is_pr boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- Email subscribers
create table if not exists subscribers (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  subscribed_at timestamptz default now()
);

-- Seed existing race results
insert into results (race_name, race_date, location, distance, chip_time, gun_time, overall_place, overall_total, ag_place, ag_total, is_pr, notes)
values
  ('DoNot Stop 5K', '2026-01-01', 'Dallas, TX', '5K', '28:55.2', null, 37, 162, 1, 5, false, '1st place Male 30-34'),
  ('Firecracker Fast 5K', '2026-07-04', 'Little Rock, AR', '5K', '29:22.9', '29:32.8', 718, 1955, 78, 119, true, 'Garmin time 29:05. Walked half of Zoo Hill. 74F, 70% humidity.')
on conflict do nothing;

-- Seed existing journal posts
insert into posts (title, body, tag, run_miles, run_time, avg_hr, calories)
values
  (
    'Why I''m Running a Half Marathon',
    'I''ve been running casually for a while — 5Ks here and there, no real structure. Placing 1st in my age group at the DoNot Stop 5K was the moment something clicked. I wanted to see what I could do with a real plan behind me.

December 13 is the goal. 14 weeks starting September 1. Sub-2:15. I''ve never run more than 6 miles at once. I''m logging every week here — the good and the ugly.',
    'Why I Run',
    null, null, null, null
  ),
  (
    'PR''d on the 4th of July — and I walked half the hill',
    'Signed up for the Firecracker Fast 5K on a complete whim. Hadn''t been running seriously — just resting before the half marathon block starts September 1. Figured a race would be a good fitness check.

The course runs point-to-point down Kavanaugh Boulevard and sounds flat until Zoo Hill — 0.24 miles at 12:48/mi pace on GPS. I walked half of it. 74°F, 70% humidity at 7:30am. I wasn''t there to win.

Garmin said 29:05 at the finish. New all-time PR. Official chip came back 29:22.9. The 8:09 final kick after the hill told me there was more in the tank than I thought.

Going into September: I''m more fit than I realized. This block is going to be interesting.',
    'Race Day',
    3.11, '29:05', 172, 312
  );
