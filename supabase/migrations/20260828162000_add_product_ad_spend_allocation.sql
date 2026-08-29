-- 브랜드 광고계정 총액과 소재명 기반 제품별 배분액을 원자적으로 저장한다.
create or replace function public.merge_daily_naver_ad_spend_allocation(
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
    expected_slugs text[];
    submitted_slugs text[];
    allocation jsonb;
    target_product_id uuid;
    target_slug text;
    target_spend bigint;
    allocated_total bigint;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;
    if p_metric_date >= timezone('Asia/Seoul', now())::date then
        raise exception 'metric date must be in the past';
    end if;
    if p_brand_total < 0 then raise exception 'brand total must be non-negative'; end if;
    if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) <> 2 then
        raise exception 'exactly two product allocations are required';
    end if;

    expected_slugs := case trim(p_brand)
        when '이너리움' then array['innerium-gala431', 'innerium-minti431']::text[]
        when '유랄' then array['yural-myeongga-bonhwan', 'yural-tonggam-cream']::text[]
        else null
    end;
    if expected_slugs is null then raise exception 'unsupported brand'; end if;

    select array_agg(value order by value), sum(spend)
    into submitted_slugs, allocated_total
    from (
        select
            item ->> 'product_slug' as value,
            (item ->> 'spend')::bigint as spend
        from jsonb_array_elements(p_allocations) item
    ) submitted;
    if submitted_slugs is distinct from expected_slugs then
        raise exception 'submitted product set does not match brand';
    end if;
    if allocated_total < 0 or allocated_total > p_brand_total then
        raise exception 'allocated spend is outside brand total';
    end if;
    if p_allocation_complete and allocated_total <> p_brand_total then
        raise exception 'complete allocation must equal brand total';
    end if;

    insert into public.daily_brand_marketing_metrics (
        brand,
        metric_date,
        naver_ad_spend,
        source,
        source_details,
        collected_at,
        updated_at
    )
    values (
        trim(p_brand),
        p_metric_date,
        p_brand_total,
        'api',
        jsonb_build_object('naver_ad_spend', coalesce(p_source_details, '{}'::jsonb)),
        now(),
        now()
    )
    on conflict (brand, metric_date) do update
    set naver_ad_spend = excluded.naver_ad_spend,
        source = 'api',
        source_details = coalesce(daily_brand_marketing_metrics.source_details, '{}'::jsonb) ||
            excluded.source_details,
        collected_at = now(),
        updated_at = now();

    for allocation in select value from jsonb_array_elements(p_allocations)
    loop
        target_slug := allocation ->> 'product_slug';
        target_spend := (allocation ->> 'spend')::bigint;
        if target_spend < 0 then raise exception 'product spend must be non-negative'; end if;

        select products.id into target_product_id
        from public.marketing_products products
        where products.slug = target_slug
          and products.brand = trim(p_brand)
          and products.is_active;
        if target_product_id is null then
            raise exception 'marketing product not found: %', target_slug;
        end if;

        insert into public.daily_marketing_metrics (
            product_id,
            metric_date,
            ad_spend,
            data_completeness,
            source,
            source_details,
            collection_status,
            collected_at
        )
        values (
            target_product_id,
            p_metric_date,
            target_spend,
            jsonb_build_object('ad_spend', p_allocation_complete),
            'api',
            jsonb_build_object(
                'naver_ad_spend',
                coalesce(p_source_details, '{}'::jsonb) ||
                    jsonb_build_object('product_slug', target_slug, 'product_spend', target_spend)
            ),
            'partial',
            now()
        )
        on conflict (product_id, metric_date) do update
        set ad_spend = excluded.ad_spend,
            data_completeness = coalesce(daily_marketing_metrics.data_completeness, '{}'::jsonb) ||
                excluded.data_completeness,
            source = 'api',
            source_details = coalesce(daily_marketing_metrics.source_details, '{}'::jsonb) ||
                excluded.source_details,
            collection_status = 'partial',
            collected_at = now(),
            updated_at = now();
    end loop;

    return jsonb_build_object(
        'brand', trim(p_brand),
        'metric_date', p_metric_date,
        'brand_total', p_brand_total,
        'allocated_total', allocated_total,
        'unclassified_spend', p_brand_total - allocated_total,
        'allocation_complete', p_allocation_complete
    );
end;
$$;

revoke all on function public.merge_daily_naver_ad_spend_allocation(
    text, date, bigint, jsonb, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_naver_ad_spend_allocation(
    text, date, bigint, jsonb, boolean, jsonb
) to service_role;

-- 같은 데이터를 일반 로그인 사용자가 API 출처로 직접 기록하지 못하게 한다.
revoke all on function public.merge_daily_brand_ad_spend(text, date, bigint, jsonb)
    from public, anon, authenticated;
grant execute on function public.merge_daily_brand_ad_spend(text, date, bigint, jsonb)
    to service_role;
