-- 이너리움 제품 보고서에 공통 브랜드 키워드 검색량을 함께 수집한다.
update public.marketing_source_mappings mappings
set config = jsonb_set(
        mappings.config,
        '{keywords}',
        case products.slug
            when 'innerium-gala431'
                then '["이너리움 갈라431", "갈라431", "이너리움"]'::jsonb
            when 'innerium-minti431'
                then '["이너리움 민티431", "민티431", "이너리움"]'::jsonb
        end,
        true
    ),
    is_enabled = true,
    updated_at = now()
from public.marketing_products products
where products.id = mappings.product_id
  and mappings.provider = 'naver_search'
  and products.slug in ('innerium-gala431', 'innerium-minti431');

-- 변경 직후 전일 검색량을 다시 수집한다.
select public.invoke_marketing_collector();
