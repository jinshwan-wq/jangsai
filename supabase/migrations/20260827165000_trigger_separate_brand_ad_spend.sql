-- 브랜드별 자체 API 키 배포 후 전날 소진액을 첫 수집한다.
select public.invoke_marketing_collector();
