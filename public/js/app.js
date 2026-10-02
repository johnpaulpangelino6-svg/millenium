// ==========================================================================
// MILLENNIUM SMARTBOARD MANAGEMENT SYSTEM - CORE APPLICATION LOGIC
// Full-Stack TypeScript REST API Integration, IoT Simulator & Role Controller
// ==========================================================================

const API_BASE = '/api';

// --- Role Access Configuration ---
// Defines which tabs each role can access
const ROLE_ACCESS = {
  admin:      ['dashboard','devices','tickets','customer-portal','warranty','inventory','data-manager','cms','predictive','analytics','rentals'],
  technician: ['devices','tickets','inventory'],
  customer:   ['devices','tickets','customer-portal','rentals'],
};

// Role display metadata
const ROLE_META = {
  admin:      { icon: '🏢', name: 'Admin Portal',      desc: 'Full system access',          defaultTab: 'dashboard' },
  technician: { icon: '🔧', name: 'Technician Portal', desc: 'Assigned jobs & inventory',    defaultTab: 'tickets' },
  customer:   { icon: '🏫', name: 'Customer Portal',   desc: 'My Devices & Tickets',        defaultTab: 'devices' },
};

// Application State
const state = {
  currentRole: 'admin', // 'admin' | 'technician' | 'customer'
  currentTab: 'dashboard',
  currentUser: null,   // Authenticated User object from API
  devices: [],
  tickets: [],
  warranties: [],
  inventory: [],
  cms: [],
  predictiveAlerts: [],
  auditLogs: [],
  notifications: [],
  notifDropdownOpen: false,
  customers: [],
  allUsers: [],
  rentals: [],
  rentalStats: null,
  rentalFilterStatus: '',
  rentalCalendarMonth: new Date().getMonth(),
  rentalCalendarYear: new Date().getFullYear(),
  rentalViewMode: 'list', // 'list' | 'calendar'
  dataManagerSubTab: 'users', // 'users' | 'customers' | 'allocation'
  stats: null,
  selectedDeviceForRemote: null,
  selectedDeviceForQR: null,
  selectedTicket: null,
  ticketChatPollInterval: null,
  _activeChatTab: 'staff',
  searchQuery: '',
  filterModel: '',
  filterStatus: '',
  dashboardCabinetView: 'all', // 'all' | 'devices' | 'tickets' | 'activity'
  cabinetOpen: {
    devices: true,
    tickets: true,
    activity: true,
  },
  showAllKpiCards: false,
};

// ==========================================================================
// AUTH MODULE — Login, Register, Session, Logout
// ==========================================================================

const AUTH_SESSION_KEY = 'millennium_auth_user';
const AUTH_TOKEN_KEY = 'millennium_auth_token';

/** Check if there is an active session (stored in localStorage) */
function getAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Save user session to localStorage */
function saveAuthSession(user) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
}

/** Clear user session */
function clearAuthSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

// ---------------------------------------------------------------------------
// AUTH TOKEN
// The server issues a signed token at login. It is the ONLY thing the server
// trusts for identity — a client cannot widen its own access by editing a
// query parameter any more.
// ---------------------------------------------------------------------------

function getAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}

function saveAuthToken(token) {
  try { if (token) localStorage.setItem(AUTH_TOKEN_KEY, token); } catch { /* storage disabled */ }
}

function clearAuthToken() {
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* storage disabled */ }
}

// ---------------------------------------------------------------------------
// AUTHENTICATED FETCH
// Wrapping fetch here means every existing API call site picks up the token
// automatically, instead of having to add a header in ~40 separate places.
// ---------------------------------------------------------------------------

const nativeFetch = window.fetch.bind(window);
let authExpiryHandled = false;

/** The session is gone or invalid — drop it and send the user back to sign-in. */
function handleAuthExpired() {
  if (authExpiryHandled) return;
  authExpiryHandled = true;

  clearAuthToken();
  clearAuthSession();
  state.currentUser = null;

  showAuthOverlay();
  showToast('Your session has expired. Please sign in again.', 'error');

  setTimeout(() => { authExpiryHandled = false; }, 4000);
}

window.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';

  // Only touch calls to our own API. Never attach our token to a third party.
  const isApiCall = url.startsWith(`${API_BASE}/`) || url.startsWith('/api/');
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
  const isThirdParty = isAbsolute && !url.startsWith(window.location.origin);

  if (!isApiCall || isThirdParty) {
    return nativeFetch(input, init);
  }

  const opts = Object.assign({}, init);
  const headers = new Headers(
    opts.headers || (typeof input !== 'string' && input && input.headers) || undefined
  );

  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  opts.headers = headers;

  // A 401 on the login/register endpoints just means "wrong credentials" and is
  // surfaced by the form itself — it must not trigger the global sign-out.
  const isAuthEndpoint = /\/auth\/(login|register)\b/.test(url);

  return nativeFetch(input, opts).then((res) => {
    if (res.status === 401 && !isAuthEndpoint && getAuthToken()) {
      handleAuthExpired();
    }
    return res;
  });
};

/**
 * Re-read the signed-in account from the server and refresh the stored session.
 *
 * The localStorage session is a cache. If the underlying account changed since
 * it was written (e.g. it was deleted and recreated, so it now has a different
 * id), the cached object would silently disagree with the database: the chip
 * would show the old name while the server resolved the new identity. Refreshing
 * on load keeps what the user sees and what the server enforces in step.
 */
async function refreshAuthSession() {
  const cached = getAuthSession();
  if (!cached) return null;

  // No token means the session cannot be proven to the server — treat it as gone.
  if (!getAuthToken()) {
    clearAuthSession();
    return null;
  }

  try {
    const resp = await fetch(`${API_BASE}/auth/me`, { cache: 'no-store' });
    if (resp.status === 401) {
      // Token rejected (expired, tampered, or the account was removed).
      clearAuthToken();
      clearAuthSession();
      return null;
    }

    const body = await resp.json();
    const live = body.user;
    if (!body.success || !live) {
      clearAuthSession();
      return null;
    }

    saveAuthSession(live);
    return live;
  } catch {
    // Offline / server down: fall back to the cached copy rather than locking out.
    return cached;
  }
}

/** Show / hide the auth overlay */
function showAuthOverlay() {
  const overlay = document.getElementById('authPortalOverlay');
  if (overlay) overlay.classList.remove('auth-hidden');
}

function hideAuthOverlay() {
  const overlay = document.getElementById('authPortalOverlay');
  if (overlay) overlay.classList.add('auth-hidden');
}

/** Update the header user chip after login */
function updateAuthChip(user) {
  const nameEl = document.getElementById('authUserName');
  const locEl  = document.getElementById('authUserLoc');
  const avatarEl = document.getElementById('authUserAvatar');
  if (nameEl)   nameEl.textContent  = user.fullName || user.username;
  // The trailing caret signals that the chip opens the profile dialog.
  if (locEl)    locEl.textContent   = `${user.location || 'All Locations'} ▾`;
  if (avatarEl) avatarEl.textContent = (user.fullName || user.username).charAt(0).toUpperCase();
}

/** Switch between login and register tabs */
function switchAuthTab(tab) {
  const loginCard = document.getElementById('authPortalCard');
  const registerCard = document.getElementById('authRegisterCard');
  
  const loginPanel = document.getElementById('loginPanel');
  const registerPanel = document.getElementById('registerPanel');
  if (loginPanel && registerPanel) {
    if (tab === 'login') {
      loginPanel.style.display = 'block';
      registerPanel.style.display = 'none';
    } else {
      loginPanel.style.display = 'none';
      registerPanel.style.display = 'block';
    }
  }

  if (loginCard && registerCard) {
    if (tab === 'login') {
      loginCard.style.display = 'flex';
      registerCard.style.display = 'none';
      const u = document.getElementById('loginUsername');
      if (u) u.focus();
    } else {
      loginCard.style.display = 'none';
      registerCard.style.display = 'flex';
      const r = document.getElementById('regFullName');
      if (r) r.focus();
    }
  }
}

/** Handle forgot password link */
function handleForgotPassword() {
  showToast('Password Reset: Please contact Brains Infinite Innovations admin at admin@brains.asia or call +63 975 582 6830.', 'info');
}

/** Show auth form section and scroll to it */
function showAuthForm(formType) {
  // Scroll to the auth split layout section
  const authSplitLayout = document.getElementById('authSplitLayout');
  if (authSplitLayout) {
    authSplitLayout.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  
  // Switch to the appropriate tab after a short delay
  setTimeout(() => {
    switchAuthTab(formType);
    
    // Focus on the first input
    if (formType === 'login') {
      const loginUsername = document.getElementById('loginUsername');
      if (loginUsername) loginUsername.focus();
    } else {
      const regFullName = document.getElementById('regFullName');
      if (regFullName) regFullName.focus();
    }
  }, 600);
}

/** Open auth modal / focus form in split layout */
function openAuthModal(formType) {
  const authCard = document.getElementById('authPortalCard');
  const backdrop = document.getElementById('authModalBackdrop');
  
  if (authCard) {
    authCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    switchAuthTab(formType);
    
    // Focus appropriate input
    setTimeout(() => {
      if (formType === 'login') {
        const loginUsername = document.getElementById('loginUsername');
        if (loginUsername) loginUsername.focus();
      } else {
        const regFullName = document.getElementById('regFullName');
        if (regFullName) regFullName.focus();
      }
    }, 300);
  }
}

/** Close auth modal */
function closeAuthModal() {
  console.log('🔒 Closing modal...');
  const authCard = document.getElementById('authPortalCard');
  const backdrop = document.getElementById('authModalBackdrop');
  
  if (authCard && backdrop) {
    // Remove visible class and add hidden class
    authCard.classList.remove('auth-modal-visible');
    authCard.classList.add('auth-modal-hidden');
    backdrop.classList.remove('active');
    
    console.log('✅ Modal closed');
    
    // Restore body scroll
    document.body.style.overflow = '';
  }
}

/** Close modal when pressing Escape key */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const authCard = document.getElementById('authPortalCard');
    if (authCard && authCard.classList.contains('auth-modal-visible')) {
      closeAuthModal();
    }
  }
});

/** Check modal state on page load */
document.addEventListener('DOMContentLoaded', () => {
  const authCard = document.getElementById('authPortalCard');
  if (authCard) {
    console.log('🔍 Modal Check on Page Load:');
    console.log('  - Element found:', !!authCard);
    console.log('  - Has auth-modal-hidden:', authCard.classList.contains('auth-modal-hidden'));
    console.log('  - Has auth-modal-visible:', authCard.classList.contains('auth-modal-visible'));
    console.log('  - Computed display:', window.getComputedStyle(authCard).display);
    console.log('  - Computed opacity:', window.getComputedStyle(authCard).opacity);
    
    if (authCard.classList.contains('auth-modal-hidden')) {
      console.log('✅ Modal is correctly HIDDEN on page load');
    } else {
      console.warn('⚠️ Modal might be visible! Check CSS cache.');
    }
  }

  // Ping the server on page load to detect connection issues early
  const banner = document.getElementById('backendStatusBanner');
  const bannerText = document.getElementById('backendStatusText');
  if (banner) banner.style.display = 'block';
  if (bannerText) bannerText.textContent = 'Connecting to backend server...';

  fetch(`${API_BASE}/stats/dashboard`, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      if (banner) {
        banner.style.background = 'linear-gradient(90deg,#059669,#047857)';
        if (bannerText) bannerText.textContent = '✅ Backend connected — Database online';
        setTimeout(() => { banner.style.display = 'none'; }, 3000);
      }
      console.log('✅ Backend server is reachable');
    })
    .catch(err => {
      console.error('❌ Backend server unreachable on page load:', err.message);
      if (banner) {
        banner.style.background = 'linear-gradient(90deg,#dc2626,#991b1b)';
        if (bannerText) bannerText.innerHTML = '❌ Backend server not reachable. Please start the server: <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">cd c:\\xampp\\htdocs\\millenium-smartboard-main && npx tsx src/server.ts</code>';
      }
    });
});


/** One-click demo login — fills credentials AND auto-submits immediately */
async function quickDemoLogin(username, password, roleLabel) {
  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  if (uInput) uInput.value = username;
  if (pInput) pInput.value = password;

  // Animate the chip cards to show selection
  document.querySelectorAll('.auth-demo-chip').forEach(c => c.classList.remove('selected'));
  const clicked = document.querySelector(`.auth-demo-chip[data-role="${roleLabel}"]`);
  if (clicked) clicked.classList.add('selected');

  const errorEl = document.getElementById('loginError');
  const btn     = document.getElementById('loginSubmitBtn');

  if (errorEl) errorEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    const txtSpan = btn.querySelector('.auth-btn-text') || document.getElementById('loginBtnText');
    if (txtSpan) txtSpan.textContent = `Signing in as ${roleLabel}...`;
  }

  try {
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();

    if (!data.success) {
      showAuthError(errorEl, data.error || 'Demo login failed. Please try again.');
      return;
    }

    const user = data.user;
    saveAuthToken(data.token);
    saveAuthSession(user);
    state.currentUser = user;
    state.currentRole = user.role;
    updateAuthChip(user);
    updateSidebarRole(user.role);
    hideAuthOverlay();
    closeAuthModal(); // Close the modal after successful login
    applyRoleUI();
    fetchAllData();
    showToast(`Welcome, ${user.fullName || user.username}! Signed in as ${roleLabel} 🌟`, 'success');

  } catch (err) {
    showAuthError(errorEl, 'Network error. Please check your connection.');
  } finally {
    if (btn) {
      btn.disabled = false;
      const txtSpan = btn.querySelector('.auth-btn-text') || document.getElementById('loginBtnText');
      if (txtSpan) txtSpan.textContent = 'Sign In';
    }
    document.querySelectorAll('.auth-demo-chip').forEach(c => c.classList.remove('selected'));
  }
}

/** Fill demo credentials into the login form (kept for compatibility) */
function fillLoginDemo(username, password) {
  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  if (uInput) uInput.value = username;
  if (pInput) pInput.value = password;
  const btn = document.getElementById('loginSubmitBtn');
  if (btn) btn.focus();
}

/** Select login role tab — updates visual state, hidden input, and button text */
function selectLoginRole(role, clickedEl) {
  // Update active tab/card
  document.querySelectorAll('.auth-role-tab, .auth-role-card').forEach(tab => tab.classList.remove('active'));
  if (clickedEl) clickedEl.classList.add('active');

  // Update hidden role input
  const roleInput = document.getElementById('loginRole');
  if (roleInput) roleInput.value = role;

  // Update autofill demo button credentials
  const autofillBtn = document.getElementById('autofillDemoBtn');
  const demoCredMap = {
    Admin:      { email: 'admin@gmail.com',      pass: '123123' },
    Technician: { email: 'technician@gmail.com', pass: '123123' },
    Customer:   { email: 'customer@gmail.com',   pass: '123123' },
  };
  if (autofillBtn && demoCredMap[role]) {
    const cred = demoCredMap[role];
    autofillBtn.onclick = () => quickDemoLogin(cred.email, cred.pass, role);
    const label = autofillBtn.querySelector('span');
    if (label) label.textContent = `AUTOFILL ${role.toUpperCase()} DEMO CREDENTIALS`;
  }
}

/** Toggle password field visibility */
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  btn.innerHTML = isHidden
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

/** Update the org/school label based on selected role */
function updateRegLocationLabel(role) {
  const label = document.getElementById('regOrgLabel');
  if (!label) return;
  label.textContent = role === 'customer' ? 'School / Organization Name' : 'Company / Department';
}

/** Handle login form submit */
async function handleLogin(event) {
  event.preventDefault();
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginSubmitBtn');
  const username = document.getElementById('loginUsername')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!username || !password) {
    showAuthError(errorEl, 'Please enter your username and password.');
    return;
  }

  // Loading state
  btn.disabled = true;
  const txtSpan = btn.querySelector('.auth-btn-text') || document.getElementById('loginBtnText');
  if (txtSpan) txtSpan.textContent = 'Signing in...';
  if (errorEl) errorEl.style.display = 'none';

  try {
    const resp = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();

    if (!data.success) {
      showAuthError(errorEl, data.error || 'Login failed. Check your credentials.');
      return;
    }

    // Success — store session & update app
    const user = data.user;
    saveAuthToken(data.token);
    saveAuthSession(user);
    state.currentUser = user;
    state.currentRole = user.role;

    updateAuthChip(user);
    updateSidebarRole(user.role);
    hideAuthOverlay();
    closeAuthModal(); // Close the modal after successful login
    applyRoleUI();
    fetchAllData();
    showToast(`Welcome back, ${user.fullName || user.username}! 🌟`, 'success');

  } catch (err) {
    showAuthError(errorEl, 'Network error. Please check your connection.');
  } finally {
    btn.disabled = false;
    const txtSpan = btn.querySelector('.auth-btn-text') || document.getElementById('loginBtnText');
    if (txtSpan) txtSpan.textContent = 'Sign In';
  }
}

/** Handle registration form submit */
async function handleRegister(event) {
  event.preventDefault();
  const errorEl   = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');
  const btn = document.getElementById('registerSubmitBtn');

  const fullName  = document.getElementById('regFullName')?.value?.trim();
  const username  = document.getElementById('regUsername')?.value?.trim();
  const email     = document.getElementById('regEmail')?.value?.trim();
  const role      = document.getElementById('regRole')?.value;
  const location  = document.getElementById('regLocation')?.value;
  const organization = document.getElementById('regOrganization')?.value?.trim();
  const password  = document.getElementById('regPassword')?.value;
  const confirm   = document.getElementById('regConfirmPassword')?.value;

  if (errorEl)   errorEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  // Validation
  if (!fullName || !username || !email || !password || !confirm) {
    showAuthError(errorEl, 'Please fill in all required fields.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAuthError(errorEl, 'Please enter a valid email address.');
    return;
  }
  if (password.length < 6) {
    showAuthError(errorEl, 'Password must be at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showAuthError(errorEl, 'Passwords do not match.');
    return;
  }
  if (username.length < 3) {
    showAuthError(errorEl, 'Username must be at least 3 characters.');
    return;
  }

  btn.disabled = true;
  const txtSpan = btn.querySelector('.auth-btn-text') || btn.querySelector('span');
  if (txtSpan) txtSpan.textContent = 'Creating account...';

  try {
    const resp = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, fullName, role, location, organization }),
    });
    const data = await resp.json();

    if (!data.success) {
      showAuthError(errorEl, data.error || 'Registration failed. Please try again.');
      return;
    }

    // Show success, auto-login
    if (successEl) {
      successEl.textContent = `Account created! Signing you in as ${data.user.fullName}...`;
      successEl.style.display = 'block';
    }

    // Auto-login after short delay
    setTimeout(() => {
      const user = data.user;
      saveAuthToken(data.token);
      saveAuthSession(user);
      state.currentUser = user;
      state.currentRole = user.role;
      updateAuthChip(user);
      updateSidebarRole(user.role);
      hideAuthOverlay();
      applyRoleUI();
      fetchAllData();
      showToast(`Welcome to Millennium, ${user.fullName}! 🚀`, 'success');
    }, 1200);

  } catch (err) {
    showAuthError(errorEl, 'Network error. Please check your connection.');
  } finally {
    btn.disabled = false;
    const txtSpan = btn.querySelector('.auth-btn-text') || btn.querySelector('span');
    if (txtSpan) txtSpan.textContent = 'Create Account';
  }
}

/** Handle logout */
function handleLogout() {
  clearAuthToken();
  clearAuthSession();
  showToast('You have been signed out.', 'info');

  // Reset the app in place rather than navigating to '/'.
  // A real navigation reloaded every asset and re-parsed the whole document
  // just to show the sign-in portal again — a very visible full refresh.
  // The state below is everything the signed-in UI had built up.
  setTimeout(() => {
    // Stop any in-flight ticket chat poll so it cannot fire after logout.
    if (state.ticketChatPollInterval) {
      clearInterval(state.ticketChatPollInterval);
      state.ticketChatPollInterval = null;
    }

    state.currentUser = null;
    state.currentRole = 'admin';
    state.currentTab = ROLE_META.admin.defaultTab;
    state.searchQuery = '';
    state.filterModel = '';
    state.filterStatus = '';
    state.selectedDeviceForRemote = null;
    state.selectedDeviceForQR = null;
    state.selectedTicket = null;
    state.notifDropdownOpen = false;

    // Drop every cached collection so the next sign-in cannot flash the
    // previous user's rows before its own fetch lands.
    state.devices = [];
    state.tickets = [];
    state.warranties = [];
    state.inventory = [];
    state.cms = [];
    state.predictiveAlerts = [];
    state.auditLogs = [];
    state.notifications = [];
    state.customers = [];
    state.allUsers = [];
    state.rentals = [];
    state.rentalStats = null;
    state.stats = null;

    // Forget the last-rendered signature so the next sign-in always paints.
    lastDataSignature = null;

    const mainContent = document.getElementById('mainContent');
    if (mainContent) mainContent.innerHTML = '';
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));

    updateSidebarRole('admin');

    // Clear the previous user's identity out of the header chip.
    const nameEl = document.getElementById('authUserName');
    const locEl = document.getElementById('authUserLoc');
    const avatarEl = document.getElementById('authUserAvatar');
    if (nameEl) nameEl.textContent = '';
    if (locEl) locEl.textContent = '';
    if (avatarEl) avatarEl.textContent = '';

    // Reset the sign-in form and make sure it opens on the login tab.
    switchAuthTab('login');
    const userInput = document.getElementById('loginUsername');
    const passInput = document.getElementById('loginPassword');
    const errEl = document.getElementById('loginError');
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    if (errEl) errEl.style.display = 'none';

    closeMobileMenu();
    showAuthOverlay();
    window.scrollTo(0, 0);
  }, 900);
}

// ==========================================================================
// MY PROFILE — view and edit the signed-in account
// ==========================================================================

/**
 * Open the profile dialog for the signed-in user.
 * Re-reads the account from /auth/me first so the values shown are the live
 * ones from the database rather than a possibly-stale cached copy.
 */
async function openProfileModal() {
  if (!state.currentUser) {
    showToast('Please sign in to view your profile.', 'error');
    return;
  }

  // Remove an existing dialog if one is open.
  document.getElementById('profileModalOverlay')?.remove();

  let me = state.currentUser;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      if (body.success && body.user) {
        me = body.user;
        state.currentUser = me;
        saveAuthSession(me);
      }
    }
  } catch {
    // Offline: fall back to the cached session rather than blocking the dialog.
  }

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const roleMeta = ROLE_META[me.role] || ROLE_META.admin;
  const initial = (me.fullName || me.username || '?').charAt(0).toUpperCase();
  const memberSince = me.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  }) : '—';

  const overlay = document.createElement('div');
  overlay.id = 'profileModalOverlay';
  overlay.className = 'modal-backdrop';

  overlay.innerHTML = `
    <div class="modal-content modal-form modal-wide" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
      <div class="modal-header">
        <h3 class="modal-title" id="profileModalTitle">👤 My Profile</h3>
        <button type="button" class="modal-close" aria-label="Close"
          onclick="document.getElementById('profileModalOverlay').remove()">×</button>
      </div>

      <form id="profileForm" onsubmit="saveProfile(event)">
        <div class="form-body">

          <div class="profile-identity">
            <div class="profile-avatar-lg">${esc(initial)}</div>
            <div>
              <div class="profile-identity-name">${esc(me.fullName || me.username)}</div>
              <div class="profile-identity-sub">@${esc(me.username)} · ${esc(me.email || 'no email')}</div>
              <span class="profile-role-pill">${esc(roleMeta.name)}</span>
            </div>
          </div>

          <section class="form-section">
            <div class="form-section-title">🔒 Account</div>
            <div class="profile-grid">
              <div class="profile-field">
                <span class="profile-field-label">Username</span>
                <span class="profile-field-value">${esc(me.username)}</span>
              </div>
              <div class="profile-field">
                <span class="profile-field-label">Role</span>
                <span class="profile-field-value">${esc(roleMeta.name)}</span>
              </div>
              <div class="profile-field">
                <span class="profile-field-label">Organization</span>
                <span class="profile-field-value">${esc(me.organization || '—')}</span>
              </div>
              <div class="profile-field">
                <span class="profile-field-label">Member Since</span>
                <span class="profile-field-value">${esc(memberSince)}</span>
              </div>
            </div>
            <div class="form-hint">
              Your username, role and organization are managed by an administrator.
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-title">✏️ Editable Details</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="profileFullName">Full Name</label>
                <input class="form-input" id="profileFullName" type="text" name="fullName"
                  value="${esc(me.fullName || '')}" required minlength="2" placeholder="Your full name" />
              </div>
              <div class="form-group">
                <label class="form-label" for="profileLocation">Location</label>
                <input class="form-input" id="profileLocation" type="text" name="location"
                  value="${esc(me.location || '')}" placeholder="e.g. Quezon City" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="profileEmail">Email Address</label>
              <input class="form-input" id="profileEmail" type="email" name="email"
                value="${esc(me.email || '')}" required placeholder="you@company.com" />
              <div class="form-hint">Used to sign in and to receive booking updates.</div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-title">🔑 Change Password</div>
            <div class="form-hint" style="margin-top:0;margin-bottom:12px;">
              Leave these blank to keep your current password.
            </div>
            <div class="form-group">
              <label class="form-label" for="profileCurrentPassword">Current Password</label>
              <input class="form-input" id="profileCurrentPassword" type="password" name="currentPassword"
                autocomplete="current-password" placeholder="Required only to change your password" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="profileNewPassword">New Password</label>
                <input class="form-input" id="profileNewPassword" type="password" name="newPassword"
                  autocomplete="new-password" minlength="6" placeholder="At least 6 characters" />
              </div>
              <div class="form-group">
                <label class="form-label" for="profileConfirmPassword">Confirm New Password</label>
                <input class="form-input" id="profileConfirmPassword" type="password" name="confirmPassword"
                  autocomplete="new-password" minlength="6" placeholder="Repeat the new password" />
              </div>
            </div>
          </section>

        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary"
            onclick="document.getElementById('profileModalOverlay').remove()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="profileSaveBtn">💾 Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

/** Save the profile form to PATCH /api/auth/me. */
async function saveProfile(event) {
  event.preventDefault();
  const form = event.target;
  const btn = document.getElementById('profileSaveBtn');
  const fd = new FormData(form);

  const payload = {
    fullName: String(fd.get('fullName') || '').trim(),
    email: String(fd.get('email') || '').trim(),
    location: String(fd.get('location') || '').trim(),
  };

  const currentPassword = String(fd.get('currentPassword') || '');
  const newPassword = String(fd.get('newPassword') || '');
  const confirmPassword = String(fd.get('confirmPassword') || '');

  if (newPassword || confirmPassword) {
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('The new passwords do not match.', 'error');
      return;
    }
    if (!currentPassword) {
      showToast('Enter your current password to change it.', 'error');
      return;
    }
    payload.currentPassword = currentPassword;
    payload.newPassword = newPassword;
  }

  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(`❌ ${data.error || 'Could not save your profile.'}`, 'error');
      return;
    }

    // Reflect the saved values immediately in the session and the sidebar chip.
    const updated = Object.assign({}, state.currentUser, data.data);
    state.currentUser = updated;
    saveAuthSession(updated);
    updateAuthChip(updated);

    document.getElementById('profileModalOverlay')?.remove();
    showToast(
      payload.newPassword ? '✅ Profile and password updated.' : '✅ Profile updated.',
      'success'
    );
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original || '💾 Save Changes'; }
  }
}

/** Display an auth error message */
function showAuthError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.style.display = 'flex';
}

/** Update sidebar role based on logged-in user */
function updateSidebarRole(role) {
  const meta = ROLE_META[role] || ROLE_META.admin;
  const iconEl = document.getElementById('sidebarRoleIcon');
  const nameEl = document.getElementById('sidebarRoleName');
  const descEl = document.getElementById('sidebarRoleDesc');
  if (iconEl) iconEl.textContent = meta.icon;
  if (nameEl) nameEl.textContent = meta.name;
  if (descEl) descEl.textContent = meta.desc;
}


// --- QR Code Generator (Real scannable QR via QR Server API) ---
function generateRealQR(imgEl, text) {
  // Uses the free qrserver.com API to generate a real, scannable QR code
  const encoded = encodeURIComponent(text);
  imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&color=0F172A&bgcolor=FFFFFF&qzone=1&format=png`;
  imgEl.alt = `QR code for ${text}`;
}

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  let toast = document.getElementById('toastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  toast.classList.add('active');
  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// --- Rental ownership helpers ---
// A rental belongs to the signed-in customer if the stable customer id matches,
// or failing that the organization name matches (compared case/whitespace-insensitively,
// because users.organization and customers.organization_name are not always spelled the same).
function rentalMatchesUser(rental, user) {
  if (!rental || !user) return false;
  const userOrg    = (user.organization || '').trim().toLowerCase();
  const userCustId = (user.customerId   || '').trim().toLowerCase();
  const rCustId    = (rental.customerId   || '').trim().toLowerCase();
  const rCustName  = (rental.customerName || '').trim().toLowerCase();

  if (userCustId && rCustId && rCustId === userCustId) return true;
  if (userOrg    && rCustName && rCustName === userOrg) return true;
  return false;
}

/**
 * The single source of truth for "which rentals may this user see".
 * Admins/technicians see everything; customers see only their own bookings.
 * Used by BOTH the Rentals page and the customer portal so the two never disagree.
 */
function getVisibleRentals() {
  const all = state.rentals || [];
  if (state.currentRole !== 'customer' || !state.currentUser) return all;
  return all.filter(r => rentalMatchesUser(r, state.currentUser));
}

// --- Data Fetchers ---
/**
 * Signature of everything the views render from.
 *
 * Used to decide whether a background poll actually changed anything. Note it
 * deliberately does NOT compare HTML: `element.innerHTML` returns the
 * *serialised* DOM, which does not round-trip byte-for-byte with the template
 * string (attribute quoting, self-closing tags, entity escaping), so an HTML
 * comparison reports a difference even when the markup is logically identical.
 * Comparing the source data is both cheaper and correct.
 */
let lastDataSignature = null;

function dataSignature() {
  // state.notifications is deliberately NOT included: it only feeds the header
  // bell (renderNotifications -> #notifBadge/#notifList), never #mainContent,
  // and the server reshuffles it on every poll. Including it made the
  // signature differ every single time, so the "nothing changed" short-circuit
  // never fired. The bell is still updated on every poll.
  return [
    state.stats, state.devices, state.tickets, state.warranties,
    state.inventory, state.cms, state.predictiveAlerts, state.auditLogs,
    state.customers, state.rentals, state.rentalStats, state.allUsers,
  ].map((v) => (v === null || v === undefined ? '' : JSON.stringify(v))).join('|');
}

async function fetchAllData(options) {
  try {
    // Build tickets URL with role-based filtering
    const user = state.currentUser;
    const role = state.currentRole;
    let ticketsUrl = `${API_BASE}/tickets`;
    
    if (user && role) {
      ticketsUrl += `?userId=${encodeURIComponent(user.id)}&userRole=${encodeURIComponent(role)}`;
    }
    
    // Build devices URL with role-based filtering
    let devicesUrl = `${API_BASE}/devices`;
    if (state.currentUser) {
      const params = new URLSearchParams();
      params.append('userId', state.currentUser.id);
      params.append('userRole', state.currentUser.role);
      if (state.currentUser.organization) {
        params.append('userOrganization', state.currentUser.organization);
      }
      devicesUrl += `?${params.toString()}`;
    }
    
    // Rentals are scoped server-side from the signed token — the identity is no
    // longer asserted by the client, so no userId/userRole params are needed.
    const rentalsUrl     = `${API_BASE}/rentals`;
    const rentalStatsUrl = `${API_BASE}/rentals/stats/summary`;

    // Use named entries so we can identify which fetch failed
    const fetchEntries = [
      { name: 'stats/dashboard', url: `${API_BASE}/stats/dashboard`, stateKey: 'stats' },
      { name: 'devices',        url: devicesUrl,                        stateKey: 'devices' },
      { name: 'tickets',        url: ticketsUrl,                        stateKey: 'tickets' },
      { name: 'warranties',     url: `${API_BASE}/warranties`,          stateKey: 'warranties' },
      { name: 'inventory',      url: `${API_BASE}/inventory`,           stateKey: 'inventory' },
      { name: 'cms',            url: `${API_BASE}/cms`,                 stateKey: 'cms' },
      { name: 'predictive/alerts', url: `${API_BASE}/predictive/alerts`, stateKey: 'predictiveAlerts' },
      { name: 'audit-logs',     url: `${API_BASE}/audit-logs`,          stateKey: 'auditLogs' },
      { name: 'customers',      url: `${API_BASE}/customers`,          stateKey: 'customers' },
      { name: 'notifications',  url: `${API_BASE}/notifications`,      stateKey: 'notifications' },
      { name: 'rentals',        url: rentalsUrl,                       stateKey: 'rentals' },
      { name: 'rentals/stats',  url: rentalStatsUrl,                   stateKey: 'rentalStats' },
    ];

    if (state.currentRole === 'admin') {
      fetchEntries.push({ name: 'auth/users', url: `${API_BASE}/auth/users`, stateKey: 'allUsers' });
    }

    // Use allSettled so one failure doesn't kill everything
    const results = await Promise.allSettled(
      fetchEntries.map(async (e) => {
        try {
          const res = await fetch(e.url, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (json.success) state[e.stateKey] = json.data;
          return e.name;
        } catch (err) {
          console.error(`Fetch failed: ${e.name}`, err);
          throw err;
        }
      })
    );

    // Count failures
    const failures = results.filter(r => r.status === 'rejected');
    const succeeded = results.filter(r => r.status === 'fulfilled');

    if (failures.length === fetchEntries.length) {
      // Everything failed — server is down
      console.error('All API endpoints failed. Server may be down.');
      showToast('Failed to connect to backend server at http://localhost:3000', 'error');
    } else if (failures.length > 0) {
      // Some endpoints failed — partial load
      console.warn(`${succeeded.length}/${fetchEntries.length} endpoints OK, ${failures.length} failed`);
      showToast(`Loaded ${succeeded.length}/${fetchEntries.length} data sources. Some data may be incomplete.`, 'warning');
    }

    // Background poll with no new data: leave the DOM completely untouched.
    // Re-rendering here is what made the app look like it was reloading itself
    // every 30 seconds (scroll jumped, animations restarted, images re-fetched).
    // The dashboard clock is kept current separately, in place.
    const signature = dataSignature();
    if (options && options.silent && signature === lastDataSignature) {
      updateDashboardClock();
      return;
    }
    lastDataSignature = signature;

    renderApp(options);
  } catch (err) {
    console.error('Failed to fetch data from backend API:', err);
    const isAbort = err && err.name === 'AbortError';
    const msg = isAbort
      ? 'Backend request timed out. Check your network or server performance.'
      : 'Failed to connect to backend server. Make sure the server is running at http://localhost:3000';
    showToast(msg, 'error');
    // Also surface the raw error in the toast for debugging
    console.error('Error detail:', err.message || err, err.stack || '');
  }
}

// --- View Renderers ---

/**
 * Render the active tab into #mainContent.
 *
 * @param {object}  [options]
 * @param {boolean} [options.silent] Background refresh (the 30s telemetry
 *   poll). Skips the DOM write entirely when the new markup is identical to
 *   what is already on screen, and restores the scroll offset when it is not.
 *
 *   This matters because replacing innerHTML is not a cheap repaint: it
 *   discards the whole subtree, resets the scroll position, restarts CSS
 *   animations and makes the browser re-request images. Running that every 30
 *   seconds made the app look like it was reloading itself.
 */
function renderApp(options) {
  const silent = !!(options && options.silent);

  renderSidebarBadges();
  renderNotifications();
  applyRoleUI();
  
  // Sync global header search with state
  const globalSearchInput = document.getElementById('globalHeaderSearch');
  if (globalSearchInput && globalSearchInput.value !== state.searchQuery) {
    globalSearchInput.value = state.searchQuery || '';
  }
  
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  const role = state.currentRole;
  const allowed = ROLE_ACCESS[role] || ROLE_ACCESS.admin;

  // If current tab is not allowed for this role, redirect to role's default
  if (!allowed.includes(state.currentTab)) {
    state.currentTab = ROLE_META[role].defaultTab;
  }

  let html;
  switch (state.currentTab) {
    case 'dashboard':
      html = renderDashboardView();
      break;
    case 'devices':
      html = renderDevicesView();
      break;
    case 'tickets':
      html = renderTicketsView();
      break;
    case 'customer-portal':
      html = renderCustomerPortalView();
      break;
    case 'warranty':
      html = renderWarrantyView();
      break;
    case 'inventory':
      html = renderInventoryView();
      break;
    case 'data-manager':
      html = renderDataManagerView();
      break;
    case 'cms':
      html = renderCmsView();
      break;
    case 'predictive':
      html = renderPredictiveView();
      break;
    case 'analytics':
      html = renderAnalyticsView();
      break;
    case 'rentals':
      html = renderRentalsView();
      break;
    default:
      html = renderDashboardView();
  }

  // A background poll that found nothing new should not touch the DOM at all.
  if (silent && mainContent.innerHTML === html) return;

  if (silent) {
    const scrollY = window.scrollY;
    mainContent.innerHTML = html;
    window.scrollTo(0, scrollY);
  } else {
    mainContent.innerHTML = html;
  }
}

// --- Apply Role-Based Sidebar & UI Visibility ---
function applyRoleUI() {
  const role = state.currentRole;
  const meta = ROLE_META[role] || ROLE_META.admin;
  const allowed = ROLE_ACCESS[role] || ROLE_ACCESS.admin;

  // Update role banner in sidebar
  const iconEl = document.getElementById('sidebarRoleIcon');
  const nameEl = document.getElementById('sidebarRoleName');
  const descEl = document.getElementById('sidebarRoleDesc');
  if (iconEl) iconEl.textContent = meta.icon;
  if (nameEl) nameEl.textContent = meta.name;
  if (descEl) descEl.textContent = meta.desc;

  // Show / hide nav items and section titles based on data-roles attribute
  document.querySelectorAll('.nav-item[data-roles], .nav-section-title[data-roles]').forEach(el => {
    const elRoles = (el.dataset.roles || '').split(' ');
    const visible = elRoles.includes(role);
    el.style.display = visible ? '' : 'none';
  });

  // Highlight the active tab link
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === state.currentTab);
  });
}

