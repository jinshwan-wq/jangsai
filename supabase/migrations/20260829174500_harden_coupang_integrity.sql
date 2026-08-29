-- 쿠팡 윙·로켓그로스 6개 값을 한 트랜잭션으로 저장하고 합계도 같은 행에서 갱신한다.
alter table public.daily_marketing_metrics
    drop constraint if exists daily_marketing_metrics_coupang_orders_check,
    drop constraint if exists daily_marketing_metrics_coupang_revenue_check;

create or replace function public.merge_daily_coupang_snapshot(
    p_product_id uuid,
    p_metric_date date,
    p_patch jsonb,
    p_source text default 'api',
    p_source_details jsonb default '{}'::jsonb
)
returns public.daily_marketing_metrics
language plpgsql
security definer
set search_path = public
as $$
declare
    required_key text;
    wing_visits integer;
    wing_orders integer;
    wing_revenue bigint;
    growth_visits integer;
    growth_orders integer;
    growth_revenue bigint;
    result public.daily_marketing_metrics;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
       and not public.is_internal_user() then
        raise exception 'not authorized';
    end if;
    if p_metric_date > timezone('Asia/Seoul', now())::date then
        raise exception 'metric date cannot be in the future';
    end if;
    if p_source not in ('manual', 'api', 'import') then
        raise exception 'invalid source';
    end if;
    if jsonb_typeof(p_patch) <> 'object' then
        raise exception 'coupang patch must be an object';
    end if;

    foreach required_key in array array[
        'coupang_wing_visits',
        'coupang_wing_orders',
        'coupang_wing_revenue',
        'coupang_growth_visits',
        'coupang_growth_orders',
        'coupang_growth_revenue'
    ]
    loop
        if not p_patch ? required_key
           or jsonb_typeof(p_patch -> required_key) <> 'number' then
            raise exception 'complete coupang snapshot is required: %', required_key;
        end if;
    end loop;

    wing_visits := (p_patch ->> 'coupang_wing_visits')::integer;
    wing_orders := (p_patch ->> 'coupang_wing_orders')::integer;
    wing_revenue := (p_patch ->> 'coupang_wing_revenue')::bigint;
    growth_visits := (p_patch ->> 'coupang_growth_visits')::integer;
    growth_orders := (p_patch ->> 'coupang_growth_orders')::integer;
    growth_revenue := (p_patch ->> 'coupang_growth_revenue')::bigint;

    if wing_visits < 0 or growth_visits < 0 then
        raise exception 'coupang visits must be non-negative';
    end if;

    insert into public.daily_marketing_metrics (
        product_id,
        metric_date,
        coupang_wing_visits,
        coupang_wing_orders,
        coupang_wing_revenue,
        coupang_growth_visits,
        coupang_growth_orders,
        coupang_growth_revenue,
        coupang_visits,
        coupang_orders,
        coupang_revenue,
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
        wing_visits,
        wing_orders,
        wing_revenue,
        growth_visits,
        growth_orders,
        growth_revenue,
        wing_visits + growth_visits,
        wing_orders + growth_orders,
        wing_revenue + growth_revenue,
        jsonb_build_object(
            'coupang_wing_visits', true,
            'coupang_wing_orders', true,
            'coupang_wing_revenue', true,
            'coupang_growth_visits', true,
            'coupang_growth_orders', true,
            'coupang_growth_revenue', true,
            'coupang_visits', true,
            'coupang_orders', true,
            'coupang_revenue', true
        ),
        p_source,
        jsonb_build_object('coupang', coalesce(p_source_details, '{}'::jsonb)),
        'partial',
        now(),
        auth.uid()
    )
    on conflict (product_id, metric_date) do update
    set
        coupang_wing_visits = excluded.coupang_wing_visits,
        coupang_wing_orders = excluded.coupang_wing_orders,
        coupang_wing_revenue = excluded.coupang_wing_revenue,
        coupang_growth_visits = excluded.coupang_growth_visits,
        coupang_growth_orders = excluded.coupang_growth_orders,
        coupang_growth_revenue = excluded.coupang_growth_revenue,
        coupang_visits = excluded.coupang_visits,
        coupang_orders = excluded.coupang_orders,
        coupang_revenue = excluded.coupang_revenue,
        data_completeness = coalesce(daily_marketing_metrics.data_completeness, '{}'::jsonb)
            || excluded.data_completeness,
        source = excluded.source,
        source_details = coalesce(daily_marketing_metrics.source_details, '{}'::jsonb)
            || excluded.source_details,
        collection_status = 'partial',
        collected_at = now(),
        updated_at = now()
    returning * into result;

    return result;
