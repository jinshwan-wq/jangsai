function normalizeKeyword(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function monthlyCount(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseNaverKeywordVolumes(configuredKeywords, keywordList) {
  const configured = [...new Map(
    configuredKeywords.map((
      keyword,
    ) => [normalizeKeyword(keyword), String(keyword)]),
  ).entries()];
  if (!configured.length || configured.some(([key]) => !key)) {
    throw new Error("브랜드 검색 키워드가 설정되지 않았습니다.");
  }

  const responseByKeyword = new Map();
  for (const item of Array.isArray(keywordList) ? keywordList : []) {
    const key = normalizeKeyword(item?.relKeyword);
    if (!key || responseByKeyword.has(key)) continue;
    responseByKeyword.set(key, item);
  }

  const missing = configured.filter(([key]) => !responseByKeyword.has(key));
  if (missing.length) {
    throw new Error(
      `네이버 검색량 응답에서 추적 키워드가 누락되었습니다: ${
        missing.map(([, keyword]) => keyword).join(", ")
      }`,
    );
  }

  return configured.map(([key, keyword]) => {
    const item = responseByKeyword.get(key);
    return {
      keyword,
      search_volume: monthlyCount(item.monthlyPcQcCnt) +
        monthlyCount(item.monthlyMobileQcCnt),
    };
  });
}
