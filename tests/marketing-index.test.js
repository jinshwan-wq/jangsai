const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
    console,
    Intl,
    Date,
    setTimeout,
    clearTimeout,
    window: { supabase: { createClient: () => ({}) } },
    document: {
        readyState: 'loading',
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => {
            let text = '';
            return {
                set textContent(value) { text = String(value); },
                get innerHTML() { return text; },
            };
        },
    },
};

vm.createContext(context);
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);

const total = vm.runInContext(`aggregateMarketingMetrics([{
    blog_views: 100,
    cafe_views: 100,
    cafe24_visits: 20,
    cafe24_orders: 2,
    smartstore_visits: null,
    smartstore_orders: 3,
    coupang_visits: null,
    coupang_orders: 4,
    cafe24_revenue: 10000,
    smartstore_revenue: 20000,
    coupang_revenue: 30000,
    keyword_search_volume: 50,
    site_visits: 0,
    tracked_visits: 0,
    tracked_orders: 0,
    ad_spend: 1000
}])`, context);

assert.equal(total.content_views, 200, '블로그와 카페 노출을 합산한다');
assert.equal(total.visits, 20, '방문자가 확보된 채널만 유입에 포함한다');
assert.equal(total.orders, 9, '총판매량은 세 채널을 모두 합산한다');
assert.equal(total.attributableOrders, 2, '전환 분자는 방문자가 확보된 동일 채널 주문만 사용한다');
assert.equal(total.channelPairsMeasured, 1, '측정 가능한 채널 수를 기록한다');
assert.equal(total.revenue, 60000, '채널 매출을 합산한다');

const splitCoupang = vm.runInContext(`({
    sales: getMetricSales({
        cafe24_orders: 1, smartstore_orders: 2, coupang_orders: 99,
        coupang_wing_orders: 3, coupang_growth_orders: 4
    }),
    revenue: getMetricRevenue({
        cafe24_revenue: 1000, smartstore_revenue: 2000, coupang_revenue: 99000,
        coupang_wing_revenue: 3000, coupang_growth_revenue: 4000
    })
})`, context);
assert.equal(splitCoupang.sales, 10, '쿠팡 윙과 로켓그로스를 분리 합산하고 기존 합계와 중복하지 않는다');
assert.equal(splitCoupang.revenue, 10000, '분리된 쿠팡 매출을 합산한다');

const zeroOrderMeasured = vm.runInContext(`aggregateMarketingMetrics([{
    blog_views: 10, cafe_views: 0, cafe24_visits: 5, cafe24_orders: 0,
    smartstore_visits: null, smartstore_orders: 0, coupang_visits: null, coupang_orders: 0,
    cafe24_revenue: 0, smartstore_revenue: 0, coupang_revenue: 0,
    data_completeness: { cafe24_visits: true, cafe24_orders: true }
}])`, context);
assert.equal(zeroOrderMeasured.channelPairsMeasured, 1, '0건 주문도 수집 완료 표시가 있으면 전환율에 포함한다');

const missingOrder = vm.runInContext(`aggregateMarketingMetrics([{
    blog_views: 10, cafe_views: 0, cafe24_visits: 5, cafe24_orders: 0,
    smartstore_visits: null, smartstore_orders: 0, coupang_visits: null, coupang_orders: 0,
    cafe24_revenue: 0, smartstore_revenue: 0, coupang_revenue: 0,
    data_completeness: { cafe24_visits: true }
}])`, context);
assert.equal(missingOrder.channelPairsMeasured, 0, '주문 미수집 0을 실제 0건으로 오인하지 않는다');

assert.equal(vm.runInContext('getIndexStatus(79.9)', context), 'danger');
assert.equal(vm.runInContext('getIndexStatus(80)', context), 'stable');
assert.equal(vm.runInContext('getIndexStatus(120)', context), 'stable');
assert.equal(vm.runInContext('getIndexStatus(120.1)', context), 'excellent');
assert.equal(vm.runInContext('getIndexStatus(null)', context), 'unknown');

const sheetResult = vm.runInContext(`parseGoogleSheetMetrics({
    updatedAt: '2026-08-27T00:00:00Z',
    values: [
        [,,,,,,'갈라431'],
        [,,,,,,'날짜',,'8/26'],
        [,,,,,,'키워드 검색량'],
        [,,,,,,,'갈라431','100'],
        [,,,,,,'자사몰 유입수',,'20'],
        [,,,,,,'블로그 방문자 수',,'120'],
        [,,,,,,'카페 글 조회수',,'80'],
        [,,,,,,,'자사몰','2'],
        [,,,,,,,'스마트스토어','3'],
        [,,,,,,,'쿠팡','4'],
        [,,,,,,,'일 매출','60000'],
        [,,,,,,,'일 광고비','10000']
    ]
})`, context);
assert.equal(sheetResult.length, 1);
assert.equal(sheetResult[0].blog_views, 120);
assert.equal(sheetResult[0].cafe_views, 80);
assert.deepEqual(
    JSON.parse(JSON.stringify(sheetResult[0].keyword_metrics)),
    [{ keyword: '갈라431', search_volume: 100 }],
    '검색량을 키워드별로 보존한다'
);
assert.equal(sheetResult[0].reported_total_revenue, 60000, '일 매출을 자사몰 매출로 오인하지 않는다');
assert.equal('cafe24_revenue' in sheetResult[0], false, '채널 매출이 없으면 임의 귀속하지 않는다');
assert.equal(vm.runInContext(`canonicalProductKeyword('yural-tonggam-cream', '유랄 통감크림')`, context), '유랄통감크림');
assert.match(
    vm.runInContext(`renderReportRow('판매량', ['2026-08-27', '2026-08-26'], new Map([
        ['2026-08-27', { value: 12 }],
        ['2026-08-26', { value: 10 }]
    ]), metric => formatMetric(metric.value))`, context),
    /▲ 증가 2/,
    '일일 보고서에 전일 대비 증감을 표시한다'
);

const today = new Date().toISOString().slice(0, 10);
vm.runInContext(`
    state.user = { id: 'user-1', email: 'employee@jangsai.local' };
    state.profile = { role_id: 'employee', display_name: '테스트 직원' };
    state.marketingProducts = [{ id: 'product-1', brand: '테스트브랜드', name: '테스트상품', slug: 'test', sort_order: 1 }];
    state.marketingMetrics = [{
        product_id: 'product-1', metric_date: '${today}',
        blog_views: 100, cafe_views: 100, cafe24_visits: 20, cafe24_orders: 2,
        smartstore_visits: null, smartstore_orders: 0, coupang_visits: null, coupang_orders: 0,
        cafe24_revenue: 10000, smartstore_revenue: 0, coupang_revenue: 0,
        keyword_search_volume: 50, site_visits: 0, tracked_visits: 0, tracked_orders: 0, ad_spend: 1000
    }];
    state.marketingTargets = [];
    state.marketingRuns = [];
`, context);
const funnelHtml = vm.runInContext('renderFunnelDashboardView()', context);
assert.match(funnelHtml, /노출지수/);
assert.match(funnelHtml, /데이터 완성도/);
const okrHtml = vm.runInContext('renderOkrDashboardView()', context);
assert.match(okrHtml, /분기·연간 목표/);
assert.match(okrHtml, /목표 600,000/, '브랜드 월 20만 뷰를 분기 60만 뷰 목표로 집계한다');

console.log('marketing index tests passed');
