# 마케팅 자동 수집 설정

이 함수는 매일 09:00 KST에 전날 데이터를 수집합니다. API 비밀키는
`marketing_source_mappings.config`에 넣지 않고 Supabase Function Secret으로
관리합니다.

채널 연결 시 필요한 Function Secret:

- `CAFE24_API_TOKEN`
- `SMARTSTORE_API_TOKEN`
- `COUPANG_API_TOKEN`
- `NAVER_SEARCH_API_KEY`, `NAVER_SEARCH_SECRET_KEY`, `NAVER_SEARCH_CUSTOMER_ID`
- 필요 시 `NAVER_CONTENT_API_TOKEN`
- `ALLOWED_MARKETING_HOSTS`: 회사가 관리하는 정규화 API 호스트 목록(쉼표 구분)

DB Vault의 다음 값은 마이그레이션이 자동 생성합니다.

- `marketing_collector_url`: 배포된 `collect-marketing` 함수 URL
- `marketing_collector_token`: 스케줄러 요청 인증값

네이버 검색광고 Secret 등록 후 기본 키워드 매핑을 활성화합니다.

```sql
update public.marketing_source_mappings
set is_enabled = true, updated_at = now()
where provider = 'naver_search';
```

판매채널은 실제 상품 ID와 계정의 API 사용 권한을 확인한 뒤
`marketing_source_mappings`에 추가합니다. 연결 전 매핑은 활성화하지 않습니다.

각 `marketing_source_mappings.config`에는 다음과 같은 비밀이 아닌 연결 설정을
저장합니다.

```json
{
  "endpoint": "https://api.example.com/daily-metrics",
  "date_param": "metric_date",
  "id_param": "external_id",
  "result_path": "data.records",
  "field_map": {
    "cafe24_visits": "visitors",
    "cafe24_orders": "orders",
    "cafe24_revenue": "revenue"
  }
}
```

연결 주소는 공식 API 또는 회사가 관리하는 정규화 API여야 하며, 응답 필드는
`field_map`으로 장스 지표에 연결합니다. 회사 정규화 API는
`ALLOWED_MARKETING_HOSTS`에 먼저 등록해야 합니다. Secret 이름은 설정에서
임의로 지정할 수 없고 공급자별 고정 Secret만 사용합니다. Google Sheets는 자동화 전환 기간의
수동 보조 경로이므로 이 함수가 정기 호출하지 않습니다.

채널별 적용 기준:

- 카페24: Admin API 주문·매출과 승인된 Analytics API 방문자를 연결할 수 있습니다.
- 스마트스토어: 일반 판매자는 주문 API를 사용할 수 있지만 유입 통계 API는
  브랜드스토어와 API 데이터 솔루션 이용 가능 여부를 먼저 확인해야 합니다.
- 쿠팡: Open API 주문·매출은 연결할 수 있습니다. 방문자·조회 통계는 공개 API가
  없어 Wing의 허용된 내보내기 방식이 확인될 때까지 미수집으로 둡니다. 주문과
  매출은 `coupang_wing_*`, `coupang_growth_*`로 나눠 저장합니다.
- 네이버 검색량: 검색광고 Keyword Tool API를 함수가 직접 호출하고 합계가 아닌
  키워드별 30일 검색량 스냅샷으로 저장합니다.
- 네이버 블로그·카페 조회수: 공식 일괄 조회 API가 확인되지 않은 경우 임의
  크롤링하지 않고 허용된 내보내기 또는 별도 정규화 수집원을 연결합니다.
