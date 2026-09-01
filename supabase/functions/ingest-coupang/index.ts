import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ChannelMetric = {
  visits: number;
  orders: number;
  gross_sales: number;
  refund_amount: number;
  net_sales: number;
  shipping_fee: number;
  seller_discount: number;
  revenue: number;
};

type CoupangMetric = {
  product_slug: string;
  wing: ChannelMetric;
  growth: ChannelMetric;
};

const ACCOUNT_PRODUCTS = Object.freeze({
  innerium: Object.freeze(['innerium-gala431', 'innerium-minti431']),
  yural: Object.freeze(['yural-myeongga-bonhwan', 'yural-tonggam-cream']),
});

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validChannel(value: unknown): value is ChannelMetric {
  if (!value || typeof value !== 'object') return false;
  const channel = value as Record<string, unknown>;
  return Number.isSafeInteger(channel.visits) && Number(channel.visits) >= 0 &&
    Number.isSafeInteger(channel.orders) &&
    Number.isSafeInteger(channel.gross_sales) && Number(channel.gross_sales) >= 0 &&
    Number.isSafeInteger(channel.refund_amount) && Number(channel.refund_amount) >= 0 &&
    Number.isSafeInteger(channel.net_sales) &&
    Number(channel.net_sales) === Number(channel.gross_sales) - Number(channel.refund_amount) &&
    Number.isSafeInteger(channel.shipping_fee) && Number(channel.shipping_fee) >= 0 &&
    Number.isSafeInteger(channel.seller_discount) && Number(channel.seller_discount) >= 0 &&
    Number.isSafeInteger(channel.revenue) &&
    Number(channel.revenue) ===
      Number(channel.net_sales) + Number(channel.shipping_fee) - Number(channel.seller_discount);
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
  const expectedProducts = ACCOUNT_PRODUCTS[body.account as keyof typeof ACCOUNT_PRODUCTS];
  const submittedProducts = [...new Set(metrics.map((metric: CoupangMetric) => metric.product_slug))].sort();
  if (!validDate(body.metric_date) || !expectedProducts ||
    (isFailureReport
      ? !failureMessage
      : (
        metrics.length !== expectedProducts.length ||
        !metrics.every(validMetric) ||
        submittedProducts.join(',') !== [...expectedProducts].sort().join(',')
      ))) {
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
    const { error: metricError } = await supabase.rpc('merge_daily_coupang_snapshot', {
      p_product_id: productIds.get(metric.product_slug),
      p_metric_date: body.metric_date,
      p_patch: splitPatch,
      p_source: 'api',
      p_source_details: {
        provider: 'coupang',
        collector: 'local_wing_browser_session',
        account: body.account,
        collected_at: new Date().toISOString(),
        revenue_basis: 'net_sales_plus_shipping_minus_seller_discount',
        wing_breakdown: {
          gross_sales: metric.wing.gross_sales,
          refund_amount: metric.wing.refund_amount,
          net_sales: metric.wing.net_sales,
          shipping_fee: metric.wing.shipping_fee,
          seller_discount: metric.wing.seller_discount,
        },
        growth_breakdown: {
          gross_sales: metric.growth.gross_sales,
          refund_amount: metric.growth.refund_amount,
          net_sales: metric.growth.net_sales,
          shipping_fee: metric.growth.shipping_fee,
          seller_discount: metric.growth.seller_discount,
        },
      },
    });
    if (metricError) {
      errors.push(`${metric.product_slug}: ${metricError.message}`);
      continue;
    }
    succeeded++;
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
