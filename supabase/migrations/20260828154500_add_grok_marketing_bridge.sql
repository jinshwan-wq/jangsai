-- Grok Bot과 기존 수집기가 사람의 메시지 중계 없이 누락 작업을 교환한다.
create table if not exists public.marketing_bridge_clients (
    client_key text primary key
        check (client_key ~ '^[a-z0-9_-]{3,80}$'),
    display_name text not null,
    status text not null default 'ready'
        check (status in ('ready', 'working', 'success', 'error', 'needs_login')),
    last_seen_at timestamptz,
    last_success_at timestamptz,
    last_error text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.marketing_bridge_jobs (
    id uuid primary key default gen_random_uuid(),
    client_key text not null default 'grok-marketing-ops'
        references public.marketing_bridge_clients(client_key) on delete restrict,
    provider text not null
        check (provider in ('smartstore', 'coupang')),
    account text not null
        check (account in ('innerium', 'yural')),
    metric_date date not null,
    task_type text not null default 'collect'
        check (task_type in ('collect')),
    status text not null default 'pending'
        check (status in ('pending', 'claimed', 'completed', 'failed', 'needs_login', 'skipped')),
    payload jsonb not null default '{}'::jsonb,
    result jsonb not null default '{}'::jsonb,
    attempts integer not null default 0 check (attempts >= 0),
    last_error text,
    requested_at timestamptz not null default now(),
    claimed_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (client_key, provider, account, metric_date, task_type)
);

create index if not exists marketing_bridge_jobs_status_idx
    on public.marketing_bridge_jobs (status, metric_date desc, requested_at);
create index if not exists marketing_bridge_jobs_client_idx
    on public.marketing_bridge_jobs (client_key, updated_at desc);

alter table public.marketing_bridge_clients enable row level security;
alter table public.marketing_bridge_jobs enable row level security;

create policy internal_read_marketing_bridge_clients
on public.marketing_bridge_clients
for select to authenticated
using (public.is_internal_user());

create policy internal_read_marketing_bridge_jobs
on public.marketing_bridge_jobs
for select to authenticated
using (public.is_internal_user());

revoke all on table public.marketing_bridge_clients from anon, authenticated;
revoke all on table public.marketing_bridge_jobs from anon, authenticated;
grant select on table public.marketing_bridge_clients to authenticated;
grant select on table public.marketing_bridge_jobs to authenticated;

insert into public.marketing_bridge_clients (client_key, display_name, status)
values ('grok-marketing-ops', '장스AI 마케팅 운영봇', 'ready')
on conflict (client_key) do update
set display_name = excluded.display_name,
    updated_at = now();

comment on table public.marketing_bridge_clients is
    '외부 마케팅 복구 봇의 마지막 접속·성공·오류 상태';
comment on table public.marketing_bridge_jobs is
    '일자·계정·채널별 누락 수집 작업 큐. 동일 작업은 한 건만 유지';
