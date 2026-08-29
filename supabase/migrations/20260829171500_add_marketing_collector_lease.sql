-- 중복 Edge 실행이 Cafe24 갱신 토큰을 동시에 회전시키거나 네이버 API를
-- 중복 호출하지 않도록 날짜별 단일 실행 임대를 둔다.
create table if not exists public.marketing_collector_leases (
    lease_key text primary key
        check (lease_key ~ '^[a-z0-9:_-]{3,120}$'),
    owner_token uuid not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.marketing_collector_leases enable row level security;
revoke all on table public.marketing_collector_leases from public, anon, authenticated;

create or replace function public.claim_marketing_collector_lease(
    p_lease_key text,
    p_owner_token uuid,
    p_ttl_seconds integer default 1200
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    acquired boolean;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;
    if p_lease_key !~ '^[a-z0-9:_-]{3,120}$'
       or p_ttl_seconds < 60
       or p_ttl_seconds > 1800 then
        raise exception 'invalid collector lease';
    end if;

    insert into public.marketing_collector_leases (
        lease_key,
        owner_token,
        expires_at
    )
    values (
        p_lease_key,
        p_owner_token,
        now() + make_interval(secs => p_ttl_seconds)
    )
    on conflict (lease_key) do update
    set
        owner_token = excluded.owner_token,
        expires_at = excluded.expires_at,
        updated_at = now()
    where marketing_collector_leases.expires_at <= now()
       or marketing_collector_leases.owner_token = excluded.owner_token
    returning true into acquired;

    return coalesce(acquired, false);
end;
$$;

create or replace function public.release_marketing_collector_lease(
    p_lease_key text,
    p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    released boolean;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;

    delete from public.marketing_collector_leases
    where lease_key = p_lease_key
      and owner_token = p_owner_token
    returning true into released;

    return coalesce(released, false);
end;
$$;

revoke all on function public.claim_marketing_collector_lease(text, uuid, integer)
from public, anon, authenticated;
revoke all on function public.release_marketing_collector_lease(text, uuid)
from public, anon, authenticated;
grant execute on function public.claim_marketing_collector_lease(text, uuid, integer)
to service_role;
grant execute on function public.release_marketing_collector_lease(text, uuid)
to service_role;