function renderSidebarBadges() {
  const onlineCount = state.devices.filter((d) => d.status === 'online').length;
  const tckCount = state.tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed').length;
  const predCount = state.predictiveAlerts.length;
  const invLowCount = state.inventory.filter((i) => i.status !== 'In Stock').length;

  const bDev  = document.getElementById('badgeDevices');
  const bTck  = document.getElementById('badgeTickets');
  const bPred = document.getElementById('badgePredictive');
  const bInv  = document.getElementById('badgeInventory');
  const bTckC = document.getElementById('badgeTicketsCustomer');

  if (bDev)  bDev.textContent  = `${onlineCount} Online`;
  if (bTck)  bTck.textContent  = `${tckCount} Open`;
  if (bPred) bPred.textContent = `${predCount} Alerts`;
  if (bInv)  bInv.textContent  = `${invLowCount} Low`;
  if (bTckC) bTckC.textContent = tckCount > 0 ? `${tckCount} Open` : '';
}

// --- Notification Logic ---
function renderNotifications() {
  const badge = document.getElementById('notifBadge');
  const list = document.getElementById('notifList');
  if (!badge || !list) return;

  const notifs = state.notifications || [];
  const unreadCount = notifs.filter(n => !n.read).length;

  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  // Update header text if present
  const headerTitle = document.querySelector('.notif-dropdown-header h4');
  if (headerTitle) {
    headerTitle.innerHTML = unreadCount > 0 
      ? `Notifications <span style="font-size:0.72rem;padding:2px 7px;border-radius:10px;background:rgba(0,242,254,0.18);color:#00f2fe;font-weight:700;letter-spacing:0;">${unreadCount} New</span>`
      : `Notifications`;
  }

  if (notifs.length === 0) {
    list.innerHTML = `<div style="padding:32px 20px;text-align:center;color:#94a3b8;font-size:0.85rem;"><span style="display:block;font-size:1.8rem;margin-bottom:8px;opacity:0.6;">🔔</span>No new notifications</div>`;
    return;
  }

  list.innerHTML = notifs.map((n, i) => {
    let icon = '🔔';
    let path = '';
    if (n.type === 'low_stock') {
      icon = '⚠️';
      path = 'inventory';
    } else if (n.type === 'new_ticket') {
      icon = '🎫';
      path = 'tickets';
    } else if (n.type === 'new_message' || n.type === 'ticket_message') {
      icon = '💬';
      path = 'tickets';
    }

    const timeStr = timeAgo(new Date(n.timestamp || n.createdAt || n.created_at || Date.now()));

    return `
      <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifClick(${i}, '${path}')">
        <div class="notif-item-header">
          <span class="notif-item-title"><span class="notif-item-type-icon">${icon}</span>${escapeHtml(n.title)}</span>
          <span class="notif-item-time">${timeStr}</span>
        </div>
        <div class="notif-item-msg">${escapeHtml(n.message)}</div>
      </div>
    `;
  }).join('');
}

function toggleNotifications(e) {
  if (e) e.stopPropagation();
  state.notifDropdownOpen = !state.notifDropdownOpen;
  const dropdown = document.getElementById('notifDropdown');
  const btn = document.getElementById('notifBtn');
  if (dropdown) {
    if (state.notifDropdownOpen) {
      dropdown.classList.add('show');
      if (btn) btn.classList.add('active');
    } else {
      dropdown.classList.remove('show');
      if (btn) btn.classList.remove('active');
    }
  }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const notifBtn = document.getElementById('notifBtn');
  const notifDropdown = document.getElementById('notifDropdown');
  if (state.notifDropdownOpen && notifBtn && notifDropdown) {
    if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
      state.notifDropdownOpen = false;
      notifDropdown.classList.remove('show');
      notifBtn.classList.remove('active');
    }
  }
});

function markAllNotificationsRead(e) {
  if (e) e.stopPropagation();
  if (state.notifications) {
    state.notifications.forEach(n => n.read = true);
  }
  renderNotifications();
}

function handleNotifClick(index, tabPath) {
  const notif = state.notifications[index];
  if (notif) notif.read = true;
  if (state.notifDropdownOpen) {
    toggleNotifications(); // close
  }
  const btn = document.getElementById('notifBtn');
  if (btn) btn.classList.remove('active');
  renderNotifications();
  if (tabPath) {
    switchTab(tabPath);
    if (notif && (notif.type === 'new_ticket' || notif.type === 'new_message' || notif.type === 'ticket_message') && notif.linkId) {
      setTimeout(() => {
        if (typeof openTicketDetailModal === 'function') {
          openTicketDetailModal(notif.linkId);
        }
      }, 300);
    }
  }
}

// 1. Executive Dashboard View
/**
 * Refresh just the dashboard's date/time chip, in place.
 *
 * The chip is part of the dashboard markup, so before this existed the only way
 * to keep the clock current was to re-render the whole view — which is exactly
 * the teardown we now skip when the data has not changed. Updating two text
 * nodes keeps the clock honest without disturbing anything else.
 */
