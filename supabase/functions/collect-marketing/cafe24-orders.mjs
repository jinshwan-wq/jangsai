const CANCELLED_ITEM_STATUSES = new Set(['C1', 'C2', 'C3', 'E1']);

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemRevenue(item) {
  const paymentAmount = numberValue(item?.payment_amount);
  if (paymentAmount !== null) return Math.max(0, paymentAmount);
  const quantity = Math.max(0, numberValue(item?.quantity) || 0);
  const unitPrice = (numberValue(item?.product_price) || 0) +
    (numberValue(item?.option_price) || 0);
  const discounts = [
    item?.additional_discount_price,
    item?.coupon_discount_price,
    item?.app_item_discount_amount,
    item?.market_discount_amount,
  ].reduce((sum, value) => sum + (numberValue(value) || 0), 0);
  return Math.max(0, unitPrice * quantity - discounts);
}

function itemAllocationWeight(item) {
  const quantity = Math.max(0, numberValue(item?.quantity) || 0);
  const unitPrice = (numberValue(item?.product_price) || 0) +
    (numberValue(item?.option_price) || 0);
  const itemDiscounts = [
    item?.additional_discount_price,
    item?.coupon_discount_price,
    item?.app_item_discount_amount,
    item?.market_discount_amount,
  ].reduce((sum, value) => sum + (numberValue(value) || 0), 0);
  return Math.max(itemRevenue(item), unitPrice * quantity - itemDiscounts, 0);
}

function merchandiseNaverTender(order, activeItems) {
  const naverTender = Math.max(
    0,
    (numberValue(order?.naver_point) || 0) +
      (numberValue(order?.naver_cash) || 0),
  );
  if (!naverTender) return 0;
  const amount = order?.actual_order_amount || order?.initial_order_amount || {};
  const orderPrice = numberValue(amount?.order_price_amount);
  const sellerDiscountsAndPoints = [
    amount?.coupon_discount_price,
    amount?.membership_discount_amount,
    amount?.set_product_discount_amount,
    amount?.app_discount_amount,
    amount?.market_other_discount_amount,
    amount?.points_spent_amount,
    amount?.credits_spent_amount,
  ].reduce((sum, value) => sum + (numberValue(value) || 0), 0);
  const merchandiseDue = orderPrice !== null
    ? Math.max(0, orderPrice - sellerDiscountsAndPoints)
    : activeItems.reduce(
      (sum, { allocationWeight }) => sum + allocationWeight,
      0,
    );
  return Math.min(naverTender, merchandiseDue);
}

function allocateIntegerByWeight(amount, weights) {
  const roundedAmount = Math.max(0, Math.round(numberValue(amount) || 0));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!roundedAmount || totalWeight <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => roundedAmount * weight / totalWeight);
  const allocated = exact.map(Math.floor);
  let remaining = roundedAmount - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - allocated[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index++) {
    allocated[order[index].index]++;
  }
  return allocated;
}

export function summarizeCafe24Order(order, trackedProductNos) {
  const tracked = trackedProductNos instanceof Set
    ? trackedProductNos
    : new Set([...trackedProductNos].map(String));
  const activeItems = (Array.isArray(order?.items) ? order.items : [])
    .filter((item) => !CANCELLED_ITEM_STATUSES.has(String(item?.status_code || '')))
    .map((item) => ({
      item,
      baseRevenue: itemRevenue(item),
      allocationWeight: itemAllocationWeight(item),
    }));
  const tenderAllocations = allocateIntegerByWeight(
    merchandiseNaverTender(order, activeItems),
    activeItems.map(({ allocationWeight }) => allocationWeight),
  );

  return activeItems.reduce((summary, entry, index) => {
    if (!tracked.has(String(entry.item?.product_no))) return summary;
    const naverTender = tenderAllocations[index] || 0;
    summary.salesQuantity += Math.max(0, numberValue(entry.item?.quantity) || 0);
    summary.revenue += entry.baseRevenue + naverTender;
    summary.naverTenderIncluded += naverTender;
    return summary;
  }, {
    salesQuantity: 0,
    revenue: 0,
    naverTenderIncluded: 0,
  });
}
