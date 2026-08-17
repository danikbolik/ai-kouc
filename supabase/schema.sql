-- Spusť v Supabase SQL Editoru (Dashboard → SQL → New query)

create table if not exists user_data (
  user_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Propojení napříč zařízeními přes Strava athlete ID (volitelné – funguje i bez sloupce přes JSONB)
alter table user_data add column if not exists strava_athlete_id bigint unique;

create index if not exists user_data_updated_at_idx on user_data (updated_at desc);
create index if not exists user_data_strava_athlete_id_idx on user_data (strava_athlete_id);

alter table user_data enable row level security;

-- payload JSONB obsahuje synchronizovaná data:
--   userMetrics         → Osobní parametry (HRmax, prahy, zóny, závod)
--   coachNotes          → Paměť trenéra
--   uploadedMethodology → Metodika & Podklady
--   apiKeys.openaiApiKey → OpenAI klíč (sync napříč zařízeními)
--   days                → Tréninkový kalendář
--   stravaTokens        → Strava OAuth tokeny + athleteId
--
-- Přístup: Next.js API routes používají SUPABASE_SERVICE_ROLE_KEY (RLS automaticky obchází).
-- Klient nikdy nedostává service role klíč – volá pouze /api/user-data.

-- Explicitní policy pro service_role (Supabase ji obchází, ale dokumentuje intent):
drop policy if exists "service_role_full_access" on user_data;
create policy "service_role_full_access"
  on user_data
  for all
  to service_role
  using (true)
  with check (true);

-- Pokud byste někdy používali anon key přímo z klienta (NEDOPORUČUJE SE):
-- drop policy if exists "anon_read_write_by_cloud_id" on user_data;
-- create policy "anon_read_write_by_cloud_id"
--   on user_data
--   for all
--   to anon, authenticated
--   using (true)
--   with check (true);
