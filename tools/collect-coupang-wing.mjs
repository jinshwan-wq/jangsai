import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOCAL_DATA = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
const CONFIG_PATH = join(LOCAL_DATA, 'JangsAI', 'coupang-wing-config.json');
const INGEST_URL = 'https://pfmrqsfmkdnhzjimqocr.supabase.co/functions/v1/ingest-coupang';
const WING_URL = 'https://wing.coupang.com/tenants/business-insight/sales-analysis';
const ACCOUNTS = [
  {
    key: 'innerium',
    label: '이너리움',
    port: Number(process.env.COUPANG_INNERIUM_PORT) || 9231,
    profilePath: join(LOCAL_DATA, 'JangsAI', 'chrome-coupang-innerium'),
    products: [
      { slug: 'innerium-gala431', keywords: ['갈라431', '갈라 431'] },
      { slug: 'innerium-minti431', keywords: ['민티431', '민티 431'] },
    ],
  },
  {
    key: 'yural',
    label: '유랄',
    port: Number(process.env.COUPANG_YURAL_PORT) || 9232,
    profilePath: join(LOCAL_DATA, 'JangsAI', 'chrome-coupang-yural'),
    products: [
      { slug: 'yural-tonggam-cream', keywords: ['통감크림', '통감 크림', '통감 MSM 크림'] },
      { slug: 'yural-myeongga-bonhwan', keywords: ['명가본환', '명가 본환'] },
    ],
  },
];
const PRODUCT_RULES = ACCOUNTS.flatMap(account =>
  account.products.map(rule => ({ ...rule, accountKey: account.key }))
);
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

function productSlug(account, productName) {
  const normalized = normalizeName(productName);
  return account.products.find(rule =>
    rule.keywords.some(keyword => normalized.includes(normalizeName(keyword)))
  )?.slug || null;
}

function detectWingAccount(profileAccount, page) {
  const detectedKeys = new Set();
  for (const row of page.rows) {
    const normalized = normalizeName(row.productName);
    const rule = PRODUCT_RULES.find(candidate =>
      candidate.keywords.some(keyword => normalized.includes(normalizeName(keyword)))
    );
    if (rule) detectedKeys.add(rule.accountKey);
  }
  if (detectedKeys.size !== 1) {
    const detected = [...detectedKeys].join(', ') || '없음';
    throw new Error(
      `${profileAccount.label} 프로필에서 실제 Wing 계정을 판별하지 못했습니다. 감지 계정: ${detected}`,
    );
  }
  return ACCOUNTS.find(account => account.key === [...detectedKeys][0]);
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
  if (dates.length > 90) throw new Error('Wing 판매분석은 한 번에 최대 90일까지 수집합니다.');
  return dates;
}

function selectedAccounts() {
  const accountIndex = process.argv.indexOf('--account');
  const accountKey = accountIndex >= 0 ? process.argv[accountIndex + 1] : '';
  const accounts = accountKey ? ACCOUNTS.filter(account => account.key === accountKey) : ACCOUNTS;
  if (!accounts.length) throw new Error(`지원하지 않는 쿠팡 계정입니다: ${accountKey}`);
  return accounts;
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(LOCAL_DATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) throw new Error('Google Chrome 실행 파일을 찾지 못했습니다.');
  return path;
}

async function cdpJson(port, path = '/json') {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Chrome CDP 응답 오류: ${response.status}`);
  return response.json();
}

async function ensureChrome(account, initialUrl = WING_URL) {
  try {
    await cdpJson(account.port, '/json/version');
    return;
  } catch {
    const child = spawn(chromePath(), [
      `--remote-debugging-port=${account.port}`,
      `--user-data-dir=${account.profilePath}`,
      '--no-first-run',
      '--no-default-browser-check',
      initialUrl,
    ], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(500);
    try {
      await cdpJson(account.port, '/json/version');
      return;
    } catch {
      // Chrome가 디버깅 포트를 열 때까지 기다립니다.
    }
  }
  throw new Error(`${account.label} 전용 Chrome을 시작하지 못했습니다.`);
}

async function createTarget(account, url) {
  const response = await fetch(`http://127.0.0.1:${account.port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`${account.label} Wing 탭을 열지 못했습니다.`);
  return response.json();
}

async function closeTarget(account, targetId) {
  await fetch(`http://127.0.0.1:${account.port}/json/close/${targetId}`, {
    signal: AbortSignal.timeout(3_000),
  }).catch(() => {});
}

