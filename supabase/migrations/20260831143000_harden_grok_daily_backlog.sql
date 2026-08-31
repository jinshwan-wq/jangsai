-- Grok 로그인 채널은 최근 누락일까지 자동 복구하고 실제 루틴보다 먼저 대기열을 만든다.
create or replace function public.enqueue_grok_marketing_backlog(
    p_provider text default null,
    p_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    day_offset integer;
    target_date date;
    enqueue_result jsonb;
    results jsonb := '[]'::jsonb;
begin
    if p_provider is not null and p_provider not in ('smartstore', 'coupang') then
        raise exception 'unsupported Grok provider';
    end if;
    if p_days < 1 or p_days > 14 then
        raise exception 'backlog days must be between 1 and 14';
    end if;

    for day_offset in 1..p_days loop
        target_date := timezone('Asia/Seoul', now())::date - day_offset;
        enqueue_result := public.enqueue_grok_marketing_jobs(
            p_provider,
            target_date
        );

        -- 통합매니저 또는 판매자 세션이 복구된 뒤에는 사람이 과거 날짜를
        -- 다시 호출하지 않아도 다음 예약 실행에서 한 번 더 처리한다.
        update public.marketing_bridge_jobs
        set
            status = 'pending',
            attempts = 0,
            claimed_at = null,
            lease_expires_at = null,
            completed_at = null,
            updated_at = now()
        where client_key = 'grok-marketing-ops'
          and metric_date = target_date
          and (p_provider is null or provider = p_provider)
          and status in ('failed', 'needs_login');

        results := results || jsonb_build_array(enqueue_result);
    end loop;

    return jsonb_build_object(
        'provider', p_provider,
        'days', p_days,
        'results', results
    );
end;
$$;

revoke all on function public.enqueue_grok_marketing_backlog(text, integer)
from public, anon, authenticated;
grant execute on function public.enqueue_grok_marketing_backlog(text, integer)
to service_role;

do $$
declare
    existing_job bigint;
begin
    for existing_job in
        select jobid
        from cron.job
        where jobname in (
            'grok-smartstore-queue-0950-kst',
            'grok-coupang-queue-1240-kst',
            'grok-final-queue-1400-kst',
            'grok-smartstore-backlog-0925-kst',
            'grok-coupang-backlog-1235-kst',
            'grok-final-backlog-1300-kst'
        )
    loop
        perform cron.unschedule(existing_job);
    end loop;

    perform cron.schedule(
        'grok-smartstore-backlog-0925-kst',
        '25 0 * * *',
        'select public.enqueue_grok_marketing_backlog(''smartstore'', 7);'
    );
    perform cron.schedule(
        'grok-coupang-backlog-1235-kst',
        '35 3 * * *',
        'select public.enqueue_grok_marketing_backlog(''coupang'', 7);'
    );
    perform cron.schedule(
        'grok-final-backlog-1300-kst',
        '0 4 * * *',
        'select public.enqueue_grok_marketing_backlog(null, 7);'
    );
end;
$$;

select public.enqueue_grok_marketing_backlog(null, 7);
