-- 1.6만 건을 제품별 반복 쿼리로 처리하던 집계를 한 번의 set-based 처리로 바꾼다.
-- 동일 날짜 재실행 시 기존 일 증가분을 보존하며, 트랜잭션 전체가 성공해야 상태를 전진시킨다.
create or replace function public.finalize_naver_cafe_collection(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
    run_record public.marketing_ingestion_runs;
    expected_product_count integer;
    resolved_product_count integer;
    product_result record;
    all_complete boolean;
    total_succeeded integer;
    total_failed integer;
    product_results jsonb;
    finalize_result jsonb;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'service role required';
    end if;

    select *
    into run_record
    from public.marketing_ingestion_runs
    where id = p_run_id
      and provider = 'naver_cafe'
    for update;

    if run_record.id is null then
        raise exception 'naver cafe collection run not found';
    end if;
    if run_record.status <> 'running' then
        return coalesce(run_record.details -> 'finalize_result', run_record.details);
    end if;
    if jsonb_typeof(run_record.details -> 'expected_by_product') <> 'object' then
        raise exception 'expected product counts are missing';
    end if;

    select count(*)::integer
    into expected_product_count
    from jsonb_each_text(run_record.details -> 'expected_by_product');

    select count(*)::integer
    into resolved_product_count
    from jsonb_each_text(run_record.details -> 'expected_by_product') expected
    join public.marketing_products products
      on products.slug = expected.key
     and products.is_active
    where expected.value ~ '^[1-9][0-9]*$';

    if expected_product_count = 0 or resolved_product_count <> expected_product_count then
        raise exception 'expected products are invalid or inactive';
    end if;

    create temporary table cafe_finalize_rows on commit drop as
    select
        state.product_id,
        state.content_id,
        observations.cumulative_views,
        observations.observed_at,
        coalesce(observations.menu_id, state.menu_id) as menu_id,
        case
            when state.last_metric_date = run_record.metric_date
                 and existing.content_id is not null
                then existing.views
            when state.last_cumulative_views is null then 0
            when state.last_observed_at is null
                 or observations.observed_at - state.last_observed_at > interval '30 hours'
                then 0
            when observations.cumulative_views < state.last_cumulative_views then 0
            else (observations.cumulative_views - state.last_cumulative_views)::integer
        end as views,
        case
            when state.last_metric_date = run_record.metric_date
                 and existing.content_id is not null
                then existing.collection_status
            when state.last_cumulative_views is null then 'baseline'
            when state.last_observed_at is null
                 or observations.observed_at - state.last_observed_at > interval '30 hours'
                then 'gap'
            when observations.cumulative_views < state.last_cumulative_views then 'decrease'
            else 'complete'
        end as collection_status,
        state.cafe_id,
        state.article_id
    from public.marketing_cafe_article_state state
    join public.marketing_cafe_observations observations
      on observations.run_id = p_run_id
     and observations.product_id = state.product_id
     and observations.cafe_id = state.cafe_id
     and observations.article_id = state.article_id
     and observations.cumulative_views is not null
     and observations.error_code is null
    left join public.daily_content_metrics existing
      on existing.content_id = state.content_id
     and existing.metric_date = run_record.metric_date
    where state.last_seen_run_id = p_run_id;

    create index on cafe_finalize_rows (product_id);

    insert into public.daily_content_metrics (
        content_id,
        metric_date,
        views,
        cumulative_views,
        source,
        collection_status,
        source_details,
        updated_at
    )
    select
        rows.content_id,
        run_record.metric_date,
        rows.views,
        rows.cumulative_views,
        'api',
        rows.collection_status,
        jsonb_build_object(
            'provider', 'naver_cafe',
            'run_id', p_run_id,
            'cafe_id', rows.cafe_id,
            'article_id', rows.article_id,
            'menu_id', rows.menu_id,
            'observed_at', rows.observed_at
        ),
        now()
    from cafe_finalize_rows rows
    on conflict (content_id, metric_date) do update
    set
        views = excluded.views,
        cumulative_views = excluded.cumulative_views,
        source = 'api',
        collection_status = excluded.collection_status,
        source_details = coalesce(public.daily_content_metrics.source_details, '{}'::jsonb)
            || excluded.source_details,
        updated_at = now();

    create temporary table cafe_finalize_products on commit drop as
    with expected as (
        select
            products.id as product_id,
            products.slug as product_slug,
            products.sort_order,
            expected.value::integer as expected_count
        from jsonb_each_text(run_record.details -> 'expected_by_product') expected
        join public.marketing_products products
          on products.slug = expected.key
         and products.is_active
    ),
    source_counts as (
        select state.product_id, count(*)::integer as source_count
        from public.marketing_cafe_article_state state
        where state.last_seen_run_id = p_run_id
        group by state.product_id
    ),
    observed_stats as (
        select
            rows.product_id,
            count(*)::integer as observed_count,
            count(*) filter (where rows.collection_status = 'baseline')::integer as baseline_count,
            count(*) filter (
                where rows.collection_status in ('gap', 'decrease', 'error', 'missing')
            )::integer as invalid_count,
            coalesce(sum(rows.views) filter (
                where rows.collection_status in ('complete', 'baseline')
            ), 0)::bigint as product_delta
        from cafe_finalize_rows rows
        group by rows.product_id
    )
    select
        expected.product_id,
        expected.product_slug,
        expected.sort_order,
        expected.expected_count,
        coalesce(source_counts.source_count, 0)::integer as source_count,
        coalesce(observed_stats.observed_count, 0)::integer as observed_count,
        coalesce(observed_stats.baseline_count, 0)::integer as baseline_count,
        coalesce(observed_stats.invalid_count, 0)::integer as invalid_count,
        greatest(
            expected.expected_count - coalesce(observed_stats.observed_count, 0),
            0
        )::integer as missing_count,
        coalesce(observed_stats.product_delta, 0)::bigint as product_delta,
        (
            coalesce(source_counts.source_count, 0) = expected.expected_count
            and coalesce(observed_stats.observed_count, 0) = expected.expected_count
            and coalesce(observed_stats.invalid_count, 0) = 0
        ) as product_complete
    from expected
    left join source_counts using (product_id)
    left join observed_stats using (product_id);

    update public.marketing_cafe_article_state state
    set
        menu_id = coalesce(observations.menu_id, state.menu_id),
        last_cumulative_views = observations.cumulative_views,
        last_observed_at = observations.observed_at,
        last_metric_date = run_record.metric_date,
        consecutive_errors = 0,
        last_error = null,
        is_active = true,
        updated_at = now()
    from public.marketing_cafe_observations observations
    where observations.run_id = p_run_id
      and observations.cumulative_views is not null
      and observations.error_code is null
      and state.product_id = observations.product_id
      and state.cafe_id = observations.cafe_id
      and state.article_id = observations.article_id;

    update public.marketing_cafe_article_state state
    set
        consecutive_errors = state.consecutive_errors + 1,
        last_error = observations.error_message,
        updated_at = now()
    from public.marketing_cafe_observations observations
    where observations.run_id = p_run_id
      and observations.error_code is not null
      and state.product_id = observations.product_id
      and state.cafe_id = observations.cafe_id
      and state.article_id = observations.article_id;

    update public.marketing_cafe_article_state state
    set
        is_active = (state.last_seen_run_id = p_run_id),
        updated_at = now()
    from cafe_finalize_products products
    where state.product_id = products.product_id
      and products.source_count = products.expected_count
      and state.is_active <> (state.last_seen_run_id = p_run_id);

    update public.marketing_contents contents
    set is_active = state.is_active
    from public.marketing_cafe_article_state state
    join cafe_finalize_products products
      on products.product_id = state.product_id
     and products.source_count = products.expected_count
    where contents.id = state.content_id
      and contents.is_active <> state.is_active;

    for product_result in
        select * from cafe_finalize_products order by sort_order
    loop
        if product_result.product_complete then
            perform public.merge_daily_marketing_metric(
                product_result.product_id,
                run_record.metric_date,
                jsonb_build_object(
                    'cafe_views', product_result.product_delta,
                    'data_completeness', jsonb_build_object('cafe_views', true)
                ),
                'api',
                jsonb_build_object(
                    'naver_cafe',
                    jsonb_build_object(
                        'provider', 'naver_cafe',
                        'run_id', p_run_id,
                        'expected_count', product_result.expected_count,
                        'observed_count', product_result.observed_count,
                        'baseline_count', product_result.baseline_count
                    )
                ),
                'partial'
            );
        end if;
    end loop;

    select
        coalesce(bool_and(product_complete), false),
        coalesce(sum(greatest(observed_count - invalid_count, 0)), 0)::integer,
        coalesce(sum(missing_count + invalid_count), 0)::integer,
        coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'product_slug', product_slug,
                    'expected_count', expected_count,
                    'source_count', source_count,
                    'observed_count', observed_count,
                    'baseline_count', baseline_count,
                    'invalid_count', invalid_count,
                    'missing_count', missing_count,
                    'cafe_views', case when product_complete then product_delta else null end,
                    'complete', product_complete
                )
                order by sort_order
            ),
            '[]'::jsonb
        )
    into all_complete, total_succeeded, total_failed, product_results
    from cafe_finalize_products;

    finalize_result := jsonb_build_object(
        'run_id', p_run_id,
        'metric_date', run_record.metric_date,
        'status', case when all_complete then 'success' else 'partial' end,
        'products', product_results,
        'records_succeeded', total_succeeded,
        'records_failed', total_failed
    );

    update public.marketing_ingestion_runs
    set
        status = case when all_complete then 'success' else 'partial' end,
        finished_at = now(),
        records_succeeded = greatest(total_succeeded, 0),
        records_failed = greatest(total_failed, 0),
        details = details || jsonb_build_object('finalize_result', finalize_result),
        error_message = case
            when all_complete then null
            else '일부 카페 글의 스냅샷 또는 정상 차분이 누락되었습니다.'
        end
    where id = p_run_id;

    if run_record.batch_id is not null then
        update public.marketing_ingestion_batches
        set
            status = case when all_complete then 'success' else 'partial' end,
            finished_at = now(),
            details = details || jsonb_build_object('naver_cafe', finalize_result)
        where id = run_record.batch_id;
    end if;

    return finalize_result;
end;
$$;

revoke all on function public.finalize_naver_cafe_collection(uuid)
from public, anon, authenticated;
grant execute on function public.finalize_naver_cafe_collection(uuid)
to service_role;
