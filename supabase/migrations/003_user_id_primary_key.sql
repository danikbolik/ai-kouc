-- Oprava chyby 42P10: UPSERT vyžaduje UNIQUE / PRIMARY KEY na user_id
-- Spusť v Supabase SQL Editoru

alter table user_data add column if not exists user_id text;
alter table user_data add column if not exists payload jsonb not null default '{}'::jsonb;
alter table user_data add column if not exists updated_at timestamptz not null default now();

-- cloud_id → user_id (pokud tabulka používá cloud_id)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_data' and column_name = 'cloud_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_data' and column_name = 'user_id'
  ) then
    alter table user_data rename column cloud_id to user_id;
  end if;
end $$;

-- UNIQUE constraint pro UPSERT (pokud chybí PK)
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'user_data'
      and c.contype in ('p', 'u')
      and pg_get_constraintdef(c.oid) like '%user_id%'
  ) then
    alter table user_data add constraint user_data_user_id_key unique (user_id);
  end if;
exception
  when others then
    raise notice 'UNIQUE user_id – možná duplicitní řádky nebo null: %', sqlerrm;
end $$;

-- Preferované: PRIMARY KEY (pokud tabulka nemá žádný PK)
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'user_data' and c.contype = 'p'
  ) then
    alter table user_data add primary key (user_id);
  end if;
exception
  when others then
    raise notice 'PRIMARY KEY user_id – viz UNIQUE constraint výše: %', sqlerrm;
end $$;

drop policy if exists "service_role_full_access" on user_data;
create policy "service_role_full_access"
  on user_data for all to service_role using (true) with check (true);
