import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Mapping = {
  id: string;
  product_id: string;
  provider: string;
  external_id: string | null;
  config: Record<string, unknown>;
};

type MetricPatch = Record<string, number | Record<string, boolean>>;

const ALLOWED_METRICS = new Set([
  'blog_views', 'cafe_views', 'content_views', 'keyword_search_volume',
  'cafe24_visits', 'smartstore_visits', 'coupang_visits',
  'tracked_visits', 'tracked_orders',
  'cafe24_orders', 'cafe24_revenue',
  'smartstore_orders', 'smartstore_revenue',
  'coupang_orders', 'coupang_revenue', 'reported_total_revenue', 'ad_spend',
]);

const PROVIDER_TOKEN_ENV: Record<string, string> = {
  cafe24: 'CAFE24_API_TOKEN',
  smartstore: 'SMARTSTORE_API_TOKEN',
  coupang: 'COUPANG_API_TOKEN',
  naver_search: 'NAVER_SEARCH_API_TOKEN',
  naver_blog: 'NAVER_CONTENT_API_TOKEN',
  naver_cafe: 'NAVER_CONTENT_API_TOKEN',
  generic_json: 'GENERIC_MARKETING_API_TOKEN',
};

function previousKstDate() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = new Date(`${formatter.format(new Date())}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() - 1);
  return today.toISOString().slice(0, 10);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertPublicHttpsUrl(value: unknown) {
  const url = new URL(String(value || ''));
  const host = url.hostname.toLowerCase();
  const configuredHosts = (Deno.env.get('ALLOWED_MARKETING_HOSTS') || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const knownHost = host === 'ca-api.cafe24data.com' ||
    host === 'api.commerce.naver.com' ||
    host === 'api-gateway.coupang.com' ||
    host.endsWith('.cafe24api.com');
  if (url.protocol !== 'https:') throw new Error('수집 주소는 HTTPS만 허용됩니다.');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host)
  ) {
    throw new Error('내부 네트워크 주소는 수집 대상으로 사용할 수 없습니다.');
  }
  if (!knownHost && !configuredHosts.includes(host)) {
    throw new Error('허용 목록에 등록되지 않은 수집 주소입니다.');
  }
  return url;
}

function readPath(payload: unknown, path: unknown) {
  if (!path || typeof path !== 'string') return payload;
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, payload);
}

function normalizeMetrics(payload: unknown, mapping: Mapping): MetricPatch {
  const configuredPath = mapping.config?.result_path;
  const selected = readPath(payload, configuredPath);
  const candidates = Array.isArray(selected)
    ? selected
    : Array.isArray((selected as Record<string, unknown>)?.records)
      ? (selected as Record<string, unknown>).records as unknown[]
      : [selected];

  const matching = candidates.find(item => {
    if (!mapping.external_id || !item || typeof item !== 'object') return true;
    const record = item as Record<string, unknown>;
    return String(record.external_id ?? record.product_id ?? record.productId ?? '') === mapping.external_id;
  });
  const raw = matching && typeof matching === 'object'
    ? ((matching as Record<string, unknown>).metrics || matching) as Record<string, unknown>
    : {};

  const fieldMap = mapping.config?.field_map && typeof mapping.config.field_map === 'object'
    ? mapping.config.field_map as Record<string, unknown>
    : {};
  const patch: MetricPatch = {};
  const completeness: Record<string, boolean> = {};

  for (const metric of ALLOWED_METRICS) {
    const sourceKey = String(fieldMap[metric] || metric);
    if (!(sourceKey in raw) || raw[sourceKey] === null || raw[sourceKey] === '') continue;
    const value = Number(raw[sourceKey]);
    if (!Number.isFinite(value) || value < 0) continue;
    patch[metric] = Math.round(value);
    completeness[metric] = true;
  }

  patch.data_completeness = completeness;
  return patch;
}

async function hmacBase64(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function collectNaverSearch(mapping: Mapping) {
  const apiKey = Deno.env.get('NAVER_SEARCH_API_KEY');
  const secretKey = Deno.env.get('NAVER_SEARCH_SECRET_KEY');
  const customerId = Deno.env.get('NAVER_SEARCH_CUSTOMER_ID');
  if (!apiKey || !secretKey || !customerId) {
    throw new Error('네이버 검색광고 API 인증값이 설정되지 않았습니다.');
  }

  const configuredKeywords = Array.isArray(mapping.config?.keywords)
    ? mapping.config.keywords.map(String)
    : [mapping.external_id].filter(Boolean).map(String);
  if (!configuredKeywords.length) throw new Error('브랜드 검색 키워드가 설정되지 않았습니다.');

  const uri = '/keywordstool';
  const timestamp = Date.now().toString();
  const signature = await hmacBase64(secretKey, `${timestamp}.GET.${uri}`);
  const url = new URL(`https://api.searchad.naver.com${uri}`);
  url.searchParams.set('hintKeywords', configuredKeywords.join(','));
  url.searchParams.set('showDetail', '1');
  const response = await fetch(url, {
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': apiKey,
      'X-Customer': customerId,
      'X-Signature': signature,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`네이버 검색량 응답 오류 (${response.status})`);
  const payload = await response.json();
  const wanted = new Set(configuredKeywords.map(keyword => keyword.replace(/\s+/g, '').toLowerCase()));
  const monthlyVolume = (payload.keywordList || []).reduce((sum: number, item: Record<string, unknown>) => {
    const keyword = String(item.relKeyword || '').replace(/\s+/g, '').toLowerCase();
    if (!wanted.has(keyword)) return sum;
    const pc = typeof item.monthlyPcQcCnt === 'number' ? item.monthlyPcQcCnt : 0;
    const mobile = typeof item.monthlyMobileQcCnt === 'number' ? item.monthlyMobileQcCnt : 0;
    return sum + pc + mobile;
  }, 0);
  return {
    keyword_search_volume: monthlyVolume,
    data_completeness: { keyword_search_volume: true },
  };
}

async function collectMapping(mapping: Mapping, metricDate: string) {
  if (mapping.provider === 'google_sheets') {
    throw new Error('Google Sheets는 전환 기간의 수동 보조 수집원입니다.');
  }
  if (mapping.provider === 'naver_search') return collectNaverSearch(mapping);

  const endpoint = mapping.config?.endpoint;
  if (!endpoint) throw new Error(`${mapping.provider} 수집 주소가 설정되지 않았습니다.`);
  const url = assertPublicHttpsUrl(endpoint);
  url.searchParams.set(String(mapping.config?.date_param || 'metric_date'), metricDate);
  if (mapping.external_id) {
    url.searchParams.set(String(mapping.config?.id_param || 'external_id'), mapping.external_id);
  }

  const envName = PROVIDER_TOKEN_ENV[mapping.provider] || '';
  const token = envName ? Deno.env.get(envName) : null;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `${String(mapping.config?.auth_scheme || 'Bearer')} ${token}`;

  const response = await fetch(url, {
    method: String(mapping.config?.method || 'GET'),
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${mapping.provider} 응답 오류 (${response.status})`);
  const patch = normalizeMetrics(await response.json(), mapping);
  const metricCount = Object.keys(patch).filter(key => key !== 'data_completeness').length;
  if (!metricCount) throw new Error(`${mapping.provider} 응답에 사용할 지표가 없습니다.`);
  return patch;
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST 요청만 허용됩니다.' }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase 서버 환경변수가 없습니다.' }), { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const metricDate = isDate(body.metric_date) ? body.metric_date : previousKstDate();
  const requestedProviders = Array.isArray(body.providers)
    ? new Set(body.providers.map(String))
    : null;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: tokenValid, error: tokenError } = await supabase.rpc(
    'verify_marketing_collector_token',
    { p_token: request.headers.get('x-collector-secret') || '' },
  );
  if (tokenError || !tokenValid) {
    return new Response(JSON.stringify({ error: '인증되지 않은 수집 요청입니다.' }), { status: 401 });
  }

  let mappingQuery = supabase
    .from('marketing_source_mappings')
    .select('id,product_id,provider,external_id,config')
    .eq('is_enabled', true);
  if (requestedProviders?.size) mappingQuery = mappingQuery.in('provider', [...requestedProviders]);
  const { data: mappings, error: mappingError } = await mappingQuery;
  if (mappingError) {
    return new Response(JSON.stringify({ error: mappingError.message }), { status: 500 });
  }

  const grouped = new Map<string, Mapping[]>();
  for (const mapping of (mappings || []) as Mapping[]) {
    if (!grouped.has(mapping.provider)) grouped.set(mapping.provider, []);
    grouped.get(mapping.provider)!.push(mapping);
  }

  const expectedProviders = [...grouped.keys()];
  const { data: batch, error: batchError } = await supabase
    .from('marketing_ingestion_batches')
    .insert({
      metric_date: metricDate,
      expected_providers: expectedProviders,
      trigger_type: body.trigger || 'manual',
      details: { mapping_count: mappings?.length || 0 },
    })
    .select('id')
    .single();
  if (batchError || !batch) {
    return new Response(JSON.stringify({ error: batchError?.message || '수집 배치 생성 실패' }), { status: 500 });
  }

  const summary: Record<string, unknown>[] = [];
  if (!grouped.size) {
    await supabase
      .from('marketing_ingestion_batches')
      .update({
        status: 'skipped',
        finished_at: new Date().toISOString(),
        details: { mapping_count: 0, reason: 'no_enabled_mappings' },
      })
      .eq('id', batch.id);
  }
  for (const [provider, providerMappings] of grouped) {
    const { data: run, error: runError } = await supabase
      .from('marketing_ingestion_runs')
      .insert({ batch_id: batch.id, provider, metric_date: metricDate, details: { trigger: body.trigger || 'manual' } })
      .select('id')
      .single();
    if (runError || !run) {
      summary.push({ provider, status: 'failed', error: runError?.message || '실행 이력 생성 실패' });
      continue;
    }

    let succeeded = 0;
    let failed = 0;
    for (const mapping of providerMappings) {
      try {
        const patch = await collectMapping(mapping, metricDate);
        const sourceDetails = {
          provider,
          mapping_id: mapping.id,
          collected_at: new Date().toISOString(),
        };
        const { error } = provider === 'naver_search'
          ? await supabase.from('keyword_search_snapshots').upsert({
              product_id: mapping.product_id,
              snapshot_date: metricDate,
              window_days: 30,
              search_volume: patch.keyword_search_volume,
              provider,
              source_details: sourceDetails,
              collected_at: new Date().toISOString(),
            }, { onConflict: 'product_id,snapshot_date,provider' })
          : await supabase.rpc('merge_daily_marketing_metric', {
              p_product_id: mapping.product_id,
              p_metric_date: metricDate,
              p_patch: patch,
              p_source: 'api',
              p_source_details: sourceDetails,
              p_collection_status: 'partial',
            });
        if (error) throw error;
        await supabase
          .from('marketing_source_mappings')
          .update({ last_collected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', mapping.id);
        succeeded++;
      } catch (error) {
        failed++;
        await supabase.from('marketing_ingestion_errors').insert({
          run_id: run.id,
          product_id: mapping.product_id,
          provider,
          error_code: 'COLLECTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          details: { mapping_id: mapping.id, external_id: mapping.external_id },
        });
      }
    }

    const status = failed === 0 ? 'success' : succeeded > 0 ? 'partial' : 'failed';
    await supabase
      .from('marketing_ingestion_runs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        records_succeeded: succeeded,
        records_failed: failed,
      })
      .eq('id', run.id);
    summary.push({ provider, status, succeeded, failed });
  }

  if (grouped.size) {
    const statuses = summary.map(item => String(item.status));
    const batchStatus = statuses.every(status => status === 'success')
      ? 'success'
      : statuses.every(status => status === 'failed')
        ? 'failed'
        : 'partial';
    await supabase
      .from('marketing_ingestion_batches')
      .update({
        status: batchStatus,
        finished_at: new Date().toISOString(),
        details: { mapping_count: mappings?.length || 0, provider_results: summary },
      })
      .eq('id', batch.id);
  }

  return new Response(JSON.stringify({
    ok: summary.every(item => item.status === 'success'),
    metric_date: metricDate,
    providers: summary,
    message: grouped.size ? undefined : '활성화된 수집 매핑이 없습니다.',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
});
