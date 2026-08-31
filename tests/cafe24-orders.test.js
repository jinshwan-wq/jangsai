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
    naverTenderIncluded: 1719,
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
    naverTenderIncluded: 6,
  });
  assert.deepEqual(summarizeCafe24Order(order, new Set(['2'])), {
    salesQuantity: 1,
    revenue: 44,
    naverTenderIncluded: 4,
  });
});

test('전액 네이버페이 결제에서도 배송비를 제외한 상품 매출을 보존한다', async () => {
  const { summarizeCafe24Order } = await modulePromise;
  const summary = summarizeCafe24Order({
    naver_point: 62400,
    actual_order_amount: {
      order_price_amount: 58900,
      shipping_fee: 3500,
    },
    items: [{
      product_no: 20,
      quantity: 1,
      product_price: 58900,
      payment_amount: 0,
      status_code: 'N1',
    }],
  }, new Set(['20']));

  assert.deepEqual(summary, {
    salesQuantity: 1,
    revenue: 58900,
    naverTenderIncluded: 58900,
  });
});

test('판매자 부담 쿠폰과 자사몰 적립금은 현금성 매출에 되돌리지 않는다', async () => {
  const { summarizeCafe24Order } = await modulePromise;
  const summary = summarizeCafe24Order({
    naver_point: 0,
    actual_order_amount: {
      order_price_amount: 161400,
      coupon_discount_price: 5000,
      points_spent_amount: 8070,
    },
    items: [{
      product_no: 18,
      quantity: 1,
      product_price: 161400,
      coupon_discount_price: 5000,
      payment_amount: 148330,
      status_code: 'N1',
    }],
  }, new Set(['18']));

  assert.deepEqual(summary, {
    salesQuantity: 1,
    revenue: 148330,
    naverTenderIncluded: 0,
  });
});

test('네이버캐시는 포인트와 동일한 제3자 결제수단으로 포함한다', async () => {
  const { summarizeCafe24Order } = await modulePromise;
  const summary = summarizeCafe24Order({
    naver_cash: 5000,
    actual_order_amount: { order_price_amount: 70000 },
    items: [{
      product_no: 1,
      quantity: 1,
      product_price: 70000,
      payment_amount: 65000,
      status_code: 'N1',
    }],
  }, new Set(['1']));

  assert.deepEqual(summary, {
    salesQuantity: 1,
    revenue: 70000,
    naverTenderIncluded: 5000,
  });
});
