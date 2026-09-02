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
assert.equal(total.adSpendComplete, true, '0보다 큰 기존 광고비 기록도 수집값으로 취급한다');

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
assert.equal(
    vm.runInContext(`getMetricRevenue({
        cafe24_revenue: 0,
        smartstore_revenue: 0,
        coupang_wing_revenue: -700,
        coupang_growth_revenue: 200,
        data_completeness: {
            cafe24_revenue: true,
            smartstore_revenue: true,
            coupang_wing_revenue: true,
            coupang_growth_revenue: true
        }
    })`, context),
    -500,
    '쿠팡 반품으로 발생한 음수 매출을 0으로 자르지 않는다'
);
assert.equal(
    vm.runInContext(`getMetricRevenue({
        cafe24_revenue: 1000,
        smartstore_revenue: 2000,
        coupang_wing_revenue: 3000,
        coupang_growth_revenue: 4000,
        reported_total_revenue: 99999,
        data_completeness: {
            cafe24_revenue: true,
            smartstore_revenue: true,
            coupang_wing_revenue: true,
            coupang_growth_revenue: true
        }
    })`, context),
    10000,
    '채널별 매출이 완성되면 과거 보고 총매출로 부풀리지 않는다'
);

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
assert.equal(
    vm.runInContext(`getChannelVisits({ cafe24_visits: 0 }, MARKETING_CHANNELS[0])`, context),
    null,
    '완성도 표시가 없는 0 방문은 실제 0이 아닌 미수집으로 처리한다'
);
const partialCoupang = vm.runInContext(`aggregateMarketingMetrics([{
    coupang_wing_visits: 10, coupang_wing_orders: 1,
    coupang_growth_visits: 0, coupang_growth_orders: 0,
    data_completeness: { coupang_wing_visits: true, coupang_wing_orders: true }
}])`, context);
assert.equal(partialCoupang.channelPairsMeasured, 0, '쿠팡 윙·로켓그로스 중 한쪽만 수집되면 유입·전환 합계에서 제외한다');

const missingAdSpend = vm.runInContext(`aggregateMarketingMetrics([{
    product_id: 'missing-ad', metric_date: '2026-08-27', ad_spend: 0
}])`, context);
assert.equal(missingAdSpend.adSpendComplete, false, '광고비 미수집 0을 실제 0원으로 표시하지 않는다');
const explicitlyIncompleteAdSpend = vm.runInContext(`aggregateMarketingMetrics([{
    product_id: 'partial-ad', metric_date: '2026-08-27', ad_spend: 500,
    data_completeness: { ad_spend: false }
}])`, context);
assert.equal(explicitlyIncompleteAdSpend.adSpendComplete, false, '양수 광고비라도 명시적 미완성 상태를 완료로 오인하지 않는다');
const missingProductCoverage = vm.runInContext(`aggregateMarketingMetrics([{
    product_id: 'gala',
    metric_date: '2026-08-27',
    cafe24_orders: 1,
    smartstore_orders: 1,
    coupang_orders: 1,
    data_completeness: {
        cafe24_orders: true,
        smartstore_orders: true,
        coupang_orders: true
    }
}], new Set(['gala', 'minti']))`, context);
assert.equal(missingProductCoverage.salesComplete, false, '제품 행 자체가 빠지면 전체 판매량을 완성으로 표시하지 않는다');
assert.equal(
    missingProductCoverage.channelPairsExpected,
    5,
    '자사몰 방문자는 브랜드 공통 한 건으로 보고 누락 제품의 개별 채널만 완성도 분모에 포함한다'
);
const deduplicatedStoreVisitors = vm.runInContext(`(() => {
    state.marketingProducts = [
        { id: 'gala', brand: '이너리움', slug: 'innerium-gala431' },
        { id: 'minti', brand: '이너리움', slug: 'innerium-minti431' }
    ];
    state.marketingBrandMetrics = [{
        brand: '이너리움',
        metric_date: '2026-08-30',
        cafe24_visits: 215
    }];
    return aggregateMarketingMetrics([
        { product_id: 'gala', metric_date: '2026-08-30', cafe24_visits: 215, data_completeness: { cafe24_visits: true } },
        { product_id: 'minti', metric_date: '2026-08-30', cafe24_visits: 215, data_completeness: { cafe24_visits: true } }
    ]);
})()`, context);
assert.equal(deduplicatedStoreVisitors.visits, 215, '같은 몰 방문자 215명을 제품별로 중복 합산하지 않는다');
assert.match(
    vm.runInContext(`renderMarketingComparisonMatrix('2026-08-30')`, context),
    /rowspan="2" class="brand-shared-cell"[\s\S]*215[\s\S]*이너리움 몰 전체/,
    '통합 현황은 같은 몰 방문자수를 브랜드 공통 셀 하나로 표시한다'
);

