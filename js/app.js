// ==========================================
// jangsAI - 프로그램 센터 (메인 앱)
// ==========================================

// --- Supabase 설정 ---
const SUPABASE_URL = 'https://pfmrqsfmkdnhzjimqocr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MTmIgPL7ilgjlb1tC92Mng_WExurSRL';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const EMAIL_DOMAIN = '@jangsai.local';
const OWNER_EMAIL = 'kher2000@jangsai.local';

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
    'yural-tonggam-cream': ['유랄 통감크림', '통감크림'],
    'yural-myeongga-bonhwan': ['유랄 명가본환', '명가본환'],
};

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
    selectedMarketingProduct: 'all',
    marketingRange: 7,
    marketingView: 'report',
    reportDays: 3,
    marketingDataReady: true,
};

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

async function loadProfile() {
    if (!state.user) return null;
    const { data, error } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
    if (error) {
        console.error('프로필 로드 실패:', error);
        if (!isOwnerUser()) return null;
        state.profile = createOwnerProfile();
        return state.profile;
    }
    state.profile = isOwnerUser() ? { ...data, role_id: 'admin', approval_status: 'approved' } : data;
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

async function loadMarketingData() {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 62);
    const dateFrom = startDate.toISOString().slice(0, 10);

    const [{ data: products, error: productError }, { data: metrics, error: metricError }] = await Promise.all([
        sb.from('marketing_products').select('*').eq('is_active', true).order('sort_order'),
        sb.from('daily_marketing_metrics').select('*').gte('metric_date', dateFrom).order('metric_date'),
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
    state.marketingDataReady = true;
}

async function loadAdminUsers() {
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { console.error('사용자 로드 실패:', error); return; }
    const profiles = data || [];
    state.adminUsers = profiles.filter(profile => isProfileApproved(profile));
    state.adminRequests = profiles.filter(profile => ['pending', 'rejected'].includes(getApprovalStatus(profile)));
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

function formatMetric(value) {
    return new Intl.NumberFormat('ko-KR').format(Math.round(metricNumber(value)));
}

function formatWon(value) {
    return `${new Intl.NumberFormat('ko-KR').format(Math.round(metricNumber(value)))}원`;
}

function getMetricSales(metric) {
    return metricNumber(metric?.cafe24_orders) + metricNumber(metric?.coupang_orders) + metricNumber(metric?.smartstore_orders);
}

function getMetricRevenue(metric) {
    return metricNumber(metric?.cafe24_revenue) + metricNumber(metric?.coupang_revenue) + metricNumber(metric?.smartstore_revenue);
}

function getVisibleMarketingMetrics() {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - state.marketingRange + 1);
    const cutoffString = cutoff.toISOString().slice(0, 10);

    return state.marketingMetrics.filter(metric =>
        metric.metric_date >= cutoffString &&
        (state.selectedMarketingProduct === 'all' || metric.product_id === state.selectedMarketingProduct)
    );
}

function aggregateMarketingMetrics(metrics) {
    return metrics.reduce((total, metric) => {
        total.content_views += metricNumber(metric.content_views);
        total.keyword_search_volume += metricNumber(metric.keyword_search_volume);
        total.site_visits += metricNumber(metric.site_visits);
        total.tracked_visits += metricNumber(metric.tracked_visits);
        total.tracked_orders += metricNumber(metric.tracked_orders);
        total.orders += getMetricSales(metric);
        total.revenue += getMetricRevenue(metric);
        total.ad_spend += metricNumber(metric.ad_spend);
        return total;
    }, { content_views: 0, keyword_search_volume: 0, site_visits: 0, tracked_visits: 0, tracked_orders: 0, orders: 0, revenue: 0, ad_spend: 0 });
}

function percent(numerator, denominator) {
    return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function renderMarketingDiagnosis(total) {
    if (!total.content_views && !total.keyword_search_volume && !total.site_visits && !total.orders) {
        return `
        <div class="diagnosis-item neutral">
            <i class="ri-information-line"></i>
            <div><strong>아직 기록된 데이터가 없습니다</strong><span>첫 데이터를 입력하면 지표별 이상 원인을 자동으로 안내합니다.</span></div>
        </div>`;
    }

    const exposureToVisit = percent(total.tracked_visits, total.content_views);
    const conversion = percent(total.tracked_orders, total.tracked_visits);
    const diagnoses = [];

    if (total.content_views === 0) diagnoses.push(['danger', 'ri-file-warning-line', '콘텐츠 노출 확인 필요', '발행 글 또는 카페 게시물 조회 데이터가 없습니다. 게시물·계정 노출 상태를 확인하세요.']);
    else if (exposureToVisit < 10) diagnoses.push(['warning', 'ri-route-line', '노출 대비 유입이 낮습니다', `현재 ${exposureToVisit.toFixed(1)}%입니다. 원고 설득력, 링크 위치와 CTA를 점검하세요.`]);
    else diagnoses.push(['good', 'ri-check-line', '노출→유입 흐름이 양호합니다', `현재 ${exposureToVisit.toFixed(1)}%로 10·10 기준을 충족합니다.`]);

    if (total.keyword_search_volume === 0) diagnoses.push(['neutral', 'ri-search-eye-line', '브랜드 검색 관심 데이터가 없습니다', '검색량 또는 검색지수를 연결하면 콘텐츠 노출과 관심도의 동반 추세를 확인할 수 있습니다.']);
    if (total.tracked_visits > 0 && conversion < 10) diagnoses.push(['warning', 'ri-shopping-cart-line', '추적 유입 대비 구매 전환이 낮습니다', `현재 ${conversion.toFixed(1)}%입니다. 리뷰, 상세페이지, 가격 및 경쟁사 변화를 확인하세요.`]);
    else if (total.tracked_orders > 0) diagnoses.push(['good', 'ri-shopping-bag-3-line', '추적 구매 전환이 기준 이상입니다', `현재 ${conversion.toFixed(1)}%로 10·10 기준을 충족합니다.`]);

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
            <span><small>검색량</small><strong>${formatMetric(latest.keyword_search_volume)}</strong></span>
            <span><small>유입</small><strong>${formatMetric(latest.site_visits)}</strong></span>
            <span><small>판매</small><strong>${formatMetric(getMetricSales(latest))}</strong></span>
        </div>
        <p>${formatDate(latest.metric_date)} · ${formatWon(getMetricRevenue(latest))}</p>` : `
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
            <thead><tr><th>날짜</th><th>콘텐츠 노출</th><th>브랜드 검색</th><th>UTM 유입</th><th>전체 판매</th><th>매출</th><th>광고비</th><th>추적 전환율</th></tr></thead>
            <tbody>
            ${rows.map(([date, dayMetrics]) => {
                const day = aggregateMarketingMetrics(dayMetrics);
                return `<tr>
                    <td><strong>${formatDate(date)}</strong></td>
                    <td>${formatMetric(day.content_views)}</td>
                    <td>${formatMetric(day.keyword_search_volume)}</td>
                    <td>${formatMetric(day.tracked_visits)}</td>
                    <td>${formatMetric(day.orders)}</td>
                    <td>${formatWon(day.revenue)}</td>
                    <td>${formatWon(day.ad_spend)}</td>
                    <td>${percent(day.tracked_orders, day.tracked_visits).toFixed(1)}%</td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>
    </div>`;
}

function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getReportDates(count = state.reportDays) {
    return Array.from({ length: count }, (_, index) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - index);
        return localDateString(date);
    });
}

function getReportProduct() {
    if (state.selectedMarketingProduct !== 'all') {
        return state.marketingProducts.find(product => product.id === state.selectedMarketingProduct);
    }
    return state.marketingProducts[0];
}

function reportMetricValue(metric, key, formatter = formatMetric) {
    if (!metric) return '<span class="report-no-data">—</span>';
    return formatter(metricNumber(metric[key]));
}

function renderReportRow(label, dates, metricsByDate, valueGetter, options = {}) {
    return `
    <tr class="${options.total ? 'report-total-row' : ''}">
        <th>${options.indent ? '<span class="report-indent">└</span>' : ''}${escapeHtml(label)}</th>
        ${dates.map(date => `<td>${valueGetter(metricsByDate.get(date), date)}</td>`).join('')}
    </tr>`;
}

function renderDailyReportTable(product) {
    const dates = getReportDates();
    const productMetrics = state.marketingMetrics.filter(metric => metric.product_id === product.id);
    const metricsByDate = new Map(productMetrics.map(metric => [metric.metric_date, metric]));
    const monthAggregate = date => {
        const month = date.slice(0, 7);
        return aggregateMarketingMetrics(productMetrics.filter(metric => metric.metric_date.startsWith(month) && metric.metric_date <= date));
    };
    const won = value => formatWon(value);

    return `
    <div class="excel-report-scroll">
        <table class="excel-report-table product-theme-${product.sort_order || 1}">
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
                ${renderReportRow('브랜드 검색량', dates, metricsByDate, metric => reportMetricValue(metric, 'keyword_search_volume'))}
                ${renderReportRow('발행 콘텐츠 조회수', dates, metricsByDate, metric => reportMetricValue(metric, 'content_views'))}
                ${renderReportRow('자사몰 유입수', dates, metricsByDate, metric => reportMetricValue(metric, 'site_visits'), { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-shopping-bag-3-line"></i> 판매량</th></tr>
                ${renderReportRow('자사몰', dates, metricsByDate, metric => reportMetricValue(metric, 'cafe24_orders'), { indent: true })}
                ${renderReportRow('스마트스토어', dates, metricsByDate, metric => reportMetricValue(metric, 'smartstore_orders'), { indent: true })}
                ${renderReportRow('쿠팡', dates, metricsByDate, metric => reportMetricValue(metric, 'coupang_orders'), { indent: true })}
                ${renderReportRow('판매량 총합', dates, metricsByDate, metric => metric ? formatMetric(getMetricSales(metric)) : '<span class="report-no-data">—</span>', { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-money-dollar-circle-line"></i> 매출</th></tr>
                ${renderReportRow('일 매출', dates, metricsByDate, metric => metric ? won(getMetricRevenue(metric)) : '<span class="report-no-data">—</span>')}
                ${renderReportRow('월 누적 매출', dates, metricsByDate, (metric, date) => metric ? won(monthAggregate(date).revenue) : '<span class="report-no-data">—</span>', { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-megaphone-line"></i> 마케팅 광고비</th></tr>
                ${renderReportRow('일 광고비', dates, metricsByDate, metric => reportMetricValue(metric, 'ad_spend', won))}
                ${renderReportRow('월 누적 광고비', dates, metricsByDate, (metric, date) => metric ? won(monthAggregate(date).ad_spend) : '<span class="report-no-data">—</span>', { total: true })}

                <tr class="report-section-row"><th colspan="${dates.length + 1}"><i class="ri-links-line"></i> 10·10 추적</th></tr>
                ${renderReportRow('UTM 추적 유입', dates, metricsByDate, metric => reportMetricValue(metric, 'tracked_visits'))}
                ${renderReportRow('UTM 추적 구매', dates, metricsByDate, metric => reportMetricValue(metric, 'tracked_orders'))}
                ${renderReportRow('구매 전환율', dates, metricsByDate, metric => metric ? `${percent(metricNumber(metric.tracked_orders), metricNumber(metric.tracked_visits)).toFixed(1)}%` : '<span class="report-no-data">—</span>', { total: true })}
            </tbody>
        </table>
    </div>`;
}

function renderInternalReportView() {
    const product = getReportProduct();
    if (!product) return `${renderNavbar()}<main class="internal-dashboard"><div class="marketing-empty-row">제품 정보를 불러오는 중입니다.</div></main>`;
    const keywords = PRODUCT_KEYWORDS[product.slug] || [product.name];

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
                <button class="btn btn-primary" onclick="showDailyMetricModal()"><i class="ri-add-line"></i> 오늘 숫자 입력</button>
            </div>
        </section>

        <section class="marketing-view-switch">
            <button class="active" onclick="setMarketingView('report')"><i class="ri-table-line"></i> 일일 보고서</button>
            <button onclick="setMarketingView('funnel')"><i class="ri-line-chart-line"></i> 퍼널 분석</button>
        </section>

        <section class="report-controls">
            <div class="report-product-tabs">
                ${state.marketingProducts.map(item => `
                    <button class="${item.id === product.id ? 'active' : ''}" onclick="selectMarketingProduct('${item.id}')">
                        <small>${escapeHtml(item.brand)}</small><strong>${escapeHtml(item.name)}</strong>
                    </button>`).join('')}
            </div>
            <select class="filter-select" onchange="changeReportDays(this.value)">
                <option value="3" ${state.reportDays === 3 ? 'selected' : ''}>최근 3일</option>
                <option value="7" ${state.reportDays === 7 ? 'selected' : ''}>최근 7일</option>
            </select>
        </section>

        <section class="report-keywords">
            <span>추적 키워드</span>
            ${keywords.map(keyword => `<b>${escapeHtml(keyword)}</b>`).join('')}
        </section>

        <section class="excel-report-card">
            ${renderDailyReportTable(product)}
        </section>

        <p class="report-help"><i class="ri-information-line"></i> 숫자가 없는 날짜는 — 로 표시됩니다. 우측 상단 ‘오늘 숫자 입력’에서 기존 엑셀 항목 그대로 기록할 수 있습니다.</p>
    </main>`;
}

function renderInternalDashboardView() {
    return state.marketingView === 'report' ? renderInternalReportView() : renderFunnelDashboardView();
}

function renderFunnelDashboardView() {
    const metrics = getVisibleMarketingMetrics();
    const total = aggregateMarketingMetrics(metrics);
    const exposureToVisit = percent(total.tracked_visits, total.content_views);
    const conversion = percent(total.tracked_orders, total.tracked_visits);
    const roas = percent(total.revenue, total.ad_spend);
    const tenTenIndex = total.content_views > 0
        ? Math.round((Math.min(exposureToVisit / 10, 2) + Math.min(conversion / 10, 2)) * 50)
        : 0;

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
                <span class="sync-status ${state.marketingDataReady ? '' : 'waiting'}">
                    <i class="${state.marketingDataReady ? 'ri-checkbox-circle-line' : 'ri-time-line'}"></i>
                    ${state.marketingDataReady ? '데이터 연결됨' : 'DB 설정 필요'}
                </span>
                <button class="btn btn-primary" onclick="showDailyMetricModal()"><i class="ri-add-line"></i> 일일 데이터 입력</button>
            </div>
        </section>

        <section class="marketing-view-switch">
            <button onclick="setMarketingView('report')"><i class="ri-table-line"></i> 일일 보고서</button>
            <button class="active" onclick="setMarketingView('funnel')"><i class="ri-line-chart-line"></i> 퍼널 분석</button>
        </section>

        <section class="marketing-toolbar">
            <div class="marketing-product-filter">
                <button class="${state.selectedMarketingProduct === 'all' ? 'active' : ''}" onclick="selectMarketingProduct('all')">전체 제품</button>
                ${state.marketingProducts.map(product => `
                    <button class="${state.selectedMarketingProduct === product.id ? 'active' : ''}" onclick="selectMarketingProduct('${product.id}')">${escapeHtml(product.name)}</button>
                `).join('')}
            </div>
            <select class="filter-select" onchange="changeMarketingRange(this.value)">
                <option value="7" ${state.marketingRange === 7 ? 'selected' : ''}>최근 7일</option>
                <option value="14" ${state.marketingRange === 14 ? 'selected' : ''}>최근 14일</option>
                <option value="30" ${state.marketingRange === 30 ? 'selected' : ''}>최근 30일</option>
            </select>
        </section>

        <section class="funnel-panel">
            <div class="funnel-heading">
                <div><span>10·10 FUNNEL</span><h2>노출에서 구매까지</h2></div>
                <div class="ten-ten-index"><small>장스 지수</small><strong>${tenTenIndex}</strong><span>/ 100</span></div>
            </div>
            <div class="funnel-flow">
                <div class="funnel-step"><i class="ri-eye-line"></i><span>콘텐츠 노출</span><strong>${formatMetric(total.content_views)}</strong><small>블로그·카페 조회</small></div>
                <div class="funnel-rate"><i class="ri-arrow-right-line"></i><b>${exposureToVisit.toFixed(1)}%</b></div>
                <div class="funnel-step search"><i class="ri-links-line"></i><span>추적 유입</span><strong>${formatMetric(total.tracked_visits)}</strong><small>UTM·전용 링크</small></div>
                <div class="funnel-rate"><i class="ri-arrow-right-line"></i><b>${conversion.toFixed(1)}%</b></div>
                <div class="funnel-step visit"><i class="ri-shopping-bag-3-line"></i><span>추적 구매</span><strong>${formatMetric(total.tracked_orders)}건</strong><small>캠페인 귀속 구매</small></div>
                <div class="funnel-rate reference"><i class="ri-more-line"></i><b>참고</b></div>
                <div class="funnel-step sales"><i class="ri-money-dollar-circle-line"></i><span>전체 매출</span><strong>${formatWon(total.revenue)}</strong><small>3개 판매채널 합계</small></div>
            </div>
            <p class="funnel-disclaimer"><i class="ri-information-line"></i> 브랜드 검색량과 전체 채널 매출은 직접 전환으로 단정하지 않고 별도 참고 지표로 봅니다.</p>
        </section>

        <section class="marketing-kpis">
            <div class="marketing-kpi"><span>브랜드 검색 관심</span><strong>${formatMetric(total.keyword_search_volume)}</strong><small>검색량 또는 검색지수</small></div>
            <div class="marketing-kpi"><span>자사몰 전체 유입</span><strong>${formatMetric(total.site_visits)}</strong><small>추적 여부와 무관한 전체 방문</small></div>
            <div class="marketing-kpi"><span>총 매출</span><strong>${formatWon(total.revenue)}</strong><small>카페24·쿠팡·스마트스토어</small></div>
            <div class="marketing-kpi"><span>광고비</span><strong>${formatWon(total.ad_spend)}</strong><small>선택 기간 합계</small></div>
            <div class="marketing-kpi"><span>ROAS</span><strong>${roas.toFixed(0)}%</strong><small>매출 ÷ 광고비</small></div>
            <div class="marketing-kpi accent"><span>구매 전환율</span><strong>${conversion.toFixed(1)}%</strong><small>목표 10%</small></div>
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
                <div class="marketing-section-title"><div><span>CHECK POINT</span><h2>오늘의 진단</h2></div><i class="ri-stethoscope-line"></i></div>
                <div class="diagnosis-list">${renderMarketingDiagnosis(total)}</div>
            </div>
        </section>
    </main>`;
}

function selectMarketingProduct(productId) {
    state.selectedMarketingProduct = productId;
    renderApp();
}

function setMarketingView(view) {
    state.marketingView = view;
    if (view === 'report' && state.selectedMarketingProduct === 'all') {
        state.selectedMarketingProduct = state.marketingProducts[0]?.id || 'all';
    }
    renderApp();
}

function changeReportDays(value) {
    state.reportDays = Number(value) === 7 ? 7 : 3;
    renderApp();
}

function changeMarketingRange(value) {
    state.marketingRange = Number(value) || 7;
    renderApp();
}

function showDailyMetricModal() {
    if (!state.marketingDataReady) {
        showToast('먼저 마케팅 DB 마이그레이션을 적용해주세요', 'warning');
        return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const selected = state.selectedMarketingProduct === 'all' ? state.marketingProducts[0]?.id : state.selectedMarketingProduct;
    showModal(`
        <div class="modal-header">
            <h3>일일 마케팅 데이터 입력</h3>
            <button class="modal-close" onclick="hideModal()"><i class="ri-close-line"></i></button>
        </div>
        <div class="modal-body">
            <form onsubmit="handleDailyMetricSubmit(event)">
                <div class="form-row">
                    <div class="form-group"><label class="form-label">제품</label><select class="form-input" id="metric-product" required>
                        ${state.marketingProducts.map(product => `<option value="${product.id}" ${product.id === selected ? 'selected' : ''}>${escapeHtml(product.brand)} ${escapeHtml(product.name)}</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label class="form-label">기준일</label><input class="form-input" type="date" id="metric-date" value="${today}" required></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">콘텐츠 조회·노출</label><input class="form-input" type="number" id="metric-content-views" min="0" value="0"></div>
                    <div class="form-group"><label class="form-label">브랜드 검색량</label><input class="form-input" type="number" id="metric-search" min="0" value="0"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">자사몰 전체 유입</label><input class="form-input" type="number" id="metric-visits" min="0" value="0"></div>
                    <div class="form-group"><label class="form-label">광고비</label><input class="form-input" type="number" id="metric-ad-spend" min="0" value="0"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">UTM 추적 유입</label><input class="form-input" type="number" id="metric-tracked-visits" min="0" value="0"><div class="form-hint">10·10 유입률 계산에 사용</div></div>
                    <div class="form-group"><label class="form-label">UTM 추적 구매</label><input class="form-input" type="number" id="metric-tracked-orders" min="0" value="0"><div class="form-hint">10·10 구매전환율 계산에 사용</div></div>
                </div>
                <div class="channel-entry-grid">
                    ${['cafe24', 'coupang', 'smartstore'].map((channel, index) => `
                    <div class="channel-entry">
                        <strong>${['카페24', '쿠팡', '스마트스토어'][index]}</strong>
                        <input class="form-input" type="number" id="metric-${channel}-orders" min="0" value="0" placeholder="판매량">
                        <input class="form-input" type="number" id="metric-${channel}-revenue" min="0" value="0" placeholder="매출">
                    </div>`).join('')}
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
    const value = id => metricNumber($(`#${id}`)?.value);

    const record = {
        product_id: $('#metric-product').value,
        metric_date: $('#metric-date').value,
        content_views: value('metric-content-views'),
        keyword_search_volume: value('metric-search'),
        site_visits: value('metric-visits'),
        tracked_visits: value('metric-tracked-visits'),
        tracked_orders: value('metric-tracked-orders'),
        ad_spend: value('metric-ad-spend'),
        cafe24_orders: value('metric-cafe24-orders'),
        cafe24_revenue: value('metric-cafe24-revenue'),
        coupang_orders: value('metric-coupang-orders'),
        coupang_revenue: value('metric-coupang-revenue'),
        smartstore_orders: value('metric-smartstore-orders'),
        smartstore_revenue: value('metric-smartstore-revenue'),
        source: 'manual',
        created_by: state.user.id,
        updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from('daily_marketing_metrics').upsert(record, { onConflict: 'product_id,metric_date' });
    if (error) {
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
                        ${state.roles.filter(role => role.id !== 'admin').map(role =>
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
                        ${state.roles.filter(r => r.id !== 'admin').map(r =>
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
// 메인 라우터 & 렌더링
// ==========================================

async function navigate(view) {
    state.currentView = view;

    if (view === 'dashboard') {
        await loadRoles();
        if (isInternalUser()) await loadMarketingData();
        else await loadPrograms();
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
                hideLoadingScreen();
                navigate('dashboard');
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
                    navigate('dashboard');
                }
            } else if (event === 'SIGNED_OUT') {
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

// 앱 시작
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
