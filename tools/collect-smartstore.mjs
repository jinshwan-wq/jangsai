import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { hashSync } from 'bcryptjs';

const API_BASE = 'https://api.commerce.naver.com/external';
const INGEST_URL = 'https://pfmrqsfmkdnhzjimqocr.supabase.co/functions/v1/ingest-smartstore';
const CONFIG_PATH = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'JangsAI', 'smartstore-credentials.json');
const PRODUCT_RULES = [
  { slug: 'innerium-gala431', keywords: ['갈라431', '갈라 431'] },
  { slug: 'innerium-minti431', keywords: ['민티431', '민티 431'] },
  { slug: 'yural-tonggam-cream', keywords: ['통감크림', '통감 크림', '통감 MSM 크림'] },
  { slug: 'yural-myeongga-bonhwan', keywords: ['명가본환', '명가 본환'] },
];
const EXCLUDED_PRODUCT_WORDS = ['증정', '사은품', '샘플', '체험분', '빈박스', '공병'];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function decryptWindows(value) {
  const script = [
    'Add-Type -AssemblyName System.Security;',
    '$bytes=[Convert]::FromBase64String($env:JANGS_ENCRYPTED_SECRET);',
    '$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Text.Encoding]::UTF8.GetString($plain)',
  ].join('');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, JANGS_ENCRYPTED_SECRET: value },
  });
  if (result.status !== 0) throw new Error(`Windows 보안 저장소 복호화 실패: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '').replace(/[()[\]{}_\-+/.,]/g, '');
}

function productSlug(productName) {
  const normalized = normalizeName(productName);
  if (!normalized || EXCLUDED_PRODUCT_WORDS.some(word => normalized.includes(normalizeName(word)))) return null;
  return PRODUCT_RULES.find(rule => rule.keywords.some(keyword => normalized.includes(normalizeName(keyword))))?.slug || null;
}

function kstYesterday() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const date = new Date(`${formatter.format(new Date())}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function requestedDates() {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf('--from');
  const toIndex = args.indexOf('--to');
  const from = fromIndex >= 0 ? args[fromIndex + 1] : kstYesterday();
  const to = toIndex >= 0 ? args[toIndex + 1] : from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new Error('날짜는 --from YYYY-MM-DD --to YYYY-MM-DD 형식으로 입력하세요.');
  }
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  if (dates.length > 180) throw new Error('한 번에 최대 180일까지 수집할 수 있습니다.');
  return dates;
}

async function getAccessToken(account) {
  const secret = decryptWindows(account.clientSecret);
  const timestamp = Date.now().toString();
  const clientSecretSign = Buffer.from(hashSync(`${account.clientId}_${timestamp}`, secret), 'utf8').toString('base64');
  const response = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: account.clientId,
      timestamp,
      client_secret_sign: clientSecretSign,
      grant_type: 'client_credentials',
      type: 'SELF',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`${account.label} 인증 실패 (${response.status}): ${payload.message || payload.code || '응답 오류'}`);
  }
  return payload.access_token;
}

async function fetchOrders(account, accessToken, metricDate) {
  const orders = [];
  for (let page = 1; page <= 100; page++) {
    const url = new URL(`${API_BASE}/v1/pay-order/seller/product-orders`);
    url.searchParams.set('from', `${metricDate}T00:00:00.000+09:00`);
    url.searchParams.set('to', `${addDays(metricDate, 1)}T00:00:00.000+09:00`);
    url.searchParams.set('rangeType', 'PAYED_DATETIME');
    url.searchParams.set('pageSize', '300');
    url.searchParams.set('page', String(page));
    let response;
    let payload;
    for (let attempt = 1; attempt <= 5; attempt++) {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      payload = await response.json().catch(() => ({}));
      if (response.status !== 429 || attempt === 5) break;
      const retryAfter = Number(response.headers.get('retry-after')) || attempt;
      await sleep(Math.max(1, retryAfter) * 1000);
    }
    if (!response.ok) {
      throw new Error(`${account.label} 주문 조회 실패 (${response.status}): ${payload.message || payload.code || '응답 오류'}`);
    }
    const contents = Array.isArray(payload?.data?.contents) ? payload.data.contents : [];
    orders.push(...contents);
    if (!payload?.data?.pagination?.hasNext) break;
    await sleep(350);
  }
  return orders;
}

function findChannelProducts(value, inheritedName = '') {
  if (Array.isArray(value)) return value.flatMap(item => findChannelProducts(item, inheritedName));
  if (!value || typeof value !== 'object') return [];
  const name = String(
    value.name || value.productName || value.channelProductName || value.originProductName || inheritedName || '',
  );
  const current = value.channelProductNo
    ? [{ channelProductNo: String(value.channelProductNo), name }]
    : [];
  return current.concat(
    Object.values(value).flatMap(item => findChannelProducts(item, name)),
  );
}

async function fetchProducts(account, accessToken) {
  const products = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetch(`${API_BASE}/v1/products/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page, size: 500 }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${account.label} 상품 조회 실패 (${response.status}): ${payload.message || payload.code || '응답 오류'}`);
    }
    const pageProducts = findChannelProducts(payload);
    products.push(...pageProducts);
    const hasNext = payload?.data?.pagination?.hasNext ?? payload?.pagination?.hasNext;
    if (!hasNext) break;
  }
  return [...new Map(products.map(product => [product.channelProductNo, product])).values()];
}

