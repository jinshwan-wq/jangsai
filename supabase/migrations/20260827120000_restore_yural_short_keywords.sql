-- 유랄 키워드는 띄어쓰기 중복만 제거하고 전체명/짧은명을 각각 추적한다.
update public.marketing_source_mappings mappings
set config = jsonb_set(
        mappings.config,
        '{keywords}',
        case products.slug
            when 'yural-tonggam-cream' then '["유랄통감크림", "통감크림"]'::jsonb
            when 'yural-myeongga-bonhwan' then '["유랄명가본환", "명가본환"]'::jsonb
            else mappings.config->'keywords'
        end,
        true
    ),
    is_enabled = true,
    updated_at = now()
from public.marketing_products products
where products.id = mappings.product_id
  and mappings.provider = 'naver_search'
  and products.slug in ('yural-tonggam-cream', 'yural-myeongga-bonhwan');

select public.invoke_marketing_collector();
