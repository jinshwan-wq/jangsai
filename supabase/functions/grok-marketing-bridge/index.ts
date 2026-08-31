import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ACCOUNT_PRODUCTS,
  deriveMissingTasks,
  isActionableJob,
  kstYesterday,
  normalizeSubmission,
  providerReadyAt,
  shouldRequeueMissingJob,
  SOURCE_URLS,
  TASK_REQUIREMENTS,
  validMetricDate,
} from "./contract.mjs";

const CLIENT_KEY = "grok-marketing-ops";
const RUNBOOK_VERSION = 7;
const BACKLOG_DAYS = 7;
const PRODUCT_SLUGS = Object.values(ACCOUNT_PRODUCTS).flat().map((
  product: { slug: string },
) => product.slug);
const SNAPSHOT_FIELDS = [
  "blog_views",
  "cafe_views",
  "content_views",
  "cafe24_visits",
  "cafe24_purchase_count",
  "cafe24_conversion_rate",
  "cafe24_orders",
  "cafe24_revenue",
  "smartstore_visits",
  "smartstore_pay_count",
  "smartstore_conversion_rate",
  "smartstore_orders",
  "smartstore_revenue",
  "coupang_wing_visits",
  "coupang_wing_orders",
  "coupang_wing_revenue",
  "coupang_wing_conversion_rate",
  "coupang_growth_visits",
  "coupang_growth_orders",
  "coupang_growth_revenue",
  "coupang_growth_conversion_rate",
  "coupang_visits",
  "coupang_orders",
  "coupang_revenue",
  "coupang_conversion_rate",
  "ad_spend",
] as const;
const NON_BROWSER_FIELDS = [
  "blog_views",
  "cafe24_visits",
  "cafe24_purchase_count",
  "cafe24_conversion_rate",
  "cafe24_orders",
  "cafe24_revenue",
  "ad_spend",
] as const;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const SESSION_KEYS = [
  "innerium-smartstore",
  "yural-smartstore",
  "innerium-coupang",
  "yural-coupang",
] as const;

