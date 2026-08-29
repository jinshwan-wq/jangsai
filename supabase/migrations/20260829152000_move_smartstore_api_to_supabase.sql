-- 스마트스토어 주문·매출 API 수집을 Windows PC에서 Supabase Edge로 이전한다.
do $$
begin
    if not exists (
        select 1
        from vault.decrypted_secrets
        where name = 'smartstore_api_collector_url'
    ) then
        perform vault.create_secret(
            'https://pfmrqsfmkdnhzjimqocr.supabase.co/functions/v1/collect-smartstore-api',
            'smartstore_api_collector_url',
            '스마트스토어 주문·매출 서버 수집 Edge Function URL'
        );
    end if;
end;
$$;

create or replace function public.invoke_smartstore_api_collector(
    p_metric_date date default null,
    p_force boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
    collector_url text;
    collector_token text;
    target_date date := coalesce(
        p_metric_date,
        timezone('Asia/Seoul', now())::date - 1
    );
    complete_products integer;
    request_id bigint;
begin
    if target_date >= timezone('Asia/Seoul', now())::date
       or target_date < timezone('Asia/Seoul', now())::date - 180 then
        raise exception 'smartstore collection date must be within the previous 180 days';
    end if;

    if not p_force then
        select count(*)
        into complete_products
        from public.marketing_products products
        join public.daily_marketing_metrics metrics
          on metrics.product_id = products.id
         and metrics.metric_date = target_date
        where products.slug in (
            'innerium-gala431',
            'innerium-minti431',
            'yural-tonggam-cream',
            'yural-myeongga-bonhwan'
        )
          and coalesce((metrics.data_completeness ->> 'smartstore_orders')::boolean, false)
          and coalesce((metrics.data_completeness ->> 'smartstore_revenue')::boolean, false);

        if complete_products = 4 then
            return null;
        end if;
    end if;

    select decrypted_secret
    into collector_url
    from vault.decrypted_secrets
    where name = 'smartstore_api_collector_url'
    limit 1;

    select decrypted_secret
    into collector_token
    from vault.decrypted_secrets
    where name = 'marketing_collector_token'
    limit 1;

    if collector_url is null or collector_token is null then
        raise exception 'smartstore API collector Vault secrets are not configured';
    end if;

    select net.http_post(
        url := collector_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-collector-secret', collector_token
        ),
        body := jsonb_build_object(
            'metric_date', target_date::text,
            'trigger', case when p_force then 'forced_recovery' else 'cron' end
        ),
        timeout_milliseconds := 120000
    ) into request_id;

    return request_id;
end;
$$;

revoke all on function public.invoke_smartstore_api_collector(date, boolean)
from public, anon, authenticated;
grant execute on function public.invoke_smartstore_api_collector(date, boolean)
to service_role;

do $$
declare
    existing_job bigint;
begin
    select jobid into existing_job
    from cron.job where jobname = 'smartstore-api-0910-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'smartstore-api-0910-kst',
        '10 0 * * *',
        'select public.invoke_smartstore_api_collector();'
    );

    existing_job := null;
    select jobid into existing_job
    from cron.job where jobname = 'smartstore-api-0940-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'smartstore-api-0940-kst',
        '40 0 * * *',
        'select public.invoke_smartstore_api_collector();'
    );

    existing_job := null;
    select jobid into existing_job
    from cron.job where jobname = 'smartstore-api-1410-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'smartstore-api-1410-kst',
        '10 5 * * *',
        'select public.invoke_smartstore_api_collector();'
    );
end;
$$;

-- 전환 시점 누락일을 새 서버 수집기로 강제 재검증한다.
select public.invoke_smartstore_api_collector('2026-08-28'::date, true);
