export const ACCOUNT_PRODUCTS = Object.freeze({
  innerium: Object.freeze([
    Object.freeze({ slug: 'innerium-gala431', brand: '이너리움', name: '갈라431' }),
    Object.freeze({ slug: 'innerium-minti431', brand: '이너리움', name: '민티431' }),
  ]),
  yural: Object.freeze([
    Object.freeze({ slug: 'yural-tonggam-cream', brand: '유랄', name: '통감크림' }),
    Object.freeze({ slug: 'yural-myeongga-bonhwan', brand: '유랄', name: '명가본환' }),
  ]),
});

export const TASK_REQUIREMENTS = Object.freeze({
  smartstore: Object.freeze([
    'smartstore_visits',
    'smartstore_pay_count',
    'smartstore_conversion_rate',
    'smartstore_orders',
    'smartstore_revenue',
  ]),
  coupang: Object.freeze([
    'coupang_wing_visits',
    'coupang_wing_orders',
    'coupang_wing_revenue',
    'coupang_wing_conversion_rate',
    'coupang_growth_visits',
    'coupang_growth_orders',
    'coupang_growth_revenue',
    'coupang_growth_conversion_rate',
    'coupang_conversion_rate',
  ]),
});

export const SOURCE_URLS = Object.freeze({
  smartstore: 'https://sell.smartstore.naver.com/#/insight/store-analytics/visit',
  coupang: 'https://wing.coupang.com/tenants/business-insight/sales-analysis',
});

const MAX_VISITS = 10_000_000;
const MAX_ORDERS = 1_000_000;
const MAX_REVENUE = 1_000_000_000_000;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function assertSafeInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function assertProductSet(account, metrics) {
  const expected = ACCOUNT_PRODUCTS[account];
  if (!expected) throw new Error('허용되지 않은 계정입니다.');
  if (!Array.isArray(metrics) || metrics.length !== expected.length) {
    throw new Error(`${account} 계정은 ${expected.length}개 제품을 모두 제출해야 합니다.`);
  }
  const expectedSlugs = new Set(expected.map(product => product.slug));
  const submittedSlugs = metrics.map(metric => String(metric?.product_slug || ''));
  if (new Set(submittedSlugs).size !== submittedSlugs.length) {
    throw new Error('중복된 제품이 포함되어 있습니다.');
  }
  if (submittedSlugs.some(slug => !expectedSlugs.has(slug))) {
    throw new Error(`${account} 계정에 속하지 않는 제품이 포함되어 있습니다.`);
  }
}

function metricComplete(metric, key) {
  return metric?.data_completeness?.[key] === true;
}

