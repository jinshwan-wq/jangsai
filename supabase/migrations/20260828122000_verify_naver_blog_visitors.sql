-- 전날 블로그 50개 원본과 제품별 합계가 모두 일치하는지 검증한다.
do $$
declare
    expected_date date := timezone('Asia/Seoul', now())::date - 1;
    source_count integer;
    matched_product_count integer;
    latest_status text;
    latest_errors text;
begin
    select count(*) into source_count
    from public.daily_content_metrics metrics
    join public.marketing_contents contents on contents.id = metrics.content_id
    join public.marketing_products products on products.id = contents.product_id
    where metrics.metric_date = expected_date
      and metrics.source = 'api'
      and contents.channel = 'naver_blog'
      and contents.is_active
      and products.slug in (
          'innerium-gala431',
          'innerium-minti431',
          'yural-tonggam-cream',
          'yural-myeongga-bonhwan'
      );

    select count(*) into matched_product_count
    from (
        select
            products.id,
            sum(content_metrics.views)::integer as source_total
        from public.marketing_products products
        join public.marketing_contents contents
          on contents.product_id = products.id
         and contents.channel = 'naver_blog'
         and contents.is_active
        join public.daily_content_metrics content_metrics
          on content_metrics.content_id = contents.id
         and content_metrics.metric_date = expected_date
        where products.slug in (
            'innerium-gala431',
            'innerium-minti431',
            'yural-tonggam-cream',
            'yural-myeongga-bonhwan'
        )
        group by products.id
    ) totals
    join public.daily_marketing_metrics daily
      on daily.product_id = totals.id
     and daily.metric_date = expected_date
     and daily.blog_views = totals.source_total
     and coalesce((daily.data_completeness->>'blog_views')::boolean, false);

    select
        status,
        coalesce((details->'errors')::text, '[]')
    into latest_status, latest_errors
    from public.marketing_ingestion_runs
    where provider = 'naver_blog'
      and metric_date = expected_date
    order by started_at desc
    limit 1;

    if source_count <> 50 or matched_product_count <> 4 or latest_status <> 'success' then
        raise exception
            '블로그 수집 검증 실패: 원본 %/50, 합계제품 %/4, 상태 %, 오류 %',
            source_count,
            matched_product_count,
            coalesce(latest_status, '없음'),
            coalesce(latest_errors, '[]');
    end if;
end;
$$;
