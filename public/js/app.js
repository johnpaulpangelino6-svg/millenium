// ==========================================================================
// MILLENNIUM SMARTBOARD MANAGEMENT SYSTEM - CORE APPLICATION LOGIC
// Full-Stack TypeScript REST API Integration, IoT Simulator & Role Controller
// ==========================================================================

const API_BASE = '/api';

// --- Role Access Configuration ---
// Defines which tabs each role can access
const ROLE_ACCESS = {
  admin:      ['dashboard','showcase','devices','tickets','customer-portal','warranty','inventory','data-manager','cms','predictive','analytics'],
  technician: ['showcase','devices','tickets','inventory'],
  customer:   ['showcase','customer-portal','tickets','warranty'],
};

// Role display metadata
const ROLE_META = {
  admin:      { icon: '🏢', name: 'Admin Portal',      desc: 'Full system access',          defaultTab: 'dashboard' },
  technician: { icon: '🔧', name: 'Technician Portal', desc: 'Assigned jobs & inventory',    defaultTab: 'tickets' },
  customer:   { icon: '🏫', name: 'Customer Portal',   desc: 'Your devices & service status', defaultTab: 'customer-portal' },
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
  customers: [],
  allUsers: [],
  dataManagerSubTab: 'users', // 'users' | 'customers' | 'allocation'
  stats: null,
  selectedDeviceForRemote: null,
  selectedDeviceForQR: null,
  selectedTicket: null,
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

  // Millennium Interactive SmartBoard Simulator State & Feature Demonstrations
  simulatorMode: 'theater', // 'theater' | 'whiteboard' | 'windows' | 'android'
  activeFeatureDemo: null,  // null | 'uhd'|'audio'|'stylus'|'cast'|'wireless'|'ops'|'dualos'|'camera'|'dongle'
  demoTourActive: false,
  dongleConnected: true,
  stylusColor: '#00f2fe',
  stylusSize: 3,
  stylusTool: 'pen', // 'pen' | 'marker' | 'highlighter' | 'laser' | 'eraser'
  stylusShape: 'freehand', // 'freehand' | 'line' | 'arrow' | 'rect' | 'circle'
  isDrawing: false,
  theaterState: {
    playing: true,
    channel: 'nature', // 'nature' | 'anatomy' | 'space'
    resolution: '4K UHD', // '4K UHD' | '8K Cinema' | '1080p'
    timeSeconds: 142,
    totalSeconds: 360,
    audioMode: 'Dolby Atmos',
    antiGlareSplit: 50,
    volume: 85,
  },
  windowsState: {
    activeApp: 'powerpoint', // 'powerpoint' | 'teams' | 'edge' | 'ops'
    slideIdx: 0,
    startMenuOpen: false,
    teamsMuted: false,
    teamsCamera: true,
    edgeUrl: 'https://brains.asia/millennium',
  },
  androidState: {
    quickSettingsOpen: false,
    eyeCare: false,
    brightness: 90,
    volume: 85,
    wifiConnected: true,
    hotspotActive: true,
    screenCastActive: true,
    activeApp: null, // null | 'screen-share' | 'file-explorer'
  },
  opsEjected: false,
  noiseSuppressionActive: true,
};

// ==========================================================================
// AUTH MODULE — Login, Register, Session, Logout
// ==========================================================================

const AUTH_SESSION_KEY = 'millennium_auth_user';

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
  if (locEl)    locEl.textContent   = user.location || 'All Locations';
  if (avatarEl) avatarEl.textContent = (user.fullName || user.username).charAt(0).toUpperCase();
}

/** Switch between login and register tabs */
function switchAuthTab(tab) {
  const loginPanel    = document.getElementById('loginPanel');
  const registerPanel = document.getElementById('registerPanel');
  const loginTab      = document.getElementById('loginTab');
  const registerTab   = document.getElementById('registerTab');
  if (!loginPanel || !registerPanel) return;

  if (tab === 'login') {
    loginPanel.style.display = 'block';
    registerPanel.style.display = 'none';
    loginTab.classList.add('active');
    loginTab.setAttribute('aria-selected', 'true');
    registerTab.classList.remove('active');
    registerTab.setAttribute('aria-selected', 'false');
  } else {
    loginPanel.style.display = 'none';
    registerPanel.style.display = 'block';
    registerTab.classList.add('active');
    registerTab.setAttribute('aria-selected', 'true');
    loginTab.classList.remove('active');
    loginTab.setAttribute('aria-selected', 'false');
  }
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
    btn.querySelector('.auth-btn-text').textContent = `Signing in as ${roleLabel}...`;
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
    saveAuthSession(user);
    state.currentUser = user;
    state.currentRole = user.role;
    updateAuthChip(user);
    updateSidebarRole(user.role);
    hideAuthOverlay();
    applyRoleUI();
    fetchAllData();
    showToast(`Welcome, ${user.fullName || user.username}! Signed in as ${roleLabel} 🌟`, 'success');

  } catch (err) {
    showAuthError(errorEl, 'Network error. Please check your connection.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.querySelector('.auth-btn-text').textContent = 'Sign In to Portal';
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
  btn.querySelector('.auth-btn-text').textContent = 'Signing in...';
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
    saveAuthSession(user);
    state.currentUser = user;
    state.currentRole = user.role;

    updateAuthChip(user);
    updateSidebarRole(user.role);
    hideAuthOverlay();
    applyRoleUI();
    fetchAllData();
    showToast(`Welcome back, ${user.fullName || user.username}! 🌟`, 'success');

  } catch (err) {
    showAuthError(errorEl, 'Network error. Please check your connection.');
  } finally {
    btn.disabled = false;
    btn.querySelector('.auth-btn-text').textContent = 'Sign In to Portal';
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
  btn.querySelector('.auth-btn-text').textContent = 'Creating account...';

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
    btn.querySelector('.auth-btn-text').textContent = 'Create Account';
  }
}