function aggregateOrders(accountOrders) {
  const totals = new Map(PRODUCT_RULES.map(rule => [rule.slug, { product_slug: rule.slug, orders: 0, revenue: 0 }]));
  for (const { account, orders } of accountOrders) {
    for (const record of orders) {
      const product = record?.content?.productOrder || record?.productOrder || record?.productOrderResponseContent || record;
      const slug = productSlug(product?.productName);
      if (!slug) continue;
      const quantity = Math.max(0, Number(product.remainQuantity ?? product.quantity ?? 0) || 0);
      const status = String(product.productOrderStatus || '');
      const revenue = Math.max(
        0,
        Number(product.remainPaymentAmount ??
          (['CANCELED', 'CANCELED_BY_NOPAYMENT', 'RETURNED'].includes(status) ? 0 : product.totalPaymentAmount) ??
          0) || 0,
      );
      const total = totals.get(slug);
      total.orders += quantity;
      total.revenue += revenue;
      if (!total.accounts) total.accounts = new Set();
      total.accounts.add(account.key);
    }
  }
  return [...totals.values()].map(({ accounts: _accounts, ...metric }) => ({
    ...metric,
    orders: Math.round(metric.orders),
    revenue: Math.round(metric.revenue),
  }));
}

async function ingest(metricDate, metrics, config) {
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-smartstore-secret': decryptWindows(config.ingestSecret),
    },
    body: JSON.stringify({
      metric_date: metricDate,
      metrics,
      accounts: config.accounts.map(account => account.key),
      account_count: config.accounts.length,
      trigger: process.argv.includes('--from') ? 'local_backfill' : 'local_windows_scheduler',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(`Supabase 저장 실패 (${response.status}): ${payload.error || payload.errors?.join(', ') || '응답 오류'}`);
  }
  return payload;
}

async function main() {
  const config = JSON.parse((await readFile(CONFIG_PATH, 'utf8')).replace(/^\uFEFF/, ''));
  if (!Array.isArray(config.accounts) || !config.accounts.length || !config.ingestSecret) {
    throw new Error('스마트스토어 보안 설정이 올바르지 않습니다.');
  }
  const accountIndex = process.argv.indexOf('--account');
  const accountKey = accountIndex >= 0 ? process.argv[accountIndex + 1] : '';
  const accounts = accountKey
    ? config.accounts.filter(account => account.key === accountKey)
    : config.accounts;
  if (!accounts.length) throw new Error(`연결되지 않은 스마트스토어 계정입니다: ${accountKey}`);
  const tokens = new Map();
  for (const account of accounts) tokens.set(account.key, await getAccessToken(account));

  if (process.argv.includes('--list-products')) {
    for (const account of accounts) {
      const products = await fetchProducts(account, tokens.get(account.key));
      console.log(`${account.label} 상품 ${products.length}개`);
      for (const product of products) {
        console.log(`${product.channelProductNo}\t${product.name || '(상품명 없음)'}`);
      }
    }
    return;
  }
  if (process.argv.includes('--inspect-orders')) {
    for (const metricDate of requestedDates()) {
      for (const account of accounts) {
        const orders = await fetchOrders(account, tokens.get(account.key), metricDate);
        const names = [...new Set(orders.map(record => {
          const product = record?.content?.productOrder || record?.productOrder || record?.productOrderResponseContent || record;
          return product?.productName;
        }).filter(Boolean))];
        if (orders.length) console.log(`${metricDate} ${account.label}: ${orders.length}건 · ${names.join(' | ')}`);
        await sleep(350);
      }
    }
    return;
  }
  if (config.accounts.length < 2 || accountKey) {
    throw new Error('이너리움과 유랄 계정 연결이 모두 끝난 뒤 수집을 실행할 수 있습니다.');
  }

  for (const metricDate of requestedDates()) {
    const accountOrders = [];
    for (const account of accounts) {
      const orders = await fetchOrders(account, tokens.get(account.key), metricDate);
      accountOrders.push({
        account,
        orders,
      });
      if (process.argv.includes('--verbose')) {
        const names = [...new Set(orders.map(record => {
          const product = record?.content?.productOrder || record?.productOrder || record?.productOrderResponseContent || record;
          return product?.productName;
        }).filter(Boolean))];
        console.log(`${metricDate} ${account.label}: 주문 ${orders.length}건, 상품 ${names.join(' | ') || '없음'}`);
        if (orders.length && !names.length) {
          console.log(`응답 필드 구조: ${JSON.stringify(Object.fromEntries(
            Object.entries(orders[0]).map(([key, value]) => [
              key,
              value && typeof value === 'object' ? Object.keys(value) : typeof value,
            ]),
          ))}`);
        }
      }
    }
    const metrics = aggregateOrders(accountOrders);
    await ingest(metricDate, metrics, config);
    console.log(`${metricDate} 스마트스토어 수집 완료: ${metrics.map(item => `${item.product_slug} ${item.orders}건/${item.revenue}원`).join(', ')}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
