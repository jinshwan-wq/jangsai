const BLOG_ID_PATTERN = /^[A-Za-z0-9_-]{2,50}$/;

export function parseNaverBlogId(value) {
  const url = new URL(String(value || ''));
  const segments = url.pathname.split('/').filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'blog.naver.com' ||
    segments.length !== 1 ||
    !BLOG_ID_PATTERN.test(segments[0])
  ) {
    throw new Error('허용되지 않은 네이버 블로그 주소입니다.');
  }
  return segments[0];
}

export function parseNaverBlogVisitorXml(xml, metricDate) {
  const targetDate = String(metricDate || '').replaceAll('-', '');
  if (!/^\d{8}$/.test(targetDate)) throw new Error('수집 날짜 형식이 올바르지 않습니다.');

  const visitorTags = String(xml || '').match(/<visitorcnt\b[^>]*\/?>/gi) || [];
  for (const tag of visitorTags) {
    const attributes = Object.fromEntries(
      [...tag.matchAll(/\b(id|cnt)\s*=\s*["']([^"']*)["']/gi)]
        .map(match => [match[1].toLowerCase(), match[2]])
    );
    if (attributes.id !== targetDate) continue;
    if (!/^\d+$/.test(attributes.cnt || '')) {
      throw new Error(`${metricDate} 방문자 수가 올바르지 않습니다.`);
    }
    const visitors = Number(attributes.cnt);
    if (!Number.isSafeInteger(visitors)) {
      throw new Error(`${metricDate} 방문자 수가 허용 범위를 벗어났습니다.`);
    }
    return visitors;
  }

  throw new Error(`${metricDate} 방문자 수가 응답에 없습니다.`);
}

export function buildNaverBlogMetricPatch(contentMetrics, contentErrors, expectedCount) {
  const metrics = Array.isArray(contentMetrics) ? contentMetrics : [];
  const errors = Array.isArray(contentErrors) ? contentErrors : [];
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0) {
    throw new Error('예상 블로그 수가 올바르지 않습니다.');
  }
  if (errors.length || metrics.length !== expectedCount) {
    throw new Error(
      `블로그 ${metrics.length}/${expectedCount}개 수집 완료: ${errors.slice(0, 3).join(' | ')}`,
    );
  }
  const blogViews = metrics.reduce((sum, item) => {
    const views = Number(item?.views);
    if (!Number.isSafeInteger(views) || views < 0) {
      throw new Error('수집된 블로그 방문자 수가 올바르지 않습니다.');
    }
    return sum + views;
  }, 0);
  if (!Number.isSafeInteger(blogViews)) throw new Error('블로그 방문자 합계가 허용 범위를 벗어났습니다.');
  return {
    blog_views: blogViews,
    data_completeness: { blog_views: true },
  };
}
