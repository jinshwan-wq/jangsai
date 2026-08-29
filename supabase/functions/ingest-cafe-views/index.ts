import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_BATCH_SIZE = 500;
const MAX_EXPECTED_SOURCES = 100_000;
const PRODUCT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,80}$/;
const CAFE_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,49}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ProductRecord = {
  id: string;
  slug: string;
};

type ContentRecord = {
  id: string;
  product_id: string;
  url: string;
};

type RunRecord = {
  id: string;
  batch_id: string | null;
  provider: string;
  metric_date: string;
  status: string;
  details: Record<string, unknown>;
};

type SourceInput = {
  product_slug: string;
  source_url: string;
  canonical_url: string;
  cafe_alias: string;
  cafe_id: number;
  article_id: number;
  menu_id?: number | null;
  published_date: string;
  title: string;
  source_details?: Record<string, unknown>;
};

type ObservationInput = {
  product_slug: string;
  cafe_id: number;
  article_id: number;
  menu_id?: number | null;
  cumulative_views?: number | null;
  observed_at: string;
  error_code?: string | null;
  error_message?: string | null;
  source_details?: Record<string, unknown>;
};

type HistoryTotalInput = {
  product_slug: string;
  metric_date: string;
  cafe_views: number;
  previous_snapshot_date: string;
  paired_rows: number;
  decreased_rows: number;
  source_details: Record<string, unknown>;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function positiveInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
    throw new Error(`${field} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (plainObject(error)) {
    const fields = ['code', 'message', 'details', 'hint']
      .filter(field => error[field])
      .map(field => `${field}=${String(error[field])}`);
    if (fields.length) return fields.join(', ');
  }
  return String(error);
}

function assertHttpsCafeUrl(value: unknown, field: string) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'cafe.naver.com') {
    throw new Error(`${field}는 네이버 카페 HTTPS 주소여야 합니다.`);
  }
  if (url.href.length > 2_048) throw new Error(`${field}가 너무 깁니다.`);
  return url.href;
}

function assertSource(value: unknown): SourceInput {
  if (!plainObject(value)) throw new Error('카페 원본 데이터가 올바르지 않습니다.');
  const productSlug = String(value.product_slug || '');
  const cafeAlias = String(value.cafe_alias || '');
  const publishedDate = String(value.published_date || '');
  const title = String(value.title || '').trim();
  if (!PRODUCT_SLUG_PATTERN.test(productSlug)) throw new Error('제품 식별자가 올바르지 않습니다.');
  if (!CAFE_ALIAS_PATTERN.test(cafeAlias)) throw new Error('카페 주소 식별자가 올바르지 않습니다.');
  if (!DATE_PATTERN.test(publishedDate)) throw new Error('발행일이 올바르지 않습니다.');
  if (!title || title.length > 500) throw new Error('카페 글 제목이 올바르지 않습니다.');
  return {
    product_slug: productSlug,
    source_url: String(value.source_url || '').slice(0, 2_048),
    canonical_url: assertHttpsCafeUrl(value.canonical_url, 'canonical_url'),
    cafe_alias: cafeAlias.toLowerCase(),
    cafe_id: positiveInteger(value.cafe_id, 'cafe_id'),
    article_id: positiveInteger(value.article_id, 'article_id'),
    menu_id: value.menu_id === null || value.menu_id === undefined
      ? null
      : positiveInteger(value.menu_id, 'menu_id'),
    published_date: publishedDate,
    title,
    source_details: plainObject(value.source_details) ? value.source_details : {},
  };
}

function assertObservation(value: unknown): ObservationInput {
  if (!plainObject(value)) throw new Error('카페 관측 데이터가 올바르지 않습니다.');
  const productSlug = String(value.product_slug || '');
  if (!PRODUCT_SLUG_PATTERN.test(productSlug)) throw new Error('제품 식별자가 올바르지 않습니다.');
  const observedAt = String(value.observed_at || '');
  if (!Number.isFinite(new Date(observedAt).getTime())) throw new Error('관측 시각이 올바르지 않습니다.');
  const errorCode = value.error_code ? String(value.error_code).slice(0, 100) : null;
  const cumulativeViews = value.cumulative_views === null || value.cumulative_views === undefined
    ? null
    : nonNegativeInteger(value.cumulative_views, 'cumulative_views');
  if ((cumulativeViews === null) === (errorCode === null)) {
    throw new Error('관측값과 오류 중 하나만 입력해야 합니다.');
  }
  return {
    product_slug: productSlug,
    cafe_id: positiveInteger(value.cafe_id, 'cafe_id'),
    article_id: positiveInteger(value.article_id, 'article_id'),
    menu_id: value.menu_id === null || value.menu_id === undefined
      ? null
      : positiveInteger(value.menu_id, 'menu_id'),
    cumulative_views: cumulativeViews,
    observed_at: new Date(observedAt).toISOString(),
    error_code: errorCode,
    error_message: errorCode ? String(value.error_message || errorCode).slice(0, 2_000) : null,
    source_details: plainObject(value.source_details) ? value.source_details : {},
  };
}

function assertHistoryTotal(value: unknown): HistoryTotalInput {
  if (!plainObject(value)) throw new Error('카페 과거 집계 데이터가 올바르지 않습니다.');
  const productSlug = String(value.product_slug || '');
  const metricDate = String(value.metric_date || '');
  const previousSnapshotDate = String(value.previous_snapshot_date || '');
  if (!PRODUCT_SLUG_PATTERN.test(productSlug)) throw new Error('제품 식별자가 올바르지 않습니다.');
  if (!DATE_PATTERN.test(metricDate) || !DATE_PATTERN.test(previousSnapshotDate)) {
    throw new Error('과거 집계 날짜가 올바르지 않습니다.');
  }
  const elapsedDays = (
    new Date(`${metricDate}T00:00:00Z`).getTime() -
    new Date(`${previousSnapshotDate}T00:00:00Z`).getTime()
  ) / 86_400_000;
  if (elapsedDays !== 1) throw new Error('연속된 과거 스냅샷만 저장할 수 있습니다.');
  return {
    product_slug: productSlug,
    metric_date: metricDate,
    cafe_views: nonNegativeInteger(value.cafe_views, 'cafe_views'),
    previous_snapshot_date: previousSnapshotDate,
    paired_rows: positiveInteger(value.paired_rows, 'paired_rows'),
    decreased_rows: nonNegativeInteger(value.decreased_rows, 'decreased_rows'),
    source_details: plainObject(value.source_details) ? value.source_details : {},
  };
}

async function productMap(supabase: any, slugs: string[]) {
  const uniqueSlugs = [...new Set(slugs)];
  if (!uniqueSlugs.length) throw new Error('제품 목록이 비어 있습니다.');
  const { data, error } = await supabase
    .from('marketing_products')
    .select('id,slug')
    .in('slug', uniqueSlugs)
    .eq('is_active', true);
  if (error) throw error;
  const products = new Map(
    (data as ProductRecord[] || []).map(product => [product.slug, product]),
  );
  const missing = uniqueSlugs.filter(slug => !products.has(slug));
  if (missing.length) throw new Error(`등록되지 않은 제품입니다: ${missing.join(', ')}`);
  return products;
}

async function getRun(supabase: any, runId: unknown, allowFinished = false) {
  const id = String(runId || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('수집 실행 ID가 올바르지 않습니다.');
  const { data, error } = await supabase
    .from('marketing_ingestion_runs')
    .select('id,batch_id,provider,metric_date,status,details')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('카페 수집 실행을 찾지 못했습니다.');
  const run = data as RunRecord;
  if (run.provider !== 'naver_cafe') throw new Error('카페 수집 실행이 아닙니다.');
  if (!allowFinished && run.status !== 'running') throw new Error('이미 종료된 카페 수집 실행입니다.');
  return run;
}

async function startRun(supabase: any, body: Record<string, unknown>) {
  const metricDate = String(body.metric_date || '');
  const sourceFingerprint = String(body.source_fingerprint || '');
  const expectedInput = body.expected_by_product;
  if (!DATE_PATTERN.test(metricDate)) throw new Error('수집 날짜가 올바르지 않습니다.');
  if (!/^[0-9a-f]{64}$/.test(sourceFingerprint)) throw new Error('카페 URL 목록 지문이 올바르지 않습니다.');
  if (!plainObject(expectedInput)) throw new Error('제품별 예상 URL 수가 없습니다.');

  const expectedByProduct = Object.fromEntries(
    Object.entries(expectedInput).map(([slug, count]) => {
      if (!PRODUCT_SLUG_PATTERN.test(slug)) throw new Error(`제품 식별자가 올바르지 않습니다: ${slug}`);
      return [slug, positiveInteger(count, `${slug} 예상 URL 수`)];
    }),
  );
  const expectedTotal = Object.values(expectedByProduct).reduce((sum, count) => sum + count, 0);
  if (expectedTotal > MAX_EXPECTED_SOURCES) throw new Error('예상 URL 수가 허용 범위를 초과했습니다.');
  const products = await productMap(supabase, Object.keys(expectedByProduct));

  if (body.force_rerun !== true) {
    const { data: completedRun, error: completedError } = await supabase
      .from('marketing_ingestion_runs')
      .select('id,batch_id,details')
      .eq('provider', 'naver_cafe')
      .eq('metric_date', metricDate)
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (completedError) throw completedError;
    if (completedRun) {
      const completedExpected = plainObject(completedRun.details?.expected_by_product)
        ? completedRun.details.expected_by_product
        : {};
      const completedFingerprint = String(completedRun.details?.source_fingerprint || '');
      const requestedKeys = Object.keys(expectedByProduct).sort();
      const completedKeys = Object.keys(completedExpected).sort();
      const expectedMatches =
        completedFingerprint === sourceFingerprint &&
        requestedKeys.length === completedKeys.length &&
        requestedKeys.every((key, index) =>
          key === completedKeys[index] &&
          Number(completedExpected[key]) === expectedByProduct[key]
        );
      if (expectedMatches) {
        return {
          ok: true,
          run_id: completedRun.id,
          batch_id: completedRun.batch_id,
          expected_total: expectedTotal,
          status: 'success',
          already_complete: true,
          finalize_result: completedRun.details?.finalize_result || null,
        };
      }
    }
  }

  if (!body.allow_source_drop) {
    for (const [slug, expected] of Object.entries(expectedByProduct)) {
      const product = products.get(slug)!;
      const { count, error } = await supabase
        .from('marketing_cafe_article_state')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', product.id)
        .eq('is_active', true);
      if (error) throw error;
      if ((count || 0) >= 100 && expected < Math.floor((count || 0) * 0.8)) {
        throw new Error(`${slug} URL 수가 기존 대비 20% 이상 감소하여 수집을 중단했습니다.`);
      }
    }
  }

  const { data: batch, error: batchError } = await supabase
    .from('marketing_ingestion_batches')
    .insert({
      metric_date: metricDate,
      expected_providers: ['naver_cafe'],
      trigger_type: String(body.trigger || 'local_windows_scheduler').slice(0, 100),
      details: {
        expected_by_product: expectedByProduct,
        expected_total: expectedTotal,
        source_fingerprint: sourceFingerprint,
      },
    })
    .select('id')
    .single();
  if (batchError || !batch) throw batchError || new Error('카페 수집 배치를 만들지 못했습니다.');

  const { data: run, error: runError } = await supabase
    .from('marketing_ingestion_runs')
    .insert({
      batch_id: batch.id,
      provider: 'naver_cafe',
      metric_date: metricDate,
      details: {
        expected_by_product: expectedByProduct,
        expected_total: expectedTotal,
        source_fingerprint: sourceFingerprint,
        collector: 'naver_cafe_public_list',
        trigger: String(body.trigger || 'local_windows_scheduler').slice(0, 100),
      },
    })
    .select('id')
    .single();
  if (runError || !run) {
    await supabase
      .from('marketing_ingestion_batches')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('id', batch.id);
    throw runError || new Error('카페 수집 실행을 만들지 못했습니다.');
  }
  return { ok: true, run_id: run.id, batch_id: batch.id, expected_total: expectedTotal };
}

async function syncSourceChunk(
  supabase: any,
  run: RunRecord,
  sources: SourceInput[],
  products: Map<string, ProductRecord>,
) {
  const urls = sources.map(source => source.canonical_url);
  if (new Set(urls).size !== urls.length) throw new Error('한 배치에 중복 카페 URL이 있습니다.');
  const { data: existingContents, error: existingError } = await supabase
    .from('marketing_contents')
    .select('id,product_id,url')
    .in('url', urls);
  if (existingError) throw existingError;
  const existingByUrl = new Map<string, ContentRecord>(
    (existingContents || []).map((content: ContentRecord) => [
      content.url,
      content,
    ]),
  );
  for (const source of sources) {
    const existing = existingByUrl.get(source.canonical_url);
    if (existing && existing.product_id !== products.get(source.product_slug)!.id) {
      throw new Error(`서로 다른 제품에 같은 카페 글이 등록되었습니다: ${source.canonical_url}`);
    }
  }

  const contentRows = sources.map(source => ({
    product_id: products.get(source.product_slug)!.id,
    channel: 'naver_cafe',
    title: source.title,
    url: source.canonical_url,
    published_at: `${source.published_date}T00:00:00+09:00`,
    is_active: true,
  }));
  const { data: savedContents, error: saveContentError } = await supabase
    .from('marketing_contents')
    .upsert(contentRows, { onConflict: 'url' })
    .select('id,product_id,url');
  if (saveContentError) throw saveContentError;
  const contentByUrl = new Map<string, ContentRecord>(
    (savedContents || []).map((content: ContentRecord) => [
      content.url,
      content,
    ]),
  );
  if (contentByUrl.size !== sources.length) throw new Error('카페 콘텐츠 ID를 모두 저장하지 못했습니다.');

  const stateRows = sources.map(source => ({
    content_id: contentByUrl.get(source.canonical_url)!.id,
    product_id: products.get(source.product_slug)!.id,
    cafe_id: source.cafe_id,
    article_id: source.article_id,
    cafe_alias: source.cafe_alias,
    menu_id: source.menu_id || null,
    source_url: source.source_url,
    published_date: source.published_date,
    source_details: source.source_details || {},
    last_seen_run_id: run.id,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));
  const { error: stateError } = await supabase
    .from('marketing_cafe_article_state')
    .upsert(stateRows, { onConflict: 'product_id,cafe_id,article_id' });
  if (stateError) throw stateError;
}

async function syncSources(supabase: any, body: Record<string, unknown>) {
  const run = await getRun(supabase, body.run_id);
  const rawSources = body.sources;
  if (!Array.isArray(rawSources) || !rawSources.length || rawSources.length > MAX_BATCH_SIZE) {
    throw new Error(`카페 원본은 한 번에 1~${MAX_BATCH_SIZE}개여야 합니다.`);
  }
  const sources = rawSources.map(assertSource);
  const products = await productMap(supabase, sources.map(source => source.product_slug));
  for (let offset = 0; offset < sources.length; offset += 100) {
    await syncSourceChunk(supabase, run, sources.slice(offset, offset + 100), products);
  }
  return { ok: true, run_id: run.id, saved: sources.length };
}

async function saveObservations(supabase: any, body: Record<string, unknown>) {
  const run = await getRun(supabase, body.run_id);
  const rawObservations = body.observations;
  if (
    !Array.isArray(rawObservations) ||
    !rawObservations.length ||
    rawObservations.length > MAX_BATCH_SIZE
  ) {
    throw new Error(`카페 관측값은 한 번에 1~${MAX_BATCH_SIZE}개여야 합니다.`);
  }
  const observations = rawObservations.map(assertObservation);
  const products = await productMap(supabase, observations.map(item => item.product_slug));
  const stateByKey = new Map<string, { id: string }>();

  for (const [slug, product] of products) {
    const productItems = observations.filter(item => item.product_slug === slug);
    const articleIds = [...new Set(productItems.map(item => item.article_id))];
    const { data: states, error } = await supabase
      .from('marketing_cafe_article_state')
      .select('id,cafe_id,article_id')
      .eq('product_id', product.id)
      .eq('last_seen_run_id', run.id)
      .in('article_id', articleIds);
    if (error) throw error;
    for (const state of states || []) {
      stateByKey.set(`${product.id}:${state.cafe_id}:${state.article_id}`, state);
    }
  }

  const missingStates = observations.filter(item => {
    const productId = products.get(item.product_slug)!.id;
    return !stateByKey.has(`${productId}:${item.cafe_id}:${item.article_id}`);
  });
  if (missingStates.length) {
    throw new Error(`원본 동기화가 누락된 관측값이 ${missingStates.length}개 있습니다.`);
  }

  const rows = observations.map(item => ({
    run_id: run.id,
    product_id: products.get(item.product_slug)!.id,
    cafe_id: item.cafe_id,
    article_id: item.article_id,
    menu_id: item.menu_id || null,
    cumulative_views: item.cumulative_views ?? null,
    observed_at: item.observed_at,
    error_code: item.error_code || null,
    error_message: item.error_message || null,
    source_details: item.source_details || {},
  }));
  const { error } = await supabase
    .from('marketing_cafe_observations')
    .upsert(rows, { onConflict: 'run_id,product_id,cafe_id,article_id' });
  if (error) throw error;
  return { ok: true, run_id: run.id, saved: rows.length };
}

async function finalizeRun(supabase: any, body: Record<string, unknown>) {
  const run = await getRun(supabase, body.run_id, true);
  const { data, error } = await supabase.rpc('finalize_naver_cafe_collection', {
    p_run_id: run.id,
  });
  if (error) throw error;
  return { ok: true, ...data };
}

async function failRun(supabase: any, body: Record<string, unknown>) {
  const run = await getRun(supabase, body.run_id, true);
  if (run.status !== 'running') return { ok: true, run_id: run.id, status: run.status };
  const message = String(body.error || '로컬 카페 수집기가 중단되었습니다.').slice(0, 2_000);
  const finishedAt = new Date().toISOString();
  const { error } = await supabase
    .from('marketing_ingestion_runs')
    .update({ status: 'failed', finished_at: finishedAt, error_message: message })
    .eq('id', run.id);
  if (error) throw error;
  if (run.batch_id) {
    await supabase
      .from('marketing_ingestion_batches')
      .update({ status: 'failed', finished_at: finishedAt, details: { error: message } })
      .eq('id', run.batch_id);
  }
  return { ok: true, run_id: run.id, status: 'failed' };
}

async function backfillDailyTotals(supabase: any, body: Record<string, unknown>) {
  const rawRows = body.rows;
  if (!Array.isArray(rawRows) || !rawRows.length || rawRows.length > MAX_BATCH_SIZE) {
    throw new Error(`카페 과거 집계는 한 번에 1~${MAX_BATCH_SIZE}개여야 합니다.`);
  }
  const rows = rawRows.map(assertHistoryTotal);
  const keys = rows.map(row => `${row.product_slug}:${row.metric_date}`);
  if (new Set(keys).size !== keys.length) throw new Error('제품·날짜가 중복된 과거 집계가 있습니다.');
  const products = await productMap(supabase, rows.map(row => row.product_slug));
  const productIds = [...new Set([...products.values()].map(product => product.id))];
  const dates = rows.map(row => row.metric_date).sort();
  const { data: existingRows, error: existingError } = await supabase
    .from('daily_marketing_metrics')
    .select(
      'product_id,metric_date,blog_views,cafe_views,source,source_details,collection_status,data_completeness',
    )
    .in('product_id', productIds)
    .gte('metric_date', dates[0])
    .lte('metric_date', dates.at(-1)!);
  if (existingError) throw existingError;
  const existingByKey = new Map<string, Record<string, unknown>>(
    (existingRows || []).map((row: Record<string, unknown>) => [
      `${row.product_id}:${row.metric_date}`,
      row,
    ] as [string, Record<string, unknown>]),
  );
  const overwrite = body.overwrite === true;
  const conflicts: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const upserts = rows.flatMap(row => {
    const product = products.get(row.product_slug)!;
    const key = `${product.id}:${row.metric_date}`;
    const existing = existingByKey.get(key);
    const existingViews = Number(existing?.cafe_views || 0);
    if (existing && existingViews > 0 && existingViews !== row.cafe_views && !overwrite) {
      conflicts.push({
        product_slug: row.product_slug,
        metric_date: row.metric_date,
        existing_cafe_views: existingViews,
        imported_cafe_views: row.cafe_views,
      });
      return [];
    }
    const blogViews = Number(existing?.blog_views || 0);
    return [{
      product_id: product.id,
      metric_date: row.metric_date,
      cafe_views: row.cafe_views,
      content_views: Math.max(0, blogViews) + row.cafe_views,
      source: String(existing?.source || 'import'),
      collection_status: String(existing?.collection_status || 'imported'),
      data_completeness: {
        ...(plainObject(existing?.data_completeness) ? existing.data_completeness : {}),
        cafe_views: true,
      },
      source_details: {
        ...(plainObject(existing?.source_details) ? existing.source_details : {}),
        naver_cafe_history: {
          provider: 'google_sheets_history',
          previous_snapshot_date: row.previous_snapshot_date,
          paired_rows: row.paired_rows,
          decreased_rows: row.decreased_rows,
          ...row.source_details,
        },
      },
      collected_at: now,
      updated_at: now,
    }];
  });
  for (let offset = 0; offset < upserts.length; offset += 100) {
    const { error } = await supabase
      .from('daily_marketing_metrics')
      .upsert(upserts.slice(offset, offset + 100), { onConflict: 'product_id,metric_date' });
    if (error) throw error;
  }
  return {
    ok: true,
    saved: upserts.length,
    skipped_conflicts: conflicts.length,
    conflict_samples: conflicts.slice(0, 20),
  };
}

async function retryLatestFailedRun(supabase: any) {
  const { data, error } = await supabase
    .from('marketing_ingestion_runs')
    .select('id,batch_id,provider,metric_date,status,details')
    .eq('provider', 'naver_cafe')
    .eq('status', 'failed')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw error || new Error('재시도할 카페 수집 실행이 없습니다.');
  const run = data as RunRecord;
  const { error: resetError } = await supabase
    .from('marketing_ingestion_runs')
    .update({ status: 'running', finished_at: null, error_message: null })
    .eq('id', run.id)
    .eq('status', 'failed');
  if (resetError) throw resetError;
  if (run.batch_id) {
    const { error: batchError } = await supabase
      .from('marketing_ingestion_batches')
      .update({ status: 'running', finished_at: null })
      .eq('id', run.batch_id);
    if (batchError) throw batchError;
  }
  try {
    return await finalizeRun(supabase, { run_id: run.id });
  } catch (retryError) {
    await failRun(supabase, {
      run_id: run.id,
      error: `집계 재시도 실패: ${errorMessage(retryError)}`,
    }).catch(() => {});
    throw retryError;
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'POST 요청만 허용됩니다.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ingestSecret = Deno.env.get('CAFE_VIEWS_INGEST_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !ingestSecret) {
    return jsonResponse({ error: '카페 수집 서버 설정이 없습니다.' }, 500);
  }
  if (request.headers.get('x-cafe-views-secret') !== ingestSecret) {
    return jsonResponse({ error: '인증되지 않은 카페 수집 요청입니다.' }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    switch (action) {
      case 'start':
        return jsonResponse(await startRun(supabase, body));
      case 'sync_sources':
        return jsonResponse(await syncSources(supabase, body));
      case 'observations':
        return jsonResponse(await saveObservations(supabase, body));
      case 'finalize':
        return jsonResponse(await finalizeRun(supabase, body));
      case 'fail':
        return jsonResponse(await failRun(supabase, body));
      case 'retry_latest_failed':
        return jsonResponse(await retryLatestFailedRun(supabase));
      case 'backfill_daily_totals':
        return jsonResponse(await backfillDailyTotals(supabase, body));
      default:
        return jsonResponse({ error: '지원하지 않는 카페 수집 작업입니다.' }, 400);
    }
  } catch (error) {
    const message = errorMessage(error);
    console.error(action || 'unknown', message);
    return jsonResponse({ error: message }, 400);
  }
});
