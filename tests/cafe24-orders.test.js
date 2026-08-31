const assert = require('node:assert/strict');
const test = require('node:test');

const modulePromise = import('../supabase/functions/collect-marketing/cafe24-orders.mjs');

test('네이버페이 포인트를 차감하지 않고 자사몰 매출에 포함한다', async () => {
  const { summarizeCafe24Order } = await modulePromise;
  const summary = summarizeCafe24Order({
    payment_amount: '297081.00',
    naver_point: '1719.00',
    items: [{
      order_item_code: '20260830-0000011-01',
      product_no: 18,
      quantity: 1,
      payment_amount: '297081.00',
      status_code: 'N1',
    }],
  }, new Set(['18']));

  assert.deepEqual(summary, {
    salesQuantity: 1,
    revenue: 298800,
    naverPointIncluded: 1719,
  });
});

test('복수 상품 주문의 네이버페이 포인트를 결제금액 비율로 배분한다', async () => {
  const { summarizeCafe24Order } = await modulePromise;
  const order = {
    naver_point: 10,
    items: [
      { product_no: 1, quantity: 1, payment_amount: 60, status_code: 'N1' },
      { product_no: 2, quantity: 1, payment_amount: 40, status_code: 'N1' },
    ],
  };

  assert.deepEqual(summarizeCafe24Order(order, new Set(['1'])), {
    salesQuantity: 1,
    revenue: 66,
    naverPointIncluded: 6,
  });
  assert.deepEqual(summarizeCafe24Order(order, new Set(['2'])), {
    salesQuantity: 1,
    revenue: 44,
    naverPointIncluded: 4,
  });
});