function operatorRunbook() {
  return {
    version: RUNBOOK_VERSION,
    role: "JangsAI 마케팅 자동수집 보조 운영자",
    timezone: "Asia/Seoul",
    daily_schedule:
      "매일 09:30 스마트스토어·확인 가능한 매출, 12:40 쿠팡 방문자, 13:00 최종 재검증 KST",
    objective:
      "로그인 채널의 전일 유입·전환·주문·매출을 수집하고 검증 결과를 대시보드 DB에 기록한다.",
    persistent_sessions: SESSION_KEYS,
    session_strategy: {
      smartstore:
        "하나의 통합매니저 로그인 세션을 유지하고 이너리움·유랄 스토어만 전환한다.",
      coupang: "기존 이너리움·유랄 로그인 세션을 유지한다.",
    },
    bootstrap: [
      "스마트스토어는 현재 로그인된 통합매니저 세션을 재사용하며 로그아웃하거나 네이버 계정을 바꾸지 않는다.",
      "스마트스토어 수집 시 통합매니저의 스토어 선택기에서 지정된 이너리움 또는 유랄 스토어로 이동한다.",
      "쿠팡은 기존 로그인 세션을 재사용하고, 로그인되지 않은 세션만 사용자에게 로그인을 요청한다.",
      "계정명과 판매자 화면을 확인하기 전에는 수집하거나 submit하지 않는다.",
      "쿠팡에서 비밀번호 변경 화면이 나오면 변경하지 말고 같은 세션의 즐겨찾기 또는 주소창으로 https://wing.coupang.com 을 연다. 로그인 상태를 확인한 뒤 판매분석 URL을 다시 연다.",
      "세션 확인 후 heartbeat로 sessions 상태를 전송한다.",
    ],
    daily_workflow: [
      "09:30 KST에 metric_date를 생략한 sync를 호출해 최근 7일 스마트스토어 유입·전환·주문·매출 누락을 처리한다.",
      "쿠팡 전일 방문자 데이터는 12:40 KST 전에는 확정값이 아니므로 그 전에 쿠팡 job을 처리하지 않는다.",
      "12:40 KST에 sync를 다시 호출해 최근 7일 쿠팡 누락을 처리한다.",
      "13:00 KST에 sync를 마지막으로 호출해 실패 또는 로그인 복구 후 남은 job을 재처리한다.",
      "응답 jobs가 없으면 데이터 수정 없이 dashboard_snapshot으로 일일 요약만 작성한다.",
      "각 job을 claim한 뒤 지정 provider/account 화면을 연다. 스마트스토어는 통합매니저 세션 안에서 스토어만 전환한다.",
      "스마트스토어는 스토어분석에서 전일 제품별 방문수·상품결제건수와 판매수량·결제금액을 모두 읽는다.",
      "상품결제건수(pay_count)는 유입 전환 지표이고 판매수량(orders)은 매출 지표이므로 서로 바꾸지 않는다.",
      "쿠팡은 판매자배송·로켓그로스별 공식 구매전환율이 표시되면 conversion_rate에 그대로 담는다.",
      "job의 payload와 submit_contract에 있는 필드만 읽고 공식 화면 합계와 대조한다.",
      "검증에 성공한 데이터만 submit한다. 추적 외 상품은 unmapped에만 담는다.",
      "일시 장애는 한 번 재시도하고, 계속 실패하면 fail로 회신한 뒤 다음 job을 처리한다.",
      "sync의 blocked_jobs는 즉시 반복하지 않는다. 일반 실패는 30분 뒤 최대 3회까지만 자동 재대기된다.",
      "needs_login 작업은 인증 복구 전 claim하지 않는다. 사용자가 같은 Grok 세션에서 로그인을 마치면 해당 blocked_job을 claim해 재개한다.",
      "모든 job 처리 후 sync를 다시 호출해 누락이 사라졌는지 확인한다.",
    ],
    self_test_workflow: [
      "사용자가 즉시 검증을 요청하면 예약시각을 기다리지 않고 실행한다.",
      "sync의 전일 dashboard_snapshot을 기준값으로 사용한다.",
      "통합매니저의 두 스마트스토어와 두 쿠팡 판매자 화면에서 방문수·상품결제건수·판매수량·결제금액을 다시 읽는다.",
      "공식 화면 합계와 상품 합계를 먼저 대조한 뒤 DB 기준값과 비교한다.",
      "self-test에서는 submit하지 않고 heartbeat.last_verification에 계정별 pass/mismatch/error만 기록한다.",
    ],
    failure_codes: {
      LOGIN_EXPIRED: "로그인 화면 또는 세션 만료",
      CAPTCHA_REQUIRED: "사람의 캡차 처리가 필요함",
      MFA_REQUIRED: "사람의 추가 인증이 필요함",
      PROVIDER_UNAVAILABLE: "채널 페이지 또는 서비스 장애",
      TOTAL_MISMATCH: "상품 합계와 공식 화면 합계 불일치",
      COLLECTION_FAILED: "그 밖의 수집 실패",
    },
    guardrails: [
      "상품·가격·광고·정산·계정 설정을 생성, 수정, 삭제하지 않는다.",
      "구매, 주문처리, 메시지 발송, 리뷰 작성 같은 외부 행동을 하지 않는다.",
      "Secure Secret, Authorization 헤더, 쿠키, 비밀번호, 인증번호를 출력하거나 파일에 기록하지 않는다.",
      "Bridge가 허용한 과거 날짜와 작업만 처리하고 임의 날짜의 값을 추정하지 않는다.",
      "쿠팡 비밀번호 변경 유도 화면에서는 비밀번호 입력·변경을 시도하지 않는다.",
      "needs_login이면 사용자에게 이 Grok 대화에서 직접 알리고 Bridge에도 fail을 전송한다.",
      "이 PC의 Chrome이나 로컬 수집 스크립트를 실행하지 않고 Grok 전용 브라우저 세션만 사용한다.",
    ],
    heartbeat_contract: {
      action: "heartbeat",
      runbook_version: RUNBOOK_VERSION,
      phase: "onboarding | ready | collecting | needs_login",
      sessions: Object.fromEntries(
        SESSION_KEYS.map((key) => [key, "unknown | ready | needs_login"]),
      ),
      last_verification: {
        metric_date: "YYYY-MM-DD",
        status: "running | pass | fail",
        checks: Object.fromEntries(
          SESSION_KEYS.map((key) => [key, "pending | pass | mismatch | error"]),
        ),
      },
    },
  };
}

type ProductRow = {
  id: string;
  slug: string;
  brand: string;
  name: string;
};

function responseJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: CORS_HEADERS });
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

async function authenticated(request: Request) {
  const expected = Deno.env.get("GROK_MARKETING_BRIDGE_TOKEN") || "";
  const authorization = request.headers.get("authorization") || "";
  const received = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  return Boolean(expected && received && await secureEqual(expected, received));
}