const smartstoreAnalytics = vm.runInContext(`aggregateMarketingMetrics([{
    blog_views: 10, cafe_views: 0, cafe24_visits: null, cafe24_orders: 0,
    smartstore_visits: 100, smartstore_orders: 30, smartstore_pay_count: 5,
    coupang_visits: null, coupang_orders: 0,
    cafe24_revenue: 0, smartstore_revenue: 100000, coupang_revenue: 0,
    data_completeness: { smartstore_visits: true, smartstore_orders: true, smartstore_pay_count: true }
}])`, context);
assert.equal(smartstoreAnalytics.orders, 30, '총판매량에는 스마트스토어 판매수량을 사용한다');
assert.equal(smartstoreAnalytics.attributableOrders, 5, '스마트스토어 전환 분자에는 상품결제건수를 사용한다');
assert.equal(smartstoreAnalytics.salesComplete, false, '일부 채널 판매량만 있으면 전체 판매량을 미완성으로 표시한다');
assert.equal(smartstoreAnalytics.revenueComplete, false, '일부 채널 매출만 있으면 전체 매출을 미완성으로 표시한다');
assert.equal(
    vm.runInContext(`getChannelConversionMeasurement({
        smartstore_visits: 100,
        smartstore_pay_count: 7,
        smartstore_conversion_rate: 6.8,
        data_completeness: {
            smartstore_visits: true,
            smartstore_pay_count: true,
            smartstore_conversion_rate: true
        }
    }, 'smartstore').rate`, context),
    6.8,
    '스마트스토어는 화면의 공식 구매전환율을 우선 표시한다'
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext(`getChannelConversionMeasurement({
        cafe24_product_views: 100,
        cafe24_purchase_count: 4,
        cafe24_conversion_rate: 4,
        cafe24_orders: 12,
        data_completeness: {
            cafe24_product_views: true,
            cafe24_purchase_count: true,
            cafe24_conversion_rate: true,
            cafe24_orders: true
        }
    }, 'cafe24')`, context))),
    {
        visits: 100,
        purchases: 4,
        rate: 4,
        basis: 'Cafe24 공식 상품조회·판매건 기준'
    },
    '자사몰 전환율은 판매수량 대신 Cafe24 공식 판매건수를 사용한다'
);
assert.equal(
    vm.runInContext(`getChannelConversionMeasurement({
        coupang_wing_visits: 70,
        coupang_wing_orders: 7,
        coupang_growth_visits: 30,
        coupang_growth_orders: 3,
        coupang_conversion_rate: 8.4,
        data_completeness: {
            coupang_wing_visits: true,
            coupang_wing_orders: true,
            coupang_growth_visits: true,
            coupang_growth_orders: true,
            coupang_conversion_rate: true
        }
    }, 'coupang').rate`, context),
    8.4,
    '쿠팡은 Wing 화면의 공식 구매전환율을 우선 표시한다'
);

const weightedConversion = vm.runInContext(`(() => {
    state.marketingMetrics = [
        {
            product_id: 'gala', metric_date: '2026-08-29',
            cafe24_product_views: 100, cafe24_orders: 10,
            data_completeness: { cafe24_product_views: true, cafe24_orders: true }
        },
        {
            product_id: 'gala', metric_date: '2026-08-30',
            cafe24_product_views: 300, cafe24_orders: 15,
            data_completeness: { cafe24_product_views: true, cafe24_orders: true }
        }
    ];
    return getChannelConversionSummary(new Set(['gala']), 'cafe24', '2026-08-30');
})()`, context);
assert.equal(weightedConversion.current.rate, 5, '당일 자사몰 전환율을 계산한다');
assert.equal(weightedConversion.average.rate, 6.25, '최근 7일 전환율은 방문수 가중 평균으로 계산한다');
assert.equal(weightedConversion.previous.rate, 10, '전일 전환율을 함께 제공한다');

