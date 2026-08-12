-- Spusť v Supabase SQL Editoru (Dashboard → SQL → New query)

create table if not exists user_data (
  user_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_data_updated_at_idx on user_data (updated_at desc);

alter table user_data enable row level security;

-- Přístup pouze přes service role key na serveru (Next.js API routes).
-- Klient nikdy nedostává service role klíč.
