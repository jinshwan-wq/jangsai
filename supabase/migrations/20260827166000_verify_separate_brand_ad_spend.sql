-- 각 브랜드 자체 API 키로 전날 소진액이 모두 저장됐는지 검증한다.
do $$
declare
    expected_date date := timezone('Asia/Seoul', now())::date - 1;
    collected_count integer;
    recent_errors text;
begin
    select count(*) into collected_count
    from public.daily_brand_marketing_metrics
    where metric_date = expected_date
      and brand in ('이너리움', '유랄');

    if collected_count <> 2 then
        select coalesce((details->'errors')::text, error_message, '상세 없음')
        into recent_errors
        from public.marketing_ingestion_runs
        where provider = 'naver_search'
          and metric_date = expected_date
        order by started_at desc
        limit 1;
        raise exception '브랜드별 광고비 수집 검증 실패 (%/2): %',
            collected_count, coalesce(recent_errors, '실행 이력 없음');
    end if;
end;
$$;