const overviewMainSearch = vm.runInContext(`(() => {
    const product = {
        id: 'gala-product',
        slug: 'innerium-gala431',
        brand: '이너리움',
        name: '갈라431'
    };
    state.marketingProducts = [product];
    state.marketingMetrics = [];
    state.dailyKeywordMetrics = [];
    state.marketingSearchSnapshots = [
        { product_id: product.id, snapshot_date: '2026-08-30', keyword: '이너리움 갈라431', search_volume: 120 },
        { product_id: product.id, snapshot_date: '2026-08-30', keyword: '갈라431', search_volume: 45 },
        { product_id: product.id, snapshot_date: '2026-08-30', keyword: '이너리움', search_volume: 570 }
    ];
    return {
        metric: getOverviewMainKeywordMetric(product, '2026-08-30'),
        html: renderMarketingComparisonMatrix('2026-08-30')
    };
})()`, context);
assert.deepEqual(
    JSON.parse(JSON.stringify(overviewMainSearch.metric)),
    { keyword: '갈라431', value: 45 },
    '통합 현황은 합계가 아니라 제품별 메인 검색어 한 개만 사용한다'
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext(`[
        OVERVIEW_MAIN_KEYWORDS['innerium-gala431'],
        OVERVIEW_MAIN_KEYWORDS['innerium-minti431'],
        OVERVIEW_MAIN_KEYWORDS['yural-tonggam-cream'],
        OVERVIEW_MAIN_KEYWORDS['yural-myeongga-bonhwan']
    ]`, context))),
    ['갈라431', '민티431', '유랄통감크림', '유랄명가본환']
);
assert.match(overviewMainSearch.html, /메인 검색량[\s\S]*갈라431/);
assert.ok(
    overviewMainSearch.html.indexOf('판매량') <
        overviewMainSearch.html.indexOf('전환율') &&
        overviewMainSearch.html.indexOf('전환율') <
        overviewMainSearch.html.indexOf('성과'),
    '판매량 다음에 전환율과 성과를 순서대로 표시한다'
);

const brandAdSpend = vm.runInContext(`(() => {
    state.marketingProducts = [
        { id: 'gala', brand: '이너리움' },
        { id: 'minti', brand: '이너리움' }
    ];
    state.marketingBrandMetrics = [
        { brand: '이너리움', metric_date: '2026-08-26', naver_ad_spend: 500 }
    ];
    return aggregateMarketingMetrics([
        { product_id: 'gala', metric_date: '2026-08-26', ad_spend: 100 },
        { product_id: 'minti', metric_date: '2026-08-26', ad_spend: 200 }
    ]).ad_spend;
})()`, context);
assert.equal(brandAdSpend, 500, '브랜드 광고비를 제품 수만큼 중복 합산하지 않는다');
const partialBrandAdSpend = vm.runInContext(`(() => {
    state.marketingProducts = [
        { id: 'gala', brand: '이너리움' },
        { id: 'minti', brand: '이너리움' }
    ];
    state.marketingBrandMetrics = [{
        brand: '이너리움',
        metric_date: '2026-08-27',
        naver_ad_spend: 500,
        source_details: { naver_ad_spend: { allocation_complete: false } }
    }];
    return aggregateMarketingMetrics([
        {
            product_id: 'gala', metric_date: '2026-08-27', ad_spend: 100,
            data_completeness: { ad_spend: false }
        },
        {
            product_id: 'minti', metric_date: '2026-08-27', ad_spend: 200,
            data_completeness: { ad_spend: false }
        }
    ]);
})()`, context);
assert.equal(partialBrandAdSpend.ad_spend, 300, '미분류 광고비가 있으면 제품별 확인된 금액만 보존한다');
assert.equal(partialBrandAdSpend.adSpendComplete, false, '부분 광고비를 브랜드 확정 총액으로 오인하지 않는다');

