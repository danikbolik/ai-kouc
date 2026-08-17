-- Prázdná tabulka user_data je OK – tento skript jen připraví správné sloupce.
-- Data se vytvoří automaticky z aplikace (tlačítko „Odeslat data do cloudu" na PC).

alter table user_data add column if not exists user_id text;
alter table user_data add column if not exists payload jsonb not null default '{}'::jsonb;
alter table user_data add column if not exists updated_at timestamptz not null default now();
alter table user_data add column if not exists strava_athlete_id bigint;

-- Primary key (pokud tabulka nemá PK)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'user_data'::regclass and contype = 'p'
  ) then
    alter table user_data add primary key (user_id);
  end if;
exception
  when others then
    raise notice 'PK user_id – možná už existuje nebo sloupec chybí: %', sqlerrm;
end $$;

drop policy if exists "service_role_full_access" on user_data;
create policy "service_role_full_access"
  on user_data for all to service_role using (true) with check (true);
