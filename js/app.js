// ==========================================
// jangsAI - 프로그램 센터 (메인 앱)
// ==========================================

// --- Supabase 설정 ---
const SUPABASE_URL = 'https://pfmrqsfmkdnhzjimqocr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MTmIgPL7ilgjlb1tC92Mng_WExurSRL';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const EMAIL_DOMAIN = '@jangsai.local';
const OWNER_EMAIL = 'kher2000@jangsai.local';
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbw_kV92ocY27UZGbnSJHhmYDlRK6gzqJDU76HV2VJAvybtmmRihz1vDthCGlvLvAC0/exec';
const GROK_RUNBOOK_VERSION = 8;
const MARKETING_AUTO_REFRESH_MS = 60 * 1000;

// --- 등급별 색상 ---
const ROLE_COLORS = {
    admin:    { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)',  text: '#f87171' },
    employee: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)', text: '#60a5fa' },
    trainee:  { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', text: '#34d399' },
};
const DEFAULT_ROLE_COLOR = { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)', text: '#a78bfa' };

const CATEGORY_ICONS = {
    '일반':   'ri-apps-line',
    '업무':   'ri-briefcase-line',
    '교육':   'ri-book-open-line',
    '유틸':   'ri-tools-line',
    '개발':   'ri-code-s-slash-line',
    '보안':   'ri-shield-check-line',
    '데이터': 'ri-database-2-line',
};

const DEFAULT_MARKETING_PRODUCTS = [
    { id: 'gala431', brand: '이너리움', name: '갈라431', slug: 'innerium-gala431', sort_order: 1 },
    { id: 'minti431', brand: '이너리움', name: '민티431', slug: 'innerium-minti431', sort_order: 2 },
    { id: 'tonggam-cream', brand: '유랄', name: '통감크림', slug: 'yural-tonggam-cream', sort_order: 3 },
    { id: 'myeongga-bonhwan', brand: '유랄', name: '명가본환', slug: 'yural-myeongga-bonhwan', sort_order: 4 },
];

const PRODUCT_KEYWORDS = {
    'innerium-gala431': ['이너리움 갈라431', '갈라431', '이너리움'],
    'innerium-minti431': ['이너리움 민티431', '민티431', '이너리움'],
    'yural-tonggam-cream': ['유랄통감크림', '통감크림'],
    'yural-myeongga-bonhwan': ['유랄명가본환', '명가본환'],
};
const OVERVIEW_MAIN_KEYWORDS = {
    'innerium-gala431': '갈라431',
    'innerium-minti431': '민티431',
    'yural-tonggam-cream': '유랄통감크림',
    'yural-myeongga-bonhwan': '유랄명가본환',
};

const MARKETING_INDEX_RULES = {
    monthlyViewsTarget: 200000,
    trafficRateTarget: 10,
    conversionRateTarget: 10,
    warningBelow: 80,
    excellentAbove: 120,
};

const MARKETING_CHANNELS = [
    { id: 'cafe24', label: '자사몰', visits: 'cafe24_visits', legacyVisits: 'site_visits', orders: 'cafe24_orders', revenue: 'cafe24_revenue' },
    { id: 'smartstore', label: '스마트스토어', visits: 'smartstore_visits', orders: 'smartstore_orders', conversionOrders: 'smartstore_pay_count', revenue: 'smartstore_revenue' },
    { id: 'coupang', label: '쿠팡', visits: 'coupang_visits', orders: 'coupang_orders', revenue: 'coupang_revenue', combinedCoupang: true },
];

// --- 앱 상태 ---
const state = {
    user: null,
    profile: null,
    roles: [],
    programs: [],
    currentView: 'loading',
    authMode: 'login',
    registrationInProgress: false,
    signupSubmitted: false,
    codeSent: false,
    phoneValue: '',
    activeWebApp: null,
    adminTab: 'requests',
    adminUsers: [],
    adminRequests: [],
    adminPrograms: [],
    searchQuery: '',
    categoryFilter: 'all',
    marketingProducts: [],
    marketingMetrics: [],
    marketingBrandMetrics: [],
    marketingTargets: [],
    marketingRuns: [],
    marketingBatches: [],
    marketingSearchSnapshots: [],
    dailyKeywordMetrics: [],
    marketingBridgeJobs: [],
    marketingBridgeClients: [],
    selectedMarketingProduct: 'all',
    marketingPeriod: '7d',
    marketingView: 'overview',
    reportPeriod: '3d',
    customDateFrom: null,
    customDateTo: null,
    customReportDateFrom: null,
    customReportDateTo: null,
    marketingDataReady: true,
    marketingLastRefreshedAt: null,
    // 업무일지 & 통합보고
    workLogs: [],
    worklogSelectedPerson: null,
    worklogDateFrom: null,
    worklogDateTo: null,
    reportSelectedDate: null,
    reportMode: 'daily',
};
let marketingRefreshTimer = null;
let marketingRefreshInFlight = false;

const STAFF_ROSTER = [
    { key: 'wang-dahyun',   name: '왕다현 대리' },
    { key: 'lim-seyeon',    name: '임세연 대리' },
    { key: 'eun-minho',     name: '은민호 주임' },
    { key: 'kang-jaeyun',   name: '강재윤 주임' },
    { key: 'park-hayeon',   name: '박하연' },
    { key: 'lee-bora',      name: '이보라' },
    { key: 'lee-minwook',   name: '이민욱 주임' },
    { key: 'hong-yujin',    name: '홍유진 주임' },
    { key: 'lim-seoyun',    name: '임서윤 주임' },
    { key: 'lee-minjeong',  name: '이민정' },
];

// ==========================================
// 유틸리티 함수
// ==========================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

const REDACT_PATTERNS = [
    /(?:password|passwd|비밀번호|비번|pw)\s*[:=]\s*\S+/gi,
    /(?:login|id|아이디)\s*[:=]\s*\S+/gi,
    /[A-Z]:\\.+?(?=\s|$|[,;)])/g,
];

function redactSensitive(text) {
    if (!text) return '';
    let result = text;
    for (const pat of REDACT_PATTERNS) {
        result = result.replace(pat, '[삭제됨]');
    }
    return result;
}

function summarizeLine(text, maxLen = 60) {
    if (!text) return '';
    const first = text.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
    return first.length > maxLen ? first.slice(0, maxLen) + '…' : first;
}

const GLOBAL_EXCLUDE_PATTERNS = [
    /발행|조회수|노출\s*체크|공스덧|V2R|다포.*현황|기관총.*현황/i,
    /^\s*핫\s*\d+|^\s*재고\s*:?\s*\d+/i,
];

const STAFF_BRIEFING_RULES = {
    'wang-dahyun':  { include: /갈라|민티|입고|그로스|비용|광고비|결제|CS|반품|클레임|환불/i, inventoryAlerts: true },
    'lim-seyeon':   { include: /상페|3D|디자인|산출|마감|납품|자사몰|외주|소통.*이슈/i },
    'eun-minho':    { include: /브키|AI.*테스트|인수인계|교육/i },
    'kang-jaeyun':  { include: /바이럴|발행.*이상|발행.*장애|대량.*이슈|인수인계|교육/i },
    'park-hayeon':  { include: /설득.*원고|과제.*마감|권리\s*침해|신고.*이슈|인수인계|교육/i },
    'lee-bora':     { include: /비용|입금|세금\s*계산서|급여|인사.*서류|월\s*결산|고정비/i },
    'lee-minwook':  { include: /제휴\s*카페|계정.*이상|프리미엄|신규.*채널|다포.*장애|발행.*장애/i },
    'hong-yujin':   { include: /인수인계|교육/i },
    'lim-seoyun':   { include: /AI.*원고|AI.*의견|AI.*테스트/i },
    'lee-minjeong': { include: /인수인계|교육|잡무|뒤치다꺼리|서포트|support/i },
};

function isGlobalExcluded(line) {
    return GLOBAL_EXCLUDE_PATTERNS.some(p => p.test(line));
}

function isInventoryDump(line) {
    return /^\s*(핫|재고)\s*\d/.test(line);
}

function extractMatchingLines(text, personKey) {
    if (!text) return [];
    const rules = STAFF_BRIEFING_RULES[personKey];
    if (!rules) return [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const matched = [];
    for (const line of lines) {
        if (isGlobalExcluded(line)) continue;
        if (isInventoryDump(line) && !rules.inventoryAlerts) continue;
        if (rules.include.test(line)) {
            matched.push(line);
        }
    }
    return matched;
}

function generateBriefing(workLogs, staffRoster) {
    const total = staffRoster.length;
    const logMap = new Map();
    for (const log of workLogs) {
        logMap.set(log.person_key, log);
    }

    const written = staffRoster.filter(p => {
        const log = logMap.get(p.key);
        return log && (log.work.trim() || log.notes.trim() || log.pending.trim());
    });
    const missing = staffRoster.filter(p => !written.some(w => w.key === p.key));

    const statusLine = missing.length === 0
        ? `작성 ${written.length}/${total} · 전원 작성`
        : `작성 ${written.length}/${total} · 미작성: ${missing.map(p => p.name.replace(/ (대리|주임|사원|과장|부장|차장|팀장)$/, '')).join(', ')}`;

    const personLines = [];
    const alerts = [];

    for (const person of staffRoster) {
        const log = logMap.get(person.key);
        const shortName = person.name.replace(/ (대리|주임|사원|과장|부장|차장|팀장)$/, '');

        if (!log || !(log.work || '').trim()) continue;

        const allText = [log.work, log.notes, log.pending].filter(Boolean).join('\n');
        const redacted = redactSensitive(allText);
        const hits = extractMatchingLines(redacted, person.key);

        if (hits.length === 0) continue;

        const lines = hits.slice(0, 3).map(h => summarizeLine(h, 70));
        personLines.push({ name: shortName, lines, empty: false });

        const alertSources = [log.notes, log.pending].filter(Boolean).join('\n');
        const alertRedacted = redactSensitive(alertSources);
        const alertHits = extractMatchingLines(alertRedacted, person.key);
        for (const hit of alertHits) {
            if (alerts.length < 5) {
                alerts.push(`${shortName}: ${summarizeLine(hit, 70)}`);
            }
        }
    }

    return { statusLine, personLines, alerts };
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '접속 기록 없음';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '접속 기록 없음';
    return date.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getRoleColor(roleId) {
    return ROLE_COLORS[roleId] || DEFAULT_ROLE_COLOR;
}

function getRoleName(roleId) {
    const r = state.roles.find(r => r.id === roleId);
    return r ? r.name : roleId;
}

function roleBadgeHtml(roleId) {
    const c = getRoleColor(roleId);
    return `<span class="role-badge" style="background:${c.bg};border-color:${c.border};color:${c.text}">${escapeHtml(getRoleName(roleId))}</span>`;
}

// --- 토스트 알림 ---
function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const icons = { success: 'ri-check-line', error: 'ri-error-warning-line', warning: 'ri-alert-line', info: 'ri-information-line' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="toast-icon ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 350); }, 3500);
}

// --- 모달 ---
function showModal(html) {
    $('#modal-content').innerHTML = html;
    $('#modal-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function hideModal() {
    $('#modal-overlay').classList.add('hidden');
    document.body.style.overflow = '';
}

// --- 로딩 ---
function hideLoadingScreen() {
    const ls = $('#loading-screen');
    if (ls) { ls.classList.add('fade-out'); setTimeout(() => ls.remove(), 600); }
}

// ==========================================
// 인증 (Auth)
// ==========================================

async function login(username, password) {
    const email = username.includes('@') ? username : username + EMAIL_DOMAIN;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? '아이디 또는 비밀번호가 올바르지 않습니다' : error.message);
    return data;
}

async function register(username, password, displayName) {
    const email = username + EMAIL_DOMAIN;
    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username, display_name: displayName || username, approval_status: 'pending' } }
    });
    if (error) {
        if (error.message.includes('already registered')) throw new Error('이미 존재하는 아이디입니다');
        throw new Error(error.message);
    }
    return data;
}

async function logout() {
    try {
        await sb.auth.signOut();
    } catch (e) {
        console.error(e);
    }
    state.user = null;
    state.profile = null;
    state.codeSent = false;
    state.phoneValue = '';
    navigate('auth');
    showToast('로그아웃 되었습니다', 'info');
}

async function recordCurrentUserAccess() {
    if (!state.user || !state.profile || !isProfileApproved(state.profile)) return;
    const { data, error } = await sb.rpc('touch_current_user_last_seen');
    if (error) {
        console.warn('마지막 접속 기록 실패:', error);
        return;
    }
    state.profile.last_seen_at = data;
}

let lastSeenHeartbeatTimer = null;

function startLastSeenHeartbeat() {
    stopLastSeenHeartbeat();
    recordCurrentUserAccess();
    lastSeenHeartbeatTimer = setInterval(() => {
        if (!document.hidden) recordCurrentUserAccess();
    }, 60_000);
}

function stopLastSeenHeartbeat() {
    if (lastSeenHeartbeatTimer) {
        clearInterval(lastSeenHeartbeatTimer);
        lastSeenHeartbeatTimer = null;
    }
}

async function loadProfile() {
    if (!state.user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
    if (error) {
        console.error('프로필 로드 실패:', error);
        if (!isOwnerUser()) return null;
        state.profile = createOwnerProfile();
        await recordCurrentUserAccess();
        return state.profile;
    }
    state.profile = isOwnerUser() ? { ...data, role_id: 'admin', approval_status: 'approved' } : data;
    await recordCurrentUserAccess();
    return state.profile;
}

function isOwnerUser(user = state.user) {
    return user?.email?.toLowerCase() === OWNER_EMAIL;
}

function createOwnerProfile() {
    return {
        id: state.user?.id,
        username: 'kher2000',
        display_name: state.user?.user_metadata?.display_name || '최고 관리자',
        role_id: 'admin',
        approval_status: 'approved',
        created_at: state.user?.created_at,
    };
}

function getApprovalStatus(profile) {
    return profile?.approval_status || 'approved';
}

function isProfileApproved(profile) {
    return isOwnerUser() || getApprovalStatus(profile) === 'approved';
}

function isInternalUser() {
    return ['admin', 'employee'].includes(state.profile?.role_id);
}

// ==========================================
// 데이터 로드
// ==========================================

async function loadRoles() {
    const { data, error } = await sb.from('roles').select('*').order('level', { ascending: false });
    if (error) { console.error('등급 로드 실패:', error); return; }
    state.roles = data || [];
}

async function loadPrograms() {
    const { data, error } = await sb.from('programs').select('*, program_roles(role_id)').order('created_at', { ascending: false });
    if (error) { console.error('프로그램 로드 실패:', error); return; }
    state.programs = (data || []).map(p => ({
        ...p,
        allowedRoles: (p.program_roles || []).map(pr => pr.role_id)
    }));
}

async function loadPagedMarketingRows(queryFactory, pageSize = 1000, maxRows = 10000) {
    const rows = [];
    for (let offset = 0; offset < maxRows; offset += pageSize) {
        const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if ((data || []).length < pageSize) return { data: rows, error: null };
    }
    return { data: null, error: new Error(`마케팅 데이터가 ${maxRows.toLocaleString('ko-KR')}건을 초과했습니다.`) };
}

async function loadWorkLogs(personKey, dateFrom, dateTo) {
    let query = sb.from('work_logs').select('*');
    if (personKey) query = query.eq('person_key', personKey);
    if (dateFrom) query = query.gte('log_date', dateFrom);
    if (dateTo) query = query.lte('log_date', dateTo);
    query = query.order('log_date', { ascending: false }).limit(200);
    const { data, error } = await query;
    if (error) { showToast('업무일지 로드 실패: ' + error.message, 'error'); return []; }
    return data || [];
}

async function loadMarketingData() {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 370);
    const dateFrom = startDate.toISOString().slice(0, 10);

    const [
        { data: products, error: productError },
        { data: metrics, error: metricError },
        { data: brandMetrics, error: brandMetricError },
        { data: targets, error: targetError },
        { data: runs, error: runError },
        { data: batches, error: batchError },
        { data: searchSnapshots, error: searchSnapshotError },
        { data: keywordMetrics, error: keywordMetricError },
        { data: bridgeJobs, error: bridgeJobError },
        { data: bridgeClients, error: bridgeClientError },
    ] = await Promise.all([
        sb.from('marketing_products').select('*').eq('is_active', true).order('sort_order'),
        loadPagedMarketingRows(() =>
            sb.from('daily_marketing_metrics').select('*').gte('metric_date', dateFrom)
                .order('metric_date').order('product_id')
        ),
        loadPagedMarketingRows(() =>
            sb.from('daily_brand_marketing_metrics').select('*').gte('metric_date', dateFrom)
                .order('metric_date').order('brand')
        ),
        sb.from('marketing_targets').select('*').order('period_start', { ascending: false }),
        sb.from('marketing_ingestion_runs').select('*').order('started_at', { ascending: false }).limit(30),
        sb.from('marketing_ingestion_batches').select('*').order('started_at', { ascending: false }).limit(10),
        loadPagedMarketingRows(() =>
            sb.from('keyword_search_snapshots').select('*').gte('snapshot_date', dateFrom)
                .order('snapshot_date').order('product_id').order('keyword')
        ),
        loadPagedMarketingRows(() =>
            sb.from('daily_keyword_metrics').select('*').gte('metric_date', dateFrom)
                .order('metric_date').order('product_id').order('keyword')
        ),
        sb.from('marketing_bridge_jobs').select('*').gte('metric_date', dateFrom).order('updated_at', { ascending: false }).limit(100),
        sb.from('marketing_bridge_clients').select('*').order('updated_at', { ascending: false }),
    ]);

    if (productError || metricError) {
        console.warn('마케팅 데이터 테이블 준비 전:', productError || metricError);
        state.marketingProducts = DEFAULT_MARKETING_PRODUCTS;
        state.marketingMetrics = [];
        state.marketingDataReady = false;
        return;
    }

    state.marketingProducts = products?.length ? products : DEFAULT_MARKETING_PRODUCTS;
    state.marketingMetrics = metrics || [];
    state.marketingBrandMetrics = brandMetricError ? [] : (brandMetrics || []);
    state.marketingTargets = targetError ? [] : (targets || []);
    state.marketingRuns = runError ? [] : (runs || []);
    state.marketingBatches = batchError ? [] : (batches || []);
    state.marketingSearchSnapshots = searchSnapshotError ? [] : (searchSnapshots || []);
    state.dailyKeywordMetrics = keywordMetricError ? [] : (keywordMetrics || []);
    state.marketingBridgeJobs = bridgeJobError ? [] : (bridgeJobs || []);
    state.marketingBridgeClients = bridgeClientError ? [] : (bridgeClients || []);
    state.marketingDataReady = true;
    state.marketingLastRefreshedAt = new Date().toISOString();
}

async function refreshMarketingDashboard() {
    if (
        marketingRefreshInFlight ||
        document.hidden ||
        state.currentView !== 'dashboard' ||
        !isInternalUser()
    ) return;
    marketingRefreshInFlight = true;
    try {
        await loadMarketingData();
        if (state.currentView === 'dashboard') renderApp();
    } catch (error) {
        console.warn('마케팅 대시보드 자동 갱신 실패:', error);
    } finally {
        marketingRefreshInFlight = false;
    }
}

function startMarketingAutoRefresh() {
    if (marketingRefreshTimer) clearInterval(marketingRefreshTimer);
    marketingRefreshTimer = setInterval(refreshMarketingDashboard, MARKETING_AUTO_REFRESH_MS);
}

function stopMarketingAutoRefresh() {
    if (!marketingRefreshTimer) return;
    clearInterval(marketingRefreshTimer);
    marketingRefreshTimer = null;
}

let profilesRealtimeChannel = null;

async function loadAdminUsers() {
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { console.error('사용자 로드 실패:', error); return; }
    const profiles = data || [];
    state.adminUsers = profiles.filter(profile => isProfileApproved(profile));
    state.adminRequests = profiles.filter(profile => ['pending', 'rejected'].includes(getApprovalStatus(profile)));
}

function subscribeProfilesRealtime() {
    unsubscribeProfilesRealtime();
    profilesRealtimeChannel = sb
        .channel('profiles-admin')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, payload => {
            const updated = payload.new;
            if (!updated?.id) return;
            const idx = state.adminUsers.findIndex(u => u.id === updated.id);
            if (idx !== -1) {
                state.adminUsers[idx] = { ...state.adminUsers[idx], ...updated };
                if (state.currentView === 'admin' && state.adminTab === 'users') {
                    const row = document.getElementById(`user-row-${updated.id}`);
                    if (row) {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 4) {
                            cells[3].textContent = formatDateTime(updated.last_seen_at);
                        }
                    }
                }
            }
        })
        .subscribe();
}

function unsubscribeProfilesRealtime() {
    if (profilesRealtimeChannel) {
        sb.removeChannel(profilesRealtimeChannel);
        profilesRealtimeChannel = null;
    }
}

async function loadAdminPrograms() {
    const { data, error } = await sb.from('programs').select('*, program_roles(role_id)').order('created_at', { ascending: false });
    if (error) { console.error('프로그램 로드 실패:', error); return; }
    state.adminPrograms = (data || []).map(p => ({
        ...p,
        allowedRoles: (p.program_roles || []).map(pr => pr.role_id)
    }));
}

// ==========================================
// 관리자 액션
// ==========================================

async function changeUserRole(userId, newRoleId) {
    if (newRoleId !== 'admin') {
        const adminCount = state.adminUsers.filter(u => u.role_id === 'admin').length;
        const target = state.adminUsers.find(u => u.id === userId);
        if (target?.role_id === 'admin' && adminCount <= 1) {
            throw new Error('마지막 관리자는 등급을 변경할 수 없습니다');
        }
    }
    const { error } = await sb.from('profiles').update({ role_id: newRoleId }).eq('id', userId);
    if (error) throw new Error('등급 변경 실패: ' + error.message);
}

async function reviewSignupRequest(userId, status, roleId = null) {
    const updates = {
        approval_status: status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: state.user.id,
    };
    if (status === 'approved' && roleId) updates.role_id = roleId;

    const { error } = await sb.from('profiles').update(updates).eq('id', userId);
    if (error) throw new Error(`${status === 'approved' ? '승인' : '거절'} 처리 실패: ${error.message}`);
}

async function deleteUser(userId) {
    const { error } = await sb.from('profiles').delete().eq('id', userId);
    if (error) throw new Error('사용자 삭제 실패: ' + error.message);
}

async function addRole(id, name, level, isDefault) {
    if (isDefault) {
        await sb.from('roles').update({ is_default: false }).eq('is_default', true);
    }
    const { error } = await sb.from('roles').insert({ id, name, level, is_default: isDefault });
    if (error) throw new Error('등급 추가 실패: ' + error.message);
}

async function updateRole(id, updates) {
    if (updates.is_default) {
        await sb.from('roles').update({ is_default: false }).eq('is_default', true);
    }
    const { error } = await sb.from('roles').update(updates).eq('id', id);
    if (error) throw new Error('등급 수정 실패: ' + error.message);
}

async function deleteRole(id) {
    if (id === 'admin') { showToast('관리자 등급은 삭제할 수 없습니다', 'error'); return; }
    const { error } = await sb.from('roles').delete().eq('id', id);
    if (error) throw new Error('등급 삭제 실패: ' + error.message);
}

async function uploadProgram(file, name, description, version, category, roleIds) {
    // 1. 파일 업로드
    const filePath = `${Date.now()}_${file.name}`;
    const { error: uploadErr } = await sb.storage.from('programs').upload(filePath, file);
    if (uploadErr) throw new Error('파일 업로드 실패: ' + uploadErr.message);

    // 2. 프로그램 정보 저장
    const { data: program, error: insertErr } = await sb.from('programs').insert({
        name, description, file_path: filePath, file_size: file.size,
        original_name: file.name, version: version || '1.0',
        category: category || '일반',
        icon: CATEGORY_ICONS[category] || 'ri-file-download-line'
    }).select().single();
    if (insertErr) throw new Error('프로그램 정보 저장 실패: ' + insertErr.message);

    // 3. 등급 매핑
    if (roleIds && roleIds.length > 0) {
        const mappings = roleIds.map(rid => ({ program_id: program.id, role_id: rid }));
        const { error: mapErr } = await sb.from('program_roles').insert(mappings);
        if (mapErr) throw new Error('등급 매핑 실패: ' + mapErr.message);
    }
    return program;
}

async function updateProgram(id, updates) {
    const { error } = await sb.from('programs').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error('프로그램 수정 실패: ' + error.message);
}

async function updateProgramRoles(programId, roleIds) {
    // 기존 매핑 삭제 후 새로 추가
    await sb.from('program_roles').delete().eq('program_id', programId);
    if (roleIds.length > 0) {
        const mappings = roleIds.map(rid => ({ program_id: programId, role_id: rid }));
        const { error } = await sb.from('program_roles').insert(mappings);
        if (error) throw new Error('등급 매핑 업데이트 실패: ' + error.message);
    }
}

async function deleteProgram(id) {
    const program = state.adminPrograms.find(p => p.id === id);
    if (program) {
        await sb.storage.from('programs').remove([program.file_path]);
    }
    const { error } = await sb.from('programs').delete().eq('id', id);
    if (error) throw new Error('프로그램 삭제 실패: ' + error.message);
}

async function downloadProgram(program) {
    try {
        const { data, error } = await sb.storage.from('programs').download(program.file_path);
        if (error) throw error;

        // 다운로드 수 증가
        await sb.rpc('increment_download_count', { p_id: program.id });

        // 파일 다운로드 트리거
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = program.original_name || program.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`${program.name} 다운로드 완료!`, 'success');
    } catch (err) {
        showToast('다운로드 실패: ' + err.message, 'error');
    }
}

// ==========================================
// 뷰 렌더링 - 인증 (휴대전화 인증 스타일)
// ==========================================

function renderAuthView() {
    const isSignup = state.authMode === 'signup';
    return `
    <div class="auth-container">
        <div class="auth-card">
            <div class="auth-header">
                <div class="auth-logo">jangs<span>AI</span></div>
                <p class="auth-subtitle">장진환 개발중</p>
            </div>
            <div class="auth-tabs">
                <button type="button" class="auth-tab ${!isSignup ? 'active' : ''}" onclick="switchAuthMode('login')" id="auth-tab-login">로그인</button>
                <button type="button" class="auth-tab ${isSignup ? 'active' : ''}" onclick="switchAuthMode('signup')" id="auth-tab-signup">회원가입</button>
            </div>
            ${isSignup ? renderSignupForm() : renderLoginForm()}
        </div>
    </div>`;
}

