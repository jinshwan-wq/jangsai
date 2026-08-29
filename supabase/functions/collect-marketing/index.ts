import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildNaverBlogMetricPatch,
  parseNaverBlogId,
  parseNaverBlogVisitorXml,
} from "./blog-visitors.mjs";
import {
  buildNaverAdAccountAllocation,
  classifyNaverAdProduct,
  extractNaverAdTitle,
  PRODUCT_AD_TITLE_RULES,
} from "./naver-ad-spend.mjs";
import { parseNaverKeywordVolumes } from "./naver-keywords.mjs";

type Mapping = {
  id: string;
  product_id: string;
  provider: string;
  external_id: string | null;
  config: Record<string, unknown>;
};

type MetricPatch = Record<string, number | Record<string, boolean>>;
type CollectionResult = {
  metrics?: MetricPatch;
  keywordSnapshots?: Array<{ keyword: string; search_volume: number }>;
  contentMetrics?: Array<{ content_id: string; views: number }>;
  contentErrors?: string[];
  expectedContentCount?: number;
  warnings?: string[];
};
type Cafe24Connection = {
  mall_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  scopes: string[];
  status: string;
};

const ALLOWED_METRICS = new Set([
  "blog_views",
  "cafe_views",
  "content_views",
  "keyword_search_volume",
  "cafe24_visits",
  "smartstore_visits",
  "coupang_visits",
  "coupang_wing_visits",
  "coupang_growth_visits",
  "tracked_visits",
  "tracked_orders",
  "cafe24_orders",
  "cafe24_revenue",
  "smartstore_orders",
  "smartstore_revenue",
  "coupang_orders",
  "coupang_revenue",
  "reported_total_revenue",
  "ad_spend",
  "coupang_wing_orders",
  "coupang_wing_revenue",
  "coupang_growth_orders",
  "coupang_growth_revenue",
]);

const PROVIDER_TOKEN_ENV: Record<string, string> = {
  cafe24: "CAFE24_API_TOKEN",
  smartstore: "SMARTSTORE_API_TOKEN",
  coupang: "COUPANG_API_TOKEN",
  naver_search: "NAVER_SEARCH_API_TOKEN",
  naver_blog: "NAVER_CONTENT_API_TOKEN",
  naver_cafe: "NAVER_CONTENT_API_TOKEN",
  generic_json: "GENERIC_MARKETING_API_TOKEN",
};

const NAVER_AD_CREDENTIALS: Record<
  string,
  { apiKey: string; secretKey: string }
> = {
  innerium: {
    apiKey: "NAVER_AD_INNERIUM_API_KEY",
    secretKey: "NAVER_AD_INNERIUM_SECRET_KEY",
  },
  yural: {
    apiKey: "NAVER_AD_YURAL_API_KEY",
    secretKey: "NAVER_AD_YURAL_SECRET_KEY",
  },
};
const AD_REPORTING_TOLERANCE_WON = 10;

function previousKstDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = new Date(`${formatter.format(new Date())}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - 1);
  return today.toISOString().slice(0, 10);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertPublicHttpsUrl(value: unknown) {
  const url = new URL(String(value || ""));
  const host = url.hostname.toLowerCase();
  const configuredHosts = (Deno.env.get("ALLOWED_MARKETING_HOSTS") || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const knownHost = host === "ca-api.cafe24data.com" ||
    host === "api.commerce.naver.com" ||
    host === "api-gateway.coupang.com" ||
    host.endsWith(".cafe24api.com");
  if (url.protocol !== "https:") {
    throw new Error("수집 주소는 HTTPS만 허용됩니다.");
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host)
  ) {
    throw new Error("내부 네트워크 주소는 수집 대상으로 사용할 수 없습니다.");
  }
  if (!knownHost && !configuredHosts.includes(host)) {
    throw new Error("허용 목록에 등록되지 않은 수집 주소입니다.");
  }
  return url;
}

function readPath(payload: unknown, path: unknown) {
  if (!path || typeof path !== "string") return payload;
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, payload);
}

function normalizeMetrics(payload: unknown, mapping: Mapping): MetricPatch {
  const configuredPath = mapping.config?.result_path;
  const selected = readPath(payload, configuredPath);
  const candidates = Array.isArray(selected)
    ? selected
    : Array.isArray((selected as Record<string, unknown>)?.records)
    ? (selected as Record<string, unknown>).records as unknown[]
    : [selected];

  const matching = candidates.find((item) => {
    if (!mapping.external_id || !item || typeof item !== "object") return true;
    const record = item as Record<string, unknown>;
    return String(
      record.external_id ?? record.product_id ?? record.productId ?? "",
    ) === mapping.external_id;
  });
  const raw = matching && typeof matching === "object"
    ? ((matching as Record<string, unknown>).metrics || matching) as Record<
      string,
      unknown
    >
    : {};

  const fieldMap =
    mapping.config?.field_map && typeof mapping.config.field_map === "object"
      ? mapping.config.field_map as Record<string, unknown>
      : {};
  const patch: MetricPatch = {};
  const completeness: Record<string, boolean> = {};

  for (const metric of ALLOWED_METRICS) {
    const sourceKey = String(fieldMap[metric] || metric);
    if (
      !(sourceKey in raw) || raw[sourceKey] === null || raw[sourceKey] === ""
    ) continue;
    const value = Number(raw[sourceKey]);
    if (!Number.isFinite(value) || value < 0) continue;
    patch[metric] = Math.round(value);
    completeness[metric] = true;
  }

  patch.data_completeness = completeness;
  return patch;
}

async function hmacBase64(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function naverSearchHeaders(
  method: string,
  uri: string,
  customerId?: string,
  credentialsKey?: string,
) {
  const credentialNames = credentialsKey
    ? NAVER_AD_CREDENTIALS[credentialsKey]
    : null;
  if (credentialsKey && !credentialNames) {
    throw new Error("허용되지 않은 네이버 광고 인증 설정입니다.");
  }
  const apiKey = Deno.env.get(
    credentialNames?.apiKey || "NAVER_SEARCH_API_KEY",
  );
  const secretKey = Deno.env.get(
    credentialNames?.secretKey || "NAVER_SEARCH_SECRET_KEY",
  );
  const targetCustomerId = customerId ||
    Deno.env.get("NAVER_SEARCH_CUSTOMER_ID");
  if (!apiKey || !secretKey || !targetCustomerId) {
    throw new Error("네이버 검색광고 API 인증값이 설정되지 않았습니다.");
  }
  const timestamp = Date.now().toString();
  return {
    "X-Timestamp": timestamp,
    "X-API-KEY": apiKey,
    "X-Customer": targetCustomerId,
    "X-Signature": await hmacBase64(secretKey, `${timestamp}.${method}.${uri}`),
  };
}

async function collectNaverSearch(mapping: Mapping): Promise<CollectionResult> {
  const configuredKeywords = Array.isArray(mapping.config?.keywords)
    ? mapping.config.keywords.map(String)
    : [mapping.external_id].filter(Boolean).map(String);
  if (!configuredKeywords.length) {
    throw new Error("브랜드 검색 키워드가 설정되지 않았습니다.");
  }

  const uri = "/keywordstool";
  const url = new URL(`https://api.searchad.naver.com${uri}`);
  url.searchParams.set(
    "hintKeywords",
    configuredKeywords.map((keyword) => keyword.replace(/\s+/g, "")).join(","),
  );
  url.searchParams.set("showDetail", "1");
  const response = await fetch(url, {
    headers: await naverSearchHeaders("GET", uri),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `네이버 검색량 응답 오류 (${response.status}): ${
        payload?.title || payload?.message || payload?.code || "응답 오류"
      }`,
    );
  }
  const volumes = parseNaverKeywordVolumes(
    configuredKeywords,
    payload.keywordList,
  );
  return {
    keywordSnapshots: volumes,
  };
}

