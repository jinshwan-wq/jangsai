-- 공개 응답에 남아 있는 최근 4개 완료일의 블로그 방문자 수를 백필한다.
do $$
declare
    collector_url text;
    collector_token text;
    day_offset integer;
begin
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

    for day_offset in 1..4 loop
        perform net.http_post(
            url := collector_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-collector-secret', collector_token
            ),
            body := jsonb_build_object(
                'metric_date',
                (timezone('Asia/Seoul', now())::date - day_offset)::text,
                'providers',
                jsonb_build_array('naver_blog'),
                'trigger',
                'initial_blog_backfill'
            )
        );
    end loop;
end;
$$;