async function evaluate(target, expression, timeout = 30_000) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome 연결 시간 초과')), 5_000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => reject(new Error('Chrome 데이터 연결에 실패했습니다.')), { once: true });
  });
  const id = 1;
  socket.send(JSON.stringify({
    id,
    method: 'Runtime.evaluate',
    params: { expression, awaitPromise: true, returnByValue: true },
  }));
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Wing 화면 응답 시간 초과')), timeout);
      socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        if (message.id !== id) return;
        clearTimeout(timer);
        if (message.error || message.result?.exceptionDetails) {
          reject(new Error(message.result?.exceptionDetails?.exception?.description || message.error?.message));
          return;
        }
        resolve(message.result?.result?.value);
      });
    });
  } finally {
    socket.close();
  }
}

const PARSE_EXPRESSION = `
(() => {
  const number = value => Number(String(value || '').split('\\n')[0].replace(/,/g, '')) || 0;
  const rows = [];
  const products = [...document.querySelectorAll('div[class*="_product_"]')]
    .filter(element => element.innerText.includes('등록상품 ID:'));
  for (const product of products) {
    let element = product.nextElementSibling;
    const stats = {};
    while (element && !String(element.className).includes('_product_')) {
      const className = String(element.className);
      if (className.includes('_visitor_')) stats.visits = number(element.innerText);
      if (className.includes('_order_')) stats.orderCount = number(element.innerText);
      if (className.includes('_unit-sold_')) stats.orders = number(element.innerText);
      if (className.includes('_gmv_')) stats.revenue = number(element.innerText);
      element = element.nextElementSibling;
    }
    const text = product.innerText;
    rows.push({
      channel: text.includes('로켓그로스') ? 'growth' : 'wing',
      productName: text.split(/\\n+/)[1] || '',
      productId: (text.match(/등록상품 ID:\\s*(\\d+)/) || [])[1] || '',
      optionId: (text.match(/옵션 ID:\\s*(\\d+)/) || [])[1] || '',
      visits: stats.visits || 0,
      orders: stats.orders || 0,
      orderCount: stats.orderCount || 0,
      revenue: stats.revenue || 0,
    });
  }
  const cards = [...document.querySelectorAll('div[class*="_stat-item_"]')].map(element => element.innerText);
  const cardValue = label => {
    const text = cards.find(item => item.split(/\\n+/).some(line => line.trim() === label));
    return text ? number(text) : null;
  };
  const summary = {
    visits: cardValue('방문자'),
    orders: cardValue('판매량'),
    revenue: cardValue('매출 (원)'),
  };
  const rowVisits = rows.reduce((sum, row) => sum + row.visits, 0);
  const rowOrders = rows.reduce((sum, row) => sum + row.orders, 0);
  const rowRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  return {
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 2000),
    ready: document.body.innerText.includes('옵션목록') &&
      summary.visits !== null && summary.orders !== null && summary.revenue !== null &&
      rowVisits === summary.visits && rowOrders === summary.orders && rowRevenue === summary.revenue,
    rows,
    summary,
  };
})()
`;

async function readSalesPage(account, metricDate) {
  const url = `${WING_URL}?start_date=${metricDate}&end_date=${metricDate}`;
  const target = await createTarget(account, url);
  try {
    let page;
    for (let attempt = 0; attempt < 60; attempt++) {
      await sleep(500);
      try {
        page = await evaluate(target, PARSE_EXPRESSION);
      } catch (error) {
        if (attempt === 59) throw error;
        continue;
      }
      if (page?.ready) break;
      if (/login|로그인|signin/i.test(`${page?.url || ''}\n${page?.bodyText || ''}`)) {
        throw new Error(`${account.label} Wing 로그인이 만료되었습니다. 전용 Chrome에서 다시 로그인하세요.`);
      }
    }
    if (!page?.ready) {
      throw new Error(`${account.label} 판매분석 화면을 읽지 못했습니다. 로그인 상태와 Wing 화면을 확인하세요.`);
    }
    return page;
  } finally {
    if (!process.argv.includes('--keep-tab')) await closeTarget(account, target.id);
  }
}

