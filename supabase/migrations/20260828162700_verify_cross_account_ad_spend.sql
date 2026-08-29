-- 광고계정 경계가 아닌 소재·캠페인명 기준 배분으로 전일 광고비를 다시 검증한다.
select public.invoke_marketing_collector();
