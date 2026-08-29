-- 스마트스토어 판매수량과 스토어분석 결제건수를 분리해 정확한 전환율을 보존한다.
alter table public.daily_marketing_metrics
    add column if not exists smartstore_pay_count integer
        check (smartstore_pay_count is null or smartstore_pay_count >= 0),
    add column if not exists smartstore_conversion_rate numeric(8, 4)
        check (smartstore_conversion_rate is null or smartstore_conversion_rate >= 0);

comment on column public.daily_marketing_metrics.smartstore_pay_count is
    '스마트스토어 방문 분석의 상품결제건수. 판매수량과 구분';
comment on column public.daily_marketing_metrics.smartstore_conversion_rate is
    '스마트스토어 방문 분석이 제공하는 상품별 구매전환율(%)';

create or replace function public.merge_daily_smartstore_analytics(
    p_product_id uuid,
    p_metric_date date,
    p_visits integer,
    p_pay_count integer,
    p_conversion_rate numeric,
    p_source_details jsonb default '{}'::jsonb
)
returns public.daily_marketing_metrics
language plpgsql
security definer
set search_path = public
as $$
declare
    result public.daily_marketing_metrics;
begin
    if not public.is_internal_user() then
        raise exception 'not authorized';
    end if;
    if p_visits < 0 or p_pay_count < 0 or p_conversion_rate < 0 then
        raise exception 'invalid smartstore analytics metric';
    end if;

    insert into public.daily_marketing_metrics (
        product_id,
        metric_date,
        source,
        source_details,
        collection_status,
        collected_at,
        created_by
    )
    values (
        p_product_id,
        p_metric_date,
        'api',
        coalesce(p_source_details, '{}'::jsonb),
        'partial',
        now(),
        auth.uid()
    )
    on conflict (product_id, metric_date) do nothing;

    update public.daily_marketing_metrics metrics
    set smartstore_visits = p_visits,
        smartstore_pay_count = p_pay_count,
        smartstore_conversion_rate = p_conversion_rate,
        data_completeness = coalesce(metrics.data_completeness, '{}'::jsonb) ||
            jsonb_build_object(
                'smartstore_visits', true,
                'smartstore_pay_count', true,
                'smartstore_conversion_rate', true
            ),
        source = 'api',
        source_details = coalesce(metrics.source_details, '{}'::jsonb) ||
            coalesce(p_source_details, '{}'::jsonb),
        collection_status = 'partial',
        collected_at = now(),
        updated_at = now()
    where metrics.product_id = p_product_id
      and metrics.metric_date = p_metric_date
    returning metrics.* into result;

    return result;
end;
$$;

revoke all on function public.merge_daily_smartstore_analytics(
    uuid, date, integer, integer, numeric, jsonb
) from public;
grant execute on function public.merge_daily_smartstore_analytics(
    uuid, date, integer, integer, numeric, jsonb
) to authenticated, service_role;