function aggregate(account, page, metricDate) {
  const pageVisits = page.rows.reduce((sum, row) => sum + row.visits, 0);
  const pageOrders = page.rows.reduce((sum, row) => sum + row.orders, 0);
  const pageRevenue = page.rows.reduce((sum, row) => sum + row.revenue, 0);
  if (page.summary.visits === null || page.summary.orders === null || page.summary.revenue === null) {
    throw new Error(`${account.label} ${metricDate} 공식 합계 카드가 없습니다.`);
  }
  if (
    pageVisits !== page.summary.visits ||
    pageOrders !== page.summary.orders ||
    pageRevenue !== page.summary.revenue
  ) {
    throw new Error(
      `${account.label} ${metricDate} 합계 불일치: ` +
      `옵션 방문 ${pageVisits}명/판매 ${pageOrders}개/${pageRevenue}원, ` +
      `Wing 방문 ${page.summary.visits}명/판매 ${page.summary.orders}개/${page.summary.revenue}원`,
    );
  }

  const totals = new Map(account.products.map(rule => [
    rule.slug,
    {
      product_slug: rule.slug,
      wing: { visits: 0, orders: 0, revenue: 0 },
      growth: { visits: 0, orders: 0, revenue: 0 },
    },
  ]));
  const unknownSales = [];
  for (const row of page.rows) {
    const slug = productSlug(account, row.productName);
    if (!slug) {
      if (row.orders > 0 || row.revenue > 0) unknownSales.push(row);
      continue;
    }
    const channel = totals.get(slug)[row.channel];
    channel.visits += row.visits;
    channel.orders += row.orders;
    channel.revenue += row.revenue;
  }
  if (unknownSales.length) {
    throw new Error(
      `${account.label} ${metricDate} 미매핑 판매 상품: ` +
      unknownSales.map(row => `${row.productName} ${row.orders}개/${row.revenue}원`).join(', '),
    );
  }
  return [...totals.values()];
}

async function ingest(metricDate, account, metrics, config) {
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-coupang-wing-secret': decryptWindows(config.ingestSecret),
    },
    body: JSON.stringify({
      metric_date: metricDate,
      account: account.key,
      metrics,
      trigger: process.argv.includes('--from') ? 'local_backfill' : 'local_windows_scheduler',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(`Supabase 저장 실패 (${response.status}): ${payload.error || payload.errors?.join(', ') || '응답 오류'}`);
  }
}

async function reportFailure(metricDate, account, error, config) {
  await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-coupang-wing-secret': decryptWindows(config.ingestSecret),
    },
    body: JSON.stringify({
      metric_date: metricDate,
      account: account.key,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      trigger: process.argv.includes('--from') ? 'local_backfill' : 'local_windows_scheduler',
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {});
}

async function main() {
  const accounts = selectedAccounts();
  if (process.argv.includes('--setup')) {
    for (const account of accounts) {
      await ensureChrome(account, 'https://wing.coupang.com/');
      console.log(`${account.label} 전용 Chrome을 열었습니다. 이 창에서 해당 Wing 계정으로 로그인하세요.`);
    }
    return;
  }

  const config = JSON.parse((await readFile(CONFIG_PATH, 'utf8')).replace(/^\uFEFF/, ''));
  if (!config.ingestSecret) throw new Error('쿠팡 Wing 보안 설정이 없습니다.');

  const failures = [];
  const detectedAccountsByDate = new Map();
  for (const account of accounts) {
    let activeDate = requestedDates()[0];
    try {
      await ensureChrome(account);
      for (const metricDate of requestedDates()) {
        activeDate = metricDate;
        const page = await readSalesPage(account, metricDate);
        const detectedAccount = detectWingAccount(account, page);
        if (!detectedAccountsByDate.has(metricDate)) detectedAccountsByDate.set(metricDate, new Set());
        const detectedAccounts = detectedAccountsByDate.get(metricDate);
        if (detectedAccounts.has(detectedAccount.key)) {
          throw new Error(
            `${metricDate} ${detectedAccount.label} 계정이 두 Chrome 프로필에서 중복 감지되었습니다.`,
          );
        }
        detectedAccounts.add(detectedAccount.key);
        const metrics = aggregate(detectedAccount, page, metricDate);
        if (process.argv.includes('--inspect')) {
          console.log(JSON.stringify({
            metric_date: metricDate,
            profile: account.key,
            account: detectedAccount.key,
            summary: page.summary,
            rows: page.rows,
            metrics,
          }, null, 2));
        } else {
          await ingest(metricDate, detectedAccount, metrics, config);
          console.log(
            `${metricDate} ${account.label} 프로필 → ${detectedAccount.label} 계정 수집 완료: ` +
            metrics.map(metric =>
              `${metric.product_slug} ` +
              `판매자배송 ${metric.wing.orders}개/${metric.wing.revenue}원, ` +
              `로켓그로스 ${metric.growth.orders}개/${metric.growth.revenue}원`
            ).join(' | '),
          );
        }
      }
    } catch (error) {
      await reportFailure(activeDate, account, error, config);
      failures.push(`${account.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (accounts.length === ACCOUNTS.length) {
    for (const metricDate of requestedDates()) {
      const detectedAccounts = detectedAccountsByDate.get(metricDate) || new Set();
      const missingAccounts = ACCOUNTS.filter(account => !detectedAccounts.has(account.key));
      if (missingAccounts.length) {
        failures.push(
          `${metricDate} 미수집 Wing 계정: ${missingAccounts.map(account => account.label).join(', ')}`,
        );
      }
    }
  }
  if (failures.length) throw new Error(failures.join('\n'));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
