import { createHash, createSign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  addDays,
  extractCafeHistoryTotals,
  extractSheetSources,
  parseArticleListPayload,
  parseCafeGateInfo,
  parseNaverCafeUrl,
  withResolvedCafe,
} from './lib/cafe-views-core.mjs';

const LOCAL_DATA = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
const CONFIG_PATH = join(LOCAL_DATA, 'JangsAI', 'cafe-views-config.json');
const CACHE_PATH = join(LOCAL_DATA, 'JangsAI', 'cafe-views-cache.json');
const INGEST_URL = 'https://pfmrqsfmkdnhzjimqocr.supabase.co/functions/v1/ingest-cafe-views';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const MAX_SOURCE_AGE_DAYS = 92;
const SOURCE_BATCH_SIZE = 400;
const OBSERVATION_BATCH_SIZE = 400;
const MAX_MENU_PAGES = 1_000;
const DELETED_RECHECK_DAYS = 7;
const UNAVAILABLE_CAFE_RECHECK_DAYS = 7;
const DEFAULT_REQUESTS_PER_SECOND = 2;
const DEFAULT_CONCURRENCY = 2;
const USER_AGENT = 'Mozilla/5.0 (compatible; JangsAICafeMetrics/1.0; +internal-read-only)';
const WORKBOOKS = [
  {
    productSlug: 'innerium-gala431',
    spreadsheetId: '12RMxYYMnm1t1HLPasoy9UyDI8OY7vaHy3fpKutLgk4o',
    mode: 'monthly_history',
    historySheetId: 1005257114,
  },
  {
    productSlug: 'innerium-minti431',
    spreadsheetId: '1BOCXvirBDvQtOEEEfaRHh3EAns7n-S_Gk3JzqpfgYLU',
    mode: 'monthly_history',
    historySheetId: 231800433,
  },
  {
    productSlug: 'yural-tonggam-cream',
    spreadsheetId: '1Ocq8uX_ZXMT_JJpqsyvMskUsXOfAGh1N5Rve6E7xbNU',
    mode: 'latest_integrated',
    primarySheetId: 1377570477,
  },
  {
    productSlug: 'yural-myeongga-bonhwan',
    spreadsheetId: '1DOKy77UfllGDzxxMeppgK2dHujJrULDjVVqZkHdWNWk',
    mode: 'latest_integrated',
    primarySheetId: 1191987228,
  },
];
const requestStats = new Map();

function installUtf8FileLogger() {
  const logPath = process.env.JANGSAI_CAFE_VIEWS_LOG_PATH;
  if (!logPath) return;

  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      const message = args.map(value => {
        if (typeof value === 'string') return value;
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      }).join(' ');
      try {
        appendFileSync(logPath, `${message}\r\n`, 'utf8');
      } catch {
        // 로그 파일 오류가 실제 수집을 중단시키지 않게 한다.
      }
    };
  }
}

