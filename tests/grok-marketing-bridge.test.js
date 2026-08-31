const assert = require('node:assert/strict');
const test = require('node:test');

const contractPromise = import('../supabase/functions/grok-marketing-bridge/contract.mjs');

test('Bridge 날짜는 KST 기준 오늘 포함 최근 90일 이내를 허용한다', async () => {
  const { kstYesterday, validMetricDate } = await contractPromise;
  const now = new Date('2026-08-28T06:00:00Z');
  assert.equal(kstYesterday(now), '2026-08-27');
  assert.equal(validMetricDate('2026-08-27', now), true);
  assert.equal(validMetricDate('2026-08-28', now), true, '당일(KST) 실시간 수집 허용');
  assert.equal(validMetricDate('2026-08-29', now), false, '미래 날짜 거부');
  assert.equal(validMetricDate('2026-05-29', now), false);
  assert.equal(validMetricDate('2026-02-30', now), false);
});

test('쿠팡 전일 유입은 KST 12시 40분 이후에만 수집한다', async () => {
  const { providerReadyAt } = await contractPromise;
  assert.equal(providerReadyAt('smartstore', '2026-08-28', new Date('2026-08-29T00:00:00Z')), true);
  assert.equal(providerReadyAt('coupang', '2026-08-28', new Date('2026-08-29T03:39:59Z')), false);
  assert.equal(providerReadyAt('coupang', '2026-08-28', new Date('2026-08-29T03:40:00Z')), true);
  assert.equal(
    providerReadyAt('coupang', '2026-08-27', new Date('2026-08-29T00:00:00Z')),
    true,
    '과거 누락일 쿠팡은 오전에도 즉시 복구한다'
  );
  assert.equal(
    providerReadyAt('coupang', '2026-08-29', new Date('2026-08-29T00:00:00Z')),
    true,
    '당일(KST) 실시간 수집은 정산 창과 무관하게 즉시 실행'
  );
});

test('Bridge 오류는 즉시 반복하지 않고 로그인 오류를 차단 상태로 보존한다', async () => {
  const { isActionableJob, shouldRequeueMissingJob } = await contractPromise;
  const now = new Date('2026-08-29T05:00:00Z');
  assert.equal(shouldRequeueMissingJob({
    status: 'failed',
    attempts: 1,
    updated_at: '2026-08-29T04:45:00Z',
  }, now), false);
  assert.equal(shouldRequeueMissingJob({
    status: 'failed',
    attempts: 1,
    updated_at: '2026-08-29T04:30:00Z',
  }, now), true);
  assert.equal(shouldRequeueMissingJob({
    status: 'failed',
    attempts: 3,
    updated_at: '2026-08-29T03:00:00Z',
  }, now), false);
  assert.equal(shouldRequeueMissingJob({
    status: 'needs_login',
    attempts: 1,
    updated_at: '2026-08-29T03:00:00Z',
  }, now), false);
  assert.equal(isActionableJob({ status: 'pending' }), true);
  assert.equal(isActionableJob({ status: 'needs_login' }), false);
});

test('완성도 표시가 없는 로그인 채널만 계정별 작업으로 만든다', async () => {
  const { deriveMissingTasks } = await contractPromise;
  const completeSmartstore = {
    data_completeness: {
      smartstore_visits: true,
      smartstore_pay_count: true,
      smartstore_conversion_rate: true,
      smartstore_orders: true,
      smartstore_revenue: true,
    },
  };
  const completeCoupang = {
    data_completeness: {
      coupang_wing_visits: true,
      coupang_wing_orders: true,
      coupang_wing_revenue: true,
      coupang_wing_conversion_rate: true,
      coupang_growth_visits: true,
      coupang_growth_orders: true,
      coupang_growth_revenue: true,
      coupang_growth_conversion_rate: true,
      coupang_conversion_rate: true,
    },
  };
  const tasks = deriveMissingTasks(new Map([
    ['innerium-gala431', { ...completeSmartstore, ...completeCoupang, data_completeness: { ...completeSmartstore.data_completeness, ...completeCoupang.data_completeness } }],
    ['innerium-minti431', { ...completeSmartstore, ...completeCoupang, data_completeness: { ...completeSmartstore.data_completeness, ...completeCoupang.data_completeness } }],
    ['yural-tonggam-cream', completeCoupang],
    ['yural-myeongga-bonhwan', completeCoupang],
  ]), '2026-08-27');
  assert.deepEqual(tasks.map(task => `${task.provider}:${task.account}`), ['smartstore:yural']);
  assert.equal(tasks[0].missing_fields_by_product.length, 2);
});

test('스마트스토어는 추적 제품과 미분류 상품을 포함한 화면 합계를 검증한다', async () => {
  const { normalizeSmartstoreSubmission } = await contractPromise;
  const result = normalizeSmartstoreSubmission('innerium', [
    {
      product_slug: 'innerium-gala431',
      visits: 36,
      pay_count: 4,
      conversion_rate: 11.1,
      orders: 5,
      revenue: 200000,
    },
    {
      product_slug: 'innerium-minti431',
      visits: 46,
      pay_count: 1,
      conversion_rate: 2.2,
      orders: 1,
      revenue: 78900,
    },
  ], { visits: 90, pay_count: 5, orders: 7, revenue: 288900 }, [
    {
      name: '임시',
      external_id: '13718339357',
      visits: 8,
      pay_count: 0,
      orders: 1,
      revenue: 10000,
    },
  ]);
  assert.equal(result.metrics[0].conversion_rate, 11.1);
  assert.equal(result.unmapped[0].visits, 8);
  assert.equal(result.source_totals.revenue, 288900);
  assert.throws(
    () => normalizeSmartstoreSubmission(
      'innerium',
      result.metrics,
      { visits: 89, pay_count: 5, orders: 7, revenue: 288900 },
      result.unmapped,
    ),
    /합계가 일치하지 않습니다/,
  );
});

test('쿠팡 반품 음수는 허용하되 공식 전체 합계를 강제한다', async () => {
  const { normalizeCoupangSubmission } = await contractPromise;
  const metrics = [
    {
      product_slug: 'yural-tonggam-cream',
      wing: { visits: 10, orders: -1, revenue: -30000 },
      growth: { visits: 20, orders: 2, revenue: 60000 },
    },
    {
      product_slug: 'yural-myeongga-bonhwan',
      wing: { visits: 5, orders: 0, revenue: 0 },
      growth: { visits: 7, orders: 1, revenue: 20000 },
    },
  ];
  const totals = {
    combined: { visits: 42, orders: 2, revenue: 50000 },
  };
  const result = normalizeCoupangSubmission('yural', metrics, totals);
  assert.equal(result.source_totals.combined.visits, 42);
  assert.equal(result.metrics[0].wing.orders, -1);
  assert.equal(result.metrics[0].growth.conversion_rate, 10);
  assert.equal(result.metrics[0].growth.conversion_source, 'derived_from_official_counts');
  assert.throws(
    () => normalizeCoupangSubmission('yural', metrics, {
      combined: { ...totals.combined, visits: 43 },
    }),
    /합계가 일치하지 않습니다/,
  );
});
