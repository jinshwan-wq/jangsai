const assert = require('node:assert/strict');
const test = require('node:test');

const modulePromise = import('../supabase/functions/collect-marketing/blog-visitors.mjs');

test('네이버 블로그 주소에서 블로그 ID를 추출한다', async () => {
  const { parseNaverBlogId } = await modulePromise;
  assert.equal(parseNaverBlogId('https://blog.naver.com/sqebloxynd99033'), 'sqebloxynd99033');
  assert.throws(
    () => parseNaverBlogId('https://example.com/sqebloxynd99033'),
    /허용되지 않은 네이버 블로그 주소/,
  );
  assert.throws(
    () => parseNaverBlogId('https://blog.naver.com/sqebloxynd99033/post'),
    /허용되지 않은 네이버 블로그 주소/,
  );
});

test('날짜와 속성 순서에 관계없이 방문자 수를 읽는다', async () => {
  const { parseNaverBlogVisitorXml } = await modulePromise;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <visitorcnts>
      <visitorcnt id="20260826" cnt="36"/>
      <visitorcnt cnt="50" id="20260827"/>
    </visitorcnts>`;
  assert.equal(parseNaverBlogVisitorXml(xml, '2026-08-27'), 50);
});

test('요청 날짜 누락과 비정상 방문자 수를 실패로 처리한다', async () => {
  const { parseNaverBlogVisitorXml } = await modulePromise;
  assert.throws(
    () => parseNaverBlogVisitorXml('<visitorcnt id="20260827" cnt="50"/>', '2026-08-26'),
    /응답에 없습니다/,
  );
  assert.throws(
    () => parseNaverBlogVisitorXml('<visitorcnt id="20260827" cnt="-1"/>', '2026-08-27'),
    /올바르지 않습니다/,
  );
});

test('모든 블로그가 수집됐을 때만 제품 방문자 합계를 만든다', async () => {
  const { buildNaverBlogMetricPatch } = await modulePromise;
  assert.deepEqual(
    buildNaverBlogMetricPatch([{ views: 10 }, { views: 20 }, { views: 30 }], [], 3),
    { blog_views: 60, data_completeness: { blog_views: true } },
  );
  assert.throws(
    () => buildNaverBlogMetricPatch([{ views: 10 }, { views: 20 }], ['third: HTTP 403'], 3),
    /블로그 2\/3개 수집 완료/,
  );
});