installUtf8FileLogger();

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function positiveOption(name, fallback, maximum) {
  const raw = argumentValue(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} 값은 0보다 크고 ${maximum} 이하여야 합니다.`);
  }
  return value;
}

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function requestedMetricDate() {
  const value = argumentValue('--metric-date') || addDays(kstToday(), -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('날짜는 --metric-date YYYY-MM-DD 형식으로 입력하세요.');
  }
  return value;
}

function encryptWindows(value) {
  const script = [
    'Add-Type -AssemblyName System.Security;',
    '$bytes=[Text.Encoding]::UTF8.GetBytes($env:JANGS_PLAIN_SECRET);',
    '$encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);',
    '[Convert]::ToBase64String($encrypted)',
  ].join('');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, JANGS_PLAIN_SECRET: value },
  });
  if (result.status !== 0) throw new Error(`Windows 보안 저장 실패: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

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

async function setupConfig() {
  const serviceAccountPath = argumentValue('--service-account');
  const ingestSecret = process.env.JANGSAI_CAFE_INGEST_SECRET;
  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    throw new Error('--service-account 뒤에 Google 서비스 계정 JSON 경로를 입력하세요.');
  }
  if (!ingestSecret || ingestSecret.length < 32) {
    throw new Error('JANGSAI_CAFE_INGEST_SECRET 환경변수에 32자 이상의 수집 비밀값을 설정하세요.');
  }
  const rawServiceAccount = (await readFile(serviceAccountPath, 'utf8')).replace(/^\uFEFF/, '');
  const serviceAccount = JSON.parse(rawServiceAccount);
  if (
    serviceAccount.type !== 'service_account' ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key ||
    !serviceAccount.token_uri
  ) {
    throw new Error('Google 서비스 계정 JSON 형식이 올바르지 않습니다.');
  }
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify({
    version: 1,
    serviceAccount: encryptWindows(rawServiceAccount),
    ingestSecret: encryptWindows(ingestSecret),
    configuredAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  console.log(`카페 수집 보안 설정 완료: ${CONFIG_PATH}`);
}

async function loadConfig() {
  const config = JSON.parse((await readFile(CONFIG_PATH, 'utf8')).replace(/^\uFEFF/, ''));
  if (config.version !== 1 || !config.serviceAccount || !config.ingestSecret) {
    throw new Error('카페 수집 설정이 올바르지 않습니다. --setup을 다시 실행하세요.');
  }
  const serviceAccount = JSON.parse(decryptWindows(config.serviceAccount));
  return {
    serviceAccount,
    ingestSecret: decryptWindows(config.ingestSecret),
  };
}

async function loadCache() {
  try {
    const cache = JSON.parse((await readFile(CACHE_PATH, 'utf8')).replace(/^\uFEFF/, ''));
    if (cache.version === 1) {
      return {
        version: 1,
        redirects: cache.redirects || {},
        cafes: cache.cafes || {},
        articles: cache.articles || {},
      };
    }
  } catch {
    // 최초 실행 또는 손상된 캐시는 새로 만듭니다.
  }
  return { version: 1, redirects: {}, cafes: {}, articles: {} };
}

let cacheSaveQueue = Promise.resolve();

async function saveCache(cache) {
  const serialized = JSON.stringify(cache);
  const save = cacheSaveQueue.then(async () => {
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    const temporaryPath = `${CACHE_PATH}.tmp`;
    await writeFile(temporaryPath, serialized, 'utf8');
    await rename(temporaryPath, CACHE_PATH);
  });
  cacheSaveQueue = save.catch(() => {});
  await save;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

async function googleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3_600,
  }));
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Google Sheets 인증 실패 (${response.status}): ${payload.error_description || payload.error || '응답 오류'}`);
  }
  return payload.access_token;
}

async function googleJson(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Sheets 응답 오류 (${response.status}): ${payload?.error?.message || '응답 오류'}`);
  }
  return payload;
}

