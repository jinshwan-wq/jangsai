export const PRODUCT_AD_TITLE_RULES = Object.freeze({
  '이너리움': Object.freeze([
    Object.freeze({
      product_slug: 'innerium-gala431',
      aliases: Object.freeze(['갈라431', '갈라 431', 'gala431', 'gala 431']),
    }),
    Object.freeze({
      product_slug: 'innerium-minti431',
      aliases: Object.freeze(['민티431', '민티 431', 'minty431', 'minty 431', 'minti431']),
    }),
  ]),
  '유랄': Object.freeze([
    Object.freeze({
      product_slug: 'yural-tonggam-cream',
      aliases: Object.freeze(['유랄통감크림', '통감크림', '통감 크림']),
    }),
    Object.freeze({
      product_slug: 'yural-myeongga-bonhwan',
      aliases: Object.freeze(['유랄명가본환', '명가본환', '명가 본환']),
    }),
  ]),
});

const TITLE_KEYS = new Set([
  'headline',
  'productname',
  'subject',
  'title',
  'name',
  'campaignname',
  'adgroupname',
]);

function normalizedText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

function collectTitleValues(value, key, output) {
  if (typeof value === 'string') {
    if (TITLE_KEYS.has(String(key || '').toLowerCase()) && value.trim()) output.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectTitleValues(item, key, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([childKey, child]) => collectTitleValues(child, childKey, output));
}

export function extractNaverAdTitle(ad) {
  const values = [];
  collectTitleValues(ad?.ad, '', values);
  collectTitleValues(ad?.adAttr, '', values);
  collectTitleValues(ad?.classificationContext, '', values);
  return [...new Set(values)].join(' | ').slice(0, 500);
}

function classifyWithRules(rules, title) {
  const normalizedTitle = normalizedText(title);
  const matches = rules.filter(rule =>
    rule.aliases.some(alias => normalizedTitle.includes(normalizedText(alias)))
  );
  if (matches.length === 1) {
    return { product_slug: matches[0].product_slug, reason: 'title_match' };
  }
  return {
    product_slug: null,
    reason: matches.length > 1 ? 'ambiguous_title' : 'unmatched_title',
  };
}

export function classifyNaverAdTitle(brand, title) {
  const rules = PRODUCT_AD_TITLE_RULES[brand];
  if (!rules) throw new Error(`지원하지 않는 광고 브랜드입니다: ${brand}`);
  return classifyWithRules(rules, title);
}

export function classifyNaverAdProduct(title) {
  const rules = Object.entries(PRODUCT_AD_TITLE_RULES).flatMap(([brand, brandRules]) =>
    brandRules.map(rule => ({ ...rule, brand }))
  );
  const result = classifyWithRules(rules, title);
  const matched = rules.find(rule => rule.product_slug === result.product_slug);
  return { ...result, brand: matched?.brand || null };
}

export function buildNaverAdSpendAllocation(brand, ads, spendById, brandTotal) {
  const rules = PRODUCT_AD_TITLE_RULES[brand];
  if (!rules) throw new Error(`지원하지 않는 광고 브랜드입니다: ${brand}`);
  if (!Number.isSafeInteger(brandTotal) || brandTotal < 0) {
    throw new Error('브랜드 광고비 합계가 올바르지 않습니다.');
  }
  const productSpend = Object.fromEntries(rules.map(rule => [rule.product_slug, 0]));
  const seenIds = new Set();
  const classified = [];
  const unclassified = [];
  let observedSpend = 0;

  for (const ad of Array.isArray(ads) ? ads : []) {
    const adId = String(ad?.nccAdId || '').trim();
    if (!adId || seenIds.has(adId)) continue;
    seenIds.add(adId);
    const rawSpend = spendById instanceof Map ? spendById.get(adId) : spendById?.[adId];
    const spend = Number(rawSpend || 0);
    if (!Number.isSafeInteger(spend) || spend < 0) {
      throw new Error(`소재 광고비가 올바르지 않습니다: ${adId}`);
    }
    observedSpend += spend;
    const title = extractNaverAdTitle(ad);
    const match = classifyNaverAdTitle(brand, title);
    const row = { ad_id: adId, title, spend, reason: match.reason };
    if (match.product_slug) {
      productSpend[match.product_slug] += spend;
      classified.push({ ...row, product_slug: match.product_slug });
    } else if (spend > 0) {
      unclassified.push(row);
    }
  }

  if (observedSpend > brandTotal) {
    throw new Error(`소재 광고비가 브랜드 합계보다 큽니다: ${observedSpend}/${brandTotal}`);
  }
  const classifiedSpend = Object.values(productSpend).reduce((sum, value) => sum + value, 0);
  const unavailableSpend = brandTotal - observedSpend;
  const unclassifiedSpend = brandTotal - classifiedSpend;
  return {
    brand,
    brand_total: brandTotal,
    product_spend: productSpend,
    classified_spend: classifiedSpend,
    unclassified_spend: unclassifiedSpend,
    unavailable_spend: unavailableSpend,
    allocation_complete: unclassifiedSpend === 0,
    classified,
    unclassified,
  };
}

export function buildNaverAdAccountAllocation(accountKey, ads, spendById, accountTotal) {
  if (!Number.isSafeInteger(accountTotal) || accountTotal < 0) {
    throw new Error('광고계정 광고비 합계가 올바르지 않습니다.');
  }
  const allRules = Object.values(PRODUCT_AD_TITLE_RULES).flat();
  const productSpend = Object.fromEntries(allRules.map(rule => [rule.product_slug, 0]));
  const seenIds = new Set();
  const classified = [];
  const unclassified = [];
  let observedSpend = 0;

  for (const ad of Array.isArray(ads) ? ads : []) {
    const adId = String(ad?.nccAdId || '').trim();
    if (!adId || seenIds.has(adId)) continue;
    seenIds.add(adId);
    const rawSpend = spendById instanceof Map ? spendById.get(adId) : spendById?.[adId];
    const spend = Number(rawSpend || 0);
    if (!Number.isSafeInteger(spend) || spend < 0) {
      throw new Error(`소재 광고비가 올바르지 않습니다: ${adId}`);
    }
    observedSpend += spend;
    const title = extractNaverAdTitle(ad);
    const match = classifyNaverAdProduct(title);
    const row = { ad_id: adId, title, spend, reason: match.reason };
    if (match.product_slug) {
      productSpend[match.product_slug] += spend;
      classified.push({ ...row, product_slug: match.product_slug, brand: match.brand });
    } else if (spend > 0) {
      unclassified.push(row);
    }
  }

  if (observedSpend > accountTotal) {
    throw new Error(`소재 광고비가 계정 합계보다 큽니다: ${observedSpend}/${accountTotal}`);
  }
  const classifiedSpend = Object.values(productSpend).reduce((sum, value) => sum + value, 0);
  const unavailableSpend = accountTotal - observedSpend;
  const unclassifiedSpend = accountTotal - classifiedSpend;
  return {
    account_key: accountKey,
    account_total: accountTotal,
    product_spend: productSpend,
    classified_spend: classifiedSpend,
    unclassified_spend: unclassifiedSpend,
    unavailable_spend: unavailableSpend,
    allocation_complete: unclassifiedSpend === 0,
    classified,
    unclassified,
  };
}
