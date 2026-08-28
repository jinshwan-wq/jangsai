-- Wing 판매분석은 반품이 발생한 날짜에 옵션 판매량과 매출을 음수로 제공합니다.
-- 상품별 합계를 공식 판매자 합계와 일치시키기 위해 쿠팡 분리 지표는 음수를 보존합니다.

alter table public.daily_marketing_metrics
    drop constraint if exists daily_marketing_metrics_coupang_wing_orders_check,
    drop constraint if exists daily_marketing_metrics_coupang_wing_revenue_check,
    drop constraint if exists daily_marketing_metrics_coupang_growth_orders_check,
    drop constraint if exists daily_marketing_metrics_coupang_growth_revenue_check;

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
declare
    result public.daily_marketing_metrics;
begin
    if not public.is_internal_user() then raise exception 'not authorized'; end if;

    insert into public.daily_marketing_metrics (product_id, metric_date, created_by)
    values (p_product_id, p_metric_date, auth.uid())
    on conflict (product_id, metric_date) do nothing;

    update public.daily_marketing_metrics m
    set coupang_wing_visits = case when p_patch ? 'coupang_wing_visits' then greatest(0, (p_patch->>'coupang_wing_visits')::integer) else m.coupang_wing_visits end,
        coupang_wing_orders = case when p_patch ? 'coupang_wing_orders' then (p_patch->>'coupang_wing_orders')::integer else m.coupang_wing_orders end,
        coupang_wing_revenue = case when p_patch ? 'coupang_wing_revenue' then (p_patch->>'coupang_wing_revenue')::bigint else m.coupang_wing_revenue end,
        coupang_growth_visits = case when p_patch ? 'coupang_growth_visits' then greatest(0, (p_patch->>'coupang_growth_visits')::integer) else m.coupang_growth_visits end,
        coupang_growth_orders = case when p_patch ? 'coupang_growth_orders' then (p_patch->>'coupang_growth_orders')::integer else m.coupang_growth_orders end,
        coupang_growth_revenue = case when p_patch ? 'coupang_growth_revenue' then (p_patch->>'coupang_growth_revenue')::bigint else m.coupang_growth_revenue end,
        updated_at = now()
    where m.product_id = p_product_id and m.metric_date = p_metric_date
    returning m.* into result;
    return result;
end;
$$;

revoke all on function public.merge_daily_coupang_metrics(uuid, date, jsonb) from public;
grant execute on function public.merge_daily_coupang_metrics(uuid, date, jsonb)
to authenticated, service_role;