function sumNaverSalesAmount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + sumNaverSalesAmount(item), 0);
  }
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value as Record<string, unknown>).reduce(
    (sum, [key, item]) => {
      if (key === "salesAmt") {
        const amount = Number(item);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }
      return sum + sumNaverSalesAmount(item);
    },
    0,
  );
}

let naverAdNextRequestAt = 0;
let naverAdRequestCount = 0;

async function waitForNaverAdRequestSlot() {
  const now = Date.now();
  if (naverAdNextRequestAt > now) await wait(naverAdNextRequestAt - now);
  naverAdRequestCount++;
  const periodicPause = naverAdRequestCount % 12 === 0 ? 1_000 : 0;
  naverAdNextRequestAt = Date.now() + 250 + periodicPause;
}

function naverAdRetryDelay(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("retry-after") || "";
  const retrySeconds = Number(retryAfter);
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return Math.min(20_000, retrySeconds * 1_000);
  }
  const retryAt = Date.parse(retryAfter);
  if (Number.isFinite(retryAt) && retryAt > Date.now()) {
    return Math.min(20_000, retryAt - Date.now());
  }
  return Math.min(16_000, 2_000 * (2 ** attempt)) +
    Math.floor(Math.random() * 300);
}

async function naverAdApiGet(
  uri: string,
  customerId: string,
  credentialsKey: string,
  params: Record<string, string> = {},
  deadlineAt = Number.POSITIVE_INFINITY,
) {
  const url = new URL(`https://api.searchad.naver.com${uri}`);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `네이버 광고계정 ${customerId} 광고비 수집 시간 예산을 초과했습니다.`,
      );
    }
    let response: Response | null = null;
    try {
      await waitForNaverAdRequestSlot();
      const requestTimeout = Math.max(
        1,
        Math.min(uri === "/stats" ? 30_000 : 20_000, deadlineAt - Date.now()),
      );
      response = await fetch(url, {
        headers: await naverSearchHeaders(
          "GET",
          uri,
          customerId,
          credentialsKey,
        ),
        signal: AbortSignal.timeout(requestTimeout),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const message = payload?.title || payload?.message || payload?.code ||
        "응답 오류";
      lastError = new Error(
        `네이버 광고계정 ${customerId} ${uri} 조회 실패 (${response.status}): ${message}`,
      );
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 4) throw lastError;
    } catch (error) {
      lastError = error;
      const retryable = response?.status === 429 ||
        Boolean(response && response.status >= 500) ||
        /timed out|network|fetch/i.test(
          error instanceof Error ? error.message : String(error),
        );
      if (!retryable || attempt === 4) throw error;
    }
    const retryDelay = naverAdRetryDelay(response, attempt);
    if (Date.now() + retryDelay >= deadlineAt) {
      throw new Error(
        `네이버 광고계정 ${customerId} 광고비 수집 시간 예산을 초과했습니다.`,
      );
    }
    await wait(retryDelay);
  }
  throw lastError ||
    new Error(`네이버 광고계정 ${customerId} ${uri} 조회 실패`);
}

