// ==========================================
// jangsAI - 프로그램 센터 (메인 앱)
// ==========================================

// --- Supabase 설정 ---
const SUPABASE_URL = 'https://pfmrqsfmkdnhzjimqocr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_MTmIgPL7ilgjlb1tC92Mng_WExurSRL';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const EMAIL_DOMAIN = '@jangsai.local';

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

// --- 앱 상태 ---
const state = {
    user: null,
    profile: null,
    roles: [],
    programs: [],
    currentView: 'loading',
    codeSent: false,
    phoneValue: '',
    activeWebApp: null,
    adminTab: 'users',
    adminUsers: [],
    adminPrograms: [],
    searchQuery: '',
    categoryFilter: 'all',
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
        options: { data: { username, display_name: displayName || username } }
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
    if (error) { console.error('프로필 로드 실패:', error); return null; }
    state.profile = data;
    return data;
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

async function loadAdminUsers() {
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { console.error('사용자 로드 실패:', error); return; }
    state.adminUsers = data || [];
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
    return `
    <div class="auth-container">
        <div class="auth-card">
            <div class="auth-header">
                <div class="auth-logo">jangs<span>AI</span></div>
                <p class="auth-subtitle">장진환 개발중</p>
            </div>
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
            </form>
        </div>
    </div>`;
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
        showToast('로그인 성공!', 'success');

        const { data: { session } } = await sb.auth.getSession();
        if (session) {
            state.user = session.user;
            await loadProfile();
            await loadRoles();
            state.codeSent = false;
            navigate('dashboard');
        }
    } catch (err) {
        showToast('인증번호가 올바르지 않습니다. 다시 확인해주세요.', 'error');
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}

// ==========================================
// 뷰 렌더링 - 네비게이션 바
// ==========================================

function renderNavbar() {
    const isAdmin = state.profile?.role_id === 'admin';
    const initial = (state.profile?.display_name || state.profile?.username || '?')[0].toUpperCase();
    return `
    <nav class="navbar">
        <div class="navbar-brand" onclick="navigate('dashboard')">jangs<span>AI</span></div>
        <div class="navbar-right">
            ${isAdmin ? `
            <button class="btn btn-sm ${state.currentView === 'admin' ? 'btn-primary' : 'btn-secondary'}" onclick="navigate('admin')" id="nav-admin-btn">
                <i class="ri-settings-3-line"></i> 관리자
            </button>
            <button class="btn btn-sm ${state.currentView === 'dashboard' ? 'btn-primary' : 'btn-secondary'}" onclick="navigate('dashboard')" id="nav-dashboard-btn">
                <i class="ri-apps-line"></i> 프로그램
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
// 뷰 렌더링 - 대시보드 (프로그램 목록)
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
            <p class="admin-subtitle">사용자, 등급, 프로그램을 관리합니다</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-card-icon users"><i class="ri-group-line"></i></div>
                <div class="stat-value">${state.adminUsers.length}</div>
                <div class="stat-label">총 사용자</div>
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
        if (tab === 'users') content.innerHTML = renderAdminUsers();
        else if (tab === 'roles') content.innerHTML = renderAdminRoles();
        else if (tab === 'programs') content.innerHTML = renderAdminPrograms();
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

        // 프로필 생성 대기 후 등급 변경
        if (result.id) {
            await new Promise(r => setTimeout(r, 1500));
            await sb.from('profiles').update({ role_id: roleId }).eq('id', result.id);
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

            if (state.profile) {
                hideLoadingScreen();
                navigate('dashboard');
            } else {
                // 프로필이 없는 경우 (트리거 지연 가능)
                setTimeout(async () => {
                    await loadProfile();
                    hideLoadingScreen();
                    if (state.profile) {
                        navigate('dashboard');
                    } else {
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
                if (state.currentView === 'auth') navigate('dashboard');
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
document.addEventListener('DOMContentLoaded', init);