function renderLoginForm() {
    return `
            <form class="auth-form" onsubmit="handleAuthSubmit(event)" id="auth-form">
                <div class="form-group">
                    <label class="form-label" for="phone">휴대전화</label>
                    <div class="phone-row">
                        <input class="form-input phone-input" type="tel" id="phone" placeholder="휴대전화 번호 입력" required autocomplete="tel" value="${state.phoneValue}">
                        <button type="button" class="btn-send-code ${state.codeSent ? 'sent' : ''}" onclick="handleSendCode()" id="send-code-btn">
                            ${state.codeSent ? '발송완료' : '인증번호 받기'}
                        </button>
                    </div>
                </div>
                <div class="form-group">
                    <input class="form-input code-input ${state.codeSent ? 'active' : ''}" type="password" id="verify-code" placeholder="인증번호 입력하세요" ${state.codeSent ? '' : 'disabled'} required autocomplete="current-password">
                </div>
                ${state.codeSent ? `
                <div class="code-sent-msg">
                    <i class="ri-checkbox-circle-line"></i>
                    인증번호를 발송했습니다. (유효시간 30분)<br>
                    <span>인증번호가 오지 않으면 입력하신 정보가 정확한지 확인하여 주세요.</span>
                </div>` : ''}
                <button type="submit" class="btn-login ${state.codeSent ? '' : 'disabled'}" id="auth-submit-btn" ${state.codeSent ? '' : 'disabled'}>
                    로그인
                </button>
            </form>`;
}

function renderSignupForm() {
    if (state.signupSubmitted) {
        return `
            <div class="auth-form signup-complete">
                <div class="signup-complete-icon"><i class="ri-time-line"></i></div>
                <h3>가입 요청이 접수되었습니다</h3>
                <p>관리자 승인 후 로그인할 수 있습니다.<br>승인이 완료되면 등록한 아이디로 로그인해주세요.</p>
                <button type="button" class="btn btn-primary btn-block" onclick="switchAuthMode('login')">
                    로그인 화면으로
                </button>
            </div>`;
    }

    return `
            <form class="auth-form" onsubmit="handleRegisterSubmit(event)" id="signup-form">
                <div class="form-group">
                    <label class="form-label" for="signup-username">아이디 (휴대전화)</label>
                    <input class="form-input" type="tel" id="signup-username" placeholder="휴대전화 번호 입력" required autocomplete="username" value="${state.phoneValue}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="signup-name">이름</label>
                    <input class="form-input" type="text" id="signup-name" placeholder="이름 입력" required autocomplete="name">
                </div>
                <div class="form-group">
                    <label class="form-label" for="signup-password">비밀번호</label>
                    <input class="form-input" type="password" id="signup-password" placeholder="비밀번호 (6자 이상)" required minlength="6" autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label class="form-label" for="signup-password2">비밀번호 확인</label>
                    <input class="form-input" type="password" id="signup-password2" placeholder="비밀번호 다시 입력" required minlength="6" autocomplete="new-password">
                </div>
                <button type="submit" class="btn-login" id="signup-submit-btn">
                    가입 승인 요청
                </button>
                <p class="signup-notice"><i class="ri-shield-check-line"></i> 관리자가 요청을 확인하고 승인한 뒤 이용할 수 있습니다.</p>
            </form>`;
}

function switchAuthMode(mode) {
    if (state.authMode === mode) return;
    state.authMode = mode;
    state.codeSent = false;
    if (mode === 'signup') state.signupSubmitted = false;
    renderApp();
}

function handleSendCode() {
    const phone = $('#phone');
    if (!phone || !phone.value.trim()) {
        showToast('아이디를 입력해주세요', 'warning');
        phone?.focus();
        return;
    }
    const phoneVal = phone.value.trim().replace(/-/g, '');
    if (phoneVal.length < 3) {
        showToast('아이디를 정확히 입력해주세요', 'warning');
        return;
    }
    state.phoneValue = phone.value;
    state.codeSent = true;
    renderApp();
    // 인증번호 입력칸에 포커스
    setTimeout(() => { $('#verify-code')?.focus(); }, 100);
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    if (!state.codeSent) return;
    const btn = $('#auth-submit-btn');
    const origText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
        const phone = $('#phone').value.trim().replace(/-/g, '');
        const code = $('#verify-code').value.trim();

        if (!phone || !code) {
            showToast('전화번호와 인증번호를 입력해주세요', 'warning');
            return;
        }

        await login(phone, code);

        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            state.user = session.user;
            await loadProfile();
            if (!state.profile || !isProfileApproved(state.profile)) {
                const status = getApprovalStatus(state.profile);
                await sb.auth.signOut();
                state.user = null;
                state.profile = null;
                if (status === 'rejected') {
                    throw new Error('가입 요청이 승인되지 않았습니다. 관리자에게 문의해주세요.');
                }
                throw new Error('관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.');
            }
            await loadRoles();
            state.codeSent = false;
            await navigate('dashboard');
            showToast('로그인 성공!', 'success');
        }
    } catch (err) {
        const knownMessage = err.message?.includes('승인') ? err.message : '인증번호가 올바르지 않습니다. 다시 확인해주세요.';
        showToast(knownMessage, err.message?.includes('대기') ? 'warning' : 'error');
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}

async function handleRegisterSubmit(e) {
    e.preventDefault();

    const username = $('#signup-username').value.trim().replace(/-/g, '');
    const displayName = $('#signup-name').value.trim();
    const password = $('#signup-password').value;
    const password2 = $('#signup-password2').value;

    if (!username || !displayName || !password) {
        showToast('모든 항목을 입력해주세요', 'warning');
        return;
    }
    if (username.length < 3) {
        showToast('아이디를 정확히 입력해주세요', 'warning');
        return;
    }
    if (password.length < 6) {
        showToast('비밀번호는 6자 이상이어야 합니다', 'warning');
        return;
    }
    if (password !== password2) {
        showToast('비밀번호가 일치하지 않습니다', 'warning');
        return;
    }

    const btn = $('#signup-submit-btn');
    const origText = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
        state.registrationInProgress = true;
        const data = await register(username, password, displayName);

        // 이메일 확인이 비활성화된 프로젝트에서도 승인 전 세션을 유지하지 않는다.
        if (data?.session) await sb.auth.signOut();
        state.user = null;
        state.profile = null;
        state.phoneValue = username;
        state.codeSent = false;
        state.signupSubmitted = true;
        showToast('가입 요청이 접수되었습니다', 'success');
        renderApp();
    } catch (err) {
        showToast(err.message || '회원가입에 실패했습니다', 'error');
    } finally {
        state.registrationInProgress = false;
        btn.textContent = origText;
        btn.disabled = false;
    }
}

// ==========================================
// 뷰 렌더링 - 네비게이션 바
// ==========================================

function renderNavbar() {
    const isAdmin = state.profile?.role_id === 'admin';
    const isInternal = isInternalUser();
    const initial = (state.profile?.display_name || state.profile?.username || '?')[0].toUpperCase();
    return `
    <nav class="navbar">
        <div class="navbar-brand" onclick="navigate('dashboard')">jangs<span>AI</span></div>
        <div class="navbar-right">
            ${isInternal ? `
            <button class="btn btn-sm ${state.currentView === 'dashboard' ? 'btn-primary' : 'btn-secondary'}" onclick="navigate('dashboard')" id="nav-marketing-btn">
                <i class="ri-line-chart-line"></i> 마케팅 지표
            </button>
            <button class="btn btn-sm ${state.currentView === 'programs' ? 'btn-primary' : 'btn-secondary'}" onclick="navigate('programs')" id="nav-programs-btn">
                <i class="ri-apps-line"></i> 프로그램
            </button>` : ''}
            ${isAdmin ? `
            <button class="btn btn-sm ${state.currentView === 'worklog' ? 'btn-primary' : 'btn-secondary'}" onclick="navigate('worklog')" id="nav-worklog-btn">
                <i class="ri-file-list-3-line"></i> 업무일지
            </button>
            <button class="btn btn-sm ${state.currentView === 'report' ? 'btn-primary' : 'btn-secondary'}" onclick="navigate('report')" id="nav-report-btn">
                <i class="ri-bar-chart-grouped-line"></i> 통합보고
            </button>
            <button class="btn btn-sm ${state.currentView === 'admin' ? 'btn-primary' : 'btn-secondary'}" onclick="navigate('admin')" id="nav-admin-btn">
                <i class="ri-settings-3-line"></i> 관리자
            </button>` : ''}
            <div class="navbar-user">
                <div class="navbar-avatar">${escapeHtml(initial)}</div>
                <span class="navbar-username">${escapeHtml(state.profile?.display_name || state.profile?.username || '')}</span>
                ${roleBadgeHtml(state.profile?.role_id || '')}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="logout()" id="logout-btn" title="로그아웃">
                <i class="ri-logout-box-r-line"></i>
            </button>
        </div>
    </nav>`;
}

// ==========================================
// 뷰 렌더링 - 회사 내부 마케팅 대시보드
// ==========================================

function metricNumber(value) {
    return Number(value) || 0;
}

function nullableMetricNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatMetric(value) {
    return new Intl.NumberFormat('ko-KR').format(Math.round(metricNumber(value)));
}

function formatWon(value) {
    return `${new Intl.NumberFormat('ko-KR').format(Math.round(metricNumber(value)))}원`;
}

function hasCompleteCoupangSplit(metric, suffix) {
    const wingKey = `coupang_wing_${suffix}`;
    const growthKey = `coupang_growth_${suffix}`;
    return nullableMetricNumber(metric?.[wingKey]) !== null &&
        nullableMetricNumber(metric?.[growthKey]) !== null &&
        hasCollectedMetric(metric, wingKey) &&
        hasCollectedMetric(metric, growthKey);
}

function getCoupangMetric(metric, suffix) {
    const wingKey = `coupang_wing_${suffix}`;
    const growthKey = `coupang_growth_${suffix}`;
    return hasCompleteCoupangSplit(metric, suffix)
        ? metricNumber(metric?.[wingKey]) + metricNumber(metric?.[growthKey])
        : metricNumber(metric?.[`coupang_${suffix}`]);
}

function getMetricSales(metric) {
    return metricNumber(metric?.cafe24_orders) + getCoupangMetric(metric, 'orders') + metricNumber(metric?.smartstore_orders);
}

function getMetricRevenue(metric) {
    const channelRevenue = metricNumber(metric?.cafe24_revenue) + getCoupangMetric(metric, 'revenue') + metricNumber(metric?.smartstore_revenue);
    if (isRevenueComplete(metric)) return channelRevenue;
    return hasCollectedMetric(metric, 'reported_total_revenue')
        ? metricNumber(metric?.reported_total_revenue)
        : channelRevenue;
}

function getMetricExposure(metric) {
    const blogViews = nullableMetricNumber(metric?.blog_views);
    const cafeViews = nullableMetricNumber(metric?.cafe_views);
    if (blogViews !== null || cafeViews !== null) return metricNumber(blogViews) + metricNumber(cafeViews);
    return metricNumber(metric?.content_views);
}

function getChannelVisits(metric, channel) {
    if (channel.combinedCoupang) {
        const value = getCoupangMetric(metric, 'visits');
        return hasCollectedCoupangMetric(metric, 'visits') ? value : null;
    }
    const value = nullableMetricNumber(metric?.[channel.visits]);
    if (value !== null && hasCollectedMetric(metric, channel.visits)) return value;
    if (channel.legacyVisits && metricNumber(metric?.[channel.legacyVisits]) > 0) return metricNumber(metric[channel.legacyVisits]);
    return null;
}

function hasCollectedMetric(metric, key) {
    if (Object.prototype.hasOwnProperty.call(metric?.data_completeness || {}, key)) {
        return metric.data_completeness[key] === true;
    }
    return metricNumber(metric?.[key]) > 0;
}

function hasCollectedCoupangMetric(metric, suffix) {
    return hasCompleteCoupangSplit(metric, suffix) ||
        hasCollectedMetric(metric, `coupang_${suffix}`);
}

function isSalesComplete(metric) {
    return Boolean(metric) &&
        hasCollectedMetric(metric, 'cafe24_orders') &&
        hasCollectedMetric(metric, 'smartstore_orders') &&
        hasCollectedCoupangMetric(metric, 'orders');
}

function isRevenueComplete(metric) {
    return Boolean(metric) &&
        hasCollectedMetric(metric, 'cafe24_revenue') &&
        hasCollectedMetric(metric, 'smartstore_revenue') &&
        hasCollectedCoupangMetric(metric, 'revenue');
}

function isExposureComplete(metric) {
    return Boolean(metric) &&
        hasCollectedMetric(metric, 'blog_views') &&
        hasCollectedMetric(metric, 'cafe_views');
}

function areMetricsCollected(metrics, key) {
    return metrics.length > 0 && metrics.every(metric => hasCollectedMetric(metric, key));
}

function isChannelPairMeasured(metric, channel) {
    if (channel.combinedCoupang) {
        return getChannelVisits(metric, channel) !== null &&
            hasCollectedCoupangMetric(metric, 'orders');
    }
    const conversionOrders = channel.conversionOrders || channel.orders;
    return getChannelVisits(metric, channel) !== null && hasCollectedMetric(metric, conversionOrders);
}

function getChannelOrders(metric, channel) {
    if (channel.combinedCoupang) return getCoupangMetric(metric, 'orders');
    const conversionOrders = channel.conversionOrders || channel.orders;
    return metricNumber(metric?.[conversionOrders]);
}

function getCafe24StoreVisits(product, metricDate) {
    const metric = state.marketingBrandMetrics.find(item =>
        item.brand === product?.brand && item.metric_date === metricDate
    );
    return metric?.cafe24_visits === null || metric?.cafe24_visits === undefined
        ? null
        : metricNumber(metric.cafe24_visits);
}

function getChannelConversionMeasurement(metric, channelId) {
    if (!metric) return null;
    const channel = MARKETING_CHANNELS.find(item => item.id === channelId);
    if (!channel) return null;
    const cafe24ProductViews = channelId === 'cafe24' &&
        hasCollectedMetric(metric, 'cafe24_product_views')
        ? metricNumber(metric.cafe24_product_views)
        : null;
    if (
        channelId === 'cafe24'
            ? cafe24ProductViews === null ||
                !(
                    hasCollectedMetric(metric, 'cafe24_purchase_count') ||
                    hasCollectedMetric(metric, 'cafe24_orders')
                )
            : !isChannelPairMeasured(metric, channel)
    ) return null;
    const visits = channelId === 'cafe24'
        ? cafe24ProductViews
        : getChannelVisits(metric, channel);
    const cafe24Official = channelId === 'cafe24' &&
        hasCollectedMetric(metric, 'cafe24_purchase_count');
    const purchases = cafe24Official
        ? metricNumber(metric.cafe24_purchase_count)
        : getChannelOrders(metric, channel);
    if (visits === null || visits < 0 || purchases < 0) return null;
    const calculatedRate = visits > 0 ? percent(purchases, visits) : (purchases === 0 ? 0 : null);
    const officialRateKey = channelId === 'smartstore'
        ? 'smartstore_conversion_rate'
        : channelId === 'cafe24'
            ? 'cafe24_conversion_rate'
            : channelId === 'coupang'
                ? 'coupang_conversion_rate'
                : null;
    const officialRate = officialRateKey && hasCollectedMetric(metric, officialRateKey)
        ? nullableMetricNumber(metric[officialRateKey])
        : null;
    return {
        visits,
        purchases,
        rate: officialRate === null ? calculatedRate : officialRate,
        basis: channelId === 'smartstore'
            ? '스마트스토어 공식 구매전환율'
            : channelId === 'cafe24'
                ? cafe24Official
                    ? 'Cafe24 공식 상품조회·판매건 기준'
                    : 'Cafe24 상품조회·판매수량 기준'
                : officialRate === null
                    ? '쿠팡 공식 방문자·판매량 기준'
                    : '쿠팡 공식 구매전환율',
    };
}

function getWeightedChannelConversion(metrics, channelId) {
    const measurements = metrics
        .map(metric => getChannelConversionMeasurement(metric, channelId))
        .filter(Boolean);
    if (!measurements.length) return null;
    const visits = measurements.reduce((sum, item) => sum + item.visits, 0);
    const purchases = measurements.reduce((sum, item) => sum + item.purchases, 0);
    const weightedRate = visits > 0
        ? measurements.reduce((sum, item) => sum + item.rate * item.visits, 0) / visits
        : (purchases === 0 ? 0 : null);
    return {
        visits,
        purchases,
        rate: measurements.length === 1
            ? measurements[0].rate
            : weightedRate,
        measuredRows: measurements.length,
    };
}

function shiftMetricDate(date, offsetDays) {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offsetDays);
    return value.toISOString().slice(0, 10);
}

function getProductMetricOnDate(productId, metricDate) {
    return state.marketingMetrics.find(metric =>
        metric.product_id === productId && metric.metric_date === metricDate
    ) || null;
}

function getChannelConversionSummary(productIds, channelId, metricDate, days = 7) {
    const ids = productIds instanceof Set ? productIds : new Set(productIds);
    const fromDate = shiftMetricDate(metricDate, -(days - 1));
    const currentMetrics = state.marketingMetrics.filter(metric =>
        ids.has(metric.product_id) && metric.metric_date === metricDate
    );
    const previousDate = shiftMetricDate(metricDate, -1);
    const previousMetrics = state.marketingMetrics.filter(metric =>
        ids.has(metric.product_id) && metric.metric_date === previousDate
    );
    const windowMetrics = state.marketingMetrics.filter(metric =>
        ids.has(metric.product_id) &&
        metric.metric_date >= fromDate &&
        metric.metric_date <= metricDate
    );
    return {
        current: getWeightedChannelConversion(currentMetrics, channelId),
        previous: getWeightedChannelConversion(previousMetrics, channelId),
        average: getWeightedChannelConversion(windowMetrics, channelId),
        fromDate,
        toDate: metricDate,
    };
}

function getSelectedProductIds() {
    if (state.selectedMarketingProduct === 'all') return new Set(state.marketingProducts.map(product => product.id));
    if (state.selectedMarketingProduct.startsWith('brand:')) {
        const brand = state.selectedMarketingProduct.slice(6);
        return new Set(state.marketingProducts.filter(product => product.brand === brand).map(product => product.id));
    }
    return new Set([state.selectedMarketingProduct]);
}

function getSelectedBrands() {
    const ids = getSelectedProductIds();
    return [...new Set(state.marketingProducts.filter(product => ids.has(product.id)).map(product => product.brand))];
}

function getVisibleMarketingMetrics() {
    const { from, to } = getPeriodBounds(state.marketingPeriod, { anchorYesterday: true, customFrom: state.customDateFrom, customTo: state.customDateTo });
    const selectedIds = getSelectedProductIds();

    return state.marketingMetrics.filter(metric =>
        metric.metric_date >= from &&
        metric.metric_date <= to &&
        selectedIds.has(metric.product_id)
    );
}

function getPeriodBounds(period, { anchorYesterday = false, customFrom = null, customTo = null } = {}) {
    if (period === 'custom') {
        const from = customFrom;
        const to = customTo;
        if (from && to) return { from, to: to < from ? from : to };
        const fallback = kstDateString(-1);
        return { from: fallback, to: fallback };
    }

    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    if (anchorYesterday) anchor.setDate(anchor.getDate() - 1);
    const from = new Date(anchor);
    const to = new Date(anchor);

    if (period === 'yesterday' && !anchorYesterday) {
        from.setDate(from.getDate() - 1);
        to.setDate(to.getDate() - 1);
    } else if (period === 'week') {
        const mondayOffset = (from.getDay() + 6) % 7;
        from.setDate(from.getDate() - mondayOffset);
    } else if (period === 'month') {
        from.setDate(1);
    } else if (period === 'prev_month') {
        from.setDate(1);
        from.setMonth(from.getMonth() - 1);
        to.setDate(0);
    } else {
        const days = Number.parseInt(period, 10) || 1;
        from.setDate(from.getDate() - days + 1);
    }

    return { from: localDateString(from), to: localDateString(to) };
}

function isBrandAdSpendComplete(metric) {
    return metric?.source_details?.naver_ad_spend?.allocation_complete !== false;
}

function aggregateMarketingMetrics(metrics, expectedProductIds = null) {
    const total = metrics.reduce((total, metric) => {
        total.blog_views += metricNumber(metric.blog_views);
        total.cafe_views += metricNumber(metric.cafe_views);
        total.content_views += getMetricExposure(metric);
        total.keyword_search_volume += metricNumber(metric.keyword_search_volume);
        total.site_visits += metricNumber(metric.site_visits);
        total.tracked_visits += metricNumber(metric.tracked_visits);
        total.tracked_orders += metricNumber(metric.tracked_orders);
        total.orders += getMetricSales(metric);
        total.revenue += getMetricRevenue(metric);
        total.ad_spend += metricNumber(metric.ad_spend);
        total.exposureRecordsExpected++;
        total.salesRecordsExpected++;
        total.revenueRecordsExpected++;
        total.adSpendRecordsExpected++;
        if (isExposureComplete(metric)) total.exposureRecordsMeasured++;
        if (isSalesComplete(metric)) total.salesRecordsMeasured++;
        if (isRevenueComplete(metric)) total.revenueRecordsMeasured++;
        if (hasCollectedMetric(metric, 'ad_spend')) total.adSpendRecordsMeasured++;
        MARKETING_CHANNELS.forEach(channel => {
            const product = state.marketingProducts.find(item => item.id === metric.product_id);
            const hasBrandCafe24Metric = channel.id === 'cafe24' &&
                state.marketingBrandMetrics.some(item =>
                    item.brand === product?.brand &&
                    item.metric_date === metric.metric_date &&
                    item.cafe24_visits !== null &&
                    item.cafe24_visits !== undefined
                );
            if (hasBrandCafe24Metric) return;
            const visits = getChannelVisits(metric, channel);
            total.channelPairsExpected++;
            if (visits !== null && isChannelPairMeasured(metric, channel)) {
                total.visits += visits;
                total.attributableOrders += getChannelOrders(metric, channel);
                total.channelPairsMeasured++;
                total.measuredChannels.add(channel.label);
            } else {
                total.missingChannels.add(channel.label);
            }
        });
        if (metric.collection_status === 'failed') total.failedRecords++;
        if (metric.collection_status === 'partial') total.partialRecords++;
        return total;
    }, {
        blog_views: 0, cafe_views: 0, content_views: 0, keyword_search_volume: 0,
        site_visits: 0, tracked_visits: 0, tracked_orders: 0, visits: 0,
        attributableOrders: 0, orders: 0, revenue: 0, ad_spend: 0,
        exposureRecordsExpected: 0, exposureRecordsMeasured: 0,
        salesRecordsExpected: 0, salesRecordsMeasured: 0,
        revenueRecordsExpected: 0, revenueRecordsMeasured: 0,
        adSpendRecordsExpected: 0, adSpendRecordsMeasured: 0,
        channelPairsExpected: 0, channelPairsMeasured: 0,
        measuredChannels: new Set(), missingChannels: new Set(),
        failedRecords: 0, partialRecords: 0,
    });
    if (expectedProductIds instanceof Set && expectedProductIds.size) {
        const dates = new Set(metrics.map(metric => metric.metric_date).filter(Boolean));
        const observedRows = new Set(metrics.map(metric => `${metric.metric_date}:${metric.product_id}`));
        const expectedRows = dates.size * expectedProductIds.size;
        const missingRows = Math.max(0, expectedRows - observedRows.size);
        total.exposureRecordsExpected += missingRows;
        total.salesRecordsExpected += missingRows;
        total.revenueRecordsExpected += missingRows;
        total.adSpendRecordsExpected += missingRows;
        total.channelPairsExpected += missingRows * (MARKETING_CHANNELS.length - 1);
    }
    const productsById = new Map(state.marketingProducts.map(product => [product.id, product]));
    const brandProductIds = new Map();
    state.marketingProducts.forEach(product => {
        const ids = brandProductIds.get(product.brand) || new Set();
        ids.add(product.id);
        brandProductIds.set(product.brand, ids);
    });
    const scopeProductIds = new Map();
    metrics.forEach(metric => {
        const brand = productsById.get(metric.product_id)?.brand;
        if (!brand) return;
        const key = `${brand}:${metric.metric_date}`;
        const ids = scopeProductIds.get(key) || new Set();
        ids.add(metric.product_id);
        scopeProductIds.set(key, ids);
    });
    for (const [key, selectedIds] of scopeProductIds) {
        const separator = key.lastIndexOf(':');
        const brand = key.slice(0, separator);
        const metricDate = key.slice(separator + 1);
        const expectedIds = brandProductIds.get(brand) || new Set();
        const coversWholeBrand = expectedIds.size > 0 &&
            [...expectedIds].every(productId => selectedIds.has(productId));
        const brandMetric = state.marketingBrandMetrics.find(metric =>
            metric.brand === brand && metric.metric_date === metricDate
        );
        if (!brandMetric || !Object.prototype.hasOwnProperty.call(brandMetric, 'cafe24_visits')) {
            continue;
        }
        total.channelPairsExpected++;
        if (
            coversWholeBrand &&
            brandMetric?.cafe24_visits !== null &&
            brandMetric?.cafe24_visits !== undefined
        ) {
            total.visits += metricNumber(brandMetric.cafe24_visits);
            total.attributableOrders += metrics
                .filter(metric =>
                    metric.metric_date === metricDate &&
                    expectedIds.has(metric.product_id)
                )
                .reduce((sum, metric) =>
                    sum + (
                        hasCollectedMetric(metric, 'cafe24_purchase_count')
                            ? metricNumber(metric.cafe24_purchase_count)
                            : metricNumber(metric.cafe24_orders)
                    )
                , 0);
            total.channelPairsMeasured++;
            total.measuredChannels.add('자사몰');
        } else {
            total.missingChannels.add('자사몰');
        }
    }
    const brandMetrics = state.marketingBrandMetrics.filter(metric =>
        scopeProductIds.has(`${metric.brand}:${metric.metric_date}`) &&
        isBrandAdSpendComplete(metric)
    );
    if (brandMetrics.length) {
        const coveredKeys = new Set(brandMetrics.flatMap(metric => {
            const key = `${metric.brand}:${metric.metric_date}`;
            const selectedIds = scopeProductIds.get(key) || new Set();
            const expectedIds = brandProductIds.get(metric.brand) || new Set();
            const coversWholeBrand = expectedIds.size > 0 &&
                [...expectedIds].every(productId => selectedIds.has(productId));
            return coversWholeBrand ? [key] : [];
        }));
        const coveredLegacySpend = metrics.reduce((sum, metric) => {
            const brand = productsById.get(metric.product_id)?.brand;
            return coveredKeys.has(`${brand}:${metric.metric_date}`)
                ? sum + metricNumber(metric.ad_spend)
                : sum;
        }, 0);
        total.ad_spend = total.ad_spend - coveredLegacySpend +
            brandMetrics.reduce((sum, metric) =>
                coveredKeys.has(`${metric.brand}:${metric.metric_date}`)
                    ? sum + metricNumber(metric.naver_ad_spend)
                    : sum
            , 0);
        metrics.forEach(metric => {
            const brand = productsById.get(metric.product_id)?.brand;
            if (
                coveredKeys.has(`${brand}:${metric.metric_date}`) &&
                !hasCollectedMetric(metric, 'ad_spend')
            ) {
                total.adSpendRecordsMeasured++;
            }
        });
    }
    total.exposureComplete = total.exposureRecordsExpected > 0 &&
        total.exposureRecordsMeasured === total.exposureRecordsExpected;
    total.salesComplete = total.salesRecordsExpected > 0 &&
        total.salesRecordsMeasured === total.salesRecordsExpected;
    total.revenueComplete = total.revenueRecordsExpected > 0 &&
        total.revenueRecordsMeasured === total.revenueRecordsExpected;
    total.adSpendComplete = total.adSpendRecordsExpected > 0 &&
        total.adSpendRecordsMeasured === total.adSpendRecordsExpected;
    return total;
}

