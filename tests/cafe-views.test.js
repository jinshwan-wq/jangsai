const assert = require('node:assert/strict');
const test = require('node:test');

const modulePromise = import('../tools/lib/cafe-views-core.mjs');

test('시트 날짜 형식을 정규화한다', async () => {
  const { parseSheetDate } = await modulePromise;
  assert.equal(parseSheetDate('2026.06.12_채희', '2026-08-28'), '2026-06-12');
  assert.equal(parseSheetDate('260703_수지', '2026-08-28'), '2026-07-03');
  assert.equal(parseSheetDate('8/18', '2026-08-28'), '2026-08-18');
  assert.equal(parseSheetDate('12/31', '2026-01-03'), '2025-12-31');
  assert.equal(parseSheetDate('날짜 없음', '2026-08-28'), null);
});

test('최근 발행된 행의 첫 카페 URL만 추출한다', async () => {
  const { extractSheetSources } = await modulePromise;
  const result = extractSheetSources([
    ['발행', '발행일', '제목', '링크', '과거 링크'],
    ['TRUE', '2026.08.04', '테스트 글', 'https://cafe.naver.com/examplecafe/123', 'https://cafe.naver.com/examplecafe/100'],
    ['TRUE', '2026.04.01', '과거 글', 'https://cafe.naver.com/examplecafe/99'],
    ['TRUE', '', '날짜 누락', 'https://cafe.naver.com/examplecafe/124'],
  ], {
    productSlug: 'innerium-gala431',
    workbookId: 'workbook',
    sheetId: 1,
    sheetTitle: '8월_테스트',
    cutoffDate: '2026-05-28',
    maxDate: '2026-08-28',
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].source_url, 'https://cafe.naver.com/examplecafe/123');
  assert.equal(result.sources[0].published_date, '2026-08-04');
  assert.equal(result.sources[0].title, '테스트 글');
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'MISSING_PUBLISHED_DATE');
});

test('과거 누적 조회수에서 연속 날짜의 증가분만 집계한다', async () => {
  const { extractCafeHistoryTotals } = await modulePromise;
  const totals = extractCafeHistoryTotals([
    ['', '', '날짜', '8/27', '8/26', '2026.8.25', '2026. 8. 20 ~ 24'],
    ['', 'https://cafe.naver.com/examplecafe/101', '', '15', '13', '10', '8'],
    ['', 'https://cafe.naver.com/examplecafe/102', '', '5', '7', '4', '3'],
  ], {
    productSlug: 'innerium-gala431',
    workbookId: 'workbook',
    sheetId: 1,
    sheetTitle: '과거 조회수',
    cutoffDate: '2026-05-28',
    maxDate: '2026-08-27',
  });

  assert.deepEqual(
    totals.map(item => ({
      metric_date: item.metric_date,
      cafe_views: item.cafe_views,
      paired_rows: item.paired_rows,
      decreased_rows: item.decreased_rows,
    })),
    [
      { metric_date: '2026-08-26', cafe_views: 6, paired_rows: 2, decreased_rows: 0 },
      { metric_date: '2026-08-27', cafe_views: 2, paired_rows: 2, decreased_rows: 1 },
    ],
  );
});

test('네이버 카페 URL 형식을 하나의 게시글 정보로 정규화한다', async () => {
  const { parseNaverCafeUrl, withResolvedCafe } = await modulePromise;

  const alias = parseNaverCafeUrl('https://cafe.naver.com/jhs7755/26732?art=token');
  assert.equal(alias.kind, 'article');
  assert.equal(alias.cafeAlias, 'jhs7755');
  assert.equal(alias.articleId, 26732);

  const legacy = parseNaverCafeUrl(
    'https://cafe.naver.com/ArticleRead.nhn?articleid=26732&clubid=20173394',
  );
  assert.equal(legacy.cafeId, 20173394);
  assert.equal(legacy.articleId, 26732);

  const encoded = parseNaverCafeUrl(
    'https://cafe.naver.com/fmls2?iframe_url_utf8=%2FArticleRead.nhn%253Farticleid%3D1725%2526clubid%3D19890960',
  );
  assert.equal(encoded.cafeAlias, 'fmls2');
  assert.equal(encoded.cafeId, 19890960);
  assert.equal(encoded.articleId, 1725);

  const modern = parseNaverCafeUrl(
    'https://m.cafe.naver.com/ca-fe/web/cafes/20173394/articles/26732',
  );
  assert.equal(modern.cafeId, 20173394);
  assert.equal(modern.articleId, 26732);

  const short = parseNaverCafeUrl('https://naver.me/5bC7chye');
  assert.equal(short.kind, 'short');

  const resolved = withResolvedCafe(legacy, { cafeId: 20173394, cafeAlias: 'jhs7755' });
  assert.equal(resolved.canonicalUrl, 'https://cafe.naver.com/jhs7755/26732');
});

test('카페 홈과 게시판 목록 응답을 검증해 읽는다', async () => {
  const { parseArticleListPayload, parseCafeGateInfo, parseCafeMenuIds } = await modulePromise;
  assert.deepEqual(
    parseCafeMenuIds(`
      <a href="/ArticleList.nhn?search.clubid=1&amp;search.menuid=10">건강</a>
      <script>{"menuId":12}</script>
      <a href="/ArticleList.nhn?search.menuid=10">중복</a>
    `),
    [10, 12],
  );
  assert.deepEqual(parseCafeGateInfo({
    message: {
      status: '200',
      result: { cafeInfoView: { cafeId: 20173394, cafeUrl: 'jhs7755', cafeName: '예다생' } },
    },
  }), { cafeId: 20173394, cafeAlias: 'jhs7755', cafeName: '예다생' });

  const list = parseArticleListPayload({
    message: {
      status: '200',
      result: {
        hasNext: true,
        articleList: [{
          articleId: 26732,
          menuId: 10,
          readCount: 182,
          writeDateTimestamp: 1780220214627,
          subject: '표본 글',
        }],
      },
    },
  });
  assert.equal(list.hasNext, true);
  assert.deepEqual(list.items[0], {
    articleId: 26732,
    menuId: 10,
    readCount: 182,
    writeDateTimestamp: 1780220214627,
    title: '표본 글',
  });
});

test('누적 조회수 차분에서 기준점·감소·장기 공백을 구분한다', async () => {
  const { classifyViewDelta } = await modulePromise;
  assert.deepEqual(
    classifyViewDelta(null, 100, null, '2026-08-28T00:45:00Z'),
    { status: 'baseline', delta: 0 },
  );
  assert.deepEqual(
    classifyViewDelta(100, 115, '2026-08-27T00:45:00Z', '2026-08-28T00:45:00Z'),
    { status: 'complete', delta: 15 },
  );
  assert.deepEqual(
    classifyViewDelta(115, 110, '2026-08-27T00:45:00Z', '2026-08-28T00:45:00Z'),
    { status: 'decrease', delta: null },
  );
  assert.deepEqual(
    classifyViewDelta(100, 120, '2026-08-26T00:45:00Z', '2026-08-28T00:45:00Z'),
    { status: 'gap', delta: null },
  );
});
