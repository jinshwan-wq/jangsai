-- 네이버 검색광고 키워드별 수집 활성화 및 유랄 키워드 표기 통일

insert into public.daily_keyword_metrics (
    product_id, metric_date, keyword, search_volume, source,
    source_details, created_by, created_at, updated_at
)
select
    metrics.product_id,
    metrics.metric_date,
    case products.slug
        when 'yural-tonggam-cream' then '유랄통감크림'
        when 'yural-myeongga-bonhwan' then '유랄명가본환'
    end,
    max(metrics.search_volume),
    max(metrics.source),
    jsonb_build_object('normalized_from', jsonb_agg(distinct metrics.keyword)),
    null::uuid,
    min(metrics.created_at),
    now()
from public.daily_keyword_metrics metrics
join public.marketing_products products on products.id = metrics.product_id
where products.slug in ('yural-tonggam-cream', 'yural-myeongga-bonhwan')
group by metrics.product_id, metrics.metric_date, products.slug
on conflict (product_id, metric_date, keyword) do update
set search_volume = greatest(daily_keyword_metrics.search_volume, excluded.search_volume),
    source_details = daily_keyword_metrics.source_details || excluded.source_details,
    updated_at = now();

delete from public.daily_keyword_metrics metrics
using public.marketing_products products
where products.id = metrics.product_id
  and (
      (products.slug = 'yural-tonggam-cream' and metrics.keyword <> '유랄통감크림')
      or (products.slug = 'yural-myeongga-bonhwan' and metrics.keyword <> '유랄명가본환')
  );

insert into public.keyword_search_snapshots (
    product_id, snapshot_date, keyword, window_days, search_volume,
    provider, collected_at, source_details
)
select
    snapshots.product_id,
    snapshots.snapshot_date,
    case products.slug
        when 'yural-tonggam-cream' then '유랄통감크림'
        when 'yural-myeongga-bonhwan' then '유랄명가본환'
    end,
    max(snapshots.window_days),
    max(snapshots.search_volume),
    snapshots.provider,
    max(snapshots.collected_at),
    jsonb_build_object('normalized_from', jsonb_agg(distinct snapshots.keyword))
from public.keyword_search_snapshots snapshots
join public.marketing_products products on products.id = snapshots.product_id
where products.slug in ('yural-tonggam-cream', 'yural-myeongga-bonhwan')
  and snapshots.keyword <> '기존 합계'
group by snapshots.product_id, snapshots.snapshot_date, snapshots.provider, products.slug
on conflict (product_id, snapshot_date, keyword, provider) do update
set search_volume = greatest(keyword_search_snapshots.search_volume, excluded.search_volume),
    source_details = keyword_search_snapshots.source_details || excluded.source_details,
    collected_at = greatest(keyword_search_snapshots.collected_at, excluded.collected_at);

delete from public.keyword_search_snapshots snapshots
using public.marketing_products products
where products.id = snapshots.product_id
  and snapshots.keyword <> '기존 합계'
  and (
      (products.slug = 'yural-tonggam-cream' and snapshots.keyword <> '유랄통감크림')
      or (products.slug = 'yural-myeongga-bonhwan' and snapshots.keyword <> '유랄명가본환')
  );

update public.marketing_source_mappings mappings
set config = jsonb_set(
        mappings.config,
        '{keywords}',
        case products.slug
            when 'yural-tonggam-cream' then '["유랄통감크림"]'::jsonb
            when 'yural-myeongga-bonhwan' then '["유랄명가본환"]'::jsonb
            else mappings.config->'keywords'
        end,
        true
    ),
    is_enabled = true,
    updated_at = now()
from public.marketing_products products
where products.id = mappings.product_id
  and mappings.provider = 'naver_search';
