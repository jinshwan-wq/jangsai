-- 고정 egress IP가 없는 환경에서는 스마트스토어 주문·매출도 Grok의 읽기 전용
-- 판매자센터 세션으로 수집한다. 기존 analytics 제출을 완료 처리하기 전에 먼저 병합한다.
create or replace function public.merge_grok_smartstore_sales(
    p_job_id uuid,
    p_client_key text,
    p_submission jsonb,
    p_submission_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    job public.marketing_bridge_jobs;
    metric jsonb;
    target_product_id uuid;
    expected_slugs text[];
    submitted_slugs text[];
    tracked_orders bigint;
    tracked_revenue bigint;
    unmapped_orders bigint;
    unmapped_revenue bigint;
    source_orders bigint;
    source_revenue bigint;
    source_details jsonb;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;
    if p_submission_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid submission hash';
    end if;
    if jsonb_typeof(p_submission -> 'metrics') <> 'array'
       or jsonb_array_length(p_submission -> 'metrics') <> 2 then
        raise exception 'exactly two product metrics are required';
    end if;
    if jsonb_typeof(coalesce(p_submission -> 'unmapped', '[]'::jsonb)) <> 'array' then
        raise exception 'unmapped must be an array';
    end if;

    select jobs.* into job
    from public.marketing_bridge_jobs jobs
    where jobs.id = p_job_id
      and jobs.client_key = p_client_key
    for update;

    if job.id is null then raise exception 'bridge job not found'; end if;
    if job.provider <> 'smartstore' then raise exception 'job is not smartstore'; end if;
    if job.status <> 'claimed' then raise exception 'bridge job must be claimed first'; end if;
    if coalesce(job.lease_expires_at, '-infinity'::timestamptz) < now() then
        raise exception 'bridge job lease expired';
    end if;

    expected_slugs := case job.account
        when 'innerium' then array['innerium-gala431', 'innerium-minti431']::text[]
        when 'yural' then array['yural-myeongga-bonhwan', 'yural-tonggam-cream']::text[]
        else null
    end;
    select array_agg(value order by value)
    into submitted_slugs
    from (
        select distinct element ->> 'product_slug' as value
        from jsonb_array_elements(p_submission -> 'metrics') element
    ) submitted;
    if submitted_slugs is distinct from expected_slugs then
        raise exception 'submitted product set does not match account';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(
            (p_submission -> 'metrics') || coalesce(p_submission -> 'unmapped', '[]'::jsonb)
        ) element
        where coalesce(element ->> 'orders', '') !~ '^[0-9]+$'
           or coalesce(element ->> 'revenue', '') !~ '^[0-9]+$'
           or (element ->> 'orders')::numeric > 1000000
           or (element ->> 'revenue')::numeric > 1000000000000
    ) then
        raise exception 'invalid smartstore sales value';
    end if;

    if coalesce(p_submission #>> '{source_totals,orders}', '') !~ '^[0-9]+$'
       or coalesce(p_submission #>> '{source_totals,revenue}', '') !~ '^[0-9]+$' then
        raise exception 'invalid smartstore sales totals';
    end if;

    select
        coalesce(sum((element ->> 'orders')::bigint), 0),
        coalesce(sum((element ->> 'revenue')::bigint), 0)
    into tracked_orders, tracked_revenue
    from jsonb_array_elements(p_submission -> 'metrics') element;

    select
        coalesce(sum((element ->> 'orders')::bigint), 0),
        coalesce(sum((element ->> 'revenue')::bigint), 0)
    into unmapped_orders, unmapped_revenue
    from jsonb_array_elements(coalesce(p_submission -> 'unmapped', '[]'::jsonb)) element;

    source_orders := (p_submission #>> '{source_totals,orders}')::bigint;
    source_revenue := (p_submission #>> '{source_totals,revenue}')::bigint;
    if tracked_orders + unmapped_orders <> source_orders
       or tracked_revenue + unmapped_revenue <> source_revenue then
        raise exception 'smartstore sales totals do not match';
    end if;

    source_details := jsonb_build_object(
        'provider', 'smartstore',
        'collector', 'grok_marketing_ops',
        'account', job.account,
        'bridge_job_id', job.id,
        'submission_hash', p_submission_hash,
        'source_totals', p_submission -> 'source_totals',
        'unmapped', coalesce(p_submission -> 'unmapped', '[]'::jsonb),
        'collected_at', now()
    );

    for metric in
        select value from jsonb_array_elements(p_submission -> 'metrics')
    loop
        select products.id into target_product_id
        from public.marketing_products products
        where products.slug = metric ->> 'product_slug'
          and products.is_active;
        if target_product_id is null then
            raise exception 'marketing product not found: %', metric ->> 'product_slug';
        end if;

        perform public.merge_daily_marketing_metric(
            target_product_id,
            job.metric_date,
            jsonb_build_object(
                'smartstore_orders', (metric ->> 'orders')::integer,
                'smartstore_revenue', (metric ->> 'revenue')::bigint,
                'data_completeness', jsonb_build_object(
                    'smartstore_orders', true,
                    'smartstore_revenue', true
                )
            ),
            'api',
            jsonb_build_object('grok_bridge_sales', source_details),
            'partial'
        );
    end loop;

    return jsonb_build_object(
        'job_id', job.id,
        'metric_date', job.metric_date,
        'staged', true,
        'orders', tracked_orders,
        'revenue', tracked_revenue
    );
end;
$$;

revoke all on function public.merge_grok_smartstore_sales(uuid, text, jsonb, text)
from public, anon, authenticated;
grant execute on function public.merge_grok_smartstore_sales(uuid, text, jsonb, text)
to service_role;