function safeMessage(value: unknown, fallback: string) {
  const message = typeof value === "string" ? value.trim() : "";
  return (message || fallback).slice(0, 500);
}

function heartbeatDetails(body: Record<string, unknown>) {
  const allowedPhases = new Set([
    "onboarding",
    "ready",
    "collecting",
    "needs_login",
  ]);
  const allowedSessionStates = new Set(["unknown", "ready", "needs_login"]);
  const rawSessions = body.sessions && typeof body.sessions === "object" &&
      !Array.isArray(body.sessions)
    ? body.sessions as Record<string, unknown>
    : {};
  const rawVerification = body.last_verification &&
      typeof body.last_verification === "object" &&
      !Array.isArray(body.last_verification)
    ? body.last_verification as Record<string, unknown>
    : null;
  const verificationStatuses = new Set(["running", "pass", "fail"]);
  const checkStatuses = new Set(["pending", "pass", "mismatch", "error"]);
  const verificationDate = String(rawVerification?.metric_date || "");
  const verificationChecks = rawVerification?.checks &&
      typeof rawVerification.checks === "object" &&
      !Array.isArray(rawVerification.checks)
    ? rawVerification.checks as Record<string, unknown>
    : {};
  return {
    runbook_version: Number(body.runbook_version) || null,
    phase: allowedPhases.has(String(body.phase)) ? String(body.phase) : "ready",
    sessions: Object.fromEntries(SESSION_KEYS.map((key) => [
      key,
      allowedSessionStates.has(String(rawSessions[key]))
        ? String(rawSessions[key])
        : "unknown",
    ])),
    last_verification: rawVerification && validMetricDate(verificationDate)
      ? {
        metric_date: verificationDate,
        status: verificationStatuses.has(String(rawVerification.status))
          ? String(rawVerification.status)
          : "running",
        checks: Object.fromEntries(SESSION_KEYS.map((key) => [
          key,
          checkStatuses.has(String(verificationChecks[key]))
            ? String(verificationChecks[key])
            : "pending",
        ])),
        checked_at: new Date().toISOString(),
      }
      : null,
  };
}

function metricDateFrom(body: Record<string, unknown>) {
  const metricDate = body.metric_date === undefined
    ? kstYesterday()
    : String(body.metric_date);
  if (!validMetricDate(metricDate)) {
    throw new Error("수집 날짜는 최근 90일 이내의 과거 날짜여야 합니다.");
  }
  return metricDate;
}

