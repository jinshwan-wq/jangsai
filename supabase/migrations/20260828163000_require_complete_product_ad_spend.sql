-- 외부 서비스 역할도 미완성 광고비 배분으로 제품값을 덮어쓸 수 없게 한다.
create or replace function public.merge_daily_verified_naver_ad_spend_allocation(
    p_brand text,
    p_metric_date date,
    p_brand_total bigint,
    p_allocations jsonb,
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
        raise exception 'product allocation must equal brand total';
    end if;

    return public.merge_daily_naver_ad_spend_allocation(
        p_brand,
        p_metric_date,
        p_brand_total,
        p_allocations,
        true,
        p_source_details
    );
end;
$$;

revoke all on function public.merge_daily_naver_ad_spend_allocation(
    text, date, bigint, jsonb, boolean, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.merge_daily_verified_naver_ad_spend_allocation(
    text, date, bigint, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_verified_naver_ad_spend_allocation(
    text, date, bigint, jsonb, jsonb
) to service_role;
