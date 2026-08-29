-- Grok Bridge 제출과 실행 이력·작업 완료를 한 트랜잭션으로 처리한다.
alter table public.marketing_bridge_jobs
    add column if not exists lease_expires_at timestamptz,
    add column if not exists submission_hash text,
    add column if not exists latest_run_id uuid
        references public.marketing_ingestion_runs(id) on delete set null;

create or replace function public.claim_grok_bridge_job(
    p_job_id uuid,
    p_client_key text
)
returns public.marketing_bridge_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
    result public.marketing_bridge_jobs;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;

    update public.marketing_bridge_jobs jobs
    set status = 'claimed',
        attempts = jobs.attempts + 1,
        claimed_at = now(),
        lease_expires_at = now() + interval '30 minutes',
        last_error = null,
        updated_at = now()
    where jobs.id = p_job_id
      and jobs.client_key = p_client_key
      and (
          jobs.status in ('pending', 'failed', 'needs_login')
          or (jobs.status = 'claimed' and coalesce(jobs.lease_expires_at, jobs.claimed_at) < now())
      )
    returning jobs.* into result;

    if result.id is null then
        select jobs.* into result
        from public.marketing_bridge_jobs jobs
        where jobs.id = p_job_id
          and jobs.client_key = p_client_key;
    end if;
    if result.id is null then raise exception 'bridge job not found'; end if;
    if result.status not in ('claimed', 'completed') then
        raise exception 'bridge job cannot be claimed';
    end if;
    return result;
end;
$$;

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
            'submission_hash', p_submission_hash
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
        'collected_at', now()
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
        elsif job.provider = 'coupang' then
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
                coupang_wing_orders = excluded.coupang_wing_orders,
                coupang_wing_revenue = excluded.coupang_wing_revenue,
                coupang_growth_visits = excluded.coupang_growth_visits,
                coupang_growth_orders = excluded.coupang_growth_orders,
                coupang_growth_revenue = excluded.coupang_growth_revenue,
                coupang_visits = excluded.coupang_visits,
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

    update public.marketing_bridge_jobs jobs
    set status = 'completed',
        result = jsonb_build_object(
            'verified', true,
            'records', metric_count,
            'source_totals', coalesce(p_submission -> 'source_totals', '{}'::jsonb),
            'unmapped', coalesce(p_submission -> 'unmapped', '[]'::jsonb)
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
            'account', job.account
        ),
        updated_at = now()
    where clients.client_key = p_client_key;

    return jsonb_build_object(
        'verified', true,
        'records', metric_count,
        'job_id', job.id,
        'run_id', run_id
    );
end;
$$;

create or replace function public.fail_grok_bridge_job(
    p_job_id uuid,
    p_client_key text,
    p_error_code text,
    p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    job public.marketing_bridge_jobs;
    run_id uuid;
    target_status text;
    safe_message text := left(trim(coalesce(p_message, 'Grok Bot 수집 실패')), 500);
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
        raise exception 'not authorized';
    end if;
    select jobs.* into job
    from public.marketing_bridge_jobs jobs
    where jobs.id = p_job_id
      and jobs.client_key = p_client_key
    for update;
    if job.id is null then raise exception 'bridge job not found'; end if;

    target_status := case
        when p_error_code in ('LOGIN_EXPIRED', 'CAPTCHA_REQUIRED', 'MFA_REQUIRED')
            then 'needs_login'
        else 'failed'
    end;
    if job.status = target_status and job.last_error = safe_message then
        return jsonb_build_object('job_id', job.id, 'status', target_status, 'duplicate', true);
    end if;

    insert into public.marketing_ingestion_runs (
        provider,
        metric_date,
        status,
        finished_at,
        records_failed,
        error_message,
        details
    )
    values (
        job.provider,
        job.metric_date,
        'failed',
        now(),
        1,
        safe_message,
        jsonb_build_object(
            'trigger', 'grok_bridge',
            'collector', 'grok_marketing_ops',
            'account', job.account,
            'job_id', job.id,
            'error_code', left(coalesce(p_error_code, 'COLLECTION_FAILED'), 80),
            'errors', jsonb_build_array(safe_message)
        )
    )
    returning id into run_id;

    insert into public.marketing_ingestion_errors (
        run_id,
        provider,
        error_code,
        message,
        details
    )
    values (
        run_id,
        job.provider,
        left(coalesce(p_error_code, 'COLLECTION_FAILED'), 80),
        safe_message,
        jsonb_build_object('account', job.account, 'bridge_job_id', job.id)
    );

    update public.marketing_bridge_jobs jobs
    set status = target_status,
        last_error = safe_message,
        result = jsonb_build_object('error_code', left(coalesce(p_error_code, 'COLLECTION_FAILED'), 80)),
        latest_run_id = run_id,
        lease_expires_at = null,
        updated_at = now()
    where jobs.id = job.id;

    update public.marketing_bridge_clients clients
    set status = case when target_status = 'needs_login' then 'needs_login' else 'error' end,
        last_seen_at = now(),
        last_error = safe_message,
        details = jsonb_build_object(
            'last_job_id', job.id,
            'provider', job.provider,
            'account', job.account,
            'error_code', left(coalesce(p_error_code, 'COLLECTION_FAILED'), 80)
        ),
        updated_at = now()
    where clients.client_key = p_client_key;

    return jsonb_build_object('job_id', job.id, 'status', target_status, 'run_id', run_id);
end;
$$;

revoke all on function public.claim_grok_bridge_job(uuid, text) from public, anon, authenticated;
revoke all on function public.accept_grok_bridge_submission(uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.fail_grok_bridge_job(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_grok_bridge_job(uuid, text) to service_role;
grant execute on function public.accept_grok_bridge_submission(uuid, text, jsonb, text) to service_role;
grant execute on function public.fail_grok_bridge_job(uuid, text, text, text) to service_role;

-- 자동 수집 실행과 API provenance 기록은 일반 로그인 사용자가 직접 위조할 수 없게 한다.
revoke all on function public.invoke_marketing_collector() from public, anon, authenticated;
grant execute on function public.invoke_marketing_collector() to service_role;
revoke all on function public.merge_daily_smartstore_analytics(
    uuid, date, integer, integer, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.merge_daily_smartstore_analytics(
    uuid, date, integer, integer, numeric, jsonb
) to service_role;