end;
$$;

revoke all on function public.merge_daily_coupang_snapshot(uuid, date, jsonb, text, jsonb)
from public, anon, authenticated;
grant execute on function public.merge_daily_coupang_snapshot(uuid, date, jsonb, text, jsonb)
to authenticated, service_role;

create or replace function public.merge_daily_coupang_metrics(
    p_product_id uuid,
    p_metric_date date,
    p_patch jsonb
)
returns public.daily_marketing_metrics
language plpgsql
security definer
set search_path = public
as $$
begin
    return public.merge_daily_coupang_snapshot(
        p_product_id,
        p_metric_date,
        p_patch,
        case
            when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then 'api'
            else 'manual'
        end,
        jsonb_build_object('collector', 'split_coupang_entry')
    );
end;
$$;

revoke all on function public.merge_daily_coupang_metrics(uuid, date, jsonb)
from public, anon;
grant execute on function public.merge_daily_coupang_metrics(uuid, date, jsonb)
to authenticated, service_role;

-- 확정된 채널 매출은 반품으로 음수가 되어도 그대로 보존한다.
create or replace view public.marketing_okr_rollups
with (security_invoker = true)
as
select
    p.brand,
    m.product_id,
    date_trunc('month', m.metric_date)::date as month_start,
    date_trunc('quarter', m.metric_date)::date as quarter_start,
    date_trunc('year', m.metric_date)::date as year_start,
    sum(case
        when m.blog_views is null and m.cafe_views is null then m.content_views
        else coalesce(m.blog_views, 0) + coalesce(m.cafe_views, 0)
    end)::bigint as content_views,
    sum(m.keyword_search_volume)::bigint as keyword_search_volume,
    sum(
        coalesce(m.cafe24_visits, m.site_visits, 0) +
        coalesce(m.smartstore_visits, 0) +
        case
            when m.coupang_wing_visits is not null
             and m.coupang_growth_visits is not null
            then m.coupang_wing_visits + m.coupang_growth_visits
            else coalesce(m.coupang_visits, 0)
        end
    )::bigint as visits,
    sum(
        m.cafe24_orders + m.smartstore_orders +
        case
            when m.coupang_wing_orders is not null
             and m.coupang_growth_orders is not null
            then m.coupang_wing_orders + m.coupang_growth_orders
            else m.coupang_orders
        end
    )::bigint as orders,
    sum(case
        when m.data_completeness ->> 'cafe24_revenue' = 'true'
         and m.data_completeness ->> 'smartstore_revenue' = 'true'
         and (
            (
                m.data_completeness ->> 'coupang_wing_revenue' = 'true'
                and m.data_completeness ->> 'coupang_growth_revenue' = 'true'
            )
            or m.data_completeness ->> 'coupang_revenue' = 'true'
         )
        then
            m.cafe24_revenue + m.smartstore_revenue +
            case
                when m.coupang_wing_revenue is not null
                 and m.coupang_growth_revenue is not null
                then m.coupang_wing_revenue + m.coupang_growth_revenue
                else m.coupang_revenue
            end
        when m.data_completeness ->> 'reported_total_revenue' = 'true'
        then m.reported_total_revenue
        else
            m.cafe24_revenue + m.smartstore_revenue +
            case
                when m.coupang_wing_revenue is not null
                 and m.coupang_growth_revenue is not null
                then m.coupang_wing_revenue + m.coupang_growth_revenue
                else m.coupang_revenue
            end
    end)::bigint as revenue,
    sum(m.ad_spend)::bigint as ad_spend
from public.daily_marketing_metrics m
join public.marketing_products p on p.id = m.product_id
group by p.brand, m.product_id, date_trunc('month', m.metric_date),
    date_trunc('quarter', m.metric_date), date_trunc('year', m.metric_date);
