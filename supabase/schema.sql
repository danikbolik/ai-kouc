-- Spusť v Supabase SQL Editoru (Dashboard → SQL → New query)

create table if not exists user_data (
  user_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Propojení napříč zařízeními přes Strava athlete ID
alter table user_data add column if not exists strava_athlete_id bigint unique;

create index if not exists user_data_updated_at_idx on user_data (updated_at desc);
create index if not exists user_data_strava_athlete_id_idx on user_data (strava_athlete_id);

alter table user_data enable row level security;

-- payload JSONB obsahuje synchronizovaná data:
--   userMetrics      → Osobní parametry (HRmax, prahy, zóny, závod)
--   coachNotes       → Paměť trenéra
--   uploadedMethodology → Metodika & Podklady
--   days             → Tréninkový kalendář
--   apiKeys          → OpenAI klíč (volitelně)
--   stravaTokens     → Strava OAuth tokeny + athleteId
--
-- Přístup pouze přes service role key na serveru (Next.js API routes).
-- Klient nikdy nedostává service role klíč.
