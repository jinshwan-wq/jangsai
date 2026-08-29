const NAVER_CAFE_HOSTS = new Set(['cafe.naver.com', 'm.cafe.naver.com']);
const NAVER_SHORT_HOSTS = new Set(['naver.me']);
const CAFE_ALIAS_PATTERN = /^[a-z0-9][a-z0-9_-]{1,49}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SAFE_VIEW_COUNT = 2_147_483_647;

function validPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateFromParts(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value.toISOString().slice(0, 10);
}

function fullyDecode(value) {
  let decoded = String(value || '');
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function cleanExtractedUrl(value) {
  return String(value || '')
    .trim()
    .replace(/&amp;/gi, '&')
    .replace(/[\s"'<>),;\]}]+$/g, '');
}

function canonicalArticleUrl(cafeAlias, cafeId, articleId) {
  if (cafeAlias) return `https://cafe.naver.com/${cafeAlias}/${articleId}`;
  return `https://cafe.naver.com/ArticleRead.nhn?articleid=${articleId}&clubid=${cafeId}`;
}

export function extractNaverCafeUrls(value) {
  const matches = String(value || '').match(
    /https?:\/\/(?:(?:m\.)?cafe\.naver\.com|naver\.me)\/[^\s"'<>]+/gi,
  ) || [];
  return matches.map(cleanExtractedUrl).filter(Boolean);
}

export function parseSheetDate(value, referenceDate) {
  if (!ISO_DATE_PATTERN.test(String(referenceDate || ''))) {
    throw new Error('기준 날짜 형식이 올바르지 않습니다.');
  }
  const reference = new Date(`${referenceDate}T00:00:00Z`);
  const text = String(value || '').trim();
  const patterns = [
    {
      regex: /(?<!\d)(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})(?!\d)/,
      parts: match => match.slice(1, 4).map(Number),
    },
    {
      regex: /(?<!\d)(\d{2})(\d{2})(\d{2})(?!\d)/,
      parts: match => [2000 + Number(match[1]), Number(match[2]), Number(match[3])],
    },
    {
      regex: /(?<!\d)(\d{1,2})[./-]\s*(\d{1,2})(?!\d)/,
      parts: match => {
        const month = Number(match[1]);
        const year = month > reference.getUTCMonth() + 2
          ? reference.getUTCFullYear() - 1
          : reference.getUTCFullYear();
        return [year, month, Number(match[2])];
      },
    },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    const parsed = dateFromParts(...pattern.parts(match));
    if (parsed) return parsed;
  }
  return null;
}

export function addDays(dateString, days) {
  if (!ISO_DATE_PATTERN.test(String(dateString || ''))) {
    throw new Error('날짜 형식이 올바르지 않습니다.');
  }
  const value = new Date(`${dateString}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + Number(days));
  return value.toISOString().slice(0, 10);
}

export function extractSheetSources(rows, options) {
  const {
    productSlug,
    workbookId,
    sheetId,
    sheetTitle,
    cutoffDate,
    maxDate,
  } = options;
  if (!Array.isArray(rows)) throw new Error('시트 행 데이터가 올바르지 않습니다.');
  if (!ISO_DATE_PATTERN.test(cutoffDate) || !ISO_DATE_PATTERN.test(maxDate)) {
    throw new Error('시트 수집 날짜 범위가 올바르지 않습니다.');
  }

  const sources = [];
  const errors = [];
  rows.forEach((rawRow, rowOffset) => {
    const row = Array.isArray(rawRow) ? rawRow.map(value => String(value ?? '')) : [];
    let urlEntry = null;
    for (let column = 0; column < row.length && !urlEntry; column++) {
      const urls = extractNaverCafeUrls(row[column]);
      if (urls.length) urlEntry = { column, url: urls[0] };
    }
    if (!urlEntry) return;

    const dateCandidates = row
      .slice(0, urlEntry.column)
      .map(value => parseSheetDate(value, maxDate))
      .filter(Boolean);
    const publishedDate = dateCandidates.at(-1) || null;
    if (!publishedDate) {
      errors.push({
        code: 'MISSING_PUBLISHED_DATE',
        sheet_id: sheetId,
        sheet_title: sheetTitle,
        row_number: rowOffset + 1,
        source_url: urlEntry.url,
      });
      return;
    }
    if (publishedDate < cutoffDate || publishedDate > maxDate) return;

    const title = row
      .slice(Math.max(0, urlEntry.column - 3), urlEntry.column)
      .reverse()
      .map(value => value.trim())
      .find(value =>
        value &&
        !/^(?:true|false|\d[\d,.]*)$/i.test(value) &&
        !parseSheetDate(value, maxDate)
      ) || `${sheetTitle} ${rowOffset + 1}행`;
    sources.push({
      product_slug: productSlug,
      source_url: urlEntry.url,
      published_date: publishedDate,
      title,
      source_details: {
        workbook_id: workbookId,
        sheet_id: sheetId,
        sheet_title: sheetTitle,
        row_number: rowOffset + 1,
      },
    });
  });
  return { sources, errors };
}

export function parseNaverCafeUrl(value) {
  const sourceUrl = cleanExtractedUrl(value);
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error('올바르지 않은 카페 URL입니다.');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('허용되지 않은 카페 URL 프로토콜입니다.');
  }
  if (NAVER_SHORT_HOSTS.has(host)) {
    return { kind: 'short', sourceUrl: `https://${host}${url.pathname}${url.search}` };
  }
  if (!NAVER_CAFE_HOSTS.has(host)) {
    throw new Error('허용되지 않은 네이버 카페 주소입니다.');
  }

  const decoded = fullyDecode(`${url.pathname}?${url.searchParams.toString()}`);
  const segments = url.pathname.split('/').filter(Boolean).map(fullyDecode);
  let cafeAlias = null;
  let cafeId = null;
  let articleId = null;

  if (
    segments.length >= 1 &&
    CAFE_ALIAS_PATTERN.test(segments[0]) &&
    !['ArticleRead.nhn', 'ca-fe', 'f-e'].includes(segments[0])
  ) {
    cafeAlias = segments[0].toLowerCase();
    if (segments.length >= 2) articleId = validPositiveInteger(segments[1]);
  }
  const modernPath = decoded.match(/\/cafes\/(\d+)\/articles\/(\d+)/i);
  if (modernPath) {
    cafeId = validPositiveInteger(modernPath[1]);
    articleId = validPositiveInteger(modernPath[2]);
  }
  const queryArticle = decoded.match(/\barticleid\s*=\s*(\d+)/i);
  const queryCafe = decoded.match(/\bclubid\s*=\s*(\d+)/i);
  if (queryArticle) articleId = validPositiveInteger(queryArticle[1]);
  if (queryCafe) cafeId = validPositiveInteger(queryCafe[1]);

  if (!articleId || (!cafeAlias && !cafeId)) {
    throw new Error('카페 글 번호 또는 카페 식별자를 찾지 못했습니다.');
  }
  return {
    kind: 'article',
    sourceUrl,
    cafeAlias,
    cafeId,
    articleId,
    canonicalUrl: canonicalArticleUrl(cafeAlias, cafeId, articleId),
  };
}

export function withResolvedCafe(article, cafeInfo) {
  if (article?.kind !== 'article') throw new Error('카페 글 정보가 올바르지 않습니다.');
  const cafeId = validPositiveInteger(cafeInfo?.cafeId || article.cafeId);
  const cafeAlias = String(cafeInfo?.cafeAlias || article.cafeAlias || '').toLowerCase();
  if (!cafeId || !CAFE_ALIAS_PATTERN.test(cafeAlias)) {
    throw new Error('카페 ID와 주소를 확정하지 못했습니다.');
  }
  return {
    ...article,
    cafeId,
    cafeAlias,
    canonicalUrl: canonicalArticleUrl(cafeAlias, cafeId, article.articleId),
  };
}

export function parseCafeGateInfo(payload) {
  const message = payload?.message;
  if (String(message?.status) !== '200') {
    throw new Error(message?.error?.msg || '카페 정보를 읽지 못했습니다.');
  }
  const info = message?.result?.cafeInfoView;
  const cafeId = validPositiveInteger(info?.cafeId);
  const cafeAlias = String(info?.cafeUrl || '').trim().toLowerCase();
  if (!cafeId || !CAFE_ALIAS_PATTERN.test(cafeAlias)) {
    throw new Error('카페 정보 응답에 ID 또는 주소가 없습니다.');
  }
  return { cafeId, cafeAlias, cafeName: String(info?.cafeName || '') };
}

export function parseCafeMenuIds(html) {
  const source = fullyDecode(String(html || '').replace(/&amp;/gi, '&'));
  const patterns = [
    /search\.menuid\s*=\s*(\d+)/gi,
    /["']menuId["']\s*:\s*(\d+)/g,
    /[?&]menuId\s*=\s*(\d+)/g,
  ];
  const ids = new Set();
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const menuId = validPositiveInteger(match[1]);
      if (menuId && menuId <= 1_000_000) ids.add(menuId);
    }
  }
  if (!ids.size) throw new Error('카페 홈에서 게시판 ID를 찾지 못했습니다.');
  return [...ids].sort((left, right) => left - right);
}

export function parseArticleListPayload(payload) {
  const message = payload?.message;
  if (String(message?.status) !== '200') {
    throw new Error(message?.error?.msg || '카페 게시판 목록을 읽지 못했습니다.');
  }
  const result = message?.result;
  const rawItems = Array.isArray(result?.articleList) ? result.articleList : [];
  const items = rawItems.flatMap(item => {
    const articleId = validPositiveInteger(item?.articleId);
    const menuId = validPositiveInteger(item?.menuId);
    const readCount = Number(item?.readCount);
    const writeDateTimestamp = Number(item?.writeDateTimestamp);
    if (
      !articleId ||
      !menuId ||
      !Number.isSafeInteger(readCount) ||
      readCount < 0 ||
      readCount > MAX_SAFE_VIEW_COUNT ||
      !Number.isFinite(writeDateTimestamp)
    ) {
      return [];
    }
    return [{
      articleId,
      menuId,
      readCount,
      writeDateTimestamp,
      title: String(item?.subject || ''),
    }];
  });
  return { items, hasNext: Boolean(result?.hasNext) };
}

export function extractCafeHistoryTotals(rows, options) {
  const {
    productSlug,
    workbookId,
    sheetId,
    sheetTitle,
    cutoffDate,
    maxDate,
  } = options;
  if (!Array.isArray(rows) || !ISO_DATE_PATTERN.test(cutoffDate) || !ISO_DATE_PATTERN.test(maxDate)) {
    throw new Error('카페 과거 조회수 범위가 올바르지 않습니다.');
  }
  const normalizedRows = rows.map(row =>
    Array.isArray(row) ? row.map(value => String(value ?? '')) : []
  );
  const headerIndex = normalizedRows
    .slice(0, 12)
    .findIndex(row => row.some(value => value.trim() === '날짜'));
  if (headerIndex < 0) throw new Error(`${sheetTitle} 날짜 머리글을 찾지 못했습니다.`);
  const header = normalizedRows[headerIndex];
  const labelColumn = header.findIndex(value => value.trim() === '날짜');
  const dateColumns = new Map();
  header.forEach((value, column) => {
    if (column <= labelColumn || /[~～]/.test(value)) return;
    const date = parseSheetDate(value, maxDate);
    if (date && date >= cutoffDate && date <= maxDate && !dateColumns.has(date)) {
      dateColumns.set(date, column);
    }
  });
  const orderedDates = [...dateColumns]
    .map(([date, column]) => ({ date, column }))
    .sort((left, right) => left.date.localeCompare(right.date));
  const sourceRows = normalizedRows.filter(row =>
    row.some(value => extractNaverCafeUrls(value).length > 0)
  );
  const parseView = value => {
    const text = String(value || '').trim().replaceAll(',', '');
    if (!/^\d+$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) && parsed <= MAX_SAFE_VIEW_COUNT ? parsed : null;
  };
  const totals = [];
  for (let index = 1; index < orderedDates.length; index++) {
    const previous = orderedDates[index - 1];
    const current = orderedDates[index];
    const elapsedDays = (
      new Date(`${current.date}T00:00:00Z`).getTime() -
      new Date(`${previous.date}T00:00:00Z`).getTime()
    ) / 86_400_000;
    if (elapsedDays !== 1) continue;
    let cafeViews = 0;
    let pairedRows = 0;
    let decreasedRows = 0;
    for (const row of sourceRows) {
      const previousViews = parseView(row[previous.column]);
      const currentViews = parseView(row[current.column]);
      if (previousViews === null || currentViews === null) continue;
      pairedRows++;
      if (currentViews < previousViews) {
        decreasedRows++;
        continue;
      }
      cafeViews += currentViews - previousViews;
    }
    if (!pairedRows || !Number.isSafeInteger(cafeViews) || cafeViews > MAX_SAFE_VIEW_COUNT) continue;
    totals.push({
      product_slug: productSlug,
      metric_date: current.date,
      cafe_views: cafeViews,
      previous_snapshot_date: previous.date,
      paired_rows: pairedRows,
      decreased_rows: decreasedRows,
      source_details: {
        workbook_id: workbookId,
        sheet_id: sheetId,
        sheet_title: sheetTitle,
        tracked_rows: sourceRows.length,
      },
    });
  }
  return totals;
}

export function classifyViewDelta(previous, current, previousObservedAt, observedAt, maxGapHours = 30) {
  if (!Number.isSafeInteger(current) || current < 0) {
    throw new Error('현재 누적 조회수가 올바르지 않습니다.');
  }
  if (previous === null || previous === undefined) {
    return { status: 'baseline', delta: 0 };
  }
  if (!Number.isSafeInteger(previous) || previous < 0) {
    throw new Error('이전 누적 조회수가 올바르지 않습니다.');
  }
  if (current < previous) return { status: 'decrease', delta: null };
  const elapsedHours = (
    new Date(observedAt).getTime() - new Date(previousObservedAt).getTime()
  ) / 3_600_000;
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0 || elapsedHours > maxGapHours) {
    return { status: 'gap', delta: null };
  }
  return { status: 'complete', delta: current - previous };
}
