-- 네이버 권한 승인 반영 후 전날 브랜드 광고비 수집을 재시도한다.
select public.invoke_marketing_collector();
