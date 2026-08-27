import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_MALLS = new Set(['innerium', 'jgohdapt']);
const DASHBOARD_URL = 'https://jangs.ai.kr';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': DASHBOARD_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function dashboardRedirect(status: 'connected' | 'failed', mallId = '', message = '') {
  const url = new URL(DASHBOARD_URL);
  url.searchParams.set('cafe24', status);
  if (mallId) url.searchParams.set('mall_id', mallId);
  if (message) url.searchParams.set('message', message.slice(0, 120));
  return Response.redirect(url, 302);
}

function normalizeProductName(value: unknown) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

async function mapCafe24Products(serviceClient: any, mallId: string, accessToken: string) {
  const wanted = mallId === 'innerium'
    ? [
        { slug: 'innerium-gala431', terms: ['갈라431', 'gala431'] },
        { slug: 'innerium-minti431', terms: ['민티431', 'minti431'] },
      ]
    : [
        { slug: 'yural-tonggam-cream', terms: ['통감크림'] },
        { slug: 'yural-myeongga-bonhwan', terms: ['명가본환'] },
      ];
  const products: Record<string, unknown>[] = [];
  let offset = 0;
  while (offset <= 15_000) {
    const url = new URL(`https://${mallId}.cafe24api.com/api/v2/admin/products`);
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`상품 목록 조회 실패 (${response.status})`);
    const payload = await response.json();
    const page = Array.isArray(payload.products) ? payload.products : [];
    products.push(...page);
    if (page.length < 100) break;
    offset += 100;
  }

  let mapped = 0;
  for (const target of wanted) {
    const matches = products.filter(product => {
      const name = normalizeProductName(product.product_name);
      const excluded = /증정|사은품|이벤트/.test(name);
      return !excluded && target.terms.some(term => name.includes(term.toLowerCase()));
    });
    const productNos = matches.map(product => String(product.product_no || '')).filter(Boolean);
    if (!productNos.length) continue;
    const { data: dashboardProduct } = await serviceClient
      .from('marketing_products')
      .select('id')
      .eq('slug', target.slug)
      .maybeSingle();
    if (!dashboardProduct) continue;
    const { error } = await serviceClient
      .from('marketing_source_mappings')
      .update({
        external_id: productNos[0],
        config: { mall_id: mallId, product_no: productNos[0], product_nos: productNos },
        is_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('product_id', dashboardProduct.id)
      .eq('provider', 'cafe24');
    if (!error) mapped++;
  }
  return { mapped, expected: wanted.length };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const clientId = Deno.env.get('CAFE24_CLIENT_ID');
  const clientSecret = Deno.env.get('CAFE24_CLIENT_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: 'Supabase 환경변수가 없습니다.' }, 500);
  if (!clientId || !clientSecret) return json({ error: 'Cafe24 개발자 앱 인증값이 설정되지 않았습니다.' }, 503);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestUrl = new URL(request.url);
  const redirectUri = `${supabaseUrl}/functions/v1/cafe24-oauth/callback`;

  if (request.method === 'POST') {
    const authorization = request.headers.get('Authorization') || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    if (!accessToken) return json({ error: '로그인이 필요합니다.' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
    if (userError || !userData.user) return json({ error: '유효하지 않은 로그인입니다.' }, 401);

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role_id,approval_status')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profile?.role_id !== 'admin' || profile?.approval_status !== 'approved') {
      return json({ error: '관리자만 Cafe24를 연결할 수 있습니다.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const mallId = String(body.mall_id || '').trim().toLowerCase();
    if (!ALLOWED_MALLS.has(mallId)) return json({ error: '등록되지 않은 Cafe24 쇼핑몰입니다.' }, 400);

    if (body.action === 'list_products') {
      const { data: connection, error: connectionError } = await serviceClient.rpc(
        'get_cafe24_connection',
        { p_mall_id: mallId },
      );
      if (connectionError || !connection?.access_token) return json({ error: 'Cafe24 연결 정보가 없습니다.' }, 409);
      const products: Array<{ product_no: string; product_name: string }> = [];
      let offset = 0;
      while (offset <= 15_000) {
        const productsUrl = new URL(`https://${mallId}.cafe24api.com/api/v2/admin/products`);
        productsUrl.searchParams.set('limit', '100');
        productsUrl.searchParams.set('offset', String(offset));
        const response = await fetch(productsUrl, {
          headers: { Authorization: `Bearer ${connection.access_token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) return json({ error: `Cafe24 상품 조회 실패 (${response.status})` }, 502);
        const payload = await response.json();
        const page = Array.isArray(payload.products) ? payload.products : [];
        products.push(...page.map((product: Record<string, unknown>) => ({
          product_no: String(product.product_no || ''),
          product_name: String(product.product_name || '').replace(/<[^>]*>/g, ''),
        })));
        if (page.length < 100) break;
        offset += 100;
      }
      return json({ products });
    }

    if (body.action === 'remap_products') {
      const { data: connection, error: connectionError } = await serviceClient.rpc(
        'get_cafe24_connection',
        { p_mall_id: mallId },
      );
      if (connectionError || !connection?.access_token) return json({ error: 'Cafe24 연결 정보가 없습니다.' }, 409);
      try {
        return json(await mapCafe24Products(serviceClient, mallId, connection.access_token));
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : '상품 매핑 실패' }, 502);
      }
    }

    const state = crypto.randomUUID();
    const { error: stateError } = await serviceClient.from('marketing_oauth_states').insert({
      state,
      provider: 'cafe24',
      account_key: mallId,
      requested_by: userData.user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) return json({ error: '연결 요청을 생성하지 못했습니다.' }, 500);

    const authorizeUrl = new URL(`https://${mallId}.cafe24api.com/api/v2/oauth/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set(
      'scope',
      'mall.read_order mall.read_product mall.read_store mall.read_analytics mall.read_salesreport',
    );
    return json({ authorize_url: authorizeUrl.toString() });
  }

  if (request.method !== 'GET' || !requestUrl.pathname.endsWith('/callback')) {
    return json({ error: '지원하지 않는 요청입니다.' }, 405);
  }

  const code = requestUrl.searchParams.get('code') || '';
  const state = requestUrl.searchParams.get('state') || '';
  const oauthError = requestUrl.searchParams.get('error');
  if (oauthError || !code || !state) return dashboardRedirect('failed', '', oauthError || '인증 코드가 없습니다.');

  const { data: oauthState, error: stateError } = await serviceClient
    .from('marketing_oauth_states')
    .update({ used_at: new Date().toISOString() })
    .eq('state', state)
    .eq('provider', 'cafe24')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('account_key')
    .maybeSingle();
  if (stateError || !oauthState || !ALLOWED_MALLS.has(oauthState.account_key)) {
    return dashboardRedirect('failed', '', '연결 요청이 만료되었거나 이미 사용되었습니다.');
  }

  const mallId = oauthState.account_key;
  const tokenResponse = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token || !tokenPayload.refresh_token) {
    return dashboardRedirect('failed', mallId, `토큰 발급 실패 (${tokenResponse.status})`);
  }

  const { error: saveError } = await serviceClient.rpc('save_cafe24_connection', {
    p_mall_id: mallId,
    p_access_token: tokenPayload.access_token,
    p_refresh_token: tokenPayload.refresh_token,
    p_access_token_expires_at: tokenPayload.expires_at,
    p_refresh_token_expires_at: tokenPayload.refresh_token_expires_at,
    p_scopes: tokenPayload.scopes || [],
  });
  if (saveError) return dashboardRedirect('failed', mallId, '토큰을 안전하게 저장하지 못했습니다.');
  try {
    const mapping = await mapCafe24Products(serviceClient, mallId, tokenPayload.access_token);
    const message = mapping.mapped === mapping.expected
      ? `${mapping.mapped}개 상품 매핑 완료`
      : `${mapping.mapped}/${mapping.expected}개 상품 매핑됨`;
    return dashboardRedirect('connected', mallId, message);
  } catch (error) {
    const message = error instanceof Error ? error.message : '상품 매핑 확인 필요';
    return dashboardRedirect('connected', mallId, message);
  }
});
