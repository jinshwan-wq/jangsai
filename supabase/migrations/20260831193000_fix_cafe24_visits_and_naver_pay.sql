-- 자사몰 유입은 상품 조회수가 아니라 몰 전체 방문자수로 저장한다.
alter table public.daily_marketing_metrics
    add column if not exists cafe24_product_views integer
        check (cafe24_product_views is null or cafe24_product_views >= 0);

alter table public.daily_brand_marketing_metrics
    add column if not exists cafe24_visits integer
        check (cafe24_visits is null or cafe24_visits >= 0);

comment on column public.daily_marketing_metrics.cafe24_product_views is
    'Cafe24 Analytics products/view 상품별 조회수. 제품 전환율 분모로만 사용';
comment on column public.daily_brand_marketing_metrics.cafe24_visits is
    'Cafe24 Analytics visitors/view 몰 전체 순방문자수';

-- 기존 cafe24_visits에는 상품 조회수가 들어 있었으므로 의미를 분리한다.
update public.daily_marketing_metrics
set
    cafe24_product_views = cafe24_visits,
    cafe24_visits = null,
    data_completeness = (
        coalesce(data_completeness, '{}'::jsonb) - 'cafe24_visits'
    ) || jsonb_build_object('cafe24_product_views', true)
where cafe24_visits is not null
  and cafe24_product_views is null;

drop function if exists public.merge_daily_cafe24_conversion(
    uuid, date, integer, integer, jsonb
);

create or replace function public.merge_daily_cafe24_conversion(
    p_product_id uuid,
    p_metric_date date,
    p_product_views integer,
    p_purchase_count integer,
    p_store_visits integer,
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
    if p_product_views < 0 or p_purchase_count < 0 or p_store_visits < 0 then
        raise exception 'Cafe24 metric values must be non-negative';
    end if;

    conversion_rate := case
        when p_product_views > 0
            then round(p_purchase_count::numeric * 100 / p_product_views, 4)
        when p_purchase_count = 0 then 0
        else null
    end;

    insert into public.daily_marketing_metrics (
        product_id,
        metric_date,
        cafe24_visits,
        cafe24_product_views,
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
        p_store_visits,
        p_product_views,
        p_purchase_count,
        conversion_rate,
        jsonb_build_object(
            'cafe24_visits', true,
            'cafe24_product_views', true,
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
        cafe24_product_views = excluded.cafe24_product_views,
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
    uuid, date, integer, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_cafe24_conversion(
    uuid, date, integer, integer, integer, jsonb
) to service_role;

create or replace function public.merge_daily_brand_cafe24_visits(
    p_brand text,
    p_metric_date date,
    p_cafe24_visits integer,
    p_source_details jsonb default '{}'::jsonb
)
returns public.daily_brand_marketing_metrics
language plpgsql
security definer
set search_path = public
as $$
declare
    result public.daily_brand_marketing_metrics;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
       and not public.is_internal_user() then
        raise exception 'not authorized';
    end if;
    if p_cafe24_visits < 0 then
        raise exception 'Cafe24 visitors must be non-negative';
    end if;

    insert into public.daily_brand_marketing_metrics (
        brand,
        metric_date,
        cafe24_visits,
        source,
        source_details,
        collected_at,
        updated_at
    )
    values (
        trim(p_brand),
        p_metric_date,
        p_cafe24_visits,
        'api',
        jsonb_build_object('cafe24_visits', coalesce(p_source_details, '{}'::jsonb)),
        now(),
        now()
    )
    on conflict (brand, metric_date) do update
    set
        cafe24_visits = excluded.cafe24_visits,
        source = 'api',
        source_details = coalesce(daily_brand_marketing_metrics.source_details, '{}'::jsonb)
            || excluded.source_details,
        collected_at = now(),
        updated_at = now()
    returning * into result;

    return result;
end;
$$;

revoke all on function public.merge_daily_brand_cafe24_visits(
    text, date, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_brand_cafe24_visits(
    text, date, integer, jsonb
) to service_role;
