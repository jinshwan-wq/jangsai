-- v9: 쿠팡 09:30 매출 선제출, 12:40 방문자 후속 병합
-- 1) accept_grok_bridge_submission: 매출만 제출 시 visits=NULL 유지, 기존 매출을 0으로 덮어쓰지 않음
-- 2) 매출 완성도를 방문자와 분리하여 대시보드에 조기 반영
-- 3) reported_total_revenue 재계산
-- 4) marketing_okr_rollups 뷰: 매출이 있으면 방문자 없어도 집계

-- Update accept_grok_bridge_submission to handle sales_only flag
create or replace function public.accept_grok_bridge_submission(
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
    run_id uuid;
    metric jsonb;
    target_product_id uuid;
    product_slug text;
    expected_slugs text[];
    submitted_slugs text[];
    source_details jsonb;
    metric_count integer;
    has_other_login_error boolean;
    is_sales_only boolean;
    existing_wing_visits integer;
    existing_growth_visits integer;
    existing_wing_orders integer;
    existing_growth_orders integer;
    existing_wing_revenue bigint;
    existing_growth_revenue bigint;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;
    if p_submission_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid submission hash';
    end if;

    select jobs.* into job
    from public.marketing_bridge_jobs jobs
    where jobs.id = p_job_id
      and jobs.client_key = p_client_key
    for update;
    if job.id is null then raise exception 'bridge job not found'; end if;

    if job.status = 'completed' then
        if job.submission_hash = p_submission_hash then
            return job.result || jsonb_build_object('already_completed', true);
        end if;
        raise exception 'idempotency conflict';
    end if;
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
        from jsonb_array_elements(coalesce(p_submission -> 'metrics', '[]'::jsonb)) element
    ) submitted;
    if submitted_slugs is distinct from expected_slugs then
        raise exception 'submitted product set does not match account';
    end if;
    metric_count := jsonb_array_length(p_submission -> 'metrics');
    if metric_count <> 2 then raise exception 'exactly two product metrics are required'; end if;

    is_sales_only := coalesce((p_submission ->> 'sales_only')::boolean, false);

    insert into public.marketing_ingestion_runs (
        provider,
        metric_date,
        details
    )
    values (
        job.provider,
        job.metric_date,
        jsonb_build_object(
            'trigger', 'grok_bridge',
            'collector', 'grok_marketing_ops',
            'account', job.account,
            'job_id', job.id,
            'submission_hash', p_submission_hash,
            'sales_only', is_sales_only
        )
    )
    returning id into run_id;

    source_details := jsonb_build_object(
        'provider', job.provider,
        'collector', 'grok_bot_bridge',
        'account', job.account,
        'bridge_job_id', job.id,
        'submission_hash', p_submission_hash,
        'source_totals', coalesce(p_submission -> 'source_totals', '{}'::jsonb),
        'unmapped', coalesce(p_submission -> 'unmapped', '[]'::jsonb),
        'collected_at', now(),
        'sales_only', is_sales_only
    );

    for metric in
        select value from jsonb_array_elements(p_submission -> 'metrics')
    loop
        product_slug := metric ->> 'product_slug';
        select products.id into target_product_id
        from public.marketing_products products
        where products.slug = product_slug
          and products.is_active;
        if target_product_id is null then raise exception 'marketing product not found: %', product_slug; end if;

        if job.provider = 'smartstore' then
            insert into public.daily_marketing_metrics (
                product_id,
                metric_date,
                smartstore_visits,
                smartstore_pay_count,
                smartstore_conversion_rate,
                data_completeness,
                source,
                source_details,
                collection_status,
                collected_at
            )
            values (
                target_product_id,
                job.metric_date,
                (metric ->> 'visits')::integer,
                (metric ->> 'pay_count')::integer,
                (metric ->> 'conversion_rate')::numeric,
                jsonb_build_object(
                    'smartstore_visits', true,
                    'smartstore_pay_count', true,
                    'smartstore_conversion_rate', true
                ),
                'api',
                jsonb_build_object('grok_bridge', source_details),
                'partial',
                now()
            )
            on conflict (product_id, metric_date) do update
            set smartstore_visits = excluded.smartstore_visits,
                smartstore_pay_count = excluded.smartstore_pay_count,
                smartstore_conversion_rate = excluded.smartstore_conversion_rate,
                data_completeness = coalesce(daily_marketing_metrics.data_completeness, '{}'::jsonb) ||
                    excluded.data_completeness,
                source = 'api',
                source_details = coalesce(daily_marketing_metrics.source_details, '{}'::jsonb) ||
                    excluded.source_details,
                collection_status = 'partial',
                collected_at = now(),
                updated_at = now();

        elsif job.provider = 'coupang' and is_sales_only then
            -- Sales-only: write orders+revenue, preserve existing visits (NULL stays NULL)
            select
                m.coupang_wing_visits,
                m.coupang_growth_visits,
                m.coupang_wing_orders,
                m.coupang_growth_orders,
                m.coupang_wing_revenue,
                m.coupang_growth_revenue
            into
                existing_wing_visits,
                existing_growth_visits,
                existing_wing_orders,
                existing_growth_orders,
                existing_wing_revenue,
                existing_growth_revenue
            from public.daily_marketing_metrics m
            where m.product_id = target_product_id
              and m.metric_date = job.metric_date;

            insert into public.daily_marketing_metrics (
                product_id,
                metric_date,
                coupang_wing_orders,
                coupang_wing_revenue,
                coupang_growth_orders,
                coupang_growth_revenue,
                coupang_orders,
                coupang_revenue,
                data_completeness,
                source,
                source_details,
                collection_status,
                collected_at
            )
            values (
                target_product_id,
                job.metric_date,
                (metric #>> '{wing,orders}')::integer,
                (metric #>> '{wing,revenue}')::bigint,
                (metric #>> '{growth,orders}')::integer,
                (metric #>> '{growth,revenue}')::bigint,
                greatest(0, (metric #>> '{wing,orders}')::integer + (metric #>> '{growth,orders}')::integer),
                greatest(0, (metric #>> '{wing,revenue}')::bigint + (metric #>> '{growth,revenue}')::bigint),
                jsonb_build_object(
                    'coupang_wing_orders', true,
                    'coupang_wing_revenue', true,
                    'coupang_growth_orders', true,
                    'coupang_growth_revenue', true,
                    'coupang_orders', true,
                    'coupang_revenue', true
                ),
                'api',
                jsonb_build_object('grok_bridge', source_details),
                'partial',
                now()
            )
            on conflict (product_id, metric_date) do update
            set coupang_wing_orders = excluded.coupang_wing_orders,
                coupang_wing_revenue = excluded.coupang_wing_revenue,
                coupang_growth_orders = excluded.coupang_growth_orders,
                coupang_growth_revenue = excluded.coupang_growth_revenue,
                coupang_orders = excluded.coupang_orders,
                coupang_revenue = excluded.coupang_revenue,
                data_completeness = coalesce(daily_marketing_metrics.data_completeness, '{}'::jsonb) ||
                    excluded.data_completeness,
                source = 'api',
                source_details = coalesce(daily_marketing_metrics.source_details, '{}'::jsonb) ||
                    excluded.source_details,
                collection_status = 'partial',
                collected_at = now(),
                updated_at = now();

        elsif job.provider = 'coupang' then
            -- Full submit: write everything including visits
            -- Do not overwrite existing good sales with zeros
            select
                m.coupang_wing_orders,
                m.coupang_growth_orders,
                m.coupang_wing_revenue,
                m.coupang_growth_revenue
            into
                existing_wing_orders,
                existing_growth_orders,
                existing_wing_revenue,
                existing_growth_revenue
            from public.daily_marketing_metrics m
            where m.product_id = target_product_id
              and m.metric_date = job.metric_date;

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
                collected_at
            )
            values (
                target_product_id,
                job.metric_date,
                (metric #>> '{wing,visits}')::integer,
                (metric #>> '{wing,orders}')::integer,
                (metric #>> '{wing,revenue}')::bigint,
                (metric #>> '{growth,visits}')::integer,
                (metric #>> '{growth,orders}')::integer,
                (metric #>> '{growth,revenue}')::bigint,
                (metric #>> '{wing,visits}')::integer + (metric #>> '{growth,visits}')::integer,
                greatest(0, (metric #>> '{wing,orders}')::integer + (metric #>> '{growth,orders}')::integer),
                greatest(0, (metric #>> '{wing,revenue}')::bigint + (metric #>> '{growth,revenue}')::bigint),
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
                'api',
                jsonb_build_object('grok_bridge', source_details),
                'partial',
                now()
            )
            on conflict (product_id, metric_date) do update
            set coupang_wing_visits = excluded.coupang_wing_visits,
                coupang_wing_orders = case
                    when (metric #>> '{wing,orders}')::integer = 0
                     and coalesce(existing_wing_orders, 0) > 0
                    then daily_marketing_metrics.coupang_wing_orders
                    else excluded.coupang_wing_orders
                end,
                coupang_wing_revenue = case
                    when (metric #>> '{wing,revenue}')::bigint = 0
                     and coalesce(existing_wing_revenue, 0) > 0
                    then daily_marketing_metrics.coupang_wing_revenue
                    else excluded.coupang_wing_revenue
                end,
                coupang_growth_visits = excluded.coupang_growth_visits,
                coupang_growth_orders = case
                    when (metric #>> '{growth,orders}')::integer = 0
                     and coalesce(existing_growth_orders, 0) > 0
                    then daily_marketing_metrics.coupang_growth_orders
                    else excluded.coupang_growth_orders
                end,
                coupang_growth_revenue = case
                    when (metric #>> '{growth,revenue}')::bigint = 0
                     and coalesce(existing_growth_revenue, 0) > 0
                    then daily_marketing_metrics.coupang_growth_revenue
                    else excluded.coupang_growth_revenue
                end,
                coupang_visits = excluded.coupang_visits,
                coupang_orders = greatest(0,
                    case when (metric #>> '{wing,orders}')::integer = 0 and coalesce(existing_wing_orders, 0) > 0
                         then daily_marketing_metrics.coupang_wing_orders else excluded.coupang_wing_orders end
                    +
                    case when (metric #>> '{growth,orders}')::integer = 0 and coalesce(existing_growth_orders, 0) > 0
                         then daily_marketing_metrics.coupang_growth_orders else excluded.coupang_growth_orders end
                ),
                coupang_revenue = greatest(0,
                    case when (metric #>> '{wing,revenue}')::bigint = 0 and coalesce(existing_wing_revenue, 0) > 0
                         then daily_marketing_metrics.coupang_wing_revenue else excluded.coupang_wing_revenue end
                    +
                    case when (metric #>> '{growth,revenue}')::bigint = 0 and coalesce(existing_growth_revenue, 0) > 0
                         then daily_marketing_metrics.coupang_growth_revenue else excluded.coupang_growth_revenue end
                ),
                data_completeness = coalesce(daily_marketing_metrics.data_completeness, '{}'::jsonb) ||
                    excluded.data_completeness,
                source = 'api',
                source_details = coalesce(daily_marketing_metrics.source_details, '{}'::jsonb) ||
                    excluded.source_details,
                collection_status = 'partial',
                collected_at = now(),
                updated_at = now();
        else
            raise exception 'unsupported bridge provider';
        end if;
    end loop;

    update public.marketing_ingestion_runs runs
    set status = 'success',
        finished_at = now(),
        records_succeeded = metric_count,
        records_failed = 0,
        details = runs.details || jsonb_build_object(
            'source_totals', coalesce(p_submission -> 'source_totals', '{}'::jsonb),
            'unmapped', coalesce(p_submission -> 'unmapped', '[]'::jsonb)
        )
    where runs.id = run_id;

    -- Mark job completed only for sales_only if visits are still missing;
    -- otherwise fully completed
    update public.marketing_bridge_jobs jobs
    set status = 'completed',
        result = jsonb_build_object(
            'verified', true,
            'records', metric_count,
            'source_totals', coalesce(p_submission -> 'source_totals', '{}'::jsonb),
            'unmapped', coalesce(p_submission -> 'unmapped', '[]'::jsonb),
            'sales_only', is_sales_only
        ),
        submission_hash = p_submission_hash,
        latest_run_id = run_id,
        last_error = null,
        lease_expires_at = null,
        completed_at = now(),
        updated_at = now()
    where jobs.id = job.id;

    select exists (
        select 1
        from public.marketing_bridge_jobs jobs
        where jobs.client_key = p_client_key
          and jobs.status = 'needs_login'
          and jobs.id <> job.id
    ) into has_other_login_error;

    update public.marketing_bridge_clients clients
    set status = case when has_other_login_error then 'needs_login' else 'success' end,
        last_seen_at = now(),
        last_success_at = now(),
        last_error = case when has_other_login_error then clients.last_error else null end,
        details = jsonb_build_object(
            'last_job_id', job.id,
            'provider', job.provider,
            'account', job.account,
            'sales_only', is_sales_only
        ),
        updated_at = now()
    where clients.client_key = p_client_key;

    return jsonb_build_object(
        'verified', true,
        'records', metric_count,
        'job_id', job.id,
        'run_id', run_id,
        'sales_only', is_sales_only
    );
end;
$$;

-- Update coupang completeness check in enqueue function to separate sales vs visits
create or replace function public.enqueue_grok_marketing_jobs(
    p_provider text default null,
    p_metric_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    target_date date := coalesce(
        p_metric_date,
        timezone('Asia/Seoul', now())::date - 1
    );
    provider_name text;
    account_name text;
    has_missing boolean;
    queued_count integer := 0;
    completed_count integer := 0;
begin
    if p_provider is not null and p_provider not in ('smartstore', 'coupang') then
        raise exception 'unsupported Grok provider';
    end if;
    if target_date >= timezone('Asia/Seoul', now())::date
       or target_date < timezone('Asia/Seoul', now())::date - 90 then
        raise exception 'metric date is outside the allowed range';
    end if;

    for provider_name in
        select value
        from unnest(
            case
                when p_provider is null then array['smartstore', 'coupang']::text[]
                else array[p_provider]::text[]
            end
        ) providers(value)
    loop
        foreach account_name in array array['innerium', 'yural']::text[]
        loop
            select exists (
                select 1
                from (
                    values
                        ('innerium', 'innerium-gala431'),
                        ('innerium', 'innerium-minti431'),
                        ('yural', 'yural-tonggam-cream'),
                        ('yural', 'yural-myeongga-bonhwan')
                ) expected(account, product_slug)
                left join public.marketing_products products
                  on products.slug = expected.product_slug
                 and products.is_active
                left join public.daily_marketing_metrics metrics
                  on metrics.product_id = products.id
                 and metrics.metric_date = target_date
                where expected.account = account_name
                  and (
                    metrics.id is null
                    or case provider_name
                        when 'smartstore' then not coalesce((
                            metrics.data_completeness -> 'smartstore_visits' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_pay_count' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_conversion_rate' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_orders' = 'true'::jsonb
                            and metrics.data_completeness -> 'smartstore_revenue' = 'true'::jsonb
                        ), false)
                        else not coalesce((
                            metrics.data_completeness -> 'coupang_wing_orders' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_wing_revenue' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_growth_orders' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_growth_revenue' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_wing_visits' = 'true'::jsonb
                            and metrics.data_completeness -> 'coupang_growth_visits' = 'true'::jsonb
                        ), false)
                    end
                  )
            )
            into has_missing;

            if has_missing then
                insert into public.marketing_bridge_jobs (
                    client_key,
                    provider,
                    account,
                    metric_date,
                    task_type,
                    status,
                    payload
                )
                values (
                    'grok-marketing-ops',
                    provider_name,
                    account_name,
                    target_date,
                    'collect',
                    'pending',
                    jsonb_build_object(
                        'provider', provider_name,
                        'account', account_name,
                        'metric_date', target_date,
                        'task_type', 'collect',
                        'queue_source', 'server_cron'
                    )
                )
                on conflict (client_key, provider, account, metric_date, task_type)
                do update
                set
                    payload = excluded.payload,
                    status = case
                        when marketing_bridge_jobs.status = 'needs_login'
                            then 'needs_login'
                        when marketing_bridge_jobs.status = 'claimed'
                         and coalesce(marketing_bridge_jobs.lease_expires_at, '-infinity'::timestamptz) > now()
                            then 'claimed'
                        when marketing_bridge_jobs.status = 'failed'
                         and marketing_bridge_jobs.attempts >= 3
                            then 'failed'
                        when marketing_bridge_jobs.status = 'completed'
                            then 'pending'
                        else 'pending'
                    end,
                    claimed_at = case
                        when marketing_bridge_jobs.status = 'claimed'
                         and coalesce(marketing_bridge_jobs.lease_expires_at, '-infinity'::timestamptz) > now()
                            then marketing_bridge_jobs.claimed_at
                        else null
                    end,
                    lease_expires_at = case
                        when marketing_bridge_jobs.status = 'claimed'
                         and coalesce(marketing_bridge_jobs.lease_expires_at, '-infinity'::timestamptz) > now()
                            then marketing_bridge_jobs.lease_expires_at
                        else null
                    end,
                    completed_at = null,
                    updated_at = now();
                queued_count := queued_count + 1;
            else
                update public.marketing_bridge_jobs
                set
                    status = 'completed',
                    result = jsonb_build_object(
                        'verified', true,
                        'completion_source', 'server_queue_existing_data'
                    ),
                    last_error = null,
                    lease_expires_at = null,
                    completed_at = coalesce(completed_at, now()),
                    updated_at = now()
                where client_key = 'grok-marketing-ops'
                  and provider = provider_name
                  and account = account_name
                  and metric_date = target_date
                  and task_type = 'collect'
                  and status <> 'completed';
                if found then completed_count := completed_count + 1; end if;
            end if;
        end loop;
    end loop;

    return jsonb_build_object(
        'metric_date', target_date,
        'provider', p_provider,
        'queued', queued_count,
        'completed_from_existing_data', completed_count
    );
end;
$$;

-- Update marketing_okr_rollups view:
-- Revenue should count even when visits are NULL (sales-only submit)
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

-- Schedule: 09:30 KST for smartstore+coupang sales, 12:40 KST for coupang visits
-- Coupang jobs should be queued at 09:30 too (not just 12:40)
do $$
declare
    existing_job bigint;
begin
    for existing_job in
        select jobid
        from cron.job
        where jobname in (
            'grok-smartstore-backlog-0925-kst',
            'grok-coupang-backlog-1235-kst',
            'grok-final-backlog-1300-kst',
            'grok-smartstore-queue-0950-kst',
            'grok-coupang-queue-1240-kst',
            'grok-final-queue-1400-kst'
        )
    loop
        perform cron.unschedule(existing_job);
    end loop;

    -- 09:25 KST (00:25 UTC): smartstore backlog
    perform cron.schedule(
        'grok-smartstore-backlog-0925-kst',
        '25 0 * * *',
        'select public.enqueue_grok_marketing_backlog(''smartstore'', 7);'
    );
    -- 09:25 KST (00:25 UTC): coupang backlog (sales available at 09:30)
    perform cron.schedule(
        'grok-coupang-backlog-0925-kst',
        '25 0 * * *',
        'select public.enqueue_grok_marketing_backlog(''coupang'', 7);'
    );
    -- 09:50 KST (00:50 UTC): smartstore queue
    perform cron.schedule(
        'grok-smartstore-queue-0950-kst',
        '50 0 * * *',
        'select public.enqueue_grok_marketing_jobs(''smartstore'');'
    );
    -- 09:50 KST (00:50 UTC): coupang queue (sales available)
    perform cron.schedule(
        'grok-coupang-queue-0950-kst',
        '50 0 * * *',
        'select public.enqueue_grok_marketing_jobs(''coupang'');'
    );
    -- 12:35 KST (03:35 UTC): coupang backlog (visits now available)
    perform cron.schedule(
        'grok-coupang-backlog-1235-kst',
        '35 3 * * *',
        'select public.enqueue_grok_marketing_backlog(''coupang'', 7);'
    );
    -- 12:40 KST (03:40 UTC): coupang queue (visits now available)
    perform cron.schedule(
        'grok-coupang-queue-1240-kst',
        '40 3 * * *',
        'select public.enqueue_grok_marketing_jobs(''coupang'');'
    );
    -- 13:00 KST (04:00 UTC): final sweep
    perform cron.schedule(
        'grok-final-backlog-1300-kst',
        '0 4 * * *',
        'select public.enqueue_grok_marketing_backlog(null, 7);'
    );
    perform cron.schedule(
        'grok-final-queue-1400-kst',
        '0 5 * * *',
        'select public.enqueue_grok_marketing_jobs();'
    );
end;
$$;

-- Queue coupang jobs immediately on deploy (sales-ready at 09:30)
select public.enqueue_grok_marketing_jobs('coupang');