const sharedBrandKeywordCount = vm.runInContext(`(() => {
    state.dailyKeywordMetrics = [
        { product_id: 'gala', keyword: '이너리움', metric_date: '2026-08-28', search_volume: 570 },
        { product_id: 'minti', keyword: '이너리움', metric_date: '2026-08-28', search_volume: 570 }
    ];
    state.marketingSearchSnapshots = [];
    return getKeywordSearchOverview([], new Set(['gala', 'minti'])).length;
})()`, context);
assert.equal(sharedBrandKeywordCount, 1, '여러 제품을 볼 때 동일 브랜드 검색어를 중복 표시하지 않는다');
assert.equal(
    vm.runInContext(`(() => {
        state.selectedMarketingProduct = 'gala';
        state.marketingProducts = [{ id: 'gala', brand: '이너리움' }];
        state.marketingSearchSnapshots = [
            { product_id: 'gala', keyword: '이너리움', snapshot_date: '2026-08-27', search_volume: 100 },
            { product_id: 'gala', keyword: '이너리움', snapshot_date: '2026-08-28', search_volume: 999 }
        ];
        state.dailyKeywordMetrics = [
            { product_id: 'gala', keyword: '이너리움', metric_date: '2026-08-28', search_volume: 200 }
        ];
        return calculateSearchMomentum();
    })()`, context),
    100,
    '같은 날짜의 스냅샷과 일 지표를 두 시점으로 중복 계산하지 않는다'
);
vm.runInContext(`state.selectedMarketingProduct = 'all'`, context);

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
assert.equal(vm.runInContext(`canonicalProductKeyword('yural-tonggam-cream', '통감크림')`, context), '통감크림');
assert.equal(vm.runInContext(`canonicalProductKeyword('yural-myeongga-bonhwan', '유랄 명가본환')`, context), '유랄명가본환');
assert.equal(vm.runInContext(`canonicalProductKeyword('yural-myeongga-bonhwan', '명가본환')`, context), '명가본환');
assert.match(
    vm.runInContext(`renderReportRow('판매량', ['2026-08-27', '2026-08-26'], new Map([
        ['2026-08-27', { value: 12 }],
        ['2026-08-26', { value: 10 }]
    ]), metric => formatMetric(metric.value))`, context),
    /▲ 증가 2/,
    '일일 보고서에 전일 대비 증감을 표시한다'
);

