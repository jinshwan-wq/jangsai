-- 운영 수집기의 과거 보정은 관리자 사용자 또는 service_role만 실행한다.
create or replace function public.invoke_marketing_collector_for_date(
    p_metric_date date,
    p_providers text[] default array['cafe24']::text[]
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
    collector_url text;
    collector_token text;
    request_id bigint;
begin
    if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
       and not exists (
           select 1
           from public.profiles
           where id = auth.uid()
             and role_id = 'admin'
             and approval_status = 'approved'
       ) then
        raise exception '관리자만 과거 데이터를 수집할 수 있습니다.';
    end if;
    if p_metric_date < date '2026-01-01'
       or p_metric_date >= timezone('Asia/Seoul', now())::date then
        raise exception '수집 가능 날짜가 아닙니다.';
    end if;
    if not (p_providers <@ array['cafe24', 'naver_search', 'naver_blog']::text[]) then
        raise exception '허용되지 않은 수집 채널입니다.';
    end if;

    select decrypted_secret into collector_url
    from vault.decrypted_secrets
    where name = 'marketing_collector_url'
    limit 1;
    select decrypted_secret into collector_token
    from vault.decrypted_secrets
    where name = 'marketing_collector_token'
    limit 1;
    if collector_url is null or collector_token is null then
        raise exception 'marketing collector Vault secrets are not configured';
    end if;

    select net.http_post(
        url := collector_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-collector-secret', collector_token
        ),
        body := jsonb_build_object(
            'metric_date', p_metric_date::text,
            'providers', to_jsonb(p_providers),
            'trigger', 'backfill_validation'
        )
    ) into request_id;
    return request_id;
end;
$$;

revoke all on function public.invoke_marketing_collector_for_date(
    date, text[]
) from public, anon;
grant execute on function public.invoke_marketing_collector_for_date(
    date, text[]
) to authenticated, service_role;