async function collectNaverEntitySpend(
  ids: string[],
  customerId: string,
  metricDate: string,
  credentialsKey: string,
  deadlineAt: number,
) {
  const spendById = new Map<string, number>();
  let total = 0;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const payload = await naverAdApiGet("/stats", customerId, credentialsKey, {
      ids: chunk.join(","),
      fields: JSON.stringify(["salesAmt"]),
      timeRange: JSON.stringify({ since: metricDate, until: metricDate }),
      timeIncrement: "allDays",
    }, deadlineAt);
    total += Math.max(0, Math.round(sumNaverSalesAmount(payload)));
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
      ? payload.data
      : [payload];
    rows.forEach((row: Record<string, unknown>, index: number) => {
      const fallbackId = rows.length === chunk.length
        ? chunk[index]
        : chunk.length === 1
        ? chunk[0]
        : "";
      const id = String(
        row?.id || row?.nccAdId || row?.nccCampaignId || row?.nccAdgroupId ||
          fallbackId,
      ).trim();
      if (!id) return;
      spendById.set(id, Math.max(0, Math.round(sumNaverSalesAmount(row))));
    });
  }
  return { spendById, total };
}

async function collectNaverAdSpend(
  accountKey: string,
  customerId: string,
  metricDate: string,
  credentialsKey: string,
  deadlineAt: number,
) {
  const campaigns = await naverAdApiGet(
    "/ncc/campaigns",
    customerId,
    credentialsKey,
    {},
    deadlineAt,
  );
  const campaignNames = new Map(
    (Array.isArray(campaigns) ? campaigns : []).map((
      campaign: Record<string, unknown>,
    ) => [
      String(campaign.nccCampaignId || ""),
      String(campaign.name || ""),
    ]),
  );
  const campaignIds = (Array.isArray(campaigns) ? campaigns : [])
    .map((campaign: Record<string, unknown>) =>
      String(campaign.nccCampaignId || "")
    )
    .filter(Boolean);
  const campaignStats = await collectNaverEntitySpend(
    campaignIds,
    customerId,
    metricDate,
    credentialsKey,
    deadlineAt,
  );
  const brandTotal = campaignStats.total;

  const adGroups: Record<string, unknown>[] = [];
  for (const campaignId of campaignIds) {
    const payload = await naverAdApiGet(
      "/ncc/adgroups",
      customerId,
      credentialsKey,
      {
        nccCampaignId: campaignId,
      },
      deadlineAt,
    );
    if (Array.isArray(payload)) adGroups.push(...payload);
  }

  const adgroupIds = [
    ...new Set(
      adGroups.map((group) => String(group.nccAdgroupId || "").trim()).filter(
        Boolean,
      ),
    ),
  ];
  const adgroupStats = await collectNaverEntitySpend(
    adgroupIds,
    customerId,
    metricDate,
    credentialsKey,
    deadlineAt,
  );
  const spendEntities: Record<string, unknown>[] = [];
  const spendByEntityId = new Map<string, number>();
  const groupsNeedingAds: Record<string, unknown>[] = [];

  for (const group of adGroups) {
    const adgroupId = String(group.nccAdgroupId || "").trim();
    if (!adgroupId) continue;
    const groupSpend = adgroupStats.spendById.get(adgroupId) || 0;
    if (groupSpend <= 0) continue;
    const classificationContext = {
      campaignName: campaignNames.get(String(group.nccCampaignId || "")) || "",
      adgroupName: String(group.name || ""),
    };
    const groupMatch = classifyNaverAdProduct(
      extractNaverAdTitle({ classificationContext }),
    );
    if (groupMatch.product_slug) {
      spendEntities.push({
        nccAdId: adgroupId,
        classificationContext,
        sourceLevel: "adgroup",
      });
      spendByEntityId.set(adgroupId, groupSpend);
    } else {
      groupsNeedingAds.push(group);
    }
  }

  const ads: Record<string, unknown>[] = [];
  for (const group of groupsNeedingAds) {
    const adgroupId = String(group.nccAdgroupId || "").trim();
    const payload = await naverAdApiGet(
      "/ncc/ads",
      customerId,
      credentialsKey,
      {
        nccAdgroupId: adgroupId,
      },
      deadlineAt,
    );
    if (Array.isArray(payload)) {
      ads.push(...payload.map((ad: Record<string, unknown>) => ({
        ...ad,
        classificationContext: {
          campaignName: campaignNames.get(String(group.nccCampaignId || "")) ||
            "",
          adgroupName: String(group.name || ""),
        },
      })));
    }
  }
  const adIds = [
    ...new Set(ads.map((ad) => String(ad.nccAdId || "")).filter(Boolean)),
  ];
  const adStats = await collectNaverEntitySpend(
    adIds,
    customerId,
    metricDate,
    credentialsKey,
    deadlineAt,
  );
  ads.forEach((ad) => spendEntities.push(ad));
  adStats.spendById.forEach((spend, id) => spendByEntityId.set(id, spend));
  return buildNaverAdAccountAllocation(
    accountKey,
    spendEntities,
    spendByEntityId,
    brandTotal,
  );
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const cafe24AccessTokenCache = new Map<
  string,
  { token: string; expiresAt: number }
>();

async function getCafe24AccessToken(
  supabase: any,
  mallId: string,
  forceRefresh = false,
) {
  const cached = cafe24AccessTokenCache.get(mallId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const { data, error } = await supabase.rpc("get_cafe24_connection", {
    p_mall_id: mallId,
  });
  if (error || !data) throw new Error(`${mallId} Cafe24 연결 정보가 없습니다.`);
  const connection = data as Cafe24Connection;
  const accessExpiresAt = new Date(connection.access_token_expires_at)
    .getTime();
  if (
    !forceRefresh && connection.access_token &&
    accessExpiresAt > Date.now() + 5 * 60_000
  ) {
    cafe24AccessTokenCache.set(mallId, {
      token: connection.access_token,
      expiresAt: accessExpiresAt,
    });
    return connection.access_token;
  }

  const clientId = Deno.env.get("CAFE24_CLIENT_ID");
  const clientSecret = Deno.env.get("CAFE24_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Cafe24 개발자 앱 인증값이 설정되지 않았습니다.");
  }
  if (new Date(connection.refresh_token_expires_at).getTime() <= Date.now()) {
    throw new Error(
      `${mallId} Cafe24 연결 갱신 기한이 만료되었습니다. 다시 연결하세요.`,
    );
  }

  const response = await fetch(
    `https://${mallId}.cafe24api.com/api/v2/oauth/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refresh_token,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error(`${mallId} Cafe24 토큰 갱신 실패 (${response.status})`);
  }

  const { error: saveError } = await supabase.rpc("save_cafe24_connection", {
    p_mall_id: mallId,
    p_access_token: payload.access_token,
    p_refresh_token: payload.refresh_token,
    p_access_token_expires_at: payload.expires_at,
    p_refresh_token_expires_at: payload.refresh_token_expires_at,
    p_scopes: payload.scopes || connection.scopes || [],
  });
  if (saveError) throw new Error(`${mallId} Cafe24 갱신 토큰 저장 실패`);
  const expiresAt = new Date(payload.expires_at).getTime();
  cafe24AccessTokenCache.set(mallId, {
    token: payload.access_token,
    expiresAt,
  });
  return payload.access_token as string;
}

async function fetchCafe24Get(
  url: URL,
  mallId: string,
  supabase: any,
  tokenRef: { value: string },
) {
  const request = () =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${tokenRef.value}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
  let response = await request();
  if (response.status !== 401) return response;

  cafe24AccessTokenCache.delete(mallId);
  tokenRef.value = await getCafe24AccessToken(supabase, mallId, true);
  response = await request();
  return response;
}

function cafe24ItemRevenue(item: Record<string, unknown>) {
  const paymentAmount = numericValue(item.payment_amount);
  if (paymentAmount !== null) return Math.max(0, paymentAmount);
  const quantity = Math.max(0, numericValue(item.quantity) || 0);
  const unitPrice = (numericValue(item.product_price) || 0) +
    (numericValue(item.option_price) || 0);
  const discounts = [
    item.additional_discount_price,
    item.coupon_discount_price,
    item.app_item_discount_amount,
    item.market_discount_amount,
  ].reduce<number>((sum, value) => sum + (numericValue(value) || 0), 0);
  return Math.max(0, unitPrice * quantity - discounts);
}

function findRecordArray(
  value: unknown,
  requiredKey: string,
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    if (
      !value.length ||
      value.some((item) =>
        item && typeof item === "object" && requiredKey in item
      )
    ) {
      return value as Record<string, unknown>[];
    }
    for (const item of value) {
      const nested = findRecordArray(item, requiredKey);
      if (nested.length) return nested;
    }
  } else if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      const nested = findRecordArray(nestedValue, requiredKey);
      if (nested.length) return nested;
    }
  }
  return [];
}

async function collectCafe24ProductViews(
  mallId: string,
  productNos: Set<string>,
  metricDate: string,
  tokenRef: { value: string },
  supabase: any,
) {
  let offset = 0;
  let views = 0;
  const found = new Set<string>();
  while (offset <= 15_000) {
    const url = new URL("https://ca-api.cafe24data.com/products/view");
    url.searchParams.set("mall_id", mallId);
    url.searchParams.set("shop_no", "1");
    url.searchParams.set("start_date", metricDate);
    url.searchParams.set("end_date", metricDate);
    url.searchParams.set("device_type", "total");
    url.searchParams.set("timezone", "Asia/Seoul");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
    const response = await fetchCafe24Get(url, mallId, supabase, tokenRef);
    if (!response.ok) {
      console.warn(
        `${mallId} Cafe24 상품 조회수 응답 오류 (${response.status})`,
      );
      return null;
    }
    const payload = await response.json();
    const records = findRecordArray(payload, "product_no");
    for (const record of records) {
      const productNo = String(record.product_no);
      if (!productNos.has(productNo)) continue;
      found.add(productNo);
      views += Math.max(0, numericValue(record.count) || 0);
    }
    if (found.size === productNos.size || records.length < 1000) return views;
    offset += 1000;
  }
  return views;
}

async function collectCafe24(
  mapping: Mapping,
  metricDate: string,
  supabase: any,
): Promise<CollectionResult> {
  const mallId = String(mapping.config?.mall_id || "").trim().toLowerCase();
  const configuredProductNos = Array.isArray(mapping.config?.product_nos)
    ? mapping.config.product_nos.map(String)
    : [mapping.config?.product_no || mapping.external_id].filter(Boolean).map(
      String,
    );
  const productNos = new Set(
    configuredProductNos.map((value) => value.trim()).filter((value) =>
      /^\d+$/.test(value)
    ),
  );
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(mallId)) {
    throw new Error("Cafe24 쇼핑몰 ID가 설정되지 않았습니다.");
  }
  if (!productNos.size) {
    throw new Error("Cafe24 상품번호가 설정되지 않았습니다.");
  }
  const tokenRef = { value: await getCafe24AccessToken(supabase, mallId) };

  let offset = 0;
  let salesQuantity = 0;
  let revenue = 0;
  while (offset <= 15_000) {
    const url = new URL(`https://${mallId}.cafe24api.com/api/v2/admin/orders`);
    url.searchParams.set("start_date", `${metricDate} 00:00:00`);
    url.searchParams.set("end_date", `${metricDate} 23:59:59`);
    url.searchParams.set("date_type", "pay_date");
    url.searchParams.set("payment_status", "P");
    url.searchParams.set("product_no", [...productNos].join(","));
    url.searchParams.set("embed", "items");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(offset));
    const response = await fetchCafe24Get(url, mallId, supabase, tokenRef);
    if (!response.ok) {
      throw new Error(`${mallId} Cafe24 주문 응답 오류 (${response.status})`);
    }
    const payload = await response.json();
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    for (const order of orders) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const rawItem of items) {
        const item = rawItem as Record<string, unknown>;
        if (!productNos.has(String(item.product_no))) continue;
        if (["C1", "C2", "C3", "E1"].includes(String(item.status_code || ""))) {
          continue;
        }
        const quantity = Math.max(0, numericValue(item.quantity) || 0);
        salesQuantity += quantity;
        revenue += cafe24ItemRevenue(item);
      }
    }
    if (orders.length < 1000) break;
    offset += 1000;
  }

  const visits = await collectCafe24ProductViews(
    mallId,
    productNos,
    metricDate,
    tokenRef,
    supabase,
  );
  const metrics: MetricPatch = {
    cafe24_orders: Math.round(salesQuantity),
    cafe24_revenue: Math.round(revenue),
    data_completeness: {
      cafe24_orders: true,
      cafe24_revenue: true,
      ...(visits === null ? {} : { cafe24_visits: true }),
    },
  };
  if (visits !== null) metrics.cafe24_visits = Math.round(visits);
  return {
    metrics,
    warnings: visits === null ? [`${mallId} Cafe24 상품 방문수 수집 실패`] : [],
  };
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchNaverBlogVisitors(blogId: string, metricDate: string) {
  const url = new URL("https://blog.naver.com/NVisitorgp4Ajax.naver");
  url.searchParams.set("blogId", blogId);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (compatible; JangsAIMarketingCollector/1.0)",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseNaverBlogVisitorXml(await response.text(), metricDate);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(attempt * 350);
    }
  }

  const reason = lastError instanceof Error
    ? lastError.message
    : String(lastError);
  throw new Error(`${blogId} 방문자 수 수집 실패: ${reason}`);
}