function kstBacklogDates(days = BACKLOG_DAYS) {
  const dates = [];
  const cursor = new Date(`${kstYesterday()}T00:00:00Z`);
  for (let offset = 0; offset < days; offset++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

async function touchClient(supabase: any, patch: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("marketing_bridge_clients").upsert({
    client_key: CLIENT_KEY,
    display_name: "장스AI 마케팅 운영봇",
    last_seen_at: now,
    updated_at: now,
    ...patch,
  }, { onConflict: "client_key" });
  if (error) throw error;
}

async function loadData(supabase: any, metricDate: string) {
  const { data: products, error: productError } = await supabase
    .from("marketing_products")
    .select("id,slug,brand,name")
    .in("slug", PRODUCT_SLUGS)
    .eq("is_active", true);
  if (productError) throw productError;
  if ((products || []).length !== PRODUCT_SLUGS.length) {
    throw new Error("대시보드 제품 매핑 4개를 모두 찾지 못했습니다.");
  }
  const productRows = products as ProductRow[];
  const productIds = productRows.map((product) => product.id);
  const [
    { data: metrics, error: metricError },
    { data: keywordSnapshots, error: keywordSnapshotError },
    { data: dailyKeywords, error: dailyKeywordError },
    { data: brandMetrics, error: brandMetricError },
  ] = await Promise.all([
    supabase.from("daily_marketing_metrics").select("*")
      .eq("metric_date", metricDate).in("product_id", productIds),
    supabase.from("keyword_search_snapshots").select(
      "product_id,keyword,search_volume",
    )
      .eq("snapshot_date", metricDate).eq("provider", "naver_search").in(
        "product_id",
        productIds,
      ),
    supabase.from("daily_keyword_metrics").select(
      "product_id,keyword,search_volume",
    )
      .eq("metric_date", metricDate).in("product_id", productIds),
    supabase.from("daily_brand_marketing_metrics").select(
      "brand,naver_ad_spend",
    )
      .eq("metric_date", metricDate).in("brand", ["이너리움", "유랄"]),
  ]);
  if (metricError) throw metricError;
  if (keywordSnapshotError) throw keywordSnapshotError;
  if (dailyKeywordError) throw dailyKeywordError;
  if (brandMetricError) throw brandMetricError;

  const productsById = new Map(
    productRows.map((product) => [product.id, product]),
  );
  const metricsBySlug = new Map<string, Record<string, unknown>>(
    (metrics || []).flatMap(
      (
        metric: Record<string, unknown>,
      ): Array<[string, Record<string, unknown>]> => {
        const product = productsById.get(String(metric.product_id));
        return product ? [[product.slug, metric]] : [];
      },
    ),
  );
  const keywordsByProduct = new Map<
    string,
    Array<{ keyword: string; search_volume: number }>
  >();
  for (
    const keyword of [...(keywordSnapshots || []), ...(dailyKeywords || [])]
  ) {
    const product = productsById.get(String(keyword.product_id));
    if (!product) continue;
    const values = keywordsByProduct.get(product.slug) || [];
    const normalized = {
      keyword: String(keyword.keyword),
      search_volume: Number(keyword.search_volume) || 0,
    };
    const existingIndex = values.findIndex((item) =>
      item.keyword === normalized.keyword
    );
    if (existingIndex >= 0) values[existingIndex] = normalized;
    else values.push(normalized);
    keywordsByProduct.set(product.slug, values);
  }
  const brandSpend = new Map(
    (brandMetrics || []).map((metric: Record<string, unknown>) => [
      String(metric.brand),
      Number(metric.naver_ad_spend) || 0,
    ]),
  );
  return { productRows, metricsBySlug, keywordsByProduct, brandSpend };
}

function buildDashboardSnapshot(
  metricDate: string,
  data: Awaited<ReturnType<typeof loadData>>,
) {
  const products = data.productRows
    .sort((left, right) =>
      PRODUCT_SLUGS.indexOf(left.slug) - PRODUCT_SLUGS.indexOf(right.slug)
    )
    .map((product) => {
      const metric: Record<string, unknown> =
        data.metricsBySlug.get(product.slug) || {};
      const completeness = (metric.data_completeness || {}) as Record<
        string,
        unknown
      >;
      const values = Object.fromEntries(
        SNAPSHOT_FIELDS.map((field) => [field, metric[field] ?? null]),
      );
      const metricSourceDetails = (metric.source_details || {}) as Record<
        string,
        unknown
      >;
      const nonBrowserMissing = NON_BROWSER_FIELDS.filter((field) =>
        completeness[field] !== true
      );
      return {
        product_slug: product.slug,
        brand: product.brand,
        product_name: product.name,
        metrics: values,
        ad_spend_allocation: metricSourceDetails.naver_ad_spend || null,
        keyword_searches: data.keywordsByProduct.get(product.slug) || [],
        missing_non_browser_fields: nonBrowserMissing,
      };
    });
  return {
    metric_date: metricDate,
    products,
    brand_ad_spend: ["이너리움", "유랄"].map((brand) => ({
      brand,
      value: data.brandSpend.has(brand) ? data.brandSpend.get(brand) : null,
    })),
    notes: [
      "광고비는 소재·캠페인·광고그룹 제목으로 제품별 분류한 값이며 미분류 잔액은 완성도 경고로 남깁니다.",
      "원인 진단은 확정이 아니라 의심 원인으로 표현해야 합니다.",
    ],
  };
}

function jobContract(provider: string) {
  if (provider === "smartstore") {
    return {
      metrics: [{
        product_slug: "계정에 속한 제품 slug",
        visits: "0 이상의 정수",
        pay_count: "0 이상의 정수",
        conversion_rate: "상품결제건수 / 방문수 × 100, 소수점 1자리",
        orders: "전일 판매수량 0 이상의 정수",
        revenue: "전일 결제금액(원) 0 이상의 정수",
      }],
      source_totals: {
        visits: "화면 전체 방문수",
        pay_count: "화면 전체 상품결제건수",
        orders: "화면 전체 판매수량",
        revenue: "화면 전체 결제금액(원)",
      },
      unmapped: [{
        name: "대시보드 제외 상품명",
        external_id: "채널상품번호",
        visits: "방문수",
        pay_count: "상품결제건수",
        orders: "판매수량",
        revenue: "결제금액(원)",
      }],
    };
  }
  return {
    metrics: [{
      product_slug: "계정에 속한 제품 slug",
      wing: {
        visits: "정수",
        orders: "정수",
        revenue: "정수",
        conversion_rate: "화면의 공식 구매전환율(%), 표시되지 않으면 생략",
      },
      growth: {
        visits: "정수",
        orders: "정수",
        revenue: "정수",
        conversion_rate: "화면의 공식 구매전환율(%), 표시되지 않으면 생략",
      },
    }],
    source_totals: {
      combined: {
        visits: "공식 방문자 카드",
        orders: "공식 판매량 카드",
        revenue: "공식 매출 카드",
        conversion_rate: "공식 전체 구매전환율(%), 표시되지 않으면 생략",
      },
    },
  };
}

function publicJob(job: Record<string, unknown>) {
  const provider = String(job.provider);
  return {
    id: job.id,
    provider,
    account: job.account,
    metric_date: job.metric_date,
    status: job.status,
    attempts: job.attempts,
    source_url: (SOURCE_URLS as Record<string, string>)[provider],
    available_after_kst: provider === "coupang" ? "12:40" : "09:30",
    navigation_note: provider === "coupang"
      ? "비밀번호 변경 화면이면 변경하지 말고 같은 세션에서 https://wing.coupang.com 을 먼저 연 뒤 source_url을 다시 연다."
      : "스토어분석에서 전일 기준 제품별 방문수·상품결제건수와 판매수량·결제금액을 모두 읽는다.",
    payload: job.payload,
    last_error: job.last_error,
    submit_contract: jobContract(String(job.provider)),
  };
}

async function syncJobs(supabase: any, metricDate: string) {
  const data = await loadData(supabase, metricDate);
  const missingTasks = deriveMissingTasks(data.metricsBySlug, metricDate);
  const readyKeys = new Set(
    missingTasks
      .filter((task) => providerReadyAt(task.provider, metricDate))
      .map((task) => `${task.provider}:${task.account}`),
  );
  const { data: existingRows, error: existingError } = await supabase
    .from("marketing_bridge_jobs")
    .select("*")
    .eq("client_key", CLIENT_KEY)
    .eq("metric_date", metricDate);
  if (existingError) throw existingError;
  const existingByKey = new Map<string, Record<string, unknown>>(
    (existingRows || []).map((
      job: Record<string, unknown>,
    ): [string, Record<string, unknown>] => [
      `${job.provider}:${job.account}`,
      job,
    ]),
  );
  const missingKeys = new Set(
    missingTasks.map((task) => `${task.provider}:${task.account}`),
  );
  const now = new Date().toISOString();

  for (const task of missingTasks) {
    const key = `${task.provider}:${task.account}`;
    const existing = existingByKey.get(key);
    if (!existing) {
      const { error } = await supabase.from("marketing_bridge_jobs").insert({
        client_key: CLIENT_KEY,
        provider: task.provider,
        account: task.account,
        metric_date: metricDate,
        task_type: task.task_type,
        status: "pending",
        payload: task,
      });
      if (error) throw error;
      continue;
    }
    const patch: Record<string, unknown> = { payload: task };
    if (shouldRequeueMissingJob(existing)) {
      const staleClaim = existing.status === "claimed";
      patch.status = "pending";
      patch.completed_at = null;
      patch.claimed_at = null;
      patch.lease_expires_at = null;
      patch.updated_at = now;
      patch.last_error = staleClaim
        ? "30분 이상 응답이 없어 다시 대기열에 등록했습니다."
        : existing.last_error;
    }
    const { error } = await supabase.from("marketing_bridge_jobs").update(patch)
      .eq("id", existing.id);
    if (error) throw error;
  }

  for (const job of existingRows || []) {
    const key = `${job.provider}:${job.account}`;
    if (missingKeys.has(key) || job.status === "completed") continue;
    const { error } = await supabase.from("marketing_bridge_jobs").update({
      status: "completed",
      result: { verified: true, completion_source: "existing_data" },
      last_error: null,
      completed_at: now,
      updated_at: now,
    }).eq("id", job.id);
    if (error) throw error;
  }

  const { data: jobs, error: jobError } = await supabase
    .from("marketing_bridge_jobs")
    .select("*")
    .eq("client_key", CLIENT_KEY)
    .eq("metric_date", metricDate)
    .order("provider")
    .order("account");
  if (jobError) throw jobError;
  const { data: client } = await supabase
    .from("marketing_bridge_clients")
    .select("details")
    .eq("client_key", CLIENT_KEY)
    .maybeSingle();
  const clientRunbookVersion = Number(client?.details?.runbook_version) || null;
  const runbookUpdateRequired = clientRunbookVersion !== RUNBOOK_VERSION;
  return {
    metric_date: metricDate,
    runbook_version: RUNBOOK_VERSION,
    client_runbook_version: clientRunbookVersion,
    runbook_update_required: runbookUpdateRequired,
    refresh_action: runbookUpdateRequired ? "bootstrap" : null,
    ...(runbookUpdateRequired ? { updated_runbook: operatorRunbook() } : {}),
    operator_notices: [
      ...(runbookUpdateRequired
        ? [
          "새 운영지침이 있습니다. updated_runbook을 즉시 적용하고 heartbeat에 새 runbook_version을 기록한다.",
        ]
        : []),
      "쿠팡 비밀번호 변경 화면에서는 변경하지 않는다. 같은 세션에서 즐겨찾기 또는 주소창으로 https://wing.coupang.com 을 연 뒤 판매분석 페이지로 돌아간다.",
      "쿠팡 job은 전일 방문자 데이터가 확정되는 12:40 KST 이후에만 처리한다.",
      "스마트스토어 주문·매출도 Grok 수집 대상이며 상품결제건수와 판매수량을 구분한다.",
      "jobs만 즉시 처리하고 blocked_jobs는 오류 원인을 해결하기 전 반복 claim하지 않는다.",
    ],
    jobs: (jobs || []).filter((job: Record<string, unknown>) =>
      isActionableJob(job) && readyKeys.has(`${job.provider}:${job.account}`)
    ).map(publicJob),
    deferred_jobs: (jobs || []).filter((job: Record<string, unknown>) =>
      isActionableJob(job) && !readyKeys.has(`${job.provider}:${job.account}`)
    ).map(publicJob),
    blocked_jobs: (jobs || []).filter((job: Record<string, unknown>) =>
      ["failed", "needs_login", "skipped"].includes(String(job.status))
    ).map(publicJob),
    all_jobs: (jobs || []).map(publicJob),
    dashboard_snapshot: buildDashboardSnapshot(metricDate, data),
  };
}

async function syncBacklog(supabase: any) {
  const results = [];
  for (const metricDate of kstBacklogDates()) {
    results.push(await syncJobs(supabase, metricDate));
  }
  const [latest, ...older] = results;
  return {
    ...latest,
    jobs: results.flatMap((result) => result.jobs),
    deferred_jobs: results.flatMap((result) => result.deferred_jobs),
    blocked_jobs: results.flatMap((result) => result.blocked_jobs),
    backlog: older.map((result) => ({
      metric_date: result.metric_date,
      actionable_jobs: result.jobs.length,
      deferred_jobs: result.deferred_jobs.length,
      blocked_jobs: result.blocked_jobs.length,
    })),
  };
}

async function recoveryPlan(supabase: any, metricDate: string) {
  const data = await loadData(supabase, metricDate);
  return {
    metric_date: metricDate,
    missing_tasks: deriveMissingTasks(data.metricsBySlug, metricDate).map(
      (task) => ({
        ...task,
        provider_ready: providerReadyAt(task.provider, metricDate),
        available_after_kst: task.provider === "coupang" ? "12:40" : "09:30",
      }),
    ),
    dashboard_snapshot: buildDashboardSnapshot(metricDate, data),
  };
}

async function getJob(supabase: any, jobId: unknown) {
  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new Error("작업 ID가 올바르지 않습니다.");
  }
  const { data: job, error } = await supabase
    .from("marketing_bridge_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("client_key", CLIENT_KEY)
    .single();
  if (error || !job) throw new Error("작업을 찾지 못했습니다.");
  return job;
}

async function bridgeStatus(supabase: any) {
  const [
    { data: client, error: clientError },
    { data: jobs, error: jobsError },
    { data: runs, error: runsError },
    { data: errors, error: errorsError },
  ] = await Promise.all([
    supabase.from("marketing_bridge_clients")
      .select(
        "client_key,status,last_seen_at,last_success_at,last_error,details",
      )
      .eq("client_key", CLIENT_KEY)
      .maybeSingle(),
    supabase.from("marketing_bridge_jobs")
      .select(
        "id,provider,account,metric_date,status,last_error,updated_at,completed_at",
      )
      .eq("client_key", CLIENT_KEY)
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase.from("marketing_ingestion_runs")
      .select(
        "id,provider,metric_date,status,records_succeeded,records_failed,error_message,details,started_at,finished_at",
      )
      .order("started_at", { ascending: false })
      .limit(12),
    supabase.from("marketing_ingestion_errors")
      .select("run_id,provider,error_code,message,details,created_at")
      .order("created_at", { ascending: false })
      .limit(24),
  ]);
  if (clientError) throw clientError;
  if (jobsError) throw jobsError;
  if (runsError) throw runsError;
  if (errorsError) throw errorsError;
  return {
    runbook_version: RUNBOOK_VERSION,
    client,
    recent_jobs: jobs || [],
    recent_runs: runs || [],
    recent_errors: errors || [],
  };
}

async function claimJob(supabase: any, body: Record<string, unknown>) {
  const job = await getJob(supabase, body.job_id);
  if (job.status === "completed") {
    return { job: publicJob(job), already_completed: true };
  }
  const { data: claimed, error } = await supabase.rpc("claim_grok_bridge_job", {
    p_job_id: job.id,
    p_client_key: CLIENT_KEY,
  });
  if (error) throw error;
  await touchClient(supabase, { status: "working", last_error: null });
  return { job: publicJob(claimed) };
}

async function submissionHash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function submitJob(supabase: any, body: Record<string, unknown>) {
  const job = await getJob(supabase, body.job_id);
  if (job.status === "completed") {
    return { job: publicJob(job), already_completed: true };
  }
  const currentData = await loadData(supabase, String(job.metric_date));
  const stillMissing = deriveMissingTasks(
    currentData.metricsBySlug,
    String(job.metric_date),
  )
    .some((task: Record<string, unknown>) =>
      task.provider === job.provider && task.account === job.account
    );
  if (!stillMissing) {
    const now = new Date().toISOString();
    const result = { verified: true, completion_source: "primary_collector" };
    const { error } = await supabase.from("marketing_bridge_jobs").update({
      status: "completed",
      result,
      last_error: null,
      completed_at: now,
      updated_at: now,
    }).eq("id", job.id);
    if (error) throw error;
    await touchClient(supabase, {
      status: "success",
      last_success_at: now,
      last_error: null,
    });
    return { job_id: job.id, result, already_completed: true };
  }
  const normalized = normalizeSubmission(
    String(job.provider),
    String(job.account),
    body.metrics,
    body.source_totals,
    body.unmapped,
  );
  const submission = {
    metrics: normalized.metrics,
    source_totals: normalized.source_totals,
    unmapped: "unmapped" in normalized ? normalized.unmapped || [] : [],
  };
  const hash = await submissionHash(submission);
  if (job.provider === "smartstore") {
    const { error: salesError } = await supabase.rpc(
      "merge_grok_smartstore_sales",
      {
        p_job_id: job.id,
        p_client_key: CLIENT_KEY,
        p_submission: submission,
        p_submission_hash: hash,
      },
    );
    if (salesError) throw new Error(salesError.message);
  }
  if (job.provider === "coupang") {
    for (const rawMetric of normalized.metrics) {
      const metric = rawMetric as Record<string, any>;
      const wingVisits = Number(metric.wing.visits) || 0;
      const growthVisits = Number(metric.growth.visits) || 0;
      const totalVisits = wingVisits + growthVisits;
      const combinedRate = totalVisits > 0
        ? (
          Number(metric.wing.conversion_rate) * wingVisits +
          Number(metric.growth.conversion_rate) * growthVisits
        ) / totalVisits
        : 0;
      const { error: conversionError } = await supabase.rpc(
        "merge_daily_coupang_conversion",
        {
          p_product_slug: metric.product_slug,
          p_metric_date: job.metric_date,
          p_wing_rate: metric.wing.conversion_rate,
          p_growth_rate: metric.growth.conversion_rate,
          p_combined_rate: Number(combinedRate.toFixed(4)),
          p_source_details: {
            wing_source: metric.wing.conversion_source,
            growth_source: metric.growth.conversion_source,
            bridge_job_id: job.id,
          },
        },
      );
      if (conversionError) throw new Error(conversionError.message);
    }
  }
  const { data: result, error } = await supabase.rpc(
    "accept_grok_bridge_submission",
    {
      p_job_id: job.id,
      p_client_key: CLIENT_KEY,
      p_submission: submission,
      p_submission_hash: hash,
    },
  );
  if (error) throw new Error(error.message);
  return { job_id: job.id, result };
}

async function failJob(supabase: any, body: Record<string, unknown>) {
  const job = await getJob(supabase, body.job_id);
  const message = safeMessage(body.message, "Grok Bot 수집에 실패했습니다.");
  const requestedCode = String(body.error_code || "COLLECTION_FAILED").trim()
    .slice(0, 80);
  const errorCode = requestedCode !== "COLLECTION_FAILED"
    ? requestedCode
    : /captcha|캡차/i.test(message)
    ? "CAPTCHA_REQUIRED"
    : /logged out|login page|로그인|세션 만료/i.test(message)
    ? "LOGIN_EXPIRED"
    : /12:30|12:40|제공되지|확정되지|not available/i.test(message)
    ? "PROVIDER_UNAVAILABLE"
    : requestedCode;
  const { data: result, error } = await supabase.rpc("fail_grok_bridge_job", {
    p_job_id: job.id,
    p_client_key: CLIENT_KEY,
    p_error_code: errorCode,
    p_message: message,
  });
  if (error) throw new Error(error.message);
  return result;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return responseJson({ error: "POST 요청만 허용됩니다." }, 405);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 100_000) {
    return responseJson({ error: "요청 본문이 너무 큽니다." }, 413);
  }
  if (!(await authenticated(request))) {
    return responseJson(
      { error: "인증되지 않은 JangsAI Bridge 요청입니다." },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return responseJson({ error: "Supabase 서버 환경변수가 없습니다." }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let action = "unknown";
  try {
    const body = await request.json().catch(() => ({})) as Record<
      string,
      unknown
    >;
    action = String(body.action || "sync");
    if (action === "bootstrap") {
      const metricDate = metricDateFrom(body);
      const details = heartbeatDetails({ ...body, phase: "onboarding" });
      await touchClient(supabase, {
        status: "ready",
        last_error: null,
        details,
      });
      return responseJson({
        ok: true,
        client_key: CLIENT_KEY,
        runbook: operatorRunbook(),
        initial_sync: body.metric_date === undefined
          ? await syncBacklog(supabase)
          : await syncJobs(supabase, metricDate),
      });
    }
    if (action === "status") {
      return responseJson({ ok: true, ...(await bridgeStatus(supabase)) });
    }
    if (action === "recovery_plan") {
      const metricDate = metricDateFrom(body);
      return responseJson({
        ok: true,
        ...(await recoveryPlan(supabase, metricDate)),
      });
    }
    if (action === "sync") {
      const metricDate = metricDateFrom(body);
      await touchClient(supabase);
      return responseJson({
        ok: true,
        ...(body.metric_date === undefined
          ? await syncBacklog(supabase)
          : await syncJobs(supabase, metricDate)),
      });
    }
    if (action === "claim") {
      return responseJson({ ok: true, ...(await claimJob(supabase, body)) });
    }
    if (action === "submit") {
      return responseJson({ ok: true, ...(await submitJob(supabase, body)) });
    }
    if (action === "fail") {
      return responseJson({ ok: true, ...(await failJob(supabase, body)) });
    }
    if (action === "heartbeat") {
      const details = heartbeatDetails(body);
      if (!details.last_verification) {
        const { data: existingClient } = await supabase
          .from("marketing_bridge_clients")
          .select("details")
          .eq("client_key", CLIENT_KEY)
          .maybeSingle();
        details.last_verification =
          existingClient?.details?.last_verification || null;
      }
      await touchClient(supabase, {
        status: details.phase === "needs_login" ? "needs_login" : "ready",
        last_error: null,
        details,
      });
      const runbookUpdateRequired = details.runbook_version !== RUNBOOK_VERSION;
      return responseJson({
        ok: true,
        client_key: CLIENT_KEY,
        runbook_version: RUNBOOK_VERSION,
        runbook_update_required: runbookUpdateRequired,
        refresh_action: runbookUpdateRequired ? "bootstrap" : null,
        ...(runbookUpdateRequired
          ? { updated_runbook: operatorRunbook() }
          : {}),
        server_time: new Date().toISOString(),
      });
    }
    return responseJson({ error: "허용되지 않은 Bridge 작업입니다." }, 400);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object"
      ? JSON.stringify(error)
      : String(error);
    if (!["status", "recovery_plan"].includes(action)) {
      await touchClient(supabase, { status: "error", last_error: message })
        .catch(() => {});
    }
    return responseJson({ error: message }, 400);
  }
});
