const assert = require('node:assert/strict');
const test = require('node:test');

const contractPromise = import('../supabase/functions/grok-marketing-bridge/contract.mjs');

function coupangChannel({
  visits,
  orders,
  grossSales,
  refundAmount,
  shippingFee = 0,
  sellerDiscount = 0,
}) {
  const netSales = grossSales - refundAmount;
  return {
    visits,
    orders,
    gross_sales: grossSales,
    refund_amount: refundAmount,
    net_sales: netSales,
    shipping_fee: shippingFee,
    seller_discount: sellerDiscount,
    revenue: netSales + shippingFee - sellerDiscount,
  };
}

test('Bridge 날짜는 KST 기준 최근 과거 날짜만 허용한다', async () => {
  const { kstYesterday, validMetricDate } = await contractPromise;
  const now = new Date('2026-08-28T06:00:00Z');
  assert.equal(kstYesterday(now), '2026-08-27');
  assert.equal(validMetricDate('2026-08-27', now), true);
  assert.equal(validMetricDate('2026-08-28', now), false);
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
});

test('쿠팡 매출은 KST 09:30부터, 방문자는 12:40부터 수집한다', async () => {
  const { providerReadyAt } = await contractPromise;
  assert.equal(
    providerReadyAt('coupang_sales', '2026-08-28', new Date('2026-08-29T00:29:59Z')),
    false,
    '09:29 KST에 쿠팡 매출 미허용'
  );
  assert.equal(
    providerReadyAt('coupang_sales', '2026-08-28', new Date('2026-08-29T00:30:00Z')),
    true,
    '09:30 KST에 쿠팡 매출 허용'
  );
  assert.equal(
    providerReadyAt('coupang_visits', '2026-08-28', new Date('2026-08-29T00:30:00Z')),
    false,
    '09:30 KST에 쿠팡 방문자 미허용'
  );
  assert.equal(
    providerReadyAt('coupang_visits', '2026-08-28', new Date('2026-08-29T03:40:00Z')),
    true,
    '12:40 KST에 쿠팡 방문자 허용'
  );
  assert.equal(
    providerReadyAt('coupang_sales', '2026-08-27', new Date('2026-08-29T00:00:00Z')),
    true,
    '과거 누락일 쿠팡 매출은 즉시 허용'
  );
  assert.equal(
    providerReadyAt('coupang_visits', '2026-08-27', new Date('2026-08-29T00:00:00Z')),
    true,
    '과거 누락일 쿠팡 방문자도 즉시 허용'
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

test('매출만 완성된 쿠팡은 방문자 작업만 남긴다', async () => {
  const { deriveMissingTasks } = await contractPromise;
  const completeSalesOnly = {
    data_completeness: {
      coupang_wing_orders: true,
      coupang_wing_revenue: true,
      coupang_growth_orders: true,
      coupang_growth_revenue: true,
    },
  };
  const tasks = deriveMissingTasks(new Map([
    ['innerium-gala431', completeSalesOnly],
    ['innerium-minti431', completeSalesOnly],
    ['yural-tonggam-cream', completeSalesOnly],
    ['yural-myeongga-bonhwan', completeSalesOnly],
  ]), '2026-08-27');
  const coupangTasks = tasks.filter(task => task.provider.startsWith('coupang'));
  assert.equal(coupangTasks.every(task => task.provider === 'coupang_visits'), true,
    '매출이 완성되면 coupang_visits 작업만 남는다');
  const smartstoreTasks = tasks.filter(task => task.provider === 'smartstore');
  assert.equal(smartstoreTasks.length, 2, '스마트스토어 작업은 모두 생성된다');
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
  const { COUPANG_REVENUE_BASIS, normalizeCoupangSubmission } = await contractPromise;
  const metrics = [
    {
      product_slug: 'yural-tonggam-cream',
      wing: coupangChannel({
        visits: 10,
        orders: -1,
        grossSales: 50000,
        refundAmount: 80000,
      }),
      growth: coupangChannel({
        visits: 20,
        orders: 2,
        grossSales: 70000,
        refundAmount: 10000,
        shippingFee: 3000,
        sellerDiscount: 3000,
      }),
    },
    {
      product_slug: 'yural-myeongga-bonhwan',
      wing: coupangChannel({
        visits: 5,
        orders: 0,
        grossSales: 0,
        refundAmount: 0,
      }),
      growth: coupangChannel({
        visits: 7,
        orders: 1,
        grossSales: 20000,
        refundAmount: 0,
      }),
    },
  ];
  const totals = {
    combined: coupangChannel({
      visits: 42,
      orders: 2,
      grossSales: 140000,
      refundAmount: 90000,
      shippingFee: 3000,
      sellerDiscount: 3000,
    }),
  };
  const result = normalizeCoupangSubmission('yural', metrics, totals);
  assert.equal(result.source_totals.combined.visits, 42);
  assert.equal(result.metrics[0].wing.orders, -1);
  assert.equal(result.metrics[0].wing.revenue, -30000);
  assert.equal(result.metrics[0].wing.revenue_basis, COUPANG_REVENUE_BASIS);
  assert.equal(result.metrics[0].growth.conversion_rate, 10);
  assert.equal(result.metrics[0].growth.conversion_source, 'derived_from_official_counts');
  assert.throws(
    () => normalizeCoupangSubmission('yural', metrics, {
      combined: { ...totals.combined, visits: 43 },
    }),
    /합계가 일치하지 않습니다/,
  );
  assert.throws(
    () => normalizeCoupangSubmission('yural', [{
      ...metrics[0],
      wing: { ...metrics[0].wing, revenue: metrics[0].wing.gross_sales },
    }, metrics[1]], totals),
    /판매금액\(순\)\+배송비-판매자 부담 할인·쿠폰이어야 합니다/,
  );
});

test('쿠팡 매출만 제출하면 방문수는 NULL로 유지된다', async () => {
  const { COUPANG_REVENUE_BASIS, normalizeCoupangSubmission, isCoupangSalesOnly } = await contractPromise;
  const salesOnlyMetrics = [
    {
      product_slug: 'innerium-gala431',
      wing: { orders: 3, revenue: 150000 },
      growth: { orders: 1, revenue: 50000 },
    },
    {
      product_slug: 'innerium-minti431',
      wing: { orders: 0, revenue: 0 },
      growth: { orders: 2, revenue: 80000 },
    },
  ];
  const salesOnlyTotals = {
    combined: { orders: 6, revenue: 280000 },
  };
  const result = normalizeCoupangSubmission('innerium', salesOnlyMetrics, salesOnlyTotals);
  assert.equal(result.sales_only, true, 'sales_only 플래그가 true여야 한다');
  assert.equal(isCoupangSalesOnly(result), true);
  assert.equal(result.metrics[0].wing.visits, null, '방문수는 null이어야 한다');
  assert.equal(result.metrics[0].wing.conversion_rate, null, '전환율도 null이어야 한다');
  assert.equal(result.metrics[0].wing.orders, 3);
  assert.equal(result.metrics[0].wing.revenue, 150000);
  assert.equal(result.metrics[0].wing.revenue_basis, COUPANG_REVENUE_BASIS);
  assert.equal(result.metrics[0].wing.gross_sales, null, 'v9 상세 필드 없이 매출만 제출 가능');
  assert.equal(result.metrics[0].growth.orders, 1);
  assert.equal(result.metrics[0].growth.revenue, 50000);
  assert.equal(result.source_totals.combined.visits, null);
  assert.equal(result.source_totals.combined.orders, 6);
  assert.equal(result.source_totals.combined.revenue, 280000);
});

test('쿠팡 매출만 제출 시 합계를 검증한다', async () => {
  const { normalizeCoupangSubmission } = await contractPromise;
  assert.throws(
    () => normalizeCoupangSubmission('innerium', [
      {
        product_slug: 'innerium-gala431',
        wing: { orders: 3, revenue: 150000 },
        growth: { orders: 1, revenue: 50000 },
      },
      {
        product_slug: 'innerium-minti431',
        wing: { orders: 0, revenue: 0 },
        growth: { orders: 2, revenue: 80000 },
      },
    ], {
      combined: { orders: 6, revenue: 999999 },
    }),
    /합계가 일치하지 않습니다/,
    '매출 합계가 다르면 거부한다'
  );
});

test('쿠팡 매출+v9 상세 필드를 방문수 없이 제출할 수 있다', async () => {
  const { normalizeCoupangSubmission } = await contractPromise;
  const metrics = [
    {
      product_slug: 'innerium-gala431',
      wing: {
        orders: 3,
        gross_sales: 200000,
        refund_amount: 50000,
        net_sales: 150000,
        shipping_fee: 3000,
        seller_discount: 1000,
        revenue: 152000,
      },
      growth: {
        orders: 1,
        gross_sales: 60000,
        refund_amount: 10000,
        net_sales: 50000,
        shipping_fee: 0,
        seller_discount: 0,
        revenue: 50000,
      },
    },
    {
      product_slug: 'innerium-minti431',
      wing: { orders: 0, revenue: 0 },
      growth: { orders: 0, revenue: 0 },
    },
  ];
  const totals = {
    combined: { orders: 4, revenue: 202000 },
  };
  const result = normalizeCoupangSubmission('innerium', metrics, totals);
  assert.equal(result.sales_only, true);
  assert.equal(result.metrics[0].wing.visits, null);
  assert.equal(result.metrics[0].wing.gross_sales, 200000, 'v9 상세 필드가 보존된다');
  assert.equal(result.metrics[0].wing.revenue, 152000);
  assert.equal(result.metrics[0].wing.conversion_rate, null, '방문수 없이 전환율도 null');
});

test('방문수를 0으로 채워 제출하면 sales_only가 아닌 전체 제출로 처리한다', async () => {
  const { normalizeCoupangSubmission } = await contractPromise;
  assert.throws(
    () => normalizeCoupangSubmission('innerium', [
      {
        product_slug: 'innerium-gala431',
        wing: { visits: 0, orders: 3, revenue: 150000 },
        growth: { visits: 0, orders: 1, revenue: 50000 },
      },
      {
        product_slug: 'innerium-minti431',
        wing: { visits: 0, orders: 0, revenue: 0 },
        growth: { visits: 0, orders: 0, revenue: 0 },
      },
    ], {
      combined: { visits: 0, orders: 4, revenue: 200000 },
    }),
    /판매금액\(총\) 또는 매출\(revenue\)/,
    'visits=0이면 salesOnly가 아니므로 v9 필드가 필요하다'
  );
});
