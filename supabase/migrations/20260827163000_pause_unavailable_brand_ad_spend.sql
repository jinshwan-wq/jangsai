-- 계정 연동 상태를 다시 확인할 때까지 반복 인증 실패를 방지한다.
update public.marketing_source_mappings
set config = config - 'ad_customer_id',
    updated_at = now()
where provider = 'naver_search'
  and config->>'ad_customer_id' in ('1226483', '4131809');
