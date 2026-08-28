import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SmartstoreMetric = {
  product_slug: string;
  orders: number;
  revenue: number;
};

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validMetric(value: unknown): value is SmartstoreMetric {
  if (!value || typeof value !== 'object') return false;
  const metric = value as Record<string, unknown>;
  return typeof metric.product_slug === 'string' &&
    /^[a-z0-9-]{3,80}$/.test(metric.product_slug) &&
    Number.isSafeInteger(metric.orders) && Number(metric.orders) >= 0 &&
    Number.isSafeInteger(metric.revenue) && Number(metric.revenue) >= 0;
}

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index] ^ (rightBytes[index] || 0);
  }
  return difference === 0;
}

Deno.serve(async request => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'POST 요청만 허용됩니다.' }, { status: 405 });
  }

  const expectedSecret = Deno.env.get('SMARTSTORE_INGEST_SECRET') || '';
  const receivedSecret = request.headers.get('x-smartstore-secret') || '';
  if (!expectedSecret || !(await secureEqual(expectedSecret, receivedSecret))) {
    return Response.json({ error: '인증되지 않은 스마트스토어 수집 요청입니다.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const metrics = Array.isArray(body.metrics) ? body.metrics : [];
  if (!validDate(body.metric_date) || !metrics.length || metrics.length > 20 || !metrics.every(validMetric)) {
    return Response.json({ error: '수집 데이터 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: 'Supabase 서버 환경변수가 없습니다.' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const slugs = [...new Set(metrics.map((metric: SmartstoreMetric) => metric.product_slug))];
  const { data: products, error: productError } = await supabase
    .from('marketing_products')
    .select('id,slug')
    .in('slug', slugs)
    .eq('is_active', true);
  if (productError) return Response.json({ error: productError.message }, { status: 500 });
  const productIds = new Map((products || []).map(product => [product.slug, product.id]));
  if (productIds.size !== slugs.length) {
    return Response.json({ error: '등록되지 않은 마케팅 제품이 포함되어 있습니다.' }, { status: 400 });
  }

  const { data: run, error: runError } = await supabase
    .from('marketing_ingestion_runs')
    .insert({
      provider: 'smartstore',
      metric_date: body.metric_date,
      details: {
        trigger: body.trigger || 'local_windows_scheduler',
        account_count: Number(body.account_count) || 0,
      },
    })
    .select('id')
    .single();
  if (runError || !run) {
    return Response.json({ error: runError?.message || '수집 실행 이력을 만들지 못했습니다.' }, { status: 500 });
  }

  let succeeded = 0;
  const errors: string[] = [];
  for (const metric of metrics as SmartstoreMetric[]) {
    const { error } = await supabase.rpc('merge_daily_marketing_metric', {
      p_product_id: productIds.get(metric.product_slug),
      p_metric_date: body.metric_date,
      p_patch: {
        smartstore_orders: metric.orders,
        smartstore_revenue: metric.revenue,
        data_completeness: {
          smartstore_orders: true,
          smartstore_revenue: true,
        },
      },
      p_source: 'api',
      p_source_details: {
        provider: 'smartstore',
        collector: 'local_windows_scheduler',
        accounts: body.accounts || [],
        collected_at: new Date().toISOString(),
      },
      p_collection_status: 'partial',
    });
    if (error) errors.push(`${metric.product_slug}: ${error.message}`);
    else succeeded++;
  }

  const failed = metrics.length - succeeded;
  await supabase
    .from('marketing_ingestion_runs')
    .update({
      status: failed === 0 ? 'success' : succeeded ? 'partial' : 'failed',
      finished_at: new Date().toISOString(),
      records_succeeded: succeeded,
      records_failed: failed,
      details: {
        trigger: body.trigger || 'local_windows_scheduler',
        account_count: Number(body.account_count) || 0,
        errors,
      },
    })
    .eq('id', run.id);

  return Response.json({
    ok: failed === 0,
    metric_date: body.metric_date,
    succeeded,
    failed,
    errors,
  });
});