async function sheetMetadata(workbook, accessToken) {
  const fields = encodeURIComponent('sheets.properties(sheetId,title,index,gridProperties(rowCount,columnCount))');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${workbook.spreadsheetId}?fields=${fields}`;
  const payload = await googleJson(url, accessToken);
  return (payload.sheets || []).map(sheet => sheet.properties);
}

function selectedSheets(workbook, sheets, currentDate) {
  if (workbook.mode === 'monthly_history') {
    const currentMonth = Number(currentDate.slice(5, 7));
    const currentPrefix = `${currentMonth}월_`;
    const selected = sheets.filter(sheet =>
      sheet.sheetId === workbook.historySheetId ||
      String(sheet.title || '').startsWith(currentPrefix)
    );
    if (!selected.some(sheet => sheet.sheetId === workbook.historySheetId)) {
      throw new Error(`${workbook.productSlug} 이전 월 조회수 관리 시트를 찾지 못했습니다.`);
    }
    if (!selected.some(sheet => String(sheet.title || '').startsWith(currentPrefix))) {
      throw new Error(`${workbook.productSlug} ${currentPrefix} 시트를 찾지 못했습니다.`);
    }
    return selected.sort((left, right) => left.index - right.index);
  }
  if (workbook.mode === 'latest_integrated') {
    const latest = sheets.filter(sheet =>
      /카페스케줄.*통합시트.*최신/.test(String(sheet.title || ''))
    );
    if (latest.length) return latest.sort((left, right) => left.index - right.index);
    const fallback = sheets.find(sheet => sheet.sheetId === workbook.primarySheetId);
    if (!fallback) throw new Error(`${workbook.productSlug} 최신 통합시트를 찾지 못했습니다.`);
    return [fallback];
  }
  throw new Error(`지원하지 않는 시트 선택 방식입니다: ${workbook.mode}`);
}

async function sheetValueRanges(workbook, sheets, accessToken) {
  const ranges = sheets.map(sheet => `'${String(sheet.title).replaceAll("'", "''")}'`);
  const valueRanges = [];
  for (let offset = 0; offset < ranges.length; offset += 10) {
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${workbook.spreadsheetId}/values:batchGet`,
    );
    url.searchParams.set('majorDimension', 'ROWS');
    ranges.slice(offset, offset + 10).forEach(range => url.searchParams.append('ranges', range));
    const payload = await googleJson(url, accessToken);
    valueRanges.push(...(payload.valueRanges || []));
  }
  if (valueRanges.length !== sheets.length) {
    throw new Error(`${workbook.productSlug} 시트 값을 모두 읽지 못했습니다.`);
  }
  return valueRanges;
}

async function collectSheetSources(serviceAccount, selectedProducts) {
  const accessToken = await googleAccessToken(serviceAccount);
  const currentDate = kstToday();
  const cutoffDate = addDays(currentDate, -MAX_SOURCE_AGE_DAYS);
  const sources = [];
  const errors = [];
  for (const workbook of WORKBOOKS.filter(item =>
    !selectedProducts.size || selectedProducts.has(item.productSlug)
  )) {
    const metadata = await sheetMetadata(workbook, accessToken);
    const sheets = selectedSheets(workbook, metadata, currentDate);
    const valueRanges = await sheetValueRanges(workbook, sheets, accessToken);
    let productCount = 0;
    sheets.forEach((sheet, index) => {
      const extracted = extractSheetSources(valueRanges[index]?.values || [], {
        productSlug: workbook.productSlug,
        workbookId: workbook.spreadsheetId,
        sheetId: sheet.sheetId,
        sheetTitle: sheet.title,
        cutoffDate,
        maxDate: currentDate,
      });
      sources.push(...extracted.sources);
      errors.push(...extracted.errors);
      productCount += extracted.sources.length;
    });
    console.log(
      `${workbook.productSlug} Google Sheets 동기화: ${sheets.length}개 시트, ${productCount.toLocaleString()}개 URL 행`,
    );
  }
  return { sources, errors, currentDate, cutoffDate };
}

async function collectHistoricalTotals(serviceAccount, selectedProducts) {
  const accessToken = await googleAccessToken(serviceAccount);
  const currentDate = kstToday();
  const maxDate = addDays(currentDate, -1);
  const cutoffDate = addDays(currentDate, -MAX_SOURCE_AGE_DAYS);
  const totals = [];
  for (const workbook of WORKBOOKS.filter(item =>
    !selectedProducts.size || selectedProducts.has(item.productSlug)
  )) {
    const metadata = await sheetMetadata(workbook, accessToken);
    let sheets;
    if (workbook.mode === 'monthly_history') {
      const history = metadata.find(sheet => sheet.sheetId === workbook.historySheetId);
      if (!history) throw new Error(`${workbook.productSlug} 과거 조회수 시트를 찾지 못했습니다.`);
      sheets = [history];
    } else {
      sheets = selectedSheets(workbook, metadata, currentDate);
    }
    const valueRanges = await sheetValueRanges(workbook, sheets, accessToken);
    const productTotals = sheets.flatMap((sheet, index) =>
      extractCafeHistoryTotals(valueRanges[index]?.values || [], {
        productSlug: workbook.productSlug,
        workbookId: workbook.spreadsheetId,
        sheetId: sheet.sheetId,
        sheetTitle: sheet.title,
        cutoffDate,
        maxDate,
      })
    );
    totals.push(...productTotals);
    console.log(
      `${workbook.productSlug} 과거 카페 조회수: 연속 일자 ${productTotals.length.toLocaleString()}개`,
    );
  }
  return totals;
}

class RequestRateLimiter {
  constructor(requestsPerSecond) {
    this.interval = 1_000 / requestsPerSecond;
    this.nextStart = 0;
    this.queue = Promise.resolve();
  }

  async take() {
    const scheduled = this.queue.then(async () => {
      const delay = Math.max(0, this.nextStart - Date.now());
      if (delay) await sleep(delay);
      this.nextStart = Date.now() + this.interval;
    });
    this.queue = scheduled.catch(() => {});
    await scheduled;
  }
}

async function fetchWithRetry(url, options, limiter, label) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await limiter.take();
      requestStats.set(label, (requestStats.get(label) || 0) + 1);
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
          'User-Agent': USER_AGENT,
          ...(options?.headers || {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`${label} HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : attempt * 1_500));
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(attempt * 1_000);
    }
  }
  throw lastError || new Error(`${label} 요청에 실패했습니다.`);
}

