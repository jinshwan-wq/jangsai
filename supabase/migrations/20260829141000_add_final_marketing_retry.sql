-- 오전 외부 API 장애가 남아 있으면 같은 날 오후 2시에 한 번 더 자동 복구한다.
do $$
declare
    existing_job bigint;
begin
    select jobid into existing_job from cron.job where jobname = 'marketing-retry-1400-kst';
    if existing_job is not null then perform cron.unschedule(existing_job); end if;
    perform cron.schedule(
        'marketing-retry-1400-kst',
        '0 5 * * *',
        'select public.invoke_marketing_collector();'
    );
end;
$$;
