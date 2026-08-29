# 마케팅 자동 수집 설정

이 함수는 매일 09:00 KST에 전날 데이터를 수집합니다. API 비밀키는
`marketing_source_mappings.config`에 넣지 않고 Supabase Function Secret으로
관리합니다.

채널 연결 시 필요한 Function Secret:

- `CAFE24_CLIENT_ID`, `CAFE24_CLIENT_SECRET`
- `SMARTSTORE_INGEST_SECRET`
- `COUPANG_WING_INGEST_SECRET`
- `NAVER_SEARCH_API_KEY`, `NAVER_SEARCH_SECRET_KEY`, `NAVER_SEARCH_CUSTOMER_ID`
- `NAVER_AD_INNERIUM_API_KEY`, `NAVER_AD_INNERIUM_SECRET_KEY`
- `NAVER_AD_YURAL_API_KEY`, `NAVER_AD_YURAL_SECRET_KEY`
- `CAFE_VIEWS_INGEST_SECRET`
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

Cafe24는 대시보드 관리자의 `Cafe24 자동수집` 버튼으로 OAuth 연결합니다.
개발자 앱 Redirect URI는 아래 주소를 사용하며 주문·상품·쇼핑몰 읽기 권한이 필요합니다.

```text
https://pfmrqsfmkdnhzjimqocr.supabase.co/functions/v1/cafe24-oauth/callback
```

연결된 access/refresh token은 Supabase Vault에 쇼핑몰별로 저장합니다. 2시간짜리
access token이 만료되면 수집 함수가 refresh token을 갱신하고 새 refresh token도
즉시 Vault에 교체 저장합니다. 같은 제품의 유료 판매 구성은 여러 상품번호를 합산하고
증정·사은품·이벤트 상품은 자동 매핑에서 제외합니다.

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

- 카페24: Admin API의 결제일 기준 주문 품목에서 상품별 판매수량·실결제 매출을
  수집합니다. 취소·반품·교환 원품은 제외합니다. 같은 OAuth 토큰의
  `mall.read_analytics` 권한으로 Analytics API의 상품별 상세페이지 조회수도
  유입 지표로 함께 수집합니다. 쇼핑몰 전체 방문자를 상품마다 중복 귀속하지 않습니다.
- 스마트스토어: 네이버 커머스API가 고정 출구 IP를 강제하고 Supabase Edge
  Functions는 고정 출구 IP를 제공하지 않으므로 현재 Windows PC의 작업 스케줄러가
  매일 09:10에 `tools/collect-smartstore.mjs`를 실행합니다. API 시크릿과 수집
  토큰은 현재 Windows 사용자에게 귀속된 DPAPI 암호문으로 저장되며, 원문 파일로
  남기지 않습니다. 결제일 기준 상품 주문의 `remainQuantity`와
  `remainPaymentAmount`를 사용해 취소·반품을 반영한 판매량과 매출을 저장합니다.
  공개 API가 제공하지 않는 상품별 방문수·상품결제건수·구매전환율은 로그인된
  스마트스토어센터의 공식 방문 리포트를 `tools/collect-smartstore-traffic.mjs`가
  읽어 별도로 저장합니다. 리포트 갱신 시각 이후인 매일 09:45에 실행하며, 판매수량과
  상품결제건수의 정의가 다르므로 서로 덮어쓰지 않습니다. 화면 합계와 상품 합계가
  일치하지 않으면 기존 값을 덮어쓰지 않습니다. 대시보드 대상이 아닌 상품은 계정
  합계 검증에는 포함하되 제품 지표에서는 제외하고 수집 이력에 경고를 남깁니다.
- 쿠팡: 공개 API 대신 현재 Windows PC의 전용 Chrome 프로필 두 개에서 로그인된
  Wing 판매분석 원본을 읽습니다. `npm run setup:coupang`으로 이너리움·유랄
  전용 창을 처음 한 번 열고 각 계정으로 로그인합니다. 작업 스케줄러는 매일
  스마트스토어 수집 후 `tools/run-coupang-wing-collector.ps1`을 실행합니다.
  옵션별 방문자·판매량·매출을 판매자배송(`coupang_wing_*`)과 로켓그로스
  (`coupang_growth_*`)로 나눠 저장하고, 화면의 공식 합계와 옵션 합계가 완전히
  일치하지 않거나 미매핑 판매 상품이 있으면 해당 계정의 기존 값을 덮어쓰지 않습니다.
  공유 토큰은 현재 Windows 사용자에게 귀속된 DPAPI 암호문으로만 로컬에 저장합니다.
- 네이버 검색량: 검색광고 Keyword Tool API를 함수가 직접 호출하고 합계가 아닌
  키워드별 30일 검색량 스냅샷으로 저장합니다. 이너리움(`1226483`)과
  유랄(`4131809`)은 각 광고계정의 자체 API 인증값으로 캠페인 통계 `salesAmt`를
  조회해 브랜드 총액을 검증합니다. 소재의 `headline`·`productName` 등 제목을
  갈라431·민티431·통감크림·명가본환에 매칭해 제품별 일 광고비도 함께 저장합니다.
  삭제 소재나 제목 미일치 금액은 억지로 나누지 않고 미분류 경고로 남깁니다.
- 네이버 블로그 방문자 수: `marketing_contents`에 등록된 공개 블로그별 날짜별
  방문자 XML을 읽어 원본을 `daily_content_metrics`에 저장하고, 해당 제품의 활성
  블로그가 모두 수집된 날만 합계를 `blog_views`로 반영합니다. 통감크림·명가본환은
  각 15개, 갈라431·민티431은 각 10개를 합산합니다.
- 네이버 카페 조회수: `tools/collect-cafe-views.mjs`가 제품별 Google Sheets에서
  최근 92일 URL을 읽고, 게시글 본문 대신 카페 전체글 목록을 글 번호 커서로 이동해
  누적 조회수를 최대 50개씩 묶어서 읽습니다. 네이버 로그인·Chrome 프로필·IP 변경을 사용하지 않으며
  기본 속도는 초당 2요청/동시 2개로 제한합니다. 누적값 원본은
  `daily_content_metrics.cumulative_views`, 직전 정상값 대비 증가분은 `views`에
  저장합니다. 신규 글의 첫 관측은 기준점 0으로 처리하고, 누락·감소·30시간 초과
  공백이 하나라도 있으면 해당 제품의 축소 합계를 `cafe_views`에 발행하지 않습니다.
  네이버가 삭제를 확정한 글과 운영정책으로 차단한 카페는 7일마다 재확인하면서
  예상 모수에서 제외합니다.

카페 수집기의 Google 서비스 계정과 수집 토큰은 현재 Windows 사용자 DPAPI로
암호화합니다. 원본 JSON이나 토큰은 저장소에 복사하지 않습니다.

```powershell
$env:JANGSAI_CAFE_INGEST_SECRET = '<Supabase Function Secret과 같은 32자 이상 값>'
npm run setup:cafe-views -- --service-account 'Z:\...\service_account.json'
Remove-Item Env:JANGSAI_CAFE_INGEST_SECRET

# 읽기 전용 표본 검증
npm run collect:cafe-views -- --dry-run --limit 100 --product yural-tonggam-cream

# 연속된 과거 스냅샷 날짜만 증가분으로 복원
npm run backfill:cafe-views -- --dry-run
npm run backfill:cafe-views

# 업로드 완료 후 일시적인 집계 오류만 재시도
npm run collect:cafe-views -- --retry-latest

# 매일 09:45 예약 작업 등록
powershell -ExecutionPolicy Bypass -File tools\setup-cafe-views-schedule.ps1
```
