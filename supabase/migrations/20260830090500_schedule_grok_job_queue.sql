-- Grok 클라이언트가 먼저 접속하지 않아도 서버가 로그인 채널 작업을 정시에 생성한다.
create or replace function public.enqueue_grok_marketing_jobs(
    p_provider text default null,
    p_metric_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_date date := coalesce(
        p_metric_date,
        timezone('Asia/Seoul', now())::date - 1
    );
    provider_name text;
    account_name text;
    has_missing boolean;
    queued_count integer := 0;
    completed_count integer := 0;
begin
    if p_provider is not null and p_provider not in ('smartstore', 'coupang') then
        raise exception 'unsupported Grok provider';
    end if;
    if target_date >= timezone('Asia/Seoul', now())::date
       or target_date < timezone('Asia/Seoul', now())::date - 90 then
        raise exception 'metric date is outside the allowed range';
    end if;

    for provider_name in
        select value
        from unnest(
            case
                when p_provider is null then array['smartstore', 'coupang']::text[]
                else array[p_provider]::text[]
            end
        ) providers(value)
    loop
        foreach account_name in array array['innerium', 'yural']::text[]
        loop
            select exists (
                select 1
                from (
                    values
                        ('innerium', 'innerium-gala431'),
                        ('innerium', 'innerium-minti431'),
                        ('yural', 'yural-tonggam-cream'),
                        ('yural', 'yural-myeongga-bonhwan')
                ) expected(account, product_slug)
                left join public.marketing_products products
                  on products.slug = expected.product_slug
                 and products.is_active
                left join public.daily_marketing_metrics metrics
                  on metrics.product_id = products.id
                 and metrics.metric_date = target_date
                where expected.account = account_name
                  and (
                    metrics.id is null
                    or case provider_name
                        when 'smartstore' then not coalesce((
                            metrics.data_completeness -> 'smartstore_visits' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_pay_count' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_conversion_rate' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_orders' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_revenue' = 'true'::jsonb
                        ), false)
                        else not coalesce((
                            metrics.data_completeness -> 'coupang_wing_visits' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_wing_orders' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_wing_revenue' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_growth_visits' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_growth_orders' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_growth_revenue' = 'true'::jsonb
                        ), false)
                    end
                  )
            )
            into has_missing;

            if has_missing then
                insert into public.marketing_bridge_jobs (
                    client_key,
                    provider,
                    account,
                    metric_date,
                    task_type,
                    status,
                    payload
                )
                values (
                    'grok-marketing-ops',
                    provider_name,
                    account_name,
                    target_date,
                    'collect',
                    'pending',
                    jsonb_build_object(
                        'provider', provider_name,
                        'account', account_name,
                        'metric_date', target_date,
                        'task_type', 'collect',
                        'queue_source', 'server_cron'
                    )
                )
                on conflict (client_key, provider, account, metric_date, task_type)
                do update
                set
                    payload = excluded.payload,
                    status = case
                        when marketing_bridge_jobs.status = 'needs_login'
                            then 'needs_login'
                        when marketing_bridge_jobs.status = 'claimed'
                         and coalesce(marketing_bridge_jobs.lease_expires_at, '-infinity'::timestamptz) > now()
                            then 'claimed'
                        when marketing_bridge_jobs.status = 'failed'
                         and marketing_bridge_jobs.attempts >= 3
                            then 'failed'
                        else 'pending'
                    end,
                    claimed_at = case
                        when marketing_bridge_jobs.status = 'claimed'
                         and coalesce(marketing_bridge_jobs.lease_expires_at, '-infinity'::timestamptz) > now()
                            then marketing_bridge_jobs.claimed_at
                        else null
                    end,
                    lease_expires_at = case
                        when marketing_bridge_jobs.status = 'claimed'
                         and coalesce(marketing_bridge_jobs.lease_expires_at, '-infinity'::timestamptz) > now()
                            then marketing_bridge_jobs.lease_expires_at
                        else null
                    end,
                    completed_at = null,
                    updated_at = now();
                queued_count := queued_count + 1;
            else
                update public.marketing_bridge_jobs
                set
                    status = 'completed',
                    result = jsonb_build_object(
                        'verified', true,
                        'completion_source', 'server_queue_existing_data'
                    ),
                    last_error = null,
                    lease_expires_at = null,
                    completed_at = coalesce(completed_at, now()),
                    updated_at = now()
                where client_key = 'grok-marketing-ops'
                  and provider = provider_name
                  and account = account_name
                  and metric_date = target_date
                  and task_type = 'collect'
                  and status <> 'completed';
                if found then completed_count := completed_count + 1; end if;
            end if;
        end loop;
    end loop;

    return jsonb_build_object(
        'metric_date', target_date,
        'provider', p_provider,
        'queued', queued_count,
        'completed_from_existing_data', completed_count
    );
end;
$$;

revoke all on function public.enqueue_grok_marketing_jobs(text, date)
from public, anon, authenticated;
grant execute on function public.enqueue_grok_marketing_jobs(text, date)
to service_role;

do $$
declare
    existing_job bigint;
begin
    select jobid into existing_job
    from cron.job where jobname = 'grok-smartstore-queue-0950-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'grok-smartstore-queue-0950-kst',
        '50 0 * * *',
        'select public.enqueue_grok_marketing_jobs(''smartstore'');'
    );

    existing_job := null;
    select jobid into existing_job
    from cron.job where jobname = 'grok-coupang-queue-1240-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'grok-coupang-queue-1240-kst',
        '40 3 * * *',
        'select public.enqueue_grok_marketing_jobs(''coupang'');'
    );

    existing_job := null;
    select jobid into existing_job
    from cron.job where jobname = 'grok-final-queue-1400-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'grok-final-queue-1400-kst',
        '0 5 * * *',
        'select public.enqueue_grok_marketing_jobs();'
    );
end;
$$;

-- 배포 시점의 전일 스마트스토어 누락도 즉시 대기열에 넣는다.
select public.enqueue_grok_marketing_jobs('smartstore');