async function fetchJson(url, limiter, label) {
  const response = await fetchWithRetry(url, {}, limiter, label);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  return payload;
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function resolveShortUrl(sourceUrl, cache, limiter) {
  const cached = cache.redirects[sourceUrl];
  if (cached?.url) return cached.url;
  let current = sourceUrl;
  for (let redirect = 0; redirect < 5; redirect++) {
    const response = await fetchWithRetry(
      current,
      { redirect: 'manual' },
      limiter,
      '네이버 단축 URL',
    );
    const location = response.headers.get('location');
    if (!location || response.status < 300 || response.status >= 400) {
      throw new Error(`단축 URL 목적지를 확인하지 못했습니다 (${response.status}).`);
    }
    current = new URL(location, current).href;
    const parsed = parseNaverCafeUrl(current);
    if (parsed.kind === 'article') {
      cache.redirects[sourceUrl] = { url: current, resolvedAt: new Date().toISOString() };
      return current;
    }
  }
  throw new Error('단축 URL 리다이렉트가 너무 많습니다.');
}

async function cafeInfo(identifier, cache, limiter) {
  const key = identifier.cafeAlias
    ? `alias:${identifier.cafeAlias.toLowerCase()}`
    : `id:${identifier.cafeId}`;
  const cached = cache.cafes[key];
  if (cached?.cafeId && cached?.cafeAlias) return cached;
  const unavailableAt = Date.parse(cached?.unavailableAt || '');
  const unavailableCutoff = Date.now() - UNAVAILABLE_CAFE_RECHECK_DAYS * 24 * 60 * 60 * 1_000;
  if (Number.isFinite(unavailableAt) && unavailableAt >= unavailableCutoff) {
    const error = new Error(cached.errorMessage || '접근이 제한된 카페입니다.');
    error.code = 'CONFIRMED_CAFE_UNAVAILABLE';
    throw error;
  }
  const url = new URL('https://apis.naver.com/cafe-web/cafe2/CafeGateInfo.json');
  if (identifier.cafeAlias) url.searchParams.set('cluburl', identifier.cafeAlias);
  else url.searchParams.set('cafeId', String(identifier.cafeId));
  const payload = await fetchJson(url, limiter, '카페 정보');
  if (
    String(payload?.message?.status) !== '200' &&
    String(payload?.message?.error?.code) === '0003'
  ) {
    const message = String(payload?.message?.error?.msg || '접근이 제한된 카페입니다.');
    cache.cafes[key] = {
      unavailableAt: new Date().toISOString(),
      errorCode: '0003',
      errorMessage: message,
    };
    const error = new Error(message);
    error.code = 'CONFIRMED_CAFE_UNAVAILABLE';
    throw error;
  }
  const info = parseCafeGateInfo(payload);
  const saved = {
    ...info,
    menuIds: cached?.menuIds || [],
    fetchedAt: new Date().toISOString(),
  };
  cache.cafes[`alias:${info.cafeAlias}`] = saved;
  cache.cafes[`id:${info.cafeId}`] = saved;
  return saved;
}

async function resolveSources(rawSources, cache, limiter, concurrency) {
  const uniqueByProductAndUrl = new Map();
  for (const source of rawSources) {
    uniqueByProductAndUrl.set(`${source.product_slug}:${source.source_url}`, source);
  }
  const entries = [...uniqueByProductAndUrl.values()];
  let resolvedCount = 0;
  let lastSavedRequestCount =
    (requestStats.get('네이버 단축 URL') || 0) + (requestStats.get('카페 정보') || 0);
  const parseResults = await mapLimit(entries, concurrency, async source => {
    let parsed = parseNaverCafeUrl(source.source_url);
    if (parsed.kind === 'short') {
      const target = await resolveShortUrl(parsed.sourceUrl, cache, limiter);
      parsed = parseNaverCafeUrl(target);
    }
    const info = await cafeInfo(parsed, cache, limiter);
    const article = withResolvedCafe(parsed, info);
    resolvedCount++;
    if (resolvedCount % 250 === 0) {
      const shortRequests = requestStats.get('네이버 단축 URL') || 0;
      const cafeRequests = requestStats.get('카페 정보') || 0;
      console.log(
        `카페 URL 정규화: ${resolvedCount.toLocaleString()}/${entries.length.toLocaleString()} ` +
        `(단축 URL ${shortRequests.toLocaleString()}회, 카페 정보 ${cafeRequests.toLocaleString()}회)`,
      );
      const requestCount = shortRequests + cafeRequests;
      if (requestCount > lastSavedRequestCount) {
        await saveCache(cache);
        lastSavedRequestCount = requestCount;
      }
    }
    return {
      ...source,
      ...article,
      cafeInfo: info,
    };
  });

  const errors = [];
  const unavailable = [];
  const invalid = [];
  const byArticle = new Map();
  parseResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      const failure = {
        source: entries[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
      if (result.reason?.code === 'CONFIRMED_CAFE_UNAVAILABLE') unavailable.push(failure);
      else if (failure.error === '카페 글 번호 또는 카페 식별자를 찾지 못했습니다.') invalid.push(failure);
      else errors.push(failure);
      return;
    }
    const source = result.value;
    const key = `${source.cafeId}:${source.articleId}`;
    const existing = byArticle.get(key);
    if (existing && existing.product_slug !== source.product_slug) {
      throw new Error(
        `같은 카페 글이 서로 다른 제품에 배정되었습니다: ${existing.product_slug}, ${source.product_slug}, ${source.canonicalUrl}`,
      );
    }
    if (existing) {
      existing.source_locations.push(source.source_details);
      if (source.published_date < existing.published_date) existing.published_date = source.published_date;
      return;
    }
    const cachedArticle = cache.articles[key] || {};
    byArticle.set(key, {
      product_slug: source.product_slug,
      source_url: source.source_url,
      canonical_url: source.canonicalUrl,
      cafe_alias: source.cafeAlias,
      cafe_id: source.cafeId,
      article_id: source.articleId,
      menu_id: cachedArticle.menuId || null,
      published_date: source.published_date,
      title: cachedArticle.title || source.title,
      source_locations: [source.source_details],
    });
  });
  await saveCache(cache);
  return { targets: [...byArticle.values()], errors, unavailable, invalid };
}