// same-day (KST today) is provisional — allows hourly realtime collect
export function validMetricDate(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const kstToday = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const earliest = new Date(`${kstToday}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - 90);
  return value <= kstToday && parsed >= earliest;
}

export function kstYesterday(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  return kst.toISOString().slice(0, 10);
}

export function providerReadyAt(provider, metricDate = kstYesterday(), now = new Date()) {
  if (provider !== 'coupang') return true;
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const kstToday = kst.toISOString().slice(0, 10);
  const yesterday = new Date(`${kstToday}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (metricDate < yesterday.toISOString().slice(0, 10)) return true;
  return kst.getUTCHours() * 60 + kst.getUTCMinutes() >= 12 * 60 + 40;
}

export function shouldRequeueMissingJob(job, now = new Date()) {
  const status = String(job?.status || '');
  if (status === 'completed') return true;
  const timestamp = status === 'claimed'
    ? job?.claimed_at || job?.updated_at
    : job?.updated_at || job?.claimed_at;
  const updatedAt = new Date(String(timestamp || '')).getTime();
  const elapsed = Number.isFinite(updatedAt) ? now.getTime() - updatedAt : Number.POSITIVE_INFINITY;
  if (status === 'claimed') return elapsed >= 30 * 60 * 1000;
  if (['failed', 'skipped'].includes(status)) {
    return Number(job?.attempts || 0) < 3 && elapsed >= 30 * 60 * 1000;
  }
  return false;
}

export function isActionableJob(job) {
  return job?.status === 'pending';
}

export function deriveMissingTasks(metricsBySlug, metricDate) {
  const tasks = [];
  for (const [account, products] of Object.entries(ACCOUNT_PRODUCTS)) {
    for (const provider of Object.keys(TASK_REQUIREMENTS)) {
      const missingFieldsByProduct = products.map(product => {
        const metric = metricsBySlug.get(product.slug);
        return {
          product_slug: product.slug,
          product_name: product.name,
          missing_fields: TASK_REQUIREMENTS[provider].filter(key => !metricComplete(metric, key)),
        };
      }).filter(product => product.missing_fields.length);
      if (!missingFieldsByProduct.length) continue;
      tasks.push({
        provider,
        account,
        metric_date: metricDate,
        task_type: 'collect',
        source_url: SOURCE_URLS[provider],
        products,
        missing_fields_by_product: missingFieldsByProduct,
      });
    }
  }
  return tasks;
}

function normalizeUnmappedRows(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new Error('미분류 상품 목록 형식이 올바르지 않습니다.');
  }
  return value.map((item, index) => {
    const row = assertObject(item, `미분류 상품 ${index + 1}`);
    const name = String(row.name || '').trim().slice(0, 120);
    if (!name) throw new Error(`미분류 상품 ${index + 1} 이름이 없습니다.`);
    return {
      name,
      external_id: String(row.external_id || '').trim().slice(0, 80),
      visits: assertSafeInteger(row.visits, `${name} 방문수`, { max: MAX_VISITS }),
      pay_count: assertSafeInteger(row.pay_count, `${name} 상품결제건수`, { max: MAX_ORDERS }),
      orders: assertSafeInteger(row.orders, `${name} 판매수량`, { max: MAX_ORDERS }),
      revenue: assertSafeInteger(row.revenue, `${name} 결제금액`, { max: MAX_REVENUE }),
    };
  });
}

export function normalizeSmartstoreSubmission(account, metrics, sourceTotals, unmappedRows) {
  assertProductSet(account, metrics);
  const normalized = metrics.map(item => {
    const metric = assertObject(item, '스마트스토어 제품 지표');
    const visits = assertSafeInteger(metric.visits, `${metric.product_slug} 방문수`, { max: MAX_VISITS });
    const payCount = assertSafeInteger(metric.pay_count, `${metric.product_slug} 상품결제건수`, { max: MAX_ORDERS });
    const orders = assertSafeInteger(metric.orders, `${metric.product_slug} 판매수량`, { max: MAX_ORDERS });
    const revenue = assertSafeInteger(metric.revenue, `${metric.product_slug} 결제금액`, { max: MAX_REVENUE });
    const conversionRate = visits ? Number(((payCount / visits) * 100).toFixed(1)) : 0;
    if (
      metric.conversion_rate !== undefined &&
      (!Number.isFinite(metric.conversion_rate) || Math.abs(Number(metric.conversion_rate) - conversionRate) > 0.11)
    ) {
      throw new Error(`${metric.product_slug} 구매전환율이 방문수와 상품결제건수에 맞지 않습니다.`);
    }
    return {
      product_slug: String(metric.product_slug),
      visits,
      pay_count: payCount,
      conversion_rate: conversionRate,
      orders,
      revenue,
    };
  });

  const totals = assertObject(sourceTotals, '스마트스토어 화면 합계');
  const unmapped = normalizeUnmappedRows(unmappedRows);
  const submittedVisits = normalized.reduce((sum, metric) => sum + metric.visits, 0) +
    unmapped.reduce((sum, metric) => sum + metric.visits, 0);
  const submittedPayCount = normalized.reduce((sum, metric) => sum + metric.pay_count, 0) +
    unmapped.reduce((sum, metric) => sum + metric.pay_count, 0);
  const submittedOrders = normalized.reduce((sum, metric) => sum + metric.orders, 0) +
    unmapped.reduce((sum, metric) => sum + metric.orders, 0);
  const submittedRevenue = normalized.reduce((sum, metric) => sum + metric.revenue, 0) +
    unmapped.reduce((sum, metric) => sum + metric.revenue, 0);
  const sourceVisits = assertSafeInteger(totals.visits, '스마트스토어 전체 방문수', { max: MAX_VISITS });
  const sourcePayCount = assertSafeInteger(totals.pay_count, '스마트스토어 전체 상품결제건수', { max: MAX_ORDERS });
  const sourceOrders = assertSafeInteger(totals.orders, '스마트스토어 전체 판매수량', { max: MAX_ORDERS });
  const sourceRevenue = assertSafeInteger(totals.revenue, '스마트스토어 전체 결제금액', { max: MAX_REVENUE });
  if (
    submittedVisits !== sourceVisits ||
    submittedPayCount !== sourcePayCount ||
    submittedOrders !== sourceOrders ||
    submittedRevenue !== sourceRevenue
  ) {
    throw new Error(
      `스마트스토어 합계가 일치하지 않습니다. 방문 ${submittedVisits}/${sourceVisits}, ` +
      `결제건수 ${submittedPayCount}/${sourcePayCount}, ` +
      `판매수량 ${submittedOrders}/${sourceOrders}, 결제금액 ${submittedRevenue}/${sourceRevenue}`,
    );
  }
  return {
    metrics: normalized,
    source_totals: {
      visits: sourceVisits,
      pay_count: sourcePayCount,
      orders: sourceOrders,
      revenue: sourceRevenue,
    },
    unmapped,
  };
}

