-- 각 브랜드 광고계정의 자체 API 인증값으로 일 소진액 수집을 활성화한다.
update public.marketing_source_mappings mappings
set config = mappings.config || jsonb_build_object(
        'ad_brand', products.brand,
        'ad_customer_id',
        case products.brand
            when '이너리움' then '1226483'
            when '유랄' then '4131809'
        end,
        'ad_credentials_key',
        case products.brand
            when '이너리움' then 'innerium'
            when '유랄' then 'yural'
        end
    ),
    updated_at = now()
from public.marketing_products products
where products.id = mappings.product_id
  and mappings.provider = 'naver_search'
  and products.brand in ('이너리움', '유랄');
