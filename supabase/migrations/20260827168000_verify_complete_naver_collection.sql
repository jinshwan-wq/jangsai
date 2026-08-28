-- 키워드 4개와 브랜드 광고계정 2개의 전날 수집이 모두 성공했는지 검증한다.
do $$
declare
    expected_date date := timezone('Asia/Seoul', now())::date - 1;
    brand_count integer;
    keyword_product_count integer;
    latest_status text;
    latest_errors text;
begin
    select count(*) into brand_count
    from public.daily_brand_marketing_metrics
    where metric_date = expected_date
      and brand in ('이너리움', '유랄');

    select count(distinct product_id) into keyword_product_count
    from public.keyword_search_snapshots
    where snapshot_date = expected_date
      and provider = 'naver_search';

    select status, coalesce((details->'errors')::text, '[]')
    into latest_status, latest_errors
    from public.marketing_ingestion_runs
    where provider = 'naver_search'
      and metric_date = expected_date
    order by started_at desc
    limit 1;

    if brand_count <> 2 or keyword_product_count <> 4 or latest_status <> 'success' then
        raise exception '네이버 전체 수집 검증 실패: 브랜드 %/2, 키워드제품 %/4, 상태 %, 오류 %',
            brand_count, keyword_product_count, coalesce(latest_status, '없음'), latest_errors;
    end if;
end;
$$;