function updateDashboardClock() {
  const dateEl = document.getElementById('heroClockDate');
  const timeEl = document.getElementById('heroClockTime');
  if (!dateEl && !timeEl) return;

  const now = new Date();
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (timeEl) {
    timeEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' +
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function renderDashboardView() {
  const total    = state.devices.length;
  const online   = state.devices.filter(d => d.status === 'online').length;
  const offline  = state.devices.filter(d => d.status === 'offline').length;
  const warning  = state.devices.filter(d => d.status === 'warning').length;
  const maint    = state.devices.filter(d => d.status === 'maintenance').length;

  const openTickets     = state.tickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed');
  const receivedTix     = state.tickets.filter(t => t.status === 'Received').length;
  const diagnosingTix   = state.tickets.filter(t => t.status === 'Diagnosing').length;
  const repairingTix    = state.tickets.filter(t => t.status === 'Repairing').length;
  const resolvedTix     = state.tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;

  const lowStockParts   = state.inventory.filter(p => p.status !== 'In Stock');
  const schoolDevices   = state.devices.filter(d => d.clientType === 'school').length;
  const corpDevices     = state.devices.filter(d => d.clientType === 'corporate').length;

  const healthPct = total > 0 ? Math.round((online / total) * 100) : 0;
  const userName  = (state.currentUser && (state.currentUser.fullName || state.currentUser.username)) || 'System Administrator';

  // Recent tickets
  const recentTickets = [...state.tickets]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 3);

  // Recent activity
  const recentLogs = [...state.auditLogs]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 3);

  const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const currentDayTime = new Date().toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="dash-v2-container">
      <!-- 1. Top Banner Row: Hero Welcome & Quick Actions -->
      <div class="dash-top-grid">
        <!-- Hero Announcement Card -->
        <div class="hero-banner-card">
          <div class="hero-text-content">
            <h1 class="hero-greeting">Welcome Back,<br>${userName}!</h1>
            <p class="hero-subtext">Manage your devices, monitor performance, and keep your operations running smoothly.</p>
            <div class="hero-date-chip">
              <span class="calendar-icon">📅</span>
              <div>
                <strong id="heroClockDate">${currentDate}</strong>
                <small id="heroClockTime">${currentDayTime}</small>
              </div>
            </div>
          </div>

          <!-- Center Display Graphic -->
          <div class="hero-display-wrapper">
            <div class="hero-display-frame">
              <img src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80" alt="Millennium SmartBoard Display" class="hero-display-img" />
              <div class="hero-display-ui-overlay">
                <span class="hero-ui-badge">4K UHD</span>
              </div>
            </div>
          </div>

          <!-- Right Hero Accent Text & Dots -->
          <div class="hero-right-accent">
            <div class="hero-accent-title">Smart Technology<br>for a Brighter<br>Future</div>
            <div class="hero-dots">
              <span class="dot active"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        </div>

        <!-- Quick Actions Panel -->
        <div class="quick-actions-card">
          <div class="quick-actions-title">Quick Actions</div>
          <div class="quick-actions-grid">
            <button class="qa-btn qa-btn-blue" onclick="openRegisterModal()">
              <span class="qa-icon">+</span>
              <span>Register Board</span>
            </button>
            <button class="qa-btn qa-btn-purple" onclick="openTicketModal()">
              <span class="qa-icon">🎫</span>
              <span>Open Ticket</span>
            </button>
            <button class="qa-btn qa-btn-teal" onclick="openInventoryQuickAction()" title="Inventory & Parts Restock">
              <span class="qa-icon">📦</span>
              <span> add parts </span>
            </button>
            <button class="qa-btn qa-btn-navy" onclick="navigateTo('tickets')">
              <span class="qa-icon">📊</span>
              <span>View Reports</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Core Stat Summary Cards Row -->
      <div class="stat-cards-grid-v2">
        <div class="kpi-card-v2 kpi-blue">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon">🖥️</div>
            <div>
              <div class="kpi-v2-label">Total Devices</div>
              <div class="kpi-v2-value">${total}</div>
            </div>
          </div>
          <div class="kpi-v2-footer">
            <span>Registered SmartBoards</span>
            <span class="kpi-v2-trend">↗ +0 vs. last month</span>
          </div>
          <div class="kpi-sparkline"><svg viewBox="0 0 100 25" preserveAspectRatio="none"><path d="M0,20 Q25,5 50,18 T100,8" fill="none" stroke="#00f2fe" stroke-width="2.2"/></svg></div>
        </div>

        <div class="kpi-card-v2 kpi-green">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon">📶</div>
            <div>
              <div class="kpi-v2-label">Online</div>
              <div class="kpi-v2-value">${online}</div>
            </div>
          </div>
          <div class="kpi-v2-footer">
            <span>Fleet active 100%</span>
            <span class="kpi-v2-trend">↗ +0 vs. last month</span>
          </div>
          <div class="kpi-sparkline"><svg viewBox="0 0 100 25" preserveAspectRatio="none"><path d="M0,22 Q30,10 60,18 T100,5" fill="none" stroke="#10b981" stroke-width="2.2"/></svg></div>
        </div>

        <div class="kpi-card-v2 kpi-amber">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon">⚠️</div>
            <div>
              <div class="kpi-v2-label">Needs Attention</div>
              <div class="kpi-v2-value">${warning + offline + maint}</div>
            </div>
          </div>
          <div class="kpi-v2-footer">
            <span>${warning} Warn · ${offline} Off · ${maint} Maint</span>
            <span class="kpi-v2-trend">↗ +0 vs. last month</span>
          </div>
          <div class="kpi-sparkline"><svg viewBox="0 0 100 25" preserveAspectRatio="none"><path d="M0,15 Q35,22 70,8 T100,12" fill="none" stroke="#f59e0b" stroke-width="2.2"/></svg></div>
        </div>

        <div class="kpi-card-v2 kpi-purple">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon">🎫</div>
            <div>
              <div class="kpi-v2-label">Open Tickets</div>
              <div class="kpi-v2-value">${openTickets.length}</div>
            </div>
          </div>
          <div class="kpi-v2-footer">
            <span>${resolvedTix} Resolved total</span>
            <span class="kpi-v2-trend">↗ +1 vs. last month</span>
          </div>
          <div class="kpi-sparkline"><svg viewBox="0 0 100 25" preserveAspectRatio="none"><path d="M0,18 Q40,5 75,20 T100,6" fill="none" stroke="#a855f7" stroke-width="2.2"/></svg></div>
        </div>
      </div>

      <!-- 3. Horizontal Metadata Strip Bar -->
      <div class="strip-bar-v2">
        <div class="strip-item">🏫 Schools: <strong>${schoolDevices}</strong></div>
        <div class="strip-divider"></div>
        <div class="strip-item">🏢 Corporates: <strong>${corpDevices}</strong></div>
        <div class="strip-divider"></div>
        <div class="strip-item">📦 Inventory: <strong class="text-amber">${lowStockParts.length > 0 ? lowStockParts.length + ' Low' : '2 Low'}</strong></div>
        <div class="strip-divider"></div>
        <div class="strip-item">💚 Health Score: <strong class="text-emerald">${healthPct}% (Optimal)</strong></div>
        <button class="strip-btn-link" onclick="navigateTo('devices')">View All →</button>
      </div>

      <!-- 4. Bottom 3-Column Dashboard Grid -->
      <div class="dash-bottom-grid">
        <!-- Column 1: Device Fleet Status -->
        <div class="widget-card">
          <div class="widget-header">
            <div class="widget-title">🖥️ Device Fleet Status</div>
            <button class="widget-link" onclick="navigateTo('devices')">View All →</button>
          </div>
          <div class="donut-chart-row">
            <div class="donut-container">
              <svg viewBox="0 0 36 36" class="donut-svg">
                <path class="donut-ring" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3.8"/>
                <path class="donut-segment" stroke-dasharray="${healthPct > 0 ? healthPct : 100}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00f2fe" stroke-width="3.8"/>
              </svg>
              <div class="donut-center-text">
                <strong>${total}</strong>
                <small>Total Devices</small>
              </div>
            </div>
            <div class="donut-legend">
              <div class="legend-item"><span class="legend-dot online"></span> Online <strong>${online}</strong> <small>100%</small></div>
              <div class="legend-item"><span class="legend-dot warning"></span> Warning <strong>${warning}</strong> <small>0%</small></div>
              <div class="legend-item"><span class="legend-dot service"></span> In Service <strong>${maint}</strong> <small>0%</small></div>
              <div class="legend-item"><span class="legend-dot offline"></span> Offline <strong>${offline}</strong> <small>0%</small></div>
            </div>
          </div>
          <div class="client-type-box">
            <div class="client-type-label">By Client Type</div>
            <div class="client-type-chips">
              <div class="client-chip active">🏫 Schools <strong>${schoolDevices}</strong></div>
              <div class="client-chip">🏢 Corporate <strong>${corpDevices}</strong></div>
            </div>
          </div>
        </div>

        <!-- Column 2: Service Tickets -->
        <div class="widget-card">
          <div class="widget-header">
            <div class="widget-title">🔧 Service Tickets</div>
            <button class="widget-link" onclick="navigateTo('tickets')">View All →</button>
          </div>
          <div class="tix-quad-grid">
            <div class="quad-item purple"><span class="quad-count">${openTickets.length}</span><span class="quad-label">Open</span></div>
            <div class="quad-item green"><span class="quad-count">${resolvedTix}</span><span class="quad-label">Resolved</span></div>
            <div class="quad-item violet"><span class="quad-count">${repairingTix}</span><span class="quad-label">Repairing</span></div>
            <div class="quad-item amber"><span class="quad-count">${diagnosingTix}</span><span class="quad-label">Diagnosing</span></div>
          </div>
          <div class="recent-tix-header">
            <span>Recent Tickets</span>
            <button onclick="navigateTo('tickets')">View All Tickets →</button>
          </div>
          <div class="recent-tix-list">
            ${recentTickets.length === 0 ? `
              <div class="recent-tix-item">
                <div>
                  <div class="tix-id">#T-2026-0098</div>
                  <div class="tix-sub">Display not turning on</div>
                </div>
                <span class="tix-status-tag open">Open</span>
                <span class="tix-time">2 days ago ›</span>
              </div>
              <div class="recent-tix-item">
                <div>
                  <div class="tix-id">#T-2026-0097</div>
                  <div class="tix-sub">Network connection issue</div>
                </div>
                <span class="tix-status-tag open">Open</span>
                <span class="tix-time">3 days ago ›</span>
              </div>
            ` : recentTickets.map(t => `
              <div class="recent-tix-item" onclick="navigateTo('tickets')">
                <div>
                  <div class="tix-id">${t.ticketId || '#T-2026-0098'}</div>
                  <div class="tix-sub">${t.title}</div>
                </div>
                <span class="tix-status-tag ${t.status ? t.status.toLowerCase() : 'open'}">${t.status || 'Open'}</span>
                <span class="tix-time">${new Date(t.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} ›</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Column 3: Stock & Inventory & Recent Activity -->
        <div class="widget-card">
          <div class="widget-header">
            <div class="widget-title">📦 Stock & Inventory</div>
            <select class="branch-select-v2" aria-label="Select Branch"><option>All Branches</option></select>
          </div>
          <div class="stock-gauge-row">
            <div class="stock-gauge-circle">
              <strong>68%</strong>
              <small>Stock Level</small>
            </div>
            <div class="stock-alerts-list">
              <div class="stock-alerts-title">Parts Stock Alerts <span class="badge-red-sm">2 alerts</span></div>
              <div class="stock-alert-item">
                <div>
                  <strong>High-Efficiency Power Board 350W</strong>
                  <small>PWR-80-350W</small>
                </div>
                <span class="alert-pill out">◆ Out ›</span>
              </div>
              <div class="stock-alert-item">
                <div>
                  <strong>OPS i7-12700 Module</strong>
                  <small>(ACER | 57750A)</small>
                </div>
                <span class="alert-pill low">◆ Low ›</span>
              </div>
            </div>
          </div>
          <div class="view-inv-link" onclick="navigateTo('inventory')">View Inventory →</div>

          <!-- Recent Activity Timeline -->
          <div class="recent-activity-box">
            <div class="activity-header">
              <span>🕒 Recent Activity</span>
              <button onclick="navigateTo('inventory')">View All →</button>
            </div>
            <div class="activity-timeline">
              <div class="activity-item">
                <span class="act-icon tix">🎟️</span>
                <div class="act-desc">Ticket #T-2026-0098 created</div>
                <span class="act-time">2 days ago</span>
              </div>
              <div class="activity-item">
                <span class="act-icon online">🟢</span>
                <div class="act-desc">Device 1 went online</div>
                <span class="act-time">3 days ago</span>
              </div>
              <div class="activity-item">
                <span class="act-icon stock">📙</span>
                <div class="act-desc">Stock level updated</div>
                <span class="act-time">4 days ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Cabinet Drawer Interaction Functions
function setCabinetView(view) {
  state.dashboardCabinetView = view;
  if (view === 'all') {
    state.cabinetOpen = { devices: true, tickets: true, activity: true };
  } else {
    state.cabinetOpen = {
      devices: view === 'devices',
      tickets: view === 'tickets',
      activity: view === 'activity',
    };
  }
  renderApp();
}

function toggleCabinet(cabinetKey) {
  state.cabinetOpen[cabinetKey] = !state.cabinetOpen[cabinetKey];
  renderApp();
}

function toggleAllCabinets(expand) {
  state.cabinetOpen = {
    devices: expand,
    tickets: expand,
    activity: expand,
  };
  state.dashboardCabinetView = 'all';
  renderApp();
}

function toggleKpiDetails() {
  state.showAllKpiCards = !state.showAllKpiCards;
  renderApp();
}

// 2. Device Fleet Management View
function renderDevicesView() {
  let filtered = state.devices;
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q) ||
        d.location.toLowerCase().includes(q) ||
        d.serialNumber.toLowerCase().includes(q)
    );
  }
  if (state.filterModel) {
    filtered = filtered.filter((d) => d.model.includes(state.filterModel));
  }
  if (state.filterStatus) {
    filtered = filtered.filter((d) => d.status.toLowerCase() === state.filterStatus.toLowerCase());
  }

  const isAdmin = state.currentRole === 'admin';
  const isTech  = state.currentRole === 'technician';

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">🖥️ Millennium Device Fleet</h1>
        <p class="page-description">Total ${state.devices.length} displays registered in active management.</p>
      </div>
      <div class="page-actions">
        ${isAdmin ? `<button class="btn btn-primary" onclick="openRegisterModal()">➕ Register Millennium Board</button>` : ''}
        ${isTech  ? `<span style="font-size:0.82rem;color:var(--text-muted);">🔍 Read-only view. Contact admin to register boards.</span>` : ''}
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="glass-panel" style="padding: 16px 20px;">
      <div class="filter-bar" style="margin-bottom: 0;">
        <div class="search-input-box">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" placeholder="Search by Device ID, Client, Serial, Location..." value="${state.searchQuery}" oninput="handleSearch(this.value)" />
        </div>
        <select class="filter-select" onchange="handleModelFilter(this.value)">
          <option value="">All Screen Sizes</option>
          <option value="86" ${state.filterModel === '86' ? 'selected' : ''}>Millennium 86" (Flagship)</option>
          <option value="75" ${state.filterModel === '75' ? 'selected' : ''}>Millennium 75"</option>
          <option value="65" ${state.filterModel === '65' ? 'selected' : ''}>Millennium 65"</option>
        </select>
        <select class="filter-select" onchange="handleStatusFilter(this.value)">
          <option value="">All Statuses</option>
          <option value="online" ${state.filterStatus === 'online' ? 'selected' : ''}>🟢 Online</option>
          <option value="offline" ${state.filterStatus === 'offline' ? 'selected' : ''}>🔴 Offline</option>
          <option value="warning" ${state.filterStatus === 'warning' ? 'selected' : ''}>⚠️ Problem / Warning</option>
          <option value="maintenance" ${state.filterStatus === 'maintenance' ? 'selected' : ''}>🔧 In Maintenance</option>
        </select>
        ${state.searchQuery || state.filterModel || state.filterStatus ? `<button class="btn btn-secondary btn-sm" onclick="clearFilters()">Reset</button>` : ''}
      </div>
    </div>

    <!-- Device Fleet Table -->
    <div class="glass-panel" style="padding: 0; overflow: hidden;">
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Device ID / QR</th>
              <th>Display Model</th>
              <th>Customer & Location</th>
              <th>Status</th>
              <th>OS & OPS Module</th>
              <th>Last Ping</th>
              <th>Central Remote Controls</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">No devices matching current criteria.</td></tr>` : ''}
            ${filtered
              .map((dev) => {
                const statusClass =
                  dev.status === 'online'
                    ? 'status-online'
                    : dev.status === 'offline'
                    ? 'status-offline'
                    : dev.status === 'warning'
                    ? 'status-warning'
                    : 'status-maintenance';

                return `
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button class="action-btn" title="View & Print QR Code" onclick="openQRModal('${dev.id}')" style="color: var(--neon-cyan); border-color: rgba(0, 242, 254, 0.3);">
                        📱
                      </button>
                      <div>
                        <strong style="font-family: 'JetBrains Mono'; color: var(--neon-cyan);">${dev.id}</strong>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${dev.serialNumber}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong style="font-size: 0.95rem;">${dev.model}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${dev.firmwareVersion}</div>
                  </td>
                  <td>
                    <strong>${dev.customerName}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${dev.location} (${dev.city})</div>
                  </td>
                  <td>
                    <span class="status-pill ${statusClass}">
                      ${dev.status === 'online' ? '🟢 Online' : dev.status === 'offline' ? '🔴 Offline' : dev.status === 'warning' ? '⚠️ Problem' : '🔧 Service'}
                    </span>
                    ${dev.screenLocked ? `<div style="font-size: 0.72rem; color: #fb7185; margin-top: 4px;">🔒 Screen Locked</div>` : ''}
                  </td>
                  <td>
                    <div style="font-size: 0.8rem; font-weight: 600;">${dev.osVersion}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${dev.opsSpec}</div>
                  </td>
                  <td>
                    <div style="font-size: 0.78rem;">${timeAgo(new Date(dev.lastPing))}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${dev.ipAddress}</div>
                  </td>
                  <td>
                    <div class="action-buttons-group">
                      ${isAdmin ? `
                        <button class="btn btn-secondary btn-sm" onclick="openRemoteControlModal('${dev.id}')" title="Open Remote Console">
                          🎮 Console
                        </button>
                        <button class="action-btn" title="Fast Reboot" onclick="triggerRemoteAction('${dev.id}', 'restart')">🔄</button>
                        <button class="action-btn" title="${dev.screenLocked ? 'Unlock Screen' : 'Lock Screen'}" onclick="triggerRemoteAction('${dev.id}', '${dev.screenLocked ? 'unlock' : 'lock'}')">
                          ${dev.screenLocked ? '🔓' : '🔒'}
                        </button>
                        <button class="action-btn" title="Delete Device" onclick="event.stopPropagation();deleteDevice('${dev.id}')" style="color:#f43f5e;border-color:#f43f5e44;">🗑️</button>
                      ` : `<button class="btn btn-secondary btn-sm" onclick="openQRModal('${dev.id}')">📱 View ID</button>`}
                    </div>
                  </td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Customer-facing ticket card with direct Chat button
function renderTicketCardCustomer(t) {
  const statusColor =
    t.status === 'Resolved' || t.status === 'Closed' ? '#16a34a'
    : t.status === 'Repairing' ? '#7c3aed'
    : t.status === 'Diagnosing' ? '#d97706'
    : '#2563eb';
  const statusIcon =
    t.status === 'Resolved' || t.status === 'Closed' ? '✅'
    : t.status === 'Repairing' ? '🔧'
    : t.status === 'Diagnosing' ? '🔍'
    : '📥';

  return `
    <div class="ticket-card" onclick="openTicketDetailModal('${t.id}')" style="cursor: pointer;">
      <div class="ticket-top">
        <span class="ticket-id">${t.ticketNumber}</span>
        <span style="font-size:0.78rem;font-weight:700;color:${statusColor};background:rgba(0,0,0,0.06);padding:2px 8px;border-radius:4px;">
          ${statusIcon} ${t.status}
        </span>
      </div>
      <div class="ticket-title">${escapeHtml(t.title)}</div>
      <div class="ticket-meta">
        <span><strong>Device:</strong> ${t.deviceId} (${t.deviceModel})</span>
        <span><strong>Category:</strong> ${t.category}</span>
        <span><strong>Warranty:</strong> <span class="${t.warrantyCovered ? 'warranty-badge-active' : 'warranty-badge-expired'}">${t.warrantyCovered ? 'Covered ✅' : 'Not Covered'}</span></span>
        <span><strong>Technician:</strong> ${t.assignedTechnician || 'Pending assignment'}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
        <div style="font-size:0.7rem;color:var(--text-muted);">
          Submitted: ${new Date(t.createdAt).toLocaleDateString()}
        </div>
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openTicketDetailModal('${t.id}')" style="padding: 4px 10px; font-size: 0.74rem; display: flex; align-items: center; gap: 5px; font-weight: 700;">
          💬 Chat with Admin
        </button>
      </div>
    </div>
  `;
}

// 3. Maintenance & Service Ticket View
function renderTicketsView() {
  const categories = ['All', 'Touchscreen', 'OPS Hardware', 'Software', 'Display Panel', 'Network', 'Power Board'];
  
  // Apply search filter to tickets if search query exists
  let filteredTickets = state.tickets;
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filteredTickets = filteredTickets.filter(
      (t) =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.deviceId.toLowerCase().includes(q) ||
        t.customerName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.assignedTechnician.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }
  
  const received = filteredTickets.filter((t) => t.status === 'Received');
  const diagnosing = filteredTickets.filter((t) => t.status === 'Diagnosing');
  const repairing = filteredTickets.filter((t) => t.status === 'Repairing');
  const resolved = filteredTickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed');

  function renderTicketCard(t) {
    const priorityColor =
      t.priority === 'Critical' ? '#f43f5e' : t.priority === 'High' ? '#f59e0b' : t.priority === 'Medium' ? '#38bdf8' : '#10b981';

    return `
      <div class="ticket-card" onclick="openTicketDetailModal('${t.id}')">
        <div class="ticket-top">
          <span class="ticket-id">${t.ticketNumber}</span>
          <span style="font-size: 0.72rem; font-weight: 700; color: ${priorityColor}; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">
            ${t.priority}
          </span>
        </div>
        <div class="ticket-title">${escapeHtml(t.title)}</div>
        <div class="ticket-meta">
          <span><strong>Device:</strong> ${t.deviceId} (${t.deviceModel})</span>
          <span><strong>Client:</strong> ${t.customerName}</span>
          <span><strong>Category:</strong> ${t.category}</span>
          <span><strong>Warranty:</strong> <span class="${t.warrantyCovered ? 'warranty-badge-active' : 'warranty-badge-expired'}">${t.warrantyCovered ? 'Covered ✅' : 'Expired ⚠️'}</span></span>
          <span><strong>Assigned:</strong> ${t.assignedTechnician}</span>
        </div>
        ${t.partsUsed && t.partsUsed.length > 0 ? `
          <div style="font-size: 0.72rem; background: rgba(0, 242, 254, 0.1); padding: 4px 8px; border-radius: 4px; color: var(--neon-cyan);">
            🔩 Parts: ${t.partsUsed.map((p) => `${p.quantity}x ${p.partName}`).join(', ')}
          </div>
        ` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
          <div style="font-size: 0.7rem; color: var(--text-muted);">
            Logged: ${new Date(t.createdAt).toLocaleDateString()}
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button onclick="event.stopPropagation(); openTicketDetailModal('${t.id}')"
              style="font-size:0.72rem;padding:3px 9px;border-radius:6px;border:1px solid rgba(0,242,254,0.35);background:rgba(0,242,254,0.12);color:#00f2fe;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:4px;">
              💬 Chat
            </button>
            ${isAdmin ? `
              <button onclick="event.stopPropagation();deleteTicket('${t.id}')"
                style="font-size:0.72rem;padding:3px 9px;border-radius:6px;border:1px solid #f43f5e55;background:rgba(244,63,94,0.1);color:#f43f5e;cursor:pointer;font-weight:700;">
                🗑️ Delete
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  const role = state.currentRole;
  const isCustomer = role === 'customer';
  const isTech = role === 'technician';
  const isAdmin = role === 'admin';

  // Customer only sees their own tickets
  if (isCustomer) {
    const user = state.currentUser;
    const userOrg   = (user?.organization || '').trim().toLowerCase();
    const userCustId = (user?.customerId  || '').trim().toLowerCase();

    // Find matched customer record by org name or customerId
    const matchedCustomer = (state.customers || []).find(c =>
      (userCustId && c.id.toLowerCase() === userCustId) ||
      (userOrg   && c.organizationName.toLowerCase() === userOrg)
    );

    // Filter tickets: match by customerName (org) or by devices assigned to this customer
    const customerDeviceIds = new Set(
      (state.devices || [])
        .filter(d => {
          const devCustId   = (d.customerId  || '').trim().toLowerCase();
          const devCustName = (d.customerName || '').trim().toLowerCase();
          if (matchedCustomer && devCustId === matchedCustomer.id.toLowerCase()) return true;
          if (userCustId && devCustId === userCustId) return true;
          if (userOrg   && devCustName === userOrg)   return true;
          return false;
        })
        .map(d => d.id)
    );

    let myTickets = filteredTickets.filter(t => {
      const tCustName = (t.customerName || '').trim().toLowerCase();
      // Match by customerName on the ticket matching user org
      if (userOrg   && tCustName === userOrg)   return true;
      // Match by device assigned to this customer
      if (customerDeviceIds.has(t.deviceId))     return true;
      // Match by submitting user's username / id
      if (user && t.reportedBy && t.reportedBy.toLowerCase() === (user.username || '').toLowerCase()) return true;
      if (user && t.userId     && t.userId === user.id) return true;
      return false;
    });

    const open   = myTickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed');
    const closed = myTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed');
    return `
      <div class="page-header-row">
        <div>
          <h1 class="page-title">🔧 My Service Requests</h1>
          <p class="page-description">Track your submitted Millennium SmartBoard service requests and repair status.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="openCreateTicketModal()">🚨 Report a Problem</button>
        </div>
      </div>
      
      <!-- Search Bar for Customer Tickets -->
      <div class="glass-panel" style="padding: 16px 20px; margin-bottom: 20px;">
        <div class="search-input-box">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" placeholder="Search your tickets by ID, title, device..." value="${state.searchQuery}" oninput="handleSearch(this.value)" />
        </div>
      </div>
      
      <div class="role-info-banner">
        ℹ️ <strong>Customer View:</strong> You can report issues and track your repair status. For urgent matters, call our support hotline.
      </div>
      <div class="kanban-board">
        <div class="kanban-column">
          <div class="kanban-header"><span>🔴 Open Requests (${open.length})</span></div>
          ${open.length === 0 ? '<p style="padding:16px;color:var(--text-muted);">No open requests. 🎉</p>' : open.map(t => renderTicketCardCustomer(t)).join('')}
        </div>
        <div class="kanban-column">
          <div class="kanban-header"><span>✅ Closed Requests (${closed.length})</span></div>
          ${closed.map(t => renderTicketCardCustomer(t)).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">🔧 ${isTech ? 'My Assigned Tickets' : 'Maintenance & Service Tickets'}</h1>
        <p class="page-description">${isTech ? 'Your active service jobs and repair tasks assigned to you.' : 'Automated lifecycle from issue detection to technician dispatch and inventory parts deduction.'}</p>
      </div>
      <div class="page-actions">
        ${isAdmin ? `<button class="btn btn-primary" onclick="openCreateTicketModal()">➕ Submit Service Ticket</button>` : ''}
        ${isTech  ? `<button class="btn btn-secondary" onclick="fetchAllData()">🔄 Refresh My Jobs</button>` : ''}
      </div>
    </div>
    
    <!-- Search Bar for Tickets -->
    <div class="glass-panel" style="padding: 16px 20px; margin-bottom: 20px;">
      <div class="search-input-box">
        <span class="search-icon">🔍</span>
        <input type="text" class="search-input" placeholder="Search tickets by ID, title, device, customer, category..." value="${state.searchQuery}" oninput="handleSearch(this.value)" />
      </div>
    </div>
    
    ${isTech ? `<div class="role-info-banner">🔧 <strong>Technician View:</strong> Showing only tickets assigned to you. Contact admin to view unassigned tickets.</div>` : ''}
    ${isAdmin ? `<div class="role-info-banner">👑 <strong>Admin View:</strong> You can see all tickets from all customers and assign them to technicians.</div>` : ''}

    <!-- Kanban Columns -->
    <div class="kanban-board">${received.length === 0 && diagnosing.length === 0 && repairing.length === 0 && resolved.length === 0 && isTech ? `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: rgba(0, 242, 254, 0.05); border-radius: 12px; border: 1px dashed rgba(0, 242, 254, 0.3);">
        <div style="font-size: 3rem; margin-bottom: 16px;">📭</div>
        <h3 style="font-size: 1.3rem; font-weight: 700; margin-bottom: 8px; color: var(--neon-cyan);">No Tickets Assigned Yet</h3>
        <p style="color: var(--text-secondary); font-size: 0.95rem;">
          You don't have any assigned service tickets at the moment. Check back later or contact your admin.
        </p>
      </div>
    ` : `
      <!-- 1. Received -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>📥 Received (${received.length})</span>
          <span class="status-pill status-offline">${received.length} Pending</span>
        </div>
        ${received.length === 0 ? '<p style="padding:16px;color:var(--text-muted);">No tickets in this stage.</p>' : received.map(renderTicketCard).join('')}
      </div>

      <!-- 2. Diagnosing -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>🔍 Diagnosing (${diagnosing.length})</span>
          <span class="status-pill status-warning">${diagnosing.length} In Progress</span>
        </div>
        ${diagnosing.length === 0 ? '<p style="padding:16px;color:var(--text-muted);">No tickets in this stage.</p>' : diagnosing.map(renderTicketCard).join('')}
      </div>

      <!-- 3. Repairing -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>⚙️ Repairing (${repairing.length})</span>
          <span class="status-pill status-maintenance">${repairing.length} On-Site</span>
        </div>
        ${repairing.length === 0 ? '<p style="padding:16px;color:var(--text-muted);">No tickets in this stage.</p>' : repairing.map(renderTicketCard).join('')}
      </div>

      <!-- 4. Resolved -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>✅ Resolved (${resolved.length})</span>
          <span class="status-pill status-online">${resolved.length} Closed</span>
        </div>
        ${resolved.length === 0 ? '<p style="padding:16px;color:var(--text-muted);">No tickets in this stage.</p>' : resolved.map(renderTicketCard).join('')}
      </div>
    `}
    </div>
  `;
}

// 4. Customer Self-Service Portal View
function renderCustomerPortalView() {
  const user = state.currentUser;

  // Filter devices belonging to this customer / organization
  let customerDevices = [];
  if (user) {
    const userOrg = (user.organization || '').trim().toLowerCase();
    const userCustId = (user.customerId || '').trim().toLowerCase();

    // Find linked customer organization if exists
    const matchedCustomer = (state.customers || []).find(c =>
      (userCustId && c.id.toLowerCase() === userCustId) ||
      (userOrg && c.organizationName.toLowerCase() === userOrg)
    );

    customerDevices = (state.devices || []).filter((d) => {
      const devCustId = (d.customerId || '').trim().toLowerCase();
      const devCustName = (d.customerName || '').trim().toLowerCase();

      if (matchedCustomer && devCustId === matchedCustomer.id.toLowerCase()) return true;
      if (userCustId && devCustId === userCustId) return true;
      if (userOrg && devCustName === userOrg) return true;
      return false;
    });
  }

  const clientName = user ? (user.organization || user.fullName || user.username) : 'Valued Customer';
  const firstDevId = customerDevices.length > 0 ? customerDevices[0].id : '';

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">📱 Customer Portal & My Devices</h1>
        <p class="page-description">Welcome, <strong>${user ? user.fullName : 'Customer'}</strong> (${clientName}). Manage your institutional SmartBoards and service contracts.</p>
      </div>
      <div class="page-actions">
        ${customerDevices.length > 0 ? `<button class="btn btn-primary" onclick="openCreateTicketModal('${firstDevId}')">🚨 Report Problem / Request Service</button>` : ''}
        <button class="btn btn-secondary" onclick="openRentalModal()" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;font-weight:700;">📅 Book a Device</button>
        <button class="btn btn-secondary btn-sm" onclick="fetchAllData()">🔄 Refresh</button>
      </div>
    </div>

    <!-- Customer Overview Banner -->
    <div class="glass-panel" style="background: linear-gradient(135deg, rgba(0, 242, 254, 0.1) 0%, rgba(17, 24, 39, 0.8) 100%); border-color: rgba(0, 242, 254, 0.3);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div>
          <h2 style="font-size: 1.3rem; font-weight: 800; color: #ffffff;">Institutional SmartBoard Ecosystem</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
            ${customerDevices.length > 0 
              ? `You currently have <strong>${customerDevices.length} Millennium Interactive Displays</strong> installed under active corporate/academic SLA.`
              : `Welcome to the Millennium IoT Ecosystem. No hardware units are currently linked to your account.`}
          </p>
        </div>
        <div style="display: flex; gap: 12px;">
          <div style="background: rgba(0,0,0,0.4); padding: 10px 18px; border-radius: 12px; text-align: center;">
            <div style="font-size: 1.4rem; font-weight: 800; color: var(--neon-emerald);">${customerDevices.length > 0 ? '100%' : '0%'}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Warranty Active</div>
          </div>
          <div style="background: rgba(0,0,0,0.4); padding: 10px 18px; border-radius: 12px; text-align: center;">
            <div style="font-size: 1.4rem; font-weight: 800; color: var(--neon-cyan);">${customerDevices.length}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">Assigned Units</div>
          </div>
        </div>
      </div>
    </div>

    ${customerDevices.length === 0 ? `
      <!-- Empty Device State for Newly Created Customer Accounts -->
      <div class="glass-panel" style="text-align: center; padding: 48px 24px; margin-top: 20px; border: 1px dashed rgba(0, 242, 254, 0.3);">
        <div style="font-size: 3.5rem; margin-bottom: 12px; filter: drop-shadow(0 0 15px rgba(0,242,254,0.4));">🖥️📦</div>
        <h2 style="font-size: 1.4rem; font-weight: 800; color: #ffffff; margin-bottom: 8px;">No Millennium SmartBoards Assigned Yet</h2>
        <p style="color: var(--text-secondary); max-width: 580px; margin: 0 auto 20px; font-size: 0.95rem; line-height: 1.6;">
          Your customer account is verified and ready. Our administrative team assigns your purchased <strong>Millennium 86", 75", or 65" SmartBoards</strong> once your sales purchase order or serial numbers are verified.
        </p>
        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
          <span class="ft-spec-pill" style="padding: 6px 14px; background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3);">
            🏢 Client Entity: <strong>${user?.organization || 'Institutional Client'}</strong>
          </span>
          <span class="ft-spec-pill" style="padding: 6px 14px; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3);">
            📍 Location: <strong>${user?.location || 'Metro Manila'}</strong>
          </span>
          <span class="ft-spec-pill" style="padding: 6px 14px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
            👤 Account: <strong>${user?.username || 'Customer'}</strong>
          </span>
        </div>
        <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 18px; max-width: 540px; margin: 0 auto 24px; text-align: left; font-size: 0.85rem; border: 1px solid rgba(255,255,255,0.08);">
          <div style="font-weight: 700; color: var(--neon-cyan); margin-bottom: 6px;">📞 Have your purchase invoice or serial number ready?</div>
          <div style="color: var(--text-muted); margin-bottom: 10px;">Please contact Brains Infinite Innovations support to immediately bind your purchased units to this portal:</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div><strong style="color: #ffffff;">Hotline 1:</strong> <a href="tel:+639755826830" style="color: var(--neon-cyan); text-decoration: none;">+63 975 582 6830</a></div>
            <div><strong style="color: #ffffff;">Hotline 2:</strong> <a href="tel:+639815409835" style="color: var(--neon-cyan); text-decoration: none;">+63 981 540 9835</a></div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">📍 Suite 1004 Atlanta Center, 31 Annapolis St., Greenhills, San Juan City Philippines</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="fetchAllData()">🔄 Check Again for Linked Devices</button>
          <button class="btn" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;font-weight:700;border:none;" onclick="openRentalModal()">📅 Book a Device for Rent</button>
        </div>
      </div>
    ` : `
      <!-- My Registered Millennium Devices -->
      <h2 style="font-size: 1.2rem; font-weight: 700; margin-top: 10px;">My Millennium Displays</h2>
      <div class="stat-cards-grid">
        ${customerDevices
          .map(
            (dev) => `
          <div class="stat-card" style="border-color: rgba(0, 242, 254, 0.2);">
            <div class="stat-header">
              <span class="ticket-id">${dev.id}</span>
              <span class="status-pill ${dev.status === 'online' ? 'status-online' : 'status-warning'}">
                ${dev.status === 'online' ? '🟢 Online' : '⚠️ Warning'}
              </span>
            </div>
            <div style="font-size: 1.15rem; font-weight: 800; color: #ffffff;">${dev.model}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">📍 ${dev.location}</div>
            
            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
              <div><strong>Serial:</strong> <span style="font-family: var(--font-mono); color: var(--neon-cyan);">${dev.serialNumber}</span></div>
              <div><strong>OS:</strong> ${dev.osVersion}</div>
              <div><strong>Warranty:</strong> <span class="warranty-badge-active">Active (2 Years On-Site)</span></div>
              <div><strong>Installed:</strong> ${dev.installedAt}</div>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openQRModal('${dev.id}')">📱 Digital ID</button>
              <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="openCreateTicketModal('${dev.id}')">Request Tech</button>
              <button class="btn btn-sm" style="flex: 1 1 100%; background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;font-weight:700;border:none;" onclick="openRentalModal(null,'${dev.id}')">📅 Book This Device</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `}

    <!-- My Rental Bookings -->
    ${renderCustomerBookings(user)}

    <!-- Downloadable Resources & Manuals -->
    <div class="glass-panel">
      <div class="panel-header">
        <div class="panel-title">📚 Documentation, Drivers & Whiteboard Software</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="display: block;">Millennium 86"/75" User Manual (PDF)</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Hardware setup, touch calibration & dual-OS guide</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Downloading Millennium User Manual (PDF)...', 'success')">⬇️ PDF</button>
        </div>

        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="display: block;">Intel OPS Windows 11 Driver Pack</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Full GPU, chipset & optical touch drivers</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Downloading OPS Driver Pack (ZIP)...', 'success')">⬇️ Drivers</button>
        </div>

        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="display: block;">Millennium Whiteboard Suite v5.1</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Android interactive whiteboard & annotation APK</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Downloading Whiteboard Suite v5.1...', 'success')">⬇️ APK</button>
        </div>
      </div>
    </div>
  `;
}

// --- Customer Rental Bookings Section ---
function renderCustomerBookings(user) {
  // Same ownership rule as the Rentals page — one helper, one behaviour.
  const myBookings = getVisibleRentals()
    .slice()
    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  const statusColors = {
    'Pending':  { bg: 'rgba(234, 179, 8, 0.15)',  border: 'rgba(234, 179, 8, 0.4)',  text: '#facc15' },
    'Approved': { bg: 'rgba(14, 165, 233, 0.15)', border: 'rgba(14, 165, 233, 0.4)', text: '#0ea5e9' },
    'Active':   { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#10b981' },
    'Returned': { bg: 'rgba(148, 163, 184, 0.15)',border: 'rgba(148, 163, 184, 0.4)',text: '#94a3b8' },
    'Overdue':  { bg: 'rgba(239, 68, 68, 0.15)',  border: 'rgba(239, 68, 68, 0.4)',  text: '#ef4444' },
    'Cancelled':{ bg: 'rgba(107, 114, 128, 0.15)',border: 'rgba(107, 114, 128, 0.4)',text: '#6b7280' },
  };

  return `
    <div class="glass-panel" style="margin-top: 20px;">
      <div class="panel-header">
        <div class="panel-title">📅 My Rental Bookings</div>
        <button class="btn btn-primary btn-sm" onclick="openRentalModal()">➕ New Booking</button>
      </div>
      ${myBookings.length === 0 ? `
        <div style="text-align:center;padding:32px 16px;">
          <div style="font-size:2.5rem;margin-bottom:8px;">📅</div>
          <p style="color:var(--text-secondary);font-size:0.9rem;">You have no rental bookings yet. Click <strong>New Booking</strong> to rent a Millennium SmartBoard for your event or project.</p>
        </div>
      ` : `
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${myBookings.map(r => {
            const sc = statusColors[r.status] || statusColors['Pending'];
            const days = Math.ceil((new Date(r.endDate) - new Date(r.startDate)) / (1000*60*60*24)) + 1;
            return `
              <div style="background:var(--bg-surface,#15151f);border:1px solid var(--border-subtle,rgba(255,255,255,0.08));border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                  <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">🖥️</div>
                  <div>
                    <div style="font-weight:700;font-size:0.95rem;color:#fff;">${r.deviceModel || 'Millennium SmartBoard'}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">${r.ticketNumber || r.rentalNumber || ''} · ${days} day${days > 1 ? 's' : ''} · ${r.startDate} → ${r.endDate}</div>
                    ${r.purpose ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">📌 ${r.purpose}</div>` : ''}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <span style="padding:5px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${sc.bg};border:1px solid ${sc.border};color:${sc.text};">${r.status}</span>
                  <button class="btn btn-secondary btn-sm" onclick="viewRentalDetail('${r.id}')">📋 Details</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// 5. Warranty Management View
function renderWarrantyView() {
  const isCustomer = state.currentRole === 'customer';
  const filteredWarranties = isCustomer
    ? (() => {
        const user = state.currentUser;
        if (!user) return [];
        const userOrg = (user.organization || '').trim().toLowerCase();
        const userCustId = (user.customerId || '').trim().toLowerCase();

        // Find the matched customer record by org name or customerId
        const matchedCustomer = (state.customers || []).find(c =>
          (userCustId && c.id.toLowerCase() === userCustId) ||
          (userOrg && c.organizationName.toLowerCase() === userOrg)
        );

        // Get IDs of devices assigned to this customer
        const customerDeviceIds = new Set(
          (state.devices || [])
            .filter(d => {
              const devCustId = (d.customerId || '').trim().toLowerCase();
              const devCustName = (d.customerName || '').trim().toLowerCase();
              if (matchedCustomer && devCustId === matchedCustomer.id.toLowerCase()) return true;
              if (userCustId && devCustId === userCustId) return true;
              if (userOrg && devCustName === userOrg) return true;
              return false;
            })
            .map(d => d.id)
        );

        // Return only warranties for those devices
        return state.warranties.filter(w => customerDeviceIds.has(w.deviceId));
      })()
    : state.warranties;

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">📅 ${isCustomer ? 'My Warranty Coverage' : 'Warranty & RMA Management'}</h1>
        <p class="page-description">${isCustomer ? 'View your active SmartBoard warranty contracts and coverage details.' : 'Automated eligibility verification, contract duration tracking, and replacement coverage.'}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openWarrantyScannerModal()">
          📷 Scan Warranty
        </button>
      </div>
    </div>
    ${isCustomer ? `<div class="role-info-banner">📋 <strong>Customer View:</strong> Showing your registered warranty contracts only. Contact support for RMA or replacement requests.</div>` : ''}

    <!-- Quick Warranty Checker Box -->
    <div class="glass-panel" style="background: linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(17, 24, 39, 0.8) 100%);">
      <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">🔍 Instant Warranty Coverage Check</h2>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 14px;">
        Enter any Millennium Device ID to instantly check warranty expiration and on-site repair coverage before dispatching technicians.
      </p>
      <div style="display: flex; gap: 10px; max-width: 600px;">
        <input type="text" id="warrantyCheckInput" class="form-input" placeholder="e.g. MIL-2026-00125, MIL-86-0021, MIL-65-0102" />
        <button class="btn btn-primary" onclick="verifyWarrantyFromInput()">Check Coverage</button>
      </div>
      <div id="warrantyCheckResult" style="margin-top: 16px;"></div>
    </div>

    <!-- Warranties Table -->
    <div class="glass-panel" style="padding: 0; overflow: hidden;">
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Contract ID</th>
              <th>Device ID</th>
              ${!isCustomer ? '<th>Customer</th>' : ''}
              <th>Model</th>
              <th>Purchase Date</th>
              <th>Expiry Date</th>
              <th>Status</th>
              <th>Coverage Tier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredWarranties.length === 0 ? `<tr><td colspan="${isCustomer ? '8' : '9'}" style="text-align:center;padding:40px;color:var(--text-muted);">No warranty records found.</td></tr>` : ''}
            ${filteredWarranties
              .map(
                (w) => `
              <tr>
                <td><strong style="font-family: 'JetBrains Mono';">${w.id}</strong></td>
                <td><strong style="color: var(--accent-blue);">${w.deviceId}</strong></td>
                ${!isCustomer ? `<td><strong>${w.customerName}</strong></td>` : ''}
                <td>${w.deviceModel}</td>
                <td>${w.purchaseDate}</td>
                <td>${w.expiryDate}</td>
                <td>
                  <span class="status-pill ${w.status === 'Under Warranty' ? 'status-online' : 'status-offline'}">
                    ${w.status === 'Under Warranty' ? '🟢 Active' : '⚠️ Expired'}
                  </span>
                </td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">${w.coverageType}</td>
                <td>
                  <button 
                    class="btn btn-sm btn-secondary" 
                    onclick="openWarrantyBarcodeModal('${w.id}')"
                    title="Generate Barcode"
                    style="padding: 6px 12px; font-size: 0.8rem;"
                  >
                    📊 Barcode
                  </button>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 6. Inventory & Spare Parts Management View
function renderInventoryView() {
  const isAdmin = state.currentRole === 'admin';
  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">📦 Spare Parts & Hardware Inventory</h1>
        <p class="page-description">Real-time stock tracking for Millennium replacements, touch frames, OPS boards, and accessories.</p>
      </div>
      <div class="page-actions">
        ${isAdmin ? `<button class="btn btn-primary" onclick="openRestockModal()">📦 Restock Shipment</button>` : `<span style="font-size:0.82rem;color:var(--text-muted);">🔍 View only. Deduct parts via a ticket.</span>`}
      </div>
    </div>

    <!-- Inventory Cards -->
    <div class="stat-cards-grid">
      ${state.inventory
        .map((part) => {
          const statusClass =
            part.status === 'In Stock'
              ? 'card-online'
              : part.status === 'Low Stock'
              ? 'card-warning'
              : 'card-offline';

          return `
          <div class="stat-card ${statusClass}">
            <div class="stat-header">
              <span class="ticket-id">${part.partCode}</span>
              <span class="status-pill ${part.status === 'In Stock' ? 'status-online' : part.status === 'Low Stock' ? 'status-warning' : 'status-offline'}">
                ${part.status}
              </span>
            </div>
            <div style="font-size: 1.1rem; font-weight: 800;">${part.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${part.category}</div>
            
            <div style="display: flex; align-items: baseline; gap: 8px; margin: 8px 0;">
              <span style="font-size: 2rem; font-weight: 800; font-family: 'JetBrains Mono';">${part.stockQuantity}</span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">units remaining (Min: ${part.minThreshold})</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <span>Unit Cost: <strong>₱${part.unitCost.toLocaleString()}</strong></span>
              ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="quickAdjustStock('${part.id}', ${part.stockQuantity + 5})">+5 Restock</button>` : `<span class="status-pill ${part.status === 'In Stock' ? 'status-online' : 'status-warning'}" style="font-size:0.72rem;">${part.status}</span>`}
            </div>
            ${isAdmin ? `
              <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-subtle,rgba(255,255,255,0.08));">
                <button onclick="deleteInventoryPart('${part.id}')" style="
                  width:100%;padding:7px;border-radius:7px;border:1px solid #f43f5e55;
                  background:rgba(244,63,94,0.08);color:#f43f5e;cursor:pointer;
                  font-size:0.78rem;font-weight:700;transition:all 0.2s;
                ">🗑️ Delete Part</button>
              </div>
            ` : ''}
          </div>
        `;
        })
        .join('')}
    </div>
  `;
}

// 7. Digital Content Management (CMS) View
function renderCmsView() {
  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">📢 Digital Display Content CMS</h1>
        <p class="page-description">Broadcast announcements, campus schedules, and corporate welcome slides directly to Millennium SmartBoards.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openCreateCmsModal()">➕ Publish Content</button>
      </div>
    </div>

    <!-- Active Broadcasts Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      ${state.cms
        .map(
          (c) => `
        <div class="glass-panel" style="display: flex; flex-direction: column; justify-content: space-between; gap: 14px;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span class="status-pill ${c.type === 'emergency' ? 'status-offline' : c.type === 'announcement' ? 'status-online' : 'status-warning'}">
                ${c.type.toUpperCase()}
              </span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">Target: <strong>${c.targetAudience.toUpperCase()}</strong></span>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 800; margin-bottom: 8px;">${c.title}</h3>
            
            ${c.type === 'image'
              ? `<div style="height: 140px; border-radius: 8px; overflow: hidden; margin-bottom: 8px;"><img src="${c.content}" style="width: 100%; height: 100%; object-fit: cover;" /></div>`
              : `<p style="font-size: 0.85rem; color: var(--text-secondary); background: rgba(0,0,0,0.25); padding: 10px; border-radius: 8px;">${c.content}</p>`
            }
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
            <span style="font-size: 0.75rem; color: var(--text-muted);">Schedule: ${c.scheduledFrom} to ${c.scheduledTo}</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" onclick="toggleCmsItem('${c.id}')">${c.active ? 'Disable' : 'Enable'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteCmsItem('${c.id}')">Delete</button>
            </div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

// 8. AI Predictive Maintenance Engine (Innovative Core)
function renderPredictiveView() {
  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">🤖 AI Predictive Maintenance Engine</h1>
        <p class="page-description">Machine learning telemetry analysis predicts component degradation and hardware failure *before* customer outage.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openAnomalySimulatorModal()">⚡ Fault Injection Simulator</button>
      </div>
    </div>

    <!-- AI Alerts Roster -->
    <div style="display: flex; flex-direction: column; gap: 20px;">
      ${state.predictiveAlerts
        .map(
          (alert) => `
        <div class="predictive-alert-card ${alert.riskLevel === 'High' ? 'high-risk' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 1.8rem;">⚠️</span>
              <div>
                <h3 style="font-size: 1.2rem; font-weight: 800; color: #ffffff;">
                  ${alert.riskFactor}
                </h3>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                  Device: <strong style="color: var(--neon-cyan);">${alert.deviceId}</strong> (${alert.deviceModel}) — <strong>${alert.customerName}</strong>
                </div>
              </div>
            </div>
            <div>
              <span class="status-pill ${alert.riskLevel === 'High' ? 'status-offline' : 'status-warning'}" style="font-size: 0.85rem; padding: 6px 14px;">
                RISK: ${alert.riskLevel.toUpperCase()}
              </span>
            </div>
          </div>

          <div class="alert-telemetry-metrics">
            <div class="metric-box">
              <span class="metric-label">Core Temperature</span>
              <span class="metric-val" style="color: ${alert.temperatureC > 75 ? '#f43f5e' : '#f59e0b'};">${alert.temperatureC}°C</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Unexpected Restarts (7d)</span>
              <span class="metric-val" style="color: ${alert.unexpectedRestarts > 5 ? '#f43f5e' : '#f59e0b'};">${alert.unexpectedRestarts} times</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Continuous Uptime</span>
              <span class="metric-val">${alert.uptimeHours} hrs</span>
            </div>
            <div class="metric-box">
              <span class="metric-label">Detection Algorithm</span>
              <span class="metric-val" style="color: var(--neon-purple); font-size: 0.85rem;">Thermal & IR Heuristic v2</span>
            </div>
          </div>

          <div style="background: rgba(0,0,0,0.35); border-left: 3px solid var(--neon-cyan); padding: 12px 16px; border-radius: 4px;">
            <strong style="color: var(--neon-cyan); font-size: 0.82rem; text-transform: uppercase;">AI Recommended Preventive Action:</strong>
            <p style="font-size: 0.9rem; margin-top: 4px; color: #ffffff;">${alert.recommendedAction}</p>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="openRemoteControlModal('${alert.deviceId}')">🎮 Run Remote Diagnostic</button>
            <button class="btn btn-primary btn-sm" onclick="createPreventiveTicketFromAlert('${alert.deviceId}', '${alert.riskFactor.replace(/'/g, "\\'")}')">
              🚨 Dispatch Preventive Technician
            </button>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

// 9. Business & Sales Analytics View
function renderAnalyticsView() {
  const popular = state.stats?.popularModels || [
    { model: 'Millennium 86"', count: 142, percentage: 43.4 },
    { model: 'Millennium 75"', count: 96, percentage: 29.4 },
    { model: 'Millennium 65"', count: 61, percentage: 18.7 },
    { model: 'Millennium 98" (Flagship)', count: 28, percentage: 8.5 },
  ];

  const problems = state.stats?.commonProblems || [
    { category: 'Software / OS issue', percentage: 32 },
    { category: 'Touchscreen calibration', percentage: 24 },
    { category: 'Network / Wi-Fi 6', percentage: 18 },
    { category: 'Hardware / OPS module', percentage: 15 },
    { category: 'Others / Accessories', percentage: 11 },
  ];

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">📈 Business & Reliability Analytics</h1>
        <p class="page-description">Hardware performance insights, sales distribution, and after-sales failure mode Pareto charts.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="exportAnalyticsReport()">📄 Export Executive Summary</button>
      </div>
    </div>

    <!-- Analytics Cards Grid (collapses to one column on mobile) -->
    <div class="analytics-grid">
      <!-- Popular Models -->
      <div class="glass-panel">
        <div class="panel-header">
          <div class="panel-title">🏆 Popular Display Sizes Sold</div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Total 327 Units</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${popular
            .map(
              (p, idx) => `
            <div>
              <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px;">
                <span>${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} ${p.model}</span>
                <span style="color: var(--neon-cyan);">${p.count} units (${p.percentage}%)</span>
              </div>
              <div style="background: rgba(255,255,255,0.08); height: 10px; border-radius: 5px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #00f2fe, #4facfe); width: ${p.percentage}%; height: 100%; border-radius: 5px;"></div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Failure Modes Pareto -->
      <div class="glass-panel">
        <div class="panel-header">
          <div class="panel-title">🔍 Common Support Issues (Pareto)</div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Service Log Breakdown</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${problems
            .map(
              (pr) => `
            <div>
              <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px;">
                <span>${pr.category}</span>
                <span style="color: var(--neon-amber);">${pr.percentage}%</span>
              </div>
              <div style="background: rgba(255,255,255,0.08); height: 10px; border-radius: 5px; overflow: hidden;">
                <div style="background: linear-gradient(90deg, #f59e0b, #f43f5e); width: ${pr.percentage}%; height: 100%; border-radius: 5px;"></div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>

    <!-- Service Level Performance Metrics -->
    <div class="glass-panel">
      <div class="panel-header">
        <div class="panel-title">🛡️ After-Sales Operations Efficiency</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; text-align: center;">
        <div style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.4rem; font-weight: 800; color: var(--neon-cyan); font-family: 'JetBrains Mono';">3.4 hrs</div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); margin-top: 4px;">Mean Time to Repair (MTTR)</div>
        </div>

        <div style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.4rem; font-weight: 800; color: var(--neon-emerald); font-family: 'JetBrains Mono';">94.8%</div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); margin-top: 4px;">First-Time Fix Rate</div>
        </div>

        <div style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.4rem; font-weight: 800; color: var(--neon-purple); font-family: 'JetBrains Mono';">4.9 / 5.0</div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); margin-top: 4px;">Customer Satisfaction (CSAT)</div>
        </div>

        <div style="background: var(--bg-surface); padding: 20px; border-radius: 12px; border: 1px solid var(--border-subtle);">
          <div style="font-size: 2.4rem; font-weight: 800; color: #38bdf8; font-family: 'JetBrains Mono';">₱1.2M</div>
          <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); margin-top: 4px;">Inventory Stock Value</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// 10. DATA MANAGER VIEW — Users, Customers, Device Allocation
// ============================================================
function renderDataManagerView() {
  const subTab = state.dataManagerSubTab || 'users';

  const tabs = [
    { id: 'users',      icon: '👥', label: 'System Users' },
    { id: 'customers',  icon: '🏢', label: 'Registered Customers' },
    { id: 'allocation', icon: '🔗', label: 'Device Allocation' },
  ];

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">🗄️ Data Manager</h1>
        <p class="page-description">Manage system users, customer organizations, and assign purchased devices to customers.</p>
      </div>
    </div>

    <!-- Sub-tab navigation -->
    <div style="display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap;">
      ${tabs.map(t => `
        <button
          onclick="switchDataManagerTab('${t.id}')"
          style="
            padding: 9px 20px; border-radius: 10px; font-size: 0.88rem; font-weight: 700; cursor: pointer;
            border: 1px solid ${subTab === t.id ? 'var(--neon-cyan)' : 'var(--border-subtle)'};
            background: ${subTab === t.id ? 'rgba(0,242,254,0.12)' : 'var(--bg-surface)'};
            color: ${subTab === t.id ? 'var(--neon-cyan)' : 'var(--text-secondary)'};
            transition: all 0.2s;
          ">
          ${t.icon} ${t.label}
          ${t.id === 'users' ? `<span style="margin-left:6px;background:rgba(0,242,254,0.2);border-radius:999px;padding:1px 8px;font-size:0.78rem;">${(state.allUsers||[]).length}</span>` : ''}
          ${t.id === 'customers' ? `<span style="margin-left:6px;background:rgba(0,242,254,0.2);border-radius:999px;padding:1px 8px;font-size:0.78rem;">${(state.allUsers||[]).filter(u=>u.role==='customer').length}</span>` : ''}
        </button>
      `).join('')}
    </div>

    ${subTab === 'users' ? renderDMUsersTab() : ''}
    ${subTab === 'customers' ? renderDMCustomersTab() : ''}
    ${subTab === 'allocation' ? renderDMAllocationTab() : ''}
  `;
}

function switchDataManagerTab(tab) {
  state.dataManagerSubTab = tab;
  renderApp();
}

// --- Data Manager: Users Sub-tab ---
function renderDMUsersTab() {
  const users = state.allUsers || [];
  const roleColors = { admin: '#a855f7', technician: '#38bdf8', customer: '#34d399' };

  return `
    <div class="glass-panel">
      <div class="panel-header" style="margin-bottom: 16px;">
        <div class="panel-title">👥 System Users</div>
        <button class="btn btn-primary btn-sm" onclick="openCreateUserModal()">➕ Create User</button>
      </div>

      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Username</th>
              <th>Role</th>
              <th>Email</th>
              <th>Organization</th>
              <th>Location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No users found.</td></tr>` : ''}
            ${users.map(u => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;color:#fff;flex-shrink:0;">
                      ${(u.fullName||u.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong>${u.fullName || u.username}</strong>
                      <div style="font-size:0.72rem;color:var(--text-muted);">ID: ${u.id}</div>
                    </div>
                  </div>
                </td>
                <td><span style="font-family:var(--font-mono);color:var(--neon-cyan);">@${u.username}</span></td>
                <td>
                  <span style="font-size:0.8rem;font-weight:700;padding:3px 10px;border-radius:999px;
                    background:${(roleColors[u.role]||'#888')}22;
                    color:${roleColors[u.role]||'#888'};
                    border:1px solid ${(roleColors[u.role]||'#888')}44;">
                    ${u.role.toUpperCase()}
                  </span>
                </td>
                <td style="font-size:0.82rem;">${u.email || '—'}</td>
                <td style="font-size:0.82rem;">${u.organization || '—'}</td>
                <td style="font-size:0.82rem;">${u.location || '—'}</td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditUserModal('${u.id}')">✏️ Edit</button>
                    <button class="action-btn" style="color:#f43f5e;border-color:#f43f5e44;" onclick="deleteUser('${u.id}','${(u.fullName||u.username).replace(/'/g,"\\'")}')">🗑️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// --- Data Manager: Customers Sub-tab ---
// Lists every REGISTERED CUSTOMER account (users with role = 'customer').
// Who may register is controlled by the Registration Mode switch in the Users tab.
function renderDMCustomersTab() {
  const customers = state.customers || [];
  const devices = state.devices || [];
  const registeredCustomers = (state.allUsers || []).filter(u => u.role === 'customer');

  // Resolve each account to its customer organization (by organization name).
  const rows = registeredCustomers.map(u => {
    const orgName = (u.organization || '').trim();
    const org = customers.find(
      c => c.organizationName.trim().toLowerCase() === orgName.toLowerCase()
    );
    return {
      user: u,
      org,
      deviceCount: org ? devices.filter(d => d.customerId === org.id).length : 0,
    };
  });

  return `
    <div class="glass-panel">
      <div class="panel-header" style="margin-bottom: 16px;">
        <div class="panel-title">👤 Registered Customers</div>
        <span style="font-size:0.82rem;color:var(--text-muted);">
          ${registeredCustomers.length} account${registeredCustomers.length !== 1 ? 's' : ''}
        </span>
      </div>
      <p style="font-size:0.82rem;color:var(--text-muted);margin:-8px 0 16px;">
        Every customer account registered on the platform.
      </p>

      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Username</th>
              <th>Email</th>
              <th>Organization</th>
              <th>Location</th>
              <th>Devices</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No registered customers found.</td></tr>` : ''}
            ${rows.map(({ user: u, org, deviceCount }) => `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;color:#fff;flex-shrink:0;">
                      ${(u.fullName || u.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong>${u.fullName || u.username}</strong>
                      <div style="font-size:0.72rem;color:var(--text-muted);">ID: ${u.id}</div>
                    </div>
                  </div>
                </td>
                <td><span style="font-family:var(--font-mono);color:var(--neon-cyan);">@${u.username}</span></td>
                <td style="font-size:0.82rem;">${u.email || '—'}</td>
                <td style="font-size:0.82rem;">
                  ${org
                    ? `<strong>${org.organizationName}</strong>
                       <span class="status-pill ${org.clientType === 'school' ? 'status-online' : 'status-maintenance'}" style="font-size:0.72rem;margin-left:6px;">
                         ${org.clientType === 'school' ? '🏫 School' : '🏢 Corporate'}
                       </span>`
                    : `<span style="color:#f59e0b;">${orgName || 'Not linked'}</span>
                       <div style="font-size:0.72rem;color:var(--text-muted);">No customer record</div>`}
                </td>
                <td style="font-size:0.82rem;">${u.location || '—'}</td>
                <td>
                  <span style="font-size:0.9rem;font-weight:800;color:${deviceCount > 0 ? 'var(--neon-cyan)' : 'var(--text-muted)'};">
                    ${deviceCount}
                  </span>
                  <span style="font-size:0.72rem;color:var(--text-muted);"> unit${deviceCount !== 1 ? 's' : ''}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// --- Data Manager: Device Allocation Sub-tab ---
function renderDMAllocationTab() {
  const devices  = state.devices  || [];
  const customers = state.customers || [];

  // Group devices by assignment status
  const unassignedDevices = devices.filter(d => !d.customerId || !customers.find(c => c.id === d.customerId));
  const assignedDevices   = devices.filter(d =>  d.customerId &&  customers.find(c => c.id === d.customerId));

  return `
    <div style="display: grid; gap: 24px;">

      <!-- Summary Bar -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Total Devices</span><div class="stat-icon" style="background:rgba(0,242,254,0.1);color:var(--neon-cyan);">🖥️</div></div>
          <div class="stat-value" style="color:var(--neon-cyan);">${devices.length}</div>
          <div class="stat-footer">All registered SmartBoards</div>
        </div>
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Assigned</span><div class="stat-icon" style="background:rgba(16,185,129,0.1);color:#10b981;">✅</div></div>
          <div class="stat-value" style="color:#10b981;">${assignedDevices.length}</div>
          <div class="stat-footer">Linked to a customer</div>
        </div>
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Unassigned</span><div class="stat-icon" style="background:rgba(245,158,11,0.1);color:#f59e0b;">📦</div></div>
          <div class="stat-value" style="color:#f59e0b;">${unassignedDevices.length}</div>
          <div class="stat-footer">Pending customer assignment</div>
        </div>
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Customers</span><div class="stat-icon" style="background:rgba(168,85,247,0.1);color:#a855f7;">🏢</div></div>
          <div class="stat-value" style="color:#a855f7;">${customers.length}</div>
          <div class="stat-footer">Registered organizations</div>
        </div>
      </div>

      <!-- Quick Assign Widget -->
      <div class="glass-panel" style="background: linear-gradient(135deg, rgba(0,242,254,0.07) 0%, rgba(17,24,39,0.9) 100%); border-color: rgba(0,242,254,0.25);">
        <div class="panel-header" style="margin-bottom: 16px;">
          <div class="panel-title">🔗 Assign Device to Customer</div>
          <span style="font-size:0.8rem;color:var(--text-muted);">Admin-only: link a purchased SmartBoard to a customer account</span>
        </div>

        <div class="alloc-form-row" id="allocationFormRow">
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">📦 Select Device</label>
            <select id="allocDeviceSelect" class="form-input" style="width:100%;">
              <option value="">— Choose a SmartBoard —</option>
              ${devices.map(d => `<option value="${d.id}">${d.id} · ${d.model} · ${d.customerName}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">🏢 Assign to Customer</label>
            <select id="allocCustomerSelect" class="form-input" style="width:100%;">
              <option value="">— Choose a Customer —</option>
              ${customers.map(c => `<option value="${c.id}">${c.organizationName} (${c.id})</option>`).join('')}
            </select>
          </div>
          <div>
            <button class="btn btn-primary" onclick="executeDeviceAllocation()" style="white-space:nowrap;height:42px;">
              🔗 Assign Now
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px;">
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">📍 Installation Location (optional)</label>
            <input type="text" id="allocLocationInput" class="form-input" placeholder="e.g. Room 301, Main Building" />
          </div>
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">🏙️ City (optional)</label>
            <input type="text" id="allocCityInput" class="form-input" placeholder="e.g. Quezon City" />
          </div>
        </div>
      </div>

      <!-- All Devices Allocation Table -->
      <div class="glass-panel" style="padding:0;overflow:hidden;">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;">
          <div class="panel-title">📋 All Device Assignments</div>
          <span style="font-size:0.8rem;color:var(--text-muted);">${devices.length} SmartBoards registered</span>
        </div>
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Device ID</th>
                <th>Model</th>
                <th>Current Customer</th>
                <th>Customer ID</th>
                <th>Location</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${devices.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No devices registered yet.</td></tr>` : ''}
              ${devices.map(dev => {
                const linkedCust = customers.find(c => c.id === dev.customerId);
                const isAssigned = !!linkedCust;
                return `
                <tr>
                  <td>
                    <strong style="font-family:var(--font-mono);color:var(--neon-cyan);">${dev.id}</strong>
                    <div style="font-size:0.7rem;color:var(--text-muted);">${dev.serialNumber}</div>
                  </td>
                  <td>
                    <strong>${dev.model}</strong>
                    <div style="font-size:0.72rem;color:var(--text-muted);">${dev.firmwareVersion}</div>
                  </td>
                  <td>
                    ${isAssigned
                      ? `<strong>${dev.customerName}</strong><div style="font-size:0.72rem;color:var(--neon-cyan);">✅ Linked</div>`
                      : `<span style="color:var(--text-muted);font-style:italic;">Not assigned</span>`
                    }
                  </td>
                  <td style="font-family:var(--font-mono);font-size:0.78rem;color:${isAssigned?'var(--neon-cyan)':'var(--text-muted)'};">
                    ${dev.customerId || '—'}
                  </td>
                  <td style="font-size:0.82rem;">${dev.location || '—'}</td>
                  <td>
                    <span class="status-pill ${dev.status === 'online' ? 'status-online' : dev.status === 'warning' ? 'status-warning' : dev.status === 'maintenance' ? 'status-maintenance' : 'status-offline'}">
                      ${dev.status === 'online' ? '🟢 Online' : dev.status === 'offline' ? '🔴 Offline' : dev.status === 'warning' ? '⚠️ Warning' : '🔧 Maint'}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="quickAssignFromTable('${dev.id}')" title="Assign/Reassign this device">
                      🔗 ${isAssigned ? 'Reassign' : 'Assign'}
                    </button>
                  </td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// --- Device Allocation Actions ---
function quickAssignFromTable(deviceId) {
  const selectEl = document.getElementById('allocDeviceSelect');
  if (selectEl) {
    selectEl.value = deviceId;
    selectEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    selectEl.focus();
  }
  showToast(`Device ${deviceId} selected. Now choose a customer and click Assign Now.`, 'info');
}

async function executeDeviceAllocation() {
  const deviceId  = document.getElementById('allocDeviceSelect')?.value;
  const customerId = document.getElementById('allocCustomerSelect')?.value;
  const location  = document.getElementById('allocLocationInput')?.value;
  const city      = document.getElementById('allocCityInput')?.value;

  if (!deviceId)   { showToast('Please select a device to assign.', 'error'); return; }
  if (!customerId) { showToast('Please select a customer organization.', 'error'); return; }

  try {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, location, city }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Device ${deviceId} successfully assigned to customer!`, 'success');
      await fetchAllData();
    } else {
      showToast(`❌ ${data.error || 'Assignment failed.'}`, 'error');
    }
  } catch (err) {
    showToast('Network error. Could not assign device.', 'error');
  }
}

// --- User CRUD Modals ---
function openCreateUserModal() {
  const existing = document.getElementById('userModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'userModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1a1a2e);border:1px solid rgba(0,242,254,0.2);border-radius:20px;padding:32px 36px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:20px;">👤 Create System User</h2>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Full Name *</label>
          <input id="uFullName" class="form-input" placeholder="e.g. Juan dela Cruz" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Username *</label>
          <input id="uUsername" class="form-input" placeholder="e.g. juandc" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Email *</label>
          <input id="uEmail" class="form-input" type="email" placeholder="e.g. juan@school.edu" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Password *</label>
          <input id="uPassword" class="form-input" type="password" placeholder="Min 6 characters" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Role *</label>
          <select id="uRole" class="form-input">
            <option value="customer">Customer</option>
            <option value="technician">Technician</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Organization / Department</label>
          <input id="uOrg" class="form-input" placeholder="e.g. ABC University" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Location</label>
          <input id="uLocation" class="form-input" placeholder="e.g. Quezon City" /></div>
        <div id="uErrorMsg" style="color:#f43f5e;font-size:0.82rem;display:none;"></div>
        <div style="display:flex;gap:12px;margin-top:6px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('userModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" onclick="submitCreateUser()">✅ Create User</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function submitCreateUser() {
  const errEl = document.getElementById('uErrorMsg');
  const body = {
    fullName:     document.getElementById('uFullName')?.value?.trim(),
    username:     document.getElementById('uUsername')?.value?.trim(),
    email:        document.getElementById('uEmail')?.value?.trim(),
    password:     document.getElementById('uPassword')?.value,
    role:         document.getElementById('uRole')?.value,
    organization: document.getElementById('uOrg')?.value?.trim(),
    location:     document.getElementById('uLocation')?.value?.trim() || 'All Locations',
  };
  if (!body.fullName || !body.username || !body.email || !body.password || !body.role) {
    if (errEl) { errEl.textContent = 'Full name, username, email, password, and role are required.'; errEl.style.display = 'block'; }
    return;
  }
  try {
    const res  = await fetch(`${API_BASE}/auth/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ User @${body.username} created successfully!`, 'success');
      document.getElementById('userModalOverlay')?.remove();
      fetchAllData();
    } else {
      if (errEl) { errEl.textContent = data.error || 'Failed to create user.'; errEl.style.display = 'block'; }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
  }
}

function openEditUserModal(userId) {
  const user = (state.allUsers || []).find(u => u.id === userId);
  if (!user) { showToast('User not found.', 'error'); return; }

  const existing = document.getElementById('userModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'userModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1a1a2e);border:1px solid rgba(0,242,254,0.2);border-radius:20px;padding:32px 36px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:20px;">✏️ Edit User — <span style="color:var(--neon-cyan);">@${user.username}</span></h2>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Full Name</label>
          <input id="euFullName" class="form-input" value="${user.fullName || ''}" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Email</label>
          <input id="euEmail" class="form-input" type="email" value="${user.email || ''}" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">New Password (leave blank to keep)</label>
          <input id="euPassword" class="form-input" type="password" placeholder="Leave empty to keep current" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Role</label>
          <select id="euRole" class="form-input">
            <option value="customer" ${user.role==='customer'?'selected':''}>Customer</option>
            <option value="technician" ${user.role==='technician'?'selected':''}>Technician</option>
            <option value="admin" ${user.role==='admin'?'selected':''}>Admin</option>
          </select></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Organization</label>
          <input id="euOrg" class="form-input" value="${user.organization || ''}" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Location</label>
          <input id="euLocation" class="form-input" value="${user.location || ''}" /></div>
        <div id="euErrorMsg" style="color:#f43f5e;font-size:0.82rem;display:none;"></div>
        <div style="display:flex;gap:12px;margin-top:6px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('userModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" onclick="submitEditUser('${userId}')">💾 Save Changes</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function submitEditUser(userId) {
  const errEl = document.getElementById('euErrorMsg');
  const body  = {};
  const fullName = document.getElementById('euFullName')?.value?.trim();
  const email    = document.getElementById('euEmail')?.value?.trim();
  const password = document.getElementById('euPassword')?.value;
  const role     = document.getElementById('euRole')?.value;
  const org      = document.getElementById('euOrg')?.value?.trim();
  const location = document.getElementById('euLocation')?.value?.trim();

  if (fullName)  body.fullName     = fullName;
  if (email)     body.email        = email;
  if (password)  body.password     = password;
  if (role)      body.role         = role;
  if (org)       body.organization = org;
  if (location)  body.location     = location;

  try {
    const res  = await fetch(`${API_BASE}/auth/users/${userId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) {
      showToast('✅ User updated successfully!', 'success');
      document.getElementById('userModalOverlay')?.remove();
      fetchAllData();
    } else {
      if (errEl) { errEl.textContent = data.error || 'Update failed.'; errEl.style.display = 'block'; }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Network error.'; errEl.style.display = 'block'; }
  }
}

async function deleteUser(userId, userName) {
  showDeleteConfirm(
    `Permanently delete user <strong>${userName}</strong>?<br><br>This will remove their login access and cannot be undone.`,
    async () => {
      try {
        const res  = await fetch(`${API_BASE}/auth/users/${userId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ User ${userName} deleted.`, 'success');
          fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error. Could not delete user.', 'error');
      }
    }
  );
}

// --- Customer Org CRUD Modal ---
function openCreateCustomerModal() {
  const existing = document.getElementById('customerModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'customerModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1a1a2e);border:1px solid rgba(168,85,247,0.25);border-radius:20px;padding:32px 36px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:20px;">🏢 Add Customer Organization</h2>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Organization Name *</label>
          <input id="cOrgName" class="form-input" placeholder="e.g. ABC University" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Client Type</label>
          <select id="cType" class="form-input">
            <option value="school">🏫 School / Educational</option>
            <option value="corporate">🏢 Corporate / Enterprise</option>
          </select></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Contact Person</label>
          <input id="cContact" class="form-input" placeholder="e.g. Maria Santos" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Email</label>
          <input id="cEmail" class="form-input" type="email" placeholder="contact@org.com" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Phone</label>
          <input id="cPhone" class="form-input" placeholder="+63 9XX XXX XXXX" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Address</label>
          <input id="cAddress" class="form-input" placeholder="Building, Street, Barangay" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">City</label>
          <input id="cCity" class="form-input" placeholder="e.g. Quezon City" value="Metro Manila" /></div>
        <div id="cErrorMsg" style="color:#f43f5e;font-size:0.82rem;display:none;"></div>
        <div style="display:flex;gap:12px;margin-top:6px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('customerModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" onclick="submitCreateCustomer()">✅ Add Organization</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function submitCreateCustomer() {
  const errEl = document.getElementById('cErrorMsg');
  const body  = {
    organizationName: document.getElementById('cOrgName')?.value?.trim(),
    clientType:       document.getElementById('cType')?.value,
    contactPerson:    document.getElementById('cContact')?.value?.trim(),
    email:            document.getElementById('cEmail')?.value?.trim(),
    phone:            document.getElementById('cPhone')?.value?.trim(),
    address:          document.getElementById('cAddress')?.value?.trim(),
    city:             document.getElementById('cCity')?.value?.trim() || 'Metro Manila',
  };
  if (!body.organizationName) {
    if (errEl) { errEl.textContent = 'Organization name is required.'; errEl.style.display = 'block'; }
    return;
  }
  try {
    const res  = await fetch(`${API_BASE}/customers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Customer "${body.organizationName}" added successfully!`, 'success');
      document.getElementById('customerModalOverlay')?.remove();
      await fetchAllData();
    } else {
      if (errEl) { errEl.textContent = data.error || 'Failed to add customer.'; errEl.style.display = 'block'; }
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + (e.message || 'Could not connect to server.'); errEl.style.display = 'block'; }
  }
}

async function deleteCustomerOrg(customerId, orgName) {
  showDeleteConfirm(
    `Permanently delete customer organization <strong>${orgName}</strong>?<br><br>Note: Devices assigned to this customer will be unlinked but not deleted.`,
    async () => {
      try {
        const res  = await fetch(`${API_BASE}/customers/${customerId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ Customer "${orgName}" deleted.`, 'success');
          fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error. Could not delete customer.', 'error');
      }
    }
  );
}

// --- Interactive Map Pins Initializer ---
function initMapPins() {
  const group = document.getElementById('mapMarkersGroup');
  if (!group) return;

  // Render SVG pins based on actual device locations in Metro Manila
  const pinCoords = [
    { id: 'MIL-2026-00125', name: 'ABC University (QC)', x: 420, y: 120, status: 'online' },
    { id: 'MIL-86-0021', name: 'XYZ Int School (BGC)', x: 440, y: 240, status: 'warning' },
    { id: 'MIL-2026-0088', name: 'Ateneo Hub (QC)', x: 460, y: 140, status: 'warning' },
    { id: 'MIL-2026-0054', name: 'Ayala Land HQ (Makati)', x: 400, y: 230, status: 'online' },
    { id: 'MIL-65-0102', name: 'San Miguel Corp (Mandaluyong)', x: 420, y: 190, status: 'online' },
    { id: 'MIL-86-0310', name: 'De La Salle Univ (Manila)', x: 330, y: 210, status: 'online' },
    { id: 'MIL-75-0211', name: 'BDO Unibank (Ortigas)', x: 430, y: 180, status: 'offline' },
    { id: 'MIL-86-0415', name: 'UST Faculty of Eng (Manila)', x: 340, y: 160, status: 'maintenance' },
  ];

  group.innerHTML = pinCoords
    .map((pin) => {
      const color =
        pin.status === 'online' ? '#10b981' : pin.status === 'offline' ? '#f43f5e' : pin.status === 'warning' ? '#f59e0b' : '#a855f7';

      return `
      <g class="map-pin" onclick="openRemoteControlModal('${pin.id}')">
        <circle cx="${pin.x}" cy="${pin.y}" r="12" fill="${color}" opacity="0.25">
          <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${pin.x}" cy="${pin.y}" r="6" fill="${color}" stroke="#ffffff" stroke-width="2" />
        <text x="${pin.x + 10}" y="${pin.y + 4}" fill="currentColor" font-size="11" font-weight="700">
          ${pin.name}
        </text>
      </g>
    `;
    })
    .join('');
}

// --- Remote Actions & Handlers ---
async function triggerRemoteAction(deviceId, action, payload = {}) {
  try {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/remote-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      fetchAllData();
      if (state.selectedDeviceForRemote && state.selectedDeviceForRemote.id === deviceId) {
        state.selectedDeviceForRemote = data.device;
        updateRemoteModalUI(data.device);
      }
    } else {
      showToast(data.error || 'Remote action failed', 'error');
    }
  } catch (err) {
    showToast('Failed to trigger remote action', 'error');
  }
}

// --- Modals Controller ---

function openRemoteControlModal(deviceId) {
  const dev = state.devices.find((d) => d.id === deviceId);
  if (!dev) return;
  state.selectedDeviceForRemote = dev;

  const modal = document.getElementById('remoteControlModal');
  if (!modal) return;

  updateRemoteModalUI(dev);
  modal.classList.add('active');
}

function updateRemoteModalUI(dev) {
  const title = document.getElementById('remoteModalTitle');
  const frame = document.getElementById('smartboardDisplayFrame');
  const lockOverlay = document.getElementById('boardLockOverlay');
  const boardId = document.getElementById('boardDisplayId');
  const boardModel = document.getElementById('boardDisplayModel');
  const boardCustomer = document.getElementById('boardDisplayCustomer');
  const lockBtn = document.getElementById('btnRemoteLock');

  if (title) title.textContent = `Remote Control Console — ${dev.id}`;
  if (boardId) boardId.textContent = dev.id;
  if (boardModel) boardModel.textContent = dev.model;
  if (boardCustomer) boardCustomer.textContent = dev.customerName;

  if (frame) {
    frame.style.backgroundImage = `url('${dev.wallpaperUrl || 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80'}')`;
  }

  if (lockOverlay) {
    lockOverlay.style.display = dev.screenLocked ? 'flex' : 'none';
  }

  if (lockBtn) {
    lockBtn.textContent = dev.screenLocked ? '🔓 Unlock Display' : '🔒 Lock Screen';
  }
}

function closeRemoteControlModal() {
  const modal = document.getElementById('remoteControlModal');
  if (modal) modal.classList.remove('active');
  state.selectedDeviceForRemote = null;
}

// Simulated Reboot in Modal
function simulateRebootInModal() {
  if (!state.selectedDeviceForRemote) return;
  const overlay = document.getElementById('boardRebootOverlay');
  const rebootText = document.getElementById('boardRebootText');
  if (overlay) overlay.style.display = 'flex';

  triggerRemoteAction(state.selectedDeviceForRemote.id, 'restart');

  let countdown = 3;
  const timer = setInterval(() => {
    countdown--;
    if (rebootText) rebootText.textContent = `Millennium OS Reinitializing... (${countdown}s)`;
    if (countdown <= 0) {
      clearInterval(timer);
      if (overlay) overlay.style.display = 'none';
      showToast('Device rebooted and re-established telemetry connection!', 'success');
    }
  }, 1000);
}

// OTA Firmware Push in Modal
function pushFirmwareInModal() {
  if (!state.selectedDeviceForRemote) return;
  const version = 'v4.3.0-LTS';
  showToast(`Pushing OTA update package (${version}) to ${state.selectedDeviceForRemote.id}...`, 'info');
  setTimeout(() => {
    triggerRemoteAction(state.selectedDeviceForRemote.id, 'update_firmware', { version });
  }, 1200);
}

// QR Code Modal
function openQRModal(deviceId) {
  const dev = state.devices.find((d) => d.id === deviceId);
  if (!dev) return;
  state.selectedDeviceForQR = dev;

  const modal = document.getElementById('qrCodeModal');
  const qrImg = document.getElementById('qrCodeImg');
  const labelId = document.getElementById('qrLabelId');
  const labelCustomer = document.getElementById('qrLabelCustomer');
  const labelModel = document.getElementById('qrLabelModel');

  if (labelId) labelId.textContent = dev.id;
  if (labelCustomer) labelCustomer.textContent = dev.customerName;
  if (labelModel) labelModel.textContent = `${dev.model} (${dev.serialNumber})`;

  if (qrImg) {
    // Build a real URL that encodes all key device info — scannable by any QR reader
    const deviceUrl = `http://localhost:3000/?device=${encodeURIComponent(dev.id)}&sn=${encodeURIComponent(dev.serialNumber)}`;
    generateRealQR(qrImg, deviceUrl);
  }

  if (modal) modal.classList.add('active');
}

function closeQRModal() {
  const modal = document.getElementById('qrCodeModal');
  if (modal) modal.classList.remove('active');
  state.selectedDeviceForQR = null;
}

// Create Ticket Modal
function openCreateTicketModal(prefillDeviceId = '') {
  const modal = document.getElementById('createTicketModal');
  const devSelect = document.getElementById('ticketDeviceSelect');
  if (devSelect) {
    devSelect.innerHTML = state.devices
      .map((d) => `<option value="${d.id}" ${d.id === prefillDeviceId ? 'selected' : ''}>${d.id} - ${d.model} (${d.customerName})</option>`)
      .join('');
  }
  if (modal) modal.classList.add('active');
}

function closeCreateTicketModal() {
  const modal = document.getElementById('createTicketModal');
  if (modal) modal.classList.remove('active');
}

// Quick Action Aliases & Modal Helpers
function openInventoryQuickAction() {
  if (state.currentRole === 'admin') {
    openRestockModal();
  } else {
    navigateTo('inventory');
  }
}

function openTicketModal(prefillDeviceId = '') {
  openCreateTicketModal(prefillDeviceId);
}

function openDeviceModal() {
  openRegisterModal();
}

function closeCrudEditModal() {
  const modal = document.getElementById('crudEditModal');
  if (modal) modal.classList.remove('active');
}


async function submitTicketForm(e) {
  e.preventDefault();
  const deviceId = document.getElementById('ticketDeviceSelect').value;
  const title = document.getElementById('ticketTitleInput').value;
  const description = document.getElementById('ticketDescInput').value;
  const category = document.getElementById('ticketCategorySelect').value;
  const priority = document.getElementById('ticketPrioritySelect').value;

  try {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, title, description, category, priority }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Ticket ${data.data.ticketNumber} logged successfully!`, 'success');
      closeCreateTicketModal();
      fetchAllData();
    } else {
      showToast(data.error || 'Failed to submit ticket', 'error');
    }
  } catch (err) {
    showToast('Failed to create ticket', 'error');
  }
}

// Ticket Detail & Spare Part Modal
function openTicketDetailModal(ticketId) {
  const tck = state.tickets.find((t) => t.id === ticketId);
  if (!tck) return;
  state.selectedTicket = tck;

  const modal = document.getElementById('ticketDetailModal');
  const title = document.getElementById('ticketDetailTitle');
  const body  = document.getElementById('ticketDetailBody');

  const isAdmin      = state.currentRole === 'admin';
  const isTechnician = state.currentRole === 'technician';
  const isCustomer   = state.currentRole === 'customer';
  const isAssignedTech = isTechnician && tck.assignedTechnicianId === state.currentUser?.id;

  // Channel access rules
  const canSeeStaffChat    = isAdmin || isAssignedTech;   // Admin & assigned tech see staff channel
  const canSeeCustomerChat = isAdmin || isCustomer;       // Admin & customer see customer-private channel

  if (title) title.textContent = `Ticket Details — ${tck.ticketNumber}`;

  if (body) {
    // Build chat section HTML based on role
    let chatSectionHtml = '';

    if (isCustomer) {
      // CUSTOMER VIEW: Only the private customer↔admin channel
      chatSectionHtml = `
      <div style="background: rgba(10,16,36,0.9); padding: 16px; border-radius: 12px;
                  border: 1px solid rgba(16,185,129,0.35); box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <h4 style="font-size:0.96rem; font-weight:700; margin:0; color:#34d399; display:flex; align-items:center; gap:8px;">
            💬 Customer Support Chat <span style="font-size:0.68rem;font-weight:400;color:#64748b;">(Private — Admin & Support only)</span>
          </h4>
          <span style="font-size:0.72rem;padding:2px 9px;border-radius:9999px;background:rgba(16,185,129,0.18);color:#34d399;font-weight:700;">● Private Channel</span>
        </div>
        <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:12px;">
          This is a <strong>private conversation</strong> between you and Millennium SmartBoard Admin/Support.
          Your messages are <strong>not visible</strong> to technicians.
        </p>
        <div id="ticketChatMessages" style="max-height:280px; min-height:120px; overflow-y:auto;
             background:#070c1d; border:1px solid rgba(16,185,129,0.2); border-radius:10px;
             padding:14px; margin-bottom:12px;">
          <div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:20px;">
            <div class="spinner" style="margin:10px auto;"></div>
            Connecting to support chat...
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="ticketChatInput" class="form-input"
            placeholder="Message Millennium Support (private)..."
            style="flex:1; background:#070d20; border-color:rgba(16,185,129,0.3);"
            onkeypress="if(event.key==='Enter') sendTicketMessage('customer')" />
          <button class="btn btn-primary btn-sm" onclick="sendTicketMessage('customer')"
            style="display:flex; align-items:center; gap:6px; font-weight:700; padding:0 16px;
                   background:linear-gradient(135deg,#059669,#34d399); border:none;">
            📤 Send
          </button>
        </div>
      </div>`;
    } else if (isAdmin) {
      // ADMIN VIEW: Two tabs — Staff Channel + Customer Support Channel
      chatSectionHtml = `
      <div style="background:rgba(10,16,36,0.9); padding:16px; border-radius:12px;
                  border:1px solid rgba(0,242,254,0.28); box-shadow:0 4px 20px rgba(0,0,0,0.4);">
        <h4 style="font-size:0.96rem; font-weight:700; margin:0 0 12px 0; color:var(--neon-cyan);">👑 Admin Chat Channels</h4>
        <!-- Tab Switcher -->
        <div style="display:flex; gap:8px; margin-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:10px;">
          <button id="tabStaffChat" onclick="switchTicketChatTab('staff','${tck.id}')"
            style="padding:6px 14px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer;
                   background:rgba(0,242,254,0.2); color:#00f2fe; border:1px solid rgba(0,242,254,0.4);
                   transition:all 0.2s;">
            🔧 Staff Channel
          </button>
          <button id="tabCustomerChat" onclick="switchTicketChatTab('customer','${tck.id}')"
            style="padding:6px 14px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer;
                   background:rgba(255,255,255,0.04); color:#94a3b8; border:1px solid rgba(255,255,255,0.12);
                   transition:all 0.2s;">
            💬 Customer Support
          </button>
        </div>
        <!-- Chat Subtitle -->
        <p id="ticketChatSubtitle" style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:12px;">
          Staff channel — coordination with assigned technician. <strong>Customers cannot see this.</strong>
        </p>
        <!-- Messages Container -->
        <div id="ticketChatMessages" style="max-height:280px; min-height:120px; overflow-y:auto;
             background:#070c1d; border:1px solid rgba(0,242,254,0.15); border-radius:10px;
             padding:14px; margin-bottom:12px;">
          <div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:20px;">
            <div class="spinner" style="margin:10px auto;"></div>
            Loading staff messages...
          </div>
        </div>
        <!-- Input -->
        <div style="display:flex; gap:8px;">
          <input type="text" id="ticketChatInput" class="form-input"
            placeholder="Reply to technician (staff channel)..."
            style="flex:1; background:#070d20; border-color:rgba(0,242,254,0.3);"
            onkeypress="if(event.key==='Enter') sendTicketMessage(state._activeChatTab||'staff')" />
          <button class="btn btn-primary btn-sm" onclick="sendTicketMessage(state._activeChatTab||'staff')"
            style="display:flex; align-items:center; gap:6px; font-weight:700; padding:0 16px;">
            📤 Send
          </button>
        </div>
      </div>`;
    } else if (isAssignedTech) {
      // TECHNICIAN VIEW: Staff channel only
      chatSectionHtml = `
      <div style="background:rgba(10,16,36,0.9); padding:16px; border-radius:12px;
                  border:1px solid rgba(168,85,247,0.3); box-shadow:0 4px 20px rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <h4 style="font-size:0.96rem; font-weight:700; margin:0; color:#c084fc; display:flex; align-items:center; gap:8px;">
            🔧 Staff Channel <span style="font-size:0.68rem;font-weight:400;color:#64748b;">(Admin & Technician)</span>
          </h4>
          <span style="font-size:0.72rem;padding:2px 9px;border-radius:9999px;background:rgba(168,85,247,0.2);color:#c084fc;font-weight:700;">● Tech Dispatch</span>
        </div>
        <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:12px;">
          Internal coordination with admin. <strong>Customer messages are kept separate and private.</strong>
        </p>
        <div id="ticketChatMessages" style="max-height:280px; min-height:120px; overflow-y:auto;
             background:#070c1d; border:1px solid rgba(168,85,247,0.2); border-radius:10px;
             padding:14px; margin-bottom:12px;">
          <div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:20px;">
            <div class="spinner" style="margin:10px auto;"></div>
            Connecting to staff chat...
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="ticketChatInput" class="form-input"
            placeholder="Reply to admin or field update..."
            style="flex:1; background:#070d20; border-color:rgba(168,85,247,0.3);"
            onkeypress="if(event.key==='Enter') sendTicketMessage('staff')" />
          <button class="btn btn-primary btn-sm" onclick="sendTicketMessage('staff')"
            style="display:flex; align-items:center; gap:6px; font-weight:700; padding:0 16px;
                   background:linear-gradient(135deg,#7c3aed,#c084fc); border:none;">
            📤 Send
          </button>
        </div>
      </div>`;
    }

    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        <div style="background:var(--bg-card); padding:14px; border-radius:8px; border:1px solid var(--border-subtle);">
          <h3 style="font-size:1.1rem; font-weight:800; color:#ffffff;">${escapeHtml(tck.title)}</h3>
          <p style="color:var(--text-secondary); font-size:0.88rem; margin-top:6px;">${escapeHtml(tck.description)}</p>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:0.85rem;">
          <div><strong>Device:</strong> <span style="color:var(--neon-cyan);">${escapeHtml(tck.deviceId)}</span> (${escapeHtml(tck.deviceModel||'')})</div>
          <div><strong>Customer:</strong> ${escapeHtml(tck.customerName)}</div>
          <div><strong>Priority:</strong> <span style="font-weight:700;">${tck.priority}</span></div>
          <div><strong>Warranty Covered:</strong> <span class="${tck.warrantyCovered ? 'warranty-badge-active' : 'warranty-badge-expired'}">${tck.warrantyCovered ? 'Yes ✅' : 'No ⚠️'}</span></div>
          <div><strong>Assigned Tech:</strong> ${escapeHtml(tck.assignedTechnician||'Pending')}</div>
          <div><strong>Status:</strong> <span class="status-pill status-online">${tck.status}</span></div>
        </div>

        ${isAdmin ? `
        <div style="background:rgba(0,242,254,0.08); padding:16px; border-radius:10px; border:1px solid rgba(0,242,254,0.25);">
          <h4 style="font-size:0.95rem; font-weight:700; margin-bottom:8px; color:var(--neon-cyan);">👤 Assign Technician</h4>
          <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:10px;">Select a field technician to assign this ticket for repair.</p>
          <div style="display:flex; gap:10px; align-items:center;">
            <select id="assignTechnicianSelect" class="form-select" style="flex:1;">
              <option value="">Select Technician...</option>
              ${(state.allUsers||state.users||[]).filter(u=>u.role==='technician').map(u=>
                `<option value="${u.id}" ${tck.assignedTechnicianId===u.id?'selected':''}>${u.fullName} (${u.location})</option>`
              ).join('')}
            </select>
            <button class="btn btn-primary btn-sm" onclick="assignTicketToTechnician()">
              ${tck.assignedTechnicianId ? '🔄 Reassign' : '📋 Assign'}
            </button>
          </div>
        </div>` : ''}

        ${chatSectionHtml}

        ${(isAdmin||isTechnician) ? `
        <div class="form-group">
          <label class="form-label">Update Ticket Status</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="advanceTicketStatus('${tck.id}','Received')">Received</button>
            <button class="btn btn-secondary btn-sm" onclick="advanceTicketStatus('${tck.id}','Diagnosing')">Diagnosing</button>
            <button class="btn btn-secondary btn-sm" onclick="advanceTicketStatus('${tck.id}','Repairing')">Repairing</button>
            <button class="btn btn-primary btn-sm" onclick="advanceTicketStatus('${tck.id}','Resolved')">Mark Resolved ✅</button>
          </div>
        </div>

        <div style="background:rgba(0,0,0,0.3); padding:16px; border-radius:10px; border:1px solid var(--border-bright);">
          <h4 style="font-size:0.95rem; font-weight:700; margin-bottom:8px; color:var(--neon-cyan);">🔩 Consume Spare Part from Inventory</h4>
          <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:10px;">
            Select a replacement part used by the technician to automatically deduct from company inventory.
          </p>
          <div style="display:flex; gap:10px;">
            <select id="ticketPartSelect" class="form-select" style="flex:2;">
              ${state.inventory.map(p=>`<option value="${p.id}">${p.name} (In Stock: ${p.stockQuantity})</option>`).join('')}
            </select>
            <input type="number" id="ticketPartQty" class="form-input" style="flex:1; min-width:60px;" value="1" min="1" max="10" />
            <button class="btn btn-secondary btn-sm" onclick="consumePartForSelectedTicket()">Deduct Part</button>
          </div>
          ${tck.partsUsed && tck.partsUsed.length > 0 ? `
            <div style="margin-top:10px; font-size:0.8rem; color:var(--neon-cyan);">
              <strong>Parts Used:</strong> ${tck.partsUsed.map(p=>`${p.quantity}x ${p.partName}`).join(', ')}
            </div>` : ''}
        </div>` : ''}
      </div>
    `;

    // Clear any previous poll
    if (state.ticketChatPollInterval) {
      clearInterval(state.ticketChatPollInterval);
      state.ticketChatPollInterval = null;
    }

    // Start the appropriate chat channel
    if (isCustomer) {
      state._activeChatTab = 'customer';
      loadTicketMessages(ticketId, false, 'customer');
      state.ticketChatPollInterval = setInterval(() => {
        if (state.selectedTicket?.id === ticketId) loadTicketMessages(ticketId, true, 'customer');
        else { clearInterval(state.ticketChatPollInterval); state.ticketChatPollInterval = null; }
      }, 3000);
    } else if (isAdmin) {
      state._activeChatTab = 'staff';
      loadTicketMessages(ticketId, false, 'staff');
      state.ticketChatPollInterval = setInterval(() => {
        if (state.selectedTicket?.id === ticketId) loadTicketMessages(ticketId, true, state._activeChatTab || 'staff');
        else { clearInterval(state.ticketChatPollInterval); state.ticketChatPollInterval = null; }
      }, 3000);
    } else if (isAssignedTech) {
      state._activeChatTab = 'staff';
      loadTicketMessages(ticketId, false, 'staff');
      state.ticketChatPollInterval = setInterval(() => {
        if (state.selectedTicket?.id === ticketId) loadTicketMessages(ticketId, true, 'staff');
        else { clearInterval(state.ticketChatPollInterval); state.ticketChatPollInterval = null; }
      }, 3000);
    }
  }

  if (modal) modal.classList.add('active');
}

function closeTicketDetailModal() {
  const modal = document.getElementById('ticketDetailModal');
  if (modal) modal.classList.remove('active');
  if (state.ticketChatPollInterval) {
    clearInterval(state.ticketChatPollInterval);
    state.ticketChatPollInterval = null;
  }
  state.selectedTicket = null;
  state._activeChatTab = null;
}

// Switch between Staff / Customer chat tabs (Admin only)
function switchTicketChatTab(tab, ticketId) {
  if (!state.selectedTicket) return;
  state._activeChatTab = tab;

  // Update tab button styles
  const staffBtn    = document.getElementById('tabStaffChat');
  const customerBtn = document.getElementById('tabCustomerChat');
  const subtitle    = document.getElementById('ticketChatSubtitle');
  const input       = document.getElementById('ticketChatInput');

  if (tab === 'staff') {
    if (staffBtn) {
      staffBtn.style.background = 'rgba(0,242,254,0.2)';
      staffBtn.style.color = '#00f2fe';
      staffBtn.style.border = '1px solid rgba(0,242,254,0.4)';
    }
    if (customerBtn) {
      customerBtn.style.background = 'rgba(255,255,255,0.04)';
      customerBtn.style.color = '#94a3b8';
      customerBtn.style.border = '1px solid rgba(255,255,255,0.12)';
    }
    if (subtitle) subtitle.textContent = 'Staff channel — coordination with assigned technician. Customers cannot see this.';
    if (input) input.placeholder = 'Reply to technician (staff channel)...';
  } else {
    if (customerBtn) {
      customerBtn.style.background = 'rgba(16,185,129,0.2)';
      customerBtn.style.color = '#34d399';
      customerBtn.style.border = '1px solid rgba(16,185,129,0.4)';
    }
    if (staffBtn) {
      staffBtn.style.background = 'rgba(255,255,255,0.04)';
      staffBtn.style.color = '#94a3b8';
      staffBtn.style.border = '1px solid rgba(255,255,255,0.12)';
    }
    if (subtitle) subtitle.textContent = 'Customer support channel — private conversation with the customer. Technicians cannot see this.';
    if (input) input.placeholder = 'Reply to customer (private support)...';
  }

  // Reload messages for the selected tab
  loadTicketMessages(ticketId, false, tab);
}

// Assign ticket to technician (Admin only)
async function assignTicketToTechnician() {
  if (!state.selectedTicket) return;
  
  const select = document.getElementById('assignTechnicianSelect');
  const technicianId = select.value;
  
  if (!technicianId) {
    showToast('Please select a technician', 'error');
    return;
  }
  
  const technician = (state.allUsers || state.users || []).find(u => u.id === technicianId);
  if (!technician) {
    showToast('Technician not found', 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/tickets/${state.selectedTicket.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        technicianId: technician.id,
        technicianName: technician.fullName 
      }),
    });
    const data = await res.json();
    
    if (data.success) {
      showToast(`✅ Ticket assigned to ${technician.fullName}!`, 'success');
      await fetchAllData();
      // Reopen modal to refresh the view
      openTicketDetailModal(state.selectedTicket.id);
    } else {
      showToast(data.error || 'Failed to assign ticket', 'error');
    }
  } catch (err) {
    console.error('Assignment error:', err);
    showToast('Network error while assigning ticket', 'error');
  }
}

// Load ticket messages — channel-aware
// channel: 'staff' (admin ↔ tech) | 'customer' (admin ↔ customer)
async function loadTicketMessages(ticketId, isSilent = false, channel = 'staff') {
  const container = document.getElementById('ticketChatMessages');
  if (!container) return;

  if (!isSilent) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:24px 16px;">
        <div class="spinner" style="margin:8px auto;"></div>
        Loading ${channel === 'customer' ? 'support' : 'staff'} messages...
      </div>
    `;
  }

  const endpoint = channel === 'customer'
    ? `${API_BASE}/tickets/${ticketId}/customer-messages?requestingRole=${encodeURIComponent(state.currentRole||'')}`
    : `${API_BASE}/tickets/${ticketId}/messages`;

  try {
    const res  = await fetch(endpoint);
    const data = await res.json();

    if (data.success) {
      const messages = data.data || [];

      if (messages.length === 0) {
        container.innerHTML = `
          <div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:30px 16px;">
            <span style="display:block;font-size:2rem;margin-bottom:8px;opacity:0.8;">💬</span>
            No messages yet. ${channel === 'customer' ? 'Send a message to reach Admin/Support!' : 'Start the staff coordination here.'}
          </div>
        `;
      } else {
        const wasScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 45;

        container.innerHTML = messages.map(msg => {
          const isCurrentUser = msg.senderId === state.currentUser?.id;
          let roleTag = '', bubbleBg = '', bubbleBorder = '';

          if (msg.senderRole === 'admin') {
            roleTag = `<span style="background:rgba(0,242,254,0.18);color:#00f2fe;padding:2px 7px;border-radius:4px;font-size:0.68rem;font-weight:700;">👑 Admin</span>`;
            bubbleBg = isCurrentUser ? 'rgba(0,242,254,0.18)' : 'rgba(0,242,254,0.10)';
            bubbleBorder = 'rgba(0,242,254,0.35)';
          } else if (msg.senderRole === 'customer') {
            roleTag = `<span style="background:rgba(16,185,129,0.18);color:#34d399;padding:2px 7px;border-radius:4px;font-size:0.68rem;font-weight:700;">🏢 Customer</span>`;
            bubbleBg = isCurrentUser ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.10)';
            bubbleBorder = 'rgba(16,185,129,0.35)';
          } else {
            roleTag = `<span style="background:rgba(168,85,247,0.18);color:#c084fc;padding:2px 7px;border-radius:4px;font-size:0.68rem;font-weight:700;">🔧 Technician</span>`;
            bubbleBg = isCurrentUser ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.10)';
            bubbleBorder = 'rgba(168,85,247,0.35)';
          }

          const textAlign   = isCurrentUser ? 'right' : 'left';
          const marginSide  = isCurrentUser ? 'margin-left:auto' : 'margin-right:auto';

          return `
            <div style="text-align:${textAlign}; margin-bottom:12px;">
              <div style="display:inline-block; max-width:82%; ${marginSide}; text-align:left;">
                <div style="display:flex; align-items:center; gap:6px; font-size:0.72rem; color:#94a3b8; margin-bottom:4px;
                            justify-content:${isCurrentUser ? 'flex-end' : 'flex-start'};">
                  <strong style="color:${isCurrentUser ? '#00f2fe' : '#ffffff'};">${isCurrentUser ? 'You' : escapeHtml(msg.senderName)}</strong>
                  ${roleTag}
                  <span style="font-size:0.65rem; color:#64748b;">${formatTimestamp(msg.createdAt)}</span>
                </div>
                <div style="background:${bubbleBg}; border:1px solid ${bubbleBorder}; padding:10px 14px;
                            border-radius:12px; font-size:0.86rem; color:#f1f5f9; word-break:break-word;
                            line-height:1.45; box-shadow:0 2px 6px rgba(0,0,0,0.25);">
                  ${escapeHtml(msg.message)}
                </div>
              </div>
            </div>
          `;
        }).join('');

        if (wasScrolledToBottom || !isSilent) container.scrollTop = container.scrollHeight;
      }
    } else {
      if (!isSilent) {
        container.innerHTML = `<div style="text-align:center; color:#f87171; font-size:0.8rem; padding:16px;">⚠️ ${escapeHtml(data.error || 'Failed to load messages')}</div>`;
      }
    }
  } catch (err) {
    if (!isSilent) {
      console.error('Load messages error:', err);
      container.innerHTML = `<div style="text-align:center; color:#f87171; font-size:0.8rem; padding:16px;">⚠️ Network error loading chat</div>`;
    }
  }
}

// Send ticket message — channel-aware
// channel: 'staff' | 'customer'
async function sendTicketMessage(channel) {
  if (!state.selectedTicket || !state.currentUser) return;

  // Resolve channel: customers always use 'customer', others use the active tab or fallback to 'staff'
  const effectiveChannel = state.currentRole === 'customer'
    ? 'customer'
    : (channel || state._activeChatTab || 'staff');

  const input   = document.getElementById('ticketChatInput');
  const message = input?.value?.trim();

  if (!message) { showToast('Please type a message', 'error'); return; }

  const endpoint = effectiveChannel === 'customer'
    ? `${API_BASE}/tickets/${state.selectedTicket.id}/customer-messages`
    : `${API_BASE}/tickets/${state.selectedTicket.id}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId:   state.currentUser.id,
        senderName: state.currentUser.fullName || state.currentUser.username,
        senderRole: state.currentUser.role,
        message
      }),
    });
    const data = await res.json();

    if (data.success) {
      if (input) input.value = '';
      await loadTicketMessages(state.selectedTicket.id, false, effectiveChannel);
      showToast('✅ Message sent!', 'success');
      // Background notification refresh
      fetch(`${API_BASE}/notifications`).then(r => r.json()).then(d => {
        if (d.success) { state.notifications = d.data; renderNotifications(); }
      }).catch(() => {});
    } else {
      showToast(data.error || 'Failed to send message', 'error');
    }
  } catch (err) {
    console.error('Send message error:', err);
    showToast('Network error while sending message', 'error');
  }
}

// Helper functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}


async function advanceTicketStatus(ticketId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, technicianNotes: `Updated to ${newStatus} by user.` }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Ticket status updated to ${newStatus}!`, 'success');
      closeTicketDetailModal();
      fetchAllData();
    }
  } catch (err) {
    showToast('Failed to update ticket status', 'error');
  }
}

async function consumePartForSelectedTicket() {
  if (!state.selectedTicket) return;
  const partId = document.getElementById('ticketPartSelect').value;
  const quantity = document.getElementById('ticketPartQty').value;

  try {
    const res = await fetch(`${API_BASE}/tickets/${state.selectedTicket.id}/use-part`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partId, quantity }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeTicketDetailModal();
      fetchAllData();
    } else {
      showToast(data.error || data.message, 'error');
    }
  } catch (err) {
    showToast('Failed to consume part', 'error');
  }
}

// Restock Inventory Modal
function openRestockModal() {
  const existing = document.getElementById('restockModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'restockModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1a1a2e);border:1px solid rgba(0,242,254,0.3);border-radius:20px;padding:30px 34px;width:100%;max-width:540px;box-shadow:0 25px 70px rgba(0,0,0,0.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h2 style="font-size:1.2rem;font-weight:800;color:#ffffff;display:flex;align-items:center;gap:8px;margin:0;">📦 Restock Inventory Shipment</h2>
        <button type="button" class="modal-close" onclick="document.getElementById('restockModalOverlay').remove()" style="font-size:1.4rem;background:none;border:none;color:#94a3b8;cursor:pointer;">&times;</button>
      </div>
      <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:18px;">
        Record newly arrived parts from suppliers to update live stock levels for Millennium SmartBoard service operations.
      </p>

      <div style="display:flex;gap:8px;margin-bottom:18px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px;">
        <button id="tabExistingPart" type="button" class="btn btn-sm btn-primary" onclick="toggleRestockMode('existing')" style="padding:6px 14px;font-weight:700;">Existing Part</button>
        <button id="tabNewPart" type="button" class="btn btn-sm btn-secondary" onclick="toggleRestockMode('new')" style="padding:6px 14px;font-weight:700;">➕ New Part Catalog</button>
      </div>

      <!-- Restock Existing Part Section -->
      <div id="restockExistingSection" style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Select Part to Restock *</label>
          <select id="restockPartSelect" class="form-input">
            <option value="">— Select an inventory item (${(state.inventory || []).length} Available) —</option>
            ${(state.inventory || []).map(p => `<option value="${p.id}">${p.partCode} — ${p.name} (Current: ${p.stockQuantity} in stock)</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Quantity to Add (Shipment Received) *</label>
          <input id="restockQuantity" class="form-input" type="number" min="1" max="1000" value="10" />
        </div>
      </div>

      <!-- Add New Part Catalog Section -->
      <div id="restockNewSection" style="display:none;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:4px;">Part Code *</label>
            <input id="newPartCode" class="form-input" placeholder="e.g. MSB-OPS-03" />
          </div>
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:4px;">Category *</label>
            <select id="newPartCategory" class="form-input">
              <option value="Module">Module</option>
              <option value="Display">Display</option>
              <option value="Power">Power</option>
              <option value="Audio">Audio</option>
              <option value="Touch">Touch Surface</option>
              <option value="Accessory">Accessory</option>
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:4px;">Part Name *</label>
          <input id="newPartName" class="form-input" placeholder="e.g. 4K Camera & Integrated Mic Array" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:4px;">Initial Quantity *</label>
            <input id="newPartStock" class="form-input" type="number" min="1" value="5" />
          </div>
          <div>
            <label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:4px;">Min Threshold</label>
            <input id="newPartThreshold" class="form-input" type="number" min="1" value="3" />
          </div>
        </div>
      </div>

      <div id="restockErrorMsg" style="color:#f43f5e;font-size:0.82rem;margin-top:10px;display:none;"></div>

      <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary" style="flex:1;min-width:80px;" onclick="document.getElementById('restockModalOverlay').remove()">Cancel</button>
        <button type="button" class="btn btn-secondary" style="flex:1.2;min-width:130px;" onclick="document.getElementById('restockModalOverlay').remove(); navigateTo('inventory');">📋 View Inventory</button>
        <button type="button" class="btn btn-primary" style="flex:1.4;min-width:150px;" onclick="submitRestockShipment()">📥 Confirm Shipment</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

function toggleRestockMode(mode) {
  const existingSection = document.getElementById('restockExistingSection');
  const newSection = document.getElementById('restockNewSection');
  const tabExisting = document.getElementById('tabExistingPart');
  const tabNew = document.getElementById('tabNewPart');
  const errEl = document.getElementById('restockErrorMsg');
  if (errEl) errEl.style.display = 'none';

  if (mode === 'existing') {
    if (existingSection) existingSection.style.display = 'flex';
    if (newSection) newSection.style.display = 'none';
    if (tabExisting) { tabExisting.className = 'btn btn-sm btn-primary'; }
    if (tabNew) { tabNew.className = 'btn btn-sm btn-secondary'; }
  } else {
    if (existingSection) existingSection.style.display = 'none';
    if (newSection) newSection.style.display = 'flex';
    if (tabExisting) { tabExisting.className = 'btn btn-sm btn-secondary'; }
    if (tabNew) { tabNew.className = 'btn btn-sm btn-primary'; }
  }
}

async function submitRestockShipment() {
  const errEl = document.getElementById('restockErrorMsg');
  const isExisting = document.getElementById('restockExistingSection')?.style.display !== 'none';

  if (isExisting) {
    const partSelect = document.getElementById('restockPartSelect');
    const partId = partSelect?.value;
    const addQty = parseInt(document.getElementById('restockQuantity')?.value, 10);

    if (!partId) {
      if (errEl) { errEl.textContent = 'Please select a part to restock.'; errEl.style.display = 'block'; }
      return;
    }
    if (!addQty || addQty < 1) {
      if (errEl) { errEl.textContent = 'Please enter a valid quantity of 1 or more.'; errEl.style.display = 'block'; }
      return;
    }

    const part = (state.inventory || []).find(p => p.id === partId);
    if (!part) {
      if (errEl) { errEl.textContent = 'Part record not found in inventory.'; errEl.style.display = 'block'; }
      return;
    }

    const newTotal = (part.stockQuantity || 0) + addQty;

    try {
      const res = await fetch(`${API_BASE}/inventory/${partId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQuantity: newTotal }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ Added +${addQty} units to ${part.name} (Total: ${newTotal})`, 'success');
        document.getElementById('restockModalOverlay')?.remove();
        await fetchAllData();
      } else {
        if (errEl) { errEl.textContent = data.error || 'Failed to update inventory stock.'; errEl.style.display = 'block'; }
      }
    } catch (err) {
      if (errEl) { errEl.textContent = 'Network error while restocking.'; errEl.style.display = 'block'; }
    }
  } else {
    // New catalog item
    const partCode = document.getElementById('newPartCode')?.value?.trim();
    const name = document.getElementById('newPartName')?.value?.trim();
    const category = document.getElementById('newPartCategory')?.value;
    const stockQuantity = parseInt(document.getElementById('newPartStock')?.value, 10) || 5;
    const minThreshold = parseInt(document.getElementById('newPartThreshold')?.value, 10) || 3;

    if (!partCode || !name || !category) {
      if (errEl) { errEl.textContent = 'Part code, name, and category are required.'; errEl.style.display = 'block'; }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partCode, name, category, stockQuantity, minThreshold, unitCost: 0 }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ New part "${name}" registered with ${stockQuantity} units!`, 'success');
        document.getElementById('restockModalOverlay')?.remove();
        await fetchAllData();
      } else {
        if (errEl) { errEl.textContent = data.error || 'Failed to register new part.'; errEl.style.display = 'block'; }
      }
    } catch (err) {
      if (errEl) { errEl.textContent = 'Network error while registering part.'; errEl.style.display = 'block'; }
    }
  }
}

// Anomaly Simulator Modal
function openAnomalySimulatorModal() {
  const modal = document.getElementById('anomalySimulatorModal');
  const devSelect = document.getElementById('anomalyDeviceSelect');
  if (devSelect) {
    devSelect.innerHTML = state.devices.map((d) => `<option value="${d.id}">${d.id} - ${d.model} (${d.customerName})</option>`).join('');
  }
  if (modal) modal.classList.add('active');
}

function closeAnomalySimulatorModal() {
  const modal = document.getElementById('anomalySimulatorModal');
  if (modal) modal.classList.remove('active');
}

async function submitAnomalySimulation() {
  const deviceId = document.getElementById('anomalyDeviceSelect').value;
  const tempSpike = document.getElementById('anomalyTempInput').value;
  const restartSpike = document.getElementById('anomalyRestartInput').value;

  try {
    const res = await fetch(`${API_BASE}/predictive/simulate-telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, temperatureSpike: tempSpike, restartSpike }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      closeAnomalySimulatorModal();
      fetchAllData();
      state.currentTab = 'predictive';
      renderApp();
    }
  } catch (err) {
    showToast('Failed to inject anomaly', 'error');
  }
}

// Preventive Ticket Creator from Alert
async function createPreventiveTicketFromAlert(deviceId, riskFactor) {
  try {
    const res = await fetch(`${API_BASE}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        title: `AI Predictive Alert: ${riskFactor}`,
        description: 'Auto-generated preventive service ticket by AI telemetry health monitor before customer complaint.',
        category: 'OPS Hardware',
        priority: 'High',
        assignedTechnician: 'John Santos (Senior Tech)',
      }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Preventive Ticket ${data.data.ticketNumber} created & assigned to John!`, 'success');
      fetchAllData();
      state.currentTab = 'tickets';
      renderApp();
    }
  } catch (err) {
    showToast('Failed to create preventive ticket', 'error');
  }
}

// Warranty Verification from Input
async function verifyWarrantyFromInput() {
  const input = document.getElementById('warrantyCheckInput');
  const resultBox = document.getElementById('warrantyCheckResult');
  if (!input || !resultBox) return;

  const id = input.value.trim();
  if (!id) {
    showToast('Please enter a Device ID', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/warranties/check/${id}`);
    const data = await res.json();
    if (data.success) {
      const w = data.data;
      resultBox.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 18px; border-radius: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="color: #34d399; font-size: 1.15rem; font-weight: 800;">VERIFIED: UNDER WARRANTY ✅</h3>
            <span class="status-pill status-online">${w.daysRemaining} Days Remaining</span>
          </div>
          <div style="font-size: 0.88rem; margin-top: 8px; color: #ffffff;">
            Device: <strong>${w.deviceId}</strong> (${w.deviceModel}) | Client: <strong>${w.customerName}</strong>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
            Coverage: ${w.coverageType} (Expires on ${w.expiryDate})
          </div>
        </div>
      `;
    } else {
      resultBox.innerHTML = `
        <div style="background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.4); padding: 18px; border-radius: 12px;">
          <h3 style="color: #fb7185; font-size: 1.15rem; font-weight: 800;">WARRANTY EXPIRED OR NOT FOUND ⚠️</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
            Device ID "${id}" is either beyond its 2-year warranty window or unregistered. On-site repairs are billable.
          </p>
        </div>
      `;
    }
  } catch (err) {
    showToast('Error checking warranty', 'error');
  }
}

// CMS Operations
async function toggleCmsItem(id) {
  try {
    const res = await fetch(`${API_BASE}/cms/${id}/toggle`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      showToast('CMS status toggled!', 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Failed to toggle CMS', 'error');
  }
}

async function deleteCmsItem(id) {
  if (!confirm('Are you sure you want to delete this broadcast?')) return;
  try {
    const res = await fetch(`${API_BASE}/cms/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('CMS broadcast removed', 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Failed to delete CMS item', 'error');
  }
}

function openCreateCmsModal() {
  const modal = document.getElementById('createCmsModal');
  if (modal) modal.classList.add('active');
}

function closeCreateCmsModal() {
  const modal = document.getElementById('createCmsModal');
  if (modal) modal.classList.remove('active');
}

async function submitCmsForm(e) {
  e.preventDefault();
  const title = document.getElementById('cmsTitleInput').value;
  const type = document.getElementById('cmsTypeSelect').value;
  const content = document.getElementById('cmsContentInput').value;
  const targetAudience = document.getElementById('cmsTargetSelect').value;

  try {
    const res = await fetch(`${API_BASE}/cms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type, content, targetAudience }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Broadcast published to Millennium boards!', 'success');
      closeCreateCmsModal();
      fetchAllData();
    }
  } catch (err) {
    showToast('Failed to publish CMS', 'error');
  }
}

// Quick Stock Adjust
async function quickAdjustStock(partId, newStock) {
  try {
    const res = await fetch(`${API_BASE}/inventory/${partId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockQuantity: newStock }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Stock updated to ${newStock} units!`, 'success');
      fetchAllData();
    }
  } catch (err) {
    showToast('Failed to adjust stock', 'error');
  }
}

// Register Board Modal
function openRegisterModal() {
  const modal = document.getElementById('registerDeviceModal');
  if (!modal) return;

  const select = document.getElementById('regCustomerSelect');
  const customInput = document.getElementById('regCustomerInput');
  if (select) {
    const customers = state.customers || [];
    
    // Group customers by type for better organization
    const schools = customers.filter(c => c.clientType === 'school');
    const corporates = customers.filter(c => c.clientType === 'corporate');
    
    select.innerHTML = `
      <option value="">— Select Customer / Organization (${customers.length} Available) —</option>
      ${schools.length > 0 ? `<optgroup label="🏫 Schools & Universities (${schools.length})">
        ${schools.map(c => `<option value="${c.id}">${c.organizationName} — ${c.city || 'Metro Manila'}</option>`).join('')}
      </optgroup>` : ''}
      ${corporates.length > 0 ? `<optgroup label="🏢 Corporate Clients (${corporates.length})">
        ${corporates.map(c => `<option value="${c.id}">${c.organizationName} — ${c.city || 'Metro Manila'}</option>`).join('')}
      </optgroup>` : ''}
      <option value="__custom__">➕ Register New Customer Organization...</option>
    `;
    select.value = '';
  }
  if (customInput) {
    customInput.value = '';
    customInput.style.display = 'none';
    customInput.required = false;
  }

  modal.classList.add('active');
  
  // Show success message to confirm customers loaded
  if (state.customers && state.customers.length > 0) {
    showToast(`📋 ${state.customers.length} customer organizations loaded successfully`, 'info');
  }
}

function handleRegCustomerSelectChange() {
  const select = document.getElementById('regCustomerSelect');
  const customInput = document.getElementById('regCustomerInput');
  const clientTypeSelect = document.getElementById('regClientTypeSelect');
  const cityInput = document.getElementById('regCityInput');

  if (!select) return;

  if (select.value === '__custom__') {
    if (customInput) {
      customInput.style.display = 'block';
      customInput.required = true;
      customInput.focus();
    }
    showToast('📝 Enter a new customer organization name to register', 'info');
  } else {
    if (customInput) {
      customInput.style.display = 'none';
      customInput.required = false;
      customInput.value = '';
    }
    if (select.value) {
      const cust = (state.customers || []).find(c => c.id === select.value);
      if (cust) {
        if (clientTypeSelect) clientTypeSelect.value = cust.clientType;
        if (cityInput && cust.city) cityInput.value = cust.city;
        showToast(`✅ Selected: ${cust.organizationName} (${cust.clientType === 'school' ? '🏫 School' : '🏢 Corporate'})`, 'success');
      }
    }
  }
}

function closeRegisterModal() {
  const modal = document.getElementById('registerDeviceModal');
  if (modal) modal.classList.remove('active');
}

async function submitRegisterDeviceForm(e) {
  e.preventDefault();
  const model = document.getElementById('regModelSelect')?.value;
  const custSelect = document.getElementById('regCustomerSelect')?.value;
  const customName = document.getElementById('regCustomerInput')?.value?.trim();
  const clientType = document.getElementById('regClientTypeSelect')?.value;
  const location = document.getElementById('regLocationInput')?.value?.trim();
  const city = document.getElementById('regCityInput')?.value?.trim();

  let customerId = '';
  let customerName = '';

  if (custSelect && custSelect !== '__custom__') {
    customerId = custSelect;
    const cust = (state.customers || []).find(c => c.id === custSelect);
    customerName = cust ? cust.organizationName : '';
  } else {
    customerName = customName;
  }

  if (!customerName && !customerId) {
    showToast('Please select or enter a Customer Organization.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, customerId, customerName, clientType, location, city }),
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ SmartBoard ${data.data.id} registered and connected to ${data.data.customerName}!`, 'success');
      closeRegisterModal();
      await fetchAllData();
    } else {
      showToast(`❌ ${data.error || 'Failed to register device.'}`, 'error');
    }
  } catch (err) {
    showToast('Network error. Failed to register device.', 'error');
  }
}

// Export Analytics Summary

// ==========================================================================
// WARRANTY SCANNER MODULE — Camera QR/Barcode Scanner & Validation
// ==========================================================================

let html5QrCode = null;   // Global scanner instance
let scannerCameras = [];  // Cameras discovered on this device
let scannerHandlingResult = false; // Debounce: one result per scan

/** True when the html5-qrcode library actually loaded (it is CDN-hosted). */
function isScannerLibraryAvailable() {
  return typeof Html5Qrcode !== 'undefined' && typeof Html5QrcodeSupportedFormats !== 'undefined';
}

/** Human-readable camera error. */
function describeCameraError(err) {
  const name = (err && (err.name || err.code)) ? String(err.name || err.code) : '';
  const msg = String((err && err.message) || err || '');
  const probe = (name + ' ' + msg).toLowerCase();

  if (probe.includes('notallowed') || probe.includes('permission')) {
    return 'Camera permission was denied. Allow camera access in your browser, then try again.';
  }
  if (probe.includes('notfound') || probe.includes('devicesnotfound') || probe.includes('no camera')) {
    return 'No camera found on this device. Use "Upload Image" or type the serial number instead.';
  }
  if (probe.includes('notreadable') || probe.includes('trackstarterror')) {
    return 'The camera is already in use by another app or tab. Close it and try again.';
  }
  if (probe.includes('insecure') || probe.includes('securityerror') || probe.includes('https')) {
    return 'Camera access needs a secure (https) connection or localhost. Use "Upload Image" instead.';
  }
  return 'Unable to start the camera. Use "Upload Image" or type the serial number instead.';
}

// Open Warranty Scanner Modal
function openWarrantyScannerModal() {
  const modal = document.getElementById('warrantyScannerModal');
  if (modal) {
    modal.classList.add('active');
    // Reset to initial state
    resetWarrantyScanner();
  }
}

// Close Warranty Scanner Modal
function closeWarrantyScannerModal() {
  const modal = document.getElementById('warrantyScannerModal');
  if (modal) {
    // Stop scanner if running
    if (html5QrCode && html5QrCode.isScanning) {
      stopWarrantyScanner();
    }
    modal.classList.remove('active');
  }
}

// Reset Scanner to Initial State
function resetWarrantyScanner() {
  // Stop scanner if running
  if (html5QrCode && html5QrCode.isScanning) {
    stopWarrantyScanner();
  }
  
  // Show instructions, hide camera and results
  document.getElementById('scannerInstructions').style.display = 'block';
  document.getElementById('scannerCameraView').style.display = 'none';
  document.getElementById('scannerResults').style.display = 'none';
  
  // Clear manual input
  const manualInput = document.getElementById('manualSerialInput');
  if (manualInput) manualInput.value = '';
}

// Start Camera Scanner
async function startWarrantyScanner() {
  const instructionsDiv = document.getElementById('scannerInstructions');
  const cameraDiv = document.getElementById('scannerCameraView');

  // The library is loaded from a CDN — if it is blocked/offline, fail clearly
  // instead of throwing a ReferenceError and leaving a blank modal.
  if (!isScannerLibraryAvailable()) {
    updateScannerStatus('❌ Scanner library failed to load (offline?).', 'error');
    showToast('Scanner library unavailable. Check your connection, or use "Upload Image" / manual entry.', 'error');
    return;
  }

  // Hide instructions, show camera view
  instructionsDiv.style.display = 'none';
  cameraDiv.style.display = 'block';

  try {
    // Initialize scanner if not already created
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("qrReaderContainer");
    }

    // Configure scanner for multiple formats
    const config = {
      fps: 10,
      qrbox: { width: 300, height: 300 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
    };

    // Desktop machines can have several cameras; default to the rear/environment
    // one, and fall back to whatever is available if that is not offered.
    let cameraConfig = { facingMode: "environment" };
    try {
      scannerCameras = await Html5Qrcode.getCameras();
      if (scannerCameras && scannerCameras.length) {
        const rear = scannerCameras.find(c => /back|rear|environment/i.test(c.label || ''));
        cameraConfig = (rear || scannerCameras[scannerCameras.length - 1]).id;
      }
    } catch {
      // Enumeration can fail (e.g. permission not yet granted) — keep facingMode.
    }

    // Start scanning
    await html5QrCode.start(
      cameraConfig,
      config,
      onScanSuccess,
      onScanFailure
    );
    
    const camLabel = Array.isArray(scannerCameras) && scannerCameras.length > 1
      ? ` (${scannerCameras.length} cameras detected)`
      : '';
    updateScannerStatus('🔍 Scanning... Point camera at QR code or barcode' + camLabel, 'scanning');
    
  } catch (err) {
    console.error('Failed to start scanner:', err);
    const friendly = describeCameraError(err);
    updateScannerStatus('❌ ' + friendly, 'error');
    showToast(friendly, 'error');

    // Return to the instructions panel so the alternative methods stay reachable.
    setTimeout(() => {
      resetWarrantyScanner();
    }, 2600);
  }
}

// Stop Camera Scanner
async function stopWarrantyScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
  }
}

// Scanner Success Callback
function onScanSuccess(decodedText, decodedResult) {
  // Guard against the callback firing more than once for the same frame.
  if (scannerHandlingResult) return;
  scannerHandlingResult = true;

  console.log('Scan successful:', decodedText);

  // Stop scanner immediately
  stopWarrantyScanner();

  // Update status
  updateScannerStatus('✅ Code detected! Validating warranty...', 'success');

  // Validate the scanned code
  Promise.resolve(validateWarrantyBySerial(decodedText)).finally(() => {
    scannerHandlingResult = false;
  });
}

// Scanner Failure Callback (for logging, not errors)
function onScanFailure(error) {
  // This is called continuously while scanning, ignore
  // Only log actual errors, not "No QR code found"
  if (!error.includes('NotFoundException')) {
    console.warn('Scan error:', error);
  }
}

// Update Scanner Status Display
function updateScannerStatus(message, type = 'scanning') {
  const statusDiv = document.getElementById('scannerStatus');
  if (!statusDiv) return;
  
  const iconMap = {
    scanning: '🔍',
    success: '✅',
    error: '❌',
  };
  
  const icon = iconMap[type] || '🔍';
  statusDiv.innerHTML = `
    <span class="scanner-status-icon">${icon}</span>
    <span class="scanner-status-text">${message}</span>
  `;
  
  statusDiv.className = `scanner-status scanner-status-${type}`;
}

// Validate Manual Serial Input
function validateManualSerial() {
  const input = document.getElementById('manualSerialInput');
  const serialNumber = input?.value?.trim();
  
  if (!serialNumber) {
    showToast('Please enter a serial number', 'error');
    return;
  }
  
  // Hide instructions, show results
  document.getElementById('scannerInstructions').style.display = 'none';
  document.getElementById('scannerResults').style.display = 'block';
  
  // Validate the serial number
  validateWarrantyBySerial(serialNumber);
}

// Trigger File Input for Barcode Image Upload
function triggerBarcodeImageUpload() {
  const fileInput = document.getElementById('barcodeImageInput');
  if (!fileInput) {
    showToast('Upload control is unavailable. Type the serial number instead.', 'error');
    return;
  }
  // Allow re-selecting the same file twice in a row (change would not fire otherwise).
  fileInput.value = '';
  fileInput.click();
}

// Handle Barcode Image Upload
function handleBarcodeImageUpload(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;

  if (!file) {
    return;
  }

  const statusDiv = document.getElementById('imageScanStatus');
  const imagePreviewArea = document.getElementById('imagePreviewArea');
  const uploadedImage = document.getElementById('uploadedBarcodeImage');

  // Validate file type — accept by MIME, and fall back to extension because some
  // Android/Windows pickers report an empty file.type.
  const looksLikeImage = (file.type && file.type.startsWith('image/')) ||
    /\.(png|jpe?g|gif|bmp|webp|heic|heif)$/i.test(file.name || '');
  if (!looksLikeImage) {
    showToast('Please upload a valid image file', 'error');
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--danger);">❌ That file is not an image.</span>';
    }
    return;
  }

  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image file is too large. Maximum size is 10MB', 'error');
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--danger);">❌ Image is larger than 10MB.</span>';
    }
    return;
  }

  // Read and display image
  const reader = new FileReader();

  reader.onload = function (e) {
    if (uploadedImage && imagePreviewArea) {
      uploadedImage.src = e.target.result;
      imagePreviewArea.style.display = 'block';
      if (statusDiv) {
        statusDiv.textContent = 'Image uploaded. Click "Scan Image" to decode barcode.';
        statusDiv.style.color = 'var(--text-secondary)';
      }
      showToast('Image uploaded successfully', 'success');
    } else {
      showToast('Image preview is unavailable on this page.', 'error');
    }
  };

  reader.onerror = function () {
    showToast('Failed to read image file', 'error');
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--danger);">❌ Could not read that image file.</span>';
    }
  };

  reader.readAsDataURL(file);
}

// Clear Uploaded Image
function clearUploadedImage() {
  const imagePreviewArea = document.getElementById('imagePreviewArea');
  const uploadedImage = document.getElementById('uploadedBarcodeImage');
  const fileInput = document.getElementById('barcodeImageInput');
  const statusDiv = document.getElementById('imageScanStatus');
  
  if (imagePreviewArea) {
    imagePreviewArea.style.display = 'none';
  }
  
  if (uploadedImage) {
    uploadedImage.src = '';
  }
  
  if (fileInput) {
    fileInput.value = '';
  }
  
  if (statusDiv) {
    statusDiv.textContent = '';
  }
}

// Scan Uploaded Barcode Image
async function scanUploadedImage() {
  const uploadedImage = document.getElementById('uploadedBarcodeImage');
  const statusDiv = document.getElementById('imageScanStatus');

  if (!uploadedImage || !uploadedImage.src) {
    showToast('No image to scan', 'error');
    return;
  }

  // The decoding library is CDN-hosted — degrade gracefully if it never loaded.
  if (!isScannerLibraryAvailable()) {
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--danger);">❌ Scanner library failed to load (offline?). Type the serial number instead.</span>';
    }
    showToast('Scanner library unavailable. Check your connection, or type the serial number manually.', 'error');
    return;
  }

  // Update status
  if (statusDiv) {
    statusDiv.innerHTML = '<span style="color: var(--primary);">🔍 Scanning image for barcode...</span>';
  }

  const imageFile = document.getElementById('barcodeImageInput')?.files?.[0] || null;
  const decode = await decodeBarcodeFromImage(uploadedImage.src, imageFile);

  if (decode.text) {
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--success);">✅ Barcode detected! Validating warranty...</span>';
    }
    showToast('Barcode detected successfully', 'success');

    // Hide instructions, show results
    document.getElementById('scannerInstructions').style.display = 'none';
    document.getElementById('scannerResults').style.display = 'block';

    validateWarrantyBySerial(decode.text);
    return;
  }

  // All methods failed
  if (statusDiv) {
    statusDiv.innerHTML = '<span style="color: var(--danger);">❌ No barcode detected in image. Try a clearer image or use camera scanner.</span>';
  }
  showToast('No barcode found in image. Please try a clearer image or use the camera scanner.', 'error');
}

/**
 * Decode a barcode/QR from a still image.
 *
 * Tries, in order:
 *   1. scanFileV2 with the raw File  (best quality, auto-detects format)
 *   2. scanFileV2 with a downscaled canvas  (very large photos fail on iOS)
 *   3. scanFile with the FileReference/URL  (older API surface)
 *
 * Always resolves — never throws — so the caller can show one clear error.
 * Returns { text: string|null, method: string|null }.
 */
async function decodeBarcodeFromImage(imageSrc, imageFile) {
  const attempts = [];

  // -- 1) Native file handle -------------------------------------------------
  if (imageFile && typeof imageFile === 'object') {
    attempts.push({
      method: 'scanFileV2(file)',
      run: async (scanner) => {
        const res = await scanner.scanFileV2(imageFile, /* showImage */ false);
        return res && res.decodedText;
      },
    });
  }

  // -- 2) Downscaled canvas (phone photos can be 12MP+, which stalls the WASM
  //       decoder). 1600px keeps thin 1D barcode bars resolvable; going lower
  //       makes CODE128 stripes bleed into each other and decode as nothing.
  attempts.push({
    method: 'scanFileV2(downscaled)',
    run: async (scanner) => {
      const scaled = await downscaleImageToDataUrl(imageSrc, 1600);
      if (!scaled) throw new Error('Could not downscale image');
      const res = await scanner.scanFileV2(scaled, false);
      return res && res.decodedText;
    },
  });

  // -- 3) Upscaled + contrast-boosted (small/blurry barcode crops) -----------
  attempts.push({
    method: 'scanFileV2(enhanced)',
    run: async (scanner) => {
      const enhanced = await enhanceImageForBarcode(imageSrc);
      if (!enhanced) throw new Error('Could not enhance image');
      const res = await scanner.scanFileV2(enhanced, false);
      return res && res.decodedText;
    },
  });

  // -- 4) Legacy URL-based API ----------------------------------------------
  attempts.push({
    method: 'scanFile(src)',
    run: async (scanner) => scanner.scanFile(imageSrc, false),
  });

  for (const attempt of attempts) {
    let scanner = null;
    let host = null;
    try {
      // The scanner renders into the element it is given. `#qrReaderContainer`
      // lives inside #scannerCameraView, which is display:none during upload —
      // a zero-size host makes the decoder fail. Use a real offscreen host.
      host = createOffscreenScannerHost();
      scanner = new Html5Qrcode(host.id);
      const text = await attempt.run(scanner);
      if (text) return { text: String(text), method: attempt.method };
    } catch (err) {
      console.warn(`Image scan attempt "${attempt.method}" failed:`, err);
    } finally {
      try { if (scanner) scanner.clear(); } catch { /* element already cleared */ }
      try { if (host) host.remove(); } catch { /* already gone */ }
    }
  }

  return { text: null, method: null };
}

/**
 * A real, rendered, but off-screen element for the decoder to draw into.
 * Giving Html5Qrcode a hidden/zero-size node is what silently produced
 * "No barcode detected" on every upload.
 */
function createOffscreenScannerHost() {
  const host = document.createElement('div');
  host.id = 'qrReaderOffscreen-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:480px;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(host);
  return host;
}

/**
 * Normalise and enlarge an image for stubborn barcodes: grayscale + contrast
 * stretch, then scale so the shorter edge is ~800px. Helps small, dim, or
 * slightly blurred captures that the raw decode misses.
 */
function enhanceImageForBarcode(src, maxEdge) {
  maxEdge = maxEdge || 1800;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function () {
      try {
        const scale = Math.min(Math.max(1, maxEdge / Math.max(img.width, img.height)), 4);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        let min = 255;
        let max = 0;
        for (let i = 0; i < px.length; i += 4) {
          const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
          px[i] = px[i + 1] = px[i + 2] = lum;
          if (lum < min) min = lum;
          if (lum > max) max = lum;
        }
        // Stretch the histogram to pure black/white for maximum bar contrast.
        const range = Math.max(1, max - min);
        const midpoint = (min + max) / 2;
        for (let i = 0; i < px.length; i += 4) {
          const boosted = ((px[i] - midpoint) * (255 / range)) + 127.5;
          const v = boosted < 0 ? 0 : boosted > 255 ? 255 : boosted | 0;
          px[i] = px[i + 1] = px[i + 2] = v;
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Enhance failed:', err);
        resolve(null);
      }
    };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

/** Downscale an image to a max edge length and return a PNG data URL. */
function downscaleImageToDataUrl(src, maxEdge) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function () {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Downscale failed:', err);
        resolve(null);
      }
    };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

// --- Scanned-payload parsing -----------------------------------------------
// A scanned string is not always a bare serial number. Device QR codes encode a
// full URL such as:
//   https://millennium-smartboard.local/device/MIL-2026-00788?serial=SN-MIL86-2026-00788&customer=QCU
// Comparing that whole string against serialNumber/id never matches, which is
// why scanning a device QR used to always fail. Extract the identifying token.
function extractScannableToken(text) {
  let candidate = String(text == null ? '' : text).trim();
  if (!candidate) return '';

  // 1) Explicit query parameter, most reliable: ?serial= / &sn= / &device= / &id=
  const queryMatch = candidate.match(/[?&](?:serial|serial_number|sn|device|device_id|id)=([^&#]+)/i);
  if (queryMatch) return decodeURIComponent(queryMatch[1]).trim();

  // 2) .../device/<ID> path segment
  const pathMatch = candidate.match(/\/device\/([^/?#]+)/i);
  if (pathMatch) return decodeURIComponent(pathMatch[1]).trim();

  // 3) Last path segment of any URL (covers /warranty/<ID> style payloads)
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    const parts = candidate.split(/[?#]/)[0].split('/').filter(Boolean);
    if (parts.length > 1) return decodeURIComponent(parts[parts.length - 1]).trim();
  }

  // 4) Plain serial / barcode text
  return candidate;
}

/**
 * Find a device from a scanned payload.
 * Tries exact id/serial first, then a tolerant substring match, so partially
 * printed codes and case differences still resolve.
 */
function findDeviceByScannedCode(rawCode, devices) {
  const list = devices || [];
  const token = extractScannableToken(rawCode);
  if (!token) return null;

  const t = token.toLowerCase();
  const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();

  // Exact matches win.
  let hit = list.find((d) => norm(d.id) === t || norm(d.serialNumber) === t);
  if (hit) return hit;

  // Tolerant: either side may be a prefix/suffix of the other.
  hit = list.find((d) => {
    const id = norm(d.id);
    const sn = norm(d.serialNumber);
    return (id && (id.includes(t) || t.includes(id))) || (sn && (sn.includes(t) || t.includes(sn)));
  });
  return hit || null;
}

// Validate Warranty by Serial Number or Device ID
async function validateWarrantyBySerial(serialNumber) {
  const resultsDiv = document.getElementById('warrantyValidationDisplay');
  if (!resultsDiv) return;

  // Pull the identifying token out of whatever was scanned (URL, QR, barcode, text).
  const scannedToken = extractScannableToken(serialNumber);

  // Show loading state
  resultsDiv.innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div class="spinner" style="margin: 0 auto 20px;"></div>
      <p style="color: var(--text-secondary);">Validating warranty coverage...</p>
    </div>
  `;
  
  // Hide camera, show results
  document.getElementById('scannerCameraView').style.display = 'none';
  document.getElementById('scannerResults').style.display = 'block';
  
  try {
    // First, try to find device by serial number / id
    let device = findDeviceByScannedCode(scannedToken, state.devices);
    
    // If not found in local state, fetch from API
    if (!device) {
      const response = await fetch(`${API_BASE}/devices`);
      const data = await response.json();
      if (data.success && data.data) {
        device = findDeviceByScannedCode(scannedToken, data.data);
      }
    }
    
    if (!device) {
      displayWarrantyNotFound(scannedToken);
      return;
    }
    
    // Find warranty for this device
    let warranty = state.warranties.find(w => w.deviceId === device.id);
    
    // If not found in local state, fetch from API
    if (!warranty) {
      const response = await fetch(`${API_BASE}/warranties`);
      const data = await response.json();
      if (data.success && data.data) {
        warranty = data.data.find(w => w.deviceId === device.id);
      }
    }
    
    if (!warranty) {
      displayNoWarrantyRecord(device);
      return;
    }
    
    // Calculate warranty details
    const warrantyDetails = calculateWarrantyDetails(warranty, device);
    
    // Display warranty information
    displayWarrantyResults(warrantyDetails);
    
  } catch (error) {
    console.error('Warranty validation error:', error);
    resultsDiv.innerHTML = `
      <div class="validation-result validation-error">
        <div style="font-size: 3rem; margin-bottom: 10px;">❌</div>
        <h3 style="color: var(--error); margin-bottom: 10px;">Validation Error</h3>
        <p style="color: var(--text-secondary);">
          Unable to validate warranty. Please check your connection and try again.
        </p>
      </div>
    `;
    showToast('Failed to validate warranty', 'error');
  }
}

// Calculate Warranty Details including Days Remaining
function calculateWarrantyDetails(warranty, device) {
  const today = new Date();
  const purchaseDate = new Date(warranty.purchaseDate);
  const expiryDate = new Date(warranty.expiryDate);
  
  // Calculate days remaining
  const timeDiff = expiryDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  // Calculate total warranty days
  const totalWarrantyDays = Math.ceil((expiryDate.getTime() - purchaseDate.getTime()) / (1000 * 3600 * 24));
  
  // Calculate days elapsed
  const daysElapsed = Math.ceil((today.getTime() - purchaseDate.getTime()) / (1000 * 3600 * 24));
  
  // Calculate percentage remaining
  const percentageRemaining = Math.max(0, Math.min(100, (daysRemaining / totalWarrantyDays) * 100));
  
  // Determine warranty status
  let status = 'Under Warranty';
  let statusColor = 'success';
  let statusIcon = '✅';
  
  if (daysRemaining < 0) {
    status = 'Warranty Expired';
    statusColor = 'error';
    statusIcon = '❌';
  } else if (daysRemaining <= 30) {
    status = 'Expiring Soon';
    statusColor = 'warning';
    statusIcon = '⚠️';
  }
  
  // Format dates
  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };
  
  return {
    warranty,
    device,
    daysRemaining,
    daysElapsed,
    totalWarrantyDays,
    percentageRemaining: percentageRemaining.toFixed(1),
    status,
    statusColor,
    statusIcon,
    purchaseDateFormatted: formatDate(purchaseDate),
    expiryDateFormatted: formatDate(expiryDate),
    todayFormatted: formatDate(today),
    isValid: daysRemaining >= 0,
  };
}

// Display Warranty Validation Results
function displayWarrantyResults(details) {
  const resultsDiv = document.getElementById('warrantyValidationDisplay');
  if (!resultsDiv) return;
  
  const {
    warranty,
    device,
    daysRemaining,
    daysElapsed,
    totalWarrantyDays,
    percentageRemaining,
    status,
    statusColor,
    statusIcon,
    purchaseDateFormatted,
    expiryDateFormatted,
    todayFormatted,
    isValid
  } = details;
  
  // Calculate months and years remaining
  const monthsRemaining = Math.floor(daysRemaining / 30);
  const yearsRemaining = Math.floor(daysRemaining / 365);
  
  let timeRemainingText = '';
  if (daysRemaining < 0) {
    const daysExpired = Math.abs(daysRemaining);
    timeRemainingText = `Expired ${daysExpired} day${daysExpired !== 1 ? 's' : ''} ago`;
  } else if (yearsRemaining > 0) {
    const remainingMonths = monthsRemaining % 12;
    timeRemainingText = `${yearsRemaining} year${yearsRemaining !== 1 ? 's' : ''}`;
    if (remainingMonths > 0) {
      timeRemainingText += `, ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
    }
  } else if (monthsRemaining > 0) {
    const remainingDays = daysRemaining % 30;
    timeRemainingText = `${monthsRemaining} month${monthsRemaining !== 1 ? 's' : ''}`;
    if (remainingDays > 0) {
      timeRemainingText += `, ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`;
    }
  } else {
    timeRemainingText = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;
  }
  
  resultsDiv.innerHTML = `
    <div class="validation-result validation-${statusColor}">
      <!-- Status Header -->
      <div style="text-align: center; padding: 20px; border-bottom: 1px solid var(--border);">
        <div style="font-size: 4rem; margin-bottom: 10px;">${statusIcon}</div>
        <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--${statusColor === 'success' ? 'primary' : statusColor === 'warning' ? 'warning' : 'error'}); margin-bottom: 5px;">
          ${status}
        </h3>
        <p style="font-size: 0.9rem; color: var(--text-secondary);">
          ${isValid ? timeRemainingText + ' remaining' : timeRemainingText}
        </p>
      </div>
      
      <!-- Device Information -->
      <div style="padding: 20px; background: rgba(0, 0, 0, 0.2); border-radius: 8px; margin: 20px 0;">
        <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted); margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">
          📱 Device Information
        </h4>
        <div class="warranty-info-grid">
          <div class="warranty-info-item">
            <span class="warranty-info-label">Device ID:</span>
            <span class="warranty-info-value">${device.id}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Serial Number:</span>
            <span class="warranty-info-value">${device.serialNumber}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Model:</span>
            <span class="warranty-info-value">${device.model}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Customer:</span>
            <span class="warranty-info-value">${device.customerName}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Location:</span>
            <span class="warranty-info-value">${device.location}, ${device.city}</span>
          </div>
        </div>
      </div>
      
      <!-- Warranty Coverage Details -->
      <div style="padding: 20px; background: rgba(0, 0, 0, 0.2); border-radius: 8px; margin: 20px 0;">
        <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted); margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">
          📅 Warranty Coverage
        </h4>
        <div class="warranty-info-grid">
          <div class="warranty-info-item">
            <span class="warranty-info-label">Contract ID:</span>
            <span class="warranty-info-value">${warranty.id}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Coverage Type:</span>
            <span class="warranty-info-value">${warranty.coverageType}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Purchase Date:</span>
            <span class="warranty-info-value">${purchaseDateFormatted}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Expiry Date:</span>
            <span class="warranty-info-value">${expiryDateFormatted}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Warranty Period:</span>
            <span class="warranty-info-value">${warranty.warrantyYears} year${warranty.warrantyYears !== 1 ? 's' : ''}</span>
          </div>
          <div class="warranty-info-item">
            <span class="warranty-info-label">Today's Date:</span>
            <span class="warranty-info-value">${todayFormatted}</span>
          </div>
        </div>
      </div>
      
      <!-- Time Remaining Progress -->
      <div style="padding: 20px; background: rgba(0, 0, 0, 0.2); border-radius: 8px;">
        <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted); margin-bottom: 15px; text-transform: uppercase; letter-spacing: 0.5px;">
          ⏱️ Warranty Timeline
        </h4>
        <div style="margin-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.85rem;">
            <span style="color: var(--text-secondary);">Days Elapsed: <strong>${daysElapsed}</strong></span>
            <span style="color: var(--text-secondary);">Days Remaining: <strong style="color: var(--${statusColor === 'success' ? 'primary' : statusColor === 'warning' ? 'warning' : 'error'});">${Math.max(0, daysRemaining)}</strong></span>
          </div>
          <div style="background: rgba(255, 255, 255, 0.1); height: 24px; border-radius: 12px; overflow: hidden; position: relative;">
            <div style="
              background: ${statusColor === 'success' ? 'linear-gradient(90deg, #10b981, #059669)' : statusColor === 'warning' ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #ef4444, #dc2626)'};
              height: 100%;
              width: ${Math.max(0, percentageRemaining)}%;
              transition: width 0.5s ease;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 0.75rem;
              font-weight: 700;
              color: white;
            ">
              ${percentageRemaining > 10 ? percentageRemaining + '% remaining' : ''}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 5px; font-size: 0.75rem; color: var(--text-muted);">
            <span>Start</span>
            <span>${totalWarrantyDays} days total</span>
            <span>End</span>
          </div>
        </div>
        
        ${isValid ? `
          <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; margin-top: 15px;">
            <p style="font-size: 0.85rem; color: var(--success); margin: 0;">
              ✅ <strong>Warranty is active.</strong> Device is covered for repairs and replacements.
            </p>
          </div>
        ` : `
          <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; margin-top: 15px;">
            <p style="font-size: 0.85rem; color: var(--error); margin: 0;">
              ❌ <strong>Warranty has expired.</strong> Service may require payment. Contact support for renewal options.
            </p>
          </div>
        `}
      </div>
    </div>
  `;
  
  // Show success toast
  showToast(`Warranty validated: ${status}`, isValid ? 'success' : 'error');
}

// Display "Not Found" Message
function displayWarrantyNotFound(serialNumber) {
  const resultsDiv = document.getElementById('warrantyValidationDisplay');
  if (!resultsDiv) return;
  
  resultsDiv.innerHTML = `
    <div class="validation-result validation-error">
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 4rem; margin-bottom: 15px;">🔍</div>
        <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--error); margin-bottom: 10px;">
          Device Not Found
        </h3>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
          No device found with serial number or ID:
        </p>
        <code style="background: rgba(0, 0, 0, 0.3); padding: 8px 16px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; color: var(--primary);">
          ${serialNumber}
        </code>
        <p style="color: var(--text-muted); margin-top: 20px; font-size: 0.9rem;">
          Please check the serial number and try again, or contact support if the device should be registered.
        </p>
      </div>
    </div>
  `;
  
  showToast('Device not found in system', 'error');
}

// Display "No Warranty Record" Message
function displayNoWarrantyRecord(device) {
  const resultsDiv = document.getElementById('warrantyValidationDisplay');
  if (!resultsDiv) return;
  
  resultsDiv.innerHTML = `
    <div class="validation-result validation-warning">
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 4rem; margin-bottom: 15px;">⚠️</div>
        <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--warning); margin-bottom: 10px;">
          No Warranty Record
        </h3>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
          Device found, but no warranty contract is on file.
        </p>
        <div style="background: rgba(0, 0, 0, 0.2); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left;">
          <p style="margin: 5px 0;"><strong>Device ID:</strong> ${device.id}</p>
          <p style="margin: 5px 0;"><strong>Serial:</strong> ${device.serialNumber}</p>
          <p style="margin: 5px 0;"><strong>Model:</strong> ${device.model}</p>
          <p style="margin: 5px 0;"><strong>Customer:</strong> ${device.customerName}</p>
        </div>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          Please contact support to register a warranty contract for this device.
        </p>
      </div>
    </div>
  `;
  
  showToast('No warranty record found for device', 'warning');
}

// ==========================================================================
// WARRANTY BARCODE GENERATOR — Printable Barcode Stickers
// ==========================================================================

let currentWarrantyForBarcode = null;

/**
 * The canonical payload encoded into every printed warranty barcode.
 *
 * It MUST be a value the app's own scanner round-trips:
 *   printed code  ->  scanner  ->  extractScannableToken  ->  findDeviceByScannedCode
 * A bare serial number satisfies all three. The URL-style payload holds extra
 * context and still resolves because extractScannableToken understands ?serial=.
 */
function buildWarrantyBarcodePayload(device, opts = {}) {
  const serial = String(device?.serialNumber || '').trim();
  const id = String(device?.id || '').trim();
  const token = serial || id;
  if (!token) return '';

  // Keep the encoded value ASCII-safe for CODE128.
  if (opts.asUrl) {
    const base = opts.baseUrl || 'https://millennium-smartboard.local/device';
    return `${base}/${encodeURIComponent(id || token)}?serial=${encodeURIComponent(token)}`;
  }
  return token;
}

// Open Warranty Barcode Modal
function openWarrantyBarcodeModal(warrantyId) {
  const warranty = state.warranties.find(w => w.id === warrantyId);
  if (!warranty) {
    showToast('Warranty not found', 'error');
    return;
  }
  
  // Find associated device
  const device = state.devices.find(d => d.id === warranty.deviceId);
  if (!device) {
    showToast('Associated device not found', 'error');
    return;
  }
  
  currentWarrantyForBarcode = { warranty, device };
  
  // Open modal
  const modal = document.getElementById('warrantyBarcodeModal');
  if (modal) {
    modal.classList.add('active');
    
    // Generate barcode after modal opens
    setTimeout(() => {
      generateWarrantyBarcode(warranty, device);
    }, 100);
  }
}

// Close Warranty Barcode Modal
function closeWarrantyBarcodeModal() {
  const modal = document.getElementById('warrantyBarcodeModal');
  if (modal) {
    modal.classList.remove('active');
  }
  currentWarrantyForBarcode = null;
}

// Generate Warranty Barcode
function generateWarrantyBarcode(warranty, device) {
  try {
    // A bare serial/ID keeps the sticker scannable by this app's own scanner
    // AND by generic 1D barcode readers. (A URL payload would not fit CODE128
    // legibly at sticker size, and would break external readers.)
    const barcodeValue = buildWarrantyBarcodePayload(device);

    if (!barcodeValue) {
      showToast('This device has no serial number or ID to encode', 'error');
      return;
    }

    if (typeof JsBarcode === 'undefined') {
      showToast('Barcode library failed to load (offline?). Check your connection.', 'error');
      return;
    }

    // Generate barcode using JsBarcode with reduced width for better fit
    JsBarcode("#warrantyBarcode", barcodeValue, {
      format: "CODE128",
      width: 1.5,
      height: 70,
      displayValue: true,
      fontSize: 14,
      fontOptions: "bold",
      textMargin: 6,
      margin: 5,
      background: "#ffffff",
      lineColor: "#000000"
    });
    
    // Update modal content
    document.getElementById('barcodeWarrantyTitle').textContent = `Warranty Contract ${warranty.id}`;
    document.getElementById('barcodeWarrantySubtitle').textContent = `${warranty.status} - ${warranty.coverageType}`;
    document.getElementById('barcodeDeviceId').textContent = device.id;
    document.getElementById('barcodeDeviceInfo').textContent = `${device.model} • ${device.customerName}`;
    
    // Calculate warranty details
    const today = new Date();
    const expiryDate = new Date(warranty.expiryDate);
    const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    
    let statusIcon = '✅';
    let statusText = 'Active Coverage';
    let statusColor = 'var(--success)';
    
    if (daysRemaining < 0) {
      statusIcon = '❌';
      statusText = 'Expired';
      statusColor = 'var(--danger)';
    } else if (daysRemaining <= 30) {
      statusIcon = '⚠️';
      statusText = 'Expiring Soon';
      statusColor = 'var(--warning)';
    }
    
    // Update warranty details
    document.getElementById('barcodeWarrantyDetails').innerHTML = `
      <div style="display: grid; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Status:</span>
          <span style="font-size: 0.9rem; font-weight: 700; color: ${statusColor};">${statusIcon} ${statusText}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Days Remaining:</span>
          <span style="font-size: 0.9rem; font-weight: 700; color: ${statusColor};">${Math.max(0, daysRemaining)} days</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Purchase Date:</span>
          <span style="font-size: 0.9rem; font-weight: 600;">${warranty.purchaseDate}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Expiry Date:</span>
          <span style="font-size: 0.9rem; font-weight: 600;">${warranty.expiryDate}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Location:</span>
          <span style="font-size: 0.9rem; font-weight: 600;">${device.location}, ${device.city}</span>
        </div>
      </div>
    `;
    
  } catch (error) {
    console.error('Failed to generate barcode:', error);
    showToast('Failed to generate barcode', 'error');
  }
}

// Print Warranty Barcode
function printWarrantyBarcode() {
  if (!currentWarrantyForBarcode) {
    showToast('No warranty data available', 'error');
    return;
  }
  
  // Create print-friendly content
  const { warranty, device } = currentWarrantyForBarcode;
  // Same helper as the on-screen barcode, so the sticker and the on-screen
  // code always encode an identical value.
  const barcodeValue = buildWarrantyBarcodePayload(device);
  if (!barcodeValue) {
    showToast('This device has no serial number or ID to encode', 'error');
    return;
  }
  // Escape for safe embedding inside the inline <script> of the print window.
  const barcodeValueJs = barcodeValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  // Open new window for printing
  const printWindow = window.open('', '_blank', 'width=600,height=800');

  if (!printWindow) {
    showToast('Pop-up blocked. Allow pop-ups to print the barcode.', 'error');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Warranty Barcode - ${device.id}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
      <style>
        @page {
          size: 4in 2in;
          margin: 0.25in;
        }
        body {
          font-family: 'Arial', sans-serif;
          margin: 0;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
        }
        .sticker {
          width: 3.5in;
          border: 2px solid #000;
          border-radius: 8px;
          padding: 15px;
          background: white;
        }
        .header {
          text-align: center;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 2px solid #0284c7;
        }
        .title {
          font-size: 14px;
          font-weight: 800;
          color: #0284c7;
          margin: 0 0 5px 0;
        }
        .subtitle {
          font-size: 10px;
          color: #64748b;
          margin: 0;
        }
        .barcode-container {
          text-align: center;
          margin: 15px 0;
          padding: 10px;
          background: #f8fafc;
          border-radius: 4px;
        }
        .device-info {
          text-align: center;
          margin-top: 10px;
        }
        .device-id {
          font-size: 12px;
          font-weight: 700;
          color: #1f2937;
          margin: 5px 0;
        }
        .device-details {
          font-size: 9px;
          color: #6b7280;
          margin: 3px 0;
        }
        .footer {
          text-align: center;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
          font-size: 8px;
          color: #9ca3af;
        }
        @media print {
          body {
            background: white;
          }
        }
      </style>
    </head>
    <body>
      <div class="sticker">
        <div class="header">
          <div class="title">MILLENNIUM SMARTBOARD</div>
          <div class="subtitle">Warranty Contract ${warranty.id}</div>
        </div>
        
        <div class="barcode-container">
          <svg id="printBarcode"></svg>
        </div>
        
        <div class="device-info">
          <div class="device-id">${device.id}</div>
          <div class="device-details">${device.model}</div>
          <div class="device-details">${device.customerName}</div>
          <div class="device-details">Expires: ${warranty.expiryDate}</div>
        </div>
        
        <div class="footer">
          Brains Infinite Innovations Inc. | Scan to Validate Coverage
        </div>
      </div>
      
      <script>
        JsBarcode("#printBarcode", "${barcodeValueJs}", {
          format: "CODE128",
          width: 1.5,
          height: 60,
          displayValue: true,
          fontSize: 12,
          fontOptions: "bold",
          textMargin: 5,
          margin: 5,
          background: "#f8fafc",
          lineColor: "#000000"
        });
        
        // Auto-print after barcode renders
        setTimeout(() => {
          window.print();
          // Close after print dialog
          setTimeout(() => window.close(), 100);
        }, 500);
      </script>
    </body>
    </html>
  `);
  
  printWindow.document.close();
  showToast('Opening print dialog...', 'info');
}

// Download Warranty Barcode
function downloadWarrantyBarcode() {
  if (!currentWarrantyForBarcode) {
    showToast('No warranty data available', 'error');
    return;
  }
  
  try {
    const { warranty, device } = currentWarrantyForBarcode;
    const svg = document.getElementById('warrantyBarcode');
    
    if (!svg) {
      showToast('Barcode not generated', 'error');
      return;
    }
    
    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `Warranty_Barcode_${device.id}_${warranty.id}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('Barcode downloaded successfully', 'success');
  } catch (error) {
    console.error('Download failed:', error);
    showToast('Failed to download barcode', 'error');
  }
}

function exportAnalyticsReport() {
  const s = state.stats;
  const csvContent = `MILLENNIUM SMARTBOARD SYSTEM - EXECUTIVE REPORT
Generated: ${new Date().toLocaleString()}
Online Devices: ${s.onlineDevices}
Offline Devices: ${s.offlineDevices}
Devices with Problems: ${s.problemDevices}
Pending Repairs: ${s.pendingRepairs}
Total Units Sold: ${s.unitsSold}
Partner Schools: ${s.schoolsCount}
Corporate Clients: ${s.corporateCount}
Fleet Health Score: ${s.fleetHealthScore}%
`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Millennium_Fleet_Report_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Executive Report CSV downloaded!', 'success');
}

// Helpers
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function handleSearch(val) {
  state.searchQuery = val;
  renderApp();
}

function handleGlobalHeaderSearch(val) {
  state.searchQuery = val;
  if (state.currentTab !== 'devices' && state.currentTab !== 'tickets') {
    navigateTo('devices');
  } else {
    renderApp();
  }
}


function handleModelFilter(val) {
  state.filterModel = val;
  renderApp();
}

function handleStatusFilter(val) {
  state.filterStatus = val;
  renderApp();
}

function clearFilters() {
  state.searchQuery = '';
  state.filterModel = '';
  state.filterStatus = '';
  renderApp();
}

function switchTab(tabId) {
  if (state.currentTab === tabId) return;

  // Clear search when navigating away from devices/tickets tabs
  if (tabId !== 'devices' && tabId !== 'tickets') {
    state.searchQuery = '';
  }

  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.classList.remove('page-transition-enter');
    mainContent.classList.add('page-transition-exit');

    setTimeout(() => {
      state.currentTab = tabId;
      document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.tab === tabId);
      });
      toggleMobileSidebar(false);
      renderApp();

      mainContent.classList.remove('page-transition-exit');
      mainContent.classList.add('page-transition-enter');

      setTimeout(() => {
        mainContent.classList.remove('page-transition-enter');
      }, 420);
    }, 160);
  } else {
    state.currentTab = tabId;
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.tab === tabId);
    });
    toggleMobileSidebar(false);
    renderApp();
  }
}

// Shorthand used by dashboard panel "View All" buttons
function navigateTo(tabId) {
  switchTab(tabId);
}

function handleRoleChange(role) {
  state.currentRole = role;
  const meta = ROLE_META[role] || ROLE_META.admin;
  showToast(`Switched to ${meta.name} — ${meta.desc}`, 'info');
  state.currentTab = meta.defaultTab;
  applyRoleUI();
  renderApp();
}

// --- DELETE Operations ---

// ==========================================================================
// RENTAL SCHEDULING & DEVICE RENTAL MANAGEMENT
// ==========================================================================

function renderRentalsView() {
  const isAdmin = state.currentRole === 'admin';
  const isCustomer = state.currentRole === 'customer';
  const stats = state.rentalStats || { totalRentals: 0, revenue: 0, upcoming: 0, overdue: 0, statusBreakdown: {} };
  const filterStatus = state.rentalFilterStatus || '';

  // Customers only ever see their own bookings. The server already scopes the
  // data; this is a second layer so both rental views can never disagree.
  let rentals = getVisibleRentals();
  if (filterStatus) {
    rentals = rentals.filter(r => r.status === filterStatus);
  }

  // Sort by start date descending
  rentals.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

  // Calculate stats cards
  const activeCount = rentals.filter(r => r.status === 'Active').length;
  const pendingCount = rentals.filter(r => r.status === 'Pending').length;
  const overdueCount = rentals.filter(r => r.status === 'Overdue').length;
  // Company-wide stats are admin-only; customers count their own upcoming bookings.
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingCount = isAdmin
    ? (stats.upcoming || 0)
    : rentals.filter(r => ['Pending', 'Approved'].includes(r.status) && r.startDate >= todayStr).length;

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">📅 Device Rental Scheduling</h1>
        <p class="page-description">Manage device rentals, bookings, deliveries, and returns for the Millennium SmartBoard.</p>
      </div>
      <div class="page-actions">
        ${isAdmin || isCustomer ? `<button class="btn btn-primary" onclick="openRentalModal()">📅 New Booking</button>` : ''}
        <button class="btn btn-secondary" onclick="toggleRentalViewMode()">
          ${state.rentalViewMode === 'list' ? '🗓️ Calendar View' : '📋 List View'}
        </button>
      </div>
    </div>

    <!-- Rental Stats Cards -->
    <div class="stat-cards-grid">
      <div class="stat-card card-online">
        <div class="stat-header">
          <span class="ticket-id">Active Rentals</span>
          <span class="status-pill status-online">Active</span>
        </div>
        <div style="font-size:2rem;font-weight:800;font-family:'JetBrains Mono';">${activeCount}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);">Devices currently rented out</div>
      </div>

      <div class="stat-card card-warning">
        <div class="stat-header">
          <span class="ticket-id">Pending</span>
          <span class="status-pill status-warning">Pending</span>
        </div>
        <div style="font-size:2rem;font-weight:800;font-family:'JetBrains Mono';">${pendingCount}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);">Awaiting approval</div>
      </div>

      <div class="stat-card ${overdueCount > 0 ? 'card-offline' : 'card-online'}">
        <div class="stat-header">
          <span class="ticket-id">Overdue</span>
          <span class="status-pill ${overdueCount > 0 ? 'status-offline' : 'status-online'}">${overdueCount > 0 ? 'Overdue' : 'OK'}</span>
        </div>
        <div style="font-size:2rem;font-weight:800;font-family:'JetBrains Mono';">${overdueCount}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);">Past return date</div>
      </div>

      <div class="stat-card card-online">
        <div class="stat-header">
          <span class="ticket-id">Upcoming</span>
          <span class="status-pill status-online">Soon</span>
        </div>
        <div style="font-size:2rem;font-weight:800;font-family:'JetBrains Mono';">${upcomingCount}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);">Scheduled deliveries</div>
      </div>

      ${isAdmin ? `
      <div class="stat-card card-online">
        <div class="stat-header">
          <span class="ticket-id">Revenue</span>
          <span class="status-pill status-online">Total</span>
        </div>
        <div style="font-size:2rem;font-weight:800;font-family:'JetBrains Mono';">₱${(stats.revenue || 0).toLocaleString()}</div>
        <div style="font-size:0.8rem;color:var(--text-muted);">From active & returned rentals</div>
      </div>
      ` : ''}
    </div>

    ${state.rentalViewMode === 'calendar' ? renderRentalCalendar(rentals) : renderRentalList(rentals, isAdmin)}
  `;
}

// --- Rental List View ---
function renderRentalList(rentals, isAdmin) {
  if (rentals.length === 0) {
    return `
      <div class="glass-panel" style="padding:48px;text-align:center;">
        <div style="font-size:3rem;margin-bottom:16px;">📅</div>
        <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:8px;">No Rentals Found</h3>
        <p style="font-size:0.88rem;color:var(--text-muted);">${isAdmin ? 'Click "New Booking" to schedule a device rental.' : 'No rental history yet.'}</p>
      </div>
    `;
  }

  // Filter bar
  const statusOptions = ['Pending', 'Approved', 'Active', 'Returned', 'Overdue', 'Cancelled'];

  return `
    <!-- Filter Bar -->
    <div class="glass-panel" style="padding:12px 18px;display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <span style="font-size:0.85rem;font-weight:600;color:var(--text-muted);">Filter:</span>
      <select id="rentalStatusFilter" onchange="setRentalFilter(this.value)" style="
        padding:6px 14px;border-radius:8px;border:1px solid var(--border-color);
        background:var(--bg-surface-elevated);color:var(--text-primary);font-size:0.82rem;
      ">
        <option value="">All Rentals</option>
        ${statusOptions.map(s => `<option value="${s}" ${state.rentalFilterStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <span style="margin-left:auto;font-size:0.82rem;color:var(--text-muted);">${rentals.length} rental(s) found</span>
    </div>

    <!-- Rentals Table -->
    <div class="glass-panel" style="padding:0;overflow:hidden;">
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Rental #</th>
              <th>Customer</th>
              <th>Device</th>
              <th>Period</th>
              <th>Cost</th>
              <th>Status</th>
              <th>Priority</th>
              ${isAdmin ? '<th>Actions</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${rentals.map(r => {
              const statusClass = r.status === 'Active' ? 'status-online'
                : r.status === 'Pending' ? 'status-warning'
                : r.status === 'Overdue' ? 'status-offline'
                : r.status === 'Cancelled' ? 'status-offline'
                : r.status === 'Returned' ? 'status-online'
                : 'status-online';

              const days = Math.ceil((new Date(r.endDate) - new Date(r.startDate)) / (1000 * 60 * 60 * 24)) + 1;

              return `
                <tr style="cursor:pointer;" onclick="viewRentalDetail('${r.id}')">
                  <td><span class="ticket-id">${r.rentalNumber}</span></td>
                  <td><strong>${r.customerName}</strong></td>
                  <td>${r.deviceModel}<br><span style="font-size:0.76rem;color:var(--text-muted);">${r.serialNumber}</span></td>
                  <td>
                    <div style="font-size:0.82rem;">${formatDate(r.startDate)} → ${formatDate(r.endDate)}</div>
                    <div style="font-size:0.74rem;color:var(--text-muted);">${days} day(s)</div>
                  </td>
                  <td><strong>₱${r.totalCost.toLocaleString()}</strong><br><span style="font-size:0.74rem;color:var(--text-muted);">₱${r.dailyRate}/day</span></td>
                  <td><span class="status-pill ${statusClass}">${r.status}</span></td>
                  <td>
                    <span style="
                      font-size:0.74rem;padding:3px 8px;border-radius:6px;font-weight:600;
                      ${r.priority === 'High' ? 'background:rgba(244,63,94,0.15);color:#f43f5e;' :
                        r.priority === 'Medium' ? 'background:rgba(245,158,11,0.15);color:#f59e0b;' :
                        'background:rgba(34,197,94,0.15);color:#22c55e;'}
                    ">${r.priority}</span>
                  </td>
                  ${isAdmin ? `
                  <td onclick="event.stopPropagation();">
                    ${r.status === 'Pending' ? `<button class="btn btn-success btn-sm" onclick="approveRental('${r.id}')" style="font-size:0.74rem;padding:4px 10px;">✓ Approve</button>` : ''}
                    ${r.status === 'Approved' ? `<button class="btn btn-primary btn-sm" onclick="activateRental('${r.id}')" style="font-size:0.74rem;padding:4px 10px;">▶ Activate</button>` : ''}
                    ${r.status === 'Active' ? `<button class="btn btn-secondary btn-sm" onclick="returnRental('${r.id}')" style="font-size:0.74rem;padding:4px 10px;">↩ Return</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="editRental('${r.id}')" style="font-size:0.74rem;padding:4px 10px;">✏️</button>
                  </td>
                  ` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// --- Rental Calendar View ---
function renderRentalCalendar(rentals) {
  const month = state.rentalCalendarMonth;
  const year = state.rentalCalendarYear;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build calendar cells
  let cells = '';
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    cells += `<div class="rental-cal-day rental-cal-day-empty"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayRentals = rentals.filter(r => {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const check = new Date(dateStr);
      return check >= start && check <= end;
    });

    const hasActive = dayRentals.some(r => r.status === 'Active');
    const hasPending = dayRentals.some(r => r.status === 'Pending');
    const hasOverdue = dayRentals.some(r => r.status === 'Overdue');

    const bgColor = hasActive ? 'rgba(34,197,94,0.12)' : hasOverdue ? 'rgba(244,63,94,0.12)' : hasPending ? 'rgba(245,158,11,0.12)' : 'transparent';

    cells += `
      <div class="rental-cal-day" style="background:${bgColor};" onclick="openRentalDate('${dateStr}')">
        <div class="rental-cal-day-num">${d}</div>
        ${dayRentals.slice(0, 3).map(r => {
          const sClass = r.status === 'Active' ? 'rc-active' : r.status === 'Overdue' ? 'rc-overdue' : r.status === 'Pending' ? 'rc-pending' : 'rc-default';
          return `<div class="rental-cal-event ${sClass}" onclick="event.stopPropagation();viewRentalDetail('${r.id}')" title="${r.rentalNumber} - ${r.customerName}">${r.rentalNumber}</div>`;
        }).join('')}
        ${dayRentals.length > 3 ? `<div style="font-size:0.68rem;color:var(--text-muted);padding:2px 4px;">+${dayRentals.length - 3} more</div>` : ''}
      </div>
    `;
  }

  return `
    <div class="glass-panel" style="padding:20px;">
      <!-- Calendar Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button class="btn btn-secondary btn-sm" onclick="changeRentalMonth(-1)">◀ Prev</button>
        <h3 style="font-size:1.15rem;font-weight:800;">${monthNames[month]} ${year}</h3>
        <button class="btn btn-secondary btn-sm" onclick="changeRentalMonth(1)">Next ▶</button>
      </div>

      <!-- Calendar Grid -->
      <div class="rental-cal-grid">
        <div class="rental-cal-dow">Sun</div>
        <div class="rental-cal-dow">Mon</div>
        <div class="rental-cal-dow">Tue</div>
        <div class="rental-cal-dow">Wed</div>
        <div class="rental-cal-dow">Thu</div>
        <div class="rental-cal-dow">Fri</div>
        <div class="rental-cal-dow">Sat</div>
        ${cells}
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:16px;margin-top:16px;font-size:0.78rem;">
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:4px;background:rgba(34,197,94,0.4);"></span>Active</div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:4px;background:rgba(245,158,11,0.4);"></span>Pending</div>
        <div style="display:flex;align-items:center;gap:6px;"><span style="width:12px;height:12px;border-radius:4px;background:rgba(244,63,94,0.4);"></span>Overdue</div>
      </div>
    </div>
  `;
}

// --- Rental Helper Functions ---
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setRentalFilter(status) {
  state.rentalFilterStatus = status;
  renderApp();
}

function toggleRentalViewMode() {
  state.rentalViewMode = state.rentalViewMode === 'list' ? 'calendar' : 'list';
  renderApp();
}

function changeRentalMonth(delta) {
  let m = state.rentalCalendarMonth + delta;
  let y = state.rentalCalendarYear;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  state.rentalCalendarMonth = m;
  state.rentalCalendarYear = y;
  renderApp();
}

function openRentalDate(dateStr) {
  // Just show rentals for that date - could open a modal
  const dayRentals = getVisibleRentals().filter(r => {
    const check = new Date(dateStr);
    return check >= new Date(r.startDate) && check <= new Date(r.endDate);
  });
  if (dayRentals.length === 0) {
    showToast(`No rentals on ${formatDate(dateStr)}`, 'info');
  } else {
    showToast(`${dayRentals.length} rental(s) on ${formatDate(dateStr)}`, 'info');
  }
}

// --- Create/Edit Rental Modal ---
function openRentalModal(rentalId, prefillDeviceId) {
  const editing = rentalId ? getVisibleRentals().find(r => r.id === rentalId) : null;
  const isAdmin = state.currentRole === 'admin';
  const isCustomer = state.currentRole === 'customer';
  const today = new Date().toISOString().split('T')[0];

  const customers = state.customers || [];
  const devices = state.devices || [];

  // For customers, auto-match their linked customer record
  let matchedCustomer = null;
  if (isCustomer) {
    const userOrg = (state.currentUser.organization || '').trim().toLowerCase();
    const userCustId = (state.currentUser.customerId || '').trim().toLowerCase();
    matchedCustomer = customers.find(c =>
      (userCustId && c.id.toLowerCase() === userCustId) ||
      (userOrg && c.organizationName.trim().toLowerCase() === userOrg)
    ) || null;

    // A booking must be attributable to a real customer record, otherwise it
    // would never show up in the customer's own list.
    if (!matchedCustomer) {
      showToast(
        `Your account isn't linked to an organization yet${state.currentUser.organization ? ` ("${state.currentUser.organization}")` : ''}. Please contact an administrator before booking.`,
        'error'
      );
      return;
    }
  }

  // Remove existing modal
  const existing = document.getElementById('rentalModalOverlay');
  if (existing) existing.remove();

  // Escape values before they are interpolated into HTML attributes.
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const overlay = document.createElement('div');
  overlay.id = 'rentalModalOverlay';
  overlay.className = 'modal-backdrop';

  overlay.innerHTML = `
    <div class="modal-content modal-form modal-wide" role="dialog" aria-modal="true" aria-labelledby="rentalModalTitle">
      <div class="modal-header">
        <h3 class="modal-title" id="rentalModalTitle">
          ${editing ? '✏️ Edit Rental Booking' : '📅 New Device Rental Booking'}
        </h3>
        <button type="button" class="modal-close" aria-label="Close"
          onclick="document.getElementById('rentalModalOverlay').remove()">×</button>
      </div>

      <form id="rentalForm" onsubmit="submitRentalForm(event, '${rentalId || ''}')">
        <div class="form-body">

          <section class="form-section">
            <div class="form-section-title">🏢 Booking Details</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rentalCustomer">Customer / Company *</label>
                ${isCustomer ? `
                  <input class="form-input" id="rentalCustomer" type="text"
                    value="${esc(matchedCustomer.organizationName)}" disabled />
                  <input type="hidden" name="customerId" value="${esc(matchedCustomer.id)}">
                  <div class="form-hint">Your booking is filed under your own organization.</div>
                ` : `
                  <select class="form-select" id="rentalCustomer" name="customerId" required ${editing ? 'disabled' : ''}>
                    <option value="">Select company…</option>
                    ${customers.map(c => `<option value="${esc(c.id)}" ${(editing && editing.customerId === c.id) ? 'selected' : ''}>${esc(c.organizationName)}</option>`).join('')}
                  </select>
                  ${editing ? '<div class="form-hint">The customer cannot be changed after booking.</div>' : ''}
                `}
              </div>

              <div class="form-group">
                <label class="form-label" for="rentalDevice">Device *</label>
                <select class="form-select" id="rentalDevice" name="deviceId" required ${editing ? 'disabled' : ''}>
                  <option value="">Select device…</option>
                  ${devices.map(d => `<option value="${esc(d.id)}" ${(editing && editing.deviceId === d.id) || (prefillDeviceId === d.id) ? 'selected' : ''}>${esc(d.model)} (${esc(d.serialNumber)})</option>`).join('')}
                </select>
                ${editing ? '<div class="form-hint">The device cannot be changed after booking.</div>' : ''}
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-title">🗓️ Schedule</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rentalStart">Start Date *</label>
                <input class="form-input" id="rentalStart" type="date" name="startDate" required
                  value="${esc(editing ? editing.startDate : today)}" min="${today}" />
              </div>
              <div class="form-group">
                <label class="form-label" for="rentalEnd">End Date *</label>
                <input class="form-input" id="rentalEnd" type="date" name="endDate" required
                  value="${esc(editing ? editing.endDate : today)}" min="${today}" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rentalDelivery">Delivery Date</label>
                <input class="form-input" id="rentalDelivery" type="date" name="deliveryDate"
                  value="${esc(editing && editing.deliveryDate ? editing.deliveryDate.split('T')[0] : '')}" />
              </div>
              <div class="form-group">
                <label class="form-label" for="rentalPickup">Pickup Date</label>
                <input class="form-input" id="rentalPickup" type="date" name="pickupDate"
                  value="${esc(editing && editing.pickupDate ? editing.pickupDate.split('T')[0] : '')}" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rentalPriority">Priority</label>
                <select class="form-select" id="rentalPriority" name="priority">
                  <option value="Low" ${editing && editing.priority === 'Low' ? 'selected' : ''}>Low</option>
                  <option value="Medium" ${(!editing || editing.priority === 'Medium') ? 'selected' : ''}>Medium</option>
                  <option value="High" ${editing && editing.priority === 'High' ? 'selected' : ''}>High</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="rentalPurpose">Purpose / Event Type</label>
                <input class="form-input" id="rentalPurpose" type="text" name="purpose"
                  value="${esc(editing ? editing.purpose : '')}" placeholder="e.g. Conference, Training, Exhibit" />
              </div>
            </div>
          </section>

          ${isAdmin ? `
          <section class="form-section">
            <div class="form-section-title">💰 Pricing</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rentalRate">Daily Rate (₱)</label>
                <input class="form-input" id="rentalRate" type="number" name="dailyRate"
                  value="${esc(editing ? editing.dailyRate : 500)}" min="0" step="50" />
              </div>
              <div class="form-group">
                <label class="form-label" for="rentalDeposit">Deposit (₱)</label>
                <input class="form-input" id="rentalDeposit" type="number" name="depositAmount"
                  value="${esc(editing ? editing.depositAmount : 5000)}" min="0" step="100" />
              </div>
            </div>
          </section>
          ` : `
          <section class="form-section">
            <div class="form-section-title">💰 Pricing</div>
            <div class="form-hint" style="margin-top:0;">
              💡 The daily rate and deposit are set by our admin team after your booking is reviewed.
              You will be notified once it is approved.
            </div>
          </section>
          `}

          <section class="form-section">
            <div class="form-section-title">📍 Delivery &amp; Contact</div>
            <div class="form-group">
              <label class="form-label" for="rentalAddress">Delivery Address</label>
              <input class="form-input" id="rentalAddress" type="text" name="deliveryAddress"
                value="${esc(editing ? editing.deliveryAddress : '')}"
                placeholder="Where should the device be delivered?" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="rentalContactPerson">Contact Person</label>
                <input class="form-input" id="rentalContactPerson" type="text" name="contactPerson"
                  value="${esc(editing ? editing.contactPerson : isCustomer ? (state.currentUser.fullName || state.currentUser.username) : '')}"
                  placeholder="Full name" />
              </div>
              <div class="form-group">
                <label class="form-label" for="rentalContactPhone">Contact Phone</label>
                <input class="form-input" id="rentalContactPhone" type="text" name="contactPhone"
                  value="${esc(editing ? editing.contactPhone : '')}" placeholder="+63…" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="rentalContactEmail">Contact Email</label>
              <input class="form-input" id="rentalContactEmail" type="email" name="contactEmail"
                value="${esc(editing ? editing.contactEmail : isCustomer ? (state.currentUser.email || '') : '')}"
                placeholder="email@company.com" />
            </div>
          </section>

          <section class="form-section">
            <div class="form-section-title">📝 Notes</div>
            <div class="form-group">
              <textarea class="form-textarea" name="notes" rows="3"
                placeholder="Any special instructions or remarks…">${esc(editing ? editing.notes : '')}</textarea>
            </div>
          </section>

        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary"
            onclick="document.getElementById('rentalModalOverlay').remove()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            ${editing ? '💾 Update Booking' : '📅 Create Booking'}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Trigger the fade/scale transition on the next frame.
  requestAnimationFrame(() => overlay.classList.add('active'));

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Esc closes the dialog.
  const onKey = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  const firstField = overlay.querySelector('select, input');
  if (firstField) setTimeout(() => firstField.focus(), 60);
}

async function submitRentalForm(event, rentalId) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  // Convert numeric fields
  data.dailyRate = parseFloat(data.dailyRate) || 500;
  data.depositAmount = parseFloat(data.depositAmount) || 0;

  try {
    let res, json;
    if (rentalId) {
      // Editing
      res = await fetch(`${API_BASE}/rentals/${rentalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      // Creating
      res = await fetch(`${API_BASE}/rentals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    json = await res.json();

    if (json.success) {
      showToast(`✅ Rental ${rentalId ? 'updated' : 'created'} successfully!`, 'success');
      document.getElementById('rentalModalOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`❌ ${json.error}`, 'error');
    }
  } catch (err) {
    showToast('Network error. Could not save rental.', 'error');
  }
}

// --- View Rental Detail Modal ---
function viewRentalDetail(id) {
  // Scoped lookup: a customer can only ever open a rental they own.
  const rental = getVisibleRentals().find(r => r.id === id);
  if (!rental) return;

  const isAdmin = state.currentRole === 'admin';
  const days = Math.ceil((new Date(rental.endDate) - new Date(rental.startDate)) / (1000 * 60 * 60 * 24)) + 1;

  const statusClass = rental.status === 'Active' ? 'status-online'
    : rental.status === 'Pending' ? 'status-warning'
    : rental.status === 'Overdue' ? 'status-offline'
    : rental.status === 'Cancelled' ? 'status-offline'
    : 'status-online';

  const existing = document.getElementById('rentalDetailOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'rentalDetailOverlay';
  overlay.className = 'modal-backdrop';

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  overlay.innerHTML = `
    <div class="modal-content modal-form modal-wide" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div>
          <span class="ticket-id">${esc(rental.rentalNumber)}</span>
          <h3 class="modal-title" style="margin-top:6px;">${esc(rental.customerName)}</h3>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <span class="status-pill ${statusClass}">${esc(rental.status)}</span>
          <button type="button" class="modal-close" aria-label="Close"
            onclick="document.getElementById('rentalDetailOverlay').remove()">×</button>
        </div>
      </div>

      <div class="form-body">
        <div class="detail-grid">
          <div class="detail-tile">
            <div class="detail-tile-label">Device</div>
            <div class="detail-tile-value">${esc(rental.deviceModel)}</div>
            <div class="detail-tile-sub">S/N: ${esc(rental.serialNumber)}</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile-label">Rental Period</div>
            <div class="detail-tile-value">${formatDate(rental.startDate)}</div>
            <div class="detail-tile-sub">to ${formatDate(rental.endDate)} (${days} day${days === 1 ? '' : 's'})</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile-label">Total Cost</div>
            <div class="detail-tile-value" style="font-size:1.15rem;">₱${Number(rental.totalCost || 0).toLocaleString()}</div>
            <div class="detail-tile-sub">₱${Number(rental.dailyRate || 0).toLocaleString()}/day + ₱${Number(rental.depositAmount || 0).toLocaleString()} deposit</div>
          </div>
          <div class="detail-tile">
            <div class="detail-tile-label">Priority</div>
            <div class="detail-tile-value">${esc(rental.priority)}</div>
            <div class="detail-tile-sub">${esc(rental.purpose || 'No purpose specified')}</div>
          </div>
        </div>

        ${rental.deliveryAddress ? `
          <div class="detail-tile">
            <div class="detail-tile-label">Delivery Address</div>
            <div class="detail-tile-value">${esc(rental.deliveryAddress)}</div>
          </div>
        ` : ''}

        ${(rental.deliveryDate || rental.pickupDate) ? `
          <div class="detail-grid">
            <div class="detail-tile">
              <div class="detail-tile-label">Delivery Date</div>
              <div class="detail-tile-value">${rental.deliveryDate ? formatDate(rental.deliveryDate) : '—'}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile-label">Pickup Date</div>
              <div class="detail-tile-value">${rental.pickupDate ? formatDate(rental.pickupDate) : '—'}</div>
            </div>
          </div>
        ` : ''}

        ${(rental.contactPerson || rental.contactPhone || rental.contactEmail) ? `
          <div class="detail-tile">
            <div class="detail-tile-label">Contact</div>
            <div class="detail-tile-value">${esc(rental.contactPerson || '—')}</div>
            <div class="detail-tile-sub">
              ${esc(rental.contactPhone || '')}${rental.contactPhone && rental.contactEmail ? ' · ' : ''}${esc(rental.contactEmail || '')}
            </div>
          </div>
        ` : ''}

        ${rental.notes ? `
          <div class="detail-tile">
            <div class="detail-tile-label">Notes</div>
            <div class="detail-tile-value" style="font-weight:500;white-space:pre-wrap;">${esc(rental.notes)}</div>
          </div>
        ` : ''}

        ${rental.actualReturnDate ? `
          <div class="detail-tile detail-tile-success">
            <div class="detail-tile-label" style="color:#22c55e;">✓ Device Returned</div>
            <div class="detail-tile-value">Return Date: ${formatDate(rental.actualReturnDate)}</div>
          </div>
        ` : ''}
      </div>

      ${isAdmin ? `
        <div class="modal-footer" style="flex-wrap:wrap;justify-content:flex-end;">
          ${rental.status === 'Pending' ? `<button class="btn btn-success btn-sm" onclick="approveRental('${esc(rental.id)}')">✓ Approve</button>` : ''}
          ${rental.status === 'Approved' ? `<button class="btn btn-primary btn-sm" onclick="activateRental('${esc(rental.id)}')">▶ Activate</button>` : ''}
          ${rental.status === 'Active' ? `<button class="btn btn-secondary btn-sm" onclick="returnRental('${esc(rental.id)}')">↩ Mark Returned</button>` : ''}
          ${rental.status === 'Active' ? `<button class="btn btn-warning btn-sm" onclick="markOverdue('${esc(rental.id)}')">⚠ Mark Overdue</button>` : ''}
          ${(rental.status === 'Pending' || rental.status === 'Approved') ? `<button class="btn btn-secondary btn-sm" onclick="cancelRental('${esc(rental.id)}')">✕ Cancel</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="editRental('${esc(rental.id)}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRental('${esc(rental.id)}')">🗑️ Delete</button>
        </div>
      ` : `
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary"
            onclick="document.getElementById('rentalDetailOverlay').remove()">Close</button>
        </div>
      `}
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

// --- Rental Status Actions ---
async function approveRental(id) {
  try {
    const res = await fetch(`${API_BASE}/rentals/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Approved' }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Rental approved.', 'success');
      document.getElementById('rentalDetailOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }
  } catch (e) {
    showToast('Network error.', 'error');
  }
}

async function activateRental(id) {
  try {
    const res = await fetch(`${API_BASE}/rentals/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Active' }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('▶ Rental activated. Device is now rented out.', 'success');
      document.getElementById('rentalDetailOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }
  } catch (e) {
    showToast('Network error.', 'error');
  }
}

async function returnRental(id) {
  showDeleteConfirm(
    `Mark this rental as <strong>Returned</strong>?<br><br>The device will be available for booking again.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/rentals/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Returned' }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('↩ Rental marked as returned.', 'success');
          document.getElementById('rentalDetailOverlay')?.remove();
          await fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error.', 'error');
      }
    }
  );
}

async function markOverdue(id) {
  try {
    const res = await fetch(`${API_BASE}/rentals/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Overdue' }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('⚠ Rental marked as overdue.', 'warning');
      document.getElementById('rentalDetailOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }
  } catch (e) {
    showToast('Network error.', 'error');
  }
}

async function cancelRental(id) {
  showDeleteConfirm(
    `Cancel this rental booking?<br><br>This action cannot be undone.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/rentals/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Cancelled' }),
        });
        const data = await res.json();
        if (data.success) {
          showToast('✕ Rental cancelled.', 'info');
          document.getElementById('rentalDetailOverlay')?.remove();
          await fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error.', 'error');
      }
    }
  );
}

function editRental(id) {
  document.getElementById('rentalDetailOverlay')?.remove();
  openRentalModal(id);
}

async function deleteRental(id) {
  // Scoped lookup: only an admin can reach this, and only for a rental they can see.
  const rental = getVisibleRentals().find(r => r.id === id);
  if (!rental) return;
  showDeleteConfirm(
    `Permanently delete rental <strong>${rental.rentalNumber}</strong>?<br><br>Customer: ${rental.customerName}<br>Device: ${rental.deviceModel}<br>This action cannot be undone.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/rentals/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ Rental ${rental.rentalNumber} deleted.`, 'success');
          document.getElementById('rentalDetailOverlay')?.remove();
          await fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error. Could not delete rental.', 'error');
      }
    }
  );
}

// --- DELETE Operations ---

function showDeleteConfirm(message, onConfirm) {
  // Remove existing if any
  const existing = document.getElementById('deleteConfirmOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'deleteConfirmOverlay';
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:420px;text-align:center;border-color:rgba(244,63,94,0.35);" role="alertdialog" aria-modal="true">
      <div style="font-size:2.5rem;margin-bottom:12px;">🗑️</div>
      <h3 style="font-size:1.15rem;font-weight:800;color:#f43f5e;margin-bottom:10px;">Confirm Deletion</h3>
      <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:24px;line-height:1.5;">${message}</p>
      <div class="modal-footer" style="border-top:none;background:transparent;padding:0;justify-content:center;">
        <button type="button" id="deleteCancelBtn" class="btn btn-secondary">Cancel</button>
        <button type="button" id="deleteConfirmBtn" class="btn btn-primary"
          style="background:linear-gradient(135deg,#f43f5e,#dc2626);box-shadow:0 4px 15px rgba(244,63,94,0.4);">
          🗑️ Delete Permanently
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  document.getElementById('deleteCancelBtn').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('deleteConfirmBtn').onclick = () => {
    overlay.remove();
    onConfirm();
  };
}

async function deleteDevice(id) {
  const dev = state.devices.find(d => d.id === id);
  if (!dev) return;
  showDeleteConfirm(
    `Are you sure you want to permanently delete device <strong>${id}</strong> (${dev.model}) assigned to <strong>${dev.customerName}</strong>?<br><br>This will also remove its warranty and predictive alerts.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/devices/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ Device ${id} deleted successfully.`, 'success');
          await fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error. Could not delete device.', 'error');
      }
    }
  );
}

async function deleteTicket(id) {
  const tck = state.tickets.find(t => t.id === id);
  if (!tck) return;
  showDeleteConfirm(
    `Permanently delete ticket <strong>${tck.ticketNumber}</strong>?<br><br>"${tck.title}"<br><br>This action cannot be undone.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/tickets/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          // Close any open modal
          const modal = document.getElementById('ticketDetailModal');
          if (modal) modal.remove();
          showToast(`✅ Ticket ${tck.ticketNumber} deleted.`, 'success');
          await fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error. Could not delete ticket.', 'error');
      }
    }
  );
}

async function deleteInventoryPart(id) {
  const part = state.inventory.find(p => p.id === id);
  if (!part) return;
  showDeleteConfirm(
    `Permanently delete spare part <strong>${part.name}</strong> (${part.partCode})?<br><br>Current stock: <strong>${part.stockQuantity} units</strong>. This cannot be undone.`,
    async () => {
      try {
        const res = await fetch(`${API_BASE}/inventory/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ Part "${part.name}" deleted from inventory.`, 'success');
          await fetchAllData();
        } else {
          showToast(`❌ ${data.error}`, 'error');
        }
      } catch (e) {
        showToast('Network error. Could not delete inventory part.', 'error');
      }
    }
  );
}

// --- Theme Controller (Light & Dark Mode) ---
function initTheme() {
  const saved = localStorage.getItem('millennium-theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('millennium-theme', theme);
  const icon = document.getElementById('themeToggleIcon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  showToast(`Switched to ${newTheme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}`, 'info');
}

// --- Mobile Sidebar Drawer Controller ---
function toggleMobileSidebar(open) {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;
  
  const shouldOpen = typeof open === 'boolean' ? open : !sidebar.classList.contains('mobile-open');
  sidebar.classList.toggle('mobile-open', shouldOpen);
  overlay.classList.toggle('active', shouldOpen);
}

// Initialize Application on Page Load
window.addEventListener('DOMContentLoaded', async () => {
  // The inline boot script in index.html already applied the saved theme
  // before the first paint; this just syncs the toggle icon.
  initTheme();

  // --- AUTH GATE: check for existing session ---
  let savedUser = getAuthSession();
  if (savedUser) {
    // Reconcile the cached session with the database before trusting it.
    savedUser = await refreshAuthSession();
  }

  // The boot script kept the sign-in portal off screen during the /auth/me
  // round-trip above. The real answer is in now, so drop the boot class and
  // let the normal show/hide logic take over. Both branches below run in this
  // same task, so no frame is painted in between — no flash either way.
  document.documentElement.classList.remove('boot-has-session');

  if (savedUser) {
    // Restore session without showing login
    state.currentUser = savedUser;
    state.currentRole = savedUser.role;
    updateAuthChip(savedUser);
    updateSidebarRole(savedUser.role);
    hideAuthOverlay();
    applyRoleUI();
    fetchAllData();
  } else {
    // Show login overlay, don't load data yet
    showAuthOverlay();
  }

  // Navigation Links — guard against disallowed tabs
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;
      const allowed = ROLE_ACCESS[state.currentRole] || ROLE_ACCESS.admin;
      if (!allowed.includes(tab)) {
        showToast('You do not have access to that section.', 'error');
        return;
      }
      switchTab(tab);
    });
  });

  // Auto-refresh telemetry every 30 seconds (only if logged in).
  // Runs "silent": if the fetched data renders identical markup the DOM is
  // left completely untouched, so the poll is invisible instead of looking
  // like the page reloaded itself.
  setInterval(() => {
    if (state.currentUser) {
      fetchAllData({ silent: true });
    }
  }, 30000);
});



// ==========================================================================
// MOBILE RESPONSIVE MODULE
// ==========================================================================

// Mobile menu toggle
/**
 * Hamburger toggle.
 *
 * Delegates to toggleMobileSidebar() so the hamburger and the dimming layer
 * share a single state. It deliberately does NOT create a body-level
 * `.mobile-backdrop`: `.app-container` is `position: relative; z-index: 1`, so
 * it forms a stacking context, and a body-level overlay (z-index 998) painted
 * above that whole subtree — including the sidebar — which made every nav item
 * untappable. The overlay now lives inside `.app-container` (see index.html).
 */
function toggleMobileMenu() {
  const sidebar = document.getElementById('appSidebar');
  const isOpen = sidebar ? sidebar.classList.contains('mobile-open') : false;
  toggleMobileSidebar(!isOpen);
}

function closeMobileMenu() {
  toggleMobileSidebar(false);
}

// Close the mobile drawer after tapping a nav item.
// (This used to listen for `.tab-btn`, a class that does not exist — the
// sidebar uses `.nav-item` — so the drawer stayed open over the new view.)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.app-sidebar .nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        closeMobileMenu();
      }
    });
  });

  // Close menu on window resize if screen becomes large
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      closeMobileMenu();
    }
  });
});

// Detect device type
function isMobileDevice() {
  return window.innerWidth <= 767;
}

function isTabletDevice() {
  return window.innerWidth > 767 && window.innerWidth <= 1023;
}

function isDesktopDevice() {
  return window.innerWidth > 1023;
}

// Responsive table handling
function makeTablesResponsive() {
  const tables = document.querySelectorAll('.data-table');
  tables.forEach(table => {
    if (!table.parentElement.classList.contains('table-container')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-container';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

// Call on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', makeTablesResponsive);
} else {
  makeTablesResponsive();
}

// Touch swipe for mobile sidebar
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
});

document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
});

function handleSwipe() {
  if (!isMobileDevice()) return;
  
  const swipeThreshold = 50;
  const diff = touchEndX - touchStartX;
  
  // Swipe right to open menu (from left edge)
  if (diff > swipeThreshold && touchStartX < 50) {
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar && !sidebar.classList.contains('mobile-open')) {
      toggleMobileMenu();
    }
  }
  
  // Swipe left to close menu
  if (diff < -swipeThreshold && touchStartX > 200) {
    const sidebar = document.querySelector('.app-sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      closeMobileMenu();
    }
  }
}

// Viewport height fix for mobile browsers
function setVH() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

setVH();
window.addEventListener('resize', setVH);
window.addEventListener('orientationchange', setVH);

// Detect if running as PWA
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true;
}

// Add device class to body for CSS targeting
document.body.classList.add(
  isMobileDevice() ? 'mobile-device' :
  isTabletDevice() ? 'tablet-device' :
  'desktop-device'
);

// Update on resize
window.addEventListener('resize', () => {
  document.body.classList.remove('mobile-device', 'tablet-device', 'desktop-device');
  document.body.classList.add(
    isMobileDevice() ? 'mobile-device' :
    isTabletDevice() ? 'tablet-device' :
    'desktop-device'
  );
});
