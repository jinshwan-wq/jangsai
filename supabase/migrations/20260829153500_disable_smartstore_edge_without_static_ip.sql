-- 네이버 커머스 API는 고정 outbound IPv4만 허용한다.
-- Supabase Edge는 고정 egress IP를 보장하지 않으므로 프록시 도입 전까지 예약을 끈다.
do $$
declare
    existing_job bigint;
begin
    for existing_job in
        select jobid
        from cron.job
        where jobname in (
            'smartstore-api-0910-kst',
            'smartstore-api-0940-kst',
            'smartstore-api-1410-kst'
        )
    loop
        perform cron.unschedule(existing_job);
    end loop;
end;
$$;