/** Handle logout */
function handleLogout() {
  clearAuthSession();
  state.currentUser = null;
  state.currentRole = 'admin';
  showAuthOverlay();
  switchAuthTab('login');
  // Clear the login form
  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  if (uInput) uInput.value = '';
  if (pInput) pInput.value = '';
  showToast('You have been signed out.', 'info');
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

// --- Data Fetchers ---
async function fetchAllData() {
  try {
    const fetchPromises = [
      fetch(`${API_BASE}/stats/dashboard`),
      fetch(`${API_BASE}/devices`),
      fetch(`${API_BASE}/tickets`),
      fetch(`${API_BASE}/warranties`),
      fetch(`${API_BASE}/inventory`),
      fetch(`${API_BASE}/cms`),
      fetch(`${API_BASE}/predictive/alerts`),
      fetch(`${API_BASE}/audit-logs`),
      fetch(`${API_BASE}/customers`),
    ];

    if (state.currentRole === 'admin') {
      fetchPromises.push(fetch(`${API_BASE}/auth/users`));
    }

    const responses = await Promise.all(fetchPromises);
    const [statsRes, devRes, tckRes, warRes, invRes, cmsRes, predRes, logsRes, custRes] = responses;

    const statsData = await statsRes.json();
    const devData = await devRes.json();
    const tckData = await tckRes.json();
    const warData = await warRes.json();
    const invData = await invRes.json();
    const cmsData = await cmsRes.json();
    const predData = await predRes.json();
    const logsData = await logsRes.json();
    const custData = await custRes.json();

    if (statsData.success) state.stats = statsData.data;
    if (devData.success) state.devices = devData.data;
    if (tckData.success) state.tickets = tckData.data;
    if (warData.success) state.warranties = warData.data;
    if (invData.success) state.inventory = invData.data;
    if (cmsData.success) state.cms = cmsData.data;
    if (predData.success) state.predictiveAlerts = predData.data;
    if (logsData.success) state.auditLogs = logsData.data;
    if (custData.success) state.customers = custData.data;

    if (responses[9]) {
      const userData = await responses[9].json();
      if (userData.success) state.allUsers = userData.data;
    }

    renderApp();
  } catch (err) {
    console.error('Failed to fetch data from backend API:', err);
    showToast('Failed to connect to backend server. Make sure the server is running.', 'error');
  }
}

// --- View Renderers ---

function renderApp() {
  renderSidebarBadges();
  applyRoleUI();
  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  const role = state.currentRole;
  const allowed = ROLE_ACCESS[role] || ROLE_ACCESS.admin;

  // If current tab is not allowed for this role, redirect to role's default
  if (!allowed.includes(state.currentTab)) {
    state.currentTab = ROLE_META[role].defaultTab;
  }

  switch (state.currentTab) {
    case 'dashboard':
      mainContent.innerHTML = renderDashboardView();
      setTimeout(initSmartBoardSimulator, 50);
      break;
    case 'showcase':
      mainContent.innerHTML = renderShowcaseView();
      setTimeout(initSmartBoardSimulator, 50);
      break;
    case 'devices':
      mainContent.innerHTML = renderDevicesView();
      break;
    case 'tickets':
      mainContent.innerHTML = renderTicketsView();
      break;
    case 'customer-portal':
      mainContent.innerHTML = renderCustomerPortalView();
      break;
    case 'warranty':
      mainContent.innerHTML = renderWarrantyView();
      break;
    case 'inventory':
      mainContent.innerHTML = renderInventoryView();
      break;
    case 'data-manager':
      mainContent.innerHTML = renderDataManagerView();
      break;
    case 'cms':
      mainContent.innerHTML = renderCmsView();
      break;
    case 'predictive':
      mainContent.innerHTML = renderPredictiveView();
      break;
    case 'analytics':
      mainContent.innerHTML = renderAnalyticsView();
      break;
    default:
      mainContent.innerHTML = renderDashboardView();
      setTimeout(initSmartBoardSimulator, 50);
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

// ==========================================================================
// MILLENNIUM INTERACTIVE SMARTBOARD SIMULATOR & SHOWCASE LOGIC
// ==========================================================================

// ==========================================================================
// MILLENNIUM INTERACTIVE SMARTBOARD SIMULATOR & SHOWCASE LOGIC
// Full Demonstration Engine for all 6 Brochure Features & 4 Display Modes
// ==========================================================================

let visualizerAnimId = null;
let whiteboardHistory = [];
let whiteboardHistoryIdx = -1;
let demoTourTimer = null;

function setSimulatorMode(mode) {
  state.simulatorMode = mode;
  state.activeFeatureDemo = null; // Exit specific demo overlay to show full OS view
  const names = {
    theater: '🎬 4K Ultra-HD Home Theater & Cinema Mode',
    whiteboard: '✏️ Interactive Digital Stylus Whiteboard (<5ms Touch)',
    windows: '🪟 Windows 11 Enterprise Mode (Modular OPS Intel Core i7)',
    android: '🤖 Android 13 Millennium OS (Universal Wireless & Multi-Touch)'
  };
  showToast(names[mode] || 'Switched Display Mode', 'info');
  renderApp();
}

function setStylusColor(color) {
  state.stylusColor = color;
  document.querySelectorAll('.color-dot').forEach(el => {
    el.classList.toggle('active', el.dataset.color === color);
  });
}

function setStylusSize(size) {
  state.stylusSize = size;
  showToast(`Stylus Tip: ${size}px`, 'info');
}

function setStylusTool(tool) {
  state.stylusTool = tool;
  document.querySelectorAll('.stylus-tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  const names = {
    pen: '✏️ Fine Stylus Pen',
    marker: '🖊️ Marker Pen',
    highlighter: '🖌️ Neon Glow Highlighter',
    laser: '🔦 Laser Pointer (Interactive)',
    eraser: '🧹 Gesture Palm Eraser'
  };
  showToast(names[tool] || 'Tool Selected', 'info');
}

function setStylusShape(shape) {
  state.stylusShape = shape;
  document.querySelectorAll('.stylus-tool-btn[data-shape]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.shape === shape);
  });
  showToast(`Shape Tool: ${shape}`, 'info');
}

function toggleWirelessDongle() {
  state.dongleConnected = !state.dongleConnected;
  showToast(
    state.dongleConnected
      ? '🟢 Millennium Wireless Dongle Connected (Screen Mirroring Active · 4K @ 60 FPS · <6ms Latency)'
      : '⚪ Millennium Wireless Dongle Disconnected',
    state.dongleConnected ? 'info' : 'warning'
  );
  renderApp();
}

// --------------------------------------------------------------------------
// 1. Feature Demonstrations Trigger & Tour Engine
// --------------------------------------------------------------------------

function startFeatureDemo(demoId) {
  state.activeFeatureDemo = demoId;
  const demoTitles = {
    uhd: '📺 Feature 1: 4K Ultra-HD Home Theater & Streaming Display',
    audio: '🎙️ Feature 2: Sensitive Audio Input & 8m Voice Pickup Radar',
    stylus: '✍️ Feature 3: Stylus Pen & Natural Hand Gesture Palm Erase',
    cast: '📲 Feature 4: Project Laptop & Cellphone on Screen',
    wireless: '📡 Feature 5: Bluetooth, Hotspot, Cast and Wi-Fi Ready',
    ops: '⚡ Feature 6: Future-Proof Modular OPS Intel Core i7 PC Slot',
    dualos: '🪟🤖 Feature 7: Dual OS (Windows 11 + Android 13)',
    camera: '📹 Feature 8: Ultrawide Angle 120° Camera & AI Auto-Framing',
    dongle: '🔘 Feature 9: Screen Transfer without Network via Dongle'
  };

  showToast(`▶ ${demoTitles[demoId] || demoId}`, 'info');

  if (demoId === 'stylus') {
    state.simulatorMode = 'whiteboard';
    renderApp();
    setTimeout(runLessonDemo, 200);
  } else if (demoId === 'uhd') {
    state.simulatorMode = 'theater';
    renderApp();
  } else if (demoId === 'audio') {
    state.simulatorMode = 'theater';
    renderApp();
  } else if (demoId === 'cast') {
    state.simulatorMode = 'android';
    state.androidState.activeApp = 'screen-share';
    renderApp();
  } else if (demoId === 'wireless') {
    state.simulatorMode = 'android';
    renderApp();
  } else if (demoId === 'ops') {
    state.simulatorMode = 'windows';
    state.windowsState.activeApp = 'ops';
    renderApp();
  } else if (demoId === 'dualos') {
    renderApp();
  } else if (demoId === 'camera') {
    state.simulatorMode = 'windows';
    state.windowsState.activeApp = 'teams';
    renderApp();
    setTimeout(runCameraScanGesture, 300);
  } else if (demoId === 'dongle') {
    renderApp();
    setTimeout(runDongleCastBeam, 300);
  } else {
    renderApp();
  }
}

function closeFeatureDemo() {
  state.activeFeatureDemo = null;
  if (demoTourTimer) {
    clearInterval(demoTourTimer);
    demoTourTimer = null;
    state.demoTourActive = false;
  }
  showToast('Live Demonstration Closed · Virtual Board Restored', 'info');
  renderApp();
}

function toggleDemoTour() {
  if (state.demoTourActive) {
    if (demoTourTimer) clearInterval(demoTourTimer);
    demoTourTimer = null;
    state.demoTourActive = false;
    state.activeFeatureDemo = null;
    showToast('⏹️ Demonstration Tour Stopped', 'info');
    renderApp();
    return;
  }

  state.demoTourActive = true;
  const demos = ['uhd', 'audio', 'stylus', 'cast', 'wireless', 'ops', 'dualos', 'camera', 'dongle'];
  let currentIdx = 0;
  startFeatureDemo(demos[currentIdx]);

  demoTourTimer = setInterval(() => {
    currentIdx = (currentIdx + 1) % demos.length;
    startFeatureDemo(demos[currentIdx]);
  }, 6000);

  showToast('🚀 System Demonstration Tour Started — Cycling all 9 brochure features!', 'info');
}

// COOL MOTION GESTURE 1: Hand Gesture Palm Erase with Shockwave Wipe
function runHandPalmEraseGesture() {
  const viewport = document.querySelector('.board-viewport');
  const canvas = document.getElementById('virtualBoardCanvas');
  if (!viewport || !canvas) {
    showToast('Switch to Stylus Board to test Palm Erase gesture', 'warning');
    return;
  }

  // Create Holographic Hand Element
  const palmEl = document.createElement('div');
  palmEl.className = 'holographic-hand-sweep';
  palmEl.innerHTML = `
    <div class="palm-visual-box">
      <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="#00f2fe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
        <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
        <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
      </svg>
      <div class="palm-shockwave-ring"></div>
      <div class="palm-label">✋ PALM GESTURE ERASE</div>
    </div>
  `;
  viewport.appendChild(palmEl);

  // Progressive Shockwave Wipe on Canvas
  const ctx = canvas.getContext('2d');
  let progress = 0;
  const wipeInterval = setInterval(() => {
    progress += 0.08;
    ctx.clearRect(0, 0, canvas.width * progress, canvas.height);
    if (progress >= 1.05) {
      clearInterval(wipeInterval);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      whiteboardHistory = [canvas.toDataURL()];
      whiteboardHistoryIdx = 0;
      setTimeout(() => palmEl.remove(), 350);
      showToast('🧹 Hand Gesture Palm Erase: Screen wiped clean with natural palm gesture!', 'success');
    }
  }, 22);
}

// COOL MOTION GESTURE 2: Floating Stylus Pen Drawing Gesture
function runStylusDrawingGesture() {
  const canvas = document.getElementById('virtualBoardCanvas');
  const viewport = document.querySelector('.board-viewport');
  if (!canvas || !viewport) {
    state.simulatorMode = 'whiteboard';
    state.activeFeatureDemo = 'stylus';
    renderApp();
    setTimeout(runStylusDrawingGesture, 250);
    return;
  }

  // Spawn Stylus Actor with Neon Trail
  const stylusActor = document.createElement('div');
  stylusActor.className = 'animated-stylus-actor';
  stylusActor.innerHTML = `
    <div class="stylus-pen-graphic">
      <div class="stylus-laser-glow"></div>
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#00f2fe" stroke-width="2">
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" fill="#0b1329"/>
      </svg>
      <span class="stylus-label">Stylus Active (&lt;5ms)</span>
    </div>
  `;
  viewport.appendChild(stylusActor);

  runLessonDemo();

  setTimeout(() => {
    stylusActor.remove();
    showToast('✍️ Stylus Pen Gesture: Smooth 4K digital ink drawn with precision tip!', 'success');
  }, 1400);
}

// COOL MOTION GESTURE 3: Hardware Dongle Magnetic Pulse Beam
function runDongleCastBeam() {
  state.dongleConnected = true;
  const viewport = document.querySelector('.board-viewport');
  if (viewport) {
    const beam = document.createElement('div');
    beam.className = 'dongle-cast-beam-fx';
    beam.innerHTML = `
      <div class="dongle-beam-core"></div>
      <div class="dongle-beam-badge">
        <span>🔘 DONGLE WIRELESS TRANSFER · 4K @ 60 FPS · &lt;6ms LATENCY</span>
      </div>
    `;
    viewport.appendChild(beam);
    setTimeout(() => beam.remove(), 1600);
  }
  showToast('⚡ Screen Transfer: Laptop 4K stream transmitted wirelessly using Dongle!', 'success');
  renderApp();
}

// COOL MOTION GESTURE 4: Ultrawide Angle 120° Camera AI Scan
function runCameraScanGesture() {
  const viewport = document.querySelector('.board-viewport');
  if (!viewport) return;
  const cone = document.createElement('div');
  cone.className = 'camera-fov-sweep-fx';
  cone.innerHTML = `
    <div class="camera-cone-light"></div>
    <div class="camera-target-reticle pos-left">
      <div class="reticle-box"></div>
      <div class="reticle-tag">Speaker 1 (Teacher/Presenter) · 98% Voice</div>
    </div>
    <div class="camera-target-reticle pos-right">
      <div class="reticle-box"></div>
      <div class="reticle-tag">Student Question · 96% Voice</div>
    </div>
  `;
  viewport.appendChild(cone);
  showToast('📹 Ultrawide 120° Camera: AI speaker auto-framing active for online meetings!', 'info');
  setTimeout(() => cone.remove(), 3600);
}

// COOL MOTION GESTURE 5: 3D Dual-OS Card Flip (Windows ⇄ Android)
function toggleDualOSFlip() {
  const targetMode = state.simulatorMode === 'windows' ? 'android' : 'windows';
  const frame = document.querySelector('.millennium-board-frame');
  if (frame) {
    frame.classList.add('dualos-flip-anim');
    setTimeout(() => {
      state.simulatorMode = targetMode;
      state.activeFeatureDemo = 'dualos';
      renderApp();
      const newFrame = document.querySelector('.millennium-board-frame');
      if (newFrame) newFrame.classList.remove('dualos-flip-anim');
      showToast(`🪟 Windows ⇄ 🤖 Android: Switched to ${targetMode === 'windows' ? 'Windows 11 Enterprise (Intel Core i7)' : 'Android 13 Millennium OS'} in <1.2s!`, 'success');
    }, 320);
  } else {
    state.simulatorMode = targetMode;
    state.activeFeatureDemo = 'dualos';
    renderApp();
  }
}

function toggleNoiseSuppression() {
  state.noiseSuppressionActive = !state.noiseSuppressionActive;
  showToast(
    state.noiseSuppressionActive
      ? '🎙️ Sensitive Audio Input: AI Voice Clarity Active — Background HVAC & classroom chatter suppressed (98% Clarity)'
      : '🎙️ Raw Mic Mode: Ambient classroom room sound unsuppressed',
    'info'
  );
  renderApp();
}

function toggleOpsCartridge() {
  state.opsEjected = !state.opsEjected;
  showToast(
    state.opsEjected
      ? '⚠️ Intel Core i7 OPS Cartridge Ejected from JAE 80-pin Slot (Running on Android SoC)'
      : '🟢 Intel Core i7 OPS Module Inserted & Locked (Dual-OS Active)',
    state.opsEjected ? 'warning' : 'info'
  );
  renderApp();
}

// --------------------------------------------------------------------------
// 2. Mode 1: 4K Cinema / Home Theater Simulator
// --------------------------------------------------------------------------

function toggleTheaterPlay() {
  state.theaterState.playing = !state.theaterState.playing;
  showToast(
    state.theaterState.playing ? '▶ 4K Media Playback Resumed' : '⏸ 4K Media Paused',
    'info'
  );
  renderApp();
}

function setTheaterChannel(ch) {
  state.theaterState.channel = ch;
  showToast(`4K Media Stream: ${ch.toUpperCase()} (HDR10+)`, 'info');
  renderApp();
}

function setTheaterResolution(res) {
  state.theaterState.resolution = res;
  showToast(`Display Resolution Switched: ${res}`, 'info');
  renderApp();
}

function setTheaterScrub(val) {
  state.theaterState.timeSeconds = Math.floor((val / 100) * state.theaterState.totalSeconds);
  const timeEl = document.getElementById('theaterTimecode');
  if (timeEl) {
    const mins = Math.floor(state.theaterState.timeSeconds / 60);
    const secs = state.theaterState.timeSeconds % 60;
    timeEl.textContent = `0${mins}:${secs < 10 ? '0' : ''}${secs} / 06:00`;
  }
}

function setAntiGlareSplit(val) {
  state.theaterState.antiGlareSplit = val;
  const overlay = document.getElementById('antiGlareReflectionLayer');
  if (overlay) {
    overlay.style.clipPath = `polygon(${val}% 0, 100% 0, 100% 100%, ${val}% 100%)`;
  }
}

function initTheaterVisualizer() {
  const canvas = document.getElementById('theaterVisualizerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (visualizerAnimId) cancelAnimationFrame(visualizerAnimId);

  let phase = 0;
  function draw() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 18;
    const barWidth = canvas.width / bars - 2;

    for (let i = 0; i < bars; i++) {
      const isPlaying = state.theaterState.playing;
      const heightMultiplier = isPlaying ? Math.sin(phase + i * 0.45) * 0.5 + 0.5 : 0.08;
      const barHeight = Math.max(3, heightMultiplier * (canvas.height - 4));
      const x = i * (barWidth + 2);
      const y = canvas.height - barHeight;

      const grad = ctx.createLinearGradient(0, y, 0, canvas.height);
      grad.addColorStop(0, '#00f2fe');
      grad.addColorStop(1, '#a855f7');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
    phase += 0.08;
    visualizerAnimId = requestAnimationFrame(draw);
  }
  draw();
}

// --------------------------------------------------------------------------
// 3. Mode 2: Stylus Board (Draw, Sketch, Layout & Delete)
// --------------------------------------------------------------------------

function clearWhiteboardCanvas() {
  const canvas = document.getElementById('virtualBoardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  whiteboardHistory = [];
  whiteboardHistoryIdx = -1;
  showToast('Whiteboard Cleared', 'info');
}

function undoWhiteboard() {
  if (whiteboardHistoryIdx <= 0) {
    showToast('Nothing to undo', 'info');
    return;
  }
  whiteboardHistoryIdx--;
  const canvas = document.getElementById('virtualBoardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = whiteboardHistory[whiteboardHistoryIdx];
  showToast('↩️ Undo', 'info');
}

function redoWhiteboard() {
  if (whiteboardHistoryIdx >= whiteboardHistory.length - 1) {
    showToast('Nothing to redo', 'info');
    return;
  }
  whiteboardHistoryIdx++;
  const canvas = document.getElementById('virtualBoardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = whiteboardHistory[whiteboardHistoryIdx];
  showToast('↪️ Redo', 'info');
}

function exportWhiteboardImage() {
  const canvas = document.getElementById('virtualBoardCanvas');
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `Millennium_SmartBoard_Notes_${Date.now()}.png`;
  link.href = dataUrl;
  link.click();
  showToast('💾 Whiteboard Notes Exported as PNG', 'info');
}

function runLessonDemo() {
  const canvas = document.getElementById('virtualBoardCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.font = '700 16px "Outfit", sans-serif';
  ctx.fillStyle = '#00f2fe';
  ctx.fillText('⚡ MILLENNIUM 86" INTERACTIVE SMARTBOARD ARCHITECTURE', 24, 38);

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#38bdf8';

  // Draw SmartBoard Bezel Box
  ctx.strokeRect(24, 55, 230, 110);
  ctx.font = '600 12px "Outfit", sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText('🖥️ 4K Ultra-HD Display', 36, 85);
  ctx.fillText('• 40-Point Multi-Touch', 36, 105);
  ctx.fillText('• Zero-Bonding Anti-Glare', 36, 125);
  ctx.fillText('• <5ms Touch Response', 36, 145);

  // Connecting Arrow to OPS
  ctx.beginPath();
  ctx.strokeStyle = '#a855f7';
  ctx.moveTo(254, 110);
  ctx.lineTo(340, 110);
  ctx.stroke();

  // OPS Intel Box
  ctx.strokeRect(340, 60, 200, 100);
  ctx.fillStyle = '#c084fc';
  ctx.fillText('💻 Intel Core i7 OPS Module', 352, 90);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('• 16GB RAM · 512GB SSD', 352, 110);
  ctx.fillText('• Windows 11 Enterprise', 352, 130);

  // Connecting Arrow to Wireless Dongle
  ctx.beginPath();
  ctx.strokeStyle = '#ec4899';
  ctx.moveTo(139, 165);
  ctx.lineTo(139, 215);
  ctx.stroke();

  // Wireless Dongle Box
  ctx.strokeRect(40, 215, 200, 80);
  ctx.fillStyle = '#f472b6';
  ctx.fillText('📲 Wireless Screen Dongle', 52, 245);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('• Zero Wi-Fi Required', 52, 265);
  ctx.fillText('• 4K @ 60 FPS · <6ms latency', 52, 285);

  // Teacher / Student Collaboration Box
  ctx.strokeRect(340, 200, 200, 95);
  ctx.strokeStyle = '#34d399';
  ctx.stroke();
  ctx.fillStyle = '#34d399';
  ctx.fillText('🎓 Classroom & Boardroom SLA', 352, 230);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('• Dual Stylus Recognition', 352, 250);
  ctx.fillText('• Palm Rejection Active', 352, 270);

  // Save to history stack
  whiteboardHistory = [canvas.toDataURL()];
  whiteboardHistoryIdx = 0;
  showToast('✨ Interactive Lesson Demo Diagram Generated', 'info');
}

function initWhiteboardCanvas() {
  const canvas = document.getElementById('virtualBoardCanvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width > 0 ? rect.width : 760;
  const height = rect.height > 0 ? rect.height : 420;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (whiteboardHistory.length === 0) {
    ctx.font = '600 14px "Outfit", sans-serif';
    ctx.fillStyle = 'rgba(0, 242, 254, 0.45)';
    ctx.fillText('✍️ Millennium Stylus Digital Ink — Draw, sketch, and test gestures with <5ms touch response!', 20, 36);
    whiteboardHistory = [canvas.toDataURL()];
    whiteboardHistoryIdx = 0;
  }

  let isDown = false;
  let startX = 0;
  let startY = 0;
  let snapshot = null;

  function getCoords(e) {
    const cRect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - cRect.left,
      y: clientY - cRect.top
    };
  }

  function startDraw(e) {
    isDown = true;
    const coords = getCoords(e);
    startX = coords.x;
    startY = coords.y;

    if (state.stylusShape !== 'freehand') {
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
    }
  }

  function doDraw(e) {
    if (!isDown) return;
    const coords = getCoords(e);

    const tool = state.stylusTool || 'pen';
    if (tool === 'eraser') {
      ctx.strokeStyle = '#090e1a';
      ctx.lineWidth = 24;
    } else if (tool === 'highlighter') {
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.28)';
      ctx.lineWidth = 18;
    } else if (tool === 'marker') {
      ctx.strokeStyle = state.stylusColor || '#00f2fe';
      ctx.lineWidth = 7;
    } else {
      ctx.strokeStyle = state.stylusColor || '#00f2fe';
      ctx.lineWidth = state.stylusSize || 3;
    }

    if (state.stylusShape === 'freehand') {
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    } else {
      if (snapshot) ctx.putImageData(snapshot, 0, 0);
      ctx.beginPath();
      if (state.stylusShape === 'line') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(coords.x, coords.y);
      } else if (state.stylusShape === 'arrow') {
        ctx.moveTo(startX, startY);
        ctx.lineTo(coords.x, coords.y);
        const angle = Math.atan2(coords.y - startY, coords.x - startX);
        ctx.lineTo(coords.x - 12 * Math.cos(angle - Math.PI / 6), coords.y - 12 * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(coords.x, coords.y);
        ctx.lineTo(coords.x - 12 * Math.cos(angle + Math.PI / 6), coords.y - 12 * Math.sin(angle + Math.PI / 6));
      } else if (state.stylusShape === 'rect') {
        ctx.strokeRect(startX, startY, coords.x - startX, coords.y - startY);
      } else if (state.stylusShape === 'circle') {
        const radius = Math.sqrt(Math.pow(coords.x - startX, 2) + Math.pow(coords.y - startY, 2));
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
      }
      ctx.stroke();
    }
  }

  function stopDraw() {
    if (!isDown) return;
    isDown = false;
    // Push state to history
    if (whiteboardHistoryIdx < whiteboardHistory.length - 1) {
      whiteboardHistory = whiteboardHistory.slice(0, whiteboardHistoryIdx + 1);
    }
    whiteboardHistory.push(canvas.toDataURL());
    whiteboardHistoryIdx = whiteboardHistory.length - 1;
  }

  canvas.onmousedown = startDraw;
  canvas.onmousemove = doDraw;
  canvas.onmouseup = stopDraw;
  canvas.onmouseleave = stopDraw;

  canvas.ontouchstart = (e) => { e.preventDefault(); startDraw(e); };
  canvas.ontouchmove = (e) => { e.preventDefault(); doDraw(e); };
  canvas.ontouchend = stopDraw;
}

// --------------------------------------------------------------------------
// 4. Mode 3: Windows 11 Enterprise Mode (Intel Core i7 OPS)
// --------------------------------------------------------------------------

function openWinApp(app) {
  state.windowsState.activeApp = app;
  const names = {
    powerpoint: 'Microsoft PowerPoint 4K Presentation',
    teams: 'Microsoft Teams & Zoom 4K Ultrawide Conference',
    edge: 'Microsoft Edge — Millennium Fleet Portal',
    ops: 'OPS Intel Core i7 Diagnostic Monitor'
  };
  showToast(`Launched: ${names[app] || app}`, 'info');
  renderApp();
}

function closeWinApp() {
  state.windowsState.activeApp = null;
  renderApp();
}

function toggleWinStartMenu() {
  state.windowsState.startMenuOpen = !state.windowsState.startMenuOpen;
  renderApp();
}

function nextWinSlide() {
  state.windowsState.slideIdx = (state.windowsState.slideIdx + 1) % 5;
  renderApp();
}

function prevWinSlide() {
  state.windowsState.slideIdx = (state.windowsState.slideIdx - 1 + 5) % 5;
  renderApp();
}

function toggleTeamsMute() {
  state.windowsState.teamsMuted = !state.windowsState.teamsMuted;
  showToast(
    state.windowsState.teamsMuted ? '🔇 Microphone Muted' : '🎙️ Microphone Unmuted (98% Clarity)',
    'info'
  );
  renderApp();
}

function toggleTeamsCamera() {
  state.windowsState.teamsCamera = !state.windowsState.teamsCamera;
  showToast(
    state.windowsState.teamsCamera ? '📹 4K Camera Active (120° FOV AI Framing)' : '📷 Camera Disabled',
    'info'
  );
  renderApp();
}

// --------------------------------------------------------------------------
// 5. Mode 4: Android 13 Interactive OS Mode
// --------------------------------------------------------------------------

function toggleAndroidQuickSettings() {
  state.androidState.quickSettingsOpen = !state.androidState.quickSettingsOpen;
  renderApp();
}

function toggleAndroidEyeCare() {
  state.androidState.eyeCare = !state.androidState.eyeCare;
  showToast(
    state.androidState.eyeCare
      ? '👓 Eye-Care Blue Light Warmth Filter Active (Comfort Mode)'
      : '👓 Natural Color Temperature Restored',
    'info'
  );
  renderApp();
}

function setAndroidBrightness(val) {
  state.androidState.brightness = val;
  const board = document.querySelector('.board-viewport');
  if (board) board.style.filter = `brightness(${val}%)`;
}

function setAndroidVolume(val) {
  state.androidState.volume = val;
  showToast(`Volume: ${val}%`, 'info');
}

function openAndroidApp(app) {
  state.androidState.activeApp = app;
  renderApp();
}

function closeAndroidApp() {
  state.androidState.activeApp = null;
  renderApp();
}

function toggleCastClient(id) {
  showToast(`Toggled Cast Client Stream ${id}`, 'info');
}

// --------------------------------------------------------------------------
// 6. Master Simulator Initializer (Touch Ripples, Audio Radar & Canvas)
// --------------------------------------------------------------------------

function initSmartBoardSimulator() {
  const viewport = document.querySelector('.board-viewport');
  if (viewport && !viewport._hasTouchRipple) {
    viewport._hasTouchRipple = true;
    viewport.addEventListener('click', (e) => {
      const rect = viewport.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'touch-ripple';
      ripple.style.left = `${e.clientX - rect.left}px`;
      ripple.style.top = `${e.clientY - rect.top}px`;
      viewport.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  if (state.simulatorMode === 'whiteboard') {
    initWhiteboardCanvas();
  } else if (state.simulatorMode === 'theater') {
    initTheaterVisualizer();
  }
}

// --------------------------------------------------------------------------
// 7. Render Showcase & Interactive SmartBoard View
// --------------------------------------------------------------------------

function renderMillenniumShowcase() {
  const curMode = state.simulatorMode || 'theater';
  const isConnected = state.dongleConnected !== false;
  const activeDemo = state.activeFeatureDemo;
  const winState = state.windowsState;
  const andState = state.androidState;
  const thState = state.theaterState;

  // Powerpoint slide deck metadata
  const pptSlides = [
    {
      title: 'MILLENNIUM INTERACTIVE SMARTBOARD',
      subtitle: '86" Flagship Display · Brains Infinite Innovations Inc.',
      body: 'Transform classrooms, conference rooms, and home theaters into state-of-the-art collaborative centers.',
      badge: 'SLIDE 1/5 · SYSTEM OVERVIEW'
    },
    {
      title: 'MODULAR INTEL CORE i7 OPS MODULE',
      subtitle: 'Scalable Computing Architecture via JAE 80-pin Slot',
      body: 'Zero cable clutter. Runs Windows 11 Enterprise alongside Android 13 with instant 1.2-second OS switching.',
      badge: 'SLIDE 2/5 · OPS COMPUTING'
    },
    {
      title: '40-POINT TOUCH & ZERO-BONDING GLASS',
      subtitle: '<5ms Touch Response · Dual Stylus Recognition',
      body: 'Natural hand gestures, palm rejection, and optical anti-glare coating engineered for all-day comfortable viewing.',
      badge: 'SLIDE 3/5 · TOUCH INTERACTION'
    },
    {
      title: 'WIRELESS SCREEN DONGLE STREAMING',
      subtitle: 'Plug-and-Play Screen Mirroring (Zero Wi-Fi Required)',
      body: 'Instant wireless transmission from laptops and mobile phones at 4K @ 60 FPS with bidirectional touch control.',
      badge: 'SLIDE 4/5 · WIRELESS CASTING'
    },
    {
      title: 'ENTERPRISE SLA & 3-YEAR WARRANTY',
      subtitle: 'Official Warranty & On-Site Technical Support Coverage',
      body: 'Suite 1004 Atlanta Center, Greenhills San Juan Philippines. Complete parts inventory, hot-swappable modules, and SLA support.',
      badge: 'SLIDE 5/5 · AFTER-SALES SERVICE'
    }
  ];

  return `
    <div class="millennium-showcase-container">

      <!-- Top Showcase Header -->
      <div class="showcase-header">
        <div class="showcase-title-box">
          <div class="showcase-eyebrow">
            <span>⚡ Interactive SmartBoard Simulator & Showcase</span>
            <span>·</span>
            <span>Brains Infinite Innovations Inc.</span>
          </div>
          <div class="showcase-heading">
            <span class="millennium-word" style="font-size:1.6rem;">MILLENNIUM</span>
            <span style="color:var(--text-secondary);font-weight:400;font-size:1.15rem;">Interactive SmartBoard (86" Flagship)</span>
          </div>
          <div class="showcase-subtext">
            Millennium is a <strong>smart interactive board</strong> that can do presentations in the classroom, conference room, home theater, or anywhere requiring engaging collaboration.
          </div>
        </div>

        <!-- 4 Primary Display Mode Switcher Tabs -->
        <div class="board-mode-tabs" role="tablist">
          <button class="board-mode-btn ${curMode === 'theater' && !activeDemo ? 'active' : ''}" onclick="setSimulatorMode('theater')" title="4K Ultra-HD Cinema & Home Theater">
            🎬 4K Cinema
          </button>
          <button class="board-mode-btn ${curMode === 'whiteboard' && !activeDemo ? 'active' : ''}" onclick="setSimulatorMode('whiteboard')" title="Interactive Digital Ink Stylus Whiteboard">
            ✏️ Stylus Board
          </button>
          <button class="board-mode-btn ${curMode === 'windows' && !activeDemo ? 'active' : ''}" onclick="setSimulatorMode('windows')" title="Windows 11 Pro Enterprise Mode (OPS Module)">
            🪟 Windows 11
          </button>
          <button class="board-mode-btn ${curMode === 'android' && !activeDemo ? 'active' : ''}" onclick="setSimulatorMode('android')" title="Android 13 Millennium OS Mode">
            🤖 Android 13
          </button>
        </div>
      </div>

      

      <!-- Active Demonstration Spotlight Banner (Displayed when a feature demo is running) -->
      ${activeDemo ? `
        <div class="demo-active-banner">
          <div class="demo-active-info">
            <div class="demo-live-dot"></div>
            <div>
              <div class="demo-active-title">
                ${{ uhd:'LIVE DEMO: 4K Ultra High-Definition Display — Home Theater & Streaming', audio:'LIVE DEMO: Sensitive Audio Input — Maximum Voice Clarity for Meetings & Classes', stylus:'LIVE DEMO: Draw, Sketch, Layout & Delete with Stylus Pen & Hand Gestures', cast:'LIVE DEMO: Project Your Laptop & Cellphone on Screen (Local & Online Sharing)', wireless:'LIVE DEMO: Bluetooth, Hotspot, Cast & Wi-Fi Ready — All Wireless Connectivity', ops:'LIVE DEMO: Future-Proof Modular OPS Intel Core i7 Scalable Computing', dualos:'LIVE DEMO: Dual OS — Windows 11 Enterprise & Android 13 (1.2s Hot-Switch)', camera:'LIVE DEMO: Ultrawide Angle Camera — 120° FOV & AI Speaker Auto-Framing', dongle:'LIVE DEMO: Screen Transfer Without Network — Control via Dongle' }[activeDemo] || 'LIVE DEMO: ' + activeDemo.toUpperCase()}
              </div>
              <div class="demo-active-desc">
                Interactive virtual demonstration on simulated Millennium 86&quot; hardware — interact with the controls below!
              </div>
            </div>
          </div>
          <div class="demo-banner-actions">
            <button class="btn btn-secondary btn-sm" onclick="closeFeatureDemo()" style="font-size:0.75rem;padding:4px 12px;">
              ✕ Exit Demo
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Main Showcase Grid: Physical SmartBoard + Controls -->
      <div class="showcase-main-grid">

        <!-- Physical Bezel Frame with Dynamic Ambilight Backglow -->
        <div class="millennium-board-frame">
          
          <!-- Top Ultrawide Camera Module Notch -->
          <div class="board-camera-notch" onclick="showToast('📹 Millennium 4K Ultrawide 120° FOV Camera with AI Speaker Framing', 'info')" title="Ultrawide Angle Camera for online meetings and presentations">
            <div class="cam-lens"></div>
            <div class="cam-led"></div>
            <span class="cam-text">4K Ultrawide 120° FOV</span>
          </div>

          <!-- Active Screen Viewport -->
          <div class="board-viewport ${andState.eyeCare ? 'eye-care-warm' : ''}">

            <!-- ========================================================== -->
            <!-- IN-BOARD FEATURE DEMONSTRATION OVERLAYS                    -->
            <!-- ========================================================== -->

            ${activeDemo === 'uhd' ? `
              <!-- Demo 1: 4K UHD Display Inspector -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 1 OF 9 — FROM BROCHURE</span></div>
                    <div class="demo-stage-title">4K Ultra High-Definition Display</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>

                <div class="demo-uhd-grid">
                  <div class="demo-uhd-preview-box">
                    <div class="subpixel-grid-pattern"></div>
                    <div style="z-index:2;text-align:center;padding:16px;">
                      <div style="font-family:'Cinzel',serif;font-size:1.6rem;font-weight:900;color:#00f2fe;text-shadow:0 0 16px rgba(0,242,254,0.8);">3840 × 2160 UHD</div>
                      <div style="font-size:0.8rem;color:#e2e8f0;margin-top:4px;">8.29 Million Pixels · Zero-Bonding Glass · 400 nits</div>
                      <div style="margin-top:12px;display:flex;gap:6px;justify-content:center;">
                        <span class="theater-badge">60 FPS Motion Clarity ✅</span>
                        <span class="theater-badge" style="color:#34d399;">99% DCI-P3 Gamut ✅</span>
                      </div>
                    </div>
                  </div>
                  <div class="demo-specs-list">
                    <div class="demo-spec-item"><span>Native Resolution:</span><strong style="color:var(--neon-cyan);">3840 × 2160 (16:9 Ultra HD)</strong></div>
                    <div class="demo-spec-item"><span>Color Depth:</span><strong>1.07 Billion Colors (10-bit HDR)</strong></div>
                    <div class="demo-spec-item"><span>Anti-Glare Glass:</span><strong style="color:#34d399;">Zero-Gap Optical Bonding (4mm Toughened)</strong></div>
                    <div class="demo-explanation-box">
                      <div class="deb-quote">"4K Ultra High-Definition display for Home theater. Perfect for Netflix and streaming."</div>
                      <div class="deb-howto"><strong>What it does:</strong> The 86" display outputs crystal-clear 4K video — 4× sharper than Full HD. <strong>Try it:</strong> Click the cinema player button below to see the 4K media demo in action.</div>
                      <button class="deb-gesture-btn" onclick="setSimulatorMode('theater')">🎬 Open 4K Cinema Player</button>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}

            ${activeDemo === 'audio' ? `
              <!-- Demo 2: Audio Radar & Soundstage Demo -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 2 DEMONSTRATION</span></div>
                    <div class="demo-stage-title">Sensitive Audio Input & 8-Meter Voice Radar Array</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>

                <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px;flex:1;align-items:center;">
                  <div class="demo-radar-wrap">
                    <div class="acoustic-radar-circle">
                      <div class="radar-sweep-beam"></div>
                      <div style="z-index:2;text-align:center;font-size:0.75rem;font-weight:700;">
                        <div style="font-size:1.4rem;">🎙️</div>
                        <div style="color:var(--neon-cyan);">8m Radius</div>
                        <div style="color:#34d399;font-size:0.68rem;">360° Omnidirectional</div>
                      </div>
                    </div>
                    <div style="margin-top:10px;font-size:0.75rem;color:#cbd5e1;text-align:center;">
                      Active Beamforming: Tracking Speaker 1 at 3.4m (Angle: 42°)
                    </div>
                  </div>

                  <div style="display:flex;flex-direction:column;gap:10px;">
                    <div class="demo-spec-item">
                      <span>Pickup Sensitivity:</span>
                      <strong style="color:var(--neon-cyan);">-38dB ± 1dB High Sensitivity</strong>
                    </div>
                    <div class="demo-spec-item">
                      <span>Echo Cancellation:</span>
                      <strong style="color:#34d399;">Hardware DSP AEC Active</strong>
                    </div>
                    <div class="demo-spec-item">
                      <span>AI Noise Suppression:</span>
                      <button class="btn btn-sm ${state.noiseSuppressionActive ? 'btn-primary' : 'btn-secondary'}" onclick="toggleNoiseSuppression()" style="font-size:0.72rem;padding:3px 8px;">
                        ${state.noiseSuppressionActive ? '🟢 Active (98% Clarity)' : '⚪ Raw Ambient'}
                      </button>
                    </div>
                    <div class="demo-explanation-box" style="margin-top:6px;">
                      <div class="deb-quote">"Sensitive audio input for maximum voice clarity."</div>
                      <div class="deb-howto"><strong>What it does:</strong> The board's built-in microphone picks up voices from up to 8 meters away in any direction. <strong>Try it:</strong> Toggle the AI Noise Suppression button to hear the difference between raw ambient sound and crystal-clear voice pickup.</div>
                      <button class="deb-gesture-btn" onclick="toggleNoiseSuppression()">⚡ Toggle Voice Clarity (AI Noise Suppression)</button>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}


            ${activeDemo === 'stylus' ? `
              <!-- Demo 3: Stylus Pen & Gesture Board -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 3 OF 9 — FROM BROCHURE</span></div>
                    <div class="demo-stage-title">Draw, Sketch, Layout & Delete — Stylus Pen & Hand Gestures</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>
                <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px;flex:1;align-items:start;">
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    <div class="demo-spec-item"><span>Touch Points:</span><strong style="color:var(--neon-cyan);">40-Point Multi-Touch Simultaneous</strong></div>
                    <div class="demo-spec-item"><span>Touch Latency:</span><strong style="color:#34d399;">&lt; 5ms Response</strong></div>
                    <div class="demo-spec-item"><span>Palm Rejection:</span><strong>Hardware-Level (Rest hand freely)</strong></div>
                    <div class="demo-spec-item"><span>Stylus Support:</span><strong>Dual Active Stylus Pen Recognition</strong></div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
                      <button class="btn btn-secondary btn-sm" onclick="setSimulatorMode('whiteboard');closeFeatureDemo()" style="font-size:0.74rem;">✍️ Open Stylus Board</button>
                    </div>
                  </div>
                  <div class="demo-explanation-box">
                    <div class="deb-quote">"Draw, sketch, layout and delete using a stylus pen and hand gestures."</div>
                    <div class="deb-howto"><strong>What it does:</strong> Use the bundled stylus pen to write, draw diagrams, and annotate slides on the 86" screen. Your palm rests naturally without causing accidental marks. <strong>Try it:</strong> Click the gesture button to watch the stylus auto-draw a diagram, then use Palm Erase to wipe it clean.</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                      <button class="deb-gesture-btn" onclick="runStylusDrawingGesture()">✍️ Run Stylus Drawing Gesture</button>
                      <button class="deb-gesture-btn" style="background:rgba(168,85,247,0.18);border-color:rgba(168,85,247,0.5);" onclick="runHandPalmEraseGesture()">🖐️ Run Palm Erase Gesture</button>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}

            ${activeDemo === 'cast' ? `
              <!-- Demo 4: Screen Cast / Screen Projection -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 4 OF 9 — FROM BROCHURE</span></div>
                    <div class="demo-stage-title">Project Your Laptop & Cellphone on Screen</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>
                <div class="demo-cast-split-grid">
                  <div class="cast-quad-tile">
                    <div class="cast-quad-header"><span>💻 Windows Laptop (Dongle)</span><span style="color:#34d399;">4K @ 60 FPS</span></div>
                    <div style="text-align:center;padding:12px;font-size:0.8rem;color:#cbd5e1;">📊 Millennium Pitch Deck (PowerPoint)</div>
                    <div style="font-size:0.68rem;color:#94a3b8;display:flex;justify-content:space-between;">
                      <span>Latency: <strong>5ms</strong></span>
                      <button class="btn btn-secondary btn-sm" onclick="showToast('💻 Laptop stream toggled!','info')" style="font-size:0.65rem;padding:2px 6px;">Toggle</button>
                    </div>
                  </div>
                  <div class="cast-quad-tile">
                    <div class="cast-quad-header"><span>📱 Android Phone (Cast)</span><span style="color:#c084fc;">1080p Stream</span></div>
                    <div style="text-align:center;padding:12px;font-size:0.8rem;color:#cbd5e1;">📹 Live Mobile Camera Feed</div>
                    <div style="font-size:0.68rem;color:#94a3b8;display:flex;justify-content:space-between;">
                      <span>Latency: <strong>8ms</strong></span>
                      <button class="btn btn-secondary btn-sm" onclick="showToast('📱 Phone cast toggled!','info')" style="font-size:0.65rem;padding:2px 6px;">Toggle</button>
                    </div>
                  </div>
                  <div class="cast-quad-tile" style="grid-column:span 2;">
                    <div class="demo-explanation-box" style="margin:0;">
                      <div class="deb-quote">"Project your laptop and your cellphone on the screen and share it across all your audience locally and online."</div>
                      <div class="deb-howto"><strong>What it does:</strong> Mirror or extend any laptop or phone screen onto the 86" board — wirelessly. Audience in the room and online (via Teams/Zoom) all see the same content. <strong>Try it:</strong> Click the Dongle Beam gesture to simulate a wireless laptop connection in real-time.</div>
                      <button class="deb-gesture-btn" onclick="runDongleCastBeam()">📡 Simulate Screen Cast Beam</button>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}

            ${activeDemo === 'wireless' ? `
              <!-- Demo 5: Full Wireless Connectivity Diagnostics -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 5 DEMONSTRATION</span></div>
                    <div class="demo-stage-title">Full Universal Wireless Connectivity Diagnostic Hub</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>

                <div class="wireless-diag-row">
                  <div class="diag-pod">
                    <div style="font-size:1.6rem;">📶</div>
                    <div style="font-weight:700;font-size:0.8rem;">Wi-Fi 6 Dual-Band</div>
                    <div class="diag-speed-gauge">1.2 Gbps</div>
                    <div style="font-size:0.7rem;color:#94a3b8;">5.8 GHz Low-Jitter Ping: 3ms</div>
                  </div>
                  <div class="diag-pod">
                    <div style="font-size:1.6rem;">📡</div>
                    <div style="font-weight:700;font-size:0.8rem;">5GHz Screen Hotspot</div>
                    <div class="diag-speed-gauge" style="color:var(--neon-cyan);">16 Clients</div>
                    <div style="font-size:0.7rem;color:#94a3b8;">Zero Conference Router Needed</div>
                  </div>
                  <div class="diag-pod">
                    <div style="font-size:1.6rem;">⚡</div>
                    <div style="font-weight:700;font-size:0.8rem;">Bluetooth 5.2 Hub</div>
                    <div class="diag-speed-gauge" style="color:#c084fc;">3 Paired</div>
                    <div style="font-size:0.7rem;color:#94a3b8;">Active Pen · Mic · Speaker</div>
                  </div>
                </div>
                <div class="demo-explanation-box" style="margin-top:14px;">
                  <div class="deb-quote">"Bluetooth, hotspot, cast and WiFi ready for wireless connectivity."</div>
                  <div class="deb-howto"><strong>What it does:</strong> The board is wireless from every angle — connect to your office Wi-Fi, create its own hotspot for participants, pair Bluetooth accessories, and cast screens. No cable clutter. <strong>Try it:</strong> The diagnostics above show live wireless stats. Toggle the dongle on the right panel to see Screen Cast in action.</div>
                  <button class="deb-gesture-btn" onclick="startFeatureDemo('dongle')">🔘 Test Wireless Dongle (No Network)</button>
                </div>
              </div>
            ` : ''}

            ${activeDemo === 'ops' ? `
              <!-- Demo 6: Modular OPS Architecture -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 6 DEMONSTRATION</span></div>
                    <div class="demo-stage-title">Future-Proof System Design (Open Pluggable Specification)</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>

                <div class="ops-slot-demo-bay">
                  <div class="ops-cartridge-graphic ${state.opsEjected ? 'ejected' : ''}">
                    <div style="font-size:1.8rem;">💻</div>
                    <div>
                      <div style="font-weight:800;font-size:0.88rem;color:#38bdf8;">Intel Core i7 OPS Cartridge</div>
                      <div style="font-size:0.72rem;color:#cbd5e1;">JAE 80-Pin Interconnect Standard</div>
                      <div style="font-size:0.7rem;color:#94a3b8;margin-top:2px;">
                        ${state.opsEjected ? '⚠️ Ejected (Running on Android SoC)' : '🟢 Locked (Dual-OS Active)'}
                      </div>
                    </div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
                    <div style="font-size:0.78rem;color:#e2e8f0;">Thermal: <strong style="color:#34d399;">48°C · Fan 2,100 RPM</strong></div>
                    <div style="font-size:0.78rem;color:#e2e8f0;">Hot-Switch: <strong style="color:var(--neon-cyan);">< 1.2 Seconds</strong></div>
                    <button class="btn btn-secondary btn-sm" onclick="toggleOpsCartridge()" style="font-size:0.74rem;">
                      ${state.opsEjected ? '▶ Insert & Lock OPS Module' : '⏏️ Eject OPS Module'}
                    </button>
                  </div>
                </div>
                <div class="demo-explanation-box" style="margin-top:14px;">
                  <div class="deb-quote">"Future-proof system design with scalable computing capacity through its embedded OPS module."</div>
                  <div class="deb-howto"><strong>What it does:</strong> The OPS slot holds a full Intel Core i7 PC cartridge inside the board — no external computer needed. When tech improves, just swap the cartridge for a newer one without changing the display. <strong>Try it:</strong> Click "Eject OPS Module" to simulate hot-swapping the compute cartridge, then re-insert it.</div>
                  <button class="deb-gesture-btn" onclick="toggleOpsCartridge()">⚡ ${state.opsEjected ? 'Re-Insert OPS Cartridge' : 'Hot-Swap OPS Cartridge'}</button>
                </div>
              </div>
            ` : ''}

            ${activeDemo === 'dualos' ? `
              <!-- Demo 7: Dual OS -- Windows 11 + Android 13 -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 7 OF 9 — CALLOUT CARD</span></div>
                    <div class="demo-stage-title">Dual OS — Windows 11 Enterprise & Android 13</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;flex:1;align-items:center;">
                  <div style="display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;gap:10px;">
                      <div style="flex:1;background:rgba(0,120,215,0.18);border:1px solid rgba(0,120,215,0.5);border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:1.8rem;">🪟</div>
                        <div style="font-weight:800;font-size:0.85rem;color:#60a5fa;">Windows 11 Enterprise</div>
                        <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px;">Intel Core i7 OPS · Office & Teams</div>
                      </div>
                      <div style="display:flex;align-items:center;font-size:1.2rem;color:#fbbf24;">⇄</div>
                      <div style="flex:1;background:rgba(52,211,153,0.14);border:1px solid rgba(52,211,153,0.4);border-radius:8px;padding:12px;text-align:center;">
                        <div style="font-size:1.8rem;">🤖</div>
                        <div style="font-weight:800;font-size:0.85rem;color:#34d399;">Android 13 Millennium OS</div>
                        <div style="font-size:0.72rem;color:#94a3b8;margin-top:4px;">Built-in SoC · Whiteboard & Cast</div>
                      </div>
                    </div>
                    <div class="demo-spec-item"><span>OS Switch Speed:</span><strong style="color:var(--neon-cyan);">&lt; 1.2 Seconds</strong></div>
                    <div class="demo-spec-item"><span>Currently Running:</span><strong>${state.simulatorMode === 'windows' ? '🪟 Windows 11 Enterprise' : '🤖 Android 13'}</strong></div>
                  </div>
                  <div class="demo-explanation-box">
                    <div class="deb-quote">"Embedded with Windows and Android Operating Systems."</div>
                    <div class="deb-howto"><strong>What it does:</strong> The board runs both Windows 11 (for Office apps and full PC work) and Android 13 (for whiteboard, casting, and quick apps) — switching between them takes under 1.2 seconds. <strong>Try it:</strong> Click the 3D OS Flip button to instantly switch operating systems with a cool animation.</div>
                    <button class="deb-gesture-btn" onclick="toggleDualOSFlip()">🪟⇄🤖 Run 3D Dual-OS Card Flip</button>
                  </div>
                </div>
              </div>
            ` : ''}

            ${activeDemo === 'camera' ? `
              <!-- Demo 8: Ultrawide Angle Camera -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 8 OF 9 — CALLOUT CARD</span></div>
                    <div class="demo-stage-title">Ultrawide Angle Camera — 120° FOV & AI Speaker Framing</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>
                <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;flex:1;align-items:center;">
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    <div style="background:rgba(0,242,254,0.08);border:1px solid rgba(0,242,254,0.25);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;">
                      <div style="font-size:2.4rem;">📹</div>
                      <div>
                        <div style="font-weight:800;font-size:0.88rem;color:var(--neon-cyan);">Ultrawide Camera Module</div>
                        <div style="font-size:0.73rem;color:#94a3b8;margin-top:2px;">Mounted top-center of display bezel</div>
                      </div>
                    </div>
                    <div class="demo-spec-item"><span>Field of View:</span><strong style="color:var(--neon-cyan);">120° Ultrawide Angle</strong></div>
                    <div class="demo-spec-item"><span>Resolution:</span><strong>4K Video (3840×2160 @ 30fps)</strong></div>
                    <div class="demo-spec-item"><span>AI Feature:</span><strong style="color:#34d399;">Auto-Framing & Speaker Tracking</strong></div>
                    <div class="demo-spec-item"><span>Use Case:</span><strong>Online Meetings, Presentations, Classes</strong></div>
                    <div style="display:flex;gap:8px;margin-top:4px;">
                      <button class="btn btn-secondary btn-sm" onclick="setSimulatorMode('windows');state.windowsState.activeApp='teams';renderApp()" style="font-size:0.74rem;">💬 Open Teams/Zoom View</button>
                    </div>
                  </div>
                  <div class="demo-explanation-box">
                    <div class="deb-quote">"Ultrawide Angle camera for online meetings and presentations."</div>
                    <div class="deb-howto"><strong>What it does:</strong> The built-in 4K camera covers the entire room in one shot — teachers, students, and presenters are always in frame. AI automatically tracks the speaker so remote participants always see who's talking. <strong>Try it:</strong> Click below to activate the 120° FOV scan with AI auto-framing boxes.</div>
                    <button class="deb-gesture-btn" onclick="runCameraScanGesture()">📹 Activate 120° AI Camera Scan</button>
                  </div>
                </div>
              </div>
            ` : ''}

            ${activeDemo === 'dongle' ? `
              <!-- Demo 9: Wireless Dongle -->
              <div class="inboard-demo-stage">
                <div class="demo-stage-header">
                  <div>
                    <div class="demo-stage-tag"><span>✨ FEATURE 9 OF 9 — CALLOUT CARD</span></div>
                    <div class="demo-stage-title">Wireless Screen Dongle — No Network Required</div>
                  </div>
                  <button class="demo-stage-close-btn" onclick="closeFeatureDemo()">✕ Close</button>
                </div>
                <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:14px;flex:1;align-items:center;">
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    <div style="background:rgba(196,132,252,0.1);border:1px solid rgba(196,132,252,0.35);border-radius:10px;padding:14px;display:flex;align-items:center;gap:12px;">
                      <div style="font-size:2.4rem;">🔘</div>
                      <div>
                        <div style="font-weight:800;font-size:0.88rem;color:#c084fc;">Millennium Wireless Dongle</div>
                        <div style="font-size:0.73rem;color:#94a3b8;margin-top:2px;">Plug into laptop USB-C — instant screen on board</div>
                      </div>
                    </div>
                    <div class="demo-spec-item"><span>Network Needed?</span><strong style="color:#34d399;">No — Works without Wi-Fi or internet</strong></div>
                    <div class="demo-spec-item"><span>Stream Quality:</span><strong>4K @ 60 FPS</strong></div>
                    <div class="demo-spec-item"><span>Latency:</span><strong style="color:var(--neon-cyan);">&lt; 6ms (near-zero delay)</strong></div>
                    <div class="demo-spec-item"><span>Control:</span><strong>Touch the board to control the connected laptop</strong></div>
                    <div style="display:flex;gap:8px;margin-top:4px;">
                      <button class="btn btn-secondary btn-sm" onclick="toggleWirelessDongle()" style="font-size:0.74rem;">${state.dongleConnected ? '⏏️ Unplug Dongle' : '🔘 Plug In Dongle'}</button>
                    </div>
                  </div>
                  <div class="demo-explanation-box">
                    <div class="deb-quote">"Screen transfer without network can control the computer on the conference tablet using Dongle."</div>
                    <div class="deb-howto"><strong>What it does:</strong> Plug the small dongle into your laptop's USB-C port and your screen instantly appears on the Millennium board — no Wi-Fi, no passwords, no setup. You can even touch the board to control your laptop remotely. <strong>Try it:</strong> Click below to simulate the dongle wireless beam transmission.</div>
                    <button class="deb-gesture-btn" onclick="runDongleCastBeam()">🔘 Simulate Dongle Beam Transmission</button>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- ========================================================== -->
            <!-- STANDARD DISPLAY MODES                                     -->
            <!-- ========================================================== -->

            <!-- Mode 1: 4K Ultra High-Definition Home Theater / YouTube Demo -->
            ${curMode === 'theater' && !activeDemo ? `
              <div class="view-theater ch-${thState.channel}" style="position:relative;width:100%;height:100%;overflow:hidden;">
                
                <!-- Embedded YouTube Demo Video - Full Screen -->
                <iframe 
                  width="100%" 
                  height="100%" 
                  src="https://www.youtube.com/embed/FwzdLd3bSx8?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1" 
                  title="Millennium Interactive SmartBoard Demo" 
                  frameborder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  allowfullscreen
                  style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;display:block;object-fit:cover;">
                </iframe>
                
                <!-- Video Info Overlay (Optional - can be hidden) -->
                <div style="position:absolute;bottom:30px;left:30px;z-index:1000;background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);padding:16px 24px;border-radius:10px;border:1px solid rgba(0,242,254,0.3);box-shadow:0 4px 20px rgba(0,0,0,0.5);">
                  <h3 style="font-family:'Cinzel',serif;font-size:1.3rem;letter-spacing:0.05em;color:#00f2fe;margin:0 0 6px 0;text-shadow:0 2px 8px rgba(0,242,254,0.5);">
                    MILLENNIUM 4K ULTRA-HD
                  </h3>
                  <p style="font-size:0.85rem;color:#e2e8f0;margin:0;max-width:450px;line-height:1.4;">
                    Official Demo: 4K display, wireless casting, interactive touch, and dual OS capabilities.
                  </p>
                </div>

              </div>
            ` : ''}

            <!-- Mode 2: Interactive Digital Stylus Canvas -->
            ${curMode === 'whiteboard' && !activeDemo ? `
              <div class="view-whiteboard">
                <canvas id="virtualBoardCanvas" class="whiteboard-canvas-layer"></canvas>

                <!-- Floating Stylus Toolkit -->
                <div class="stylus-toolbar">
                  <!-- Color Dots -->
                  <div class="color-dot color-cyan ${state.stylusColor === '#00f2fe' ? 'active' : ''}" data-color="#00f2fe" onclick="setStylusColor('#00f2fe')" title="Cyan Pen"></div>
                  <div class="color-dot color-magenta ${state.stylusColor === '#ec4899' ? 'active' : ''}" data-color="#ec4899" onclick="setStylusColor('#ec4899')" title="Magenta Pen"></div>
                  <div class="color-dot color-gold ${state.stylusColor === '#fbbf24' ? 'active' : ''}" data-color="#fbbf24" onclick="setStylusColor('#fbbf24')" title="Gold Pen"></div>
                  <div class="color-dot color-emerald ${state.stylusColor === '#10b981' ? 'active' : ''}" data-color="#10b981" onclick="setStylusColor('#10b981')" title="Emerald Pen"></div>
                  <div class="color-dot color-white ${state.stylusColor === '#ffffff' ? 'active' : ''}" data-color="#ffffff" onclick="setStylusColor('#ffffff')" title="White Pen"></div>

                  <div style="width:1px;height:18px;background:rgba(255,255,255,0.2);margin:0 2px;"></div>

                  <!-- Tools -->
                  <button class="stylus-tool-btn ${state.stylusTool === 'pen' ? 'active' : ''}" data-tool="pen" onclick="setStylusTool('pen')" title="Fine Stylus Pen">✏️ Fine</button>
                  <button class="stylus-tool-btn ${state.stylusTool === 'marker' ? 'active' : ''}" data-tool="marker" onclick="setStylusTool('marker')" title="Marker Pen">🖊️ Marker</button>
                  <button class="stylus-tool-btn ${state.stylusTool === 'highlighter' ? 'active' : ''}" data-tool="highlighter" onclick="setStylusTool('highlighter')" title="Neon Highlighter">🖌️ Glow</button>
                  <button class="stylus-tool-btn ${state.stylusTool === 'eraser' ? 'active' : ''}" data-tool="eraser" onclick="setStylusTool('eraser')" title="Gesture Palm Eraser">🖐️ Erase</button>

                  <div style="width:1px;height:18px;background:rgba(255,255,255,0.2);margin:0 2px;"></div>

                  <!-- Shapes -->
                  <button class="stylus-tool-btn ${state.stylusShape === 'arrow' ? 'active' : ''}" data-shape="arrow" onclick="setStylusShape('arrow')" title="Arrow Vector">➔</button>
                  <button class="stylus-tool-btn ${state.stylusShape === 'rect' ? 'active' : ''}" data-shape="rect" onclick="setStylusShape('rect')" title="Rectangle">▭</button>
                  <button class="stylus-tool-btn ${state.stylusShape === 'circle' ? 'active' : ''}" data-shape="circle" onclick="setStylusShape('circle')" title="Circle">○</button>

                  <div style="width:1px;height:18px;background:rgba(255,255,255,0.2);margin:0 2px;"></div>

                  <!-- Actions -->
                  <button class="stylus-tool-btn" onclick="runLessonDemo()" style="color:#00f2fe;font-weight:800;" title="Auto-Draw Blueprint">🎓 Demo</button>
                  <button class="stylus-tool-btn" onclick="undoWhiteboard()" title="Undo">↩️</button>
                  <button class="stylus-tool-btn" onclick="redoWhiteboard()" title="Redo">↪️</button>
                  <button class="stylus-tool-btn" onclick="clearWhiteboardCanvas()" title="Clear Canvas">🧹</button>
                  <button class="stylus-tool-btn" onclick="exportWhiteboardImage()" title="Export PNG">💾</button>

                  <span style="font-size:0.68rem;color:#34d399;font-weight:700;margin-left:4px;">Touch: <5ms</span>
                </div>
              </div>
            ` : ''}

            <!-- Mode 3: Windows 11 Enterprise Mode (Intel Core i7 OPS Module) -->
            ${curMode === 'windows' && !activeDemo ? `
              <div class="view-windows">
                <!-- Desktop Icons -->
                <div class="win-desktop-icons">
                  <div class="win-icon" onclick="openWinApp('powerpoint')">
                    <div class="win-icon-img">📊</div>
                    <div class="win-icon-name">PowerPoint 4K</div>
                  </div>
                  <div class="win-icon" onclick="openWinApp('teams')">
                    <div class="win-icon-img">💬</div>
                    <div class="win-icon-name">Teams / Zoom</div>
                  </div>
                  <div class="win-icon" onclick="openWinApp('edge')">
                    <div class="win-icon-img">🌐</div>
                    <div class="win-icon-name">Edge Browser</div>
                  </div>
                  <div class="win-icon" onclick="openWinApp('ops')">
                    <div class="win-icon-img">⚙️</div>
                    <div class="win-icon-name">OPS Diagnostics</div>
                  </div>
                </div>

                <!-- Interactive Floating Window -->
                ${winState.activeApp ? `
                  <div class="win-active-window">
                    <div class="win-window-bar">
                      <span>
                        ${winState.activeApp === 'powerpoint' ? '📊 Microsoft PowerPoint — Millennium Flagship Slide Deck' : ''}
                        ${winState.activeApp === 'teams' ? '📹 Microsoft Teams & Zoom 4K Video Conference' : ''}
                        ${winState.activeApp === 'edge' ? '🌐 Microsoft Edge — https://brains.asia/millennium' : ''}
                        ${winState.activeApp === 'ops' ? '⚙️ Intel Core i7 OPS Hardware Telemetry & Benchmarks' : ''}
                      </span>
                      <span style="display:flex;gap:6px;font-size:0.8rem;cursor:pointer;">
                        <span onclick="closeWinApp()">➖</span>
                        <span>🗖</span>
                        <span onclick="closeWinApp()" style="color:#f87171;">✕</span>
                      </span>
                    </div>

                    <div class="win-window-body">
                      <!-- PowerPoint App -->
                      ${winState.activeApp === 'powerpoint' ? `
                        <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;">
                          <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:16px;text-align:center;">
                            <span class="theater-badge">${pptSlides[winState.slideIdx].badge}</span>
                            <h3 style="font-family:'Outfit',sans-serif;font-size:1.35rem;font-weight:800;color:#ffffff;margin-top:8px;">
                              ${pptSlides[winState.slideIdx].title}
                            </h3>
                            <h4 style="font-size:0.85rem;color:var(--neon-cyan);font-weight:600;margin-top:2px;">
                              ${pptSlides[winState.slideIdx].subtitle}
                            </h4>
                            <p style="font-size:0.82rem;color:#cbd5e1;max-width:440px;margin:8px auto 0;">
                              ${pptSlides[winState.slideIdx].body}
                            </p>
                          </div>

                          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
                            <button class="btn btn-secondary btn-sm" onclick="prevWinSlide()">◀ Previous Slide</button>
                            <span style="font-size:0.75rem;color:#94a3b8;">Slide ${winState.slideIdx + 1} of 5</span>
                            <button class="btn btn-primary btn-sm" onclick="nextWinSlide()">Next Slide ▶</button>
                          </div>
                        </div>
                      ` : ''}

                      <!-- Teams / Zoom Conference App -->
                      ${winState.activeApp === 'teams' ? `
                        <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;">
                          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1;">
                            <div style="background:#0f172a;border:2px solid var(--neon-cyan);border-radius:6px;padding:8px;position:relative;display:flex;flex-direction:column;justify-content:space-between;">
                              <div style="font-size:0.7rem;font-weight:700;color:var(--neon-cyan);display:flex;align-items:center;gap:4px;">
                                <span class="status-pulse-dot"></span> Dr. Santos (Manila Campus) · Speaking
                              </div>
                              <div style="text-align:center;font-size:2rem;">👨‍🏫</div>
                              <div style="font-size:0.65rem;color:#34d399;text-align:right;">AI Auto-Framing: 120° FOV</div>
                            </div>
                            <div style="background:#0f172a;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:8px;display:flex;flex-direction:column;justify-content:space-between;">
                              <div style="font-size:0.7rem;color:#cbd5e1;">Engr. Reyes (QC Lab)</div>
                              <div style="text-align:center;font-size:2rem;">👩‍💻</div>
                              <div style="font-size:0.65rem;color:#94a3b8;text-align:right;">Muted</div>
                            </div>
                          </div>

                          <div style="display:flex;justify-content:center;gap:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1);">
                            <button class="btn btn-secondary btn-sm" onclick="toggleTeamsMute()">
                              ${winState.teamsMuted ? '🔇 Unmute' : '🎙️ Mute'}
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="toggleTeamsCamera()">
                              ${winState.teamsCamera ? '📷 Stop Video' : '📹 Start Video'}
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="closeWinApp()">Leave Meeting</button>
                          </div>
                        </div>
                      ` : ''}

                      <!-- Edge Browser App -->
                      ${winState.activeApp === 'edge' ? `
                        <div style="display:flex;flex-direction:column;height:100%;gap:8px;">
                          <div style="background:rgba(255,255,255,0.08);border-radius:4px;padding:4px 10px;font-size:0.72rem;color:var(--neon-cyan);font-family:'JetBrains Mono',monospace;">
                            🔒 https://brains.asia/millennium/smartboard-fleet
                          </div>
                          <div style="flex:1;background:#060d1a;border-radius:6px;padding:12px;overflow-y:auto;">
                            <div style="font-weight:700;font-size:0.88rem;color:#ffffff;">Millennium SmartBoard Fleet Telemetry Portal</div>
                            <p style="font-size:0.75rem;color:#cbd5e1;margin-top:4px;">
                              Connected to centralized device management server. All 86" boards reporting operational online status with 4K UHD streaming ready.
                            </p>
                            <div style="margin-top:8px;font-size:0.72rem;color:#34d399;">
                              ✅ SSL Certified · 10GbE Backbone · Zero Latency
                            </div>
                          </div>
                        </div>
                      ` : ''}

                      <!-- OPS Hardware Diagnostics App -->
                      ${winState.activeApp === 'ops' ? `
                        <div style="display:flex;flex-direction:column;gap:10px;height:100%;">
                          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div class="demo-spec-item">
                              <span>Processor:</span>
                              <strong>Intel Core i7-12700H (14 Cores)</strong>
                            </div>
                            <div class="demo-spec-item">
                              <span>Memory:</span>
                              <strong>16GB Dual-Channel DDR4</strong>
                            </div>
                            <div class="demo-spec-item">
                              <span>Storage:</span>
                              <strong>512GB NVMe PCIe 4.0 (3,520 MB/s)</strong>
                            </div>
                            <div class="demo-spec-item">
                              <span>Thermal State:</span>
                              <strong style="color:#34d399;">48°C · Fan 2,100 RPM</strong>
                            </div>
                          </div>
                          <div style="background:rgba(59,130,246,0.18);border:1px solid rgba(59,130,246,0.4);border-radius:6px;padding:10px;font-size:0.74rem;color:#93c5fd;">
                            ⚡ Modular Open Pluggable Specification (OPS) JAE 80-Pin standard allows instant hot-swap upgrades without removing display from wall mount.
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                ` : ''}

                <!-- Windows 11 Start Menu -->
                ${winState.startMenuOpen ? `
                  <div class="win-start-menu">
                    <div style="font-size:0.75rem;font-weight:700;color:#94a3b8;margin-bottom:8px;">PINNED APPS</div>
                    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;">
                      <div class="win-icon" onclick="openWinApp('powerpoint');toggleWinStartMenu();">
                        <div class="win-icon-img">📊</div>
                        <div class="win-icon-name">PowerPoint</div>
                      </div>
                      <div class="win-icon" onclick="openWinApp('teams');toggleWinStartMenu();">
                        <div class="win-icon-img">💬</div>
                        <div class="win-icon-name">Teams</div>
                      </div>
                      <div class="win-icon" onclick="openWinApp('edge');toggleWinStartMenu();">
                        <div class="win-icon-img">🌐</div>
                        <div class="win-icon-name">Edge</div>
                      </div>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:10px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;">
                      <span style="font-size:0.72rem;color:#e2e8f0;">👤 System Administrator</span>
                      <button class="btn btn-secondary btn-sm" onclick="toggleWinStartMenu()" style="font-size:0.68rem;padding:2px 6px;">Close</button>
                    </div>
                  </div>
                ` : ''}

                <!-- Windows 11 Taskbar -->
                <div class="win-taskbar">
                  <div class="win-start-cluster">
                    <button class="win-start-btn" onclick="toggleWinStartMenu()" title="Start">🪟</button>
                    <span style="font-size:0.85rem;cursor:pointer;" onclick="openWinApp('edge')">🔍</span>
                    <span style="font-size:0.85rem;cursor:pointer;" onclick="openWinApp('teams')">💬</span>
                    <span style="font-size:0.85rem;cursor:pointer;" onclick="openWinApp('powerpoint')">📊</span>
                  </div>
                  <div style="font-size:0.72rem;color:#cbd5e1;display:flex;gap:10px;align-items:center;">
                    <span>📶 Wi-Fi 6</span>
                    <span>🔊 100%</span>
                    <span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            ` : ''}

            <!-- Mode 4: Android 13 Interactive OS Mode -->
            ${curMode === 'android' && !activeDemo ? `
              <div class="view-android">
                <!-- Android Top Bar -->
                <div class="android-top-bar" onclick="toggleAndroidQuickSettings()" title="Tap to pull down Quick Settings Control Center">
                  <span>🤖 Android 13 Millennium OS · Tap for Quick Settings ▾</span>
                  <div style="display:flex;gap:10px;align-items:center;">
                    <span>📶 5GHz</span>
                    <span>📡 Cast Ready</span>
                    <span>${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <!-- Android 13 Quick Settings Drawer -->
                ${andState.quickSettingsOpen ? `
                  <div class="android-quick-settings">
                    <div class="android-setting-tile ${andState.wifiConnected ? 'active' : ''}" onclick="showToast('Wi-Fi 6: 1.2 Gbps Connected', 'info')">
                      <span>📶</span>
                      <span>Wi-Fi 6</span>
                    </div>
                    <div class="android-setting-tile ${andState.screenCastActive ? 'active' : ''}" onclick="startFeatureDemo('projection')">
                      <span>📡</span>
                      <span>Screen Cast</span>
                    </div>
                    <div class="android-setting-tile ${andState.eyeCare ? 'active' : ''}" onclick="toggleAndroidEyeCare()">
                      <span>👓</span>
                      <span>Eye-Care</span>
                    </div>
                    <div class="android-setting-tile" onclick="toggleWirelessDongle()">
                      <span>📲</span>
                      <span>Dongle</span>
                    </div>
                  </div>
                ` : ''}

                <!-- App Tiles Grid -->
                <div class="android-tiles-grid">
                  <div class="android-tile" onclick="setSimulatorMode('whiteboard')">
                    <div class="android-tile-icon">✍️</div>
                    <div class="android-tile-title">Whiteboard</div>
                  </div>
                  <div class="android-tile" onclick="startFeatureDemo('projection')">
                    <div class="android-tile-icon">📲</div>
                    <div class="android-tile-title">Screen Share</div>
                  </div>
                  <div class="android-tile" onclick="startFeatureDemo('uhd')">
                    <div class="android-tile-icon">📺</div>
                    <div class="android-tile-title">4K Display</div>
                  </div>
                  <div class="android-tile" onclick="startFeatureDemo('wireless')">
                    <div class="android-tile-icon">📡</div>
                    <div class="android-tile-title">Diagnostics</div>
                  </div>
                  <div class="android-tile" onclick="setSimulatorMode('theater')">
                    <div class="android-tile-icon">🎬</div>
                    <div class="android-tile-title">Cinema Media</div>
                  </div>
                </div>

                <!-- Bottom Android System Bar -->
                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.06);padding:8px 16px;border-radius:var(--radius-md);">
                  <div style="font-size:0.75rem;color:#cbd5e1;">⚡ 40-Point Multi-Touch Gestures Active · <5ms Latency</div>
                  <button class="btn btn-secondary btn-sm" onclick="setSimulatorMode('windows')">Switch to Windows 11 OPS ➔</button>
                </div>
              </div>
            ` : ''}

          </div>

          <!-- Bottom Chin with Illuminated Millennium Chrome Badge -->
          <div class="board-chin">
            <span class="board-chin-logo">MILLENNIUM</span>
          </div>

        </div>

        <!-- Right Side Panel: Wireless Dongle Card & Live Telemetry -->
        <div class="showcase-side-cards">

          <!-- Wireless Dongle Card (From Brochure) -->
          <div class="dongle-card">
            <div class="dongle-visual-row">
              <div class="dongle-device-graphic" onclick="toggleWirelessDongle()" title="Click to test Wireless Dongle connect/disconnect">
                <div class="dongle-ring-pulse ${isConnected ? '' : 'disconnected'}"></div>
                <div class="dongle-center-button"></div>
              </div>
              <div class="dongle-info">
                <div class="dongle-tag">Hardware Feature</div>
                <div class="dongle-title">Wireless Screen Dongle</div>
                <div class="dongle-desc">
                  Screen transfer without network can control the computer on the conference tablet using Dongle.
                </div>
              </div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">
              <span class="status-pill ${isConnected ? 'status-online' : 'status-offline'}" style="font-size:0.72rem;padding:3px 8px;">
                ${isConnected ? '🟢 Dongle Cast Active' : '⚪ Disconnected'}
              </span>
              <button class="btn btn-secondary btn-sm" onclick="toggleWirelessDongle()" style="font-size:0.72rem;padding:3px 9px;">
                ${isConnected ? 'Unplug Dongle' : 'Plug In Dongle'}
              </button>
            </div>
            ${isConnected ? `
              <div style="font-size:0.72rem;color:var(--text-muted);display:flex;justify-content:space-between;">
                <span>Latency: <strong style="color:var(--neon-cyan);">6ms</strong></span>
                <span>Stream: <strong style="color:#ffffff;">4K @ 60 FPS</strong></span>
                <span>Zero Wi-Fi Needed</span>
              </div>
            ` : ''}
          </div>

          <!-- Live Hardware Telemetry Card -->
          <div class="telemetry-card">
            <div style="font-size:0.8rem;font-weight:800;color:var(--text-primary);letter-spacing:0.04em;text-transform:uppercase;display:flex;justify-content:space-between;align-items:center;">
              <span>Board Hardware Telemetry</span>
              <span style="font-size:0.7rem;color:#34d399;font-weight:700;">All Systems Normal ✅</span>
            </div>

            <div class="telemetry-metric-row">
              <span class="telemetry-label">
                <span>🎙️ Voice Clarity Mic Array:</span>
              </span>
              <div style="display:flex;align-items:center;gap:6px;">
                <div class="audio-meter-bars" title="Sensitive audio input level">
                  <div class="audio-bar"></div>
                  <div class="audio-bar"></div>
                  <div class="audio-bar"></div>
                  <div class="audio-bar"></div>
                  <div class="audio-bar"></div>
                </div>
                <span class="telemetry-val" style="color:var(--neon-cyan);">98% Sensitive</span>
              </div>
            </div>

            <div class="telemetry-metric-row">
              <span class="telemetry-label">
                <span>✍️ Touch Response Latency:</span>
              </span>
              <span class="telemetry-val" style="color:#34d399;">< 5ms (40-Point Touch)</span>
            </div>

            <div class="telemetry-metric-row">
              <span class="telemetry-label">
                <span>💻 Modular OPS Architecture:</span>
              </span>
              <span class="telemetry-val">Intel Core i7 · 48°C</span>
            </div>

            <div class="telemetry-metric-row">
              <span class="telemetry-label">
                <span>📡 Universal Wireless:</span>
              </span>
              <span class="telemetry-val" style="color:#c084fc;">Wi-Fi 6 · BT 5.2 · Cast</span>
            </div>
          </div>

        </div>

      </div>

      <!-- MAIN FEATURES (Direct from Brochure with Working Demonstrations) -->
      <div class="millennium-features-section">
        <div class="features-section-header">
          <div class="features-heading">
            <span>✨</span>
            <span>MAIN FEATURES — MILLENNIUM INTERACTIVE TECHNOLOGY</span>
          </div>
          <span style="font-size:0.76rem;color:var(--text-muted);">From Official Brains Infinite Innovations Brochure · Click any feature to test live</span>
        </div>

        <div class="features-grid">
          <!-- Feature 1 -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">📺</div>
              <div class="feat-body">
                <div class="feat-title">4K Ultra High-Definition</div>
                <div class="feat-desc">4K Ultra High-Definition display for Home theater. Perfect for watching Netflix and streaming interactive lessons.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('uhd')">
              ▶ Try 4K UHD Demonstration
            </button>
          </div>

          <!-- Feature 2 -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">🎙️</div>
              <div class="feat-body">
                <div class="feat-title">Sensitive Audio Input</div>
                <div class="feat-desc">Sensitive audio input for maximum voice clarity during online meetings, seminars, coaching, and classroom discussions.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('audio')">
              ▶ Try Audio Radar Demonstration
            </button>
          </div>

          <!-- Feature 3 -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">✍️</div>
              <div class="feat-body">
                <div class="feat-title">Draw, Sketch, Layout & Delete</div>
                <div class="feat-desc">Draw, sketch, layout and delete using a stylus pen and natural hand gestures with high responsiveness.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('stylus')">
              ▶ Try Stylus & Gesture Demonstration
            </button>
          </div>

          <!-- Feature 4 -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">📲</div>
              <div class="feat-body">
                <div class="feat-title">Wireless Screen Projection</div>
                <div class="feat-desc">Project your laptop and your cellphone on the screen and share it across all your audience locally and online for seamless discussions.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('projection')">
              ▶ Try 4-Split Cast Demonstration
            </button>
          </div>

          <!-- Feature 5 -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">📡</div>
              <div class="feat-body">
                <div class="feat-title">Full Wireless Connectivity</div>
                <div class="feat-desc">Bluetooth, hotspot, cast and WiFi ready for wireless connectivity without tangled conference cords.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('wireless')">
              ▶ Try Wireless Diagnostics Demonstration
            </button>
          </div>

          <!-- Feature 6 -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">⚡</div>
              <div class="feat-body">
                <div class="feat-title">Future-Proof System Design</div>
                <div class="feat-desc">Adapt latest technological advancements with scalable computing capacity through its embedded Open Pluggable Specification module.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('ops')">
              ▶ Try Modular OPS Demonstration
            </button>
          </div>

          <!-- Feature 7: Dual OS -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">🪟</div>
              <div class="feat-body">
                <div class="feat-title">Dual OS — Windows & Android</div>
                <div class="feat-desc">Embedded with Windows 11 Enterprise and Android 13 Operating Systems. Switch between them in under 1.2 seconds.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('dualos')">▶ Try Dual OS 3D Flip Demo</button>
          </div>

          <!-- Feature 8: Camera -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">📹</div>
              <div class="feat-body">
                <div class="feat-title">Ultrawide Angle Camera</div>
                <div class="feat-desc">Built-in 4K ultrawide camera with 120° field of view for online meetings, presentations, and AI speaker auto-framing.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('camera')">▶ Try 120° Camera AI Scan Demo</button>
          </div>

          <!-- Feature 9: Dongle -->
          <div class="feature-pill-card">
            <div class="feature-card-top">
              <div class="feat-icon-pod">🔘</div>
              <div class="feat-body">
                <div class="feat-title">Wireless Screen Dongle</div>
                <div class="feat-desc">Screen transfer without network. Plug the dongle into any laptop and control it directly from the conference board.</div>
              </div>
            </div>
            <button class="feat-demo-trigger-btn" onclick="startFeatureDemo('dongle')">▶ Try Dongle Beam Transmission Demo</button>
          </div>
        </div>
      </div>

    </div>
  `;
}

// Dedicated Showcase View (Sidebar Nav Target)
function renderShowcaseView() {
  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">⚡ Millennium SmartBoard Hardware Showcase</h1>
        <p class="page-description">Interactive virtual testbed, hardware simulation, and feature capabilities from Brains Infinite Innovations Inc.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="fetchAllData()">🔄 Refresh Telemetry</button>
      </div>
    </div>
    ${renderMillenniumShowcase()}
  `;
}

// 1. Executive Dashboard View
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
  const isAdmin   = state.currentRole === 'admin';

  // Helper for status bar width
  function pct(n) { return total > 0 ? Math.round((n / total) * 100) : 0; }

  // Recent tickets (up to 5)
  const recentTickets = [...state.tickets]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  // Recent activity (up to 15)
  const recentLogs = [...state.auditLogs]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 15);

  const activeTab = state.dashboardCabinetView || 'all';

  return `
    <div class="page-header-row" style="margin-top: 24px;">
      <div>
        <h1 class="page-title">📊 IoT Fleet Telemetry & Operations</h1>
        <p class="page-description">Overview of active Millennium SmartBoards, service tickets, and parts telemetry across clients.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="toggleKpiDetails()">
          ${state.showAllKpiCards ? '📊 Compact KPIs' : '📈 Expanded KPIs'}
        </button>
        <button class="btn btn-secondary btn-sm" onclick="fetchAllData()">🔄 Refresh</button>
        ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="openRegisterModal()">➕ Register Board</button>` : ''}
      </div>
    </div>

    <!-- Core KPI Cards (Clean, Aligned Single Row) -->
    <div class="stat-cards-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Total Devices</span>
          <div class="stat-icon" style="background:var(--primary-light);color:var(--primary);">🖥️</div>
        </div>
        <div class="stat-value" style="color:var(--primary);">${total}</div>
        <div class="stat-footer">Registered SmartBoards</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Online</span>
          <div class="stat-icon" style="background:var(--success-light);color:var(--success);">🟢</div>
        </div>
        <div class="stat-value" style="color:var(--success);">${online}</div>
        <div class="stat-footer">Fleet active: <strong>${healthPct}%</strong></div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Needs Attention</span>
          <div class="stat-icon" style="background:var(--warning-light);color:var(--warning);">⚠️</div>
        </div>
        <div class="stat-value" style="color:var(--warning);">${warning + offline + maint}</div>
        <div class="stat-footer">${warning} warn · ${offline} off · ${maint} maint</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Open Tickets</span>
          <div class="stat-icon" style="background:var(--danger-light);color:var(--danger);">🔧</div>
        </div>
        <div class="stat-value" style="color:var(--danger);">${openTickets.length}</div>
        <div class="stat-footer">${resolvedTix} resolved total</div>
      </div>

      ${state.showAllKpiCards ? `
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Schools</span>
          <div class="stat-icon" style="background:var(--cyan-light);color:var(--cyan);">🏫</div>
        </div>
        <div class="stat-value" style="color:var(--cyan);">${schoolDevices}</div>
        <div class="stat-footer">Educational institutions</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Corporate</span>
          <div class="stat-icon" style="background:var(--purple-light);color:var(--purple);">🏢</div>
        </div>
        <div class="stat-value" style="color:var(--purple);">${corpDevices}</div>
        <div class="stat-footer">Corporate & enterprise</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Parts Inventory</span>
          <div class="stat-icon" style="background:var(--purple-light);color:var(--purple);">📦</div>
        </div>
        <div class="stat-value" style="color:${lowStockParts.length > 0 ? 'var(--warning)' : 'var(--success)'};">${lowStockParts.length > 0 ? lowStockParts.length + ' Low' : 'OK'}</div>
        <div class="stat-footer">${state.inventory.length} total part types</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">Fleet Health</span>
          <div class="stat-icon" style="background:var(--primary-light);color:var(--primary);">🛡️</div>
        </div>
        <div class="stat-value" style="color:var(--primary);">${healthPct}%</div>
        <div class="stat-footer">${healthPct >= 90 ? 'Optimal ✅' : healthPct >= 70 ? 'Fair ⚠️' : 'Critical 🔴'}</div>
      </div>
      ` : ''}
    </div>

    <!-- Secondary KPI Strip (Keeps viewport compact) -->
    ${!state.showAllKpiCards ? `
    <div class="kpi-mini-bar">
      <div class="kpi-mini-item">🏫 Schools: <strong>${schoolDevices}</strong></div>
      <div class="kpi-mini-divider"></div>
      <div class="kpi-mini-item">🏢 Corporate: <strong>${corpDevices}</strong></div>
      <div class="kpi-mini-divider"></div>
      <div class="kpi-mini-item">📦 Inventory: <strong>${lowStockParts.length > 0 ? lowStockParts.length + ' Low' : 'OK ✅'}</strong></div>
      <div class="kpi-mini-divider"></div>
      <div class="kpi-mini-item">🛡️ Health Score: <strong>${healthPct}% (${healthPct >= 90 ? 'Optimal' : healthPct >= 70 ? 'Fair' : 'Critical'})</strong></div>
    </div>
    ` : ''}

    <!-- Cabinet Navigation Toolbar ("Like filing cabinet drawers") -->
    <div class="cabinet-toolbar">
      <div class="cabinet-tabs-group">
        <button class="cabinet-tab-btn ${activeTab === 'all' ? 'active' : ''}" onclick="setCabinetView('all')">
          🗂️ All Cabinets
        </button>
        <button class="cabinet-tab-btn ${activeTab === 'devices' ? 'active' : ''}" onclick="setCabinetView('devices')">
          🖥️ Fleet Status
        </button>
        <button class="cabinet-tab-btn ${activeTab === 'tickets' ? 'active' : ''}" onclick="setCabinetView('tickets')">
          🔧 Service Tickets
        </button>
        <button class="cabinet-tab-btn ${activeTab === 'activity' ? 'active' : ''}" onclick="setCabinetView('activity')">
          🗄️ Stock & Feed
        </button>
      </div>

      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="toggleAllCabinets(true)" title="Open all cabinet drawers">
          📂 Open All
        </button>
        <button class="btn btn-secondary btn-sm" onclick="toggleAllCabinets(false)" title="Collapse drawers into compact folder tabs">
          📁 Close All
        </button>
      </div>
    </div>

    <!-- Cabinet Drawers Row (Alignd 520px Height, Smooth Internal Scroll) -->
    <div class="dash-cabinets-grid ${activeTab !== 'all' ? 'single-cabinet' : ''}">

      <!-- Cabinet 1: Device Fleet & Status -->
      <div class="cabinet-panel ${!state.cabinetOpen.devices ? 'collapsed' : ''}" style="${activeTab !== 'all' && activeTab !== 'devices' ? 'display:none;' : ''}">
        <div class="cabinet-drawer-header" onclick="toggleCabinet('devices')" title="Click to open/close cabinet drawer">
          <div class="cabinet-header-title">
            <span>🖥️</span>
            <span>Device Fleet Status</span>
            <span class="cabinet-header-badge">🟢 ${online} On · ⚠️ ${warning} Warn</span>
          </div>
          <div class="cabinet-toggle-icon">${state.cabinetOpen.devices ? '▼' : '▶'}</div>
        </div>
        <div class="cabinet-drawer-body">
          <div class="cabinet-scroll-content custom-scrollbar">
            ${total === 0 ? `<p class="empty-state-text">No devices registered yet.</p>` : `
            <div class="status-breakdown">
              <div class="sb-row">
                <span class="sb-label">🟢 Online</span>
                <div class="sb-bar-wrap"><div class="sb-bar" style="width:${pct(online)}%;background:var(--success);"></div></div>
                <span class="sb-count">${online}</span>
              </div>
              <div class="sb-row">
                <span class="sb-label">⚠️ Warning</span>
                <div class="sb-bar-wrap"><div class="sb-bar" style="width:${pct(warning)}%;background:var(--warning);"></div></div>
                <span class="sb-count">${warning}</span>
              </div>
              <div class="sb-row">
                <span class="sb-label">🔧 In Service</span>
                <div class="sb-bar-wrap"><div class="sb-bar" style="width:${pct(maint)}%;background:var(--purple);"></div></div>
                <span class="sb-count">${maint}</span>
              </div>
              <div class="sb-row">
                <span class="sb-label">🔴 Offline</span>
                <div class="sb-bar-wrap"><div class="sb-bar" style="width:${pct(offline)}%;background:var(--danger);"></div></div>
                <span class="sb-count">${offline}</span>
              </div>
            </div>
            <div style="margin-top:20px;">
              <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;font-weight:600;">By Client Type</div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <div class="stat-chip" style="background:var(--cyan-light);color:var(--cyan);border-color:var(--cyan-border);">🏫 Schools: <strong>${schoolDevices}</strong></div>
                <div class="stat-chip" style="background:var(--purple-light);color:var(--purple);border-color:var(--purple-border);">🏢 Corporate: <strong>${corpDevices}</strong></div>
              </div>
            </div>
            `}
          </div>
          <div class="cabinet-footer-action">
            <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="navigateTo('devices')">View All Devices →</button>
          </div>
        </div>
      </div>

      <!-- Cabinet 2: Service Tickets & Maintenance -->
      <div class="cabinet-panel ${!state.cabinetOpen.tickets ? 'collapsed' : ''}" style="${activeTab !== 'all' && activeTab !== 'tickets' ? 'display:none;' : ''}">
        <div class="cabinet-drawer-header" onclick="toggleCabinet('tickets')" title="Click to open/close cabinet drawer">
          <div class="cabinet-header-title">
            <span>🔧</span>
            <span>Service Tickets</span>
            <span class="cabinet-header-badge">${openTickets.length} Open · ${resolvedTix} Resolved</span>
          </div>
          <div class="cabinet-toggle-icon">${state.cabinetOpen.tickets ? '▼' : '▶'}</div>
        </div>
        <div class="cabinet-drawer-body">
          <div class="ticket-summary-grid" style="margin-bottom:12px;">
            <div class="tsg-item" style="border-color:rgba(59,130,246,0.3);background:var(--primary-light);">
              <div class="tsg-count" style="color:var(--primary);">${receivedTix}</div>
              <div class="tsg-label">📥 Received</div>
            </div>
            <div class="tsg-item" style="border-color:rgba(245,158,11,0.3);background:var(--warning-light);">
              <div class="tsg-count" style="color:var(--warning);">${diagnosingTix}</div>
              <div class="tsg-label">🔍 Diagnosing</div>
            </div>
            <div class="tsg-item" style="border-color:rgba(139,92,246,0.3);background:var(--purple-light);">
              <div class="tsg-count" style="color:var(--purple);">${repairingTix}</div>
              <div class="tsg-label">🔧 Repairing</div>
            </div>
            <div class="tsg-item" style="border-color:rgba(16,185,129,0.3);background:var(--success-light);">
              <div class="tsg-count" style="color:var(--success);">${resolvedTix}</div>
              <div class="tsg-label">✅ Resolved</div>
            </div>
          </div>
          <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">Recent Tickets</div>
          <div class="cabinet-scroll-content custom-scrollbar">
            ${recentTickets.length === 0
              ? `<p class="empty-state-text">No tickets yet.</p>`
              : recentTickets.map(t => {
                  const priorityColor = t.priority === 'Critical' ? '#dc2626' : t.priority === 'High' ? '#d97706' : t.priority === 'Medium' ? '#2563eb' : '#16a34a';
                  return `
                  <div class="dash-ticket-row" onclick="navigateTo('tickets')">
                    <div>
                      <div style="font-weight:600;font-size:0.84rem;">${t.title}</div>
                      <div style="font-size:0.74rem;color:var(--text-muted);">${t.deviceId} · ${t.customerName}</div>
                    </div>
                    <span style="font-size:0.72rem;font-weight:700;color:${priorityColor};white-space:nowrap;">${t.priority}</span>
                  </div>`;
                }).join('')
            }
          </div>
          <div class="cabinet-footer-action">
            <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="navigateTo('tickets')">View All Tickets →</button>
          </div>
        </div>
      </div>

      <!-- Cabinet 3: Parts Alert & Live Activity Feed -->
      <div class="cabinet-panel ${!state.cabinetOpen.activity ? 'collapsed' : ''}" style="${activeTab !== 'all' && activeTab !== 'activity' ? 'display:none;' : ''}">
        <div class="cabinet-drawer-header" onclick="toggleCabinet('activity')" title="Click to open/close cabinet drawer">
          <div class="cabinet-header-title">
            <span>🗄️</span>
            <span>Stock & Feed</span>
            <span class="cabinet-header-badge">${lowStockParts.length > 0 ? `⚠️ ${lowStockParts.length} Low` : 'Stock OK'}</span>
          </div>
          <div class="cabinet-toggle-icon">${state.cabinetOpen.activity ? '▼' : '▶'}</div>
        </div>
        <div class="cabinet-drawer-body">
          <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
            <span>📦 Parts Stock Alerts</span>
            ${lowStockParts.length > 0 ? `<span class="badge" style="background:var(--danger-light);color:var(--danger);font-size:0.7rem;">${lowStockParts.length} alert${lowStockParts.length > 1 ? 's' : ''}</span>` : ''}
          </div>
          <div class="custom-scrollbar" style="max-height:115px;overflow-y:auto;padding-right:3px;margin-bottom:12px;">
            ${lowStockParts.length === 0
              ? `<p class="empty-state-text" style="padding:6px 0;">All parts well-stocked ✅</p>`
              : lowStockParts.map(p => `
                <div class="dash-part-row">
                  <div>
                    <div style="font-weight:600;font-size:0.82rem;">${p.name}</div>
                    <div style="font-size:0.72rem;color:var(--text-muted);">${p.partCode}</div>
                  </div>
                  <span class="status-pill ${p.status === 'Out of Stock' ? 'status-offline' : 'status-warning'}" style="font-size:0.7rem;padding:2px 6px;">
                    ${p.status === 'Out of Stock' ? '🔴 Out' : '⚠️ Low'} (${p.stockQuantity})
                  </span>
                </div>`
              ).join('')
            }
          </div>

          <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border-color);">
            <span>📋 Live Activity Feed</span>
            <span style="font-size:0.7rem;color:var(--text-muted);">${recentLogs.length} updates</span>
          </div>
          <div class="cabinet-scroll-content custom-scrollbar">
            ${recentLogs.length === 0
              ? `<p class="empty-state-text">No activity yet.</p>`
              : recentLogs.map(log => `
                <div class="feed-item" style="padding:7px 10px;margin-bottom:6px;">
                  <div class="feed-header">
                    <span style="font-weight:600;font-size:0.78rem;color:var(--primary);">${log.deviceId}</span>
                    <span class="feed-time">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div style="font-size:0.78rem;color:var(--text-primary);line-height:1.3;">${log.action}</div>
                </div>`
              ).join('')
            }
          </div>

          <div class="cabinet-footer-action">
            <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="navigateTo('inventory')">View Inventory →</button>
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
              <th>Temp / CPU</th>
              <th>Last Ping</th>
              <th>Central Remote Controls</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No devices matching current criteria.</td></tr>` : ''}
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
                    <div style="font-family: 'JetBrains Mono'; font-weight: 700; color: ${dev.temperatureC > 75 ? '#f43f5e' : dev.temperatureC > 60 ? '#f59e0b' : '#34d399'};">
                      ${dev.temperatureC > 0 ? `${dev.temperatureC}°C` : 'N/A'}
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">CPU: ${dev.cpuUsagePct}% | RAM: ${dev.ramUsagePct}%</div>
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

// Customer-facing ticket card (simplified, read-only)
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
    <div class="ticket-card" style="cursor:default;">
      <div class="ticket-top">
        <span class="ticket-id">${t.ticketNumber}</span>
        <span style="font-size:0.78rem;font-weight:700;color:${statusColor};background:rgba(0,0,0,0.06);padding:2px 8px;border-radius:4px;">
          ${statusIcon} ${t.status}
        </span>
      </div>
      <div class="ticket-title">${t.title}</div>
      <div class="ticket-meta">
        <span><strong>Device:</strong> ${t.deviceId} (${t.deviceModel})</span>
        <span><strong>Category:</strong> ${t.category}</span>
        <span><strong>Warranty:</strong> <span class="${t.warrantyCovered ? 'warranty-badge-active' : 'warranty-badge-expired'}">${t.warrantyCovered ? 'Covered ✅' : 'Not Covered'}</span></span>
        <span><strong>Technician:</strong> ${t.assignedTechnician || 'Pending assignment'}</span>
      </div>
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">
        Submitted: ${new Date(t.createdAt).toLocaleDateString()}
      </div>
    </div>
  `;
}

// 3. Maintenance & Service Ticket View
function renderTicketsView() {
  const categories = ['All', 'Touchscreen', 'OPS Hardware', 'Software', 'Display Panel', 'Network', 'Power Board'];
  const received = state.tickets.filter((t) => t.status === 'Received');
  const diagnosing = state.tickets.filter((t) => t.status === 'Diagnosing');
  const repairing = state.tickets.filter((t) => t.status === 'Repairing');
  const resolved = state.tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed');

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
        <div class="ticket-title">${t.title}</div>
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
          ${isAdmin ? `
            <button onclick="event.stopPropagation();deleteTicket('${t.id}')"
              style="font-size:0.72rem;padding:3px 10px;border-radius:6px;border:1px solid #f43f5e55;background:rgba(244,63,94,0.1);color:#f43f5e;cursor:pointer;font-weight:700;">
              🗑️ Delete
            </button>
          ` : ''}
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

    const myTickets = state.tickets.filter(t => {
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
        <p class="page-description">${isTech ? 'Your active service jobs and repair tasks.' : 'Automated lifecycle from issue detection to technician dispatch and inventory parts deduction.'}</p>
      </div>
      <div class="page-actions">
        ${isAdmin ? `<button class="btn btn-primary" onclick="openCreateTicketModal()">➕ Submit Service Ticket</button>` : ''}
        ${isTech  ? `<button class="btn btn-secondary" onclick="fetchAllData()">🔄 Refresh My Jobs</button>` : ''}
      </div>
    </div>
    ${isTech ? `<div class="role-info-banner">🔧 <strong>Technician View:</strong> Showing all open tickets. Use the ticket detail to log parts used and update status.</div>` : ''}

    <!-- Kanban Columns -->
    <div class="kanban-board">
      <!-- 1. Received -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>📥 Received (${received.length})</span>
          <span class="status-pill status-offline">${received.length} Pending</span>
        </div>
        ${received.map(renderTicketCard).join('')}
      </div>

      <!-- 2. Diagnosing -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>🔍 Diagnosing (${diagnosing.length})</span>
          <span class="status-pill status-warning">${diagnosing.length} In Progress</span>
        </div>
        ${diagnosing.map(renderTicketCard).join('')}
      </div>

      <!-- 3. Repairing -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>⚙️ Repairing (${repairing.length})</span>
          <span class="status-pill status-maintenance">${repairing.length} On-Site</span>
        </div>
        ${repairing.map(renderTicketCard).join('')}
      </div>

      <!-- 4. Resolved -->
      <div class="kanban-column">
        <div class="kanban-header">
          <span>✅ Resolved (${resolved.length})</span>
          <span class="status-pill status-online">${resolved.length} Closed</span>
        </div>
        ${resolved.map(renderTicketCard).join('')}
      </div>
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
        <button class="btn btn-secondary" onclick="fetchAllData()">🔄 Check Again for Linked Devices</button>
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

            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openQRModal('${dev.id}')">📱 Digital ID</button>
              <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="openCreateTicketModal('${dev.id}')">Request Tech</button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `}

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

    <!-- Analytics Cards Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
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
    { id: 'customers',  icon: '🏢', label: 'Customer Organizations' },
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
          ${t.id === 'customers' ? `<span style="margin-left:6px;background:rgba(0,242,254,0.2);border-radius:999px;padding:1px 8px;font-size:0.78rem;">${(state.customers||[]).length}</span>` : ''}
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
function renderDMCustomersTab() {
  const customers = state.customers || [];

  return `
    <div class="glass-panel">
      <div class="panel-header" style="margin-bottom: 16px;">
        <div class="panel-title">🏢 Customer Organizations</div>
        <button class="btn btn-primary btn-sm" onclick="openCreateCustomerModal()">➕ Add Customer</button>
      </div>

      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Customer ID</th>
              <th>Type</th>
              <th>Contact</th>
              <th>Email</th>
              <th>City</th>
              <th>Devices</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${customers.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">No customer organizations found.</td></tr>` : ''}
            ${customers.map(c => {
              const deviceCount = (state.devices || []).filter(d => d.customerId === c.id).length;
              return `
              <tr>
                <td>
                  <strong>${c.organizationName}</strong>
                  ${c.address ? `<div style="font-size:0.72rem;color:var(--text-muted);">📍 ${c.address}</div>` : ''}
                </td>
                <td><span style="font-family:var(--font-mono);color:var(--neon-cyan);font-size:0.82rem;">${c.id}</span></td>
                <td>
                  <span class="status-pill ${c.clientType === 'school' ? 'status-online' : 'status-maintenance'}" style="font-size:0.75rem;">
                    ${c.clientType === 'school' ? '🏫 School' : '🏢 Corporate'}
                  </span>
                </td>
                <td style="font-size:0.82rem;">${c.contactPerson || '—'}</td>
                <td style="font-size:0.82rem;">${c.email || '—'}</td>
                <td style="font-size:0.82rem;">${c.city || '—'}</td>
                <td>
                  <span style="font-size:0.9rem;font-weight:800;color:${deviceCount > 0 ? 'var(--neon-cyan)' : 'var(--text-muted)'};">
                    ${deviceCount}
                  </span>
                  <span style="font-size:0.72rem;color:var(--text-muted);"> unit${deviceCount !== 1 ? 's' : ''}</span>
                </td>
                <td>
                  <div style="display:flex;gap:6px;">
                    <button class="btn btn-secondary btn-sm" onclick="switchDataManagerTab('allocation')">🔗 Assign</button>
                    <button class="action-btn" style="color:#f43f5e;border-color:#f43f5e44;" onclick="deleteCustomerOrg('${c.id}','${(c.organizationName||'').replace(/'/g,"\\'")}')">🗑️</button>
                  </div>
                </td>
              </tr>
              `;
            }).join('')}
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

        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 14px; align-items: end; flex-wrap: wrap;" id="allocationFormRow">
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
  const body = document.getElementById('ticketDetailBody');

  if (title) title.textContent = `Ticket Details — ${tck.ticketNumber}`;
  if (body) {
    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="background: var(--bg-card); padding: 14px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <h3 style="font-size: 1.1rem; font-weight: 800; color: #ffffff;">${tck.title}</h3>
          <p style="color: var(--text-secondary); font-size: 0.88rem; margin-top: 6px;">${tck.description}</p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem;">
          <div><strong>Device:</strong> <span style="color: var(--neon-cyan);">${tck.deviceId}</span> (${tck.deviceModel})</div>
          <div><strong>Customer:</strong> ${tck.customerName}</div>
          <div><strong>Priority:</strong> <span style="font-weight: 700;">${tck.priority}</span></div>
          <div><strong>Warranty Covered:</strong> <span class="${tck.warrantyCovered ? 'warranty-badge-active' : 'warranty-badge-expired'}">${tck.warrantyCovered ? 'Yes (Under Warranty) ✅' : 'No (Expired) ⚠️'}</span></div>
          <div><strong>Assigned Tech:</strong> ${tck.assignedTechnician}</div>
          <div><strong>Status:</strong> <span class="status-pill status-online">${tck.status}</span></div>
        </div>

        <div class="form-group">
          <label class="form-label">Update Ticket Status</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="advanceTicketStatus('${tck.id}', 'Received')">Received</button>
            <button class="btn btn-secondary btn-sm" onclick="advanceTicketStatus('${tck.id}', 'Diagnosing')">Diagnosing</button>
            <button class="btn btn-secondary btn-sm" onclick="advanceTicketStatus('${tck.id}', 'Repairing')">Repairing</button>
            <button class="btn btn-primary btn-sm" onclick="advanceTicketStatus('${tck.id}', 'Resolved')">Mark Resolved ✅</button>
          </div>
        </div>

        <!-- Spare Parts Deduction Section -->
        <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 10px; border: 1px solid var(--border-bright);">
          <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 8px; color: var(--neon-cyan);">🔩 Consume Spare Part from Inventory</h4>
          <p style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 10px;">
            Select a replacement part used by the technician to automatically deduct from company inventory and link to this unit's service history.
          </p>
          <div style="display: flex; gap: 10px;">
            <select id="ticketPartSelect" class="form-select" style="flex: 2;">
              ${state.inventory.map((p) => `<option value="${p.id}">${p.name} (In Stock: ${p.stockQuantity})</option>`).join('')}
            </select>
            <input type="number" id="ticketPartQty" class="form-input" style="flex: 1; min-width: 60px;" value="1" min="1" max="10" />
            <button class="btn btn-secondary btn-sm" onclick="consumePartForSelectedTicket()">Deduct Part</button>
          </div>
          ${tck.partsUsed && tck.partsUsed.length > 0 ? `
            <div style="margin-top: 10px; font-size: 0.8rem; color: var(--neon-cyan);">
              <strong>Parts Used:</strong> ${tck.partsUsed.map((p) => `${p.quantity}x ${p.partName}`).join(', ')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  if (modal) modal.classList.add('active');
}

function closeTicketDetailModal() {
  const modal = document.getElementById('ticketDetailModal');
  if (modal) modal.classList.remove('active');
  state.selectedTicket = null;
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

let html5QrCode = null; // Global scanner instance

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
  const statusDiv = document.getElementById('scannerStatus');
  
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
    
    // Start scanning
    await html5QrCode.start(
      { facingMode: "environment" }, // Use back camera
      config,
      onScanSuccess,
      onScanFailure
    );
    
    updateScannerStatus('🔍 Scanning... Point camera at QR code or barcode', 'scanning');
    
  } catch (err) {
    console.error('Failed to start scanner:', err);
    updateScannerStatus('❌ Camera access denied or unavailable', 'error');
    showToast('Unable to access camera. Please check permissions.', 'error');
    
    // Show instructions again
    setTimeout(() => {
      resetWarrantyScanner();
    }, 2000);
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
  console.log('Scan successful:', decodedText);
  
  // Stop scanner immediately
  stopWarrantyScanner();
  
  // Update status
  updateScannerStatus('✅ Code detected! Validating warranty...', 'success');
  
  // Validate the scanned code
  validateWarrantyBySerial(decodedText);
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
  if (fileInput) {
    fileInput.click();
  }
}

// Handle Barcode Image Upload
function handleBarcodeImageUpload(event) {
  const file = event.target.files[0];
  
  if (!file) {
    return;
  }
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    showToast('Please upload a valid image file', 'error');
    return;
  }
  
  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image file is too large. Maximum size is 10MB', 'error');
    return;
  }
  
  // Read and display image
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const imagePreviewArea = document.getElementById('imagePreviewArea');
    const uploadedImage = document.getElementById('uploadedBarcodeImage');
    const statusDiv = document.getElementById('imageScanStatus');
    
    if (uploadedImage && imagePreviewArea) {
      uploadedImage.src = e.target.result;
      imagePreviewArea.style.display = 'block';
      statusDiv.textContent = 'Image uploaded. Click "Scan Image" to decode barcode.';
      statusDiv.style.color = 'var(--text-secondary)';
      
      showToast('Image uploaded successfully', 'success');
    }
  };
  
  reader.onerror = function() {
    showToast('Failed to read image file', 'error');
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
  
  // Update status
  if (statusDiv) {
    statusDiv.innerHTML = '<span style="color: var(--primary);">🔍 Scanning image for barcode...</span>';
  }
  
  try {
    // Use Html5Qrcode to scan from image file
    const html5QrCode = new Html5Qrcode("qrReaderContainer");
    
    // Scan the image
    const decodedText = await html5QrCode.scanFile(uploadedImage.src, true);
    
    // Success
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--success);">✅ Barcode detected! Validating warranty...</span>';
    }
    
    showToast('Barcode detected successfully', 'success');
    
    // Hide instructions, show results
    document.getElementById('scannerInstructions').style.display = 'none';
    document.getElementById('scannerResults').style.display = 'block';
    
    // Validate the scanned code
    validateWarrantyBySerial(decodedText);
    
    // Clean up
    html5QrCode.clear();
    
  } catch (error) {
    console.error('Failed to scan image:', error);
    
    // Try alternative method using Html5QrcodeScanner for image files
    try {
      const imageFile = document.getElementById('barcodeImageInput').files[0];
      if (!imageFile) {
        throw new Error('No image file available');
      }
      
      // Create a temporary scanner instance
      const tempScanner = new Html5Qrcode("qrReaderContainer");
      
      // Scan the file directly
      const result = await tempScanner.scanFileV2(imageFile, true);
      
      if (result && result.decodedText) {
        if (statusDiv) {
          statusDiv.innerHTML = '<span style="color: var(--success);">✅ Barcode detected! Validating warranty...</span>';
        }
        
        showToast('Barcode detected successfully', 'success');
        
        // Hide instructions, show results
        document.getElementById('scannerInstructions').style.display = 'none';
        document.getElementById('scannerResults').style.display = 'block';
        
        // Validate the scanned code
        validateWarrantyBySerial(result.decodedText);
        
        // Clean up
        tempScanner.clear();
        return;
      }
    } catch (altError) {
      console.error('Alternative scan method also failed:', altError);
    }
    
    // Both methods failed
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--danger);">❌ No barcode detected in image. Try a clearer image or use camera scanner.</span>';
    }
    
    showToast('No barcode found in image. Please try a clearer image or use the camera scanner.', 'error');
  }
}

// Validate Warranty by Serial Number or Device ID
async function validateWarrantyBySerial(serialNumber) {
  const resultsDiv = document.getElementById('warrantyValidationDisplay');
  if (!resultsDiv) return;
  
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
    // First, try to find device by serial number
    let device = state.devices.find(d => 
      d.serialNumber === serialNumber || 
      d.id === serialNumber ||
      d.serialNumber.includes(serialNumber) ||
      d.id.includes(serialNumber)
    );
    
    // If not found in local state, fetch from API
    if (!device) {
      const response = await fetch(`${API_BASE}/devices`);
      const data = await response.json();
      if (data.success && data.data) {
        const allDevices = data.data;
        device = allDevices.find(d => 
          d.serialNumber === serialNumber || 
          d.id === serialNumber ||
          d.serialNumber.includes(serialNumber) ||
          d.id.includes(serialNumber)
        );
      }
    }
    
    if (!device) {
      displayWarrantyNotFound(serialNumber);
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
    // Generate barcode using device serial number or ID
    const barcodeValue = device.serialNumber || device.id;
    
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
  const barcodeValue = device.serialNumber || device.id;
  
  // Open new window for printing
  const printWindow = window.open('', '_blank', 'width=600,height=800');
  
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
        JsBarcode("#printBarcode", "${barcodeValue}", {
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

function showDeleteConfirm(message, onConfirm) {
  // Remove existing if any
  const existing = document.getElementById('deleteConfirmOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'deleteConfirmOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.65);
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(4px);
    animation:fadeIn 0.2s ease;
  `;
  overlay.innerHTML = `
    <div style="
      background:var(--surface-elevated,#1e1e2e);
      border:1px solid #f43f5e55;
      border-radius:16px;
      padding:32px 36px;
      max-width:420px;
      width:90%;
      box-shadow:0 20px 60px rgba(0,0,0,0.6);
      text-align:center;
    ">
      <div style="font-size:2.5rem;margin-bottom:12px;">🗑️</div>
      <h3 style="font-size:1.15rem;font-weight:800;color:#f43f5e;margin-bottom:10px;">Confirm Deletion</h3>
      <p style="font-size:0.88rem;color:var(--text-secondary,#a0a0b0);margin-bottom:24px;line-height:1.5;">${message}</p>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button id="deleteCancelBtn" style="
          padding:10px 24px;border-radius:8px;border:1px solid var(--border-subtle,#333);
          background:transparent;color:var(--text-primary,#fff);font-size:0.88rem;
          font-weight:600;cursor:pointer;transition:all 0.2s;
        ">Cancel</button>
        <button id="deleteConfirmBtn" style="
          padding:10px 24px;border-radius:8px;border:none;
          background:linear-gradient(135deg,#f43f5e,#dc2626);
          color:#fff;font-size:0.88rem;font-weight:700;cursor:pointer;
          box-shadow:0 4px 15px rgba(244,63,94,0.4);
          transition:all 0.2s;
        ">🗑️ Delete Permanently</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('deleteCancelBtn').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
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
window.addEventListener('DOMContentLoaded', () => {
  // Initialize theme first to avoid flash
  initTheme();

  // --- AUTH GATE: check for existing session ---
  const savedUser = getAuthSession();
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

  // Auto-refresh telemetry every 30 seconds (only if logged in)
  setInterval(() => {
    if (state.currentUser) {
      fetchAllData();
    }
  }, 30000);
});



// ==========================================================================
// MOBILE RESPONSIVE MODULE
// ==========================================================================

// Mobile menu toggle
function toggleMobileMenu() {
  const sidebar = document.querySelector('.app-sidebar');
  const backdrop = document.querySelector('.mobile-backdrop');
  
  if (sidebar) {
    sidebar.classList.toggle('mobile-open');
  }
  
  // Create backdrop if doesn't exist
  if (!backdrop) {
    const newBackdrop = document.createElement('div');
    newBackdrop.className = 'mobile-backdrop';
    newBackdrop.onclick = closeMobileMenu;
    document.body.appendChild(newBackdrop);
    setTimeout(() => newBackdrop.classList.add('active'), 10);
  } else {
    backdrop.classList.toggle('active');
  }
}

function closeMobileMenu() {
  const sidebar = document.querySelector('.app-sidebar');
  const backdrop = document.querySelector('.mobile-backdrop');
  
  if (sidebar) {
    sidebar.classList.remove('mobile-open');
  }
  
  if (backdrop) {
    backdrop.classList.remove('active');
    setTimeout(() => backdrop.remove(), 300);
  }
}

// Close mobile menu when clicking a tab
document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 767) {
        closeMobileMenu();
      }
    });
  });
  
  // Close menu on window resize if screen becomes large
  window.addEventListener('resize', () => {
    if (window.innerWidth > 767) {
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


// ==========================================================================
// 60FPS PERFORMANCE OPTIMIZATION MODULE
// ==========================================================================

// Request Animation Frame polyfill
window.requestAnimFrame = (function() {
  return window.requestAnimationFrame ||
         window.webkitRequestAnimationFrame ||
         window.mozRequestAnimationFrame ||
         function(callback) {
           window.setTimeout(callback, 1000 / 60);
         };
})();

// Debounce helper for resize and scroll events
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle helper for high-frequency events
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// RAF-based smooth scroll
function smoothScrollTo(element, to, duration = 300) {
  const start = element.scrollTop;
  const change = to - start;
  const startTime = performance.now();

  function animateScroll(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easing = progress < 0.5
      ? 2 * progress * progress
      : -1 + (4 - 2 * progress) * progress;
    
    element.scrollTop = start + (change * easing);
    
    if (progress < 1) {
      requestAnimFrame(animateScroll);
    }
  }
  
  requestAnimFrame(animateScroll);
}

// Optimize table rendering with virtual scrolling
function optimizeTableRendering() {
  const tables = document.querySelectorAll('.data-table');
  
  tables.forEach(table => {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr');
    if (rows.length > 50) {
      // Add index for stagger animation
      rows.forEach((row, index) => {
        row.style.setProperty('--index', index % 10);
      });
    }
  });
}

// Lazy load images
function lazyLoadImages() {
  const images = document.querySelectorAll('img[data-src]');
  
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '50px'
  });
  
  images.forEach(img => imageObserver.observe(img));
}

// Optimize animations during scroll
let ticking = false;
let lastScrollY = 0;

function optimizeScroll() {
  lastScrollY = window.scrollY;
  
  if (!ticking) {
    requestAnimFrame(() => {
      // Add scroll class for CSS optimization
      document.body.classList.add('scrolling');
      
      clearTimeout(window.scrollTimeout);
      window.scrollTimeout = setTimeout(() => {
        document.body.classList.remove('scrolling');
      }, 150);
      
      ticking = false;
    });
    
    ticking = true;
  }
}

// Optimize resize handling
const optimizedResize = debounce(() => {
  // Update viewport height
  setVH();
  
  // Reoptimize tables
  optimizeTableRendering();
  
  // Update device class
  document.body.classList.remove('mobile-device', 'tablet-device', 'desktop-device');
  document.body.classList.add(
    isMobileDevice() ? 'mobile-device' :
    isTabletDevice() ? 'tablet-device' :
    'desktop-device'
  );
}, 150);

// Batch DOM reads and writes
const domBatcher = {
  reads: [],
  writes: [],
  scheduled: false,
  
  read(fn) {
    this.reads.push(fn);
    this.schedule();
  },
  
  write(fn) {
    this.writes.push(fn);
    this.schedule();
  },
  
  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    
    requestAnimFrame(() => {
      // Execute all reads first
      this.reads.forEach(fn => fn());
      this.reads = [];
      
      // Then execute all writes
      this.writes.forEach(fn => fn());
      this.writes = [];
      
      this.scheduled = false;
    });
  }
};

// Optimize modal transitions
function openModalOptimized(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  // Add transitioning class to disable pointer events
  modal.classList.add('transitioning');
  
  requestAnimFrame(() => {
    modal.classList.add('active');
    
    setTimeout(() => {
      modal.classList.remove('transitioning');
    }, 300);
  });
}

function closeModalOptimized(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  modal.classList.add('transitioning');
  
  requestAnimFrame(() => {
    modal.classList.remove('active');
    
    setTimeout(() => {
      modal.classList.remove('transitioning');
    }, 300);
  });
}

// Optimize sidebar toggle
function toggleMobileMenuOptimized() {
  const sidebar = document.querySelector('.app-sidebar');
  if (!sidebar) return;
  
  sidebar.classList.add('transitioning');
  
  requestAnimFrame(() => {
    sidebar.classList.toggle('mobile-open');
    toggleMobileBackdrop();
    
    setTimeout(() => {
      sidebar.classList.remove('transitioning');
    }, 300);
  });
}

function toggleMobileBackdrop() {
  let backdrop = document.querySelector('.mobile-backdrop');
  
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'mobile-backdrop';
    backdrop.onclick = toggleMobileMenuOptimized;
    document.body.appendChild(backdrop);
    
    requestAnimFrame(() => {
      backdrop.classList.add('active');
    });
  } else {
    backdrop.classList.toggle('active');
    
    if (!backdrop.classList.contains('active')) {
      setTimeout(() => backdrop.remove(), 300);
    }
  }
}

// Optimize rendering performance
function enablePerformanceMode() {
  // Reduce motion on low-end devices
  if (navigator.hardwareConcurrency <= 2) {
    document.documentElement.style.setProperty('--motion-duration-fast', '0.1s');
    document.documentElement.style.setProperty('--motion-duration-normal', '0.15s');
    document.documentElement.style.setProperty('--motion-duration-slow', '0.2s');
  }
  
  // Disable shadows on very low-end devices
  if (navigator.hardwareConcurrency === 1) {
    document.body.classList.add('performance-mode');
  }
}

// Passive event listeners for better scroll performance
function addPassiveEventListeners() {
  const passiveOptions = { passive: true };
  
  window.addEventListener('scroll', optimizeScroll, passiveOptions);
  window.addEventListener('resize', optimizedResize, passiveOptions);
  
  // Touch events
  document.addEventListener('touchstart', () => {
    document.body.classList.add('touching');
  }, passiveOptions);
  
  document.addEventListener('touchend', () => {
    setTimeout(() => {
      document.body.classList.remove('touching');
    }, 300);
  }, passiveOptions);
}

// Initialize performance optimizations
function initPerformanceOptimizations() {
  console.log('🚀 Initializing 60fps performance optimizations...');
  
  // Enable passive event listeners
  addPassiveEventListeners();
  
  // Optimize tables
  optimizeTableRendering();
  
  // Lazy load images
  lazyLoadImages();
  
  // Enable performance mode if needed
  enablePerformanceMode();
  
  // Log FPS (dev mode)
  if (window.location.hostname === 'localhost') {
    let frames = 0;
    let lastTime = performance.now();
    
    function countFPS() {
      frames++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        console.log(`⚡ FPS: ${frames}`);
        frames = 0;
        lastTime = currentTime;
      }
      
      requestAnimFrame(countFPS);
    }
    
    // Uncomment to monitor FPS
    // countFPS();
  }
  
  console.log('✅ Performance optimizations enabled');
}

// Override existing functions with optimized versions
if (typeof toggleMobileMenu === 'function') {
  const originalToggle = toggleMobileMenu;
  toggleMobileMenu = toggleMobileMenuOptimized;
}

// Init on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPerformanceOptimizations);
} else {
  initPerformanceOptimizations();
}

// Optimize profile picture loading
function optimizeProfilePictureLoad() {
  const profilePic = document.getElementById('profilePicturePreview');
  if (profilePic && profilePic.src) {
    const img = new Image();
    img.onload = () => {
      profilePic.src = img.src;
      profilePic.style.opacity = '1';
    };
    img.src = profilePic.dataset.src || profilePic.src;
    profilePic.style.opacity = '0';
    profilePic.style.transition = 'opacity 0.3s';
  }
}

// Memory cleanup
function cleanupMemory() {
  // Remove unused event listeners
  const removedElements = document.querySelectorAll('[data-removed="true"]');
  removedElements.forEach(el => el.remove());
  
  // Clear cached data periodically
  if (window.gc && typeof window.gc === 'function') {
    window.gc();
  }
}

// Cleanup every 5 minutes
setInterval(cleanupMemory, 5 * 60 * 1000);