async function scanMenu(task, limiter) {
  const found = [];
  let remaining = [...task.articleIds].sort((left, right) => right - left);
  let pages = 0;
  while (remaining.length && pages < MAX_MENU_PAGES) {
    const cursorArticleId = remaining[0] + 1;
    const url = new URL('https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json');
    url.searchParams.set('search.clubid', String(task.cafeId));
    if (task.menuId) url.searchParams.set('search.menuid', String(task.menuId));
    url.searchParams.set('search.queryType', 'lastArticle');
    url.searchParams.set('search.page', '2');
    url.searchParams.set('search.perPage', '50');
    url.searchParams.set('search.pageLastArticleId', String(cursorArticleId));
    url.searchParams.set('search.replylistorder', '');
    url.searchParams.set('search.firstArticleInReply', 'false');
    url.searchParams.set('lastItemIndex', '50');
    url.searchParams.set('lastAdIndex', '0');
    const listLabel = task.menuId
      ? `${task.cafeAlias} 게시판 ${task.menuId}`
      : `${task.cafeAlias} 전체글`;
    const payload = await fetchJson(url, limiter, listLabel);
    let parsed;
    try {
      parsed = parseArticleListPayload(payload);
    } catch (error) {
      throw error;
    }
    pages++;
    for (const item of parsed.items) {
      if (task.articleIds.has(item.articleId)) found.push(item);
    }
    if (!parsed.items.length) break;
    const oldestArticleId = Math.min(...parsed.items.map(item => item.articleId));
    const next = remaining.filter(articleId => articleId < oldestArticleId);
    if (next.length === remaining.length) break;
    remaining = next;
  }
  return { found, pages };
}

async function menuIdFromSiblings(target, limiter) {
  const url = new URL(
    `https://article.cafe.naver.com/gw/v2.1/cafes/${target.cafe_id}/articles/${target.article_id}/siblings`,
  );
  url.searchParams.set('limit', '5');
  url.searchParams.set('fromAllArticleList', 'false');
  url.searchParams.set('filterByHeadId', 'true');
  url.searchParams.set('page', '1');
  url.searchParams.set('requestFrom', 'A');
  const response = await fetchWithRetry(url, {}, limiter, '카페 게시판 확인');
  const payload = await response.json().catch(() => ({}));
  const menuId = Number(payload?.result?.menu?.id);
  const errorCode = String(payload?.result?.errorCode || '');
  if (response.status === 404 && errorCode === '4003') {
    const error = new Error(payload?.result?.reason || '삭제되었거나 존재하지 않는 게시글입니다.');
    error.code = 'CONFIRMED_DELETED';
    throw error;
  }
  if (!response.ok || !Number.isSafeInteger(menuId) || menuId <= 0) {
    throw new Error(`게시판 ID를 확인하지 못했습니다 (${response.status}).`);
  }
  return menuId;
}

function buildMenuTasks(targets, cafeMenus) {
  const tasks = new Map();
  const targetsByCafe = new Map();
  for (const target of targets) {
    if (!targetsByCafe.has(target.cafe_id)) targetsByCafe.set(target.cafe_id, []);
    targetsByCafe.get(target.cafe_id).push(target);
  }
  for (const [cafeId, cafeTargets] of targetsByCafe) {
    const unknown = cafeTargets.filter(target => !target.menu_id);
    const menuIds = unknown.length
      ? cafeMenus.get(cafeId)
      : [...new Set(cafeTargets.map(target => target.menu_id))];
    for (const menuId of menuIds || []) {
      const relevant = unknown.length
        ? cafeTargets
        : cafeTargets.filter(target => target.menu_id === menuId);
      const key = `${cafeId}:${menuId}`;
      tasks.set(key, {
        cafeId,
        cafeAlias: cafeTargets[0].cafe_alias,
        menuId,
        articleIds: new Set(relevant.map(target => target.article_id)),
      });
    }
  }
  return [...tasks.values()];
}

function buildCafeTasks(targets) {
  const tasks = new Map();
  for (const target of targets) {
    if (!tasks.has(target.cafe_id)) {
      tasks.set(target.cafe_id, {
        cafeId: target.cafe_id,
        cafeAlias: target.cafe_alias,
        menuId: null,
        articleIds: new Set(),
      });
    }
    tasks.get(target.cafe_id).articleIds.add(target.article_id);
  }
  return [...tasks.values()];
}

