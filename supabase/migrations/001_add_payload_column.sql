-- Oprava: tabulka user_data existuje, ale chybí sloupec payload
-- Spusť v Supabase SQL Editoru

-- 1) Přidej standardní sloupce (pokud chybí)
alter table user_data add column if not exists payload jsonb not null default '{}'::jsonb;
alter table user_data add column if not exists updated_at timestamptz not null default now();
alter table user_data add column if not exists strava_athlete_id bigint;

-- 2) Migrace z legacy sloupců do payload (pokud existují)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'user_data' and column_name = 'personal_params'
  ) then
    update user_data
    set payload = payload || jsonb_strip_nulls(jsonb_build_object(
      'userMetrics', personal_params,
      'coachNotes', coalesce(coach_memory, coach_notes, '[]'::jsonb),
      'uploadedMethodology', coalesce(methodology, uploaded_methodology, '[]'::jsonb),
      'days', coalesce(days, '{}'::jsonb),
      'apiKeys', coalesce(api_keys, jsonb_build_object(
        'openaiApiKey', coalesce(openai_api_key, ''),
        'stravaClientId', '',
        'stravaClientSecret', ''
      )),
      'stravaConnected', coalesce(strava_connected, false),
      'stravaTokens', strava_tokens
    ))
    where payload = '{}'::jsonb or payload is null;
  end if;
end $$;

-- 3) cloud_id → user_id alias (pokud tabulka používá cloud_id)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'user_data' and column_name = 'cloud_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_name = 'user_data' and column_name = 'user_id'
  ) then
    alter table user_data rename column cloud_id to user_id;
  end if;
end $$;

create index if not exists user_data_updated_at_idx on user_data (updated_at desc);

drop policy if exists "service_role_full_access" on user_data;
create policy "service_role_full_access"
  on user_data for all to service_role using (true) with check (true);
