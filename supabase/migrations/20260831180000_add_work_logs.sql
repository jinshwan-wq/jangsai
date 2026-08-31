-- 업무일지 테이블: 직원별 일일 업무 기록 (금일 업무사항 / 특이사항 / 단기미결)
create table if not exists public.work_logs (
    id          bigint generated always as identity primary key,
    person_key  text        not null,
    display_name text       not null,
    log_date    date        not null,
    work        text        not null default '',
    notes       text        not null default '',
    pending     text        not null default '',
    source      text        not null default 'manual',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),

    constraint work_logs_person_date_uq unique (person_key, log_date)
);

create index if not exists work_logs_date_idx
    on public.work_logs (log_date desc);
create index if not exists work_logs_person_idx
    on public.work_logs (person_key, log_date desc);

alter table public.work_logs enable row level security;

-- 관리자만 읽기 가능
create policy work_logs_admin_read on public.work_logs
    for select using (is_current_user_admin());

-- service_role 또는 관리자만 쓰기 (수집 봇 + 관리자 직접 입력)
create policy work_logs_admin_insert on public.work_logs
    for insert with check (is_current_user_admin());

create policy work_logs_admin_update on public.work_logs
    for update using (is_current_user_admin());

create policy work_logs_service_insert on public.work_logs
    for insert with check (
        coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    );

create policy work_logs_service_update on public.work_logs
    for update using (
        coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    );

-- updated_at 자동 갱신 트리거
create or replace function public.set_work_log_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger work_logs_set_updated_at
    before update on public.work_logs
    for each row execute function public.set_work_log_updated_at();

-- 수집 봇(service_role)이 빈 데이터로 기존 기록을 덮어쓰지 않도록 보호
create or replace function public.upsert_work_log(
    p_person_key  text,
    p_display_name text,
    p_log_date    date,
    p_work        text default '',
    p_notes       text default '',
    p_pending     text default '',
    p_source      text default 'bot'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id bigint;
    v_existing record;
begin
    select id, work, notes, pending
      into v_existing
      from public.work_logs
     where person_key = p_person_key
       and log_date   = p_log_date;

    if found then
        if coalesce(nullif(trim(p_work), ''), '') = ''
           and coalesce(nullif(trim(p_notes), ''), '') = ''
           and coalesce(nullif(trim(p_pending), ''), '') = ''
           and (coalesce(nullif(trim(v_existing.work), ''), '') != ''
                or coalesce(nullif(trim(v_existing.notes), ''), '') != ''
                or coalesce(nullif(trim(v_existing.pending), ''), '') != '')
        then
            return v_existing.id;
        end if;

        update public.work_logs
           set work         = p_work,
               notes        = p_notes,
               pending      = p_pending,
               display_name = p_display_name,
               source       = p_source
         where id = v_existing.id
         returning id into v_id;
    else
        insert into public.work_logs (person_key, display_name, log_date, work, notes, pending, source)
        values (p_person_key, p_display_name, p_log_date, p_work, p_notes, p_pending, p_source)
        returning id into v_id;
    end if;

    return v_id;
end;
$$;

revoke all on function public.upsert_work_log(text, text, date, text, text, text, text)
from public, anon;
grant execute on function public.upsert_work_log(text, text, date, text, text, text, text)
to authenticated, service_role;