const yesterday = vm.runInContext('kstDateString(-1)', context);
vm.runInContext(`
    state.user = { id: 'user-1', email: 'employee@jangsai.local' };
    state.profile = { role_id: 'employee', display_name: '테스트 직원' };
    state.marketingProducts = [
        { id: 'product-1', brand: '테스트브랜드', name: '테스트상품', slug: 'test', sort_order: 1 },
        { id: 'product-2', brand: '테스트브랜드', name: '두번째상품', slug: 'test-2', sort_order: 2 }
    ];
    state.marketingBrandMetrics = [{ brand: '테스트브랜드', metric_date: '${yesterday}', naver_ad_spend: 4321 }];
    state.marketingMetrics = [{
        product_id: 'product-1', metric_date: '${yesterday}',
        blog_views: 100, cafe_views: 100, cafe24_visits: 20, cafe24_product_views: 20, cafe24_orders: 2,
        smartstore_visits: 38, smartstore_orders: 3, smartstore_pay_count: 2, smartstore_conversion_rate: 5.3,
        coupang_visits: null, coupang_orders: 0,
        cafe24_revenue: 10000, smartstore_revenue: 0, coupang_revenue: 0,
        keyword_search_volume: 50, site_visits: 0, tracked_visits: 0, tracked_orders: 0, ad_spend: 1000,
        data_completeness: { cafe24_visits: true, cafe24_product_views: true, cafe24_orders: true, smartstore_visits: true, smartstore_pay_count: true, smartstore_conversion_rate: true }
    }];
    state.marketingTargets = [];
    state.marketingRuns = [];
`, context);
const funnelHtml = vm.runInContext('renderFunnelDashboardView()', context);
assert.match(funnelHtml, /노출지수/);
assert.match(funnelHtml, /데이터 완성도/);
assert.match(funnelHtml, /Grok Bot Bridge 연결 대기/);
assert.match(funnelHtml, /전체 구매<\/span><strong>—<\/strong>/, '불완전 판매량을 전체 구매로 표시하지 않는다');
assert.match(funnelHtml, /전체 매출<\/span><strong>—<\/strong>/, '불완전 매출을 전체 매출로 표시하지 않는다');
assert.match(funnelHtml, /총 매출<\/span><strong>—<\/strong>/, '불완전 매출을 KPI 총매출로 표시하지 않는다');
assert.match(funnelHtml, /ROAS<\/span><strong>—<\/strong>/, '매출 또는 광고비가 불완전하면 ROAS를 계산하지 않는다');
const overviewHtml = vm.runInContext('renderOverviewDashboardView()', context);
assert.match(overviewHtml, /서버 자동수집/);
assert.match(overviewHtml, /Grok 자동수집/);
assert.match(overviewHtml, /채널별 구매 전환율/);
assert.match(overviewHtml, /\d+개 제품 통합 비교/);
assert.match(overviewHtml, /자사몰[\s\S]*스마트스토어[\s\S]*쿠팡/);
assert.match(overviewHtml, /자사몰 방문[\s\S]*상품상세\(PV\)/);
const expectedMetricDate = vm.runInContext('kstDateString(-1)', context);
const bridgeFailureHtml = vm.runInContext(`(() => {
    state.marketingBridgeClients = [{
        client_key: 'grok-marketing-ops',
        last_seen_at: new Date().toISOString()
    }];
    state.marketingBridgeJobs = [{
        metric_date: '${expectedMetricDate}',
        provider: 'smartstore',
        account: 'yural',
        status: 'needs_login',
        last_error: '로그인 만료'
    }];
    return renderFunnelDashboardView();
})()`, context);
assert.match(bridgeFailureHtml, /유랄 스마트스토어 재로그인 필요/);
assert.match(bridgeFailureHtml, /로그인 만료/);
assert.equal(
    vm.runInContext(`isGrokJobOverdue(
        { metric_date: '2026-08-29', provider: 'smartstore', status: 'pending' },
        new Date('2026-08-30T01:21:00Z')
    )`, context),
    true,
    '스마트스토어 예약시간 30분 후에도 대기 중이면 미실행으로 판정한다'
);
assert.equal(
    vm.runInContext(`isGrokJobOverdue(
        { metric_date: '2026-08-29', provider: 'coupang', status: 'pending' },
        new Date('2026-08-30T04:09:00Z')
    )`, context),
    false,
    '쿠팡 공식 데이터 확정 전에는 지연으로 오인하지 않는다'
);
const reportTableHtml = vm.runInContext('renderDailyReportTable(state.marketingProducts[0])', context);
assert.match(reportTableHtml, /테스트상품 블로그 방문자 수\(조회수\)/);
assert.match(reportTableHtml, /스마트스토어 전환율[\s\S]*5\.3%/);
assert.match(reportTableHtml, /테스트상품 일 광고비[\s\S]*1,000원/);
assert.match(reportTableHtml, /테스트상품 월 누적 광고비[\s\S]*1,000원/);
assert.equal(
    vm.runInContext(`aggregateMarketingMetrics([
        state.marketingMetrics[0],
        { ...state.marketingMetrics[0], product_id: 'product-2', ad_spend: 2000 }
    ]).ad_spend`, context),
    4321,
    '브랜드의 전체 제품을 선택했을 때만 브랜드 광고비 총액을 사용한다'
);
assert.match(
    vm.runInContext(`(() => {
        state.marketingMetrics[0].blog_views = null;
        return renderDailyReportTable(state.marketingProducts[0]);
    })()`, context),
    /테스트상품 블로그 방문자 수\(조회수\)[\s\S]*report-no-data/,
    '블로그 수집값이 없으면 0이 아닌 미수집으로 표시한다'
);
assert.match(
    vm.runInContext(`(() => {
        state.marketingMetrics[0].cafe_views = 0;
        delete state.marketingMetrics[0].data_completeness.cafe_views;
        return renderDailyReportTable(state.marketingProducts[0]);
    })()`, context),
    /카페 글 조회수[\s\S]*report-no-data/,
    '카페 미수집 기본값 0도 실제 조회수 0으로 오인하지 않는다'
);
assert.match(
    vm.runInContext(`(() => {
        state.marketingBatches = [{
            metric_date: '${expectedMetricDate}', status: 'success',
            started_at: new Date().toISOString(), details: {}
        }];
        state.marketingMetrics = state.marketingProducts.map(product => ({
            product_id: product.id,
            metric_date: '${expectedMetricDate}',
            smartstore_visits: 0,
            smartstore_pay_count: 0,
            smartstore_conversion_rate: 0,
            smartstore_orders: 0,
            smartstore_revenue: 0,
            coupang_wing_visits: 0,
            coupang_wing_orders: 0,
            coupang_wing_revenue: 0,
            coupang_wing_conversion_rate: 0,
            coupang_growth_visits: 0,
            coupang_growth_orders: 0,
            coupang_growth_revenue: 0,
            coupang_growth_conversion_rate: 0,
            coupang_conversion_rate: 0,
            data_completeness: {
                smartstore_visits: true,
                smartstore_pay_count: true,
                smartstore_conversion_rate: true,
                smartstore_orders: true,
                smartstore_revenue: true,
                coupang_wing_visits: true,
                coupang_wing_orders: true,
                coupang_wing_revenue: true,
                coupang_wing_conversion_rate: true,
                coupang_growth_visits: true,
                coupang_growth_orders: true,
                coupang_growth_revenue: true,
                coupang_growth_conversion_rate: true,
                coupang_conversion_rate: true
            }
        }));
        state.marketingBridgeClients = [{
            client_key: 'grok-marketing-ops',
            last_seen_at: new Date().toISOString(),
            details: { runbook_version: 8 }
        }];
        state.marketingBridgeJobs = [
            { metric_date: '${expectedMetricDate}', provider: 'smartstore', account: 'innerium', status: 'completed' },
            { metric_date: '${expectedMetricDate}', provider: 'smartstore', account: 'yural', status: 'completed' },
            { metric_date: '${expectedMetricDate}', provider: 'coupang', account: 'innerium', status: 'completed' },
            { metric_date: '${expectedMetricDate}', provider: 'coupang', account: 'yural', status: 'completed' }
        ];
        state.marketingRuns = [{
            metric_date: '${expectedMetricDate}', provider: 'smartstore', status: 'failed',
            error_message: '폐기된 로컬 수집기 오류'
        }];
        return renderFunnelDashboardView();
    })()`, context),
    /서버 API·Grok 자동수집 완료/,
    '폐기된 로컬 로그인 수집기 오류가 현재 Grok 정상 상태를 덮어쓰지 않는다'
);
assert.match(
    vm.runInContext(`(() => {
        state.marketingBridgeClients[0].details.runbook_version = 3;
        return renderFunnelDashboardView();
    })()`, context),
    /Grok Bot 운영지침 업데이트 대기/,
    '구버전 Grok 운영지침을 정상으로 표시하지 않는다'
);
assert.match(
    vm.runInContext(`(() => {
        state.marketingBridgeClients[0].details.runbook_version = 6;
        state.marketingBridgeClients[0].status = 'error';
        state.marketingBridgeClients[0].last_error = '검증 불일치';
        return renderFunnelDashboardView();
    })()`, context),
    /Grok Bot 검증 실패/,
    '작업값이 있어도 Grok 클라이언트 오류 상태를 정상으로 표시하지 않는다'
);
assert.match(
    vm.runInContext(`(() => {
        state.marketingBridgeClients[0].status = 'ready';
        state.marketingBridgeClients[0].last_error = null;
        state.marketingBridgeJobs = [];
        state.marketingMetrics = [];
        return renderFunnelDashboardView();
    })()`, context),
    /Grok Bot 로그인 채널 수집 대기/,
    'Bridge 접속만 있고 전일 채널 데이터가 없으면 완료로 오인하지 않는다'
);
const okrHtml = vm.runInContext('renderOkrDashboardView()', context);
assert.match(okrHtml, /분기·연간 목표/);
assert.match(okrHtml, /목표 600,000/, '브랜드 월 20만 뷰를 분기 60만 뷰 목표로 집계한다');

const adminUsersHtml = vm.runInContext(`(() => {
    state.adminUsers = [{
        id: 'user-1',
        username: '01012345678',
        display_name: '접속 사용자',
        role_id: 'employee',
        created_at: '2026-08-01T00:00:00Z',
        last_seen_at: '2026-08-31T06:30:00Z'
    }];
    return renderAdminUsers();
})()`, context);
assert.match(adminUsersHtml, /마지막 접속일/);
assert.match(adminUsersHtml, /접속 사용자[\s\S]*2026년 8월 31일/, '관리자 사용자 목록에 마지막 접속 시각을 표시한다');

console.log('marketing index tests passed');