function percent(numerator, denominator) {
    return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function getAverageDailySearchVolume(metrics) {
    const daily = new Map();
    metrics.forEach(metric => {
        const hasSearchData = metricNumber(metric.keyword_search_volume) > 0 || metric.data_completeness?.keyword_search_volume === true;
        if (!hasSearchData) return;
        daily.set(metric.metric_date, (daily.get(metric.metric_date) || 0) + metricNumber(metric.keyword_search_volume));
    });
    const values = [...daily.values()];
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function getKeywordSearchOverview(metrics = [], selectedIds = getSelectedProductIds()) {
    const latestByKeyword = new Map();
    const combineSharedBrandKeywords = selectedIds.size > 1;
    const add = (item, dateKey, valueKey) => {
        if (!selectedIds.has(item.product_id) || !item.keyword || item.keyword === '기존 합계') return;
        const key = combineSharedBrandKeywords ? item.keyword : `${item.product_id}:${item.keyword}`;
        const current = latestByKeyword.get(key);
        if (!current || item[dateKey] > current.date) {
            latestByKeyword.set(key, {
                product_id: item.product_id,
                keyword: item.keyword,
                value: metricNumber(item[valueKey]),
                date: item[dateKey],
            });
        }
    };
    state.dailyKeywordMetrics.forEach(item => add(item, 'metric_date', 'search_volume'));
    state.marketingSearchSnapshots.forEach(item => add(item, 'snapshot_date', 'search_volume'));
    return [...latestByKeyword.values()].sort((a, b) => a.keyword.localeCompare(b.keyword, 'ko'));
}

function renderKeywordSearchOverview(metrics) {
    const keywords = getKeywordSearchOverview(metrics);
    if (!keywords.length) return '<span class="keyword-empty">키워드별 데이터 필요</span>';
    return `<div class="keyword-volume-list">${keywords.map(item =>
        `<span><small>${escapeHtml(item.keyword)}</small><strong>${formatMetric(item.value)}</strong></span>`
    ).join('')}</div>`;
}

function getMonthTarget(referenceDate = kstDateString(-1)) {
    const periodStart = `${referenceDate.slice(0, 7)}-01`;
    const selectedBrands = getSelectedBrands();
    const selectedIds = [...getSelectedProductIds()];

    if (selectedIds.length === 1) {
        const productTarget = state.marketingTargets.find(target =>
            target.scope_type === 'product' &&
            target.scope_key === selectedIds[0] &&
            target.period_type === 'month' &&
            target.period_start === periodStart
        );
        if (productTarget) return productTarget;
    }

    const brandTargets = selectedBrands.map(brand => state.marketingTargets.find(target =>
        target.scope_type === 'brand' &&
        target.scope_key === brand &&
        target.period_type === 'month' &&
        target.period_start === periodStart
    ));
    return {
        content_views_target: brandTargets.reduce((sum, target) => sum + metricNumber(target?.content_views_target || MARKETING_INDEX_RULES.monthlyViewsTarget), 0),
        traffic_rate_target: brandTargets.find(Boolean)?.traffic_rate_target || MARKETING_INDEX_RULES.trafficRateTarget,
        conversion_rate_target: brandTargets.find(Boolean)?.conversion_rate_target || MARKETING_INDEX_RULES.conversionRateTarget,
    };
}

function getMetricsInDateRange(from, to) {
    const selectedIds = getSelectedProductIds();
    return state.marketingMetrics.filter(metric =>
        selectedIds.has(metric.product_id) &&
        metric.metric_date >= from &&
        metric.metric_date <= to
    );
}

function calculateSearchMomentum() {
    const selectedIds = getSelectedProductIds();
    const combineSharedBrandKeywords = selectedIds.size > 1;
    const byKeywordDate = new Map();
    const grouped = new Map();
    const add = (item, date) => {
        if (!selectedIds.has(item.product_id) || !item.keyword || item.keyword === '기존 합계') return;
        const groupKey = combineSharedBrandKeywords ? item.keyword : `${item.product_id}:${item.keyword}`;
        byKeywordDate.set(`${groupKey}:${date}`, { ...item, date, groupKey });
    };
    state.marketingSearchSnapshots.forEach(item => add(item, item.snapshot_date));
    state.dailyKeywordMetrics.forEach(item => add(item, item.metric_date));
    byKeywordDate.forEach(item => {
        if (!grouped.has(item.groupKey)) grouped.set(item.groupKey, []);
        grouped.get(item.groupKey).push(item);
    });
    const changes = [...grouped.values()].map(items => {
        const sorted = items.sort((a, b) => a.date.localeCompare(b.date));
        if (sorted.length < 2) return null;
        const previous = metricNumber(sorted[sorted.length - 2].search_volume);
        const current = metricNumber(sorted[sorted.length - 1].search_volume);
        return previous ? ((current - previous) / previous) * 100 : null;
    }).filter(value => value !== null);
    if (changes.length) {
        return Math.min(...changes);
    }
    const today = new Date();
    const currentEnd = localDateString(today);
    const currentStartDate = new Date(today);
    currentStartDate.setDate(today.getDate() - 6);
    const previousEndDate = new Date(currentStartDate);
    previousEndDate.setDate(previousEndDate.getDate() - 1);
    const previousStartDate = new Date(previousEndDate);
    previousStartDate.setDate(previousStartDate.getDate() - 6);
    const current = getAverageDailySearchVolume(getMetricsInDateRange(localDateString(currentStartDate), currentEnd));
    const previous = getAverageDailySearchVolume(getMetricsInDateRange(localDateString(previousStartDate), localDateString(previousEndDate)));
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
}

function calculateMarketingHealth(metrics) {
    const selectedProductIds = getSelectedProductIds();
    const total = aggregateMarketingMetrics(metrics, selectedProductIds);
    const referenceDate = kstDateString(-1);
    const reference = new Date(`${referenceDate}T00:00:00`);
    const target = getMonthTarget(referenceDate);
    const monthStart = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const monthEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
    const monthlyMetrics = getMetricsInDateRange(localDateString(monthStart), referenceDate);
    const monthlyTotal = aggregateMarketingMetrics(monthlyMetrics, selectedProductIds);
    const expectedViews = metricNumber(target.content_views_target) * (reference.getDate() / monthEnd.getDate());
    const trafficRate = total.exposureComplete && total.content_views > 0 && total.channelPairsMeasured > 0
        ? percent(total.visits, total.content_views)
        : null;
    const conversionRate = total.visits > 0 ? percent(total.attributableOrders, total.visits) : null;
    const exposureIndex = expectedViews > 0 && monthlyTotal.exposureComplete
        ? (monthlyTotal.content_views / expectedViews) * 100
        : null;
    const trafficIndex = trafficRate === null ? null : (trafficRate / metricNumber(target.traffic_rate_target)) * 100;
    const conversionIndex = conversionRate === null ? null : (conversionRate / metricNumber(target.conversion_rate_target)) * 100;
    const availableIndices = [exposureIndex, trafficIndex, conversionIndex].filter(value => value !== null && Number.isFinite(value));

    return {
        total,
        target,
        expectedViews,
        exposureIndex,
        trafficIndex,
        conversionIndex,
        overallIndex: availableIndices.length ? availableIndices.reduce((sum, value) => sum + value, 0) / availableIndices.length : null,
        trafficRate,
        conversionRate,
        dataCoverage: total.channelPairsExpected ? (total.channelPairsMeasured / total.channelPairsExpected) * 100 : 0,
        searchMomentum: calculateSearchMomentum(),
    };
}

function getIndexStatus(value) {
    if (value === null || !Number.isFinite(value)) return 'unknown';
    if (value < MARKETING_INDEX_RULES.warningBelow) return 'danger';
    if (value > MARKETING_INDEX_RULES.excellentAbove) return 'excellent';
    return 'stable';
}

function formatIndex(value) {
    return value === null || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString('ko-KR');
}

function renderMarketingDiagnosis(health) {
    const { total } = health;
    if (!total.content_views && !total.keyword_search_volume && !total.visits && !total.orders) {
        return `
        <div class="diagnosis-item neutral">
            <i class="ri-information-line"></i>
            <div><strong>아직 기록된 데이터가 없습니다</strong><span>첫 데이터를 입력하면 지표별 이상 원인을 자동으로 안내합니다.</span></div>
        </div>`;
    }

    const diagnoses = [];

    if (getIndexStatus(health.exposureIndex) === 'danger') {
        diagnoses.push(['danger', 'ri-file-warning-line', '노출 목표 진도가 부족합니다', '블로그 방문자, 카페 글 조회수, 게시물·계정 노출 상태와 발행량을 먼저 확인하세요.']);
    } else {
        diagnoses.push(['good', 'ri-eye-line', '노출 목표 진도가 안정적입니다', `월 목표 진도 대비 ${formatIndex(health.exposureIndex)} 지수입니다.`]);
    }

    if (health.trafficIndex === null) {
        diagnoses.push(['neutral', 'ri-database-2-line', '유입 데이터가 부족합니다', '채널 방문자 수가 확보되어야 노출→유입 10%를 계산할 수 있습니다.']);
    } else if (getIndexStatus(health.trafficIndex) === 'danger') {
        diagnoses.push(['warning', 'ri-route-line', '노출은 있지만 유입 효율이 낮습니다', `현재 ${health.trafficRate.toFixed(1)}%입니다. 원고 설득력, CTA와 링크 위치를 점검하세요.`]);
    } else {
        diagnoses.push(['good', 'ri-check-line', '노출→유입 흐름이 안정적입니다', `현재 ${health.trafficRate.toFixed(1)}%로 10·10 안정권입니다.`]);
    }

    if (health.conversionIndex === null) {
        diagnoses.push(['neutral', 'ri-shopping-cart-line', '전환 데이터가 부족합니다', '같은 채널의 방문자와 구매량이 함께 있어야 전환율을 계산합니다.']);
    } else if (getIndexStatus(health.conversionIndex) === 'danger') {
        diagnoses.push(['danger', 'ri-shopping-cart-line', '유입 대비 구매 전환이 낮습니다', `현재 ${health.conversionRate.toFixed(1)}%입니다. 리뷰, 가격, 상세페이지와 경쟁사 변화를 확인하세요.`]);
    } else {
        diagnoses.push(['good', 'ri-shopping-bag-3-line', '구매 전환이 안정적입니다', `현재 ${health.conversionRate.toFixed(1)}%로 10·10 안정권입니다.`]);
    }

    if (health.searchMomentum === null) {
        diagnoses.push(['neutral', 'ri-search-eye-line', '브랜드 검색 비교 데이터가 부족합니다', '검색량 스냅샷이 2회 이상 쌓이면 노출과 검색 관심의 동반 추세를 비교합니다.']);
    } else if (total.content_views > 0 && health.searchMomentum < 0) {
        diagnoses.push(['warning', 'ri-search-eye-line', '노출이 검색 관심으로 이어지지 않습니다', `브랜드 검색량이 직전 수집보다 ${Math.abs(health.searchMomentum).toFixed(1)}% 감소했습니다.`]);
    }

    if (health.dataCoverage < 100) {
        diagnoses.push(['neutral', 'ri-signal-wifi-error-line', '전환율 측정 범위가 일부 채널로 제한됩니다', `방문자 데이터 완성도 ${health.dataCoverage.toFixed(0)}%입니다. 총판매량은 전 채널, 전환율은 측정 가능한 채널만 사용합니다.`]);
    }

    return diagnoses.map(([type, icon, title, description]) => `
        <div class="diagnosis-item ${type}">
            <i class="${icon}"></i>
            <div><strong>${title}</strong><span>${description}</span></div>
        </div>`).join('');
}

function renderProductMetricCard(product) {
    const metrics = state.marketingMetrics
        .filter(metric => metric.product_id === product.id)
        .sort((a, b) => b.metric_date.localeCompare(a.metric_date));
    const latest = metrics[0];
    const latestTotal = latest ? aggregateMarketingMetrics([latest]) : null;
    const keywordValues = getKeywordSearchOverview(metrics, new Set([product.id]));
    const title = `${product.brand} ${product.name}`;

    return `
    <button class="metric-product-card ${state.selectedMarketingProduct === product.id ? 'active' : ''}"
        onclick="selectMarketingProduct('${product.id}')">
        <div class="metric-product-heading">
            <span class="metric-product-brand">${escapeHtml(product.brand)}</span>
            <i class="ri-arrow-right-up-line"></i>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        ${latest ? `
        <div class="metric-product-summary">
            <span><small>검색 키워드</small><strong>${keywordValues.length ? `${escapeHtml(keywordValues[0].keyword)} ${formatMetric(keywordValues[0].value)}` : '—'}</strong></span>
            <span><small>유입</small><strong>${latestTotal.channelPairsMeasured ? formatMetric(latestTotal.visits) : '—'}</strong></span>
            <span><small>판매</small><strong>${isSalesComplete(latest) ? formatMetric(getMetricSales(latest)) : '—'}</strong></span>
        </div>
        <p>${formatDate(latest.metric_date)} · ${isRevenueComplete(latest) ? formatWon(getMetricRevenue(latest)) : '매출 미수집'}</p>` : `
        <div class="metric-product-empty"><i class="ri-database-2-line"></i> 첫 기록을 기다리고 있습니다</div>`}
        <span class="sr-only">${escapeHtml(title)} 선택</span>
    </button>`;
}

function renderMarketingDailyTable(metrics) {
    const grouped = new Map();
    metrics.forEach(metric => {
        if (!grouped.has(metric.metric_date)) grouped.set(metric.metric_date, []);
        grouped.get(metric.metric_date).push(metric);
    });
    const rows = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a));

    if (!rows.length) return `<div class="marketing-empty-row">선택한 기간에 기록된 데이터가 없습니다.</div>`;

    return `
    <div class="marketing-table-wrap">
        <table class="marketing-table">
            <thead><tr><th>날짜</th><th>블로그</th><th>카페</th><th>노출 합계</th><th>키워드별 검색</th><th>측정 유입</th><th>전체 판매</th><th>매출</th><th>광고비</th><th>측정 전환율</th></tr></thead>
            <tbody>
            ${rows.map(([date, dayMetrics]) => {
                const expectedProductIds = getSelectedProductIds();
                const day = aggregateMarketingMetrics(dayMetrics, expectedProductIds);
                return `<tr>
                    <td><strong>${formatDate(date)}</strong></td>
                    <td>${dayMetrics.length === expectedProductIds.size && areMetricsCollected(dayMetrics, 'blog_views') ? formatMetric(day.blog_views) : '—'}</td>
                    <td>${dayMetrics.length === expectedProductIds.size && areMetricsCollected(dayMetrics, 'cafe_views') ? formatMetric(day.cafe_views) : '—'}</td>
                    <td>${day.exposureComplete ? formatMetric(day.content_views) : '—'}</td>
                    <td>${renderDailyKeywordValues(date)}</td>
                    <td>${day.channelPairsMeasured ? formatMetric(day.visits) : '—'}</td>
                    <td>${day.salesComplete ? formatMetric(day.orders) : '—'}</td>
                    <td>${day.revenueComplete ? formatWon(day.revenue) : '—'}</td>
                    <td>${day.adSpendComplete ? formatWon(day.ad_spend) : '—'}</td>
                    <td>${day.visits > 0 ? `${percent(day.attributableOrders, day.visits).toFixed(1)}%` : '—'}</td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>
    </div>`;
}

function renderDailyKeywordValues(date) {
    const selectedIds = getSelectedProductIds();
    const combineSharedBrandKeywords = selectedIds.size > 1;
    const valuesByKeyword = new Map();
    const add = item => {
        if (!selectedIds.has(item.product_id) || !item.keyword || item.keyword === '기존 합계') return;
        const key = combineSharedBrandKeywords ? item.keyword : `${item.product_id}:${item.keyword}`;
        valuesByKeyword.set(key, item);
    };
    state.marketingSearchSnapshots
        .filter(item => item.snapshot_date === date)
        .forEach(add);
    state.dailyKeywordMetrics
        .filter(item => item.metric_date === date)
        .forEach(add);
    const values = [...valuesByKeyword.values()];
    if (!values.length) return '<span class="report-no-data">—</span>';
    return `<div class="daily-keyword-values">${values.map(item =>
        `<span>${escapeHtml(item.keyword)} <b>${formatMetric(item.search_volume)}</b></span>`
    ).join('')}</div>`;
}

async function connectCafe24(mallId, button) {
    const original = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> 연결 준비';
    }
    try {
        const { data, error } = await sb.functions.invoke('cafe24-oauth', {
            body: { mall_id: mallId },
        });
        if (error || !data?.authorize_url) throw new Error(data?.error || error?.message || '연결 주소를 만들지 못했습니다.');
        window.location.href = data.authorize_url;
    } catch (error) {
        showToast(error.message || 'Cafe24 연결을 시작하지 못했습니다.', 'error');
        if (button) {
            button.disabled = false;
            button.innerHTML = original;
        }
    }
}

function handleCafe24OAuthResult() {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('cafe24');
    if (!result) return;
    const mallId = url.searchParams.get('mall_id') || '';
    const mallLabel = mallId === 'innerium' ? '이너리움' : mallId === 'jgohdapt' ? '유랄' : 'Cafe24';
    if (result === 'connected') {
        const detail = url.searchParams.get('message');
        showToast(`${mallLabel} Cafe24 연결 완료${detail ? ` · ${detail}` : ''}`, 'success');
    } else {
        showToast(url.searchParams.get('message') || `${mallLabel} Cafe24 연결에 실패했습니다.`, 'error');
    }
    url.searchParams.delete('cafe24');
    url.searchParams.delete('mall_id');
    url.searchParams.delete('message');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function kstDateString(offsetDays = 0) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const date = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)));
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
}

function getReportDates() {
    const { from, to } = getPeriodBounds(state.reportPeriod, { anchorYesterday: true, customFrom: state.customReportDateFrom, customTo: state.customReportDateTo });
    const dates = [];
    const cursor = new Date(`${to}T00:00:00`);
    const first = new Date(`${from}T00:00:00`);
    while (cursor >= first) {
        dates.push(localDateString(cursor));
        cursor.setDate(cursor.getDate() - 1);
    }
    return dates;
}

function getReportProduct() {
    if (state.selectedMarketingProduct !== 'all') {
        return state.marketingProducts.find(product => product.id === state.selectedMarketingProduct);
    }
    return state.marketingProducts[0];
}

function reportMetricValue(metric, key, formatter = formatMetric) {
    if (!metric || !hasCollectedMetric(metric, key)) return '<span class="report-no-data">—</span>';
    return formatter(metricNumber(metric[key]));
}

function parseRenderedMetric(value) {
    const text = String(value || '').replace(/<[^>]*>/g, '').trim();
    if (!text || text.includes('—')) return null;
    const number = Number(text.replace(/,/g, '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number : null;
}

function renderMetricTrend(currentValue, previousValue) {
    const current = parseRenderedMetric(currentValue);
    const previous = parseRenderedMetric(previousValue);
    if (current === null || previous === null) return '';
    const difference = current - previous;
    if (difference === 0) return '<small class="metric-trend same">― 변동없음</small>';
    const isPercent = String(currentValue).includes('%');
    const isWon = String(currentValue).includes('원');
    const amount = isPercent ? `${Math.abs(difference).toFixed(1)}%p` : `${formatMetric(Math.abs(difference))}${isWon ? '원' : ''}`;
    return `<small class="metric-trend ${difference > 0 ? 'up' : 'down'}">${difference > 0 ? '▲ 증가' : '▼ 감소'} ${amount}</small>`;
}

function renderReportRow(label, dates, metricsByDate, valueGetter, options = {}) {
    return `
    <tr class="${options.total ? 'report-total-row' : ''}">
        <th>${options.indent ? '<span class="report-indent">└</span>' : ''}${escapeHtml(label)}</th>
        ${dates.map((date, index) => {
            const currentValue = valueGetter(metricsByDate.get(date), date);
            const previousDate = dates[index + 1];
            const previousValue = previousDate ? valueGetter(metricsByDate.get(previousDate), previousDate) : null;
            return `<td><span class="report-cell-value">${currentValue}</span>${renderMetricTrend(currentValue, previousValue)}</td>`;
        }).join('')}
    </tr>`;
}

function renderDailyReportTable(product) {
    const dates = getReportDates();
    const productMetrics = state.marketingMetrics.filter(metric => metric.product_id === product.id);
    const metricsByDate = new Map(productMetrics.map(metric => [metric.metric_date, metric]));
    const productKeywordMetrics = state.dailyKeywordMetrics.filter(metric => metric.product_id === product.id);
    const productSearchSnapshots = state.marketingSearchSnapshots.filter(metric => metric.product_id === product.id && metric.keyword !== '기존 합계');
    const keywordMetricsByDate = new Map(productSearchSnapshots.map(metric => [
        `${metric.snapshot_date}:${metric.keyword}`,
        { ...metric, metric_date: metric.snapshot_date },
    ]));
    productKeywordMetrics.forEach(metric => keywordMetricsByDate.set(`${metric.metric_date}:${metric.keyword}`, metric));
    const keywordNames = [...new Set([
        ...productKeywordMetrics.map(metric => metric.keyword),
        ...productSearchSnapshots.map(metric => metric.keyword),
        ...(PRODUCT_KEYWORDS[product.slug] || [product.name]),
    ])].filter(keyword => keyword !== '기존 합계');
    const monthAggregate = date => {
        const month = date.slice(0, 7);
        return aggregateMarketingMetrics(productMetrics.filter(metric => metric.metric_date.startsWith(month) && metric.metric_date <= date));
    };
    const dailyAdSpend = metric => hasCollectedMetric(metric, 'ad_spend')
        ? nullableMetricNumber(metric?.ad_spend)
        : null;
    const won = value => formatWon(value);

    return `
    <div class="excel-report-scroll">
        <table class="excel-report-table product-theme-${product.sort_order || 1}" style="min-width:${280 + (dates.length * 175)}px">
            <thead>
                <tr>
                    <th class="report-product-cell">
                        <span>${escapeHtml(product.brand)}</span>
                        <strong>${escapeHtml(product.name)}</strong>
                    </th>
                    ${dates.map(date => {
                        const parsed = new Date(`${date}T00:00:00`);
                        return `<th><strong>${parsed.getMonth() + 1}/${parsed.getDate()}</strong><span>${parsed.toLocaleDateString('ko-KR', { weekday: 'short' })}</span></th>`;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-search-line"></i> 검색·콘텐츠</th></tr>
                ${keywordNames.map(keyword => renderReportRow(
                    `검색량 · ${keyword}`,
                    dates,
                    keywordMetricsByDate,
                    (_, date) => {
                        const item = keywordMetricsByDate.get(`${date}:${keyword}`);
                        return item ? formatMetric(item.search_volume) : '<span class="report-no-data">—</span>';
                    },
                    { indent: true }
                )).join('')}
                ${renderReportRow(`${product.name} 블로그 방문자 수(조회수)`, dates, metricsByDate, metric => reportMetricValue(metric, 'blog_views'))}
                ${renderReportRow('카페 글 조회수', dates, metricsByDate, metric => reportMetricValue(metric, 'cafe_views'))}
                ${renderReportRow('노출 합계', dates, metricsByDate, metric => isExposureComplete(metric) ? formatMetric(getMetricExposure(metric)) : '<span class="report-no-data">—</span>', { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-route-line"></i> 채널 유입</th></tr>
                ${renderReportRow('자사몰 방문자 (몰 전체)', dates, metricsByDate, (_metric, date) => {
                    const visits = getCafe24StoreVisits(product, date);
                    return visits === null ? '<span class="report-no-data">—</span>' : formatMetric(visits);
                }, { indent: true })}
                ${renderReportRow('자사몰 상품상세 조회수 (PV)', dates, metricsByDate, metric => reportMetricValue(metric, 'cafe24_product_views'), { indent: true })}
                ${renderReportRow('자사몰 전환율', dates, metricsByDate, metric => {
                    const conversion = getChannelConversionMeasurement(metric, 'cafe24');
                    return conversion?.rate === null || conversion?.rate === undefined ? '<span class="report-no-data">—</span>' : `${conversion.rate.toFixed(1)}%`;
                }, { indent: true })}
                ${renderReportRow('스마트스토어', dates, metricsByDate, metric => metric ? (getChannelVisits(metric, MARKETING_CHANNELS[1]) === null ? '<span class="report-no-data">—</span>' : formatMetric(getChannelVisits(metric, MARKETING_CHANNELS[1]))) : '<span class="report-no-data">—</span>', { indent: true })}
                ${renderReportRow('스마트스토어 전환율', dates, metricsByDate, metric => {
                    const conversion = getChannelConversionMeasurement(metric, 'smartstore');
                    return conversion?.rate === null || conversion?.rate === undefined ? '<span class="report-no-data">—</span>' : `${conversion.rate.toFixed(1)}%`;
                }, { indent: true })}
                ${renderReportRow('쿠팡', dates, metricsByDate, metric => metric ? (getChannelVisits(metric, MARKETING_CHANNELS[2]) === null ? '<span class="report-no-data">—</span>' : formatMetric(getChannelVisits(metric, MARKETING_CHANNELS[2]))) : '<span class="report-no-data">—</span>', { indent: true })}
                ${renderReportRow('쿠팡 전환율', dates, metricsByDate, metric => {
                    const conversion = getChannelConversionMeasurement(metric, 'coupang');
                    return conversion?.rate === null || conversion?.rate === undefined ? '<span class="report-no-data">—</span>' : `${conversion.rate.toFixed(1)}%`;
                }, { indent: true })}
                ${renderReportRow('측정 유입 합계', dates, metricsByDate, metric => {
                    if (!metric) return '<span class="report-no-data">—</span>';
                    const day = aggregateMarketingMetrics([metric]);
                    return day.channelPairsMeasured ? formatMetric(day.visits) : '<span class="report-no-data">—</span>';
                }, { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-shopping-bag-3-line"></i> 판매량</th></tr>
                ${renderReportRow('자사몰', dates, metricsByDate, metric => reportMetricValue(metric, 'cafe24_orders'), { indent: true })}
                ${renderReportRow('스마트스토어', dates, metricsByDate, metric => reportMetricValue(metric, 'smartstore_orders'), { indent: true })}
                ${renderReportRow('쿠팡 윙', dates, metricsByDate, metric => reportMetricValue(metric, 'coupang_wing_orders'), { indent: true })}
                ${renderReportRow('로켓그로스', dates, metricsByDate, metric => reportMetricValue(metric, 'coupang_growth_orders'), { indent: true })}
                ${renderReportRow('판매량 총합', dates, metricsByDate, metric => isSalesComplete(metric) ? formatMetric(getMetricSales(metric)) : '<span class="report-no-data">—</span>', { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-money-dollar-circle-line"></i> 매출</th></tr>
                ${renderReportRow('일 매출', dates, metricsByDate, metric => isRevenueComplete(metric) ? won(getMetricRevenue(metric)) : '<span class="report-no-data">—</span>')}
                ${renderReportRow('월 누적 매출', dates, metricsByDate, (metric, date) => {
                    if (!metric) return '<span class="report-no-data">—</span>';
                    const monthMetrics = productMetrics.filter(item => item.metric_date.startsWith(date.slice(0, 7)) && item.metric_date <= date);
                    return monthMetrics.every(isRevenueComplete) ? won(monthAggregate(date).revenue) : '<span class="report-no-data">—</span>';
                }, { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-megaphone-line"></i> 마케팅 광고비</th></tr>
                ${renderReportRow(`${product.name} 일 광고비`, dates, metricsByDate, metric => {
                    const value = dailyAdSpend(metric);
                    return value === null ? '<span class="report-no-data">—</span>' : won(value);
                })}
                ${renderReportRow(`${product.name} 월 누적 광고비`, dates, metricsByDate, (_metric, date) => {
                    const monthly = monthAggregate(date);
                    return monthly.adSpendComplete ? won(monthly.ad_spend) : '<span class="report-no-data">—</span>';
                }, { total: true })}

            </tbody>
        </table>
    </div>`;
}

function renderOverviewTrend(current, previous, options = {}) {
    if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return '';
    const difference = current - previous;
    if (Math.abs(difference) < 0.0001) return '<small class="overview-trend same">변동 없음</small>';
    const formatted = options.percent
        ? `${Math.abs(difference).toFixed(1)}%p`
        : options.won
            ? formatWon(Math.abs(difference))
            : formatMetric(Math.abs(difference));
    return `<small class="overview-trend ${difference > 0 ? 'up' : 'down'}">${difference > 0 ? '▲' : '▼'} ${formatted}</small>`;
}

function renderOverviewMetricCell(current, previous, options = {}) {
    const attributes = `${options.rowspan ? ` rowspan="${Number(options.rowspan)}"` : ''}${options.className ? ` class="${escapeHtml(options.className)}"` : ''}`;
    if (current === null || current === undefined || !Number.isFinite(current)) {
        return `<td${attributes}><span class="overview-no-data">—</span>${options.note ? `<small class="overview-cell-note">${escapeHtml(options.note)}</small>` : ''}</td>`;
    }
    const value = options.percent
        ? `${current.toFixed(1)}%`
        : options.won
            ? formatWon(current)
            : formatMetric(current);
    return `<td${attributes}><strong>${value}</strong>${renderOverviewTrend(current, previous, options)}${options.note ? `<small class="overview-cell-note">${escapeHtml(options.note)}</small>` : ''}</td>`;
}

function completeMetricValue(metric, key) {
    return metric && hasCollectedMetric(metric, key) ? metricNumber(metric[key]) : null;
}

function completeCoupangValue(metric, suffix) {
    if (!metric) return null;
    if (hasCollectedCoupangMetric(metric, suffix)) return getCoupangMetric(metric, suffix);
    const wing = nullableMetricNumber(metric[`coupang_wing_${suffix}`]);
    const growth = nullableMetricNumber(metric[`coupang_growth_${suffix}`]);
    if (wing !== null || growth !== null) return metricNumber(wing) + metricNumber(growth);
    return null;
}

function getOverviewMainKeywordMetric(product, metricDate) {
    const keyword = OVERVIEW_MAIN_KEYWORDS[product?.slug];
    if (!keyword) return { keyword: product?.name || '', value: null };
    const normalized = keyword.replace(/\s+/g, '').toLowerCase();
    const matchSnapshot = item =>
        item.product_id === product.id &&
        item.snapshot_date === metricDate &&
        item.keyword.replace(/\s+/g, '').toLowerCase() === normalized;
    const matchDaily = item =>
        item.product_id === product.id &&
        item.metric_date === metricDate &&
        String(item.keyword || '').replace(/\s+/g, '').toLowerCase() === normalized;
    const hit = state.marketingSearchSnapshots.find(matchSnapshot)
        || state.dailyKeywordMetrics.find(matchDaily);
    return { keyword, value: hit ? metricNumber(hit.search_volume) : null };
}

function renderOverviewConversionCell(productId, channelId, metricDate) {
    const summary = getChannelConversionSummary(new Set([productId]), channelId, metricDate);
    const current = summary.current?.rate ?? null;
    const previous = summary.previous?.rate ?? null;
    const average = summary.average?.rate ?? null;
    return renderOverviewMetricCell(current, previous, {
        percent: true,
        note: average === null ? '7일 평균 —' : `7일 평균 ${average.toFixed(1)}%`,
    });
}

function renderChannelConversionPanel(metricDate) {
    const productIds = new Set(state.marketingProducts.map(product => product.id));
    const channels = [
        { id: 'cafe24', label: '자사몰 전환율', description: 'Cafe24 상품조회·판매건 기준' },
        { id: 'smartstore', label: '스마트스토어 전환율', description: '공식 상품 구매전환율' },
        { id: 'coupang', label: '쿠팡 전환율', description: 'Wing 공식 구매전환율 우선' },
    ];
    return `
    <section class="channel-conversion-section">
        <div class="overview-section-heading">
            <div><span>CHANNEL CONVERSION</span><h2>채널별 구매 전환율</h2></div>
            <small>${escapeHtml(metricDate)} 기준 · 최근 7일은 방문수 가중 평균</small>
        </div>
        <div class="channel-conversion-grid">
            ${channels.map(channel => {
                const summary = getChannelConversionSummary(productIds, channel.id, metricDate);
                const current = summary.current?.rate ?? null;
                const average = summary.average?.rate ?? null;
                const gap = current !== null && average !== null ? current - average : null;
                return `
                <article class="channel-conversion-card">
                    <span>${escapeHtml(channel.label)}</span>
                    <strong>${current === null ? '—' : `${current.toFixed(1)}%`}</strong>
                    <div><b>최근 7일 평균</b><em>${average === null ? '—' : `${average.toFixed(1)}%`}</em></div>
                    <small class="${gap === null || Math.abs(gap) < 0.05 ? 'same' : gap > 0 ? 'up' : 'down'}">
                        ${gap === null ? '비교 데이터 부족' : Math.abs(gap) < 0.05 ? '7일 평균과 동일' : `평균보다 ${gap > 0 ? '+' : ''}${gap.toFixed(1)}%p`}
                    </small>
                    <p>${escapeHtml(channel.description)}</p>
                </article>`;
            }).join('')}
        </div>
    </section>`;
}

function getComparisonRevenue(metric) {
    if (!metric) return null;
    const c24 = nullableMetricNumber(metric.cafe24_revenue);
    const ss = nullableMetricNumber(metric.smartstore_revenue);
    const cpWing = nullableMetricNumber(metric.coupang_wing_revenue);
    const cpGrowth = nullableMetricNumber(metric.coupang_growth_revenue);
    const cpCombined = nullableMetricNumber(metric.coupang_revenue);
    const cp = cpWing !== null || cpGrowth !== null
        ? metricNumber(cpWing) + metricNumber(cpGrowth)
        : cpCombined;
    if (c24 !== null || ss !== null || cp !== null) {
        return metricNumber(c24) + metricNumber(ss) + metricNumber(cp);
    }
    const reported = nullableMetricNumber(metric.reported_total_revenue);
    if (reported !== null) return reported;
    return isRevenueComplete(metric) ? getMetricRevenue(metric) : null;
}

function renderMarketingComparisonMatrix(metricDate) {
    const previousDate = shiftMetricDate(metricDate, -1);

    const productRows = state.marketingProducts.map((product, index) => {
        const current = getProductMetricOnDate(product.id, metricDate);
        const previous = getProductMetricOnDate(product.id, previousDate);
        const currentRevenue = current ? getComparisonRevenue(current) : null;
        const previousRevenue = previous ? getComparisonRevenue(previous) : null;
        const currentAdSpend = completeMetricValue(current, 'ad_spend');
        const previousAdSpend = completeMetricValue(previous, 'ad_spend');
        const currentRoas = currentRevenue !== null && currentAdSpend > 0 ? percent(currentRevenue, currentAdSpend) : null;
        const previousRoas = previousRevenue !== null && previousAdSpend > 0 ? percent(previousRevenue, previousAdSpend) : null;
        const currentSearch = getOverviewMainKeywordMetric(product, metricDate);
        const previousSearch = getOverviewMainKeywordMetric(product, previousDate);
        const brandProducts = state.marketingProducts.filter(item => item.brand === product.brand);
        const isFirstBrandProduct = brandProducts[0]?.id === product.id;
        const currentStoreVisits = getCafe24StoreVisits(product, metricDate);
        const previousStoreVisits = getCafe24StoreVisits(product, previousDate);

        const curCafe24Rev = current ? nullableMetricNumber(current.cafe24_revenue) : null;
        const prevCafe24Rev = previous ? nullableMetricNumber(previous.cafe24_revenue) : null;
        const curSSRev = current ? nullableMetricNumber(current.smartstore_revenue) : null;
        const prevSSRev = previous ? nullableMetricNumber(previous.smartstore_revenue) : null;
        const curWingRev = current ? nullableMetricNumber(current.coupang_wing_revenue) : null;
        const prevWingRev = previous ? nullableMetricNumber(previous.coupang_wing_revenue) : null;
        const curGrowthRev = current ? nullableMetricNumber(current.coupang_growth_revenue) : null;
        const prevGrowthRev = previous ? nullableMetricNumber(previous.coupang_growth_revenue) : null;

        return {
            product, index, current, previous,
            currentRevenue, previousRevenue,
            currentAdSpend, previousAdSpend,
            currentRoas, previousRoas,
            currentSearch, previousSearch,
            brandProducts, isFirstBrandProduct,
            currentStoreVisits, previousStoreVisits,
            curCafe24Rev, prevCafe24Rev,
            curSSRev, prevSSRev,
            curWingRev, prevWingRev,
            curGrowthRev, prevGrowthRev,
        };
    });

    const safeSum = values => {
        const valid = values.filter(v => v !== null && v !== undefined && Number.isFinite(v));
        return valid.length ? valid.reduce((a, b) => a + b, 0) : null;
    };

    const totalRevenue = safeSum(productRows.map(r => r.currentRevenue));
    const totalPrevRevenue = safeSum(productRows.map(r => r.previousRevenue));
    const totalAdSpend = safeSum(productRows.map(r => r.currentAdSpend));
    const totalPrevAdSpend = safeSum(productRows.map(r => r.previousAdSpend));
    const totalRoas = totalRevenue !== null && totalAdSpend > 0 ? percent(totalRevenue, totalAdSpend) : null;
    const totalPrevRoas = totalPrevRevenue !== null && totalPrevAdSpend > 0 ? percent(totalPrevRevenue, totalPrevAdSpend) : null;
    const totalCafe24Rev = safeSum(productRows.map(r => r.curCafe24Rev));
    const totalPrevCafe24Rev = safeSum(productRows.map(r => r.prevCafe24Rev));
    const totalSSRev = safeSum(productRows.map(r => r.curSSRev));
    const totalPrevSSRev = safeSum(productRows.map(r => r.prevSSRev));
    const totalWingRev = safeSum(productRows.map(r => r.curWingRev));
    const totalPrevWingRev = safeSum(productRows.map(r => r.prevWingRev));
    const totalGrowthRev = safeSum(productRows.map(r => r.curGrowthRev));
    const totalPrevGrowthRev = safeSum(productRows.map(r => r.prevGrowthRev));
    const totalCafe24Ord = safeSum(productRows.map(r => completeMetricValue(r.current, 'cafe24_orders')));
    const totalPrevCafe24Ord = safeSum(productRows.map(r => completeMetricValue(r.previous, 'cafe24_orders')));
    const totalSSOrd = safeSum(productRows.map(r => completeMetricValue(r.current, 'smartstore_orders')));
    const totalPrevSSOrd = safeSum(productRows.map(r => completeMetricValue(r.previous, 'smartstore_orders')));
    const totalWingOrd = safeSum(productRows.map(r => completeMetricValue(r.current, 'coupang_wing_orders')));
    const totalPrevWingOrd = safeSum(productRows.map(r => completeMetricValue(r.previous, 'coupang_wing_orders')));
    const totalGrowthOrd = safeSum(productRows.map(r => completeMetricValue(r.current, 'coupang_growth_orders')));
    const totalPrevGrowthOrd = safeSum(productRows.map(r => completeMetricValue(r.previous, 'coupang_growth_orders')));

    return `
    <section class="marketing-comparison-section">
        <div class="overview-section-heading">
            <div><span>ALL PRODUCTS</span><h2>${state.marketingProducts.length}개 제품 통합 비교</h2></div>
            <small>${escapeHtml(metricDate)} · 각 행을 누르면 제품별 상세 보고서로 이동</small>
        </div>
        <div class="marketing-comparison-scroll">
            <table class="marketing-comparison-table">
                <thead>
                    <tr class="comparison-groups">
                        <th rowspan="2">브랜드·제품</th>
                        <th colspan="2" class="group-exposure">노출</th>
                        <th colspan="4" class="group-inflow">유입</th>
                        <th colspan="4" class="group-sales">판매량</th>
                        <th colspan="4" class="group-revenue">매출</th>
                        <th colspan="3" class="group-conversion">전환율</th>
                        <th colspan="2" class="group-performance">성과</th>
                    </tr>
                    <tr>
                        <th>메인 검색량</th><th>블로그</th>
                        <th>자사몰 방문</th><th>상품상세(PV)</th><th>스마트스토어</th><th>쿠팡</th>
                        <th>자사몰</th><th>스스</th><th>Wing</th><th>로켓그로스</th>
                        <th>자사몰</th><th>스스</th><th>Wing</th><th>로켓그로스</th>
                        <th>자사몰</th><th>스스</th><th>쿠팡</th>
                        <th>총매출</th><th>ROAS</th>
                    </tr>
                </thead>
                <tbody>
                    ${productRows.map(r => {
                        const { product, index, current, previous } = r;
                        return `
                        <tr class="${index > 0 && state.marketingProducts[index - 1]?.brand !== product.brand ? 'brand-divider' : ''}"
                            onclick="openProductReport('${product.id}')">
                            <th><small>${escapeHtml(product.brand)}</small><strong>${escapeHtml(product.name)}</strong></th>
                            ${renderOverviewMetricCell(r.currentSearch.value, r.previousSearch.value, { note: r.currentSearch.keyword })}
                            ${renderOverviewMetricCell(completeMetricValue(current, 'blog_views'), completeMetricValue(previous, 'blog_views'))}
                            ${r.isFirstBrandProduct ? renderOverviewMetricCell(r.currentStoreVisits, r.previousStoreVisits, {
                                note: `${product.brand} 몰 전체`,
                                rowspan: r.brandProducts.length,
                                className: 'brand-shared-cell',
                            }) : ''}
                            ${renderOverviewMetricCell(completeMetricValue(current, 'cafe24_product_views'), completeMetricValue(previous, 'cafe24_product_views'))}
                            ${renderOverviewMetricCell(current ? getChannelVisits(current, MARKETING_CHANNELS[1]) : null, previous ? getChannelVisits(previous, MARKETING_CHANNELS[1]) : null)}
                            ${renderOverviewMetricCell(completeCoupangValue(current, 'visits'), completeCoupangValue(previous, 'visits'))}
                            ${renderOverviewMetricCell(completeMetricValue(current, 'cafe24_orders'), completeMetricValue(previous, 'cafe24_orders'))}
                            ${renderOverviewMetricCell(completeMetricValue(current, 'smartstore_orders'), completeMetricValue(previous, 'smartstore_orders'))}
                            ${renderOverviewMetricCell(completeMetricValue(current, 'coupang_wing_orders'), completeMetricValue(previous, 'coupang_wing_orders'))}
                            ${renderOverviewMetricCell(completeMetricValue(current, 'coupang_growth_orders'), completeMetricValue(previous, 'coupang_growth_orders'))}
                            ${renderOverviewMetricCell(r.curCafe24Rev, r.prevCafe24Rev, { won: true })}
                            ${renderOverviewMetricCell(r.curSSRev, r.prevSSRev, { won: true })}
                            ${renderOverviewMetricCell(r.curWingRev, r.prevWingRev, { won: true })}
                            ${renderOverviewMetricCell(r.curGrowthRev, r.prevGrowthRev, { won: true })}
                            ${renderOverviewConversionCell(product.id, 'cafe24', metricDate)}
                            ${renderOverviewConversionCell(product.id, 'smartstore', metricDate)}
                            ${renderOverviewConversionCell(product.id, 'coupang', metricDate)}
                            ${renderOverviewMetricCell(r.currentRevenue, r.previousRevenue, { won: true })}
                            ${renderOverviewMetricCell(r.currentRoas, r.previousRoas, { percent: true })}
                        </tr>`;
                    }).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <th>합계</th>
                        <td></td><td></td>
                        <td></td><td></td><td></td><td></td>
                        ${renderOverviewMetricCell(totalCafe24Ord, totalPrevCafe24Ord)}
                        ${renderOverviewMetricCell(totalSSOrd, totalPrevSSOrd)}
                        ${renderOverviewMetricCell(totalWingOrd, totalPrevWingOrd)}
                        ${renderOverviewMetricCell(totalGrowthOrd, totalPrevGrowthOrd)}
                        ${renderOverviewMetricCell(totalCafe24Rev, totalPrevCafe24Rev, { won: true })}
                        ${renderOverviewMetricCell(totalSSRev, totalPrevSSRev, { won: true })}
                        ${renderOverviewMetricCell(totalWingRev, totalPrevWingRev, { won: true })}
                        ${renderOverviewMetricCell(totalGrowthRev, totalPrevGrowthRev, { won: true })}
                        <td></td><td></td><td></td>
                        ${renderOverviewMetricCell(totalRevenue, totalPrevRevenue, { won: true })}
                        ${renderOverviewMetricCell(totalRoas, totalPrevRoas, { percent: true })}
                    </tr>
                </tfoot>
            </table>
        </div>
    </section>`;
}

function computeOverviewNotables(expectedDate) {
    const prevDate = shiftMetricDate(expectedDate, -1);
    const bullets = [];
    const products = state.marketingProducts;
    const fmtDate = d => `${d.slice(5).replace('-', '/')}`;
    const fmtWon = v => new Intl.NumberFormat('ko-KR').format(Math.round(v));

    const getMetric = (pid, date) => getProductMetricOnDate(pid, date);

    const recentMetrics = (pid, date, days) => {
        const rows = [];
        for (let i = 1; i <= days; i++) {
            const d = shiftMetricDate(date, -i);
            const m = getMetric(pid, d);
            if (m) rows.push(m);
        }
        return rows;
    };

    const avg7 = (pid, date, key, getter) => {
        const rows = recentMetrics(pid, date, 7);
        if (!rows.length) return null;
        const vals = rows.map(m => getter ? getter(m) : nullableMetricNumber(m[key])).filter(v => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    const getBrandMetric = (brand, date) =>
        state.marketingBrandMetrics.find(m => m.brand === brand && m.metric_date === date) || null;

    const classifyAdType = creative => {
        const title = String(creative.title || '').toLowerCase();
        const adId = String(creative.ad_id || '').toLowerCase();
        if (title.includes('파컨') || adId.startsWith('grp-a001-03')) return '파컨';
        if (title.includes('파워링크') || adId.startsWith('grp-a001-01') || adId.startsWith('nad-a001-01')) return '파워링크';
        if (title.includes('쇼핑') || adId.startsWith('grp-a001-02')) return '쇼핑CPC';
        return null;
    };

    const getPaidCreativesForProduct = (brand, date, slug) => {
        const bm = getBrandMetric(brand, date);
        const creatives = bm?.source_details?.naver_ad_spend?.paid_creatives;
        if (!Array.isArray(creatives)) return [];
        return creatives.filter(c => c.product_slug === slug);
    };

    const buildTypeBreakdown = creatives => {
        const totals = {};
        for (const c of creatives) {
            const type = classifyAdType(c);
            if (type) totals[type] = (totals[type] || 0) + metricNumber(c.spend);
        }
        const parts = [];
        for (const t of ['파컨', '파워링크', '쇼핑CPC']) {
            if (totals[t] > 0) parts.push(`${t} ${fmtWon(totals[t])}`);
        }
        return parts.length ? parts.join(' · ') : null;
    };

    for (const product of products) {
        const cur = getMetric(product.id, expectedDate);
        const prev = getMetric(product.id, prevDate);

        const curSpend = cur ? nullableMetricNumber(cur.ad_spend) : null;
        const prevSpend = prev ? nullableMetricNumber(prev.ad_spend) : null;
        const avg7Spend = avg7(product.id, expectedDate, 'ad_spend', null);

        let spendFlagged = false;
        if (curSpend === null && prevSpend === null) {
            // both uncollected — skip
        } else if (curSpend === null) {
            // today uncollected — skip (미수집 only if needed)
        } else if (prevSpend !== null) {
            if (prevSpend === 0 && curSpend > 0) spendFlagged = true;
            else if (prevSpend > 0 && curSpend === 0) spendFlagged = true;
            else if (prevSpend > 0 && curSpend >= prevSpend * 1.8) spendFlagged = true;
            else if (prevSpend > 0 && curSpend <= prevSpend * 0.4) spendFlagged = true;
        } else if (avg7Spend !== null) {
            if (avg7Spend === 0 && curSpend > 0) spendFlagged = true;
            else if (avg7Spend > 0 && curSpend === 0) spendFlagged = true;
            else if (avg7Spend > 0 && curSpend >= avg7Spend * 2) spendFlagged = true;
        }

        if (spendFlagged && bullets.length < 5) {
            const prevLabel = prevSpend !== null ? `${fmtWon(prevSpend)}원` : '미수집';
            const curLabel = `${fmtWon(curSpend)}원`;
            let line = `${product.name} 광고비 ${fmtDate(prevDate)} ${prevLabel} → ${fmtDate(expectedDate)} ${curLabel}.`;
            const creatives = getPaidCreativesForProduct(product.brand, expectedDate, product.slug);
            const breakdown = buildTypeBreakdown(creatives);
            if (breakdown) line += ` ${breakdown}.`;
            bullets.push(line);
        }

        if (bullets.length >= 5) break;

        const curC24Rev = cur ? nullableMetricNumber(cur.cafe24_revenue) : null;
        const prevC24Rev = prev ? nullableMetricNumber(prev.cafe24_revenue) : null;
        const curC24Ord = cur ? nullableMetricNumber(cur.cafe24_orders) : null;
        const prevC24Ord = prev ? nullableMetricNumber(prev.cafe24_orders) : null;
        if (
            curC24Rev !== null && prevC24Rev !== null && prevC24Rev > 0 &&
            curC24Ord !== null && prevC24Ord !== null && prevC24Ord > 0
        ) {
            const revRatio = curC24Rev / prevC24Rev;
            const ordRatio = curC24Ord / prevC24Ord;
            if ((revRatio >= 1.5 || revRatio <= 0.5) && Math.abs(ordRatio - 1) < 0.3) {
                if (bullets.length < 5) {
                    const dir = revRatio >= 1.5 ? '증가' : '감소';
                    bullets.push(`${product.name} 자사몰 주문수 유사하나 매출 ${dir}. 구성 변화 (옵션수량 미수집).`);
                }
            }
        }
    }

    if (bullets.length < 5) {
        for (const product of products) {
            if (bullets.length >= 5) break;
            const cur = getMetric(product.id, expectedDate);
            const prev = getMetric(product.id, prevDate);

            const channels = [
                { key: 'cafe24_revenue', label: '자사몰 매출', won: true },
                { key: 'smartstore_revenue', label: '스스 매출', won: true },
                { key: 'cafe24_visits', label: '자사몰 유입', won: false },
                { key: 'smartstore_visits', label: '스스 유입', won: false },
            ];

            const cpCurRev = cur ? completeCoupangValue(cur, 'revenue') : null;
            const cpPrevRev = prev ? completeCoupangValue(prev, 'revenue') : null;
            if (cpCurRev !== null && cpPrevRev !== null && cpPrevRev > 0) {
                const ratio = cpCurRev / cpPrevRev;
                if ((ratio >= 2 || ratio <= 0.3) && bullets.length < 5) {
                    const dir = ratio >= 2 ? '급증' : '급감';
                    bullets.push(`${product.name} 쿠팡 매출 ${fmtDate(prevDate)} ${fmtWon(cpPrevRev)}원 → ${fmtDate(expectedDate)} ${fmtWon(cpCurRev)}원 (${dir}).`);
                }
            }

            const cpCurVis = cur ? completeCoupangValue(cur, 'visits') : null;
            const cpPrevVis = prev ? completeCoupangValue(prev, 'visits') : null;
            if (cpCurVis !== null && cpPrevVis !== null && cpPrevVis > 0) {
                const ratio = cpCurVis / cpPrevVis;
                if ((ratio >= 2 || ratio <= 0.3) && bullets.length < 5) {
                    const dir = ratio >= 2 ? '급증' : '급감';
                    bullets.push(`${product.name} 쿠팡 유입 ${fmtDate(prevDate)} ${fmtWon(cpPrevVis)} → ${fmtDate(expectedDate)} ${fmtWon(cpCurVis)} (${dir}).`);
                }
            }

            for (const ch of channels) {
                if (bullets.length >= 5) break;
                const curVal = cur ? nullableMetricNumber(cur[ch.key]) : null;
                const prevVal = prev ? nullableMetricNumber(prev[ch.key]) : null;
                if (curVal === null || prevVal === null || prevVal === 0) continue;
                const ratio = curVal / prevVal;
                if (ratio >= 2 || ratio <= 0.3) {
                    const dir = ratio >= 2 ? '급증' : '급감';
                    const unit = ch.won ? '원' : '';
                    bullets.push(`${product.name} ${ch.label} ${fmtDate(prevDate)} ${fmtWon(prevVal)}${unit} → ${fmtDate(expectedDate)} ${fmtWon(curVal)}${unit} (${dir}).`);
                }
            }
        }
    }

    if (bullets.length < 5) {
        for (const product of products) {
            if (bullets.length >= 5) break;
            const cur = getMetric(product.id, expectedDate);
            const prev = getMetric(product.id, prevDate);
            const avg7Rev = avg7(product.id, expectedDate, null, m => getComparisonRevenue(m));
            const curRev = cur ? getComparisonRevenue(cur) : null;
            if (curRev !== null && avg7Rev !== null && avg7Rev > 0) {
                const ratio = curRev / avg7Rev;
                if ((ratio >= 2 || ratio <= 0.4) && bullets.length < 5) {
                    const dir = ratio >= 2 ? '7일 평균 대비 급증' : '7일 평균 대비 급감';
                    bullets.push(`${product.name} 총매출 ${dir} (평균 ${fmtWon(avg7Rev)}원 → ${fmtWon(curRev)}원).`);
                }
            }
        }
    }

    return bullets.length ? bullets.slice(0, 5) : ['이상 없음'];
}

function renderOverviewDashboardView() {
    const expectedDate = kstDateString(-1);
    const previousDate = shiftMetricDate(expectedDate, -1);
    const productIds = new Set(state.marketingProducts.map(p => p.id));

    const searchCards = state.marketingProducts.map(product => {
        const current = getOverviewMainKeywordMetric(product, expectedDate);
        const prev = getOverviewMainKeywordMetric(product, previousDate);
        const delta = current.value !== null && prev.value !== null ? current.value - prev.value : null;
        return { product, keyword: current.keyword, value: current.value, delta };
    });

    const productSummaries = state.marketingProducts.map(product => {
        const metric = getProductMetricOnDate(product.id, expectedDate);
        const prevMetric = getProductMetricOnDate(product.id, previousDate);
        const revenue = metric ? getComparisonRevenue(metric) : null;
        const prevRevenue = prevMetric ? getComparisonRevenue(prevMetric) : null;
        const c24Rev = metric ? nullableMetricNumber(metric.cafe24_revenue) : null;
        const ssRev = metric ? nullableMetricNumber(metric.smartstore_revenue) : null;
        const cpRev = metric ? completeCoupangValue(metric, 'revenue') : null;
        const c24Visits = metric ? getChannelVisits(metric, MARKETING_CHANNELS[0]) : null;
        const ssVisits = metric ? getChannelVisits(metric, MARKETING_CHANNELS[1]) : null;
        const cpVisits = metric ? completeCoupangValue(metric, 'visits') : null;
        return { product, revenue, prevRevenue, c24Rev, ssRev, cpRev, c24Visits, ssVisits, cpVisits };
    });

    const safeSum = vals => { const v = vals.filter(x => x !== null && Number.isFinite(x)); return v.length ? v.reduce((a,b) => a+b, 0) : null; };
    const totalRevenue = safeSum(productSummaries.map(p => p.revenue));
    const totalPrevRevenue = safeSum(productSummaries.map(p => p.prevRevenue));
    const revDelta = totalRevenue !== null && totalPrevRevenue !== null ? totalRevenue - totalPrevRevenue : null;

    const totalInflow = safeSum(productSummaries.flatMap(p => [p.c24Visits, p.ssVisits, p.cpVisits]));
    const inflowParts = [
        { label: '자사몰', value: safeSum(productSummaries.map(p => p.c24Visits)) },
        { label: '스마트스토어', value: safeSum(productSummaries.map(p => p.ssVisits)) },
        { label: '쿠팡', value: safeSum(productSummaries.map(p => p.cpVisits)) },
    ];

    const allConvSummaries = getChannelConversionSummary(productIds, 'cafe24', expectedDate);
    const totalConvRate = allConvSummaries.current?.rate ?? null;

    return `
    ${renderNavbar()}
    <main class="internal-dashboard overview-dashboard">
        <section class="overview-top-bar">
            <div>
                <span class="eyebrow"><i class="ri-dashboard-line"></i> DAILY OVERVIEW</span>
                <h1>마케팅 <span>한눈에</span></h1>
            </div>
            <div class="overview-top-right">
                <span class="overview-reference-date">${escapeHtml(expectedDate)} 기준</span>
                <button class="btn btn-secondary btn-sm" onclick="showDailyMetricModal()"><i class="ri-edit-line"></i> 보완</button>
            </div>
        </section>

        <section class="marketing-view-switch">
            <button class="active" onclick="setMarketingView('overview')"><i class="ri-dashboard-line"></i> 통합 현황</button>
            <button onclick="setMarketingView('report')"><i class="ri-table-line"></i> 제품별 보고서</button>
            <button onclick="setMarketingView('funnel')"><i class="ri-line-chart-line"></i> 퍼널 분석</button>
            <button onclick="setMarketingView('okr')"><i class="ri-flag-line"></i> OKR 성과</button>
        </section>

        ${renderGrokBridgeStatus(expectedDate)}

        <section class="overview-section overview-section-exposure">
            <div class="overview-section-label"><i class="ri-eye-line"></i> 노출</div>
            <div class="overview-search-grid">
                ${searchCards.map(c => `
                <div class="overview-search-card">
                    <span class="overview-search-keyword">${escapeHtml(c.keyword)}</span>
                    <strong>${c.value !== null ? formatMetric(c.value) : '—'}</strong>
                    ${c.delta !== null ? `<small class="${c.delta > 0 ? 'up' : c.delta < 0 ? 'down' : 'same'}">${c.delta > 0 ? '▲' : c.delta < 0 ? '▼' : ''}${formatMetric(Math.abs(c.delta))}</small>` : '<small class="same">—</small>'}
                </div>`).join('')}
            </div>
        </section>

        <div class="overview-two-col">
            <section class="overview-section overview-section-inflow">
                <div class="overview-section-label"><i class="ri-route-line"></i> 유입</div>
                <div class="overview-inflow-total">
                    <strong>${totalInflow !== null ? formatMetric(totalInflow) : '—'}</strong>
                    <span>전체 유입</span>
                </div>
                <div class="overview-inflow-split">
                    ${inflowParts.filter(p => p.value !== null).map(p => `<span>${escapeHtml(p.label)} <b>${formatMetric(p.value)}</b></span>`).join('')}
                </div>
            </section>

            <section class="overview-section overview-section-conversion">
                <div class="overview-section-label"><i class="ri-shopping-cart-line"></i> 전환</div>
                <div class="overview-conv-kpis">
                    <div class="overview-conv-kpi">
                        <span>총매출</span>
                        <strong>${totalRevenue !== null ? formatWon(totalRevenue) : '—'}</strong>
                        ${revDelta !== null ? `<small class="${revDelta >= 0 ? 'up' : 'down'}">${revDelta >= 0 ? '▲' : '▼'} ${formatWon(Math.abs(revDelta))}</small>` : ''}
                    </div>
                    <div class="overview-conv-kpi">
                        <span>총전환율</span>
                        <strong>${totalConvRate !== null ? `${totalConvRate.toFixed(1)}%` : '—'}</strong>
                    </div>
                </div>
            </section>
        </div>

        <section class="overview-product-list">
            <div class="overview-product-header">
                <span class="col-name">제품</span>
                <span class="col-rev">매출</span>
                <span class="col-detail col-h-conv">자사몰</span>
                <span class="col-detail col-h-conv">스스</span>
                <span class="col-detail col-h-conv">쿠팡</span>
            </div>
            ${productSummaries.map(p => {
                const revDeltaP = p.revenue !== null && p.prevRevenue !== null ? p.revenue - p.prevRevenue : null;
                return `
            <div class="overview-product-row" onclick="openProductReport('${p.product.id}')">
                <span class="col-name"><small>${escapeHtml(p.product.brand)}</small><strong>${escapeHtml(p.product.name)}</strong></span>
                <span class="col-rev">
                    <strong>${p.revenue !== null ? formatWon(p.revenue) : '—'}</strong>
                    ${revDeltaP !== null ? `<small class="${revDeltaP >= 0 ? 'up' : 'down'}">${revDeltaP >= 0 ? '▲' : '▼'} ${formatWon(Math.abs(revDeltaP))}</small>` : ''}
                </span>
                <span class="col-detail">${p.c24Rev !== null ? formatWon(p.c24Rev) : '—'}</span>
                <span class="col-detail">${p.ssRev !== null ? formatWon(p.ssRev) : '—'}</span>
                <span class="col-detail">${p.cpRev !== null ? formatWon(p.cpRev) : '—'}</span>
            </div>`;
            }).join('')}
            <div class="overview-product-row overview-product-total">
                <span class="col-name"><strong>합계</strong></span>
                <span class="col-rev"><strong>${totalRevenue !== null ? formatWon(totalRevenue) : '—'}</strong></span>
                <span class="col-detail">${safeSum(productSummaries.map(p=>p.c24Rev)) !== null ? formatWon(safeSum(productSummaries.map(p=>p.c24Rev))) : ''}</span>
                <span class="col-detail">${safeSum(productSummaries.map(p=>p.ssRev)) !== null ? formatWon(safeSum(productSummaries.map(p=>p.ssRev))) : ''}</span>
                <span class="col-detail">${safeSum(productSummaries.map(p=>p.cpRev)) !== null ? formatWon(safeSum(productSummaries.map(p=>p.cpRev))) : ''}</span>
            </div>
        </section>

        <section class="overview-section overview-section-notables">
            <div class="overview-section-label"><i class="ri-error-warning-line"></i> 이상사항</div>
            <ul class="overview-notables-list">
                ${computeOverviewNotables(expectedDate).map(b =>
                    `<li>${escapeHtml(b)}</li>`
                ).join('')}
            </ul>
        </section>
    </main>`;
}

function renderInternalReportView() {
    const product = getReportProduct();
    if (!product) return `${renderNavbar()}<main class="internal-dashboard"><div class="marketing-empty-row">제품 정보를 불러오는 중입니다.</div></main>`;
    const keywords = PRODUCT_KEYWORDS[product.slug] || [product.name];
    const expectedDate = kstDateString(-1);

    return `
    ${renderNavbar()}
    <main class="internal-dashboard report-dashboard">
        <section class="report-header">
            <div>
                <span class="eyebrow"><i class="ri-file-chart-line"></i> DAILY MARKETING REPORT</span>
                <h1>제품별 <span>일일 보고서</span></h1>
                <p>기존 엑셀과 같은 순서로 최근 실적을 빠르게 비교합니다.</p>
            </div>
            <div class="internal-actions">
                <button class="btn btn-secondary" onclick="showGoogleSheetImportModal()"><i class="ri-google-line"></i> 임시 시트 가져오기</button>
                <button class="btn btn-primary" onclick="showDailyMetricModal()"><i class="ri-add-line"></i> 누락 데이터 보완</button>
            </div>
        </section>

        <section class="marketing-view-switch">
            <button onclick="setMarketingView('overview')"><i class="ri-dashboard-line"></i> 통합 현황</button>
            <button class="active" onclick="setMarketingView('report')"><i class="ri-table-line"></i> 제품별 보고서</button>
            <button onclick="setMarketingView('funnel')"><i class="ri-line-chart-line"></i> 퍼널 분석</button>
            <button onclick="setMarketingView('okr')"><i class="ri-flag-line"></i> OKR 성과</button>
        </section>

        ${renderGrokBridgeStatus(expectedDate)}

        <section class="report-controls">
            <div class="report-product-tabs">
                ${state.marketingProducts.map(item => `
                    <button class="${item.id === product.id ? 'active' : ''}" onclick="selectMarketingProduct('${item.id}')">
                        <small>${escapeHtml(item.brand)}</small><strong>${escapeHtml(item.name)}</strong>
                    </button>`).join('')}
            </div>
            <div class="period-select-group">
                <select class="filter-select" onchange="changeReportPeriod(this.value)">
                    ${renderPeriodOptions(state.reportPeriod, true)}
                </select>
                ${renderCustomDateRange(state.reportPeriod, 'changeCustomReportDate', state.customReportDateFrom, state.customReportDateTo)}
            </div>
        </section>

        <section class="report-keywords">
            <span>추적 키워드</span>
            ${keywords.map(keyword => `<b>${escapeHtml(keyword)}</b>`).join('')}
        </section>

        <section class="excel-report-card">
            ${renderDailyReportTable(product)}
        </section>

        <p class="report-help"><i class="ri-information-line"></i> 숫자가 없는 날짜는 — 로 표시됩니다. 자동 수집이 실패한 항목만 우측 상단에서 임시 보완할 수 있습니다.</p>
    </main>`;
}

function renderInternalDashboardView() {
    if (state.marketingView === 'overview') return renderOverviewDashboardView();
    if (state.marketingView === 'report') return renderInternalReportView();
    if (state.marketingView === 'okr') return renderOkrDashboardView();
    return renderFunnelDashboardView();
}

function getGrokBridgeStatus(metricDate) {
    const client = state.marketingBridgeClients.find(item => item.client_key === 'grok-marketing-ops') || null;
    const kstToday = kstDateString(0);
    const jobs = state.marketingBridgeJobs.filter(job => job.metric_date === metricDate && job.metric_date < kstToday);
    const metricsByProduct = new Map(
        state.marketingMetrics
            .filter(metric => metric.metric_date === metricDate)
            .map(metric => [metric.product_id, metric])
    );
    const missingProducts = metricDate >= kstToday ? [] : state.marketingProducts.filter(product => {
        const metric = metricsByProduct.get(product.id);
        return !metric ||
            !hasCollectedMetric(metric, 'smartstore_visits') ||
            !hasCollectedMetric(metric, 'smartstore_pay_count') ||
            !hasCollectedMetric(metric, 'smartstore_conversion_rate') ||
            !hasCollectedMetric(metric, 'smartstore_orders') ||
            !hasCollectedMetric(metric, 'smartstore_revenue') ||
            !hasCollectedCoupangMetric(metric, 'visits') ||
            !hasCollectedCoupangMetric(metric, 'orders') ||
            !hasCollectedCoupangMetric(metric, 'revenue') ||
            !hasCollectedMetric(metric, 'coupang_conversion_rate');
    });
    const needsLogin = jobs.find(job => job.status === 'needs_login');
    const failed = jobs.find(job => job.status === 'failed');
    const working = jobs.filter(job => ['pending', 'claimed'].includes(job.status));
    const overdue = working.find(job => isGrokJobOverdue(job));
    const issue = needsLogin || failed || null;
    const providerLabel = provider => provider === 'coupang' ? '쿠팡' : '스마트스토어';
    const accountLabel = account => account === 'innerium' ? '이너리움' : account === 'yural' ? '유랄' : account;
    const lastSeenAt = client?.last_seen_at ? new Date(client.last_seen_at) : null;
    const stale = lastSeenAt && Date.now() - lastSeenAt.getTime() > 26 * 60 * 60 * 1000;
    const clientRunbookVersion = Number(client?.details?.runbook_version) || null;
    const runbookOutdated = Boolean(client?.last_seen_at) &&
        clientRunbookVersion !== GROK_RUNBOOK_VERSION;
    const clientNeedsLogin = client?.status === 'needs_login' ||
        Object.values(client?.details?.sessions || {}).includes('needs_login');
    const clientFailed = client?.status === 'error' ||
        client?.details?.last_verification?.status === 'fail';
    const lastSeenLabel = lastSeenAt && !Number.isNaN(lastSeenAt.getTime())
        ? lastSeenAt.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '연결 전';

    if (issue) {
        const loginRequired = issue.status === 'needs_login';
        return {
            state: 'error',
            title: loginRequired
                ? `${accountLabel(issue.account)} ${providerLabel(issue.provider)} 재로그인 필요`
                : `${accountLabel(issue.account)} ${providerLabel(issue.provider)} 복구 실패`,
            detail: issue.last_error || 'Grok Bot 작업 이력을 확인하세요.',
            lastSeenLabel,
            issue,
        };
    }
    if (clientNeedsLogin || clientFailed) {
        return {
            state: 'error',
            title: clientNeedsLogin ? 'Grok Bot Bridge 재로그인 필요' : 'Grok Bot 검증 실패',
            detail: client?.last_error || 'Grok Bot 세션 또는 최근 검증 결과를 확인하세요.',
            lastSeenLabel,
            issue: client,
        };
    }
    if (overdue) {
        return {
            state: 'error',
            title: `${accountLabel(overdue.account)} ${providerLabel(overdue.provider)} 예약 수집 미실행`,
            detail: '예약 시간 후 30분이 지났지만 Grok Bot이 작업을 완료하지 못했습니다.',
            lastSeenLabel,
            issue: overdue,
        };
    }
    if (working.length) {
        return {
            state: 'waiting',
            title: `Grok Bot 복구 작업 ${working.length}건 대기`,
            detail: `${working.map(job => `${accountLabel(job.account)} ${providerLabel(job.provider)}`).join(' · ')}${
                runbookOutdated ? ` · 운영지침 v${GROK_RUNBOOK_VERSION} 업데이트 필요` : ''
            }`,
            lastSeenLabel,
            issue: null,
        };
    }
    if (!client?.last_seen_at) {
        return {
            state: 'setup',
            title: 'Grok Bot Bridge 연결 대기',
            detail: 'Secure Secret 연결 후 첫 상태 확인을 실행하세요.',
            lastSeenLabel,
            issue: null,
        };
    }
    if (missingProducts.length) {
        return {
            state: 'waiting',
            title: 'Grok Bot 로그인 채널 수집 대기',
            detail: `${missingProducts.length}개 제품의 스마트스토어·쿠팡 확정값을 기다리고 있습니다.`,
            lastSeenLabel,
            issue: null,
        };
    }
    if (runbookOutdated) {
        return {
            state: 'waiting',
            title: 'Grok Bot 운영지침 업데이트 대기',
            detail: `현재 v${clientRunbookVersion} · 필요한 버전 v${GROK_RUNBOOK_VERSION}`,
            lastSeenLabel,
            issue: null,
        };
    }
    if (stale) {
        return {
            state: 'waiting',
            title: 'Grok Bot 확인 필요',
            detail: '마지막 Bridge 접속 후 26시간이 지났습니다.',
            lastSeenLabel,
            issue: null,
        };
    }
    return {
        state: 'success',
        title: 'Grok Bot Bridge 정상',
        detail: '전일 스마트스토어·쿠팡 데이터가 모두 확인되었습니다.',
        lastSeenLabel,
        issue: null,
    };
}

function isGrokJobOverdue(job, now = new Date()) {
    if (!job?.metric_date || !['pending', 'claimed'].includes(job.status)) return false;
    if (job.metric_date >= kstDateString(0)) return false;
    const [hour, minute] = job.provider === 'coupang' ? [12, 40] : [9, 30];
    const nextDay = new Date(`${job.metric_date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const deadline = new Date(
        `${nextDay.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`
    ).getTime() + 30 * 60 * 1000;
    return now.getTime() > deadline;
}

function renderGrokBridgeStatus(metricDate) {
    const bridge = getGrokBridgeStatus(metricDate);
    const icon = bridge.state === 'error'
        ? 'ri-error-warning-line'
        : bridge.state === 'success'
            ? 'ri-robot-2-line'
            : 'ri-loader-4-line';
    return `
        <section class="grok-bridge-status ${bridge.state}">
            <div class="grok-bridge-main">
                <i class="${icon}"></i>
                <span><strong>${escapeHtml(bridge.title)}</strong><small>${escapeHtml(bridge.detail)}</small></span>
            </div>
            <span class="grok-bridge-seen">마지막 접속 ${escapeHtml(bridge.lastSeenLabel)}</span>
        </section>`;
}

function renderFunnelDashboardView() {
    const metrics = getVisibleMarketingMetrics();
    const health = calculateMarketingHealth(metrics);
    const { total } = health;
    const roas = total.revenueComplete && total.adSpendComplete && total.ad_spend > 0
        ? percent(total.revenue, total.ad_spend)
        : null;
    const brands = [...new Set(state.marketingProducts.map(product => product.brand))];
    const expectedDate = kstDateString(-1);
    const expectedBatch = state.marketingBatches.find(batch => batch.metric_date === expectedDate);
    const batchAgeMinutes = expectedBatch ? (Date.now() - new Date(expectedBatch.started_at).getTime()) / 60000 : 0;
    let runStatus = expectedBatch?.status === 'running' && batchAgeMinutes > 30
        ? 'failed'
        : (expectedBatch?.status || 'skipped');
    const bridgeStatus = getGrokBridgeStatus(expectedDate);
    if (bridgeStatus.state === 'error') runStatus = 'failed';
    else if (bridgeStatus.state === 'waiting' && runStatus === 'success') runStatus = 'running';
    const runLabel = bridgeStatus.state === 'error'
        ? bridgeStatus.title
        : bridgeStatus.state === 'waiting'
        ? bridgeStatus.title
        : ({
        success: '서버 API·Grok 자동수집 완료',
        partial: '서버 API 일부 누락',
        failed: '자동수집 실패',
        running: '자동수집 중',
        skipped: '자동수집 설정 대기',
    }[runStatus] || '수집 상태 확인');
    const runError = bridgeStatus.issue?.last_error ||
        expectedBatch?.details?.provider_results?.find(result => result.status !== 'success')?.error ||
        '';

    return `
    ${renderNavbar()}
    <main class="internal-dashboard">
        <section class="internal-hero">
            <div>
                <span class="eyebrow"><i class="ri-pulse-line"></i> COMPANY INSIGHT</span>
                <h1>마케팅 흐름을 <span>한눈에</span></h1>
                <p>노출부터 검색, 유입, 판매까지 매일 같은 기준으로 확인합니다.</p>
            </div>
            <div class="internal-actions">
                <span class="sync-status ${['failed', 'partial', 'skipped'].includes(runStatus) ? 'waiting' : ''}"
                      ${runError ? `title="${escapeHtml(runError)}"` : ''}>
                    <i class="${runStatus === 'success' ? 'ri-checkbox-circle-line' : 'ri-time-line'}"></i>
                    ${runLabel}
                </span>
                <button class="btn btn-secondary" onclick="showDailyMetricModal()"><i class="ri-edit-line"></i> 누락 데이터 보완</button>
            </div>
        </section>

        <section class="marketing-view-switch">
            <button onclick="setMarketingView('overview')"><i class="ri-dashboard-line"></i> 통합 현황</button>
            <button onclick="setMarketingView('report')"><i class="ri-table-line"></i> 제품별 보고서</button>
            <button class="active" onclick="setMarketingView('funnel')"><i class="ri-line-chart-line"></i> 퍼널 분석</button>
            <button onclick="setMarketingView('okr')"><i class="ri-flag-line"></i> OKR 성과</button>
        </section>

        ${renderGrokBridgeStatus(expectedDate)}

        <section class="marketing-toolbar">
            <div class="marketing-product-filter">
                <button class="${state.selectedMarketingProduct === 'all' ? 'active' : ''}" onclick="selectMarketingProduct('all')">전체 브랜드</button>
                ${brands.map(brand => `
                    <button class="${state.selectedMarketingProduct === `brand:${brand}` ? 'active' : ''}" onclick="selectMarketingBrand('${encodeURIComponent(brand)}')">${escapeHtml(brand)}</button>
                `).join('')}
            </div>
            <div class="period-select-group">
                <select class="filter-select" onchange="changeMarketingPeriod(this.value)">
                    ${renderPeriodOptions(state.marketingPeriod)}
                </select>
                ${renderCustomDateRange(state.marketingPeriod, 'changeCustomMarketingDate', state.customDateFrom, state.customDateTo)}
            </div>
        </section>

        ${state.profile?.role_id === 'admin' ? `
        <section class="channel-connection-panel">
            <div><i class="ri-store-2-line"></i><span><strong>Cafe24 자동수집</strong><small>상품별 판매량·매출을 매일 09시에 수집합니다.</small></span></div>
            <div>
                <button class="btn btn-secondary btn-sm" onclick="connectCafe24('innerium', this)">이너리움 연결</button>
                <button class="btn btn-secondary btn-sm" onclick="connectCafe24('jgohdapt', this)">유랄 연결</button>
            </div>
        </section>` : ''}

        <section class="funnel-panel">
            <div class="funnel-heading">
                <div><span>10·10 FUNNEL</span><h2>노출에서 구매까지</h2></div>
                <div class="ten-ten-index ${getIndexStatus(health.overallIndex)}"><small>종합 장스 지수</small><strong>${formatIndex(health.overallIndex)}</strong><span>100 기준</span></div>
            </div>
            <div class="marketing-index-grid">
                ${renderIndexCard('노출지수', health.exposureIndex, '월 20만 뷰 목표 진도', 'ri-eye-line')}
                ${renderIndexCard('유입지수', health.trafficIndex, `현재 ${health.trafficRate === null ? '측정 불가' : `${health.trafficRate.toFixed(1)}%`}`, 'ri-route-line')}
                ${renderIndexCard('전환지수', health.conversionIndex, `현재 ${health.conversionRate === null ? '측정 불가' : `${health.conversionRate.toFixed(1)}%`}`, 'ri-shopping-cart-line')}
            </div>
            <div class="funnel-flow">
                <div class="funnel-step"><i class="ri-eye-line"></i><span>콘텐츠 노출</span><strong>${total.exposureComplete ? formatMetric(total.content_views) : '—'}</strong><small>${total.exposureComplete ? `블로그 ${formatMetric(total.blog_views)} + 카페 ${formatMetric(total.cafe_views)}` : '노출 데이터 미수집'}</small></div>
                <div class="funnel-rate"><i class="ri-arrow-right-line"></i><b>${health.trafficRate === null ? '—' : `${health.trafficRate.toFixed(1)}%`}</b></div>
                <div class="funnel-step search"><i class="ri-links-line"></i><span>측정 가능 유입</span><strong>${total.channelPairsMeasured ? formatMetric(total.visits) : '—'}</strong><small>${[...total.measuredChannels].join('·') || '채널 연결 필요'}</small></div>
                <div class="funnel-rate"><i class="ri-arrow-right-line"></i><b>${health.conversionRate === null ? '—' : `${health.conversionRate.toFixed(1)}%`}</b></div>
                <div class="funnel-step visit"><i class="ri-shopping-bag-3-line"></i><span>전체 구매</span><strong>${total.salesComplete ? `${formatMetric(total.orders)}건` : '—'}</strong><small>자사몰·스마트스토어·쿠팡</small></div>
                <div class="funnel-rate reference"><i class="ri-more-line"></i><b>참고</b></div>
                <div class="funnel-step sales"><i class="ri-money-dollar-circle-line"></i><span>전체 매출</span><strong>${total.revenueComplete ? formatWon(total.revenue) : '—'}</strong><small>3개 판매채널 합계</small></div>
            </div>
            <p class="funnel-disclaimer"><i class="ri-information-line"></i> 총판매량은 전 채널을 합산합니다. 전환율은 방문자와 구매가 모두 확보된 동일 채널만 사용하며 현재 데이터 완성도는 ${health.dataCoverage.toFixed(0)}%입니다.</p>
        </section>

        <section class="marketing-kpis">
            <div class="marketing-kpi keyword-kpi"><span>브랜드 검색량 · 키워드별</span>${renderKeywordSearchOverview(metrics)}<small>직전 수집 대비 최저 변화 ${health.searchMomentum === null ? '비교 불가' : `${health.searchMomentum >= 0 ? '+' : ''}${health.searchMomentum.toFixed(1)}%`}</small></div>
            <div class="marketing-kpi"><span>측정 가능 유입</span><strong>${total.channelPairsMeasured ? formatMetric(total.visits) : '—'}</strong><small>방문자가 확보된 채널 합계</small></div>
            <div class="marketing-kpi"><span>총 매출</span><strong>${total.revenueComplete ? formatWon(total.revenue) : '—'}</strong><small>카페24·쿠팡·스마트스토어</small></div>
            <div class="marketing-kpi"><span>광고비</span><strong>${total.adSpendComplete ? formatWon(total.ad_spend) : '—'}</strong><small>선택 기간 합계</small></div>
            <div class="marketing-kpi"><span>ROAS</span><strong>${roas === null ? '—' : `${roas.toFixed(0)}%`}</strong><small>매출 ÷ 광고비</small></div>
            <div class="marketing-kpi accent"><span>구매 전환율</span><strong>${health.conversionRate === null ? '—' : `${health.conversionRate.toFixed(1)}%`}</strong><small>측정 채널 목표 10%</small></div>
        </section>

        <section class="metric-product-grid">
            ${state.marketingProducts.map(renderProductMetricCard).join('')}
        </section>

        <section class="marketing-bottom-grid">
            <div class="marketing-section-card">
                <div class="marketing-section-title"><div><span>DAILY RECORD</span><h2>일자별 기록</h2></div><i class="ri-calendar-check-line"></i></div>
                ${renderMarketingDailyTable(metrics)}
            </div>
            <div class="marketing-section-card diagnosis-card">
                <div class="marketing-section-title"><div><span>CHECK POINT</span><h2>선택 기간 진단</h2></div><i class="ri-stethoscope-line"></i></div>
                <div class="diagnosis-list">${renderMarketingDiagnosis(health)}</div>
            </div>
        </section>
    </main>`;
}

function renderIndexCard(label, value, description, icon) {
    const status = getIndexStatus(value);
    const statusLabel = { danger: '집중 필요', stable: '안정', excellent: '우수', unknown: '데이터 필요' }[status];
    return `
    <div class="marketing-index-card ${status}">
        <div><i class="${icon}"></i><span>${label}</span><b>${statusLabel}</b></div>
        <strong>${formatIndex(value)}</strong>
        <small>${description}</small>
    </div>`;
}

function getOkrPeriod(periodType) {
    const reference = new Date(`${kstDateString(-1)}T00:00:00`);
    if (periodType === 'quarter') {
        const startMonth = Math.floor(reference.getMonth() / 3) * 3;
        return {
            start: new Date(reference.getFullYear(), startMonth, 1),
            end: new Date(reference.getFullYear(), startMonth + 3, 0),
            label: `${reference.getFullYear()}년 ${Math.floor(reference.getMonth() / 3) + 1}분기`,
        };
    }
    return {
        start: new Date(reference.getFullYear(), 0, 1),
        end: new Date(reference.getFullYear(), 11, 31),
        label: `${reference.getFullYear()}년`,
    };
}

function getOkrTarget(periodType, periodStart) {
    const brands = getSelectedBrands();
    const selectedIds = getSelectedProductIds();
    const exact = state.marketingTargets.filter(target =>
        target.period_type === periodType &&
        target.period_start === localDateString(periodStart) &&
        ((target.scope_type === 'brand' && brands.includes(target.scope_key)) ||
         (target.scope_type === 'product' && selectedIds.has(target.scope_key)))
    );
    if (exact.length) {
        return exact.reduce((total, target) => ({
            content_views_target: total.content_views_target + metricNumber(target.content_views_target),
            orders_target: total.orders_target + metricNumber(target.orders_target),
            revenue_target: total.revenue_target + metricNumber(target.revenue_target),
            ad_spend_budget: total.ad_spend_budget + metricNumber(target.ad_spend_budget),
        }), { content_views_target: 0, orders_target: 0, revenue_target: 0, ad_spend_budget: 0 });
    }
    const monthly = getMonthTarget();
    const multiplier = periodType === 'quarter' ? 3 : 12;
    return { content_views_target: metricNumber(monthly.content_views_target) * multiplier, orders_target: 0, revenue_target: 0, ad_spend_budget: 0 };
}

function renderOkrMetric(label, actual, target, formatter = formatMetric) {
    const measured = actual !== null;
    const hasTarget = target > 0;
    const rate = measured && hasTarget ? percent(actual, target) : null;
    return `
    <div class="okr-metric">
        <span>${label}</span>
        <strong>${measured ? formatter(actual) : '—'}</strong>
        <small>${!measured
            ? hasTarget ? `목표 ${formatter(target)} · 실적 미수집` : '데이터 미수집'
            : hasTarget ? `목표 ${formatter(target)} · ${rate.toFixed(1)}%` : '목표 설정 필요'}</small>
        <div class="okr-progress"><i style="width:${Math.min(rate || 0, 100)}%"></i></div>
    </div>`;
}

function renderOkrPeriodCard(periodType) {
    const period = getOkrPeriod(periodType);
    const referenceDate = new Date(`${kstDateString(-1)}T00:00:00`);
    const periodMetrics = getMetricsInDateRange(localDateString(period.start), localDateString(referenceDate));
    const total = aggregateMarketingMetrics(periodMetrics);
    const target = getOkrTarget(periodType, period.start);
    const elapsedDays = Math.max(1, Math.ceil((referenceDate - period.start) / 86400000) + 1);
    const totalDays = Math.ceil((period.end - period.start) / 86400000) + 1;
    const measuredViews = total.exposureComplete ? total.content_views : null;
    const forecastViews = measuredViews === null ? null : Math.round((measuredViews / elapsedDays) * totalDays);
    const remainingViews = measuredViews === null ? null : Math.max(0, target.content_views_target - measuredViews);
    const remainingDays = Math.max(1, totalDays - elapsedDays);

    return `
    <section class="marketing-section-card okr-period-card">
        <div class="marketing-section-title">
            <div><span>${periodType.toUpperCase()} OKR</span><h2>${period.label}</h2></div>
            <i class="ri-flag-line"></i>
        </div>
        <div class="okr-grid">
            ${renderOkrMetric('콘텐츠 노출', measuredViews, target.content_views_target)}
            ${renderOkrMetric('판매량', total.salesComplete ? total.orders : null, target.orders_target)}
            ${renderOkrMetric('매출', total.revenueComplete ? total.revenue : null, target.revenue_target, formatWon)}
            ${renderOkrMetric('광고비', total.adSpendComplete ? total.ad_spend : null, target.ad_spend_budget, formatWon)}
        </div>
        <div class="okr-forecast">
            <span><b>${forecastViews === null ? '—' : formatMetric(forecastViews)}</b> 현재 속도 예상 노출</span>
            <span><b>${remainingViews === null ? '—' : formatMetric(Math.ceil(remainingViews / remainingDays))}</b> 목표 달성에 필요한 일평균 노출</span>
        </div>
    </section>`;
}

function renderOkrDashboardView() {
    const brands = [...new Set(state.marketingProducts.map(product => product.brand))];
    return `
    ${renderNavbar()}
    <main class="internal-dashboard">
        <section class="internal-hero">
            <div><span class="eyebrow"><i class="ri-flag-line"></i> PERFORMANCE OKR</span><h1>분기·연간 목표를 <span>숫자로</span></h1><p>일별 원천 데이터로 목표 달성률과 필요한 실행량을 계산합니다.</p></div>
        </section>
        <section class="marketing-view-switch">
            <button onclick="setMarketingView('overview')"><i class="ri-dashboard-line"></i> 통합 현황</button>
            <button onclick="setMarketingView('report')"><i class="ri-table-line"></i> 제품별 보고서</button>
            <button onclick="setMarketingView('funnel')"><i class="ri-line-chart-line"></i> 퍼널 분석</button>
            <button class="active" onclick="setMarketingView('okr')"><i class="ri-flag-line"></i> OKR 성과</button>
        </section>
        <section class="marketing-toolbar">
            <div class="marketing-product-filter">
                <button class="${state.selectedMarketingProduct === 'all' ? 'active' : ''}" onclick="selectMarketingProduct('all')">전체 브랜드</button>
                ${brands.map(brand => `<button class="${state.selectedMarketingProduct === `brand:${brand}` ? 'active' : ''}" onclick="selectMarketingBrand('${encodeURIComponent(brand)}')">${escapeHtml(brand)}</button>`).join('')}
            </div>
        </section>
        <div class="okr-periods">
            ${renderOkrPeriodCard('quarter')}
            ${renderOkrPeriodCard('year')}
        </div>
    </main>`;
}

function selectMarketingProduct(productId) {
    state.selectedMarketingProduct = productId;
    renderApp();
}

function openProductReport(productId) {
    state.selectedMarketingProduct = productId;
    state.marketingView = 'report';
    renderApp();
}

function selectMarketingBrand(encodedBrand) {
    state.selectedMarketingProduct = `brand:${decodeURIComponent(encodedBrand)}`;
    renderApp();
}

function setMarketingView(view) {
    state.marketingView = view;
    if (view === 'report' && !state.marketingProducts.some(product => product.id === state.selectedMarketingProduct)) {
        state.selectedMarketingProduct = state.marketingProducts[0]?.id || 'all';
    }
    renderApp();
}

function renderPeriodOptions(selected, isReport = false) {
    const options = isReport
        ? [
            ['1d', '어제'],
            ['3d', '최근 3일'],
            ['7d', '최근 7일'],
            ['14d', '최근 14일'],
            ['30d', '최근 30일'],
            ['prev_month', '전월'],
            ['custom', '사용자 지정'],
        ]
        : [
            ['1d', '어제'],
            ['7d', '최근 7일'],
            ['14d', '최근 14일'],
            ['30d', '최근 30일'],
            ['week', '이번 주'],
            ['month', '이번 달'],
            ['prev_month', '전월'],
            ['custom', '사용자 지정'],
        ];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function changeReportPeriod(value) {
    state.reportPeriod = value;
    if (value === 'custom' && !state.customReportDateFrom) {
        state.customReportDateFrom = kstDateString(-1);
        state.customReportDateTo = kstDateString(-1);
    }
    renderApp();
}

function changeMarketingPeriod(value) {
    state.marketingPeriod = value;
    if (value === 'custom' && !state.customDateFrom) {
        state.customDateFrom = kstDateString(-1);
        state.customDateTo = kstDateString(-1);
    }
    renderApp();
}

function changeCustomMarketingDate(field, value) {
    if (field === 'from') state.customDateFrom = value;
    else state.customDateTo = value;
    renderApp();
}

function changeCustomReportDate(field, value) {
    if (field === 'from') state.customReportDateFrom = value;
    else state.customReportDateTo = value;
    renderApp();
}

function renderCustomDateRange(period, changeFn, fromValue, toValue) {
    if (period !== 'custom') return '';
    const maxDate = kstDateString(0);
    return `<div class="custom-date-range">
        <input type="date" class="report-date-input" value="${fromValue || ''}" max="${maxDate}" onchange="${changeFn}('from', this.value)">
        <span class="custom-date-sep">~</span>
        <input type="date" class="report-date-input" value="${toValue || ''}" max="${maxDate}" onchange="${changeFn}('to', this.value)">
    </div>`;
}

function showGoogleSheetImportModal() {
    const savedToken = localStorage.getItem('jangsai-sheet-token') || '';
    showModal(`
        <div class="modal-header">
            <h3>구글시트 데이터 가져오기</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <div class="sheet-import-info">
                <i class="ri-file-excel-2-line"></i>
                <div><strong>자동화 전환용 임시 가져오기</strong><span>자동 수집 전까지 시트의 입력된 항목만 보완하며 기존 API 데이터는 덮지 않습니다.</span></div>
            </div>
            <form onsubmit="handleGoogleSheetImport(event)">
                <div class="form-group">
                    <label class="form-label">Apps Script 접근 코드</label>
                    <input class="form-input" type="password" id="sheet-access-token" value="${escapeHtml(savedToken)}" required autocomplete="off">
                    <div class="form-hint">Apps Script의 TOKEN 값입니다. 소스코드나 서버에는 저장하지 않습니다.</div>
                </div>
                <label class="checkbox-label sheet-remember-token">
                    <input type="checkbox" id="sheet-remember" ${savedToken ? 'checked' : ''}>
                    <span>이 브라우저에 접근 코드 저장</span>
                </label>
                <button type="submit" class="btn btn-primary btn-block mt-3" id="sheet-import-submit">
                    <i class="ri-download-cloud-line"></i> 지금 가져오기
                </button>
            </form>
        </div>`);
}

function parseSheetNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const normalized = String(value).replace(/[₩원,\s]/g, '');
    const number = Number(normalized.replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number : 0;
}

function hasSheetValue(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
}

function parseKeywordSearchValue(value) {
    return String(value || '')
        .split('/')
        .reduce((sum, part) => sum + Math.max(0, parseSheetNumber(part)), 0);
}

function parseSheetMetricDate(value, year) {
    const match = String(value || '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!match) return null;
    return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function normalizeSheetLabel(value) {
    return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function canonicalProductKeyword(productSlug, keyword) {
    const normalized = String(keyword || '').replace(/\s+/g, '');
    if (productSlug === 'yural-tonggam-cream') return normalized.includes('유랄') ? '유랄통감크림' : '통감크림';
    if (productSlug === 'yural-myeongga-bonhwan') return normalized.includes('유랄') ? '유랄명가본환' : '명가본환';
    return String(keyword || '').trim();
}

function parseGoogleSheetMetrics(payload) {
    const rows = payload.values || [];
    const year = new Date(payload.updatedAt || Date.now()).getFullYear();
    const blockDefinitions = [
        { slug: 'innerium-gala431', labels: ['갈라431'] },
        { slug: 'innerium-minti431', labels: ['민티431'] },
        { slug: 'yural-tonggam-cream', labels: ['유랄통감크림'] },
        { slug: 'yural-myeongga-bonhwan', labels: ['유랄명가본환'] },
    ];
    const titleColumn = 6;
    const subLabelColumn = 7;
    const firstDateColumn = 8;
    const records = [];

    blockDefinitions.forEach((definition, definitionIndex) => {
        const normalizedLabels = definition.labels.map(normalizeSheetLabel);
        const startRow = rows.findIndex(row => normalizedLabels.includes(normalizeSheetLabel(row[titleColumn])));
        if (startRow < 0) return;

        const nextStarts = blockDefinitions.slice(definitionIndex + 1)
            .map(next => rows.findIndex((row, index) => index > startRow && next.labels.map(normalizeSheetLabel).includes(normalizeSheetLabel(row[titleColumn]))))
            .filter(index => index > startRow);
        const endRow = nextStarts.length ? Math.min(...nextStarts) : rows.length;
        const blockRows = rows.slice(startRow, endRow);
        const dateRow = blockRows.find(row => normalizeSheetLabel(row[titleColumn]) === '날짜');
        if (!dateRow) return;

        const findRow = (column, labels) => blockRows.find(row => labels.includes(normalizeSheetLabel(row[column])));
        const siteVisitsRow = findRow(titleColumn, ['자사몰유입수']);
        const blogViewsRow = findRow(titleColumn, ['블로그방문자수', '블로그조회수']) || findRow(subLabelColumn, ['블로그방문자수', '블로그조회수']);
        const cafeViewsRow = findRow(titleColumn, ['카페글조회수', '카페조회수']) || findRow(subLabelColumn, ['카페글조회수', '카페조회수']);
        const smartstoreVisitsRow = findRow(titleColumn, ['스마트스토어유입수', '스마트스토어방문자수']) || findRow(subLabelColumn, ['스마트스토어유입수', '스마트스토어방문자수']);
        const coupangVisitsRow = findRow(titleColumn, ['쿠팡유입수', '쿠팡방문자수']) || findRow(subLabelColumn, ['쿠팡유입수', '쿠팡방문자수']);
        const coupangWingVisitsRow = findRow(titleColumn, ['쿠팡윙유입수', '쿠팡윙방문자수']) || findRow(subLabelColumn, ['쿠팡윙유입수', '쿠팡윙방문자수']);
        const coupangGrowthVisitsRow = findRow(titleColumn, ['로켓그로스유입수', '로켓그로스방문자수']) || findRow(subLabelColumn, ['로켓그로스유입수', '로켓그로스방문자수']);
        const cafe24Row = findRow(subLabelColumn, ['자사몰']);
        const smartstoreRow = findRow(subLabelColumn, ['스마트스토어']);
        const coupangRow = findRow(subLabelColumn, ['쿠팡']);
        const coupangWingRow = findRow(subLabelColumn, ['쿠팡윙', '윙']);
        const coupangGrowthRow = findRow(subLabelColumn, ['쿠팡그로스', '로켓그로스']);
        const dailyRevenueRow = findRow(subLabelColumn, ['일매출']);
        const cafe24RevenueRow = findRow(titleColumn, ['자사몰매출']) || findRow(subLabelColumn, ['자사몰매출']);
        const smartstoreRevenueRow = findRow(titleColumn, ['스마트스토어매출']) || findRow(subLabelColumn, ['스마트스토어매출']);
        const coupangRevenueRow = findRow(titleColumn, ['쿠팡매출']) || findRow(subLabelColumn, ['쿠팡매출']);
        const coupangWingRevenueRow = findRow(titleColumn, ['쿠팡윙매출']) || findRow(subLabelColumn, ['쿠팡윙매출']);
        const coupangGrowthRevenueRow = findRow(titleColumn, ['로켓그로스매출']) || findRow(subLabelColumn, ['로켓그로스매출']);
        const dailyAdSpendRow = findRow(subLabelColumn, ['일광고비']);
        const keywordHeaderIndex = blockRows.findIndex(row => normalizeSheetLabel(row[titleColumn]) === '키워드검색량');
        const siteVisitsIndex = blockRows.findIndex(row => normalizeSheetLabel(row[titleColumn]) === '자사몰유입수');
        const keywordRows = keywordHeaderIndex >= 0 && siteVisitsIndex > keywordHeaderIndex
            ? blockRows.slice(keywordHeaderIndex + 1, siteVisitsIndex)
            : [];

        for (let column = firstDateColumn; column < dateRow.length; column++) {
            const metricDate = parseSheetMetricDate(dateRow[column], year);
            if (!metricDate) continue;
            const sourceValues = [
                blogViewsRow?.[column], cafeViewsRow?.[column], siteVisitsRow?.[column],
                smartstoreVisitsRow?.[column], coupangVisitsRow?.[column],
                coupangWingVisitsRow?.[column], coupangGrowthVisitsRow?.[column],
                cafe24Row?.[column], smartstoreRow?.[column], coupangRow?.[column],
                coupangWingRow?.[column], coupangGrowthRow?.[column],
                dailyRevenueRow?.[column], cafe24RevenueRow?.[column],
                smartstoreRevenueRow?.[column], coupangRevenueRow?.[column],
                coupangWingRevenueRow?.[column], coupangGrowthRevenueRow?.[column], dailyAdSpendRow?.[column],
                ...keywordRows.map(row => row[column]),
            ];
            if (!sourceValues.some(hasSheetValue)) continue;

            const record = { product_slug: definition.slug, metric_date: metricDate };
            const completeness = {};
            const assign = (key, value, parser = parseSheetNumber) => {
                if (!hasSheetValue(value)) return;
                record[key] = Math.max(0, parser(value));
                completeness[key] = true;
            };
            const keywordMetrics = new Map();
            keywordRows.filter(row => hasSheetValue(row[column])).forEach(row => {
                const keyword = canonicalProductKeyword(definition.slug, row[subLabelColumn] || row[titleColumn]);
                if (!keyword) return;
                const value = Math.max(0, parseKeywordSearchValue(row[column]));
                keywordMetrics.set(keyword, Math.max(value, keywordMetrics.get(keyword) || 0));
            });
            record.keyword_metrics = [...keywordMetrics].map(([keyword, search_volume]) => ({ keyword, search_volume }));
            assign('blog_views', blogViewsRow?.[column]);
            assign('cafe_views', cafeViewsRow?.[column]);
            assign('cafe24_visits', siteVisitsRow?.[column]);
            assign('smartstore_visits', smartstoreVisitsRow?.[column]);
            assign('coupang_visits', coupangVisitsRow?.[column]);
            assign('coupang_wing_visits', coupangWingVisitsRow?.[column]);
            assign('coupang_growth_visits', coupangGrowthVisitsRow?.[column]);
            assign('cafe24_orders', cafe24Row?.[column]);
            assign('smartstore_orders', smartstoreRow?.[column]);
            assign('coupang_orders', coupangRow?.[column]);
            assign('coupang_wing_orders', coupangWingRow?.[column]);
            assign('coupang_growth_orders', coupangGrowthRow?.[column]);
            assign('cafe24_revenue', cafe24RevenueRow?.[column]);
            assign('smartstore_revenue', smartstoreRevenueRow?.[column]);
            assign('coupang_revenue', coupangRevenueRow?.[column]);
            assign('coupang_wing_revenue', coupangWingRevenueRow?.[column]);
            assign('coupang_growth_revenue', coupangGrowthRevenueRow?.[column]);
            assign('reported_total_revenue', dailyRevenueRow?.[column]);
            assign('ad_spend', dailyAdSpendRow?.[column]);
            record.data_completeness = completeness;
            records.push(record);
        }
    });

    return records;
}

async function mergeDailyMarketingMetric(productId, metricDate, patch, source, sourceDetails, collectionStatus) {
    const coupangPatch = Object.fromEntries(Object.entries(patch).filter(([key]) =>
        key.startsWith('coupang_wing_') || key.startsWith('coupang_growth_')
    ));
    const hasCoupangSplit = Object.keys(coupangPatch).length > 0;
    if (hasCoupangSplit && Object.keys(coupangPatch).length !== 6) {
        throw new Error('쿠팡 윙·로켓그로스 방문·판매·매출 6개 값이 모두 필요합니다.');
    }
    const regularPatch = Object.fromEntries(Object.entries(patch).filter(([key]) =>
        !key.startsWith('coupang_wing_') &&
        !key.startsWith('coupang_growth_') &&
        !(hasCoupangSplit && ['coupang_visits', 'coupang_orders', 'coupang_revenue'].includes(key))
    ));
    if (regularPatch.data_completeness && hasCoupangSplit) {
        regularPatch.data_completeness = Object.fromEntries(
            Object.entries(regularPatch.data_completeness).filter(([key]) => !key.startsWith('coupang_'))
        );
    }
    if (Object.keys(regularPatch).some(key => key !== 'data_completeness') ||
        Object.keys(regularPatch.data_completeness || {}).length) {
        const { error } = await sb.rpc('merge_daily_marketing_metric', {
            p_product_id: productId,
            p_metric_date: metricDate,
            p_patch: regularPatch,
            p_source: source,
            p_source_details: sourceDetails || {},
            p_collection_status: collectionStatus,
        });
        if (error) throw error;
    }
    if (hasCoupangSplit) {
        const { error: coupangError } = await sb.rpc('merge_daily_coupang_snapshot', {
            p_product_id: productId,
            p_metric_date: metricDate,
            p_patch: coupangPatch,
            p_source: source,
            p_source_details: sourceDetails?.coupang || sourceDetails || {},
        });
        if (coupangError) throw coupangError;
    }
}

async function mergeDailyKeywordMetric(productId, metricDate, item, source, sourceDetails) {
    const { error } = await sb.rpc('merge_daily_keyword_metric', {
        p_product_id: productId,
        p_metric_date: metricDate,
        p_keyword: item.keyword,
        p_search_volume: item.search_volume,
        p_source: source,
        p_source_details: sourceDetails || {},
    });
    if (error) throw error;
}

async function handleGoogleSheetImport(event) {
    event.preventDefault();
    const button = $('#sheet-import-submit');
    const token = $('#sheet-access-token').value.trim();
    const remember = $('#sheet-remember').checked;
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> 시트 읽는 중...';

    try {
        const response = await fetch(`${GOOGLE_SHEET_API_URL}?token=${encodeURIComponent(token)}`);
        if (!response.ok) throw new Error(`시트 연결 실패 (${response.status})`);
        const payload = await response.json();
        if (!payload.ok) throw new Error(payload.error || '시트 데이터를 읽지 못했습니다');

        const parsed = parseGoogleSheetMetrics(payload);
        const productMap = new Map(state.marketingProducts.map(product => [product.slug, product.id]));
        const records = parsed
            .filter(record => productMap.has(record.product_slug))
            .map(({ product_slug, metric_date, keyword_metrics = [], ...patch }) => ({
                patch,
                keyword_metrics,
                metric_date,
                product_id: productMap.get(product_slug),
            }));

        if (!records.length) throw new Error('가져올 제품 데이터를 찾지 못했습니다');
        button.innerHTML = '<span class="spinner"></span> 저장 중...';
        await Promise.all(records.map(async record => {
            const sourceDetails = {
                provider: 'google_sheets',
                sheet_name: payload.sheetName,
                synced_at: payload.updatedAt,
                temporary_fallback: true,
            };
            await mergeDailyMarketingMetric(
                record.product_id,
                record.metric_date,
                record.patch,
                'import',
                sourceDetails,
                'imported'
            );
            await Promise.all(record.keyword_metrics.map(item => mergeDailyKeywordMetric(
                record.product_id,
                record.metric_date,
                item,
                'import',
                sourceDetails
            )));
        }));

        if (remember) localStorage.setItem('jangsai-sheet-token', token);
        else localStorage.removeItem('jangsai-sheet-token');

        hideModal();
        await loadMarketingData();
        state.reportPeriod = '7d';
        renderApp();
        showToast(`${records.length}건의 시트 데이터를 가져왔습니다`, 'success');
    } catch (error) {
        console.error('구글시트 가져오기 실패:', error);
        showToast(error.message || '구글시트 가져오기에 실패했습니다', 'error');
        button.disabled = false;
        button.innerHTML = '<i class="ri-download-cloud-line"></i> 다시 시도';
    }
}

function renderManualKeywordInputs(productId) {
    const product = state.marketingProducts.find(item => item.id === productId);
    const keywords = product ? (PRODUCT_KEYWORDS[product.slug] || [product.name]) : [];
    return keywords.map((keyword, index) => `
        <div class="form-group">
            <label class="form-label">${escapeHtml(keyword)}</label>
            <input class="form-input metric-keyword-volume" type="number" min="0"
                data-keyword="${escapeHtml(keyword)}" id="metric-keyword-${index}" placeholder="미수집이면 비워두기">
        </div>`).join('');
}

function updateManualKeywordInputs(productId) {
    const container = $('#metric-keyword-fields');
    if (container) container.innerHTML = renderManualKeywordInputs(productId);
}

function showDailyMetricModal() {
    if (!state.marketingDataReady) {
        showToast('먼저 마케팅 DB 마이그레이션을 적용해주세요', 'warning');
        return;
    }
    const today = localDateString(new Date());
    const selected = state.selectedMarketingProduct === 'all' ? state.marketingProducts[0]?.id : state.selectedMarketingProduct;
    showModal(`
        <div class="modal-header">
            <h3>일일 마케팅 데이터 입력</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <form onsubmit="handleDailyMetricSubmit(event)">
                <div class="form-row">
                    <div class="form-group"><label class="form-label">제품</label><select class="form-input" id="metric-product" onchange="updateManualKeywordInputs(this.value)" required>
                        ${state.marketingProducts.map(product => `<option value="${product.id}" ${product.id === selected ? 'selected' : ''}>${escapeHtml(product.brand)} ${escapeHtml(product.name)}</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label class="form-label">기준일</label><input class="form-input" type="date" id="metric-date" value="${today}" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">블로그 방문자 수</label><input class="form-input" type="number" id="metric-blog-views" min="0" placeholder="미수집이면 비워두기"></div>
                    <div class="form-group"><label class="form-label">카페 글 조회수</label><input class="form-input" type="number" id="metric-cafe-views" min="0" placeholder="미수집이면 비워두기"></div>
                </div>
                <label class="form-label">브랜드 검색량 · 키워드별</label>
                <div class="form-row" id="metric-keyword-fields">${renderManualKeywordInputs(selected)}</div>
                <div class="form-group"><label class="form-label">광고비</label><input class="form-input" type="number" id="metric-ad-spend" min="0" placeholder="미수집이면 비워두기"></div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">UTM 추적 유입</label><input class="form-input" type="number" id="metric-tracked-visits" min="0" placeholder="선택 항목"><div class="form-hint">원고별 보조 분석에 사용</div></div>
                    <div class="form-group"><label class="form-label">UTM 추적 구매</label><input class="form-input" type="number" id="metric-tracked-orders" min="0" placeholder="선택 항목"><div class="form-hint">원고별 보조 분석에 사용</div></div>
                </div>
                <div class="channel-entry-grid">
                    ${['cafe24', 'smartstore'].map((channel, index) => `
                    <div class="channel-entry">
                        <strong>${['자사몰', '스마트스토어'][index]}</strong>
                        <input class="form-input" type="number" id="metric-${channel}-visits" min="0" placeholder="방문자 수">
                        <input class="form-input" type="number" id="metric-${channel}-orders" min="0" placeholder="판매량">
                        <input class="form-input" type="number" id="metric-${channel}-revenue" min="0" placeholder="매출">
                    </div>`).join('')}
                    <div class="channel-entry coupang-entry">
                        <strong>쿠팡</strong>
                        <input class="form-input" type="number" id="metric-coupang-visits" min="0" placeholder="통합 방문자 수">
                        <small>쿠팡 윙</small>
                        <input class="form-input" type="number" id="metric-coupang-wing-orders" min="0" placeholder="윙 판매량">
                        <input class="form-input" type="number" id="metric-coupang-wing-revenue" min="0" placeholder="윙 매출">
                        <small>로켓그로스</small>
                        <input class="form-input" type="number" id="metric-coupang-growth-orders" min="0" placeholder="그로스 판매량">
                        <input class="form-input" type="number" id="metric-coupang-growth-revenue" min="0" placeholder="그로스 매출">
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block mt-3" id="metric-submit"><i class="ri-save-line"></i> 저장하기</button>
            </form>
        </div>`);
}

async function handleDailyMetricSubmit(event) {
    event.preventDefault();
    const button = $('#metric-submit');
    button.disabled = true;
    button.innerHTML = '<span class="spinner"></span> 저장 중...';
    const patch = {};
    const completeness = {};
    const assign = (key, id) => {
        const input = $(`#${id}`);
        if (!input || input.value === '') return;
        patch[key] = Math.max(0, metricNumber(input.value));
        completeness[key] = true;
    };
    assign('blog_views', 'metric-blog-views');
    assign('cafe_views', 'metric-cafe-views');
    assign('tracked_visits', 'metric-tracked-visits');
    assign('tracked_orders', 'metric-tracked-orders');
    assign('ad_spend', 'metric-ad-spend');
    ['cafe24', 'smartstore'].forEach(channel => {
        assign(`${channel}_visits`, `metric-${channel}-visits`);
        assign(`${channel}_orders`, `metric-${channel}-orders`);
        assign(`${channel}_revenue`, `metric-${channel}-revenue`);
    });
    assign('coupang_visits', 'metric-coupang-visits');
    ['coupang_wing', 'coupang_growth'].forEach(channel => {
        assign(`${channel}_orders`, `metric-${channel.replace('_', '-')}-orders`);
        assign(`${channel}_revenue`, `metric-${channel.replace('_', '-')}-revenue`);
    });
    patch.data_completeness = completeness;
    const keywordMetrics = [...document.querySelectorAll('.metric-keyword-volume')]
        .filter(input => input.value !== '')
        .map(input => ({ keyword: input.dataset.keyword, search_volume: Math.max(0, metricNumber(input.value)) }));

    if (!Object.keys(completeness).length && !keywordMetrics.length) {
        showToast('보완할 숫자를 하나 이상 입력해주세요', 'warning');
        button.disabled = false;
        button.innerHTML = '<i class="ri-save-line"></i> 저장하기';
        return;
    }
    try {
        const productId = $('#metric-product').value;
        const metricDate = $('#metric-date').value;
        await mergeDailyMarketingMetric(
            productId,
            metricDate,
            patch,
            'manual',
            { provider: 'manual_fallback', entered_at: new Date().toISOString() },
            'manual'
        );
        await Promise.all(keywordMetrics.map(item => mergeDailyKeywordMetric(
            productId,
            metricDate,
            item,
            'manual',
            { provider: 'manual_fallback', entered_at: new Date().toISOString() }
        )));
    } catch (error) {
        showToast('저장 실패: ' + error.message, 'error');
        button.disabled = false;
        button.innerHTML = '<i class="ri-save-line"></i> 저장하기';
        return;
    }
    hideModal();
    await loadMarketingData();
    renderApp();
    showToast('일일 데이터가 저장되었습니다', 'success');
}

// ==========================================
// 뷰 렌더링 - 수강생 프로그램 목록
// ==========================================

function renderDashboardView() {
    const categories = [...new Set(state.programs.map(p => p.category).filter(Boolean))];
    let filtered = state.programs;
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    }
    if (state.categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === state.categoryFilter);
    }

    return `
    ${renderNavbar()}
    <div class="dashboard">
        <div class="dashboard-header">
            <h1 class="dashboard-title">사용 가능한 <span>프로그램</span></h1>
            <p class="dashboard-subtitle">내 등급에서 사용 가능한 프로그램 목록입니다</p>
        </div>
        <div class="filter-bar">
            <div class="search-wrapper">
                <i class="ri-search-line"></i>
                <input class="search-input" type="text" placeholder="프로그램 검색..." value="${escapeHtml(state.searchQuery)}" oninput="handleSearch(this.value)" id="search-input">
            </div>
            <select class="filter-select" onchange="handleCategoryFilter(this.value)" id="category-filter">
                <option value="all">전체 카테고리</option>
                ${categories.map(c => `<option value="${escapeHtml(c)}" ${state.categoryFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
        </div>
        <div class="programs-grid">
            ${filtered.length === 0 ? `
            <div class="empty-state">
                <i class="ri-folder-open-line"></i>
                <h3>${state.searchQuery || state.categoryFilter !== 'all' ? '검색 결과가 없습니다' : '등록된 프로그램이 없습니다'}</h3>
                <p>${state.searchQuery || state.categoryFilter !== 'all' ? '다른 검색어나 카테고리를 시도해보세요' : '관리자가 프로그램을 등록하면 여기에 표시됩니다'}</p>
            </div>` :
            filtered.map((p, i) => renderProgramCard(p, i)).join('')}
        </div>
    </div>`;
}

function renderProgramCard(program, index) {
    const icon = program.icon || CATEGORY_ICONS[program.category] || 'ri-file-download-line';
    return `
    <div class="program-card" style="animation-delay:${index * 0.06}s" id="program-${program.id}">
        <div class="program-card-header">
            <div class="program-icon"><i class="${icon}"></i></div>
            <div class="program-info">
                <h3>${escapeHtml(program.name)}</h3>
                <span class="program-version">v${escapeHtml(program.version || '1.0')}</span>
            </div>
        </div>
        ${program.description ? `<p class="program-description">${escapeHtml(program.description)}</p>` : ''}
        <div class="program-meta">
            <span class="program-category">${escapeHtml(program.category || '일반')}</span>
            <span class="program-meta-item"><i class="ri-hard-drive-3-line"></i> ${formatFileSize(program.file_size)}</span>
            <span class="program-meta-item"><i class="ri-calendar-line"></i> ${formatDate(program.created_at)}</span>
        </div>
        <div class="program-card-footer">
            <span class="download-count"><i class="ri-download-line"></i> ${program.download_count || 0}회 다운로드</span>
            <button class="download-btn" onclick="downloadProgram(${JSON.stringify(program).replace(/"/g, '&quot;')})" id="download-${program.id}">
                <i class="ri-download-2-line"></i> 다운로드
            </button>
        </div>
    </div>`;
}

function handleSearch(value) {
    state.searchQuery = value;
    const grid = $('.programs-grid');
    if (grid) grid.innerHTML = renderFilteredPrograms();
}

function handleCategoryFilter(value) {
    state.categoryFilter = value;
    const grid = $('.programs-grid');
    if (grid) grid.innerHTML = renderFilteredPrograms();
}

function renderFilteredPrograms() {
    let filtered = state.programs;
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    }
    if (state.categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === state.categoryFilter);
    }
    if (filtered.length === 0) {
        return `<div class="empty-state">
            <i class="ri-folder-open-line"></i>
            <h3>검색 결과가 없습니다</h3>
            <p>다른 검색어나 카테고리를 시도해보세요</p>
        </div>`;
    }
    return filtered.map((p, i) => renderProgramCard(p, i)).join('');
}

// ==========================================
// 뷰 렌더링 - 관리자 패널
// ==========================================

function renderAdminView() {
    const totalDownloads = state.adminPrograms.reduce((sum, p) => sum + (p.download_count || 0), 0);
    return `
    ${renderNavbar()}
    <div class="admin">
        <div class="admin-header">
            <h1 class="admin-title">관리자 대시보드</h1>
            <p class="admin-subtitle">가입 요청, 사용자, 등급, 프로그램을 관리합니다</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-card-icon users"><i class="ri-group-line"></i></div>
                <div class="stat-value">${state.adminUsers.length}</div>
                <div class="stat-label">총 사용자</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon requests"><i class="ri-user-follow-line"></i></div>
                <div class="stat-value">${state.adminRequests.filter(r => getApprovalStatus(r) === 'pending').length}</div>
                <div class="stat-label">승인 대기</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon roles"><i class="ri-vip-crown-line"></i></div>
                <div class="stat-value">${state.roles.length}</div>
                <div class="stat-label">등급 수</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon programs"><i class="ri-apps-2-line"></i></div>
                <div class="stat-value">${state.adminPrograms.length}</div>
                <div class="stat-label">총 프로그램</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-icon downloads"><i class="ri-download-cloud-line"></i></div>
                <div class="stat-value">${totalDownloads}</div>
                <div class="stat-label">총 다운로드</div>
            </div>
        </div>

        <div class="admin-tabs">
            <button class="admin-tab ${state.adminTab === 'requests' ? 'active' : ''}" onclick="switchAdminTab('requests')" id="admin-tab-requests">
                <i class="ri-user-follow-line"></i> 가입 요청
                <span class="admin-tab-badge">${state.adminRequests.filter(r => getApprovalStatus(r) === 'pending').length}</span>
            </button>
            <button class="admin-tab ${state.adminTab === 'users' ? 'active' : ''}" onclick="switchAdminTab('users')" id="admin-tab-users">
                <i class="ri-group-line"></i> 사용자
                <span class="admin-tab-badge">${state.adminUsers.length}</span>
            </button>
            <button class="admin-tab ${state.adminTab === 'roles' ? 'active' : ''}" onclick="switchAdminTab('roles')" id="admin-tab-roles">
                <i class="ri-vip-crown-line"></i> 등급
                <span class="admin-tab-badge">${state.roles.length}</span>
            </button>
            <button class="admin-tab ${state.adminTab === 'programs' ? 'active' : ''}" onclick="switchAdminTab('programs')" id="admin-tab-programs">
                <i class="ri-apps-2-line"></i> 프로그램
                <span class="admin-tab-badge">${state.adminPrograms.length}</span>
            </button>
        </div>

        <div id="admin-content">
            ${state.adminTab === 'requests' ? renderSignupRequests() : ''}
            ${state.adminTab === 'users' ? renderAdminUsers() : ''}
            ${state.adminTab === 'roles' ? renderAdminRoles() : ''}
            ${state.adminTab === 'programs' ? renderAdminPrograms() : ''}
        </div>
    </div>`;
}

function switchAdminTab(tab) {
    state.adminTab = tab;
    const content = $('#admin-content');
    if (content) {
        $$('.admin-tab').forEach(t => t.classList.remove('active'));
        $(`#admin-tab-${tab}`)?.classList.add('active');
        if (tab === 'requests') content.innerHTML = renderSignupRequests();
        else if (tab === 'users') content.innerHTML = renderAdminUsers();
        else if (tab === 'roles') content.innerHTML = renderAdminRoles();
        else if (tab === 'programs') content.innerHTML = renderAdminPrograms();
    }
}

// --- 가입 요청 관리 ---
function renderSignupRequests() {
    const pendingRequests = state.adminRequests.filter(request => getApprovalStatus(request) === 'pending');
    const rejectedRequests = state.adminRequests.filter(request => getApprovalStatus(request) === 'rejected');

    return `
    <div class="section-header">
        <div>
            <h2 class="section-title">가입 승인 요청</h2>
            <p class="section-description">신청 정보를 확인하고 등급을 지정한 뒤 승인하세요.</p>
        </div>
    </div>
    ${pendingRequests.length === 0 ? `
        <div class="empty-state compact">
            <i class="ri-user-received-2-line"></i>
            <h3>대기 중인 가입 요청이 없습니다</h3>
        </div>` : `
        <div class="request-grid">
            ${pendingRequests.map(request => `
            <article class="request-card">
                <div class="request-card-main">
                    <div class="request-avatar">${escapeHtml((request.display_name || request.username || '?')[0])}</div>
                    <div>
                        <h3>${escapeHtml(request.display_name || request.username)}</h3>
                        <p>${escapeHtml(request.username)}</p>
                        <span><i class="ri-calendar-line"></i> ${formatDate(request.created_at)} 신청</span>
                    </div>
                </div>
                <div class="request-controls">
                    <select class="form-input" id="request-role-${request.id}" aria-label="승인 등급">
                        ${state.roles.map(role =>
                            `<option value="${role.id}" ${role.is_default ? 'selected' : ''}>${escapeHtml(role.name)}</option>`
                        ).join('')}
                    </select>
                    <button class="btn btn-primary" onclick="handleReviewRequest('${request.id}', 'approved')">
                        <i class="ri-check-line"></i> 승인
                    </button>
                    <button class="btn btn-danger" onclick="handleReviewRequest('${request.id}', 'rejected')">
                        <i class="ri-close-line"></i> 거절
                    </button>
                </div>
            </article>`).join('')}
        </div>`}
    ${rejectedRequests.length ? `
        <details class="rejected-requests">
            <summary>거절된 요청 ${rejectedRequests.length}건</summary>
            ${rejectedRequests.map(request => `
                <div class="rejected-request-row">
                    <span>${escapeHtml(request.display_name || request.username)} · ${escapeHtml(request.username)}</span>
                    <select class="form-input" id="request-role-${request.id}" aria-label="승인 등급" style="min-width:100px">
                        ${state.roles.map(role => `<option value="${role.id}" ${role.is_default ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}
                    </select>
                    <button class="btn btn-secondary btn-sm" onclick="handleReviewRequest('${request.id}', 'approved')">다시 승인</button>
                </div>`).join('')}
        </details>` : ''}`;
}

async function handleReviewRequest(userId, status) {
    try {
        const roleId = status === 'approved'
            ? ($(`#request-role-${userId}`)?.value || state.roles.find(role => role.is_default)?.id || 'trainee')
            : null;
        await reviewSignupRequest(userId, status, roleId);
        showToast(status === 'approved' ? '가입 요청을 승인했습니다' : '가입 요청을 거절했습니다', 'success');
        await loadAdminUsers();
        renderApp();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// --- 사용자 관리 ---
function renderAdminUsers() {
    return `
    <div class="section-header">
        <h2 class="section-title">사용자 관리</h2>
        <button class="btn btn-primary btn-sm" onclick="showCreateUserModal()" id="create-user-btn">
            <i class="ri-user-add-line"></i> 사용자 추가
        </button>
    </div>
    <div class="data-table-wrapper">
        <table class="data-table">
            <thead>
                <tr>
                    <th>이름</th>
                    <th>아이디</th>
                    <th>등급</th>
                    <th>가입일</th>
                    <th>마지막 접속일</th>
                    <th>관리</th>
                </tr>
            </thead>
            <tbody>
                ${state.adminUsers.map(u => `
                <tr id="user-row-${u.id}">
                    <td><strong>${escapeHtml(u.display_name || u.username)}</strong></td>
                    <td style="color:var(--text-secondary)">${escapeHtml(u.username)}</td>
                    <td>${roleBadgeHtml(u.role_id)}</td>
                    <td style="color:var(--text-muted)">${formatDate(u.created_at)}</td>
                    <td style="color:var(--text-muted)">${formatDateTime(u.last_seen_at)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-secondary btn-sm" onclick="showChangeRoleModal('${u.id}','${escapeHtml(u.display_name || u.username)}','${u.role_id}')" title="등급 변경">
                                <i class="ri-user-settings-line"></i>
                            </button>
                            ${u.role_id !== 'admin' ? `
                            <button class="btn btn-danger btn-sm" onclick="confirmDeleteUser('${u.id}','${escapeHtml(u.display_name || u.username)}')" title="삭제">
                                <i class="ri-delete-bin-line"></i>
                            </button>` : ''}
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

function showChangeRoleModal(userId, userName, currentRole) {
    showModal(`
        <div class="modal-header">
            <h3>등급 변경 - ${escapeHtml(userName)}</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">새 등급 선택</label>
                <select class="form-input" id="modal-new-role">
                    ${state.roles.map(r => `<option value="${r.id}" ${r.id === currentRole ? 'selected' : ''}>${escapeHtml(r.name)} (레벨 ${r.level})</option>`).join('')}
                </select>
            </div>
            <button class="btn btn-primary btn-block" onclick="handleChangeRole('${userId}')">
                <i class="ri-check-line"></i> 변경하기
            </button>
        </div>
    `);
}

async function handleChangeRole(userId) {
    try {
        const newRole = $('#modal-new-role').value;
        await changeUserRole(userId, newRole);
        showToast('등급이 변경되었습니다', 'success');
        hideModal();
        await loadAdminUsers();
        switchAdminTab('users');
    } catch (err) { showToast(err.message, 'error'); }
}

async function confirmDeleteUser(userId, userName) {
    showModal(`
        <div class="modal-header">
            <h3>사용자 삭제</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <p style="margin-bottom:20px;color:var(--text-secondary)">
                <strong style="color:var(--error)">${escapeHtml(userName)}</strong> 사용자를 정말 삭제하시겠습니까?<br>이 작업은 되돌릴 수 없습니다.
            </p>
            <div class="flex gap-1">
                <button class="btn btn-ghost" onclick="hideModal()" style="flex:1">취소</button>
                <button class="btn btn-danger" onclick="handleDeleteUser('${userId}')" style="flex:1">
                    <i class="ri-delete-bin-line"></i> 삭제
                </button>
            </div>
        </div>
    `);
}

async function handleDeleteUser(userId) {
    try {
        await deleteUser(userId);
        showToast('사용자가 삭제되었습니다', 'success');
        hideModal();
        await loadAdminUsers();
        switchAdminTab('users');
    } catch (err) { showToast(err.message, 'error'); }
}

// --- 사용자 생성 (관리자 전용) ---
function showCreateUserModal() {
    showModal(`
        <div class="modal-header">
            <h3>새 사용자 추가</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <form onsubmit="handleCreateUser(event)">
                <div class="form-group">
                    <label class="form-label">휴대전화 번호 (로그인 아이디)</label>
                    <input class="form-input" type="tel" id="modal-user-phone" placeholder="예: 01012345678" required>
                    <div class="form-hint">사용자가 로그인할 때 사용하는 번호입니다</div>
                </div>
                <div class="form-group">
                    <label class="form-label">이름</label>
                    <input class="form-input" type="text" id="modal-user-name" placeholder="예: 홍길동" required>
                </div>
                <div class="form-group">
                    <label class="form-label">인증번호 (비밀번호)</label>
                    <input class="form-input" type="text" id="modal-user-code" placeholder="예: 123456" required minlength="6">
                    <div class="form-hint">사용자에게 알려줄 인증번호입니다 (6자 이상)</div>
                </div>
                <div class="form-group">
                    <label class="form-label">등급</label>
                    <select class="form-input" id="modal-user-role">
                        ${state.roles.map(r =>
                            `<option value="${r.id}" ${r.is_default ? 'selected' : ''}>${escapeHtml(r.name)} (레벨 ${r.level})</option>`
                        ).join('')}
                    </select>
                </div>
                <button type="submit" class="btn btn-primary btn-block" id="create-user-submit">
                    <i class="ri-user-add-line"></i> 사용자 추가
                </button>
            </form>
        </div>
    `);
}

async function handleCreateUser(e) {
    e.preventDefault();
    const btn = $('#create-user-submit');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> 생성 중...';
    btn.disabled = true;

    try {
        const phone = $('#modal-user-phone').value.trim().replace(/-/g, '');
        const name = $('#modal-user-name').value.trim();
        const code = $('#modal-user-code').value.trim();
        const roleId = $('#modal-user-role').value;

        if (!phone || !name || !code) {
            showToast('모든 항목을 입력해주세요', 'warning');
            return;
        }

        // Supabase REST API로 직접 회원가입 (관리자 세션에 영향 없음)
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
            },
            body: JSON.stringify({
                email: phone + EMAIL_DOMAIN,
                password: code,
                data: { username: phone, display_name: name }
            })
        });

        const result = await res.json();
        if (result.error || result.msg) {
            const errMsg = result.error?.message || result.msg || '사용자 생성 실패';
            if (errMsg.includes('already registered')) throw new Error('이미 등록된 전화번호입니다');
            throw new Error(errMsg);
        }

        // 프로필 트리거 완료 후 관리자 생성 계정은 즉시 승인한다.
        if (result.id) {
            let profileFound = false;
            for (let attempt = 0; attempt < 8; attempt++) {
                const { data: profile } = await sb.from('profiles').select('id').eq('id', result.id).maybeSingle();
                if (profile) {
                    profileFound = true;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (!profileFound) throw new Error('계정은 생성됐지만 프로필 준비가 지연되고 있습니다. 잠시 후 가입 요청에서 승인해주세요.');

            const { error: updateError } = await sb.from('profiles').update({
                role_id: roleId,
                approval_status: 'approved',
                reviewed_at: new Date().toISOString(),
                reviewed_by: state.user.id,
            }).eq('id', result.id);
            if (updateError) throw new Error('사용자 승인 실패: ' + updateError.message);
        }

        showToast(`${name} 사용자가 추가되었습니다!`, 'success');
        hideModal();
        await loadAdminUsers();
        switchAdminTab('users');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

// --- 등급 관리 ---
function renderAdminRoles() {
    return `
    <div class="section-header">
        <h2 class="section-title">등급 관리</h2>
        <button class="btn btn-primary btn-sm" onclick="showAddRoleModal()" id="add-role-btn">
            <i class="ri-add-line"></i> 새 등급 추가
        </button>
    </div>
    <div class="roles-grid">
        ${state.roles.map(r => {
            const c = getRoleColor(r.id);
            return `
            <div class="role-card" id="role-card-${r.id}">
                <div class="role-card-header">
                    <div>
                        <h4 style="color:${c.text}">${escapeHtml(r.name)}</h4>
                        <div class="role-card-level">레벨: ${r.level} · ID: ${escapeHtml(r.id)}</div>
                    </div>
                    ${r.is_default ? '<span class="role-card-default"><i class="ri-check-line"></i> 기본 등급</span>' : ''}
                </div>
                <div class="role-card-actions">
                    ${r.id !== 'admin' ? `
                    <button class="btn btn-secondary btn-sm" onclick="showEditRoleModal('${r.id}')" style="flex:1">
                        <i class="ri-edit-line"></i> 수정
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="confirmDeleteRole('${r.id}','${escapeHtml(r.name)}')" style="flex:1">
                        <i class="ri-delete-bin-line"></i> 삭제
                    </button>` : `<span class="text-muted text-sm">시스템 등급 (수정 불가)</span>`}
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function showAddRoleModal() {
    showModal(`
        <div class="modal-header">
            <h3>새 등급 추가</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <form onsubmit="handleAddRole(event)">
                <div class="form-group">
                    <label class="form-label">등급 ID (영문)</label>
                    <input class="form-input" type="text" id="modal-role-id" placeholder="예: vip, manager" required pattern="[a-z0-9-_]+" title="영문 소문자, 숫자, -, _ 만 사용">
                    <div class="form-hint">영문 소문자, 숫자만 사용 가능합니다</div>
                </div>
                <div class="form-group">
                    <label class="form-label">등급 이름</label>
                    <input class="form-input" type="text" id="modal-role-name" placeholder="예: VIP, 매니저" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">레벨 (높을수록 상위)</label>
                        <input class="form-input" type="number" id="modal-role-level" value="30" min="0" max="99">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:20px">
                        <label class="checkbox-label">
                            <input type="checkbox" id="modal-role-default">
                            <span>기본 등급으로 설정</span>
                        </label>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="ri-add-line"></i> 등급 추가
                </button>
            </form>
        </div>
    `);
}

async function handleAddRole(e) {
    e.preventDefault();
    try {
        const id = $('#modal-role-id').value.trim().toLowerCase();
        const name = $('#modal-role-name').value.trim();
        const level = parseInt($('#modal-role-level').value) || 0;
        const isDefault = $('#modal-role-default').checked;
        await addRole(id, name, level, isDefault);
        showToast(`"${name}" 등급이 추가되었습니다`, 'success');
        hideModal();
        await loadRoles();
        switchAdminTab('roles');
    } catch (err) { showToast(err.message, 'error'); }
}

function showEditRoleModal(roleId) {
    const r = state.roles.find(r => r.id === roleId);
    if (!r) return;
    showModal(`
        <div class="modal-header">
            <h3>등급 수정 - ${escapeHtml(r.name)}</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <form onsubmit="handleEditRole(event, '${r.id}')">
                <div class="form-group">
                    <label class="form-label">등급 이름</label>
                    <input class="form-input" type="text" id="modal-role-name" value="${escapeHtml(r.name)}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">레벨</label>
                        <input class="form-input" type="number" id="modal-role-level" value="${r.level}" min="0" max="99">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:20px">
                        <label class="checkbox-label">
                            <input type="checkbox" id="modal-role-default" ${r.is_default ? 'checked' : ''}>
                            <span>기본 등급으로 설정</span>
                        </label>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="ri-check-line"></i> 수정하기
                </button>
            </form>
        </div>
    `);
}

async function handleEditRole(e, roleId) {
    e.preventDefault();
    try {
        await updateRole(roleId, {
            name: $('#modal-role-name').value.trim(),
            level: parseInt($('#modal-role-level').value) || 0,
            is_default: $('#modal-role-default').checked
        });
        showToast('등급이 수정되었습니다', 'success');
        hideModal();
        await loadRoles();
        switchAdminTab('roles');
    } catch (err) { showToast(err.message, 'error'); }
}

async function confirmDeleteRole(roleId, roleName) {
    showModal(`
        <div class="modal-header">
            <h3>등급 삭제</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <p style="margin-bottom:20px;color:var(--text-secondary)">
                <strong style="color:var(--error)">${escapeHtml(roleName)}</strong> 등급을 삭제하시겠습니까?<br>
                이 등급에 속한 사용자들의 등급이 해제됩니다.
            </p>
            <div class="flex gap-1">
                <button class="btn btn-ghost" onclick="hideModal()" style="flex:1">취소</button>
                <button class="btn btn-danger" onclick="handleDeleteRole('${roleId}')" style="flex:1">
                    <i class="ri-delete-bin-line"></i> 삭제
                </button>
            </div>
        </div>
    `);
}

async function handleDeleteRole(roleId) {
    try {
        await deleteRole(roleId);
        showToast('등급이 삭제되었습니다', 'success');
        hideModal();
        await loadRoles();
        switchAdminTab('roles');
    } catch (err) { showToast(err.message, 'error'); }
}

// --- 프로그램 관리 ---
function renderAdminPrograms() {
    return `
    <div class="section-header">
        <h2 class="section-title">프로그램 관리</h2>
        <button class="btn btn-primary btn-sm" onclick="showUploadModal()" id="upload-program-btn">
            <i class="ri-upload-2-line"></i> 프로그램 업로드
        </button>
    </div>
    ${state.adminPrograms.length === 0 ? `
    <div class="empty-state">
        <i class="ri-upload-cloud-line"></i>
        <h3>아직 등록된 프로그램이 없습니다</h3>
        <p>위의 "프로그램 업로드" 버튼을 클릭하여 첫 프로그램을 등록하세요</p>
    </div>` : `
    <div class="data-table-wrapper">
        <table class="data-table">
            <thead>
                <tr>
                    <th>프로그램</th>
                    <th>카테고리</th>
                    <th>버전</th>
                    <th>파일 크기</th>
                    <th>허용 등급</th>
                    <th>다운로드</th>
                    <th>관리</th>
                </tr>
            </thead>
            <tbody>
                ${state.adminPrograms.map(p => `
                <tr id="program-row-${p.id}">
                    <td>
                        <div class="file-info">
                            <span class="file-name">${escapeHtml(p.name)}</span>
                            <span class="file-size">${escapeHtml(p.original_name || '')}</span>
                        </div>
                    </td>
                    <td><span class="program-category">${escapeHtml(p.category || '일반')}</span></td>
                    <td>v${escapeHtml(p.version || '1.0')}</td>
                    <td style="color:var(--text-muted)">${formatFileSize(p.file_size)}</td>
                    <td>
                        <div class="program-roles-list">
                            ${p.allowedRoles.length === 0 ? '<span class="text-muted text-sm">없음</span>' :
                            p.allowedRoles.map(rid => roleBadgeHtml(rid)).join('')}
                        </div>
                    </td>
                    <td style="color:var(--text-muted)">${p.download_count || 0}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-secondary btn-sm" onclick="showEditProgramModal('${p.id}')" title="수정">
                                <i class="ri-edit-line"></i>
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="showProgramRolesModal('${p.id}')" title="등급 설정">
                                <i class="ri-shield-user-line"></i>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="confirmDeleteProgram('${p.id}','${escapeHtml(p.name)}')" title="삭제">
                                <i class="ri-delete-bin-line"></i>
                            </button>
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`}`;
}

function showUploadModal() {
    showModal(`
        <div class="modal-header">
            <h3>프로그램 업로드</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <form onsubmit="handleUpload(event)">
                <div class="form-group">
                    <label class="form-label">프로그램 파일</label>
                    <input class="form-input form-input-file" type="file" id="modal-file" required>
                    <div class="form-hint">최대 50MB · exe, zip, msi 등</div>
                </div>
                <div class="form-group">
                    <label class="form-label">프로그램 이름</label>
                    <input class="form-input" type="text" id="modal-prog-name" placeholder="예: 출근부 관리 프로그램" required>
                </div>
                <div class="form-group">
                    <label class="form-label">설명</label>
                    <textarea class="form-input" id="modal-prog-desc" placeholder="프로그램에 대한 간단한 설명"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">버전</label>
                        <input class="form-input" type="text" id="modal-prog-version" value="1.0" placeholder="1.0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">카테고리</label>
                        <select class="form-input" id="modal-prog-category">
                            ${Object.keys(CATEGORY_ICONS).map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">접근 허용 등급</label>
                    <div class="checkbox-group">
                        ${state.roles.filter(r => r.id !== 'admin').map(r => `
                            <label class="checkbox-label">
                                <input type="checkbox" name="allowed-roles" value="${r.id}" checked>
                                <span>${escapeHtml(r.name)}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="form-hint">관리자는 항상 모든 프로그램에 접근 가능합니다</div>
                </div>
                <button type="submit" class="btn btn-primary btn-block btn-lg" id="upload-submit-btn">
                    <i class="ri-upload-2-line"></i> 업로드
                </button>
            </form>
        </div>
    `);
}

async function handleUpload(e) {
    e.preventDefault();
    const btn = $('#upload-submit-btn');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> 업로드 중...';
    btn.disabled = true;

    try {
        const file = $('#modal-file').files[0];
        const name = $('#modal-prog-name').value.trim();
        const description = $('#modal-prog-desc').value.trim();
        const version = $('#modal-prog-version').value.trim();
        const category = $('#modal-prog-category').value;
        const roleCheckboxes = document.querySelectorAll('input[name="allowed-roles"]:checked');
        const roleIds = Array.from(roleCheckboxes).map(cb => cb.value);

        await uploadProgram(file, name, description, version, category, roleIds);
        showToast(`"${name}" 프로그램이 업로드되었습니다!`, 'success');
        hideModal();
        await loadAdminPrograms();
        switchAdminTab('programs');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
    }
}

function showEditProgramModal(programId) {
    const p = state.adminPrograms.find(p => p.id === programId);
    if (!p) return;
    showModal(`
        <div class="modal-header">
            <h3>프로그램 수정</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <form onsubmit="handleEditProgram(event, '${p.id}')">
                <div class="form-group">
                    <label class="form-label">프로그램 이름</label>
                    <input class="form-input" type="text" id="modal-prog-name" value="${escapeHtml(p.name)}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">설명</label>
                    <textarea class="form-input" id="modal-prog-desc">${escapeHtml(p.description || '')}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">버전</label>
                        <input class="form-input" type="text" id="modal-prog-version" value="${escapeHtml(p.version || '1.0')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">카테고리</label>
                        <select class="form-input" id="modal-prog-category">
                            ${Object.keys(CATEGORY_ICONS).map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="ri-check-line"></i> 수정하기
                </button>
            </form>
        </div>
    `);
}

async function handleEditProgram(e, programId) {
    e.preventDefault();
    try {
        const category = $('#modal-prog-category').value;
        await updateProgram(programId, {
            name: $('#modal-prog-name').value.trim(),
            description: $('#modal-prog-desc').value.trim(),
            version: $('#modal-prog-version').value.trim(),
            category,
            icon: CATEGORY_ICONS[category] || 'ri-file-download-line'
        });
        showToast('프로그램 정보가 수정되었습니다', 'success');
        hideModal();
        await loadAdminPrograms();
        switchAdminTab('programs');
    } catch (err) { showToast(err.message, 'error'); }
}

function showProgramRolesModal(programId) {
    const p = state.adminPrograms.find(p => p.id === programId);
    if (!p) return;
    showModal(`
        <div class="modal-header">
            <h3>등급 권한 설정 - ${escapeHtml(p.name)}</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <p class="text-muted text-sm mb-2">이 프로그램을 사용할 수 있는 등급을 선택하세요:</p>
            <div class="checkbox-group mb-3">
                ${state.roles.filter(r => r.id !== 'admin').map(r => `
                    <label class="checkbox-label">
                        <input type="checkbox" name="prog-roles" value="${r.id}" ${p.allowedRoles.includes(r.id) ? 'checked' : ''}>
                        <span>${escapeHtml(r.name)}</span>
                    </label>
                `).join('')}
            </div>
            <div class="form-hint mb-3">관리자는 항상 모든 프로그램에 접근 가능합니다</div>
            <button class="btn btn-primary btn-block" onclick="handleUpdateProgramRoles('${p.id}')">
                <i class="ri-check-line"></i> 저장하기
            </button>
        </div>
    `);
}

async function handleUpdateProgramRoles(programId) {
    try {
        const checks = document.querySelectorAll('input[name="prog-roles"]:checked');
        const roleIds = Array.from(checks).map(cb => cb.value);
        await updateProgramRoles(programId, roleIds);
        showToast('등급 권한이 업데이트되었습니다', 'success');
        hideModal();
        await loadAdminPrograms();
        switchAdminTab('programs');
    } catch (err) { showToast(err.message, 'error'); }
}

async function confirmDeleteProgram(programId, programName) {
    showModal(`
        <div class="modal-header">
            <h3>프로그램 삭제</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <p style="margin-bottom:20px;color:var(--text-secondary)">
                <strong style="color:var(--error)">${escapeHtml(programName)}</strong> 프로그램을 삭제하시겠습니까?<br>
                업로드된 파일도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div class="flex gap-1">
                <button class="btn btn-ghost" onclick="hideModal()" style="flex:1">취소</button>
                <button class="btn btn-danger" onclick="handleDeleteProgram('${programId}')" style="flex:1">
                    <i class="ri-delete-bin-line"></i> 삭제
                </button>
            </div>
        </div>
    `);
}

async function handleDeleteProgram(programId) {
    try {
        await deleteProgram(programId);
        showToast('프로그램이 삭제되었습니다', 'success');
        hideModal();
        await loadAdminPrograms();
        switchAdminTab('programs');
    } catch (err) { showToast(err.message, 'error'); }
}

// ==========================================
// 업무일지 뷰
// ==========================================

function renderWorklogView() {
    if (state.worklogSelectedPerson) {
        return renderWorklogDetail();
    }
    return renderWorklogStaffList();
}

function renderWorklogStaffList() {
    const today = kstDateString(0);
    const staffCards = STAFF_ROSTER.map(person => {
        const todayLog = state.workLogs.find(l => l.person_key === person.key && l.log_date === today);
        const hasLog = todayLog && (todayLog.work.trim() || todayLog.notes.trim() || todayLog.pending.trim());
        return `
        <div class="worklog-person-card" onclick="selectWorklogPerson('${person.key}')">
            <div class="worklog-person-avatar">${escapeHtml(person.name[0])}</div>
            <div class="worklog-person-info">
                <div class="worklog-person-name">${escapeHtml(person.name)}</div>
                <div class="worklog-person-status ${hasLog ? 'has-log' : 'no-log'}">
                    <i class="${hasLog ? 'ri-checkbox-circle-line' : 'ri-time-line'}"></i>
                    ${hasLog ? '오늘 작성됨' : '작성 없음'}
                </div>
            </div>
            <i class="ri-arrow-right-s-line worklog-person-arrow"></i>
        </div>`;
    }).join('');

    return `
    ${renderNavbar()}
    <div class="admin">
        <div class="admin-header">
            <h1 class="admin-title"><i class="ri-file-list-3-line"></i> 업무일지</h1>
            <p class="admin-subtitle">직원별 일일 업무 기록을 확인합니다</p>
        </div>
        <div class="worklog-staff-grid">
            ${staffCards}
        </div>
    </div>`;
}

async function selectWorklogPerson(personKey) {
    state.worklogSelectedPerson = personKey;
    state.workLogs = await loadWorkLogs(personKey);
    renderApp();
}

async function clearWorklogPerson() {
    state.worklogSelectedPerson = null;
    const today = kstDateString(0);
    state.workLogs = await loadWorkLogs(null, today, today);
    renderApp();
}

function renderWorklogDetail() {
    const person = STAFF_ROSTER.find(p => p.key === state.worklogSelectedPerson);
    if (!person) return renderWorklogStaffList();

    const logs = state.workLogs.filter(l => l.person_key === person.key);
    const today = kstDateString(0);
    const dates = [];
    for (let i = 0; i < 30; i++) {
        dates.push(kstDateString(-i));
    }

    const logRows = dates.map(date => {
        const log = logs.find(l => l.log_date === date);
        const dayLabel = new Date(date + 'T00:00:00').toLocaleDateString('ko-KR', {
            month: 'short', day: 'numeric', weekday: 'short'
        });
        const isToday = date === today;

        if (!log || (!log.work.trim() && !log.notes.trim() && !log.pending.trim())) {
            return `
            <div class="worklog-day ${isToday ? 'worklog-today' : ''}">
                <div class="worklog-day-header">
                    <span class="worklog-day-date">${dayLabel}</span>
                    ${isToday ? '<span class="worklog-badge-today">오늘</span>' : ''}
                    <span class="worklog-badge-empty">작성 없음</span>
                </div>
            </div>`;
        }

        return `
        <div class="worklog-day ${isToday ? 'worklog-today' : ''}">
            <div class="worklog-day-header">
                <span class="worklog-day-date">${dayLabel}</span>
                ${isToday ? '<span class="worklog-badge-today">오늘</span>' : ''}
            </div>
            ${log.work.trim() ? `
            <div class="worklog-section">
                <div class="worklog-section-title"><i class="ri-briefcase-line"></i> 금일 업무사항</div>
                <div class="worklog-section-body">${escapeHtml(log.work).replace(/\n/g, '<br>')}</div>
            </div>` : ''}
            ${log.notes.trim() ? `
            <div class="worklog-section">
                <div class="worklog-section-title"><i class="ri-alert-line"></i> 특이사항</div>
                <div class="worklog-section-body">${escapeHtml(log.notes).replace(/\n/g, '<br>')}</div>
            </div>` : ''}
            ${log.pending.trim() ? `
            <div class="worklog-section">
                <div class="worklog-section-title"><i class="ri-time-line"></i> 단기미결</div>
                <div class="worklog-section-body">${escapeHtml(log.pending).replace(/\n/g, '<br>')}</div>
            </div>` : ''}
            <div class="worklog-meta">
                ${log.source ? `<span>출처: ${escapeHtml(log.source)}</span>` : ''}
                ${log.updated_at ? `<span>업데이트: ${formatDateTime(log.updated_at)}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    return `
    ${renderNavbar()}
    <div class="admin">
        <div class="admin-header">
            <button class="btn btn-ghost btn-sm" onclick="clearWorklogPerson()" style="margin-bottom:12px">
                <i class="ri-arrow-left-line"></i> 직원 목록
            </button>
            <h1 class="admin-title"><i class="ri-user-line"></i> ${escapeHtml(person.name)} 업무일지</h1>
            <p class="admin-subtitle">최근 30일 업무 기록</p>
        </div>
        <div class="worklog-timeline">
            ${logRows}
        </div>
    </div>`;
}

// ==========================================
// 통합보고 뷰
// ==========================================

function renderBriefingBlock(workLogs, staffRoster, isWeekly) {
    if (isWeekly) return '';
    if (workLogs.length === 0) {
        return `
        <div class="briefing-block briefing-empty">
            <div class="briefing-header">
                <i class="ri-file-list-3-line"></i> 일일 브리핑
            </div>
            <p class="briefing-empty-msg">해당 날짜에 작성된 업무일지가 없습니다.</p>
        </div>`;
    }

    const { statusLine, personLines, alerts } = generateBriefing(workLogs, staffRoster);

    const personHtml = personLines.length > 0
        ? personLines.map(p => {
            const linesHtml = p.lines.map(l => `<span class="briefing-task">${escapeHtml(l)}</span>`).join('<br>');
            return `<div class="briefing-person"><span class="briefing-name">${escapeHtml(p.name)}</span> — ${linesHtml}</div>`;
        }).join('')
        : '<div class="briefing-person briefing-line-empty">루틴 외 특이사항 없음</div>';

    const alertHtml = alerts.length > 0
        ? alerts.map(a => `<li>${escapeHtml(a)}</li>`).join('')
        : '<li class="briefing-no-alert">특이 없음</li>';

    return `
    <div class="briefing-block">
        <div class="briefing-header">
            <i class="ri-file-list-3-line"></i> 일일 브리핑
        </div>
        <div class="briefing-status">${escapeHtml(statusLine)}</div>
        <div class="briefing-person-list">
            ${personHtml}
        </div>
        <div class="briefing-alerts">
            <div class="briefing-alerts-title"><i class="ri-alarm-warning-line"></i> 특이·주의</div>
            <ul>${alertHtml}</ul>
        </div>
    </div>`;
}

function renderReportView() {
    const selectedDate = state.reportSelectedDate || kstDateString(0);
    const isWeekly = state.reportMode === 'weekly';

    let dateRange;
    if (isWeekly) {
        const start = new Date(selectedDate + 'T00:00:00');
        const dayOfWeek = start.getDay();
        const monday = new Date(start);
        monday.setDate(start.getDate() - ((dayOfWeek + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        dateRange = {
            from: monday.toISOString().slice(0, 10),
            to: sunday.toISOString().slice(0, 10),
            label: `${monday.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ~ ${sunday.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`
        };
    } else {
        const dateObj = new Date(selectedDate + 'T00:00:00');
        dateRange = {
            from: selectedDate,
            to: selectedDate,
            label: dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
        };
    }

    const staffSections = STAFF_ROSTER.map(person => {
        const personLogs = state.workLogs.filter(l => l.person_key === person.key);
        if (personLogs.length === 0) {
            return `
            <div class="report-person-block">
                <div class="report-person-name"><i class="ri-user-line"></i> ${escapeHtml(person.name)}</div>
                <div class="report-empty">작성 없음</div>
            </div>`;
        }

        const logCards = personLogs.map(log => {
            const hasContent = log.work.trim() || log.notes.trim() || log.pending.trim();
            if (!hasContent) {
                return `<div class="report-log-date">${log.log_date} — 작성 없음</div>`;
            }
            return `
            <div class="report-log-entry">
                ${isWeekly ? `<div class="report-log-date">${new Date(log.log_date + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}</div>` : ''}
                ${log.work.trim() ? `<div class="worklog-section"><div class="worklog-section-title"><i class="ri-briefcase-line"></i> 금일 업무사항</div><div class="worklog-section-body">${escapeHtml(log.work).replace(/\n/g, '<br>')}</div></div>` : ''}
                ${log.notes.trim() ? `<div class="worklog-section"><div class="worklog-section-title"><i class="ri-alert-line"></i> 특이사항</div><div class="worklog-section-body">${escapeHtml(log.notes).replace(/\n/g, '<br>')}</div></div>` : ''}
                ${log.pending.trim() ? `<div class="worklog-section"><div class="worklog-section-title"><i class="ri-time-line"></i> 단기미결</div><div class="worklog-section-body">${escapeHtml(log.pending).replace(/\n/g, '<br>')}</div></div>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="report-person-block">
            <div class="report-person-name"><i class="ri-user-line"></i> ${escapeHtml(person.name)}</div>
            ${logCards}
        </div>`;
    }).join('');

    return `
    ${renderNavbar()}
    <div class="admin">
        <div class="admin-header">
            <h1 class="admin-title"><i class="ri-bar-chart-grouped-line"></i> 통합보고</h1>
            <p class="admin-subtitle">전 직원 업무 현황을 한눈에 확인합니다</p>
        </div>

        <div class="report-controls">
            <div class="report-mode-switch">
                <button class="btn btn-sm ${!isWeekly ? 'btn-primary' : 'btn-secondary'}" onclick="setReportMode('daily')">일간</button>
                <button class="btn btn-sm ${isWeekly ? 'btn-primary' : 'btn-secondary'}" onclick="setReportMode('weekly')">주간</button>
            </div>
            <div class="report-date-nav">
                <button class="btn btn-ghost btn-sm" onclick="shiftReportDate(-1)" title="전일"><i class="ri-arrow-left-s-line"></i></button>
                <input type="date" class="report-date-input" value="${selectedDate}" onchange="changeReportDate(this.value)" max="${kstDateString(0)}">
                <button class="btn btn-ghost btn-sm" onclick="shiftReportDate(1)" title="다음날" ${selectedDate >= kstDateString(0) ? 'disabled' : ''}><i class="ri-arrow-right-s-line"></i></button>
                <button class="btn btn-secondary btn-sm" onclick="changeReportDate(kstDateString(-1))">어제</button>
                <button class="btn btn-secondary btn-sm" onclick="changeReportDate(kstDateString(0))">오늘</button>
            </div>
            <div class="report-date-label">${dateRange.label}</div>
        </div>

        ${renderBriefingBlock(state.workLogs, STAFF_ROSTER, isWeekly)}

        <div class="report-section-header">
            <h2><i class="ri-team-line"></i> 직원별 업무 현황</h2>
        </div>
        <div class="report-staff-list">
            ${staffSections}
        </div>
    </div>`;
}


async function setReportMode(mode) {
    state.reportMode = mode;
    await navigateReport();
}

async function changeReportDate(date) {
    state.reportSelectedDate = date;
    await navigateReport();
}

async function shiftReportDate(offsetDays) {
    const current = state.reportSelectedDate || kstDateString(0);
    const next = shiftMetricDate(current, offsetDays);
    const today = kstDateString(0);
    if (next > today) return;
    state.reportSelectedDate = next;
    await navigateReport();
}

async function navigateReport() {
    const selectedDate = state.reportSelectedDate || kstDateString(0);
    let dateFrom = selectedDate;
    let dateTo = selectedDate;

    if (state.reportMode === 'weekly') {
        const start = new Date(selectedDate + 'T00:00:00');
        const dayOfWeek = start.getDay();
        const monday = new Date(start);
        monday.setDate(start.getDate() - ((dayOfWeek + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        dateFrom = monday.toISOString().slice(0, 10);
        dateTo = sunday.toISOString().slice(0, 10);
    }

    state.workLogs = await loadWorkLogs(null, dateFrom, dateTo);
    renderApp();
}

// ==========================================
// 메인 라우터 & 렌더링
// ==========================================

async function navigate(view) {
    state.currentView = view;
    if (view !== 'dashboard') stopMarketingAutoRefresh();
    if (view !== 'admin') unsubscribeProfilesRealtime();

    if (view === 'dashboard') {
        await loadRoles();
        if (isInternalUser()) {
            await loadMarketingData();
            startMarketingAutoRefresh();
        } else {
            await loadPrograms();
        }
    } else if (view === 'programs') {
        if (!isInternalUser()) {
            navigate('dashboard');
            return;
        }
        await loadPrograms();
    } else if (view === 'admin') {
        if (state.profile?.role_id !== 'admin') {
            showToast('관리자 권한이 필요합니다', 'error');
            navigate('dashboard');
            return;
        }
        await loadRoles();
        await loadAdminUsers();
        await loadAdminPrograms();
        subscribeProfilesRealtime();
    } else if (view === 'worklog') {
        if (state.profile?.role_id !== 'admin') {
            showToast('관리자 권한이 필요합니다', 'error');
            navigate('dashboard');
            return;
        }
        if (state.worklogSelectedPerson) {
            state.workLogs = await loadWorkLogs(state.worklogSelectedPerson);
        } else {
            const today = kstDateString(0);
            state.workLogs = await loadWorkLogs(null, today, today);
        }
    } else if (view === 'report') {
        if (state.profile?.role_id !== 'admin') {
            showToast('관리자 권한이 필요합니다', 'error');
            navigate('dashboard');
            return;
        }
        if (!state.reportSelectedDate) {
            state.reportSelectedDate = kstDateString(0);
        }
        state.workLogs = await loadWorkLogs(null, state.reportSelectedDate, state.reportSelectedDate);
    }

    renderApp();
}

function renderApp() {
    const app = $('#app');
    if (!app) return;

    switch (state.currentView) {
        case 'auth':
            app.innerHTML = renderAuthView();
            break;
        case 'dashboard':
            app.innerHTML = isInternalUser() ? renderInternalDashboardView() : renderDashboardView();
            break;
        case 'programs':
            app.innerHTML = renderDashboardView();
            break;
        case 'admin':
            app.innerHTML = renderAdminView();
            break;
        case 'worklog':
            app.innerHTML = renderWorklogView();
            break;
        case 'report':
            app.innerHTML = renderReportView();
            break;
        default:
            app.innerHTML = '';
    }
}

// ==========================================
// 초기화
// ==========================================

async function init() {
    try {
        // 세션 확인
        const { data: { session } } = await sb.auth.getSession();

        if (session) {
            state.user = session.user;
            await loadRoles();
            await loadProfile();

            if (state.profile && isProfileApproved(state.profile)) {
                startLastSeenHeartbeat();
                hideLoadingScreen();
                await navigate('dashboard');
                handleCafe24OAuthResult();
            } else if (state.profile) {
                const status = getApprovalStatus(state.profile);
                await sb.auth.signOut();
                state.user = null;
                state.profile = null;
                hideLoadingScreen();
                navigate('auth');
                showToast(
                    status === 'rejected' ? '가입 요청이 승인되지 않았습니다. 관리자에게 문의해주세요.' : '관리자 승인 대기 중입니다.',
                    status === 'rejected' ? 'error' : 'warning'
                );
            } else {
                // 프로필이 없는 경우 (트리거 지연 가능)
                setTimeout(async () => {
                    await loadProfile();
                    hideLoadingScreen();
                    if (state.profile && isProfileApproved(state.profile)) {
                        startLastSeenHeartbeat();
                        navigate('dashboard');
                    } else {
                        if (state.profile) await sb.auth.signOut();
                        navigate('auth');
                    }
                }, 1500);
            }
        } else {
            hideLoadingScreen();
            navigate('auth');
        }

        // 인증 상태 변경 감지
        sb.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                state.user = session.user;
                await loadRoles();
                await loadProfile();
                if (!state.profile) {
                    // 트리거가 아직 실행 중일 수 있음
                    await new Promise(r => setTimeout(r, 1000));
                    await loadProfile();
                }
                if (!state.registrationInProgress && state.profile && !isProfileApproved(state.profile)) {
                    const status = getApprovalStatus(state.profile);
                    await sb.auth.signOut();
                    state.user = null;
                    state.profile = null;
                    showToast(
                        status === 'rejected' ? '가입 요청이 승인되지 않았습니다.' : '관리자 승인 대기 중입니다.',
                        status === 'rejected' ? 'error' : 'warning'
                    );
                } else if (!state.registrationInProgress && state.currentView === 'auth') {
                    startLastSeenHeartbeat();
                    navigate('dashboard');
                }
            } else if (event === 'SIGNED_OUT') {
                stopLastSeenHeartbeat();
                state.user = null;
                state.profile = null;
                navigate('auth');
            }
        });
    } catch (err) {
        console.error('초기화 오류:', err);
        hideLoadingScreen();
        navigate('auth');
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        refreshMarketingDashboard();
        recordCurrentUserAccess();
    }
});

if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('focus', () => {
        recordCurrentUserAccess();
    });
}

// 앱 시작
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
