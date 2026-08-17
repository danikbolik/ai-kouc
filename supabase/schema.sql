-- Spusť v Supabase SQL Editoru (Dashboard → SQL → New query)

create table if not exists user_data (
  user_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_data add column if not exists strava_athlete_id bigint unique;

create index if not exists user_data_updated_at_idx on user_data (updated_at desc);
create index if not exists user_data_strava_athlete_id_idx on user_data (strava_athlete_id);

alter table user_data enable row level security;

drop policy if exists "service_role_full_access" on user_data;
create policy "service_role_full_access"
  on user_data
  for all
  to service_role
  using (true)
  with check (true);

-- Metodické dokumenty (parsovaný text pro RAG + metadata)
create table if not exists methodology_documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  file_name text not null,
  file_type text not null check (file_type in ('pdf', 'txt', 'md')),
  storage_path text,
  content text not null default '',
  char_count integer not null default 0,
  uploaded_at timestamptz not null default now()
);

create index if not exists methodology_documents_user_id_idx
  on methodology_documents (user_id, uploaded_at desc);

alter table methodology_documents enable row level security;

drop policy if exists "service_role_methodology_documents" on methodology_documents;
create policy "service_role_methodology_documents"
  on methodology_documents
  for all
  to service_role
  using (true)
  with check (true);

-- Supabase Storage bucket pro originální soubory (PDF/txt/md)
-- V Dashboard → Storage vytvoř bucket "methodology_docs" (private) NEBO spusť:
insert into storage.buckets (id, name, public)
values ('methodology_docs', 'methodology_docs', false)
on conflict (id) do nothing;

drop policy if exists "service_role_methodology_storage" on storage.objects;
create policy "service_role_methodology_storage"
  on storage.objects
  for all
  to service_role
  using (bucket_id = 'methodology_docs')
  with check (bucket_id = 'methodology_docs');

-- payload JSONB (user_data) obsahuje: userMetrics, coachNotes, apiKeys, days, stravaTokens
-- Metodika je v methodology_documents + Storage (ne v user_data JSONB)