async function collectViews(targets, cache, limiter, concurrency) {
  const deletedRecheckCutoff = Date.now() - DELETED_RECHECK_DAYS * 24 * 60 * 60 * 1_000;
  const knownDeleted = targets.filter(target => {
    const deletedAt = Date.parse(cache.articles[`${target.cafe_id}:${target.article_id}`]?.deletedAt || '');
    return Number.isFinite(deletedAt) && deletedAt >= deletedRecheckCutoff;
  });
  const confirmedDeletedKeys = new Set(
    knownDeleted.map(target => `${target.cafe_id}:${target.article_id}`),
  );
  const candidateTargets = targets.filter(
    target => !confirmedDeletedKeys.has(`${target.cafe_id}:${target.article_id}`),
  );

  const foundByKey = new Map();
  let scannedPages = 0;
  const rememberFound = (task, result) => {
    scannedPages += result.pages;
    result.found.forEach(item => {
      const key = `${task.cafeId}:${item.articleId}`;
      foundByKey.set(key, item);
      cache.articles[key] = {
        menuId: item.menuId,
        title: item.title,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const cafeTasks = buildCafeTasks(candidateTargets);
  const cafeResults = await mapLimit(cafeTasks, concurrency, task => scanMenu(task, limiter));
  const scanErrors = [];
  const failedCafeIds = new Set();
  cafeResults.forEach((result, index) => {
    const task = cafeTasks[index];
    if (result.status === 'fulfilled') {
      rememberFound(task, result.value);
      return;
    }
    failedCafeIds.add(task.cafeId);
    scanErrors.push({
      task,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });
  if (cafeTasks.length) {
    console.log(
      `카페 전체글 커서 수집: ${cafeTasks.length.toLocaleString()}개 카페, ` +
      `${scannedPages.toLocaleString()}페이지`,
    );
  }

  const unresolvedMenus = candidateTargets.filter(target =>
    !foundByKey.has(`${target.cafe_id}:${target.article_id}`) &&
    !failedCafeIds.has(target.cafe_id)
  );
  let siblingCompleted = 0;
  const siblingResults = await mapLimit(unresolvedMenus, concurrency, async target => {
    try {
      const menuId = await menuIdFromSiblings(target, limiter);
      const key = `${target.cafe_id}:${target.article_id}`;
      target.menu_id = menuId;
      const cached = {
        ...(cache.articles[key] || {}),
        menuId,
        updatedAt: new Date().toISOString(),
      };
      delete cached.deletedAt;
      cache.articles[key] = cached;
      return menuId;
    } finally {
      siblingCompleted++;
      if (siblingCompleted % 250 === 0) {
        console.log(
          `카페 게시판 ID 확인: ${siblingCompleted.toLocaleString()}/${unresolvedMenus.length.toLocaleString()}`,
        );
        await saveCache(cache);
      }
    }
  });
  const siblingErrors = siblingResults.flatMap((result, index) => {
    if (result.status !== 'rejected') return [];
    const target = unresolvedMenus[index];
    if (result.reason?.code === 'CONFIRMED_DELETED') {
      const key = `${target.cafe_id}:${target.article_id}`;
      confirmedDeletedKeys.add(key);
      cache.articles[key] = {
        ...(cache.articles[key] || {}),
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return [];
    }
    return [{
      target,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }];
  });

  const fallbackTargets = unresolvedMenus.filter(target =>
    target.menu_id &&
    !confirmedDeletedKeys.has(`${target.cafe_id}:${target.article_id}`)
  );
  const fallbackTasks = buildMenuTasks(fallbackTargets, new Map());
  const fallbackResults = await mapLimit(fallbackTasks, concurrency, task => scanMenu(task, limiter));
  fallbackResults.forEach((result, index) => {
    const task = fallbackTasks[index];
    if (result.status === 'fulfilled') {
      rememberFound(task, result.value);
      return;
    }
    scanErrors.push({
      task,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  const activeTargets = candidateTargets.filter(
    target => !confirmedDeletedKeys.has(`${target.cafe_id}:${target.article_id}`),
  );
  const missing = activeTargets.filter(
    target => !foundByKey.has(`${target.cafe_id}:${target.article_id}`),
  );
  const observedAt = new Date().toISOString();
  const observations = activeTargets.map(target => {
    const key = `${target.cafe_id}:${target.article_id}`;
    const item = foundByKey.get(key);
    if (!item) {
      return {
        product_slug: target.product_slug,
        cafe_id: target.cafe_id,
        article_id: target.article_id,
        menu_id: target.menu_id || cache.articles[key]?.menuId || null,
        cumulative_views: null,
        observed_at: observedAt,
        error_code: 'ARTICLE_NOT_FOUND_IN_LIST',
        error_message: '게시판 목록에서 글을 찾지 못했습니다.',
      };
    }
    target.menu_id = item.menuId;
    target.title = item.title || target.title;
    return {
      product_slug: target.product_slug,
      cafe_id: target.cafe_id,
      article_id: target.article_id,
      menu_id: item.menuId,
      cumulative_views: item.readCount,
      observed_at: observedAt,
      source_details: { collector: 'naver_cafe_public_article_list_cursor' },
    };
  });
  await saveCache(cache);
  return {
    activeTargets,
    deleted: targets.filter(
      target => confirmedDeletedKeys.has(`${target.cafe_id}:${target.article_id}`),
    ),
    observations,
    missing,
    scannedPages,
    menuErrors: [],
    scanErrors,
    siblingErrors,
  };
}

async function ingestRequest(action, payload, ingestSecret) {
  const timeout = action === 'finalize' || action === 'retry_latest_failed'
    ? 150_000
    : 45_000;
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cafe-views-secret': ingestSecret,
    },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    throw new Error(`카페 수집 저장 실패 (${action}, ${response.status}): ${result.error || '응답 오류'}`);
  }
  return result;
}

function sourceFingerprint(targets, resolutionErrors) {
  const identities = [
    ...targets.map(target =>
      `${target.product_slug}|article|${target.cafe_id}|${target.article_id}`
    ),
    ...resolutionErrors.map(failure =>
      `${failure.source.product_slug}|unresolved|${String(failure.source.source_url || '').trim()}`
    ),
  ].sort();
  return createHash('sha256').update(identities.join('\n'), 'utf8').digest('hex');
}

async function uploadCollection(metricDate, targets, resolutionErrors, collection, config) {
  const expectedByProduct = {};
  for (const target of targets) {
    expectedByProduct[target.product_slug] = (expectedByProduct[target.product_slug] || 0) + 1;
  }
  for (const failure of resolutionErrors) {
    const slug = failure.source.product_slug;
    expectedByProduct[slug] = (expectedByProduct[slug] || 0) + 1;
  }
  const start = await ingestRequest('start', {
    metric_date: metricDate,
    expected_by_product: expectedByProduct,
    source_fingerprint: sourceFingerprint(targets, resolutionErrors),
    trigger: process.argv.includes('--manual') ? 'local_manual' : 'local_windows_scheduler',
    allow_source_drop: process.argv.includes('--allow-source-drop'),
    force_rerun: process.argv.includes('--force-rerun'),
  }, config.ingestSecret);
  if (start.already_complete) {
    return {
      status: 'success',
      skipped: true,
      reason: 'already_complete',
      run_id: start.run_id,
      finalize_result: start.finalize_result,
    };
  }
  try {
    for (let offset = 0; offset < targets.length; offset += SOURCE_BATCH_SIZE) {
      const sources = targets.slice(offset, offset + SOURCE_BATCH_SIZE).map(target => ({
        product_slug: target.product_slug,
        source_url: target.source_url,
        canonical_url: target.canonical_url,
        cafe_alias: target.cafe_alias,
        cafe_id: target.cafe_id,
        article_id: target.article_id,
        menu_id: target.menu_id,
        published_date: target.published_date,
        title: target.title,
        source_details: { locations: target.source_locations.slice(0, 20) },
      }));
      await ingestRequest('sync_sources', { run_id: start.run_id, sources }, config.ingestSecret);
      console.log(`Supabase URL 동기화: ${Math.min(offset + SOURCE_BATCH_SIZE, targets.length)}/${targets.length}`);
    }
    for (let offset = 0; offset < collection.observations.length; offset += OBSERVATION_BATCH_SIZE) {
      const observations = collection.observations.slice(offset, offset + OBSERVATION_BATCH_SIZE);
      await ingestRequest('observations', { run_id: start.run_id, observations }, config.ingestSecret);
      console.log(
        `Supabase 조회수 저장: ${Math.min(offset + OBSERVATION_BATCH_SIZE, collection.observations.length)}/${collection.observations.length}`,
      );
    }
    return await ingestRequest('finalize', { run_id: start.run_id }, config.ingestSecret);
  } catch (error) {
    await ingestRequest('fail', {
      run_id: start.run_id,
      error: error instanceof Error ? error.message : String(error),
    }, config.ingestSecret).catch(() => {});
    throw error;
  }
}

function selectedProducts() {
  const values = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] === '--product' && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  const allowed = new Set(WORKBOOKS.map(workbook => workbook.productSlug));
  const invalid = values.filter(value => !allowed.has(value));
  if (invalid.length) throw new Error(`지원하지 않는 제품입니다: ${invalid.join(', ')}`);
  return new Set(values);
}

function applyLimit(sources) {
  const limit = argumentValue('--limit');
  if (limit === null) return sources;
  const parsed = Number(limit);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100_000) {
    throw new Error('--limit 값이 올바르지 않습니다.');
  }
  return sources.slice(0, parsed);
}

async function main() {
  if (process.argv.includes('--setup')) {
    await setupConfig();
    return;
  }
  if (process.argv.includes('--retry-latest')) {
    const config = await loadConfig();
    console.log(JSON.stringify(
      await ingestRequest('retry_latest_failed', {}, config.ingestSecret),
      null,
      2,
    ));
    return;
  }
  const metricDate = requestedMetricDate();
  const requestsPerSecond = positiveOption('--requests-per-second', DEFAULT_REQUESTS_PER_SECOND, 4);
  const concurrency = Math.floor(positiveOption('--concurrency', DEFAULT_CONCURRENCY, 4));
  const products = selectedProducts();
  const dryRun = process.argv.includes('--dry-run');
  const config = await loadConfig();
  if (process.argv.includes('--backfill-history')) {
    const totals = await collectHistoricalTotals(config.serviceAccount, products);
    if (dryRun) {
      console.log(JSON.stringify({ dry_run: true, rows: totals }, null, 2));
      return;
    }
    console.log(JSON.stringify(
      await ingestRequest('backfill_daily_totals', {
        rows: totals,
        overwrite: process.argv.includes('--force'),
      }, config.ingestSecret),
      null,
      2,
    ));
    return;
  }
  const cache = await loadCache();
  const limiter = new RequestRateLimiter(requestsPerSecond);

  const sheetCollection = await collectSheetSources(config.serviceAccount, products);
  if (sheetCollection.errors.length) {
    const samples = sheetCollection.errors.slice(0, 5).map(error =>
      `${error.sheet_title} ${error.row_number}행`
    );
    throw new Error(`발행일을 읽지 못한 카페 URL이 ${sheetCollection.errors.length}개입니다: ${samples.join(', ')}`);
  }
  const rawSources = applyLimit(sheetCollection.sources);
  console.log(`최근 ${MAX_SOURCE_AGE_DAYS}일 URL 정규화 시작: ${rawSources.length.toLocaleString()}개 행`);
  const resolved = await resolveSources(rawSources, cache, limiter, concurrency);
  console.log(
    `URL 정규화 완료: 게시글 ${resolved.targets.length.toLocaleString()}개, ` +
    `접근 제한 제외 ${resolved.unavailable.length.toLocaleString()}개, ` +
    `글 주소 아님 ${resolved.invalid.length.toLocaleString()}개, 실패 ${resolved.errors.length.toLocaleString()}개`,
  );

  const collection = await collectViews(
    resolved.targets,
    cache,
    limiter,
    concurrency,
  );
  const successCount = collection.observations.filter(item => item.cumulative_views !== null).length;
  console.log(
    `목록 조회 완료: 성공 ${successCount.toLocaleString()}/${collection.activeTargets.length.toLocaleString()}, ` +
    `게시판 ${collection.scannedPages.toLocaleString()}페이지, 삭제 제외 ${collection.deleted.length.toLocaleString()}, ` +
    `누락 ${collection.missing.length.toLocaleString()}`,
  );
  if (collection.menuErrors.length || collection.scanErrors.length || collection.siblingErrors.length) {
    console.warn(
      `경고: 카페 홈 ${collection.menuErrors.length}, 게시판 ${collection.scanErrors.length}, ` +
      `보조 확인 ${collection.siblingErrors.length}건 오류`,
    );
  }

  if (dryRun) {
    console.log(JSON.stringify({
      dry_run: true,
      metric_date: metricDate,
      source_rows: rawSources.length,
      canonical_articles: resolved.targets.length,
      active_articles: collection.activeTargets.length,
      excluded_deleted: collection.deleted.length,
      excluded_unavailable: resolved.unavailable.length,
      excluded_invalid: resolved.invalid.length,
      invalid_source_samples: resolved.invalid.slice(0, 20).map(item => item.source.source_url),
      resolution_errors: resolved.errors.length,
      resolution_error_samples: resolved.errors.slice(0, 20).map(item => ({
        source_url: item.source.source_url,
        error: item.error,
      })),
      observed: successCount,
      missing: collection.missing.length,
      scanned_pages: collection.scannedPages,
      request_stats: Object.fromEntries(requestStats),
      missing_samples: collection.missing.slice(0, 20).map(target => ({
        canonical_url: target.canonical_url,
        published_date: target.published_date,
        title: target.title,
      })),
      sibling_error_samples: collection.siblingErrors.slice(0, 10).map(item => ({
        canonical_url: item.target.canonical_url,
        error: item.error,
      })),
    }, null, 2));
    if (resolved.errors.length || collection.missing.length) process.exitCode = 2;
    return;
  }

  const result = await uploadCollection(
    metricDate,
    collection.activeTargets,
    resolved.errors,
    collection,
    config,
  );
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'success') process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
