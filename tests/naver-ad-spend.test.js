const assert = require('node:assert/strict');
const test = require('node:test');

const modulePromise = import('../supabase/functions/collect-marketing/naver-ad-spend.mjs');

test('네이버 소재 유형별 제목 필드를 추출한다', async () => {
  const { extractNaverAdTitle } = await modulePromise;
  assert.equal(
    extractNaverAdTitle({ ad: { productName: '이너리움 갈라431' }, adAttr: { bidAmt: 70 } }),
    '이너리움 갈라431',
  );
  assert.equal(
    extractNaverAdTitle({ ad: { headline: '유랄 통감크림 공식몰', description: '설명' } }),
    '유랄 통감크림 공식몰',
  );
});

test('소재 제목을 브랜드별 제품 하나에만 분류한다', async () => {
  const { classifyNaverAdTitle } = await modulePromise;
  assert.equal(
    classifyNaverAdTitle('이너리움', '저분자 피쉬콜라겐 민티 431').product_slug,
    'innerium-minti431',
  );
  assert.equal(
    classifyNaverAdTitle('유랄', '유랄 명가 본환 공식몰').product_slug,
    'yural-myeongga-bonhwan',
  );
  assert.equal(classifyNaverAdTitle('유랄', '유랄 건강식품 공식몰').product_slug, null);
});

test('제품별 소재 광고비와 미분류 금액을 브랜드 총액에 맞춰 검증한다', async () => {
  const { buildNaverAdSpendAllocation } = await modulePromise;
  const ads = [
    { nccAdId: 'ad-1', ad: { headline: '갈라431' } },
    { nccAdId: 'ad-2', ad: { productName: '민티 431' } },
    { nccAdId: 'ad-3', ad: { headline: '이너리움 공식몰' } },
  ];
  const result = buildNaverAdSpendAllocation(
    '이너리움',
    ads,
    new Map([['ad-1', 1000], ['ad-2', 2000], ['ad-3', 300]]),
    3500,
  );
  assert.deepEqual(result.product_spend, {
    'innerium-gala431': 1000,
    'innerium-minti431': 2000,
  });
  assert.equal(result.unclassified_spend, 500);
  assert.equal(result.unavailable_spend, 200);
  assert.equal(result.allocation_complete, false);
});

test('모든 유료 소재가 분류되면 제품 합계가 브랜드 합계와 일치한다', async () => {
  const { buildNaverAdSpendAllocation } = await modulePromise;
  const result = buildNaverAdSpendAllocation(
    '유랄',
    [
      { nccAdId: 'ad-1', ad: { headline: '유랄통감크림' } },
      { nccAdId: 'ad-2', ad: { headline: '명가본환' } },
    ],
    { 'ad-1': 1200, 'ad-2': 800 },
    2000,
  );
  assert.equal(result.allocation_complete, true);
  assert.equal(result.unclassified_spend, 0);
});

test('광고계정과 무관하게 소재·캠페인 제목으로 네 제품을 교차 분류한다', async () => {
  const { buildNaverAdAccountAllocation } = await modulePromise;
  const result = buildNaverAdAccountAllocation(
    'account-1',
    [
      {
        nccAdId: 'ad-1',
        ad: { headline: '지긋한 손가락 통증 극복했어요' },
        classificationContext: { campaignName: '유랄 통감크림', adgroupName: '파워콘텐츠' },
      },
      {
        nccAdId: 'ad-2',
        ad: { headline: '한채아 PICK' },
        classificationContext: { campaignName: '이너리움', adgroupName: '갈라431' },
      },
    ],
    new Map([['ad-1', 3000], ['ad-2', 1000]]),
    4000,
  );
  assert.equal(result.product_spend['yural-tonggam-cream'], 3000);
  assert.equal(result.product_spend['innerium-gala431'], 1000);
  assert.equal(result.allocation_complete, true);
});
