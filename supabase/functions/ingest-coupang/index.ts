import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ChannelMetric = {
  visits: number;
  orders: number;
  revenue: number;
};

type CoupangMetric = {
  product_slug: string;
  wing: ChannelMetric;
  growth: ChannelMetric;
};

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validChannel(value: unknown): value is ChannelMetric {
  if (!value || typeof value !== 'object') return false;
  const channel = value as Record<string, unknown>;
  return Number.isSafeInteger(channel.visits) && Number(channel.visits) >= 0 &&
    Number.isSafeInteger(channel.orders) &&
    Number.isSafeInteger(channel.revenue);
}

function validMetric(value: unknown): value is CoupangMetric {
  if (!value || typeof value !== 'object') return false;
  const metric = value as Record<string, unknown>;
  return typeof metric.product_slug === 'string' &&
    /^[a-z0-9-]{3,80}$/.test(metric.product_slug) &&
    validChannel(metric.wing) &&
    validChannel(metric.growth);
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

  const expectedSecret = Deno.env.get('COUPANG_WING_INGEST_SECRET') || '';
  const receivedSecret = request.headers.get('x-coupang-wing-secret') || '';
  if (!expectedSecret || !(await secureEqual(expectedSecret, receivedSecret))) {
    return Response.json({ error: '인증되지 않은 쿠팡 Wing 수집 요청입니다.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const metrics = Array.isArray(body.metrics) ? body.metrics : [];
  const isFailureReport = body.status === 'failed';
  const failureMessage = typeof body.error === 'string' ? body.error.trim().slice(0, 500) : '';
  if (!validDate(body.metric_date) || typeof body.account !== 'string' ||
    (isFailureReport ? !failureMessage : (!metrics.length || metrics.length > 10 || !metrics.every(validMetric)))) {
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

  if (isFailureReport) {
    const details = {
      trigger: body.trigger || 'local_windows_scheduler',
      account: body.account,
      errors: [failureMessage],
    };
    const { data: run, error: runError } = await supabase
      .from('marketing_ingestion_runs')
      .insert({
        provider: 'coupang',
        metric_date: body.metric_date,
        status: 'failed',
        finished_at: new Date().toISOString(),
        records_failed: 1,
        details,
        error_message: failureMessage,
      })
      .select('id')
      .single();
    if (runError || !run) {
      return Response.json({ error: runError?.message || '실패 이력을 기록하지 못했습니다.' }, { status: 500 });
    }
    await supabase.from('marketing_ingestion_errors').insert({
      run_id: run.id,
      provider: 'coupang',
      error_code: 'local_collector_failed',
      message: failureMessage,
      details: { account: body.account },
    });
    return Response.json({ ok: true, reported: true });
  }

  const slugs = [...new Set(metrics.map((metric: CoupangMetric) => metric.product_slug))];
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
      provider: 'coupang',
      metric_date: body.metric_date,
      details: {
        trigger: body.trigger || 'local_windows_scheduler',
        account: body.account,
      },
    })
    .select('id')
    .single();
  if (runError || !run) {
    return Response.json({ error: runError?.message || '수집 실행 이력을 만들지 못했습니다.' }, { status: 500 });
  }

  let succeeded = 0;
  const errors: string[] = [];
  for (const metric of metrics as CoupangMetric[]) {
    const splitPatch = {
      coupang_wing_visits: metric.wing.visits,
      coupang_wing_orders: metric.wing.orders,
      coupang_wing_revenue: metric.wing.revenue,
      coupang_growth_visits: metric.growth.visits,
      coupang_growth_orders: metric.growth.orders,
      coupang_growth_revenue: metric.growth.revenue,
    };
    const { error: metricError } = await supabase.rpc('merge_daily_marketing_metric', {
      p_product_id: productIds.get(metric.product_slug),
      p_metric_date: body.metric_date,
      p_patch: {
        coupang_visits: metric.wing.visits + metric.growth.visits,
        coupang_orders: metric.wing.orders + metric.growth.orders,
        coupang_revenue: metric.wing.revenue + metric.growth.revenue,
        data_completeness: {
          coupang_wing_visits: true,
          coupang_wing_orders: true,
          coupang_wing_revenue: true,
          coupang_growth_visits: true,
          coupang_growth_orders: true,
          coupang_growth_revenue: true,
          coupang_visits: true,
          coupang_orders: true,
          coupang_revenue: true,
        },
      },
      p_source: 'api',
      p_source_details: {
        provider: 'coupang',
        collector: 'local_wing_browser_session',
        account: body.account,
        collected_at: new Date().toISOString(),
      },
      p_collection_status: 'partial',
    });
    if (metricError) {
      errors.push(`${metric.product_slug}: ${metricError.message}`);
      continue;
    }
    const { error: splitError } = await supabase.rpc('merge_daily_coupang_metrics', {
      p_product_id: productIds.get(metric.product_slug),
      p_metric_date: body.metric_date,
      p_patch: splitPatch,
    });
    if (splitError) errors.push(`${metric.product_slug}: ${splitError.message}`);
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
        account: body.account,
        errors,
      },
    })
    .eq('id', run.id);

  return Response.json({
    ok: failed === 0,
    metric_date: body.metric_date,
    account: body.account,
    succeeded,
    failed,
    errors,
  });
});
