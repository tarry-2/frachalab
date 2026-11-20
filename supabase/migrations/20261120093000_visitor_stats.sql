begin;

create schema sanga_analytics;
revoke all on schema sanga_analytics from public, anon, authenticated;

create table sanga_analytics.config (
  singleton boolean primary key check (singleton),
  secret_hash bytea not null
);
create table sanga_analytics.sessions (
  id uuid primary key,
  last_seen timestamptz not null
);
create index sanga_sessions_last_seen on sanga_analytics.sessions (last_seen);
create table sanga_analytics.daily (
  day date primary key,
  visits bigint not null
);

alter table sanga_analytics.config enable row level security;
alter table sanga_analytics.sessions enable row level security;
alter table sanga_analytics.daily enable row level security;

create function public.sanga_record_visit(p_session uuid, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  seen timestamptz := statement_timestamp();
  local_day date := (seen at time zone 'Asia/Seoul')::date;
  inserted boolean;
begin
  if p_session is null or not exists (
    select 1 from sanga_analytics.config
    where singleton and secret_hash = pg_catalog.sha256(pg_catalog.convert_to(p_secret, 'UTF8'))
  ) then
    raise insufficient_privilege using message = 'invalid visitor statistics credentials';
  end if;

  insert into sanga_analytics.sessions (id, last_seen)
  values (p_session, seen)
  on conflict (id) do nothing;
  inserted := found;

  if inserted then
    insert into sanga_analytics.daily (day, visits)
    values (local_day, 1)
    on conflict (day) do update set visits = sanga_analytics.daily.visits + 1;
  else
    update sanga_analytics.sessions
    set last_seen = seen
    where id = p_session and last_seen < seen - interval '20 seconds';
  end if;

  return jsonb_build_object(
    'active', (select count(*) from sanga_analytics.sessions where last_seen >= seen - interval '5 minutes'),
    'today', coalesce((select visits from sanga_analytics.daily where day = local_day), 0),
    'total', coalesce((select sum(visits) from sanga_analytics.daily), 0)
  );
end;
$$;

revoke all on function public.sanga_record_visit(uuid, text) from public, anon, authenticated;
grant execute on function public.sanga_record_visit(uuid, text) to anon;

-- 운영 초기 설정에서 Vercel 전용 비밀키의 SHA-256 해시를
-- sanga_analytics.config의 singleton=true 행에 등록한다.
commit;
