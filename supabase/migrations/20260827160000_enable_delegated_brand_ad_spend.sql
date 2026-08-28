-- 조회용 API 계정에 두 광고계정 권한 위임이 완료되어 브랜드 광고비 수집을 활성화한다.
update public.marketing_source_mappings mappings
set config = mappings.config || jsonb_build_object(
        'ad_brand', products.brand,
        'ad_customer_id',
        case products.brand
            when '이너리움' then '1226483'
            when '유랄' then '4131809'
        end
    ),
    updated_at = now()
from public.marketing_products products
where products.id = mappings.product_id
  and mappings.provider = 'naver_search'
  and products.brand in ('이너리움', '유랄');

select public.invoke_marketing_collector();
