-- 두 광고계정이 조회용 API 계정에 권한을 위임할 때까지 반복 403을 방지한다.
update public.marketing_source_mappings
set config = config - 'ad_customer_id',
    updated_at = now()
where provider = 'naver_search'
  and config->>'ad_customer_id' in ('1226483', '4131809');
