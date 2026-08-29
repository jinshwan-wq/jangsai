const assert = require("node:assert/strict");
const test = require("node:test");

test("네이버 검색량 응답은 설정된 모든 키워드를 요구한다", async () => {
  const { parseNaverKeywordVolumes } = await import(
    "../supabase/functions/collect-marketing/naver-keywords.mjs"
  );
  const result = parseNaverKeywordVolumes(
    ["유랄통감크림", "통감크림"],
    [
      {
        relKeyword: "유랄통감크림",
        monthlyPcQcCnt: 10,
        monthlyMobileQcCnt: 20,
      },
      { relKeyword: "통감크림", monthlyPcQcCnt: 30, monthlyMobileQcCnt: 40 },
    ],
  );
  assert.deepEqual(result, [
    { keyword: "유랄통감크림", search_volume: 30 },
    { keyword: "통감크림", search_volume: 70 },
  ]);
  assert.throws(
    () =>
      parseNaverKeywordVolumes(
        ["유랄통감크림", "통감크림"],
        [{
          relKeyword: "유랄통감크림",
          monthlyPcQcCnt: 10,
          monthlyMobileQcCnt: 20,
        }],
      ),
    /통감크림/,
    "한 키워드라도 빠진 API 응답은 완전한 검색량으로 저장하지 않는다",
  );
});
