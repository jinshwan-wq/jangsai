-- Cafe24 Analytics의 상품별 조회수와 판매건수로 자사몰 전환율을 보존한다.
alter table public.daily_marketing_metrics
    add column if not exists cafe24_purchase_count integer
        check (cafe24_purchase_count is null or cafe24_purchase_count >= 0),
    add column if not exists cafe24_conversion_rate numeric(8, 4)
        check (cafe24_conversion_rate is null or cafe24_conversion_rate >= 0),
    add column if not exists coupang_wing_conversion_rate numeric(8, 4)
        check (coupang_wing_conversion_rate is null or coupang_wing_conversion_rate >= 0),
    add column if not exists coupang_growth_conversion_rate numeric(8, 4)
        check (coupang_growth_conversion_rate is null or coupang_growth_conversion_rate >= 0),
    add column if not exists coupang_conversion_rate numeric(8, 4)
        check (coupang_conversion_rate is null or coupang_conversion_rate >= 0);

comment on column public.daily_marketing_metrics.cafe24_purchase_count is
    'Cafe24 Analytics products/sales의 상품별 판매건수';
comment on column public.daily_marketing_metrics.cafe24_conversion_rate is
    'Cafe24 공식 상품 조회수 대비 판매건수 전환율(%)';
comment on column public.daily_marketing_metrics.coupang_wing_conversion_rate is
    '쿠팡 판매자배송 공식 구매전환율(%)';
comment on column public.daily_marketing_metrics.coupang_growth_conversion_rate is
    '쿠팡 로켓그로스 공식 구매전환율(%)';
comment on column public.daily_marketing_metrics.coupang_conversion_rate is
    '쿠팡 방문수 가중 통합 구매전환율(%)';

create or replace function public.merge_daily_cafe24_conversion(
    p_product_id uuid,
    p_metric_date date,
    p_visits integer,
    p_purchase_count integer,
    p_source_details jsonb default '{}'::jsonb
)
returns public.daily_marketing_metrics
language plpgsql
security definer
set search_path = public
as $$
declare
    conversion_rate numeric(8, 4);
    result public.daily_marketing_metrics;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
       and not public.is_internal_user() then
        raise exception 'not authorized';
    end if;
    if p_metric_date > timezone('Asia/Seoul', now())::date then
        raise exception 'metric date cannot be in the future';
    end if;
    if p_visits < 0 or p_purchase_count < 0 then
        raise exception 'Cafe24 conversion values must be non-negative';
    end if;

    conversion_rate := case
        when p_visits > 0 then round(p_purchase_count::numeric * 100 / p_visits, 4)
        when p_purchase_count = 0 then 0
        else null
    end;

    insert into public.daily_marketing_metrics (
        product_id,
        metric_date,
        cafe24_visits,
        cafe24_purchase_count,
        cafe24_conversion_rate,
        data_completeness,
        source,
        source_details,
        collection_status,
        collected_at,
        created_by
    )
    values (
        p_product_id,
        p_metric_date,
        p_visits,
        p_purchase_count,
        conversion_rate,
        jsonb_build_object(
            'cafe24_visits', true,
            'cafe24_purchase_count', true,
            'cafe24_conversion_rate', conversion_rate is not null
        ),
        'api',
        jsonb_build_object('cafe24_conversion', coalesce(p_source_details, '{}'::jsonb)),
        'partial',
        now(),
        auth.uid()
    )
    on conflict (product_id, metric_date) do update
    set
        cafe24_visits = excluded.cafe24_visits,
        cafe24_purchase_count = excluded.cafe24_purchase_count,
        cafe24_conversion_rate = excluded.cafe24_conversion_rate,
        data_completeness = coalesce(daily_marketing_metrics.data_completeness, '{}'::jsonb)
            || excluded.data_completeness,
        source = 'api',
        source_details = coalesce(daily_marketing_metrics.source_details, '{}'::jsonb)
            || excluded.source_details,
        collection_status = 'partial',
        collected_at = now(),
        updated_at = now()
    returning * into result;

    return result;
end;
$$;

revoke all on function public.merge_daily_cafe24_conversion(
    uuid, date, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_cafe24_conversion(
    uuid, date, integer, integer, jsonb
) to service_role;

create or replace function public.merge_daily_coupang_conversion(
    p_product_slug text,
    p_metric_date date,
    p_wing_rate numeric,
    p_growth_rate numeric,
    p_combined_rate numeric,
    p_source_details jsonb default '{}'::jsonb
)
returns public.daily_marketing_metrics
language plpgsql
security definer
set search_path = public
as $$
declare
    target_product_id uuid;
    result public.daily_marketing_metrics;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;
    if p_wing_rate < 0 or p_growth_rate < 0 or p_combined_rate < 0 then
        raise exception 'Coupang conversion rates must be non-negative';
    end if;

    select id into target_product_id
    from public.marketing_products
    where slug = p_product_slug
      and is_active;
    if target_product_id is null then
        raise exception 'marketing product not found: %', p_product_slug;
    end if;

    insert into public.daily_marketing_metrics (
        product_id,
        metric_date,
        coupang_wing_conversion_rate,
        coupang_growth_conversion_rate,
        coupang_conversion_rate,
        data_completeness,
        source,
        source_details,
        collection_status,
        collected_at
    )
    values (
        target_product_id,
        p_metric_date,
        p_wing_rate,
        p_growth_rate,
        p_combined_rate,
        jsonb_build_object(
                'coupang_wing_conversion_rate', true,
                'coupang_growth_conversion_rate', true,
                'coupang_conversion_rate', true
        ),
        'api',
        jsonb_build_object('coupang_conversion', coalesce(p_source_details, '{}'::jsonb)),
        'partial',
        now()
    )
    on conflict (product_id, metric_date) do update
    set
        coupang_wing_conversion_rate = excluded.coupang_wing_conversion_rate,
        coupang_growth_conversion_rate = excluded.coupang_growth_conversion_rate,
        coupang_conversion_rate = excluded.coupang_conversion_rate,
        data_completeness = coalesce(daily_marketing_metrics.data_completeness, '{}'::jsonb)
            || excluded.data_completeness,
        source_details = coalesce(daily_marketing_metrics.source_details, '{}'::jsonb)
            || excluded.source_details,
        collected_at = now(),
        updated_at = now()
    returning * into result;

    return result;
end;
$$;

revoke all on function public.merge_daily_coupang_conversion(
    text, date, numeric, numeric, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_coupang_conversion(
    text, date, numeric, numeric, numeric, jsonb
) to service_role;