async function collectNaverBlog(
  mapping: Mapping,
  metricDate: string,
  supabase: any,
): Promise<CollectionResult> {
  const { data: contents, error } = await supabase
    .from("marketing_contents")
    .select("id,url")
    .eq("product_id", mapping.product_id)
    .eq("channel", "naver_blog")
    .eq("is_active", true)
    .order("url");
  if (error) throw error;
  if (!contents?.length) {
    throw new Error("활성 네이버 블로그가 등록되지 않았습니다.");
  }

  const contentMetrics: Array<{ content_id: string; views: number }> = [];
  const contentErrors: string[] = [];
  const concurrency = 3;

  for (let offset = 0; offset < contents.length; offset += concurrency) {
    const batch = contents.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (content: { id: string; url: string }) => ({
        content_id: content.id,
        views: await fetchNaverBlogVisitors(
          parseNaverBlogId(content.url),
          metricDate,
        ),
      })),
    );
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        contentMetrics.push(result.value);
      } else {
        const blogId = (() => {
          try {
            return parseNaverBlogId(batch[index].url);
          } catch {
            return batch[index].url;
          }
        })();
        const reason = result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
        contentErrors.push(`${blogId}: ${reason}`);
      }
    });
    if (offset + concurrency < contents.length) await wait(200);
  }

  return {
    contentMetrics,
    contentErrors,
    expectedContentCount: contents.length,
  };
}

