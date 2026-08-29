# JangsAI Grok Marketing Bridge

Grok Bot이 사람의 메시지 중계 없이 로그인 채널 누락 작업을 조회하고 결과를
JangsAI 대시보드 DB에 기록하는 제한형 API입니다.

## 보안

- Function Secret `GROK_MARKETING_BRIDGE_TOKEN`을 Bearer 토큰으로 사용합니다.
- 토큰은 Grok Bot Secure Secret 카드에만 입력합니다.
- Supabase service-role 키와 기존 채널별 수집 토큰은 Grok Bot에 제공하지 않습니다.
- 과거 90일 이내, 등록된 4개 제품, Smartstore·Coupang 지표만 쓸 수 있습니다.
- 주문·상품·광고·정산 설정을 바꾸는 기능은 없습니다.

Endpoint:

```text
https://pfmrqsfmkdnhzjimqocr.supabase.co/functions/v1/grok-marketing-bridge
```

모든 요청은 `POST`, `Content-Type: application/json`,
`Authorization: Bearer <Secure Secret>`을 사용합니다.

쿠팡에서 비밀번호 변경 화면이 표시되면 비밀번호를 변경하지 않습니다. 같은 계정
세션에서 즐겨찾기 또는 주소창으로 `https://wing.coupang.com`을 먼저 연 뒤
판매분석 URL로 돌아갑니다.

## 작업 조회

```json
{
  "action": "sync",
  "metric_date": "2026-08-27"
}
```

`metric_date`를 생략하면 한국 시간 기준 전일을 사용합니다. 응답의 `jobs`에는 지금
처리할 수 있는 `pending` 작업만 포함됩니다. 로그인·캡차·반복 실패는 `blocked_jobs`에
남아 즉시 반복되지 않으며, `dashboard_snapshot`에는 출근 브리핑에 필요한 제품별
저장값과 미수집 항목이 포함됩니다.

## 작업 시작

```json
{
  "action": "claim",
  "job_id": "<sync 응답의 작업 ID>"
}
```

## Smartstore 결과 저장

제품 2개와 화면 전체 합계를 함께 제출해야 합니다. 대시보드 대상이 아닌 상품은
`unmapped`에 넣으며, `제품 합계 + unmapped`가 화면 전체 합계와 다르면 거부됩니다.
스토어분석에서 전일의 방문수·상품결제건수와 판매수량·결제금액을 모두 읽습니다.
`pay_count`는 유입 전환용 상품결제건수, `orders`는 매출용 판매수량이므로 서로
바꾸지 않습니다.

```json
{
  "action": "submit",
  "job_id": "<작업 ID>",
  "metrics": [
    {
      "product_slug": "innerium-gala431",
      "visits": 38,
      "pay_count": 2,
      "conversion_rate": 5.3,
      "orders": 2,
      "revenue": 145300
    },
    {
      "product_slug": "innerium-minti431",
      "visits": 33,
      "pay_count": 0,
      "conversion_rate": 0,
      "orders": 0,
      "revenue": 0
    }
  ],
  "source_totals": {
    "visits": 71,
    "pay_count": 2,
    "orders": 2,
    "revenue": 145300
  },
  "unmapped": []
}
```

## Coupang 결과 저장

판매자배송(`wing`)과 로켓그로스(`growth`)를 제품별로 나누고, 화면 상단의 공식
전체 합계 카드도 함께 제출합니다. 반품일 수 있으므로 판매량·매출은 음수를 허용합니다.

```json
{
  "action": "submit",
  "job_id": "<작업 ID>",
  "metrics": [
    {
      "product_slug": "yural-tonggam-cream",
      "wing": { "visits": 10, "orders": 1, "revenue": 50000 },
      "growth": { "visits": 20, "orders": 2, "revenue": 100000 }
    },
    {
      "product_slug": "yural-myeongga-bonhwan",
      "wing": { "visits": 5, "orders": 0, "revenue": 0 },
      "growth": { "visits": 7, "orders": 1, "revenue": 30000 }
    }
  ],
  "source_totals": {
    "combined": { "visits": 42, "orders": 4, "revenue": 180000 }
  }
}
```

## 실패 회신

로그인 화면, CAPTCHA, 2차 인증은 각각 `LOGIN_EXPIRED`, `CAPTCHA_REQUIRED`,
`MFA_REQUIRED`로 회신합니다. 대시보드에는 재로그인 경고가 표시됩니다.

```json
{
  "action": "fail",
  "job_id": "<작업 ID>",
  "error_code": "LOGIN_EXPIRED",
  "message": "유랄 Smartstore 로그인이 만료되었습니다."
}
```

저장 후 다시 `sync`를 호출해 해당 작업이 `jobs`에서 사라지고 `all_jobs`에서
`completed`인지 확인합니다.
