-- Metodické dokumenty + Storage bucket pro originální soubory
-- Spusť v Supabase → SQL Editor (jednorázově)

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

-- Bucket pro originální PDF/txt (volitelný – RAG funguje i bez něj)
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