async function collectMapping(
  mapping: Mapping,
  metricDate: string,
  supabase: any,
): Promise<CollectionResult> {
  if (mapping.provider === "google_sheets") {
    throw new Error("Google Sheets는 전환 기간의 수동 보조 수집원입니다.");
  }
  if (mapping.provider === "naver_search") return collectNaverSearch(mapping);
  if (mapping.provider === "cafe24") {
    return collectCafe24(mapping, metricDate, supabase);
  }
  if (mapping.provider === "naver_blog") {
    return collectNaverBlog(mapping, metricDate, supabase);
  }

  const endpoint = mapping.config?.endpoint;
  if (!endpoint) {
    throw new Error(`${mapping.provider} 수집 주소가 설정되지 않았습니다.`);
  }
  const url = assertPublicHttpsUrl(endpoint);
  url.searchParams.set(
    String(mapping.config?.date_param || "metric_date"),
    metricDate,
  );
  if (mapping.external_id) {
    url.searchParams.set(
      String(mapping.config?.id_param || "external_id"),
      mapping.external_id,
    );
  }

  const envName = PROVIDER_TOKEN_ENV[mapping.provider] || "";
  const token = envName ? Deno.env.get(envName) : null;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `${
      String(mapping.config?.auth_scheme || "Bearer")
    } ${token}`;
  }

  const response = await fetch(url, {
    method: String(mapping.config?.method || "GET"),
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${mapping.provider} 응답 오류 (${response.status})`);
  }
  const patch = normalizeMetrics(await response.json(), mapping);
  const metricCount =
    Object.keys(patch).filter((key) => key !== "data_completeness").length;
  if (!metricCount) {
    throw new Error(`${mapping.provider} 응답에 사용할 지표가 없습니다.`);
  }
  return { metrics: patch };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST 요청만 허용됩니다." }), {
      status: 405,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Supabase 서버 환경변수가 없습니다." }),
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const metricDate = isDate(body.metric_date)
    ? body.metric_date
    : previousKstDate();
  const requestedProviders = Array.isArray(body.providers)
    ? new Set(body.providers.map(String))
    : null;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: tokenValid, error: tokenError } = await supabase.rpc(
    "verify_marketing_collector_token",
    { p_token: request.headers.get("x-collector-secret") || "" },
  );
  if (tokenError || !tokenValid) {
    return new Response(
      JSON.stringify({ error: "인증되지 않은 수집 요청입니다." }),
      { status: 401 },
    );
  }

  const leaseKey = `collect-marketing:${metricDate}`;
  const leaseOwner = crypto.randomUUID();
  const { data: leaseAcquired, error: leaseError } = await supabase.rpc(
    "claim_marketing_collector_lease",
    {
      p_lease_key: leaseKey,
      p_owner_token: leaseOwner,
      p_ttl_seconds: 20 * 60,
    },
  );
  if (leaseError) {
    return new Response(JSON.stringify({ error: leaseError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (!leaseAcquired) {
    return new Response(
      JSON.stringify({
        ok: true,
        skipped: true,
        metric_date: metricDate,
        message: "같은 날짜의 수집이 이미 실행 중입니다.",
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  try {
    let mappingQuery = supabase
      .from("marketing_source_mappings")
      .select("id,product_id,provider,external_id,config")
      .eq("is_enabled", true);
    if (requestedProviders?.size) {
      mappingQuery = mappingQuery.in("provider", [...requestedProviders]);
    }
    const { data: mappings, error: mappingError } = await mappingQuery;
    if (mappingError) {
      return new Response(JSON.stringify({ error: mappingError.message }), {
        status: 500,
      });
    }

    const grouped = new Map<string, Mapping[]>();
    for (const mapping of (mappings || []) as Mapping[]) {
      if (!grouped.has(mapping.provider)) grouped.set(mapping.provider, []);
      grouped.get(mapping.provider)!.push(mapping);
    }

    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await Promise.all([
      supabase
        .from("marketing_ingestion_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message:
            "수집 함수 제한시간을 초과해 다음 실행에서 종료 처리했습니다.",
        })
        .eq("status", "running")
        .lt("started_at", staleCutoff)
        .in("provider", [...grouped.keys()]),
      supabase
        .from("marketing_ingestion_batches")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
        })
        .eq("status", "running")
        .lt("started_at", staleCutoff),
    ]);

    const expectedProviders = [...grouped.keys()];
    const { data: batch, error: batchError } = await supabase
      .from("marketing_ingestion_batches")
      .insert({
        metric_date: metricDate,
        expected_providers: expectedProviders,
        trigger_type: body.trigger || "manual",
        details: { mapping_count: mappings?.length || 0 },
      })
      .select("id")
      .single();
    if (batchError || !batch) {
      return new Response(
        JSON.stringify({ error: batchError?.message || "수집 배치 생성 실패" }),
        { status: 500 },
      );
    }

    const summary: Record<string, unknown>[] = [];
    if (!grouped.size) {
      await supabase
        .from("marketing_ingestion_batches")
        .update({
          status: "skipped",
          finished_at: new Date().toISOString(),
          details: { mapping_count: 0, reason: "no_enabled_mappings" },
        })
        .eq("id", batch.id);
    }
    for (const [provider, providerMappings] of grouped) {
      const { data: run, error: runError } = await supabase
        .from("marketing_ingestion_runs")
        .insert({
          batch_id: batch.id,
          provider,
          metric_date: metricDate,
          details: { trigger: body.trigger || "manual" },
        })
        .select("id")
        .single();
      if (runError || !run) {
        summary.push({
          provider,
          status: "failed",
          error: runError?.message || "실행 이력 생성 실패",
        });
        continue;
      }

      let succeeded = 0;
      let failed = 0;
      const runErrors: string[] = [];
      const runWarnings: string[] = [];
      for (const mapping of providerMappings) {
        try {
          const collection = await collectMapping(
            mapping,
            metricDate,
            supabase,
          );
          runWarnings.push(...(collection.warnings || []));
          if (provider === "naver_blog" && collection.contentErrors?.length) {
            runWarnings.push(
              `${mapping.product_id} 블로그 ${collection.contentErrors.length}개 수집 실패`,
            );
          }
          const sourceDetails = {
            provider,
            mapping_id: mapping.id,
            collected_at: new Date().toISOString(),
          };
          let error = null;
          if (provider === "naver_search") {
            const snapshots = collection.keywordSnapshots || [];
            if (!snapshots.length) {
              throw new Error("일치하는 키워드별 검색량이 없습니다.");
            }
            ({ error } = await supabase.from("keyword_search_snapshots").upsert(
              snapshots.map((
                snapshot: { keyword: string; search_volume: number },
              ) => ({
                product_id: mapping.product_id,
                snapshot_date: metricDate,
                keyword: snapshot.keyword,
                window_days: 30,
                search_volume: snapshot.search_volume,
                provider,
                source_details: sourceDetails,
                collected_at: new Date().toISOString(),
              })),
              { onConflict: "product_id,snapshot_date,keyword,provider" },
            ));
            if (!error) {
              const totalSearchVolume = snapshots.reduce(
                (sum, snapshot) => sum + snapshot.search_volume,
                0,
              );
              ({ error } = await supabase.rpc("merge_daily_marketing_metric", {
                p_product_id: mapping.product_id,
                p_metric_date: metricDate,
                p_patch: {
                  keyword_search_volume: totalSearchVolume,
                  data_completeness: { keyword_search_volume: true },
                },
                p_source: "api",
                p_source_details: {
                  naver_search: {
                    ...sourceDetails,
                    collector: "naver_keyword_tool",
                    keyword_count: snapshots.length,
                  },
                },
                p_collection_status: "partial",
              }));
            }
          } else if (provider === "naver_blog") {
            const contentMetrics = collection.contentMetrics || [];
            if (contentMetrics.length) {
              ({ error } = await supabase.from("daily_content_metrics").upsert(
                contentMetrics.map((item) => ({
                  content_id: item.content_id,
                  metric_date: metricDate,
                  views: item.views,
                  source: "api",
                  updated_at: new Date().toISOString(),
                })),
                { onConflict: "content_id,metric_date" },
              ));
              if (error) throw error;
            }
            const contentErrors = collection.contentErrors || [];
            const expectedCount = collection.expectedContentCount || 0;
            const patch = buildNaverBlogMetricPatch(
              contentMetrics,
              contentErrors,
              expectedCount,
            );
            ({ error } = await supabase.rpc("merge_daily_marketing_metric", {
              p_product_id: mapping.product_id,
              p_metric_date: metricDate,
              p_patch: patch,
              p_source: "api",
              p_source_details: {
                naver_blog: {
                  ...sourceDetails,
                  collector: "naver_blog_daily_visitors",
                  blog_count: contentMetrics.length,
                },
              },
              p_collection_status: "partial",
            }));
          } else {
            const patch = collection.metrics || {};
            const hasCoupangSplit = Object.keys(patch).some((key) =>
                key.startsWith("coupang_wing_") ||
                key.startsWith("coupang_growth_")
              );
            if (hasCoupangSplit) {
              ({ error } = await supabase.rpc("merge_daily_coupang_snapshot", {
                p_product_id: mapping.product_id,
                p_metric_date: metricDate,
                p_patch: patch,
                p_source: "api",
                p_source_details: sourceDetails,
              }));
            } else {
              ({ error } = await supabase.rpc("merge_daily_marketing_metric", {
                p_product_id: mapping.product_id,
                p_metric_date: metricDate,
                p_patch: patch,
                p_source: "api",
                p_source_details: { [provider]: sourceDetails },
                p_collection_status: "partial",
              }));
            }
          }
          if (error) throw error;
          await supabase
            .from("marketing_source_mappings")
            .update({
              last_collected_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", mapping.id);
          succeeded++;
        } catch (error) {
          failed++;
          const message = error instanceof Error
            ? error.message
            : String(error);
          runErrors.push(message);
          await supabase.from("marketing_ingestion_errors").insert({
            run_id: run.id,
            product_id: mapping.product_id,
            provider,
            error_code: "COLLECTION_FAILED",
            message,
            details: {
              mapping_id: mapping.id,
              external_id: mapping.external_id,
            },
          });
        }
      }

      if (provider === "naver_search") {
        const adAccounts = new Map<
          string,
          { customerId: string; credentialsKey: string }
        >();
        for (const mapping of providerMappings) {
          const customerId = String(mapping.config?.ad_customer_id || "")
            .trim();
          const credentialsKey = String(
            mapping.config?.ad_credentials_key || "",
          ).trim();
          if (
            /^\d+$/.test(customerId) && NAVER_AD_CREDENTIALS[credentialsKey]
          ) {
            adAccounts.set(`${customerId}:${credentialsKey}`, {
              customerId,
              credentialsKey,
            });
          }
        }
        const accountAllocations: Record<string, any>[] = [];
        const adCollectionDeadlineAt = Date.now() + 6 * 60 * 1000;
        for (const { customerId, credentialsKey } of adAccounts.values()) {
          try {
            const allocation = await collectNaverAdSpend(
              `${credentialsKey}:${customerId}`,
              customerId,
              metricDate,
              credentialsKey,
              adCollectionDeadlineAt,
            );
            accountAllocations.push({ ...allocation, customer_id: customerId });
          } catch (error) {
            failed++;
            const message = error instanceof Error
              ? error.message
              : String(error);
            runErrors.push(message);
            await supabase.from("marketing_ingestion_errors").insert({
              run_id: run.id,
              provider,
              error_code: "AD_SPEND_COLLECTION_FAILED",
              message,
              details: {
                customer_id: customerId,
                credentials_key: credentialsKey,
              },
            });
          }
        }
        if (
          accountAllocations.length === adAccounts.size &&
          accountAllocations.length > 0
        ) {
          const productSpend: Record<string, number> = {};
          for (
            const rules of Object.values(PRODUCT_AD_TITLE_RULES) as Array<
              ReadonlyArray<{ product_slug: string }>
            >
          ) {
            rules.forEach((rule) => {
              productSpend[rule.product_slug] = 0;
            });
          }
          accountAllocations.forEach((allocation) => {
            Object.entries(allocation.product_spend).forEach(
              ([slug, spend]) => {
                productSpend[slug] = (productSpend[slug] || 0) +
                  Number(spend || 0);
              },
            );
          });
          const unclassifiedSpend = accountAllocations.reduce(
            (sum, allocation) =>
              sum + Number(allocation.unclassified_spend || 0),
            0,
          );
          const unavailableSpend = accountAllocations.reduce(
            (sum, allocation) =>
              sum + Number(allocation.unavailable_spend || 0),
            0,
          );
          const unmatchedCreativeSpend = accountAllocations
            .flatMap((allocation) => allocation.unclassified)
            .reduce((sum, creative) => sum + Number(creative.spend || 0), 0);
          const allocationComplete = unmatchedCreativeSpend === 0 &&
            unavailableSpend <= AD_REPORTING_TOLERANCE_WON;
          const sourceDetails = {
            provider,
            collector: "naver_searchad_cross_account_creative_stats",
            account_totals: accountAllocations.map((allocation) => ({
              account_key: allocation.account_key,
              customer_id: allocation.customer_id,
              account_total: allocation.account_total,
              classified_spend: allocation.classified_spend,
              unclassified_spend: allocation.unclassified_spend,
              unavailable_spend: allocation.unavailable_spend,
            })),
            paid_creatives: accountAllocations
              .flatMap((allocation) => allocation.classified)
              .filter((item: Record<string, unknown>) => Number(item.spend) > 0)
              .slice(0, 200),
            unclassified_creatives: accountAllocations
              .flatMap((allocation) => allocation.unclassified)
              .slice(0, 200),
            allocation_complete: allocationComplete,
            unclassified_spend: unclassifiedSpend,
            unmatched_creative_spend: unmatchedCreativeSpend,
            unavailable_spend: unavailableSpend,
            reporting_tolerance_won: AD_REPORTING_TOLERANCE_WON,
            collected_at: new Date().toISOString(),
          };
          if (!allocationComplete) {
            failed++;
            const message =
              `광고비 ${unclassifiedSpend.toLocaleString("ko-KR")}원이 ` +
              "소재·캠페인·광고그룹 제목으로 제품 분류되지 않았습니다.";
            runErrors.push(message);
            await supabase.from("marketing_ingestion_errors").insert({
              run_id: run.id,
              provider,
              error_code: "AD_SPEND_ALLOCATION_INCOMPLETE",
              message,
              details: sourceDetails,
            });
          }
          try {
            for (
              const [brand, rules] of Object.entries(
                PRODUCT_AD_TITLE_RULES,
              ) as Array<
                [string, ReadonlyArray<{ product_slug: string }>]
              >
            ) {
              const allocations = rules.map((rule) => ({
                product_slug: rule.product_slug,
                spend: productSpend[rule.product_slug] || 0,
              }));
              const brandTotal = allocations.reduce(
                (sum, allocation) => sum + allocation.spend,
                0,
              );
              const { error } = await supabase.rpc(
                "merge_daily_observed_naver_ad_spend_allocation",
                {
                  p_brand: brand,
                  p_metric_date: metricDate,
                  p_brand_total: brandTotal,
                  p_allocations: allocations,
                  p_allocation_complete: allocationComplete,
                  p_source_details: sourceDetails,
                },
              );
              if (error) throw error;
              succeeded++;
            }
          } catch (error) {
            failed++;
            const message = error instanceof Error
              ? error.message
              : String(error);
            runErrors.push(message);
            await supabase.from("marketing_ingestion_errors").insert({
              run_id: run.id,
              provider,
              error_code: "AD_SPEND_SAVE_FAILED",
              message,
              details: sourceDetails,
            });
          }
        }
      }

      const status = failed === 0 && runWarnings.length === 0
        ? "success"
        : succeeded > 0
        ? "partial"
        : "failed";
      await supabase
        .from("marketing_ingestion_runs")
        .update({
          status,
          finished_at: new Date().toISOString(),
          records_succeeded: succeeded,
          records_failed: failed,
          details: {
            trigger: body.trigger || "manual",
            errors: runErrors,
            warnings: runWarnings,
          },
        })
        .eq("id", run.id);
      summary.push({ provider, status, succeeded, failed });
    }

    if (grouped.size) {
      const statuses = summary.map((item) => String(item.status));
      const batchStatus = statuses.every((status) => status === "success")
        ? "success"
        : statuses.every((status) => status === "failed")
        ? "failed"
        : "partial";
      await supabase
        .from("marketing_ingestion_batches")
        .update({
          status: batchStatus,
          finished_at: new Date().toISOString(),
          details: {
            mapping_count: mappings?.length || 0,
            provider_results: summary,
          },
        })
        .eq("id", batch.id);
    }

    return new Response(
      JSON.stringify({
        ok: summary.every((item) => item.status === "success"),
        metric_date: metricDate,
        providers: summary,
        message: grouped.size ? undefined : "활성화된 수집 매핑이 없습니다.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  } finally {
    await supabase.rpc("release_marketing_collector_lease", {
      p_lease_key: leaseKey,
      p_owner_token: leaseOwner,
    });
  }
});
