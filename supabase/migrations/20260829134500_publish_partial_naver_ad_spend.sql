-- 제품명이 확인된 광고비는 미분류 잔액이 있어도 숨기지 않고 부분완료로 저장한다.
create or replace function public.merge_daily_observed_naver_ad_spend_allocation(
    p_brand text,
    p_metric_date date,
    p_brand_total bigint,
    p_allocations jsonb,
    p_allocation_complete boolean,
    p_source_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    allocated_total bigint;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;
    if jsonb_typeof(p_allocations) <> 'array' then
        raise exception 'allocations must be an array';
    end if;
    select coalesce(sum((item ->> 'spend')::bigint), 0)
    into allocated_total
    from jsonb_array_elements(p_allocations) item;
    if allocated_total <> p_brand_total then
        raise exception 'observed product allocation must equal observed brand total';
    end if;

    return public.merge_daily_naver_ad_spend_allocation(
        p_brand,
        p_metric_date,
        p_brand_total,
        p_allocations,
        p_allocation_complete,
        p_source_details
    );
end;
$$;

revoke all on function public.merge_daily_observed_naver_ad_spend_allocation(
    text, date, bigint, jsonb, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_observed_naver_ad_spend_allocation(
    text, date, bigint, jsonb, boolean, jsonb
) to service_role;

-- 일시적인 외부 API 지연은 같은 날 두 번 더 자동 복구한다.
do $$
declare
    existing_job bigint;
begin
    select jobid into existing_job from cron.job where jobname = 'marketing-retry-0930-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'marketing-retry-0930-kst',
        '30 0 * * *',
        'select public.invoke_marketing_collector();'
    );

    existing_job := null;
    select jobid into existing_job from cron.job where jobname = 'marketing-retry-1000-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'marketing-retry-1000-kst',
        '0 1 * * *',
        'select public.invoke_marketing_collector();'
    );
end;
$$;

-- 배포 직후 전일 누락 광고비를 자동 복구한다.
select public.invoke_marketing_collector();