function normalizeCoupangChannel(value, label) {
  const channel = assertObject(value, label);
  const visits = assertSafeInteger(channel.visits, `${label} 방문수`, { max: MAX_VISITS });
  const orders = assertSafeInteger(channel.orders, `${label} 판매량`, { min: -MAX_ORDERS, max: MAX_ORDERS });
  const calculatedRate = visits > 0 ? Number(((Math.max(0, orders) / visits) * 100).toFixed(4)) : 0;
  const conversionRate = channel.conversion_rate === undefined
    ? calculatedRate
    : Number(channel.conversion_rate);
  if (!Number.isFinite(conversionRate) || conversionRate < 0 || conversionRate > 10_000) {
    throw new Error(`${label} 구매전환율 값이 올바르지 않습니다.`);
  }
  return {
    visits,
    orders,
    revenue: assertSafeInteger(channel.revenue, `${label} 매출`, { min: -MAX_REVENUE, max: MAX_REVENUE }),
    conversion_rate: conversionRate,
    conversion_source: channel.conversion_rate === undefined ? 'derived_from_official_counts' : 'official_screen',
  };
}

export function normalizeCoupangSubmission(account, metrics, sourceTotals) {
  assertProductSet(account, metrics);
  const normalized = metrics.map(item => {
    const metric = assertObject(item, '쿠팡 제품 지표');
    return {
      product_slug: String(metric.product_slug),
      wing: normalizeCoupangChannel(metric.wing, `${metric.product_slug} 판매자배송`),
      growth: normalizeCoupangChannel(metric.growth, `${metric.product_slug} 로켓그로스`),
    };
  });
  const totals = assertObject(sourceTotals, '쿠팡 화면 합계');
  const combinedTotals = normalizeCoupangChannel(totals.combined, '쿠팡 공식 전체');
  for (const field of ['visits', 'orders', 'revenue']) {
    const sum = normalized.reduce(
      (total, metric) => total + metric.wing[field] + metric.growth[field],
      0,
    );
    if (sum !== combinedTotals[field]) {
      throw new Error(
        `쿠팡 공식 ${field} 합계가 일치하지 않습니다. ${sum}/${combinedTotals[field]}`,
      );
    }
  }
  return { metrics: normalized, source_totals: { combined: combinedTotals } };
}

export function normalizeSubmission(provider, account, metrics, sourceTotals, unmappedRows) {
  if (provider === 'smartstore') {
    return normalizeSmartstoreSubmission(account, metrics, sourceTotals, unmappedRows);
  }
  if (provider === 'coupang') {
    return normalizeCoupangSubmission(account, metrics, sourceTotals);
  }
  throw new Error('허용되지 않은 수집 제공자입니다.');
}
