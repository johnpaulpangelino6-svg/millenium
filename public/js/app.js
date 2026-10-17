// ==========================================================================
// MILLENNIUM SMARTBOARD MANAGEMENT SYSTEM - CORE APPLICATION LOGIC
// Full-Stack TypeScript REST API Integration, IoT Simulator & Role Controller
// ==========================================================================

const API_BASE = '/api';

// --- Role Access Configuration ---
// Defines which tabs each role can access.
// Every role gets 'dashboard' as its landing tab; renderApp() dispatches the
// 'dashboard' case to a role-specific view (see DASHBOARD_ROLE_VIEWS below).
const ROLE_ACCESS = {
  admin:      ['dashboard','devices','tickets','customer-portal','warranty','inventory','data-manager','cms','predictive','analytics','rentals','directory'],
  technician: ['dashboard','devices','tickets','inventory','directory'],
  customer:   ['dashboard','devices','tickets','customer-portal','rentals','directory'],
};

// Role display metadata. `icon` is a sprite name (see public/js/icons.js), not
// a glyph — render it through ico() so it inherits colour and font-size.
const ROLE_META = {
  admin:      { icon: 'building', name: 'Admin Portal',      desc: 'Full system access',          defaultTab: 'dashboard' },
  technician: { icon: 'wrench',   name: 'Technician Portal', desc: 'Assigned jobs & inventory',   defaultTab: 'dashboard' },
  customer:   { icon: 'school',   name: 'Customer Portal',   desc: 'My Devices & Tickets',        defaultTab: 'dashboard' },
};

// Sidebar copy for the shared 'dashboard' nav item. The single nav entry is
// visible to all three roles, so its label/subtext are swapped in applyRoleUI()
// rather than duplicated as three separate nav items (which would let two of
// them drift out of sync).
const DASHBOARD_NAV_COPY = {
  admin:      { title: 'Dashboard',            sub: 'Overview & key metrics' },
  technician: { title: 'My Workspace',         sub: 'Assigned jobs & queue'  },
  customer:   { title: 'My Dashboard',         sub: 'My devices & records'   },
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
  directory: [],
  rentals: [],
  rentalStats: null,
  rentalFilterStatus: '',
  rentalCalendarMonth: new Date().getMonth(),
  rentalCalendarYear: new Date().getFullYear(),
  rentalViewMode: 'list', // 'list' | 'calendar'
  dataManagerSubTab: 'users', // 'users' | 'customers' | 'allocation'
  clientTypeFilter: 'all', // Data Manager customers tab: 'all' | 'school' | 'corporate'
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
  // Data Manager > Device Allocation: 'all' | 'assigned' | 'unassigned'
  allocFilter: 'all',
  // Directory role filter: 'all' | 'admin' | 'technician' | 'customer'
  directoryRoleFilter: 'all',
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
  const roleEl = document.getElementById('authUserRole');
  const menuNameEl = document.getElementById('authUserMenuName');
  const displayName = user.fullName || user.username;

  if (nameEl)   nameEl.textContent  = displayName;
  if (menuNameEl) menuNameEl.textContent = displayName;
  if (locEl)    locEl.textContent   = user.location || 'All Locations';
  if (avatarEl) avatarEl.textContent = displayName.charAt(0).toUpperCase();

  // The top bar shows the role under the name (the reference design), while the
  // account menu keeps the location — both are useful, so neither is dropped.
  if (roleEl) {
    const meta = ROLE_META[user.role];
    roleEl.textContent = meta ? meta.name : (user.role || 'Member');
  }

  // The bar is narrow, so a long name ellipsizes; the tooltip keeps the full
  // value reachable on hover.
  if (nameEl)   nameEl.title         = displayName;
  if (locEl)    locEl.title          = user.location || 'All Locations';
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
      // Re-sync the role-dependent fields — the Client Category selector's
      // visibility and the organization label — with whatever the Account Type
      // select currently holds, so reopening the tab can never show a stale
      // form (e.g. a technician account still offering a Client Category).
      updateRegLocationLabel(document.getElementById('regRole')?.value);
      const r = document.getElementById('regFullName');
      if (r) r.focus();
    }
  }
}

/**
 * Password reset by emailed one-time code.
 *
 * Three steps, backed by three endpoints:
 *   1. POST /auth/forgot-password   -> emails a 6-digit code
 *   2. POST /auth/verify-reset-code -> confirms the code
 *   3. POST /auth/reset-password    -> sets the new password
 *
 * The code is never held in a variable that outlives the dialog; it is read
 * from the input on submit and cleared when the flow closes.
 */
function handleForgotPassword() {
  const existing = document.getElementById('forgotPwOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'forgotPwOverlay';
  // --above-auth is required: this dialog is opened from the sign-in screen,
  // which is itself a fixed overlay at z-index 9999. A plain .modal-backdrop
  // (1000) renders behind it, so the dialog opened invisibly.
  overlay.className = 'modal-backdrop modal-backdrop--above-auth';
  overlay.innerHTML = `
    <div class="modal-content reset-pw-modal" role="dialog" aria-modal="true"
         aria-labelledby="resetPwTitle">
      <button type="button" class="reset-pw-close" id="resetPwClose" aria-label="Close">×</button>

      <div class="reset-pw-head">
        <div class="reset-pw-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            <circle cx="12" cy="15.6" r="1.3" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div>
          <h3 class="reset-pw-title" id="resetPwTitle">Reset your password</h3>
          <p class="reset-pw-sub" id="resetPwSub">We will email you a 6-digit code.</p>
        </div>
      </div>

      <div class="reset-pw-steps" id="resetPwSteps">
        <span class="reset-pw-step is-active" data-step="1"><b>1</b> Email</span>
        <span class="reset-pw-step" data-step="2"><b>2</b> Code</span>
        <span class="reset-pw-step" data-step="3"><b>3</b> New password</span>
      </div>

      <div class="reset-pw-body" id="resetPwBody"></div>

      <div class="reset-pw-alert" id="resetPwAlert" style="display:none;" role="alert"></div>

      <div class="modal-footer reset-pw-foot">
        <button type="button" class="btn btn-secondary" id="resetPwBack" style="display:none;">Back</button>
        <button type="button" class="btn btn-primary" id="resetPwPrimary">Send code</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  const bodyEl   = overlay.querySelector('#resetPwBody');
  const alertEl  = overlay.querySelector('#resetPwAlert');
  const primary  = overlay.querySelector('#resetPwPrimary');
  const backBtn  = overlay.querySelector('#resetPwBack');
  const closeBtn = overlay.querySelector('#resetPwClose');
  const subEl    = overlay.querySelector('#resetPwSub');
  const steps    = Array.from(overlay.querySelectorAll('.reset-pw-step'));

  const draft = {
    step: 1,
    email: (document.getElementById('loginUsername') || {}).value || '',
    code: '',
  };

  // The primary button's idle label for the current step. `busy(false)` restores
  // it — the previous implementation assigned primary.textContent to itself,
  // which is a no-op, so the button stayed frozen on "Sending code…" after the
  // first request and the dialog looked hung. Every step must go through
  // setPrimaryLabel so this stays in sync.
  let restingLabel = 'Send code';

  // Mirrors the server's 60s resend cooldown.
  //
  // The server deliberately sends NOTHING inside that window, yet still answers
  // "success" — it has to, because a different answer would reveal which email
  // addresses have accounts. Without a matching client-side cooldown the dialog
  // would cheerfully report "A new code is on its way." for a send that was
  // never even attempted, which is exactly the silent dead end this flow keeps
  // producing.
  const RESEND_COOLDOWN_MS = 60000;
  let lastCodeRequestAt = 0;
  let lastCodeEmail = '';

  /**
   * Milliseconds the user must still wait before a resend to `email` would
   * actually send anything; 0 when a resend is allowed.
   *
   * Kept as a small pure function (state in, number out) so the cooldown rule
   * can be regression-tested without a DOM — see tests/reset-dialog-cooldown.
   */
  function resendWaitMs(email, now) {
    if (!email || lastCodeEmail !== email) return 0;
    return Math.max(0, RESEND_COOLDOWN_MS - (now - lastCodeRequestAt));
  }

  function setPrimaryLabel(text) {
    restingLabel = text;
    primary.textContent = text;
  }

  function setAlert(message, kind) {
    if (!message) { alertEl.style.display = 'none'; return; }
    alertEl.className = 'reset-pw-alert is-' + (kind || 'error');
    alertEl.innerHTML = message;
    alertEl.style.display = '';
  }

  function setStep(n) {
    draft.step = n;
    steps.forEach((s) => {
      const v = Number(s.dataset.step);
      const done = v < n;
      s.classList.toggle('is-active', v === n);
      s.classList.toggle('is-done', done);
      // Swap the number for a tick once the step is behind us, so the track
      // reads as progress rather than three static labels.
      const badge = s.querySelector('b');
      if (badge) badge.innerHTML = done ? ico('check') : String(v);
    });
    backBtn.style.display = n === 1 ? 'none' : '';
    setAlert('');
  }

  function renderStep1() {
    setStep(1);
    subEl.textContent = 'We will email you a 6-digit code.';
    setPrimaryLabel('Send code');
    bodyEl.innerHTML = `
      <label class="reset-pw-label" for="resetPwEmail">Registered email address</label>
      <input type="email" id="resetPwEmail" class="form-input" autocomplete="email"
        placeholder="you@example.com" value="${escapeHtml(draft.email || '')}" />
      <p class="reset-pw-hint">Use the email address on your Millennium account. The code expires in 10 minutes.</p>
    `;
    const input = overlay.querySelector('#resetPwEmail');
    if (input) {
      input.focus();
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') primary.click(); });
    }
  }

  function renderStep2() {
    setStep(2);
    subEl.textContent = 'Enter the code we sent to ' + draft.email + '.';
    setPrimaryLabel('Verify code');
    bodyEl.innerHTML = `
      <label class="reset-pw-label" for="resetPwCode">6-digit code</label>
      <input type="text" id="resetPwCode" class="form-input reset-pw-code"
        inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" />
      <p class="reset-pw-hint">
        Nothing in your inbox? Check spam, or
        <button type="button" class="reset-pw-link" id="resetPwResend">send a new code</button><span id="resetPwCooldown"></span>.
      </p>
    `;
    const input = overlay.querySelector('#resetPwCode');
    if (input) {
      input.focus();
      // Digits only — the field is numeric, so pasted spaces/dashes are stripped.
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') primary.click(); });
    }
    const resend = overlay.querySelector('#resetPwResend');
    const cooldownEl = overlay.querySelector('#resetPwCooldown');
    if (resend) {
      resend.onclick = async () => { await requestCode(true); };
      // Show the wait instead of letting the user click into it and be told a
      // code is on its way when none was sent.
      const tick = () => {
        const left = Math.ceil(resendWaitMs(draft.email, Date.now()) / 1000);
        if (left <= 0) {
          clearInterval(timer);
          resend.disabled = false;
          if (cooldownEl) cooldownEl.textContent = '';
          return;
        }
        resend.disabled = true;
        if (cooldownEl) cooldownEl.textContent = ' (available in ' + left + 's)';
      };
      const timer = setInterval(tick, 250);
      tick();
    }
  }

  function renderStep3() {
    setStep(3);
    subEl.textContent = 'Choose a new password for ' + draft.email + '.';
    setPrimaryLabel('Set new password');
    bodyEl.innerHTML = `
      <label class="reset-pw-label" for="resetPwNew">New password</label>
      <input type="password" id="resetPwNew" class="form-input" autocomplete="new-password"
        placeholder="At least 6 characters" />
      <label class="reset-pw-label" for="resetPwConfirm" style="margin-top:12px;">Confirm new password</label>
      <input type="password" id="resetPwConfirm" class="form-input" autocomplete="new-password"
        placeholder="Type it again" />
      <p class="reset-pw-hint">Once saved, sign in with your new password. The old one stops working immediately.</p>
    `;
    const first = overlay.querySelector('#resetPwNew');
    if (first) first.focus();
    ['#resetPwNew', '#resetPwConfirm'].forEach((sel) => {
      const el = overlay.querySelector(sel);
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') primary.click(); });
    });
  }

  function busy(on, label) {
    primary.disabled = !!on;
    // Restore the step's idle label rather than leaving the in-flight text
    // behind: the old code did `primary.textContent = primary.textContent` on
    // the way out, so "Sending code…" / "Verifying…" / "Saving…" stuck forever.
    primary.textContent = on ? (label || 'Working…') : restingLabel;
  }

  async function requestCode(isResend) {
    const input = overlay.querySelector('#resetPwEmail');
    const email = (input ? input.value : draft.email || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAlert('Enter a valid email address.');
      return;
    }
    draft.email = email;

    // Refuse locally rather than firing a request the server will silently
    // ignore and answer "success" to. Reaching the server here would produce a
    // success message for a send that never happens.
    const waitMs = resendWaitMs(email, Date.now());
    if (waitMs > 0) {
      setAlert(
        'A code was already sent to that address. Please wait ' +
        Math.ceil(waitMs / 1000) + ' seconds before requesting another.',
        'info'
      );
      return;
    }

    busy(true, isResend ? 'Sending…' : 'Sending code…');
    try {
      const resp = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json();
      busy(false);

      if (!data.success) {
        setAlert(data.error || 'We could not start the reset. Please try again.');
        return;
      }

      // No mail transport, so nothing was sent and the code is NOT available
      // here — the server never returns it (it goes to the server console for
      // an admin to relay). Do not advance to step 2 and do not claim a code is
      // on its way: that is the silent dead end this flag exists to prevent.
      if (data.mailUnavailable) {
        // mailSetupHint is only sent outside production, where the person
        // reading this is also the person who can fix it.
        const hint = data.mailSetupHint
          ? '<br /><br /><span class="reset-pw-hint-inline">' + escapeHtml(data.mailSetupHint) + '</span>'
          : '';
        setAlert(
          'This server has no email delivery configured, so no reset code could be sent. ' +
          'Please ask an administrator to reset your password for you.' + hint,
          'error'
        );
        return;
      }

      // Mail IS configured but the provider rejected the send, so nothing went
      // out. Same reasoning as above: do not advance and do not claim a code is
      // on its way. Without this branch the dialog would say "Code sent" while
      // the mailbox stays empty — the exact dead end this flow keeps hitting.
      if (data.mailFailed) {
        const hint = data.mailErrorHint
          ? '<br /><br /><span class="reset-pw-hint-inline">' + escapeHtml(data.mailErrorHint) + '</span>'
          : '';
        setAlert(
          'Email delivery is failing on this server, so no reset code could be sent. ' +
          'Please ask an administrator to reset your password for you.' + hint,
          'error'
        );
        return;
      }

      // Only now do we know a send was actually attempted and accepted, so
      // start the local cooldown to match the server's.
      lastCodeRequestAt = Date.now();
      lastCodeEmail = email;
      renderStep2();
      if (isResend) {
        setAlert('A new code is on its way.', 'success');
      } else {
        setAlert('Code sent. It expires in 10 minutes.', 'success');
      }
    } catch (err) {
      busy(false);
      setAlert('Network error. Please check your connection.');
    }
  }

  async function verifyCode() {
    const input = overlay.querySelector('#resetPwCode');
    const code = (input ? input.value : '').trim().replace(/\D/g, '');

    if (code.length !== 6) {
      setAlert('Enter the 6-digit code from your email.');
      return;
    }
    draft.code = code;

    busy(true, 'Verifying…');
    try {
      const resp = await fetch(`${API_BASE}/auth/verify-reset-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: draft.email, code }),
      });
      const data = await resp.json();
      busy(false);

      if (!data.success) {
        setAlert(data.error || 'That code is not correct.');
        return;
      }
      renderStep3();
      setAlert('Code verified. Choose your new password.', 'success');
    } catch (err) {
      busy(false);
      setAlert('Network error. Please check your connection.');
    }
  }

  async function submitNewPassword() {
    const newEl = overlay.querySelector('#resetPwNew');
    const conEl = overlay.querySelector('#resetPwConfirm');
    const pw  = newEl ? newEl.value : '';
    const con = conEl ? conEl.value : '';

    if (pw.length < 6) {
      setAlert('Your new password must be at least 6 characters.');
      return;
    }
    if (pw !== con) {
      setAlert('Those two passwords do not match.');
      return;
    }

    busy(true, 'Saving…');
    try {
      const resp = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: draft.email, code: draft.code, password: pw }),
      });
      const data = await resp.json();
      busy(false);

      if (!data.success) {
        setAlert(data.error || 'We could not reset that password.');
        return;
      }

      // Hand the user back to the sign-in form with their email filled in.
      const userInput = document.getElementById('loginUsername');
      const pwInput   = document.getElementById('loginPassword');
      if (userInput) userInput.value = draft.email;
      if (pwInput) { pwInput.value = ''; pwInput.focus(); }

      draft.code = '';
      closeOverlay();
      showToast('Password changed. Sign in with your new password.', 'success');
    } catch (err) {
      busy(false);
      setAlert('Network error. Please check your connection.');
    }
  }

  function closeOverlay() {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  }

  primary.onclick = () => {
    if (draft.step === 1) return requestCode(false);
    if (draft.step === 2) return verifyCode();
    return submitNewPassword();
  };

  backBtn.onclick = () => {
    if (draft.step === 3) { renderStep2(); return; }
    if (draft.step === 2) { renderStep1(); return; }
  };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
  if (closeBtn) closeBtn.onclick = closeOverlay;
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      closeOverlay();
      document.removeEventListener('keydown', esc);
    }
  });

  renderStep1();
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
  console.log('Closing modal...');
  const authCard = document.getElementById('authPortalCard');
  const backdrop = document.getElementById('authModalBackdrop');
  
  if (authCard && backdrop) {
    // Remove visible class and add hidden class
    authCard.classList.remove('auth-modal-visible');
    authCard.classList.add('auth-modal-hidden');
    backdrop.classList.remove('active');
    
    console.log('Modal closed');
    
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
    console.log('Modal Check on Page Load:');
    console.log('  - Element found:', !!authCard);
    console.log('  - Has auth-modal-hidden:', authCard.classList.contains('auth-modal-hidden'));
    console.log('  - Has auth-modal-visible:', authCard.classList.contains('auth-modal-visible'));
    console.log('  - Computed display:', window.getComputedStyle(authCard).display);
    console.log('  - Computed opacity:', window.getComputedStyle(authCard).opacity);
    
    if (authCard.classList.contains('auth-modal-hidden')) {
      console.log('Modal is correctly HIDDEN on page load');
    } else {
      console.warn('Modal might be visible! Check CSS cache.');
    }
  }

  // Ping the server on page load so a connection problem is reported early.
  // The banner is an ERROR indicator only: it stays hidden while everything
  // works and appears solely when the backend is unreachable. Previously a
  // green "Backend connected — Database online" bar slid across the top on
  // every single load, which read as clutter rather than information.
  const banner = document.getElementById('backendStatusBanner');
  const bannerText = document.getElementById('backendStatusText');

  fetch(`${API_BASE}/stats/dashboard`, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      // Healthy: make sure no stale error banner is left showing.
      if (banner) banner.style.display = 'none';
      console.log('Backend server is reachable');
    })
    .catch(err => {
      console.error('Backend server unreachable on page load:', err.message);
      if (banner) {
        banner.style.display = 'block';
        banner.style.background = 'linear-gradient(90deg,#dc2626,#991b1b)';
        if (bannerText) bannerText.innerHTML = 'Backend server not reachable. Please start the server: <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">cd c:\\xampp\\htdocs\\millenium-smartboard-main && npx tsx src/server.ts</code>';
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
    showToast(`Welcome, ${user.fullName || user.username}! Signed in as ${roleLabel} `, 'success');

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
    if (label) label.textContent = `Fill ${role} credentials`;
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

/**
 * Sync the register form with the chosen Account Type.
 *
 * `role` drives three things:
 *   1. the organization field's label and placeholder,
 *   2. whether the Client Category (School vs Corporate) selector is shown —
 *      a field technician is internal staff, not a client, so the question
 *      does not apply and the organization field spans the full row instead,
 *   3. the field's `required` state, so a technician form cannot be blocked by
 *      a hidden-but-mandatory select.
 */
function updateRegLocationLabel(role) {
  const label       = document.getElementById('regOrgLabel');
  const orgInput    = document.getElementById('regOrganization');
  const orgGroup    = document.getElementById('regOrgGroup');
  const clientGroup = document.getElementById('regClientTypeGroup');
  const clientSel   = document.getElementById('regClientType');
  const isCustomer  = role === 'customer';

  if (label) {
    label.textContent = isCustomer ? 'School / Organization Name' : 'Company / Department';
  }
  if (orgInput) {
    orgInput.placeholder = isCustomer
      ? 'e.g. Ateneo de Manila University'
      : 'e.g. Brains Infinite Innovations';
  }

  if (clientGroup) clientGroup.style.display = isCustomer ? '' : 'none';
  if (clientSel)   clientSel.required = isCustomer;
  // With the selector hidden the organization field would be stranded in the
  // left half of a 2-column row, so let it take the whole width.
  if (orgGroup) orgGroup.classList.toggle('auth-field-group--span-2', !isCustomer);
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
    // Load this account's own notification/accessibility preferences.
    applyUserPrefs();
    fetchAllData();
    showToast(`Welcome back, ${user.fullName || user.username}! `, 'success');

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
  // Only collected for customer accounts; the server validates it too.
  const clientType = document.getElementById('regClientType')?.value;
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
  if (role === 'customer' && !['school', 'corporate'].includes(clientType)) {
    showAuthError(errorEl, 'Please choose whether you are a School or a Corporate client.');
    return;
  }
  if (role === 'customer' && !organization) {
    showAuthError(errorEl, 'Please enter your School / Organization name.');
    return;
  }

  btn.disabled = true;
  const txtSpan = btn.querySelector('.auth-btn-text') || btn.querySelector('span');
  if (txtSpan) txtSpan.textContent = 'Creating account...';

  try {
    const resp = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, fullName, role, location, organization, clientType }),
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
      showToast(`Welcome to Millennium, ${user.fullName}! `, 'success');
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

  // Which tile in the Appearance section should read as selected right now.
  const liveTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

  // Per-account preferences for the new Notifications / Accessibility sections.
  // Keyed by user id so two accounts on the same browser do not share them.
  const prefs = getUserPrefs(me.id);

  const overlay = document.createElement('div');
  overlay.id = 'profileModalOverlay';
  overlay.className = 'modal-backdrop';

  overlay.innerHTML = `
    <div class="modal-content modal-form modal-wide settings-modal" role="dialog" aria-modal="true" aria-labelledby="profileModalTitle">
      <div class="modal-header">
        <h3 class="modal-title" id="profileModalTitle">Settings</h3>
        <button type="button" class="modal-close" aria-label="Close"
          onclick="document.getElementById('profileModalOverlay').remove()">×</button>
      </div>

      <form id="profileForm" onsubmit="saveProfile(event)">
        <div class="settings-shell">

          <!-- Section rail. Each entry jumps to its section in the pane on the
               right — that split is what makes this read as a settings screen
               instead of one long form you have to scroll to find things in. -->
          <nav class="settings-rail" aria-label="Settings sections">
            <button type="button" class="settings-rail-item is-active" data-settings-jump="setSecProfile">
              <span class="settings-rail-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-user"></use></svg></span>
              <span class="settings-rail-text"><strong>Profile</strong><span>Name, email, location</span></span>
            </button>
            <button type="button" class="settings-rail-item" data-settings-jump="setSecAppearance">
              <span class="settings-rail-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-palette"></use></svg></span>
              <span class="settings-rail-text"><strong>Appearance</strong><span>Light or dark mode</span></span>
            </button>
            <button type="button" class="settings-rail-item" data-settings-jump="setSecAccount">
              <span class="settings-rail-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-lock"></use></svg></span>
              <span class="settings-rail-text"><strong>Account</strong><span>Role and organization</span></span>
            </button>
            <button type="button" class="settings-rail-item" data-settings-jump="setSecSecurity">
              <span class="settings-rail-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-key"></use></svg></span>
              <span class="settings-rail-text"><strong>Security</strong><span>Change password</span></span>
            </button>
            <button type="button" class="settings-rail-item" data-settings-jump="setSecNotifications">
              <span class="settings-rail-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-bell"></use></svg></span>
              <span class="settings-rail-text"><strong>Notifications</strong><span>What reaches you</span></span>
            </button>
            <button type="button" class="settings-rail-item" data-settings-jump="setSecAccessibility">
              <span class="settings-rail-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-accessibility"></use></svg></span>
              <span class="settings-rail-text"><strong>Accessibility</strong><span>Motion and density</span></span>
            </button>
            <button type="button" class="settings-rail-item" data-settings-jump="setSecData">
              <span class="settings-rail-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-folders"></use></svg></span>
              <span class="settings-rail-text"><strong>Data</strong><span>Export and reset</span></span>
            </button>
          </nav>

          <div class="form-body settings-pane" id="settingsPane">

            <div class="profile-identity">
              <div class="profile-avatar-lg">${esc(initial)}</div>
              <div class="profile-identity-text">
                <div class="profile-identity-name">${esc(me.fullName || me.username)}</div>
                <div class="profile-identity-sub">@${esc(me.username)} · ${esc(me.email || 'no email')}</div>
                <span class="profile-role-pill">${esc(roleMeta.name)}</span>
              </div>
              <!-- Everything saved below is public: it is what colleagues see in
                   the Directory. This opens the exact card they get, so "visible
                   to all users" is checkable instead of assumed. -->
              <button type="button" class="profile-preview-btn" id="profilePreviewBtn">
                View as others see me
              </button>
            </div>

            <section class="form-section settings-sec" id="setSecProfile">
              <div class="form-section-title">Profile</div>
              <p class="settings-sec-desc">How your name and location appear to everyone else on the system.</p>
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

            <section class="form-section settings-sec" id="setSecAppearance">
              <div class="form-section-title">Appearance</div>
              <p class="settings-sec-desc">Applies straight away and is remembered on this device.</p>
              <div class="theme-pref-row">
                <button type="button" class="theme-pill${liveTheme === 'light' ? ' is-on' : ''}"
                  id="settingsThemeToggle" onclick="toggleThemeFromSettings()" role="switch"
                  aria-checked="${liveTheme === 'light' ? 'true' : 'false'}"
                  aria-label="Light mode">
                  <span class="theme-pill-label">Light mode</span>
                  <span class="theme-pill-track" aria-hidden="true">
                    <span class="theme-pill-knob"></span>
                  </span>
                </button>
              </div>
            </section>

            <section class="form-section settings-sec" id="setSecAccount">
              <div class="form-section-title">Account</div>
              <p class="settings-sec-desc">Read-only. An administrator manages these values for you.</p>
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
            </section>

            <section class="form-section settings-sec" id="setSecSecurity">
              <div class="form-section-title">Security</div>
              <p class="settings-sec-desc">Leave the password fields blank to keep your current password.</p>
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

            <section class="form-section settings-sec" id="setSecNotifications">
              <div class="form-section-title">Notifications</div>
              <p class="settings-sec-desc">
                Choose what reaches your bell. These preferences are per account and only ever filter
                notifications you already have permission to see.
              </p>

              <div class="settings-toggle-list">
                <div class="settings-toggle-row">
                  <span class="settings-toggle-text">
                    <strong>Ticket activity</strong>
                    <span>New tickets and status changes on tickets you can access</span>
                  </span>
                  <button type="button" class="pref-switch${prefs.notifyTickets ? ' is-on' : ''}"
                    data-pref-toggle="notifyTickets" role="switch" aria-checked="${prefs.notifyTickets ? 'true' : 'false'}"
                    aria-label="Ticket activity notifications">
                    <span class="pref-switch-track" aria-hidden="true"><span class="pref-switch-knob"></span></span>
                  </button>
                </div>

                <div class="settings-toggle-row">
                  <span class="settings-toggle-text">
                    <strong>Chat messages</strong>
                    <span>Messages in the ticket channels you are part of</span>
                  </span>
                  <button type="button" class="pref-switch${prefs.notifyMessages ? ' is-on' : ''}"
                    data-pref-toggle="notifyMessages" role="switch" aria-checked="${prefs.notifyMessages ? 'true' : 'false'}"
                    aria-label="Chat message notifications">
                    <span class="pref-switch-track" aria-hidden="true"><span class="pref-switch-knob"></span></span>
                  </button>
                </div>

                <div class="settings-toggle-row" id="prefStockRow">
                  <span class="settings-toggle-text">
                    <strong>Low stock alerts</strong>
                    <span>Parts at or below their minimum threshold (admin only)</span>
                  </span>
                  <button type="button" class="pref-switch${prefs.notifyStock ? ' is-on' : ''}"
                    data-pref-toggle="notifyStock" role="switch" aria-checked="${prefs.notifyStock ? 'true' : 'false'}"
                    aria-label="Low stock notifications">
                    <span class="pref-switch-track" aria-hidden="true"><span class="pref-switch-knob"></span></span>
                  </button>
                </div>

                <div class="settings-toggle-row">
                  <span class="settings-toggle-text">
                    <strong>Show unread count on the bell</strong>
                    <span>Turn off to keep the badge hidden while still collecting notifications</span>
                  </span>
                  <button type="button" class="pref-switch${prefs.showBadge ? ' is-on' : ''}"
                    data-pref-toggle="showBadge" role="switch" aria-checked="${prefs.showBadge ? 'true' : 'false'}"
                    aria-label="Show unread notification count">
                    <span class="pref-switch-track" aria-hidden="true"><span class="pref-switch-knob"></span></span>
                  </button>
                </div>
              </div>
            </section>

            <section class="form-section settings-sec" id="setSecAccessibility">
              <div class="form-section-title">Accessibility</div>
              <p class="settings-sec-desc">Display options that make the interface easier to read and calmer to use.</p>

              <div class="settings-toggle-list">
                <div class="settings-toggle-row">
                  <span class="settings-toggle-text">
                    <strong>Reduce motion</strong>
                    <span>Stops slide, fade and pulse animations across the app</span>
                  </span>
                  <button type="button" class="pref-switch${prefs.reduceMotion ? ' is-on' : ''}"
                    data-pref-toggle="reduceMotion" role="switch" aria-checked="${prefs.reduceMotion ? 'true' : 'false'}"
                    aria-label="Reduce motion">
                    <span class="pref-switch-track" aria-hidden="true"><span class="pref-switch-knob"></span></span>
                  </button>
                </div>

                <div class="settings-toggle-row">
                  <span class="settings-toggle-text">
                    <strong>Compact density</strong>
                    <span>Tighter spacing so more rows fit on screen</span>
                  </span>
                  <button type="button" class="pref-switch${prefs.compact ? ' is-on' : ''}"
                    data-pref-toggle="compact" role="switch" aria-checked="${prefs.compact ? 'true' : 'false'}"
                    aria-label="Compact density">
                    <span class="pref-switch-track" aria-hidden="true"><span class="pref-switch-knob"></span></span>
                  </button>
                </div>

                <div class="settings-toggle-row">
                  <span class="settings-toggle-text">
                    <strong>Larger text</strong>
                    <span>Increases the base font size by one step</span>
                  </span>
                  <button type="button" class="pref-switch${prefs.largeText ? ' is-on' : ''}"
                    data-pref-toggle="largeText" role="switch" aria-checked="${prefs.largeText ? 'true' : 'false'}"
                    aria-label="Larger text">
                    <span class="pref-switch-track" aria-hidden="true"><span class="pref-switch-knob"></span></span>
                  </button>
                </div>
              </div>
            </section>

            <section class="form-section settings-sec" id="setSecData">
              <div class="form-section-title">Data &amp; privacy</div>
              <p class="settings-sec-desc">
                Your notifications are private to this account. Technicians only see tickets assigned to them,
                customers only see their own organization, and staff chat is never shown to customers.
              </p>

              <div class="settings-action-list">
                <div class="settings-action-row">
                  <span class="settings-action-text">
                    <strong>Download my account data</strong>
                    <span>Profile, role and preferences as a JSON file</span>
                  </span>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="downloadMyAccountData()">
                    Download
                  </button>
                </div>

                <div class="settings-action-row">
                  <span class="settings-action-text">
                    <strong>Reset local preferences</strong>
                    <span>Restores notification and accessibility defaults on this device</span>
                  </span>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="resetMyPreferences()">
                    ${ico('refresh')} Reset
                  </button>
                </div>
              </div>
            </section>

          </div>
        </div>

        <div class="modal-footer">
          <span class="settings-footer-hint">Profile changes apply as soon as you save.</span>
          <button type="button" class="btn btn-secondary"
            onclick="document.getElementById('profileModalOverlay').remove()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="profileSaveBtn">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  // "View as others see me" — reuses the Directory profile dialog verbatim, so
  // what the user previews is literally the same component their colleagues get.
  const previewBtn = overlay.querySelector('#profilePreviewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', async () => {
      // Make sure the directory cache is current, otherwise the preview can show
      // a stale name right after an edit.
      if (!Array.isArray(state.directory) || !state.directory.some((p) => p.id === me.id)) {
        try { await fetchAllData(); } catch { /* keep going with whatever we have */ }
      }
      overlay.remove();
      openDirectoryProfile(me.id);
    });
  }

  // Wire the section rail: click to jump, and highlight whichever section the
  // pane is currently showing so the rail doubles as a "you are here" marker.
  const pane = overlay.querySelector('.settings-pane');
  const railItems = Array.from(overlay.querySelectorAll('.settings-rail-item'));
  const sections = Array.from(overlay.querySelectorAll('.settings-sec'));
  const markActive = (id) => {
    railItems.forEach((b) => b.classList.toggle('is-active', b.dataset.settingsJump === id));
  };

  // The spy compares `scrollTop` against each section's offset within the pane
  // (the pane is `position: relative` in the stylesheet, so it is the
  // offsetParent) rather than against viewport rects. A rect-based version
  // races the smooth scroll: the first scroll event fires while scrollTop is
  // still 0, so it re-highlights the FIRST section and undoes the click that
  // started the animation.
  if (pane) {
    pane.addEventListener('scroll', () => {
      const atBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4;
      let current = sections[0] ? sections[0].id : null;
      for (const sec of sections) {
        if (sec.offsetTop <= pane.scrollTop + 12) current = sec.id;
      }
      // A short last section can never reach the top of the pane, so scrolling
      // all the way down has to count as "you are on the last one".
      if (atBottom && sections.length) current = sections[sections.length - 1].id;
      if (current) markActive(current);
    }, { passive: true });
  }

  railItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = overlay.querySelector('#' + btn.dataset.settingsJump);
      if (!target || !pane) return;
      pane.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior: 'smooth' });
      markActive(btn.dataset.settingsJump);
    });
  });

  // Notification / accessibility switches. Each one writes its own preference
  // and re-applies display settings immediately, so the effect is visible
  // behind the dialog without needing a save.
  overlay.querySelectorAll('[data-pref-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.prefToggle;
      const next = !btn.classList.contains('is-on');
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-checked', next ? 'true' : 'false');
      setUserPref(key, next);
    });
  });

  // Low-stock alerts are admin-only (the server never sends them to other
  // roles), so the row is hidden rather than shown as a dead control.
  if (me.role !== 'admin') {
    overlay.querySelector('#prefStockRow')?.remove();
  }

  const onKey = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

/**
 * The single Settings entry point.
 *
 * The sidebar used to expose Appearance and Profile as two separate rows, which
 * meant "where do I change X?" had two possible answers. Everything now lives
 * behind one button and one dialog: appearance first, then the profile details,
 * then the password. openProfileModal() stays as the implementation so the
 * existing auth-chip and keyboard shortcuts keep working.
 */
function openSettingsModal() {
  return openProfileModal();
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
      showToast(`${data.error || 'Could not save your profile.'}`, 'error');
      return;
    }

    // Reflect the saved values immediately in the session and the sidebar chip.
    const updated = Object.assign({}, state.currentUser, data.data);
    state.currentUser = updated;
    saveAuthSession(updated);
    updateAuthChip(updated);

    document.getElementById('profileModalOverlay')?.remove();
    showToast(
      payload.newPassword ? 'Profile and password updated.' : 'Profile updated.',
      'success'
    );

    // The Directory is the surface where "everyone else" sees these fields, and
    // it is served from a cached payload. Refetch so the change is live for the
    // current session without waiting for a manual Refresh.
    try { await fetchAllData(); } catch { /* the profile itself is already saved */ }
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original || 'Save Changes'; }
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
  if (iconEl) iconEl.innerHTML = ico(meta.icon);
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
  // The toast draws its own status icon from `type`, so no call site has to
  // repeat one — and the glyph is identical on Windows, macOS and Linux,
  // which the old emoji was not.
  const TOAST_ICON = { success: 'check-circle', error: 'x-circle', info: 'info' };
  const tone = TOAST_ICON[type] ? type : 'info';

  // A handful of call sites still prefix their message with a status emoji.
  // Strip it here — one place, instead of editing every call site — so the
  // icon above is never doubled up.
  const LEADING_STATUS_EMOJI = /^\s*(?:\u2705|\u274C|\u26A0\uFE0F?|\u2139\uFE0F?|\u{1F6AB}|\u26D4|\u{1F4A1})\s*/u;
  const text = String(message == null ? '' : message).replace(LEADING_STATUS_EMOJI, '');

  toast.className = `toast-notification is-${tone}`;
  toast.innerHTML = `${ico(TOAST_ICON[tone])}<span>${text}</span>`;
  toast.classList.add('active');
  setTimeout(() => {
    toast.classList.remove('active');
  }, 4000);
}

// --- Rental ownership helpers ---
// A booking belongs to the ACCOUNT that created it, not to the customer
// organization. The server already scopes the payload (see GET /api/rentals);
// this is a second, defensive filter and it must use exactly the same rule.
// Matching on organization here would re-introduce the leak: two logins for the
// same customer would see each other's bookings. Rows with no owner are
// admin-only, so they match nobody here.
function rentalMatchesUser(rental, user) {
  if (!rental || !user) return false;
  const ownerId = String(rental.createdByUserId || '').trim();
  const userId  = String(user.id || '').trim();
  return !!ownerId && !!userId && ownerId === userId;
}

/**
 * The single source of truth for "which rentals may this user see".
 * Admins/technicians see everything; customers see only the bookings their own
 * account created. Used by BOTH the Rentals page and the customer portal so the
 * two never disagree.
 */
function getVisibleRentals() {
  const all = state.rentals || [];
  if (state.currentRole !== 'customer' || !state.currentUser) return all;
  return all.filter(r => rentalMatchesUser(r, state.currentUser));
}

/**
 * The single source of truth for "which devices may this user see".
 *
 * A customer sees only the devices bound to their organization — matched by
 * linked customer id first, then by the account's customerId, then by
 * organization name. Admins and technicians see the whole fleet (technicians
 * need to reach any device they are dispatched to). The server applies the same
 * rule in GET /api/devices; this second layer exists so the dashboard, the
 * portal and the device list can never disagree.
 */
function getVisibleDevices() {
  const all = state.devices || [];
  const user = state.currentUser;
  if (state.currentRole !== 'customer' || !user) return all;

  const userOrg    = (user.organization || '').trim().toLowerCase();
  const userCustId = (user.customerId || '').trim().toLowerCase();

  // The customer record this account is bound to, if any.
  const matchedCustomer = (state.customers || []).find(c =>
    (userCustId && String(c.id || '').toLowerCase() === userCustId) ||
    (userOrg && String(c.organizationName || '').toLowerCase() === userOrg)
  );

  return all.filter((d) => {
    const devCustId   = (d.customerId || '').trim().toLowerCase();
    const devCustName = (d.customerName || '').trim().toLowerCase();

    if (matchedCustomer && devCustId === String(matchedCustomer.id || '').toLowerCase()) return true;
    if (userCustId && devCustId === userCustId) return true;
    if (userOrg && devCustName === userOrg) return true;
    return false;
  });
}

/**
 * Resolve the customer organization record that owns a given device.
 * Used by owner-facing helpers so device→user linking is consistent everywhere.
 */
function getDeviceCustomer(device) {
  if (!device) return null;
  const devCustId = String(device.customerId || '').trim().toLowerCase();
  const devCustName = String(device.customerName || '').trim().toLowerCase();
  return (state.customers || []).find((c) => {
    const cid = String(c.id || '').trim().toLowerCase();
    const org = String(c.organizationName || '').trim().toLowerCase();
    return (devCustId && cid === devCustId) || (devCustName && org === devCustName);
  }) || null;
}

/**
 * Return the user account(s) that own a device, matched by customerId or
 * organization name. A device may have multiple user accounts under the same
 * customer organization; all of them are considered owners.
 */
function getDeviceOwners(device) {
  const customer = getDeviceCustomer(device);
  const custId = customer ? String(customer.id || '').trim().toLowerCase() : '';
  const custOrg = customer ? String(customer.organizationName || '').trim().toLowerCase()
    : String(device.customerName || '').trim().toLowerCase();

  const candidates = state.directory || state.allUsers || [];
  return candidates.filter((u) => {
    const uCustId = String(u.customerId || '').trim().toLowerCase();
    const uOrg = String(u.organization || '').trim().toLowerCase();
    return (custId && uCustId === custId) || (custOrg && uOrg === custOrg);
  });
}

/**
 * Primary owner name for a device. Falls back to the customer organization name
 * or the device's customerName if no user account is linked yet.
 */
function getDeviceOwnerName(device) {
  const owners = getDeviceOwners(device);
  if (owners.length > 0) return owners.map((u) => u.fullName || u.username).join(', ');
  const customer = getDeviceCustomer(device);
  if (customer) return customer.organizationName || customer.contactName || 'Customer Org';
  return device.customerName || 'Unassigned';
}

/**
 * Device online status is driven by real-time user account presence.
 * If any user who owns the device is currently online, the device is "online".
 * Otherwise it is "offline". This replaces the static telemetry status.
 */
function getDeviceOnlineStatus(device) {
  const owners = getDeviceOwners(device);
  if (owners.length === 0) return 'offline';
  return owners.some((u) => u.online === true) ? 'online' : 'offline';
}

/**
 * The status shown for a device. Maintenance and warning states are preserved
 * so technicians still see actionable telemetry, but the online/offline branch
 * is now derived from whether the owning user account is currently online.
 */
function getDeviceDisplayStatus(device) {
  if (!device) return 'offline';
  const base = device.status;
  if (base === 'maintenance' || base === 'warning') return base;
  return getDeviceOnlineStatus(device);
}

/**
 * The single source of truth for "which tickets may this user see".
 *
 * Technicians see only tickets assigned to them. Customers see tickets raised
 * against one of their devices, or carrying their organization name. Admins see
 * everything. Mirrors the scoping in GET /api/tickets.
 */
function getVisibleTickets() {
  const all = state.tickets || [];
  const user = state.currentUser;
  if (!user) return all;

  if (state.currentRole === 'technician') {
    const uid = String(user.id || '').trim();
    return all.filter(t => String(t.assignedTechnicianId || '').trim() === uid);
  }

  if (state.currentRole === 'customer') {
    const userOrg = (user.organization || '').trim().toLowerCase();
    const deviceIds = new Set(getVisibleDevices().map(d => String(d.id || '').toLowerCase()));
    return all.filter(t => {
      const tCustName = (t.customerName || '').trim().toLowerCase();
      if (userOrg && tCustName === userOrg) return true;
      return deviceIds.has(String(t.deviceId || '').toLowerCase());
    });
  }

  return all;
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

  // The directory gets the same treatment, for the same reason: `online` and
  // `lastSeenAt` are derived from live presence and the auth middleware
  // re-stamps the caller on every authenticated request, so those two fields
  // change on every poll even when nobody has actually joined or left. Only
  // the identity fields take part in the signature, so a new colleague still
  // triggers a rebuild while presence churn does not.
  const directoryKey = (state.directory || [])
    .map((u) => `${u.id}:${u.fullName}:${u.role}:${u.location}:${u.organization}`)
    .join(',');

  return [
    state.stats, state.devices, state.tickets, state.warranties,
    state.inventory, state.cms, state.predictiveAlerts, state.auditLogs,
    state.customers, state.rentals, state.rentalStats, state.allUsers,
    directoryKey,
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
      { name: 'customers',      url: `${API_BASE}/customers`,          stateKey: 'customers' },
      { name: 'notifications',  url: `${API_BASE}/notifications`,      stateKey: 'notifications' },
      { name: 'rentals',        url: rentalsUrl,                       stateKey: 'rentals' },
      { name: 'rentals/stats',  url: rentalStatsUrl,                   stateKey: 'rentalStats' },
      // Open to every role — this is the people directory, not the admin user
      // table, and it deliberately carries no contact details.
      { name: 'directory',      url: `${API_BASE}/directory`,          stateKey: 'directory' },
    ];

    // Admin-only feeds. The audit log names other customers' rental numbers and
    // organizations, and the user list is company-wide — neither may be pulled
    // into a customer's or technician's browser, even if no view renders them.
    if (state.currentRole === 'admin') {
      fetchEntries.push({ name: 'audit-logs', url: `${API_BASE}/audit-logs`, stateKey: 'auditLogs' });
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
      // Some endpoints failed — partial load.
      //
      // Stay SILENT unless a failure is unexpected. A customer/technician
      // account legitimately cannot read admin-only collections such as
      // /audit-logs and /auth/users, so those 401/403s are the normal state and
      // fired a "Some data may be incomplete" warning on every single load.
      // Only surface a toast for failures that are NOT an expected auth denial.
      const expected = (reason) => {
        const status = reason && (reason.status || reason.statusCode);
        const msg = String((reason && reason.message) || '');
        return status === 401 || status === 403 || /401|403|Unauthorized|Forbidden/i.test(msg);
      };
      const unexpected = failures.filter(f => !expected(f.reason));

      console.warn(
        `${succeeded.length}/${fetchEntries.length} endpoints OK, ` +
        `${failures.length} failed (${failures.length - unexpected.length} expected auth denials)`
      );

      if (unexpected.length > 0) {
        showToast(
          `${unexpected.length} data source${unexpected.length === 1 ? '' : 's'} could not be loaded.`,
          'warning'
        );
      }
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
      html = renderDashboardForRole(role);
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
    case 'directory':
      html = renderDirectoryView();
      break;
    default:
      html = renderDashboardForRole(role);
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
  if (iconEl) iconEl.innerHTML = ico(meta.icon);
  if (nameEl) nameEl.textContent = meta.name;
  if (descEl) descEl.textContent = meta.desc;

  // Show / hide nav items and section titles based on data-roles attribute
  document.querySelectorAll('.nav-item[data-roles], .nav-section-title[data-roles]').forEach(el => {
    const elRoles = (el.dataset.roles || '').split(' ');
    const visible = elRoles.includes(role);
    el.style.display = visible ? '' : 'none';
  });

  // The shared 'dashboard' nav item is the landing tab for every role, so its
  // label has to say what that role is actually looking at.
  const dashCopy = DASHBOARD_NAV_COPY[role] || DASHBOARD_NAV_COPY.admin;
  const dashNav = document.querySelector('.nav-item[data-tab="dashboard"]');
  if (dashNav) {
    const titleEl = dashNav.querySelector('.nav-title');
    const subEl = dashNav.querySelector('.nav-sub');
    if (titleEl) titleEl.textContent = dashCopy.title;
    if (subEl) subEl.textContent = dashCopy.sub;
  }

  // Highlight the active tab link
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === state.currentTab);
  });
}

function renderSidebarBadges() {
  const onlineCount = state.devices.filter((d) => getDeviceDisplayStatus(d) === 'online').length;
  const tckCount = state.tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed').length;
  const predCount = state.predictiveAlerts.length;
  const invLowCount = state.inventory.filter((i) => i.status !== 'In Stock').length;

  const bDev  = document.getElementById('badgeDevices');
  const bTck  = document.getElementById('badgeTickets');
  const bPred = document.getElementById('badgePredictive');
  const bInv  = document.getElementById('badgeInventory');
  const bTckC = document.getElementById('badgeTicketsCustomer');

  // Numeric pills, with the full wording in the tooltip. A worded badge
  // ("2 Open") widened the pill enough to squeeze .nav-text-group, which
  // wrapped "Service & Support" onto a third line inside a 250px sidebar.
  const setBadge = (el, count, word) => {
    if (!el) return;
    el.textContent = String(count);
    el.title = `${count} ${word}`;
    el.setAttribute('aria-label', `${count} ${word}`);
    el.hidden = count === 0;
  };
  setBadge(bDev,  onlineCount, 'devices online');
  setBadge(bTck,  tckCount,    'open tickets');
  setBadge(bPred, predCount,   'predictive alerts');
  setBadge(bInv,  invLowCount, 'low-stock parts');
  setBadge(bTckC, tckCount,    'open tickets');
}

// --- Notification Logic ---
function renderNotifications() {
  const badge = document.getElementById('notifBadge');
  const list = document.getElementById('notifList');
  if (!badge || !list) return;

  const prefs = getUserPrefs();

  // Preferences filter what is already permitted by the server — they can only
  // narrow the feed, never widen it.
  const notifs = (state.notifications || []).filter((n) => {
    if (n.type === 'low_stock') return prefs.notifyStock;
    if (n.type === 'new_ticket') return prefs.notifyTickets;
    if (n.type === 'new_message' || n.type === 'ticket_message') return prefs.notifyMessages;
    return true;
  });

  const unreadCount = notifs.filter(n => !n.read).length;

  if (unreadCount > 0 && prefs.showBadge) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  // Update header text if present
  const headerTitle = document.querySelector('.notif-dropdown-header h4');
  if (headerTitle) {
    headerTitle.innerHTML = unreadCount > 0 
      ? `Notifications <span style="font-size:0.72rem;padding:2px 7px;border-radius:10px;background:rgba(0,242,254,0.18);color:var(--neon-cyan);font-weight:700;letter-spacing:0;">${unreadCount} New</span>`
      : `Notifications`;
  }

  if (notifs.length === 0) {
    list.innerHTML = `<div style="padding:32px 20px;text-align:center;color:#94a3b8;font-size:0.85rem;"><span style="display:block;font-size:1.8rem;margin-bottom:8px;opacity:0.6;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-bell"></use></svg></span>No new notifications</div>`;
    return;
  }

  // The rendered index must map back to the ORIGINAL array, because
  // handleNotifClick() reads state.notifications[index]. Filtering changed the
  // positions, so each item carries its source index through.
  list.innerHTML = notifs.map((n) => {
    const i = state.notifications.indexOf(n);
    let icon = '';
    let path = '';
    if (n.type === 'low_stock') {
      icon = '';
      path = 'inventory';
    } else if (n.type === 'new_ticket') {
      icon = '';
      path = 'tickets';
    } else if (n.type === 'new_message' || n.type === 'ticket_message') {
      icon = '';
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

/* --- Top-bar account menu ---
   The sidebar's user card is gone; identity, profile and sign-out now live in
   the top bar. The menu is a plain popover rather than a <select> so it can
   carry the account header and a danger-styled sign-out. */
function toggleUserMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('topbarUserMenu');
  const btn = document.getElementById('topbarUserBtn');
  if (!menu || !btn) return;
  const open = !menu.classList.contains('show');
  menu.classList.toggle('show', open);
  btn.classList.toggle('is-open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  // Only one popover at a time — an open notification panel behind the account
  // menu looks like a rendering bug.
  if (open && state.notifDropdownOpen) {
    state.notifDropdownOpen = false;
    document.getElementById('notifDropdown')?.classList.remove('show');
    document.getElementById('notifBtn')?.classList.remove('active');
  }
}

function closeUserMenu() {
  const menu = document.getElementById('topbarUserMenu');
  const btn = document.getElementById('topbarUserBtn');
  if (menu) menu.classList.remove('show');
  if (btn) {
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('topbarUserWrap');
  if (wrap && !wrap.contains(e.target)) closeUserMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUserMenu();
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

/**
 * Dispatch the shared 'dashboard' tab to the view that belongs to the role.
 *
 * Admin, technician and customer all land on `dashboard`, but they must not see
 * each other's view — an admin dashboard leaks company-wide revenue, the user
 * list and other customers' names into a customer's browser.
 */
function renderDashboardForRole(role) {
  if (role === 'customer')   return renderCustomerDashboardView();
  if (role === 'technician') return renderTechnicianDashboardView();
  return renderDashboardView();
}

function renderDashboardView() {
  const total    = state.devices.length;
  const displayStatuses = state.devices.map(getDeviceDisplayStatus);
  const online   = displayStatuses.filter(s => s === 'online').length;
  const offline  = displayStatuses.filter(s => s === 'offline').length;
  const warning  = displayStatuses.filter(s => s === 'warning').length;
  const maint    = displayStatuses.filter(s => s === 'maintenance').length;

  const openTickets     = state.tickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed');
  const receivedTix     = state.tickets.filter(t => t.status === 'Received').length;
  const diagnosingTix   = state.tickets.filter(t => t.status === 'Diagnosing').length;
  const repairingTix    = state.tickets.filter(t => t.status === 'Repairing').length;
  const resolvedTix     = state.tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;

  const lowStockParts   = state.inventory.filter(p => p.status !== 'In Stock');
  const outStockParts   = state.inventory.filter(p => p.status === 'Out of Stock');
  const schoolDevices   = state.devices.filter(d => d.clientType === 'school').length;
  const corpDevices     = state.devices.filter(d => d.clientType === 'corporate').length;

  // Stock level % for the gauge: in-stock items vs total tracked items.
  const totalInventory = state.inventory.length;
  const inStockItems   = state.inventory.filter(p => p.status === 'In Stock').length;
  const stockLevelPct  = totalInventory > 0 ? Math.round((inStockItems / totalInventory) * 100) : 0;

  // Registered client ORGANISATIONS — the School/Corporate choice made at
  // sign-up, held in the `customers` table. Counted separately from devices:
  // a client has to appear here the moment they register, before any board is
  // assigned to them, otherwise a new school or corporate sign-up is invisible
  // on the admin dashboard.
  const clientOrgs    = state.customers || [];
  const schoolClients = clientOrgs.filter(c => c.clientType === 'school').length;
  const corpClients   = clientOrgs.filter(c => c.clientType === 'corporate').length;
  const newestClient  = [...clientOrgs].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  )[0];

  const healthPct = total > 0 ? Math.round((online / total) * 100) : 0;

  // Shares used by the fleet chart. Computed once and guarded against an empty
  // fleet, so the bars read 0 instead of NaN. The previous legend hard-coded
  // "100% / 0% / 0% / 0%" next to live counts, which was simply wrong.
  const sharePct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const fleetBreakdown = [
    { key: 'online',      label: 'Online',        count: online,  pct: sharePct(online),  hint: 'Reporting normally' },
    { key: 'warning',     label: 'Needs a look',  count: warning, pct: sharePct(warning), hint: 'Flagged by monitoring' },
    { key: 'maintenance', label: 'In service',    count: maint,   pct: sharePct(maint),   hint: 'With a technician' },
    { key: 'offline',     label: 'Offline',       count: offline, pct: sharePct(offline), hint: 'Not reporting' },
  ];

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
    <div class="dash-v2-container" data-dash="admin">
      <!-- 1. Hero Banner (full width, no quick-actions panel) -->
      <div class="hero-banner-card">
        <div class="hero-text-content">
          <h1 class="hero-greeting">Welcome Back,<br>${userName}!</h1>
          <p class="hero-subtext">Manage your devices, monitor performance, and keep your operations running smoothly.</p>
          <div class="hero-date-chip">
            <span class="calendar-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-calendar"></use></svg></span>
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

      <!-- 2. Core Stat Summary Cards Row -->
      <div class="stat-cards-grid-v2">
        <div class="kpi-card-v2 kpi-blue">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></div>
            <div>
              <div class="kpi-v2-label">Total Devices</div>
              <div class="kpi-v2-value">${total}</div>
            </div>
          </div>
          <div class="kpi-v2-detail">
            <span class="kpi-v2-detail-dot"></span>
            <span>${schoolDevices} school · ${corpDevices} corporate</span>
          </div>
        </div>

        <div class="kpi-card-v2 kpi-green">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-signal"></use></svg></div>
            <div>
              <div class="kpi-v2-label">Online</div>
              <div class="kpi-v2-value">${online}</div>
            </div>
          </div>
          <div class="kpi-v2-detail">
            <span class="kpi-v2-detail-dot"></span>
            <span>${online} of ${total} reporting · ${healthPct}% healthy</span>
          </div>
        </div>

        <div class="kpi-card-v2 kpi-amber">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-alert"></use></svg></div>
            <div>
              <div class="kpi-v2-label">Needs Attention</div>
              <div class="kpi-v2-value">${warning + offline + maint}</div>
            </div>
          </div>
          <div class="kpi-v2-detail">
            <span class="kpi-v2-detail-dot"></span>
            <span>${warning} warn · ${offline} off · ${maint} maint</span>
          </div>
        </div>

        <div class="kpi-card-v2 kpi-purple">
          <div class="kpi-v2-header">
            <div class="kpi-v2-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-ticket"></use></svg></div>
            <div>
              <div class="kpi-v2-label">Open Tickets</div>
              <div class="kpi-v2-value">${openTickets.length}</div>
            </div>
          </div>
          <div class="kpi-v2-detail">
            <span class="kpi-v2-detail-dot"></span>
            <span>${resolvedTix} resolved to date</span>
          </div>
        </div>
      </div>

      <!-- 3. Horizontal Metadata Strip Bar -->
      <div class="strip-bar-v2">
        <button type="button" class="strip-item strip-item--clickable"
          title="Show every school client account" onclick="showClientsByType('school')">
          School Clients: <strong>${schoolClients}</strong>
        </button>
        <div class="strip-divider"></div>
        <button type="button" class="strip-item strip-item--clickable"
          title="Show every corporate client account" onclick="showClientsByType('corporate')">
          Corporate Clients: <strong>${corpClients}</strong>
        </button>
        <div class="strip-divider"></div>
        <button type="button" class="strip-item strip-item--clickable"
          title="Open the spare-parts inventory" onclick="navigateTo('inventory')">
          Inventory: <strong class="text-amber">${lowStockParts.length} Low</strong>
        </button>
        <div class="strip-divider"></div>
        <div class="strip-item" title="Share of the fleet reporting normally">Health Score: <strong class="text-emerald">${healthPct}%</strong></div>
        <button class="strip-btn-link" onclick="navigateTo('devices')">View All →</button>
      </div>

      <!-- 4. Bottom 3-Column Dashboard Grid -->
      <div class="dash-bottom-grid">
        <!-- Column 1: Device Fleet Status -->
        <div class="widget-card">
          <div class="widget-header">
            <div class="widget-title">Device Fleet Status</div>
            <button class="widget-link" onclick="navigateTo('devices')">View All →</button>
          </div>

          <!-- Donut = share of the fleet that is healthy right now. -->
          <div class="donut-chart-row">
            <div class="donut-container">
              <svg viewBox="0 0 36 36" class="donut-svg" role="img"
                   aria-label="${healthPct}% of ${total} devices are online">
                <path class="donut-ring" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3.8"/>
                <path class="donut-segment" stroke-dasharray="${healthPct}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#00f2fe" stroke-width="3.8"/>
              </svg>
              <div class="donut-center-text">
                <strong>${total}</strong>
                <small>Total Devices</small>
              </div>
            </div>

            <!-- Bar chart: one bar per status, width = share of the fleet. -->
            <div class="fleet-chart">
              <div class="fleet-share-bar" role="img"
                   aria-label="Fleet status breakdown">
                ${fleetBreakdown.filter(b => b.count > 0).map(b => `
                  <span class="fleet-share-seg is-${b.key}" style="width:${b.pct}%"
                        title="${b.label}: ${b.count} (${b.pct}%)"></span>
                `).join('') || '<span class="fleet-share-seg is-empty" style="width:100%"></span>'}
              </div>

              ${fleetBreakdown.map(b => `
                <div class="fleet-bar-row" title="${b.hint}">
                  <span class="fleet-bar-label">
                    <span class="legend-dot ${b.key === 'maintenance' ? 'service' : b.key}"></span>${b.label}
                  </span>
                  <span class="fleet-bar-track">
                    <span class="fleet-bar-fill is-${b.key}" style="width:${b.pct}%"></span>
                  </span>
                  <span class="fleet-bar-count">
                    <strong>${b.count}</strong><small>${b.pct}%</small>
                  </span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Mini device fleet table -->
          <div class="dash-mini-table">
            <div class="dash-mini-table-head">
              <span>Devices</span>
              <span>Status</span>
              <span>Location</span>
            </div>
            ${state.devices.slice(0, 5).map(dev => {
              const displayStatus = getDeviceDisplayStatus(dev);
              const statusClass = displayStatus === 'online' ? 'is-online'
                : displayStatus === 'offline' ? 'is-offline'
                : displayStatus === 'warning' ? 'is-warning'
                : 'is-service';
              const statusLabel = displayStatus === 'online' ? 'Online'
                : displayStatus === 'offline' ? 'Offline'
                : displayStatus === 'warning' ? 'Warning'
                : 'Service';
              return `
              <div class="dash-mini-table-row" onclick="navigateTo('devices')" role="button" tabindex="0">
                <span class="dash-mini-device">
                  <span class="dash-mini-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></span>
                  <span>
                    <strong>${escapeHtml(dev.id)}</strong>
                    <small>${escapeHtml(dev.model || '')}</small>
                  </span>
                </span>
                <span class="dash-mini-status ${statusClass}">${statusLabel}</span>
                <span class="dash-mini-location">${escapeHtml(dev.location || '—')}</span>
              </div>
              `;
            }).join('')}
            ${state.devices.length > 5 ? `
              <div class="dash-mini-table-foot">
                <button class="widget-link" onclick="navigateTo('devices')">View all ${state.devices.length} devices →</button>
              </div>` : ''}
          </div>
        </div>

        <!-- Column 2: Service Tickets -->
        <div class="widget-card">
          <div class="widget-header">
            <div class="widget-title">Service Tickets</div>
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
            <div class="widget-title">Stock & Inventory</div>
            <select class="branch-select-v2" aria-label="Select Branch"><option>All Branches</option></select>
          </div>
          <div class="stock-gauge-row">
            <div class="stock-gauge-circle" style="--gauge-pct: ${stockLevelPct};">
              <strong>${stockLevelPct}%</strong>
              <small>Stock Level</small>
            </div>
            <div class="stock-alerts-list">
              <div class="stock-alerts-title">Parts Stock Alerts <span class="badge-red-sm">${lowStockParts.length} alert${lowStockParts.length === 1 ? '' : 's'}</span></div>
              ${lowStockParts.length === 0 ? `
                <div class="stock-alert-item stock-alert-item--empty">
                  <span>All parts are in stock</span>
                </div>` : lowStockParts.slice(0, 3).map(p => `
                  <div class="stock-alert-item">
                    <div>
                      <strong>${escapeHtml(p.name)}</strong>
                      <small>${escapeHtml(p.partCode)}</small>
                    </div>
                    <span class="alert-pill ${p.status === 'Out of Stock' ? 'out' : 'low'}">${p.status === 'Out of Stock' ? 'Out' : 'Low'} ${ico('chevron-right')}</span>
                  </div>
                `).join('')}
            </div>
          </div>
          <div class="view-inv-link" onclick="navigateTo('inventory')">View Inventory →</div>

          <!-- Quick Actions -->
          <div class="dash-quick-actions">
            <div class="dash-quick-actions-title">Quick Actions</div>
            <div class="dash-quick-actions-grid">
              <button class="qa-btn qa-btn-blue" onclick="openRegisterModal()">
                <span class="qa-icon">+</span>
                <span>Register Board</span>
              </button>
              <button class="qa-btn qa-btn-purple" onclick="openTicketModal()">
                <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-ticket"></use></svg></span>
                <span>Open Ticket</span>
              </button>
              <button class="qa-btn qa-btn-teal" onclick="openInventoryQuickAction()" title="Inventory & Parts Restock">
                <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-package"></use></svg></span>
                <span>Add Parts</span>
              </button>
              <button class="qa-btn qa-btn-navy" onclick="navigateTo('tickets')">
                <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-chart"></use></svg></span>
                <span>View Reports</span>
              </button>
            </div>
          </div>

          <!-- Recent Activity Timeline -->
          <div class="recent-activity-box">
            <div class="activity-header">
              <span>Recent Activity</span>
              <button onclick="navigateTo('inventory')">View All →</button>
            </div>
            <div class="activity-timeline">
              <div class="activity-item">
                <span class="act-icon tix"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-ticket"></use></svg></span>
                <div class="act-desc">Ticket #T-2026-0098 created</div>
                <span class="act-time">2 days ago</span>
              </div>
              <div class="activity-item">
                <span class="act-icon online"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-dot"></use></svg></span>
                <div class="act-desc">Device 1 went online</div>
                <span class="act-time">3 days ago</span>
              </div>
              <div class="activity-item">
                <span class="act-icon stock"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-book"></use></svg></span>
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

// ==========================================================================
// ROLE DASHBOARDS — CUSTOMER & TECHNICIAN
//
// Admin, technician and customer all land on the shared 'dashboard' tab, but
// they must not see the same page. The admin dashboard is company-wide: it
// shows revenue, the user list, stock levels and every customer's name. None of
// that may be rendered into a customer's or a technician's browser, so each
// role gets its own view assembled only from data the server has already scoped
// to that account (see getVisibleDevices / getVisibleTickets / getVisibleRentals).
// ==========================================================================

/** Ticket status → pill tone. One map, so both dashboards agree. */
const TICKET_TONE = {
  'Received':   'info',
  'Diagnosing': 'purple',
  'Repairing':  'warn',
  'Resolved':   'ok',
  'Closed':     'neutral',
};

/** Rental status → pill tone. */
const RENTAL_TONE = {
  'Pending':   'warn',
  'Approved':  'info',
  'Active':    'ok',
  'Returned':  'neutral',
  'Overdue':   'danger',
  'Cancelled': 'neutral',
};

/** Ticket priority → pill tone. */
const PRIORITY_TONE = {
  'Critical': 'danger',
  'High':     'warn',
  'Medium':   'info',
  'Low':      'neutral',
};

/** Render a small tone-coloured pill. `label` is escaped — never pass markup. */
function tonePill(label, tone) {
  return `<span class="rec-pill tone-${tone || 'neutral'}">${escapeHtml(String(label == null ? '' : label))}</span>`;
}

/** Relative time that degrades to an em dash instead of "NaNd ago". */
function relTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return timeAgo(d);
}

/** A reusable KPI tile — the same shell the admin dashboard uses. */
function kpiCard(accent, icon, label, value, detail) {
  return `
    <div class="kpi-card-v2 kpi-${accent}">
      <div class="kpi-v2-header">
        <div class="kpi-v2-icon">${icon}</div>
        <div>
          <div class="kpi-v2-label">${label}</div>
          <div class="kpi-v2-value">${value}</div>
        </div>
      </div>
      <div class="kpi-v2-detail">
        <span class="kpi-v2-detail-dot"></span>
        <span>${detail}</span>
      </div>
    </div>
  `;
}

/**
 * One row in a dashboard record list.
 * `title` and `meta` are inserted as-is so callers can compose markup; every
 * caller passes user-controlled values through escapeHtml().
 */
function recordRow({ icon, title, meta, right, tone, onclick }) {
  const clickable = onclick
    ? ` onclick="${onclick}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}" role="button" tabindex="0"`
    : '';
  return `
    <div class="rec-row"${clickable}>
      <div class="rec-row-icon">${icon}</div>
      <div class="rec-row-body">
        <div class="rec-row-title">${title}</div>
        <div class="rec-row-meta">${meta}</div>
      </div>
      <div class="rec-row-side">
        ${tone ? tonePill(right, tone) : `<span class="rec-row-value">${right}</span>`}
      </div>
    </div>
  `;
}

/** Consistent empty state for the record lists. */
function recordEmpty(icon, title, hint) {
  return `
    <div class="rec-empty">
      <div class="rec-empty-icon">${icon}</div>
      <div class="rec-empty-title">${title}</div>
      <div class="rec-empty-hint">${hint}</div>
    </div>
  `;
}

/** A titled record section with an optional "view all" action. */
function recordSection(title, subtitle, actionHtml, bodyHtml) {
  return `
    <section class="rec-section">
      <div class="rec-section-head">
        <div>
          <div class="rec-section-title">${title}</div>
          ${subtitle ? `<div class="rec-section-sub">${subtitle}</div>` : ''}
        </div>
        ${actionHtml || ''}
      </div>
      <div class="rec-list">${bodyHtml}</div>
    </section>
  `;
}

// --------------------------------------------------------------------------
// CHARTS (dashboard visualisations)
//
// Pure CSS/SVG — no charting library, matching the donut the admin dashboard
// already ships. Everything is theme-aware: colours come from CSS custom
// properties defined in style.css, never from hard-coded hex, so light and dark
// mode both stay correct (the older admin donut hard-codes #fff and breaks in
// light mode — these deliberately do not repeat that).
// --------------------------------------------------------------------------

/** The 8 category colours, referenced by CSS class so themes can retune them. */
const CHART_PALETTE = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

/** Circumference of the r=15.9155 circle used by the donut, in user units. */
const DONUT_CIRCUMFERENCE = 100;

/**
 * A multi-segment donut.
 *
 * `segments` is `[{ label, value, tone }]`; `tone` is a palette class (`c1`…).
 * Values are normalised, so callers can pass raw counts.
 *
 * Segment geometry: each arc is drawn with an explicit `stroke-dasharray` of
 * `len, 100-len` and `stroke-dashoffset` positioned from the running total, so
 * adjacent segments butt up exactly instead of accumulating rounding gaps.
 * A zero-value slice is skipped — a 0-length dash still paints a dot cap.
 */
function donutChart(segments, centerValue, centerLabel, options) {
  const opts = options || {};
  const all = segments || [];
  // Zero-valued categories stay in the legend (a reader wants to see that
  // "Offline 0" was considered) but draw no arc.
  const items = all.filter(s => Number(s.value) > 0);
  const total = items.reduce((sum, s) => sum + Number(s.value), 0);

  let offset = 0;
  const arcs = items.map(s => {
    const pct = (Number(s.value) / total) * 100;
    const len = (pct / 100) * DONUT_CIRCUMFERENCE;
    // Negative offset walks the stroke clockwise from 12 o'clock.
    const arc = `<circle class="donut-arc" cx="18" cy="18" r="15.9155"
        stroke-dasharray="${len.toFixed(3)} ${(DONUT_CIRCUMFERENCE - len).toFixed(3)}"
        stroke-dashoffset="${(-offset).toFixed(3)}"
        data-tone="${s.tone || 'c1'}"></circle>`;
    offset += len;
    return arc;
  }).join('');

  const legend = all.map(s => {
    const v = Number(s.value) || 0;
    return `
    <div class="donut-legend-item${v === 0 ? ' is-zero' : ''}">
      <span class="donut-swatch" data-tone="${s.tone || 'c1'}"></span>
      <span class="donut-legend-label">${escapeHtml(s.label)}</span>
      <span class="donut-legend-value">${v}</span>
    </div>
  `;
  }).join('');

  // When every value is zero, an empty ring plus a lone "0%" reads as a broken
  // chart rather than an empty one. Draw the ring in the muted track colour and
  // say so explicitly instead.
  const allZero = total === 0;
  const ringClass = allZero ? ' donut-graphic--empty' : '';
  const hint = allZero
    ? `<div class="donut-empty-note">${escapeHtml(opts.emptyNote || 'Nothing to chart yet')}</div>`
    : legend;

  return `
    <div class="donut-chart">
      <div class="donut-graphic${ringClass}">
        <svg viewBox="0 0 36 36" class="donut-svg" role="img"
             aria-label="${escapeHtml(centerLabel || 'Chart')}">
          <circle class="donut-track" cx="18" cy="18" r="15.9155"></circle>
          ${arcs}
        </svg>
        <div class="donut-center">
          <strong>${escapeHtml(String(centerValue))}</strong>
          <small>${escapeHtml(centerLabel || '')}</small>
        </div>
      </div>
      <div class="donut-legend">${allZero ? hint : legend}</div>
    </div>
  `;
}

/**
 * A horizontal bar breakdown — better than a donut when the categories are
 * ordered/sequential or the labels are long.
 *
 * Bars are scaled against the LARGEST value rather than the total, so a single
 * dominant category does not flatten every other bar to an invisible sliver.
 * The trade-off is that two equal values both render full-width, which can read
 * as "both are at maximum". Pass `{ showShare: true }` to append each row's
 * share of the total, so equal-length bars are still interpretable.
 *
 * Zero-valued rows are dropped by default: a bar chart with several permanent
 * empty tracks wastes vertical space and makes a sparse dataset look broken.
 * Pass `{ keepEmpty: true }` to render every category regardless.
 */
function barChart(rows, options) {
  const opts = options || {};
  const all = (rows || []).filter(r => r && r.value !== undefined);
  const items = opts.keepEmpty ? all : all.filter(r => (Number(r.value) || 0) > 0);
  const max = Math.max(1, ...items.map(r => Number(r.value) || 0));
  const total = items.reduce((sum, r) => sum + (Number(r.value) || 0), 0);

  const bars = items.map(r => {
    const v = Number(r.value) || 0;
    const pct = (v / max) * 100;
    let label = r.display != null ? String(r.display) : String(v);
    if (opts.showShare && total > 0) {
      label += ` · ${Math.round((v / total) * 100)}%`;
    }
    return `
      <div class="bar-row">
        <div class="bar-row-head">
          <span class="bar-row-label">${escapeHtml(r.label)}</span>
          <span class="bar-row-value">${escapeHtml(label)}</span>
        </div>
        <div class="bar-track">
          <span class="bar-fill" data-tone="${r.tone || 'c1'}" style="width:${pct.toFixed(2)}%"></span>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="bar-chart">${items.length === 0 ? '<div class="donut-empty-note">No data yet</div>' : bars}</div>`;
}

/**
 * A stacked proportion strip — use when you want the mix in one compact line
 * (e.g. fleet health at a glance). Renders flex-basis percentages.
 */
function proportionStrip(segments) {
  const items = (segments || []).filter(s => Number(s.value) > 0);
  const total = items.reduce((sum, s) => sum + Number(s.value), 0);
  if (items.length === 0) return '<div class="donut-empty-note">No data yet</div>';

  const parts = items.map(s => {
    const pct = (Number(s.value) / total) * 100;
    return `<span class="prop-seg" data-tone="${s.tone || 'c1'}" style="flex:${pct.toFixed(3)}" title="${escapeHtml(s.label)}: ${Number(s.value)}"></span>`;
  }).join('');

  const key = items.map(s => `
    <span class="prop-key">
      <span class="donut-swatch" data-tone="${s.tone || 'c1'}"></span>
      ${escapeHtml(s.label)} <strong>${Number(s.value)}</strong>
    </span>
  `).join('');

  return `<div class="prop-strip">${parts}</div><div class="prop-key-row">${key}</div>`;
}

/**
 * A titled chart panel, so charts sit in the same card language as the record
 * sections. `actionHtml` mirrors recordSection()'s optional view-all button.
 */
function chartPanel(title, subtitle, bodyHtml, actionHtml) {
  return `
    <section class="chart-card">
      <div class="chart-card-head">
        <div>
          <div class="chart-card-title">${title}</div>
          ${subtitle ? `<div class="chart-card-sub">${subtitle}</div>` : ''}
        </div>
        ${actionHtml || ''}
      </div>
      <div class="chart-card-body">${bodyHtml}</div>
    </section>
  `;
}

// --------------------------------------------------------------------------
// CUSTOMER DASHBOARD
// --------------------------------------------------------------------------
function renderCustomerDashboardView() {
  const user = state.currentUser || {};

  const myDevices  = getVisibleDevices();
  const myTickets  = getVisibleTickets();
  const myBookings = getVisibleRentals();

  // Warranties are keyed by device, so scope them through the visible fleet.
  const deviceIds = new Set(myDevices.map(d => String(d.id || '').toLowerCase()));
  const myWarranties = (state.warranties || []).filter(w =>
    deviceIds.has(String(w.deviceId || '').toLowerCase())
  );

  const onlineCount     = myDevices.filter(d => getDeviceDisplayStatus(d) === 'online').length;
  const attentionCount  = myDevices.length - onlineCount;
  const openTickets     = myTickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed');
  const resolvedCount   = myTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
  const activeBookings  = myBookings.filter(r => ['Pending', 'Approved', 'Active'].includes(r.status));
  const overdueBookings = myBookings.filter(r => r.status === 'Overdue');
  const activeWarranties = myWarranties.filter(w => w.status === 'Under Warranty');
  const expiringSoon    = activeWarranties.filter(w => Number(w.daysRemaining) <= 90);

  const fleetPct = myDevices.length > 0 ? Math.round((onlineCount / myDevices.length) * 100) : 0;
  const firstDevId = myDevices.length > 0 ? myDevices[0].id : '';

  const recentTickets = [...myTickets]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
  const recentBookings = [...myBookings]
    .sort((a, b) => new Date(b.createdAt || b.startDate) - new Date(a.createdAt || a.startDate))
    .slice(0, 5);
  const fleetPreview = [...myDevices]
    .sort((a, b) => (getDeviceDisplayStatus(a) === 'online' ? 1 : 0) - (getDeviceDisplayStatus(b) === 'online' ? 1 : 0))
    .slice(0, 6);

  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const currentDayTime = now.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' +
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const orgName = user.organization || user.fullName || user.username || 'Customer';

  const deviceStatusTone = (s) =>
    s === 'online' ? 'ok' : s === 'offline' ? 'danger' : 'warn';
  const deviceStatusLabel = (s) => {
    if (s === 'online') return 'Online';
    if (s === 'offline') return 'Offline';
    if (s === 'maintenance') return 'In Service';
    return 'Warning';
  };

  return `
    <div class="dash-v2-container" data-dash="customer">
      <!-- Hero + Quick Actions -->
      <div class="dash-top-grid">
        <div class="hero-banner-card">
          <div class="hero-text-content">
            <h1 class="hero-greeting">Welcome back,<br>${escapeHtml(user.fullName || user.username || 'Customer')}!</h1>
            <p class="hero-subtext">Your devices, service tickets, bookings and warranty coverage — all in one place.</p>
            <div class="hero-date-chip">
              <span class="calendar-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-calendar"></use></svg></span>
              <div>
                <strong>${currentDate}</strong>
                <small>${currentDayTime}</small>
              </div>
            </div>
          </div>
          <div class="hero-stat-cluster">
            <div class="hero-stat-box">
              <div class="hero-stat-value">${myDevices.length}</div>
              <div class="hero-stat-label">My Devices</div>
            </div>
            <div class="hero-stat-box">
              <div class="hero-stat-value">${openTickets.length}</div>
              <div class="hero-stat-label">Open Tickets</div>
            </div>
            <div class="hero-stat-box">
              <div class="hero-stat-value">${fleetPct}%</div>
              <div class="hero-stat-label">Online</div>
            </div>
          </div>
        </div>

        <div class="quick-actions-card">
          <div class="quick-actions-title">Quick Actions</div>
          <div class="quick-actions-grid">
            <button class="qa-btn qa-btn-blue" onclick="openCreateTicketModal('${firstDevId}')">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-siren"></use></svg></span>
              <span>Report a Problem</span>
            </button>
            <button class="qa-btn qa-btn-purple" onclick="openRentalModal()">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-calendar"></use></svg></span>
              <span>Book a Device</span>
            </button>
            <button class="qa-btn qa-btn-teal" onclick="navigateTo('devices')">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></span>
              <span>My Devices</span>
            </button>
            <button class="qa-btn qa-btn-navy" onclick="fetchAllData()">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-refresh"></use></svg></span>
              <span>Refresh Records</span>
            </button>
          </div>
        </div>
      </div>

      <!-- KPI row -->
      <div class="stat-cards-grid-v2">
        ${kpiCard('blue', ico('monitor'), 'My Devices', myDevices.length,
          attentionCount > 0 ? `${onlineCount} online · ${attentionCount} need attention` : 'All devices online')}
        ${kpiCard('purple', ico('ticket'), 'Open Tickets', openTickets.length,
          resolvedCount > 0 ? `${resolvedCount} resolved all-time` : 'No closed tickets yet')}
        ${kpiCard('green', ico('calendar'), 'Active Bookings', activeBookings.length,
          overdueBookings.length > 0 ? `${overdueBookings.length} overdue — action needed` : `${myBookings.length} booking${myBookings.length === 1 ? '' : 's'} on record`)}
        ${kpiCard('amber', ico('shield'), 'Warranty Coverage', activeWarranties.length,
          expiringSoon.length > 0 ? `${expiringSoon.length} expiring within 90 days` : 'All contracts in good standing')}
      </div>

      <!-- Charts: fleet health + ticket mix + warranty runway -->
      <div class="chart-row-2">
        ${chartPanel('Device Health', `${myDevices.length} registered device${myDevices.length === 1 ? '' : 's'}`,
          donutChart([
            { label: 'Online',       value: onlineCount,                                                          tone: 'c3' },
            { label: 'In Service',   value: myDevices.filter(d => getDeviceDisplayStatus(d) === 'maintenance').length, tone: 'c1' },
            { label: 'Warning',      value: myDevices.filter(d => getDeviceDisplayStatus(d) === 'warning').length,     tone: 'c4' },
            { label: 'Offline',      value: myDevices.filter(d => getDeviceDisplayStatus(d) === 'offline').length,       tone: 'c5' },
          ], `${fleetPct}%`, 'Online'),
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('devices')">View All →</button>`)}

        ${chartPanel('Ticket Status', 'Every service ticket on this account',
          barChart([
            { label: 'Open',       value: myTickets.filter(t => t.status === 'Open').length,        tone: 'c1' },
            { label: 'Diagnosing', value: myTickets.filter(t => t.status === 'Diagnosing').length,  tone: 'c6' },
            { label: 'Repairing',  value: myTickets.filter(t => t.status === 'Repairing').length,   tone: 'c4' },
            { label: 'Received',   value: myTickets.filter(t => t.status === 'Received').length,    tone: 'c7' },
            { label: 'Resolved',   value: resolvedCount,                                            tone: 'c3' },
          ]),
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('tickets')">View All →</button>`)}
      </div>

      <!-- Warranty runway: how much cover is left across the fleet -->
      ${myWarranties.length > 0 ? chartPanel('Warranty Runway', 'Remaining cover per registered device',
        proportionStrip([
          { label: 'Protected (>90d)', value: activeWarranties.length - expiringSoon.length, tone: 'c3' },
          { label: 'Expiring soon',    value: expiringSoon.length,                          tone: 'c4' },
          { label: 'Expired / Other',  value: myWarranties.length - activeWarranties.length, tone: 'c8' },
        ]),
        `<button class="btn btn-secondary btn-sm" onclick="navigateTo('warranties')">View All →</button>`
      ) : ''}

      <!-- Records: tickets + orders/bookings -->
      <div class="dash-2col">
        ${recordSection(
          'My Service Tickets',
          `${openTickets.length} open · ${resolvedCount} closed`,
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('tickets')">View All →</button>`,
          recentTickets.length === 0
            ? recordEmpty(ico('ticket'), 'No service tickets yet',
                'If a SmartBoard misbehaves, use <strong>Report a Problem</strong> and our team will be dispatched.')
            : recentTickets.map(t => recordRow({
                icon: '',
                title: escapeHtml(t.ticketNumber || t.id) + ' · ' + escapeHtml(t.title || 'Service request'),
                meta: `${escapeHtml(t.deviceId || '—')} · ${escapeHtml(t.category || 'General')} · ${escapeHtml(t.priority || 'Medium')} priority · ${relTime(t.createdAt)}`,
                right: t.status || 'Received',
                tone: TICKET_TONE[t.status] || 'neutral',
                onclick: `openTicketDetailModal('${t.id}')`,
              })).join('')
        )}

        ${recordSection(
          'Orders & Bookings',
          'Your rental orders and their delivery status',
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('rentals')">View All →</button>`,
          recentBookings.length === 0
            ? recordEmpty(ico('package'), 'No orders yet',
                'Book a Millennium SmartBoard for an event, training or exhibit — use <strong>Book a Device</strong>.')
            : recentBookings.map(r => {
                const days = r.startDate && r.endDate
                  ? Math.ceil((new Date(r.endDate) - new Date(r.startDate)) / 86400000) + 1
                  : 0;
                return recordRow({
                  icon: '',
                  title: escapeHtml(r.rentalNumber || r.id) + ' · ' + escapeHtml(r.deviceModel || 'Millennium SmartBoard'),
                  meta: `${r.startDate || '—'} → ${r.endDate || '—'}${days > 0 ? ` · ${days} day${days > 1 ? 's' : ''}` : ''} · ${escapeHtml(r.purpose || 'Rental')}`,
                  right: r.status || 'Pending',
                  tone: RENTAL_TONE[r.status] || 'neutral',
                  onclick: `viewRentalDetail('${r.id}')`,
                });
              }).join('')
        )}
      </div>

      <!-- My devices -->
      ${recordSection(
        'My Devices',
        `${myDevices.length} registered · ${fleetPct}% online`,
        `<button class="btn btn-secondary btn-sm" onclick="navigateTo('devices')">View All →</button>`,
        fleetPreview.length === 0
          ? recordEmpty(ico('monitor'), 'No devices linked yet',
              'Your purchased SmartBoards appear here once our team binds your serial numbers to this account.')
          : fleetPreview.map(d => `
              <div class="rec-device">
                <div class="rec-device-head">
                  <span class="rec-device-id">${escapeHtml(d.id)}</span>
                  ${tonePill(deviceStatusLabel(getDeviceDisplayStatus(d)), deviceStatusTone(getDeviceDisplayStatus(d)))}
                </div>
                <div class="rec-device-model">${escapeHtml(d.model || 'Millennium SmartBoard')}</div>
                <div class="rec-device-meta">${escapeHtml(d.location || '—')}${d.city ? ', ' + escapeHtml(d.city) : ''}</div>
                <div class="rec-device-specs">
                  <span><strong>Serial</strong> ${escapeHtml(d.serialNumber || '—')}</span>
                  <span><strong>OS</strong> ${escapeHtml(d.osVersion || '—')}</span>
                  <span><strong>Installed</strong> ${escapeHtml(d.installedAt || '—')}</span>
                </div>
                <div class="rec-device-actions">
                  <button class="btn btn-secondary btn-sm" onclick="openQRModal('${d.id}')">Digital ID</button>
                  <button class="btn btn-primary btn-sm" onclick="openCreateTicketModal('${d.id}')">Request Service</button>
                </div>
              </div>
            `).join('')
      )}

      <!-- Warranty + support -->
      <div class="dash-2col">
        ${recordSection(
          'Warranty Coverage',
          'Coverage bound to your registered devices',
          '',
          myWarranties.length === 0
            ? recordEmpty(ico('shield'), 'No warranty records',
                'Warranty terms appear here once a device is registered against your organization.')
            : myWarranties.map(w => {
                const days = Number(w.daysRemaining);
                const tone = w.status !== 'Under Warranty' ? 'neutral'
                  : (Number.isFinite(days) && days <= 90 ? 'warn' : 'ok');
                return recordRow({
                  icon: '',
                  title: escapeHtml(w.deviceModel || 'Millennium SmartBoard'),
                  meta: `${escapeHtml(w.deviceId || '—')} · ${escapeHtml(w.coverageType || 'Standard coverage')} · expires ${escapeHtml(w.expiryDate || '—')}`,
                  right: w.status || 'Under Warranty',
                  tone,
                });
              }).join('')
        )}

        <section class="rec-section">
          <div class="rec-section-head">
            <div>
              <div class="rec-section-title">Need Help?</div>
              <div class="rec-section-sub">Account and support details for ${escapeHtml(orgName)}</div>
            </div>
          </div>
          <div class="rec-list">
            <div class="rec-support">
              <div class="rec-support-row"><span>Account</span><strong>${escapeHtml(user.username || '—')}</strong></div>
              <div class="rec-support-row"><span>Organization</span><strong>${escapeHtml(user.organization || '—')}</strong></div>
              <div class="rec-support-row"><span>Email</span><strong>${escapeHtml(user.email || '—')}</strong></div>
              <div class="rec-support-row"><span>Location</span><strong>${escapeHtml(user.location || '—')}</strong></div>
            </div>
            <div class="rec-support-lines">
              <div><strong>Hotline 1:</strong> <a href="tel:+639755826830">+63 975 582 6830</a></div>
              <div><strong>Hotline 2:</strong> <a href="tel:+639815409835">+63 981 540 9835</a></div>
              <div><strong>Email:</strong> <a href="mailto:info@brains.asia">info@brains.asia</a></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// TECHNICIAN DASHBOARD
// --------------------------------------------------------------------------
function renderTechnicianDashboardView() {
  const user = state.currentUser || {};

  // state.tickets is already scoped to this technician by the server; the
  // helper re-applies the same rule so a role change can never widen it.
  const myTickets = getVisibleTickets();
  const allDevices = getVisibleDevices();

  const openTickets   = myTickets.filter(t => t.status !== 'Resolved' && t.status !== 'Closed');
  const inProgress    = myTickets.filter(t => ['Diagnosing', 'Repairing'].includes(t.status));
  const received      = myTickets.filter(t => t.status === 'Received');
  const resolved      = myTickets.filter(t => t.status === 'Resolved' || t.status === 'Closed');
  const critical      = myTickets.filter(t => t.priority === 'Critical' && t.status !== 'Resolved' && t.status !== 'Closed');
  const high          = myTickets.filter(t => t.priority === 'High' && t.status !== 'Resolved' && t.status !== 'Closed');

  // The devices this technician is actually working on.
  const servicedIds = new Set(myTickets.map(t => String(t.deviceId || '').toLowerCase()));
  const servicedDevices = allDevices.filter(d => servicedIds.has(String(d.id || '').toLowerCase()));

  // Parts consumed across this technician's tickets.
  const partsMap = new Map();
  myTickets.forEach(t => {
    (t.partsUsed || []).forEach(p => {
      const key = p.partId || p.partName;
      if (!key) return;
      const cur = partsMap.get(key) || { name: p.partName || key, qty: 0 };
      cur.qty += Number(p.quantity) || 0;
      partsMap.set(key, cur);
    });
  });
  const partsUsed = [...partsMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);

  const lowStock = (state.inventory || [])
    .filter(p => p.status !== 'In Stock')
    .sort((a, b) => (Number(a.stockQuantity) || 0) - (Number(b.stockQuantity) || 0))
    .slice(0, 6);

  const resolveRate = myTickets.length > 0
    ? Math.round((resolved.length / myTickets.length) * 100)
    : 0;

  // Work queue: open work first, then the most urgent, then the oldest.
  const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const queue = [...openTickets].sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    return new Date(a.createdAt) - new Date(b.createdAt);
  }).slice(0, 6);

  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const currentDayTime = now.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' +
    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return `
    <div class="dash-v2-container" data-dash="technician">
      <!-- Hero + Quick Actions -->
      <div class="dash-top-grid">
        <div class="hero-banner-card">
          <div class="hero-text-content">
            <h1 class="hero-greeting">Welcome back,<br>${escapeHtml(user.fullName || user.username || 'Technician')}!</h1>
            <p class="hero-subtext">Your assigned jobs, the devices you service, and the parts you have consumed.</p>
            <div class="hero-date-chip">
              <span class="calendar-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-calendar"></use></svg></span>
              <div>
                <strong>${currentDate}</strong>
                <small>${currentDayTime}</small>
              </div>
            </div>
          </div>
          <div class="hero-stat-cluster">
            <div class="hero-stat-box">
              <div class="hero-stat-value">${openTickets.length}</div>
              <div class="hero-stat-label">Open Jobs</div>
            </div>
            <div class="hero-stat-box">
              <div class="hero-stat-value">${critical.length}</div>
              <div class="hero-stat-label">Critical</div>
            </div>
            <div class="hero-stat-box">
              <div class="hero-stat-value">${resolveRate}%</div>
              <div class="hero-stat-label">Resolve Rate</div>
            </div>
          </div>
        </div>

        <div class="quick-actions-card">
          <div class="quick-actions-title">Quick Actions</div>
          <div class="quick-actions-grid">
            <button class="qa-btn qa-btn-blue" onclick="navigateTo('tickets')">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-ticket"></use></svg></span>
              <span>My Job Queue</span>
            </button>
            <button class="qa-btn qa-btn-teal" onclick="navigateTo('devices')">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></span>
              <span>Devices</span>
            </button>
            <button class="qa-btn qa-btn-purple" onclick="navigateTo('inventory')">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-package"></use></svg></span>
              <span>Parts & Stock</span>
            </button>
            <button class="qa-btn qa-btn-navy" onclick="fetchAllData()">
              <span class="qa-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-refresh"></use></svg></span>
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>
      </div>

      <!-- KPI row -->
      <div class="stat-cards-grid-v2">
        ${kpiCard('blue', ico('ticket'), 'Assigned Tickets', myTickets.length,
          `${openTickets.length} still open`)}
        ${kpiCard('amber', ico('wrench'), 'In Progress', inProgress.length,
          `${received.length} awaiting first response`)}
        ${kpiCard('green', ico('check-circle'), 'Resolved', resolved.length,
          `${resolveRate}% of everything assigned to you`)}
        ${kpiCard('purple', ico('monitor'), 'Devices Serviced', servicedDevices.length,
          servicedDevices.length === 1 ? '1 device in your ticket history' : `${servicedDevices.length} devices in your ticket history`)}
      </div>

      <!-- Charts: job mix + parts consumed -->
      <div class="chart-row-2">
        ${chartPanel('Job Status Mix', `${myTickets.length} ticket${myTickets.length === 1 ? '' : 's'} assigned to you`,
          donutChart([
            { label: 'Awaiting first response', value: received.length,           tone: 'c7' },
            { label: 'Diagnosing',              value: myTickets.filter(t => t.status === 'Diagnosing').length, tone: 'c6' },
            { label: 'Repairing',               value: myTickets.filter(t => t.status === 'Repairing').length,  tone: 'c4' },
            { label: 'Resolved',                value: resolved.length,           tone: 'c3' },
          ], `${resolveRate}%`, 'Resolved'),
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('tickets')">Open Queue →</button>`)}

        ${chartPanel('Parts Consumed', 'Units logged against your tickets',
          barChart(partsUsed.length === 0
            ? []
            : partsUsed.map((p, i) => ({ label: p.name, value: p.qty, tone: CHART_PALETTE[i % CHART_PALETTE.length] }))),
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('inventory')">Inventory →</button>`)}
      </div>

      <!-- Workload by priority: shows where the pressure actually is -->
      ${myTickets.length > 0 ? chartPanel('Open Workload by Priority', 'Open jobs only — resolved work is excluded',
        proportionStrip([
          { label: 'Critical', value: critical.length,                                             tone: 'c5' },
          { label: 'High',     value: high.length,                                                 tone: 'c4' },
          { label: 'Medium',   value: myTickets.filter(t => t.priority === 'Medium' && openTickets.includes(t)).length, tone: 'c1' },
          { label: 'Low',      value: myTickets.filter(t => t.priority === 'Low' && openTickets.includes(t)).length,    tone: 'c8' },
        ])
      ) : ''}

      ${(critical.length > 0 || high.length > 0) ? `
        <div class="tech-alert-bar">
          <span class="tech-alert-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-alert"></use></svg></span>
          <div>
            <strong>Priority work waiting</strong>
            <span>${[
              critical.length > 0 ? `${critical.length} critical` : '',
              high.length > 0 ? `${high.length} high-priority` : '',
            ].filter(Boolean).join(' and ')} job${(critical.length + high.length) === 1 ? '' : 's'} need attention.</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('tickets')">Open Queue →</button>
        </div>
      ` : ''}

      <!-- Work queue + parts -->
      <div class="dash-2col">
        ${recordSection(
          `${ico('toolbox')} My Work Queue`,
          'Open jobs, most urgent first',
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('tickets')">View All →</button>`,
          queue.length === 0
            ? recordEmpty(ico('check-circle'), 'Queue is clear',
                'You have no open jobs assigned right now. New assignments appear here automatically.')
            : queue.map(t => recordRow({
                icon: t.priority === 'Critical' ? '' : t.priority === 'High' ? '' : '',
                title: escapeHtml(t.ticketNumber || t.id) + ' · ' + escapeHtml(t.title || 'Service request'),
                meta: `${escapeHtml(t.customerName || '—')} · ${escapeHtml(t.deviceId || '—')} · ${escapeHtml(t.category || 'General')} · ${relTime(t.createdAt)}`,
                right: t.status || 'Received',
                tone: TICKET_TONE[t.status] || 'neutral',
                onclick: `openTicketDetailModal('${t.id}')`,
              })).join('')
        )}

        ${recordSection(
          'Parts I Have Used',
          `${partsUsed.reduce((s, p) => s + p.qty, 0)} units across your tickets`,
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('inventory')">Inventory →</button>`,
          partsUsed.length === 0
            ? recordEmpty(ico('package'), 'No parts logged',
                'Parts you attach to a ticket are tallied here so stock stays accurate.')
            : partsUsed.map(p => recordRow({
                icon: '',
                title: escapeHtml(p.name),
                meta: 'Consumed on your service tickets',
                right: `${p.qty} ×`,
              })).join('')
        )}
      </div>

      <!-- Serviced devices + low stock -->
      <div class="dash-2col">
        ${recordSection(
          'Devices I Service',
          'Devices appearing in your ticket history',
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('devices')">View All →</button>`,
          servicedDevices.length === 0
            ? recordEmpty(ico('monitor'), 'No devices yet',
                'Once a ticket is assigned to you, the device it concerns is listed here.')
            : servicedDevices.slice(0, 6).map(d => recordRow({
                icon: '',
                title: escapeHtml(d.model || 'Millennium SmartBoard') + ' · ' + escapeHtml(d.id),
                meta: `${escapeHtml(d.location || '—')} · ${escapeHtml(d.customerName || '—')} · ${escapeHtml(d.serialNumber || '—')}`,
                right: getDeviceDisplayStatus(d) === 'online' ? 'Online' : getDeviceDisplayStatus(d) === 'offline' ? 'Offline' : 'Attention',
                tone: getDeviceDisplayStatus(d) === 'online' ? 'ok' : getDeviceDisplayStatus(d) === 'offline' ? 'danger' : 'warn',
              })).join('')
        )}

        ${recordSection(
          'Low Stock Parts',
          'Order these before the next job',
          `<button class="btn btn-secondary btn-sm" onclick="navigateTo('inventory')">Restock →</button>`,
          lowStock.length === 0
            ? recordEmpty(ico('check-circle'), 'Stock levels healthy',
                'Every part is above its minimum threshold.')
            : lowStock.map(p => recordRow({
                icon: '',
                title: escapeHtml(p.name || p.partCode || 'Part'),
                meta: `${escapeHtml(p.partCode || '—')} · min ${Number(p.minThreshold) || 0} · ${escapeHtml(p.category || 'General')}`,
                right: `${Number(p.stockQuantity) || 0} left`,
                tone: p.status === 'Out of Stock' ? 'danger' : 'warn',
              })).join('')
        )}
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
    const wanted = state.filterStatus.toLowerCase();
    filtered = filtered.filter((d) => getDeviceDisplayStatus(d).toLowerCase() === wanted);
  }

  const isAdmin = state.currentRole === 'admin';
  const isTech  = state.currentRole === 'technician';

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">SmartBoards</h1>
        <p class="page-description">All ${state.devices.length} SmartBoards we look after, and how each one is doing right now.</p>
      </div>
      <div class="page-actions">
        ${isAdmin ? `<button class="btn btn-primary" onclick="openRegisterModal()">Register a SmartBoard</button>` : ''}
        ${isTech  ? `<span style="font-size:0.82rem;color:var(--text-muted);">View only. Ask an administrator to register new boards.</span>` : ''}
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="glass-panel" style="padding: 16px 20px;">
      <div class="filter-bar" style="margin-bottom: 0;">
        <div class="search-input-box">
          <span class="search-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-search"></use></svg></span>
          <input type="text" class="search-input" placeholder="Search by device ID, customer, serial number or location..." value="${state.searchQuery}" oninput="handleSearch(this.value)" />
        </div>
        <select class="filter-select" onchange="handleModelFilter(this.value)">
          <option value="">All screen sizes</option>
          <option value="86" ${state.filterModel === '86' ? 'selected' : ''}>Millennium 86" (Flagship)</option>
          <option value="75" ${state.filterModel === '75' ? 'selected' : ''}>Millennium 75"</option>
          <option value="65" ${state.filterModel === '65' ? 'selected' : ''}>Millennium 65"</option>
        </select>
        <select class="filter-select" onchange="handleStatusFilter(this.value)">
          <option value="">Any status</option>
          <option value="online" ${state.filterStatus === 'online' ? 'selected' : ''}>Online</option>
          <option value="offline" ${state.filterStatus === 'offline' ? 'selected' : ''}>Offline</option>
          <option value="warning" ${state.filterStatus === 'warning' ? 'selected' : ''}>Needs attention</option>
          <option value="maintenance" ${state.filterStatus === 'maintenance' ? 'selected' : ''}>Being repaired</option>
        </select>
        ${state.searchQuery || state.filterModel || state.filterStatus ? `<button class="btn btn-secondary btn-sm" onclick="clearFilters()">Clear filters</button>` : ''}
      </div>
    </div>

    <!-- Device Fleet Table -->
    <div class="glass-panel" style="padding: 0; overflow: hidden;">
      <div class="data-table-wrapper">
        <table class="data-table devices-table">
          <thead>
            <tr>
              <th>Device ID</th>
              <th>Model</th>
              <th>Customer &amp; site</th>
              <th>Status</th>
              <th>System &amp; hardware</th>
              <th>Owner</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">No SmartBoards match your search. Try clearing the filters.</td></tr>` : ''}
            ${filtered
              .map((dev) => {
                const displayStatus = getDeviceDisplayStatus(dev);
                const statusClass =
                  displayStatus === 'online'
                    ? 'status-online'
                    : displayStatus === 'offline'
                    ? 'status-offline'
                    : displayStatus === 'warning'
                    ? 'status-warning'
                    : 'status-maintenance';
                const ownerName = getDeviceOwnerName(dev);
                const owners = getDeviceOwners(dev);
                const onlineOwners = owners.filter((u) => u.online === true);
                const ownerHint = onlineOwners.length > 0
                  ? `${ownerName} (${onlineOwners.length} online now)`
                  : `${ownerName}`;

                return `
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <button class="action-btn" title="View & Print QR Code" aria-label="View and print QR code for ${dev.id}" onclick="openQRModal('${dev.id}')" style="color: var(--neon-cyan); border-color: rgba(0, 242, 254, 0.3);">
                        ${ico('qr')}
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
                      ${displayStatus === 'online' ? 'Online' : displayStatus === 'offline' ? 'Offline' : displayStatus === 'warning' ? 'Problem' : 'Service'}
                    </span>
                    ${dev.screenLocked ? `<div style="font-size: 0.72rem; color: #fb7185; margin-top: 4px;">Screen Locked</div>` : ''}
                  </td>
                  <td>
                    <div style="font-size: 0.8rem; font-weight: 600;">${dev.osVersion}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${dev.opsSpec}</div>
                  </td>
                  <td title="${escapeHtml(ownerHint)}">
                    <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(ownerName)}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${onlineOwners.length > 0 ? 'Owner online' : 'Owner offline'}</div>
                  </td>
                  <td class="col-actions">
                    ${isAdmin
                      ? `<button class="action-btn action-btn-danger" title="Remove this device"
                           aria-label="Remove ${dev.id}"
                           onclick="event.stopPropagation();deleteDevice('${dev.id}')"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg></button>`
                      : `<span class="action-none" title="Only an administrator can remove a device">—</span>`}
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

// Shared empty-lane placeholder. A bare <p> left an empty stage looking like a
// large blank box, which read as a rendering failure rather than "nothing here".
function renderKanbanEmpty(icon, title, hint) {
  return `
    <div class="kanban-empty">
      <span class="kanban-empty-ico">${icon}</span>
      <strong>${title}</strong>
      <span>${hint}</span>
    </div>
  `;
}

// Customer-facing ticket card.
// Shares the card classes with the admin board so the two cannot drift apart,
// and carries the same priority/status edge bar for at-a-glance scanning.
function renderTicketCardCustomer(t) {
  const isClosed = t.status === 'Resolved' || t.status === 'Closed';
  const statusIcon =
    isClosed ? ''
    : t.status === 'Repairing' ? ''
    : t.status === 'Diagnosing' ? ''
    : '';
  const submitted = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return `
    <article class="ticket-card ticket-card-customer ${isClosed ? 'is-closed' : 'is-open'}"
      tabindex="0"
      onclick="openTicketDetailModal('${t.id}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTicketDetailModal('${t.id}')}">
      <div class="ticket-top">
        <span class="ticket-id">${t.ticketNumber}</span>
        <span class="ticket-status ${isClosed ? 'is-closed' : 'is-open'}">${statusIcon} ${t.status}</span>
      </div>
      <h4 class="ticket-title">${escapeHtml(t.title)}</h4>
      <div class="ticket-facts">
        <span class="ticket-fact ticket-fact-wide" title="${escapeHtml(t.deviceId)} — ${escapeHtml(t.deviceModel || '')}">
          <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></span><b>${escapeHtml(t.deviceId)}</b><span class="ticket-fact-soft">${escapeHtml(t.deviceModel || '')}</span>
        </span>
        <span class="ticket-fact" title="Category">
          <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-tag"></use></svg></span><span>${escapeHtml(t.category || '—')}</span>
        </span>
        <span class="ticket-fact" title="Warranty coverage">
          <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-shield"></use></svg></span>
          <span class="${t.warrantyCovered ? 'warranty-badge-active' : 'warranty-badge-expired'}">${t.warrantyCovered ? 'Covered' : 'Not covered'}</span>
        </span>
        <span class="ticket-fact" title="Assigned technician">
          <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-user"></use></svg></span><span>${escapeHtml(t.assignedTechnician || 'Pending assignment')}</span>
        </span>
      </div>
      <div class="ticket-foot">
        <span class="ticket-date" title="Submitted ${new Date(t.createdAt).toLocaleDateString()}">${submitted}</span>
        <span class="ticket-actions">
          <button type="button" class="ticket-btn ticket-btn-chat"
            onclick="event.stopPropagation();openTicketDetailModal('${t.id}')">Chat with Admin</button>
        </span>
      </div>
    </article>
  `;
}

// Human-readable names for the ticket pipeline stages.
// The DB keeps the original Received/Diagnosing/Repairing/Resolved values, but
// the UI now speaks the language the team actually uses when triaging: a ticket
// is new, then it needs a diagnosis, then it is being repaired, then resolved.
function ticketStatusLabel(status) {
  switch (status) {
    case 'Received':   return 'New Ticket';
    case 'Diagnosing': return 'Needs Diagnosis';
    case 'Repairing':  return 'Repairing';
    case 'Resolved':   return 'Resolved';
    case 'Closed':     return 'Closed';
    default:           return status || '—';
  }
}

// 3. Maintenance & Service Ticket View
function renderTicketsView() {
  const role = state.currentRole;
  const isCustomer = role === 'customer';
  const isTech = role === 'technician';
  const isAdmin = role === 'admin';

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

  // Admin / technician card. Priority drives a coloured edge bar (--ticket-accent)
  // so a lane can be scanned without reading every chip.
  function renderTicketCard(t) {
    const priClass = `pri-${String(t.priority || 'medium').toLowerCase()}`;
    const logged = new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return `
      <article class="ticket-card ${priClass}"
        tabindex="0"
        onclick="openTicketDetailModal('${t.id}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTicketDetailModal('${t.id}')}">
        <div class="ticket-top">
          <span class="ticket-id">${t.ticketNumber}</span>
          <span class="ticket-priority is-${String(t.priority || 'medium').toLowerCase()}">${t.priority}</span>
        </div>
        <h4 class="ticket-title">${escapeHtml(t.title)}</h4>
        <div class="ticket-facts">
          <span class="ticket-fact ticket-fact-wide" title="${escapeHtml(t.deviceId)} — ${escapeHtml(t.deviceModel || '')}">
            <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></span><b>${escapeHtml(t.deviceId)}</b><span class="ticket-fact-soft">${escapeHtml(t.deviceModel || '')}</span>
          </span>
          <span class="ticket-fact" title="Client">
            <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-school"></use></svg></span><span>${escapeHtml(t.customerName || '—')}</span>
          </span>
          <span class="ticket-fact" title="Category">
            <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-tag"></use></svg></span><span>${escapeHtml(t.category || '—')}</span>
          </span>
          <span class="ticket-fact" title="Warranty coverage">
            <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-shield"></use></svg></span>
            <span class="${t.warrantyCovered ? 'warranty-badge-active' : 'warranty-badge-expired'}">${t.warrantyCovered ? 'Covered' : 'Not covered'}</span>
          </span>
          <span class="ticket-fact" title="Assigned technician">
            <span class="ticket-fact-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-user"></use></svg></span><span>${escapeHtml(t.assignedTechnician || 'Unassigned')}</span>
          </span>
        </div>
        ${t.partsUsed && t.partsUsed.length > 0 ? `
          <div class="ticket-parts" title="${escapeHtml(t.partsUsed.map((p) => `${p.quantity}x ${p.partName}`).join(', '))}">
            <span>${t.partsUsed.map((p) => `${p.quantity}× ${escapeHtml(p.partName)}`).join(', ')}</span>
          </div>
        ` : ''}
        <div class="ticket-foot">
          <span class="ticket-date" title="Logged ${new Date(t.createdAt).toLocaleDateString()}">${logged}</span>
          <span class="ticket-actions">
            <button type="button" class="ticket-btn ticket-btn-chat" title="Open ticket chat"
              onclick="event.stopPropagation();openTicketDetailModal('${t.id}')">Chat</button>
            ${isAdmin ? `
              <button type="button" class="ticket-btn ticket-btn-danger" title="Delete ticket"
                onclick="event.stopPropagation();deleteTicket('${t.id}')"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg></button>
            ` : ''}
          </span>
        </div>
      </article>
    `;
  }

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
          <h1 class="page-title">My Service Requests</h1>
          <p class="page-description">Track your submitted Millennium SmartBoard service requests and repair status.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="openCreateTicketModal()">Report a Problem</button>
        </div>
      </div>
      
      <!-- Search Bar for Customer Tickets -->
      <div class="glass-panel" style="padding: 16px 20px; margin-bottom: 20px;">
        <div class="search-input-box">
          <span class="search-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-search"></use></svg></span>
          <input type="text" class="search-input" placeholder="Search your tickets by ID, title, device..." value="${state.searchQuery}" oninput="handleSearch(this.value)" />
        </div>
      </div>
      
      <div class="role-info-banner">
        <strong>Customer View:</strong> You can report issues and track your repair status. For urgent matters, call our support hotline.
      </div>
      <div class="kanban-board">
        <div class="kanban-column stage-open${open.length === 0 ? ' is-empty' : ''}">
          <div class="kanban-header">
            <span class="kanban-header-label">Open Requests</span>
            <span class="kanban-count">${open.length}</span>
          </div>
          ${open.length === 0
            ? renderKanbanEmpty('', 'No open requests', 'Everything you reported has been closed.')
            : open.map(t => renderTicketCardCustomer(t)).join('')}
        </div>
        <div class="kanban-column stage-resolved${closed.length === 0 ? ' is-empty' : ''}">
          <div class="kanban-header">
            <span class="kanban-header-label">Closed Requests</span>
            <span class="kanban-count">${closed.length}</span>
          </div>
          ${closed.length === 0
            ? renderKanbanEmpty('', 'Nothing closed yet', 'Resolved requests will be listed here.')
            : closed.map(t => renderTicketCardCustomer(t)).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">${isTech ? 'My Assigned Tickets' : 'Maintenance & Service Tickets'}</h1>
        <p class="page-description">${isTech ? 'Your active service jobs and repair tasks assigned to you.' : 'Automated lifecycle from issue detection to technician dispatch and inventory parts deduction.'}</p>
      </div>
      <div class="page-actions">
        ${isAdmin ? `<button class="btn btn-primary" onclick="openCreateTicketModal()">Submit Service Ticket</button>` : ''}
        ${isTech  ? `<button class="btn btn-secondary" onclick="fetchAllData()">Refresh My Jobs</button>` : ''}
      </div>
    </div>
    
    <!-- Search Bar for Tickets -->
    <div class="glass-panel" style="padding: 16px 20px; margin-bottom: 20px;">
      <div class="search-input-box">
        <span class="search-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-search"></use></svg></span>
        <input type="text" class="search-input" placeholder="Search tickets by ID, title, device, customer, category..." value="${state.searchQuery}" oninput="handleSearch(this.value)" />
      </div>
    </div>
    
    ${isTech ? `<div class="role-info-banner"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-wrench"></use></svg><strong>Technician View:</strong> Showing only tickets assigned to you. Contact admin to view unassigned tickets.</div>` : ''}
    ${isAdmin ? `<div class="role-info-banner"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-crown"></use></svg><strong>Admin View:</strong> You can see all tickets from all customers and assign them to technicians.</div>` : ''}

    <!-- Kanban Columns -->
    <div class="kanban-board">${received.length === 0 && diagnosing.length === 0 && repairing.length === 0 && resolved.length === 0 && isTech ? `
      <div class="kanban-empty kanban-empty-lg">
        <span class="kanban-empty-ico"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-inbox"></use></svg></span>
        <strong>No tickets assigned yet</strong>
        <span>You don't have any assigned service tickets at the moment. Check back later or contact your admin.</span>
      </div>
    ` : `
      <!-- 1. New Tickets -->
      <div class="kanban-column stage-received${received.length === 0 ? ' is-empty' : ''}">
        <div class="kanban-header">
          <span class="kanban-header-label">New Tickets</span>
          <span class="kanban-count">${received.length}</span>
        </div>
        ${received.length === 0
          ? renderKanbanEmpty('', 'No new tickets', 'Freshly submitted requests land here.')
          : received.map(renderTicketCard).join('')}
      </div>

      <!-- 2. Diagnosing -->
      <div class="kanban-column stage-diagnosing${diagnosing.length === 0 ? ' is-empty' : ''}">
        <div class="kanban-header">
          <span class="kanban-header-label">Diagnosing</span>
          <span class="kanban-count">${diagnosing.length}</span>
        </div>
        ${diagnosing.length === 0
          ? renderKanbanEmpty('', 'Nothing in diagnosis', 'Tickets under investigation appear here.')
          : diagnosing.map(renderTicketCard).join('')}
      </div>

      <!-- 3. Repairing -->
      <div class="kanban-column stage-repairing${repairing.length === 0 ? ' is-empty' : ''}">
        <div class="kanban-header">
          <span class="kanban-header-label">Repairing</span>
          <span class="kanban-count">${repairing.length}</span>
        </div>
        ${repairing.length === 0
          ? renderKanbanEmpty('', 'Nothing in repair', 'Devices currently being worked on appear here.')
          : repairing.map(renderTicketCard).join('')}
      </div>

      <!-- 4. Resolved -->
      <div class="kanban-column stage-resolved${resolved.length === 0 ? ' is-empty' : ''}">
        <div class="kanban-header">
          <span class="kanban-header-label">Resolved</span>
          <span class="kanban-count">${resolved.length}</span>
        </div>
        ${resolved.length === 0
          ? renderKanbanEmpty('', 'Nothing resolved yet', 'Closed tickets are archived here.')
          : resolved.map(renderTicketCard).join('')}
      </div>
    `}
    </div>
  `;
}

// 4. Customer Self-Service Portal View
function renderCustomerPortalView() {
  const user = state.currentUser;

  // Devices belonging to this customer / organization. Shared with the customer
  // dashboard so the portal and the dashboard can never show different fleets.
  const customerDevices = getVisibleDevices();

  const clientName = user ? (user.organization || user.fullName || user.username) : 'Valued Customer';
  const firstDevId = customerDevices.length > 0 ? customerDevices[0].id : '';

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">Customer Portal & My Devices</h1>
        <p class="page-description">Welcome, <strong>${user ? user.fullName : 'Customer'}</strong> (${clientName}). Manage your institutional SmartBoards and service contracts.</p>
      </div>
      <div class="page-actions">
        ${customerDevices.length > 0 ? `<button class="btn btn-primary" onclick="openCreateTicketModal('${firstDevId}')">Report Problem / Request Service</button>` : ''}
        <button class="btn btn-secondary" onclick="openRentalModal()" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;font-weight:700;">Book a Device</button>
        <button class="btn btn-secondary btn-sm" onclick="fetchAllData()">Refresh</button>
      </div>
    </div>

    <!-- Customer Overview Banner -->
    <div class="glass-panel" style="background: linear-gradient(135deg, rgba(0, 242, 254, 0.1) 0%, rgba(17, 24, 39, 0.8) 100%); border-color: rgba(0, 242, 254, 0.3);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div>
          <h2 style="font-size: 1.3rem; font-weight: 800; color: var(--text-primary);">Institutional SmartBoard Ecosystem</h2>
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
        <div style="font-size: 3.5rem; margin-bottom: 12px; filter: drop-shadow(0 0 15px rgba(0,242,254,0.4));"></div>
        <h2 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">No Millennium SmartBoards Assigned Yet</h2>
        <p style="color: var(--text-secondary); max-width: 580px; margin: 0 auto 20px; font-size: 0.95rem; line-height: 1.6;">
          Your customer account is verified and ready. Our administrative team assigns your purchased <strong>Millennium 86", 75", or 65" SmartBoards</strong> once your sales purchase order or serial numbers are verified.
        </p>
        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
          <span class="ft-spec-pill" style="padding: 6px 14px; background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.3);">
            Client Entity: <strong>${user?.organization || 'Institutional Client'}</strong>
          </span>
          <span class="ft-spec-pill" style="padding: 6px 14px; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3);">
            Location: <strong>${user?.location || 'Metro Manila'}</strong>
          </span>
          <span class="ft-spec-pill" style="padding: 6px 14px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
            Account: <strong>${user?.username || 'Customer'}</strong>
          </span>
        </div>
        <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 18px; max-width: 540px; margin: 0 auto 24px; text-align: left; font-size: 0.85rem; border: 1px solid rgba(255,255,255,0.08);">
          <div style="font-weight: 700; color: var(--neon-cyan); margin-bottom: 6px;">Have your purchase invoice or serial number ready?</div>
          <div style="color: var(--text-muted); margin-bottom: 10px;">Please contact Brains Infinite Innovations support to immediately bind your purchased units to this portal:</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div><strong style="color: var(--text-primary);">Hotline 1:</strong> <a href="tel:+639755826830" style="color: var(--neon-cyan); text-decoration: none;">+63 975 582 6830</a></div>
            <div><strong style="color: var(--text-primary);">Hotline 2:</strong> <a href="tel:+639815409835" style="color: var(--neon-cyan); text-decoration: none;">+63 981 540 9835</a></div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">Suite 1004 Atlanta Center, 31 Annapolis St., Greenhills, San Juan City Philippines</div>
          </div>
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="fetchAllData()">Check Again for Linked Devices</button>
          <button class="btn" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;font-weight:700;border:none;" onclick="openRentalModal()">Book a Device for Rent</button>
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
              <span class="status-pill ${getDeviceDisplayStatus(dev) === 'online' ? 'status-online' : 'status-warning'}">
                ${getDeviceDisplayStatus(dev) === 'online' ? 'Online' : '' + (getDeviceDisplayStatus(dev) === 'offline' ? 'Offline' : 'Warning')}
              </span>
            </div>
            <div style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">${dev.model}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${dev.location}</div>
            
            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
              <div><strong>Serial:</strong> <span style="font-family: var(--font-mono); color: var(--neon-cyan);">${dev.serialNumber}</span></div>
              <div><strong>OS:</strong> ${dev.osVersion}</div>
              <div><strong>Warranty:</strong> <span class="warranty-badge-active">Active (2 Years On-Site)</span></div>
              <div><strong>Installed:</strong> ${dev.installedAt}</div>
            </div>

            <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openQRModal('${dev.id}')">Digital ID</button>
              <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="openCreateTicketModal('${dev.id}')">Request Tech</button>
              <button class="btn btn-sm" style="flex: 1 1 100%; background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;font-weight:700;border:none;" onclick="openRentalModal(null,'${dev.id}')">Book This Device</button>
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
        <div class="panel-title">Documentation, Drivers & Whiteboard Software</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="display: block;">Millennium 86"/75" User Manual (PDF)</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Hardware setup, touch calibration & dual-OS guide</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Downloading Millennium User Manual (PDF)...', 'success')">PDF</button>
        </div>

        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="display: block;">Intel OPS Windows 11 Driver Pack</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Full GPU, chipset & optical touch drivers</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Downloading OPS Driver Pack (ZIP)...', 'success')">Drivers</button>
        </div>

        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 16px; border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="display: block;">Millennium Whiteboard Suite v5.1</strong>
            <span style="font-size: 0.78rem; color: var(--text-muted);">Android interactive whiteboard & annotation APK</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="showToast('Downloading Whiteboard Suite v5.1...', 'success')">APK</button>
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
        <div class="panel-title">My Rental Bookings</div>
        <button class="btn btn-primary btn-sm" onclick="openRentalModal()">New Booking</button>
      </div>
      ${myBookings.length === 0 ? `
        <div style="text-align:center;padding:32px 16px;">
          <div style="font-size:2.5rem;margin-bottom:8px;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-calendar"></use></svg></div>
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
                  <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></div>
                  <div>
                    <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">${r.deviceModel || 'Millennium SmartBoard'}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);">${r.ticketNumber || r.rentalNumber || ''} · ${days} day${days > 1 ? 's' : ''} · ${r.startDate} → ${r.endDate}</div>
                    ${r.purpose ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">${r.purpose}</div>` : ''}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <span style="padding:5px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${sc.bg};border:1px solid ${sc.border};color:${sc.text};">${r.status}</span>
                  <button class="btn btn-secondary btn-sm" onclick="viewRentalDetail('${r.id}')">Details</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// Resolves "who has this device" for the Reports table.
// The column used to show a Coverage Tier ("Standard Warranty"), which told an
// admin nothing they could act on. It now names the holder instead: the
// customer record's contact person when one is on file, otherwise the
// organisation. The lookup runs through the device so a contract that predates
// a customer rename still resolves to the current holder.
function resolveDeviceHolder(w) {
  const device   = (state.devices   || []).find(d => d.id === w.deviceId);
  const customer = device && (state.customers || []).find(c => c.id === device.customerId);
  const person   = String((customer && customer.contactPerson) || '').trim();
  const org      = String((customer && customer.organizationName) || w.customerName || '').trim();
  if (person) return { person, org };
  return { person: org || '—', org: '' };
}

// 5. Warranty Management View
function renderWarrantyView() {
  const isCustomer = state.currentRole === 'customer';
  // Scope warranties through the shared visible-fleet helper, so the warranty
  // page, the portal and the customer dashboard can never disagree about which
  // devices — and therefore which contracts — belong to this account.
  const filteredWarranties = isCustomer
    ? (() => {
        const deviceIds = new Set(
          getVisibleDevices().map(d => String(d.id || '').toLowerCase())
        );
        return (state.warranties || []).filter(w =>
          deviceIds.has(String(w.deviceId || '').toLowerCase())
        );
      })()
    : state.warranties;

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">${isCustomer ? 'My Warranty Coverage' : 'Warranty & RMA Management'}</h1>
        <p class="page-description">${isCustomer ? 'View your active SmartBoard warranty contracts and coverage details.' : 'Automated eligibility verification, contract duration tracking, and replacement coverage.'}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openWarrantyScannerModal()">
          Scan Warranty
        </button>
      </div>
    </div>
    ${isCustomer ? `<div class="role-info-banner"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-clipboard"></use></svg><strong>Customer View:</strong> Showing your registered warranty contracts only. Contact support for RMA or replacement requests.</div>` : ''}

    <!-- Quick Warranty Checker Box -->
    <div class="glass-panel" style="background: linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(17, 24, 39, 0.8) 100%);">
      <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Instant Warranty Coverage Check</h2>
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
              <th>Device Holder</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredWarranties.length === 0 ? `<tr><td colspan="${isCustomer ? '8' : '9'}" style="text-align:center;padding:40px;color:var(--text-muted);">No warranty records found.</td></tr>` : ''}
            ${filteredWarranties
              .map((w) => {
                const holder = resolveDeviceHolder(w);
                return `
              <tr>
                <td><strong style="font-family: 'JetBrains Mono';">${w.id}</strong></td>
                <td><strong style="color: var(--accent-blue);">${w.deviceId}</strong></td>
                ${!isCustomer ? `<td><strong>${w.customerName}</strong></td>` : ''}
                <td>${w.deviceModel}</td>
                <td>${w.purchaseDate}</td>
                <td>${w.expiryDate}</td>
                <td>
                  <span class="status-pill ${w.status === 'Under Warranty' ? 'status-online' : 'status-offline'}">
                    ${w.status === 'Under Warranty' ? 'Active' : 'Expired'}
                  </span>
                </td>
                <td>
                  <strong style="font-size: 0.85rem;">${escapeHtml(holder.person)}</strong>
                  ${holder.org ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(holder.org)}</div>` : ''}
                </td>
                <td>
                  <button 
                    class="btn btn-sm btn-secondary" 
                    onclick="openWarrantyBarcodeModal('${w.id}')"
                    title="Generate Barcode"
                    style="padding: 6px 12px; font-size: 0.8rem;"
                  >
                    Barcode
                  </button>
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

// 5b. People Directory — who else uses this system.
// Open to every role. It shows only the fields that help someone find a
// colleague or a counterpart: name, role, location, organization and live
// presence. Email and username stay admin-only (they live behind
// /auth/users), so this view cannot become a contact-harvesting surface for a
// customer account.
function renderDirectoryView() {
  const people = Array.isArray(state.directory) ? state.directory : [];
  const me = state.currentUser || {};

  const q = String(state.searchQuery || '').trim().toLowerCase();
  const searched = q
    ? people.filter((p) =>
        String(p.fullName || '').toLowerCase().includes(q) ||
        String(p.role || '').toLowerCase().includes(q) ||
        String(p.location || '').toLowerCase().includes(q) ||
        String(p.organization || '').toLowerCase().includes(q))
    : people;

  // Role filter. The search box answers "who is called X"; this answers "who
  // are the technicians" — a different question that a text box is bad at.
  const roleFilter = state.directoryRoleFilter || 'all';
  const visible = roleFilter === 'all'
    ? searched
    : searched.filter((p) => (p.role || '') === roleFilter);

  const onlineCount = visible.filter((p) => p.online).length;

  const roleCounts = {
    all: people.length,
    admin: people.filter((p) => p.role === 'admin').length,
    technician: people.filter((p) => p.role === 'technician').length,
    customer: people.filter((p) => p.role === 'customer').length,
  };

  const roleChip = (id, label, count) => {
    const active = roleFilter === id;
    return `<button type="button" class="dm-filter-chip${active ? ' is-active' : ''}"
      onclick="setDirectoryRoleFilter('${id}')" aria-pressed="${active}">${label} <strong>${count}</strong></button>`;
  };

  // Online people float to the top, then alphabetical — so "who is around"
  // is answered by the first screenful rather than by scanning every card.
  const sorted = [...visible].sort((a, b) => {
    if (!!b.online !== !!a.online) return b.online ? 1 : -1;
    return String(a.fullName || '').localeCompare(String(b.fullName || ''));
  });

  const nothingAtAll = people.length === 0;

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">Directory</h1>
        <p class="page-description">Everyone with an account on this system. Click any person to see their full profile and the devices they hold.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" onclick="fetchAllData()">Refresh</button>
      </div>
    </div>

    <div class="glass-panel directory-toolbar">
      <div class="search-input-box">
        <span class="search-icon"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-search"></use></svg></span>
        <input type="text" class="search-input"
          placeholder="Search by name, role, location or organization..."
          value="${escapeHtml(state.searchQuery || '')}" oninput="handleSearch(this.value)" />
      </div>
      <div class="dm-filter-bar directory-role-bar">
        ${roleChip('all', 'Everyone', roleCounts.all)}
        ${roleChip('admin', 'Admins', roleCounts.admin)}
        ${roleChip('technician', 'Technicians', roleCounts.technician)}
        ${roleChip('customer', 'Customers', roleCounts.customer)}
      </div>
    </div>

    <div class="directory-stats">
      <span class="directory-stat"><strong>${people.length}</strong> ${people.length === 1 ? 'person' : 'people'}</span>
      <span class="directory-stat"><span class="presence-dot is-online"></span><strong>${onlineCount}</strong> online now</span>
      ${(q || roleFilter !== 'all') ? `<span class="directory-stat directory-stat--muted"><strong>${visible.length}</strong> matching</span>` : ''}
    </div>

    ${sorted.length === 0
      ? `<div class="glass-panel directory-empty">
           <div class="directory-empty-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-search"></use></svg></div>
           <h3 class="directory-empty-title">${nothingAtAll ? 'Nobody here yet' : 'No one matches'}</h3>
           <p class="directory-empty-text">
             ${nothingAtAll
               ? 'Accounts will appear here as soon as people register.'
               : 'Try a different search term or clear the role filter.'}
           </p>
           ${(q || roleFilter !== 'all') ? `
             <div class="directory-empty-actions">
               ${roleFilter !== 'all' ? `<button type="button" class="btn btn-secondary" onclick="setDirectoryRoleFilter('all')">Clear role filter</button>` : ''}
               ${q ? `<button type="button" class="btn btn-secondary" onclick="handleSearch('')">Clear search</button>` : ''}
             </div>` : ''}
         </div>`
      : `<div class="directory-grid">
          ${sorted.map((p) => {
            const meta = ROLE_META[p.role] || { icon: 'user', name: p.role || 'User' };
            const isMe = p.id === me.id;
            const initials = String(p.fullName || '?').trim().charAt(0).toUpperCase();
            const held = countDevicesForPerson(p);
            return `
              <article class="directory-card directory-card--clickable${isMe ? ' is-me' : ''}"
                role="button" tabindex="0"
                title="Open ${escapeHtml(p.fullName)}'s profile"
                aria-label="Open profile for ${escapeHtml(p.fullName)}"
                onclick="openDirectoryProfile('${p.id}')"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDirectoryProfile('${p.id}');}">
                <div class="directory-avatar directory-avatar--${escapeHtml(p.role || 'user')}" aria-hidden="true">${escapeHtml(initials)}</div>
                <div class="directory-body">
                  <div class="directory-name">
                    ${escapeHtml(p.fullName)}
                    ${isMe ? '<span class="directory-you">You</span>' : ''}
                  </div>
                  <div class="directory-role">${ico(meta.icon)} <span>${escapeHtml(meta.name)}</span></div>
                  <div class="directory-meta">
                    <span title="Location">${escapeHtml(p.location || '—')}</span>
                    ${p.organization ? `<span title="Organization">${escapeHtml(p.organization)}</span>` : ''}
                    ${held > 0 ? `<span title="Devices held">${held} device${held === 1 ? '' : 's'}</span>` : ''}
                  </div>
                </div>
                <span class="presence-pill ${p.online ? 'is-online' : 'is-offline'}"
                  title="${p.online ? 'Active within the last 5 minutes' : 'Not active right now'}">
                  <span class="presence-dot ${p.online ? 'is-online' : 'is-offline'}"></span>${p.online ? 'Online' : 'Offline'}
                </span>
              </article>`;
          }).join('')}
        </div>`}
  `;
}

/** Role filter on the People Directory. 'all' clears it. */
function setDirectoryRoleFilter(role) {
  state.directoryRoleFilter = ['all', 'admin', 'technician', 'customer'].includes(role) ? role : 'all';
  renderApp();
}

/**
 * Devices held by a person, resolved through their organization.
 *
 * A person row carries an organization name, and devices carry a customer id —
 * so the link is organization name -> customers row -> devices. An admin or a
 * technician has no organization and therefore no held devices; that is a real
 * answer, not a lookup failure, and the profile says so.
 */
function devicesForPerson(person) {
  const org = String((person && person.organization) || '').trim().toLowerCase();
  if (!org) return [];
  const cust = (state.customers || []).find(
    (c) => String(c.organizationName || '').trim().toLowerCase() === org
  );
  if (!cust) return [];
  return (state.devices || []).filter(
    (d) => String(d.customerId || '').toLowerCase() === String(cust.id || '').toLowerCase()
  );
}

function countDevicesForPerson(person) {
  return devicesForPerson(person).length;
}

/** Plain-text role label. Callers escape it, so no markup here. */
function roleDisplay(role) {
  const meta = ROLE_META[role] || { name: role || 'User' };
  return meta.name;
}

function formatJoined(value) {
  if (!value) return 'Not recorded';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Not recorded';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Full profile for one directory entry: who they are, how to reach them, where
 * they work, and which devices they hold. Read-only — editing a user lives in
 * the Data Manager (admins) or Settings (yourself).
 */
function openDirectoryProfile(personId) {
  const people = Array.isArray(state.directory) ? state.directory : [];
  const p = people.find((x) => x.id === personId);
  if (!p) {
    showToast('That person is no longer in the directory.', 'error');
    return;
  }

  const existing = document.getElementById('directoryProfileOverlay');
  if (existing) existing.remove();

  const me = state.currentUser || {};
  const isMe = p.id === me.id;
  const held = devicesForPerson(p);
  const initials = String(p.fullName || '?').trim().charAt(0).toUpperCase();

  // Tickets raised against any device this person's organization holds.
  const heldIds = new Set(held.map((d) => String(d.id)));
  const theirTickets = (state.tickets || []).filter((t) => heldIds.has(String(t.deviceId)));
  const openTickets = theirTickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed');
  const onlineDevices = held.filter((d) => getDeviceDisplayStatus(d) === 'online').length;

  const statusPill = (s) => {
    const map = {
      online: ['status-online', 'Online'],
      offline: ['status-offline', 'Offline'],
      warning: ['status-warning', 'Needs attention'],
      maintenance: ['status-maintenance', 'In service'],
    };
    const [cls, label] = map[s] || ['status-offline', s || 'Unknown'];
    return `<span class="status-pill ${cls}" style="font-size:0.7rem;">${label}</span>`;
  };

  const overlay = document.createElement('div');
  overlay.id = 'directoryProfileOverlay';
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal-content dir-profile" role="dialog" aria-modal="true"
         aria-label="Profile for ${escapeHtml(p.fullName)}">

      <button type="button" class="dir-profile-close" id="dirProfileClose"
        aria-label="Close profile"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"></use></svg></button>

      <div class="dir-profile-head">
        <div class="dir-profile-avatar directory-avatar--${escapeHtml(p.role || 'user')}" aria-hidden="true">
          ${escapeHtml(initials)}
        </div>
        <div class="dir-profile-id">
          <h3 class="dir-profile-name">
            ${escapeHtml(p.fullName)}
            ${isMe ? '<span class="directory-you">You</span>' : ''}
          </h3>
          <div class="dir-profile-role">${escapeHtml(roleDisplay(p.role))}</div>
          <span class="presence-pill ${p.online ? 'is-online' : 'is-offline'}">
            <span class="presence-dot ${p.online ? 'is-online' : 'is-offline'}"></span>${p.online ? 'Online now' : 'Offline'}
          </span>
        </div>
      </div>

      <div class="dir-profile-stats">
        <div class="dir-profile-stat">
          <strong>${held.length}</strong>
          <span>${held.length === 1 ? 'Device' : 'Devices'} held</span>
        </div>
        <div class="dir-profile-stat">
          <strong>${onlineDevices}</strong>
          <span>Online now</span>
        </div>
        <div class="dir-profile-stat">
          <strong>${openTickets.length}</strong>
          <span>Open tickets</span>
        </div>
      </div>

      <div class="dir-profile-section">
        <div class="dir-profile-section-title">Contact</div>
        <div class="dir-profile-rows">
          <div class="dir-profile-row">
            <span class="dir-profile-key">Email</span>
            <span class="dir-profile-val">
              ${p.email
                ? `<a href="mailto:${escapeHtml(p.email)}" class="dir-profile-link">${escapeHtml(p.email)}</a>`
                : '<span class="dir-profile-none">Not on file</span>'}
            </span>
          </div>
          <div class="dir-profile-row">
            <span class="dir-profile-key">Username</span>
            <span class="dir-profile-val">
              ${p.username ? `@${escapeHtml(p.username)}` : '<span class="dir-profile-none">Not on file</span>'}
            </span>
          </div>
        </div>
      </div>

      <div class="dir-profile-section">
        <div class="dir-profile-section-title">Work</div>
        <div class="dir-profile-rows">
          <div class="dir-profile-row">
            <span class="dir-profile-key">Organization</span>
            <span class="dir-profile-val">
              ${p.organization ? escapeHtml(p.organization) : '<span class="dir-profile-none">No organization (internal staff)</span>'}
            </span>
          </div>
          <div class="dir-profile-row">
            <span class="dir-profile-key">Primary location</span>
            <span class="dir-profile-val">${escapeHtml(p.location || '—')}</span>
          </div>
          ${Array.isArray(p.allowedLocations) && p.allowedLocations.length > 1 ? `
            <div class="dir-profile-row">
              <span class="dir-profile-key">Also covers</span>
              <span class="dir-profile-val">${p.allowedLocations.filter((l) => l !== p.location).map((l) => escapeHtml(l)).join(', ')}</span>
            </div>` : ''}
          <div class="dir-profile-row">
            <span class="dir-profile-key">Member since</span>
            <span class="dir-profile-val">${escapeHtml(formatJoined(p.createdAt))}</span>
          </div>
          <div class="dir-profile-row">
            <span class="dir-profile-key">Last active</span>
            <span class="dir-profile-val">
              ${p.lastSeenAt ? escapeHtml(timeAgo(new Date(p.lastSeenAt))) : '<span class="dir-profile-none">No activity recorded</span>'}
            </span>
          </div>
        </div>
      </div>

      <div class="dir-profile-section">
        <div class="dir-profile-section-title">
          Devices held
          ${held.length > 0 ? `<span class="dir-profile-count">${held.length}</span>` : ''}
        </div>
        ${held.length === 0
          ? `<div class="dir-profile-empty">
               ${p.organization
                 ? 'No devices are assigned to this organization yet.'
                 : 'Internal staff — this person is not linked to a client organization, so no devices are held in their name.'}
             </div>`
          : `<div class="dir-profile-devices">
               ${held.map((d) => `
                 <div class="dir-profile-device">
                   <div class="dir-profile-device-main">
                     <strong>${escapeHtml(d.id)}</strong>
                     <span class="dir-profile-device-model">${escapeHtml(d.model || '')}</span>
                   </div>
                   <div class="dir-profile-device-meta">
                     ${statusPill(getDeviceDisplayStatus(d))}
                     <span class="dir-profile-device-loc">${escapeHtml(d.location || '—')}</span>
                   </div>
                 </div>
               `).join('')}
             </div>`}
      </div>

      <div class="modal-footer dir-profile-foot">
        ${p.email ? `<a class="btn btn-secondary" href="mailto:${escapeHtml(p.email)}">Send email</a>` : ''}
        <button type="button" class="btn btn-primary" id="dirProfileDone">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));

  const close = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.querySelector('#dirProfileClose').onclick = close;
  overlay.querySelector('#dirProfileDone').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape' && document.body.contains(overlay)) {
      close();
      document.removeEventListener('keydown', esc);
    }
  });
}

// 6. Inventory & Spare Parts Management View
/* Part artwork.
   Keyed by part code so the card does not depend on a stored image URL — the
   inventory rows carry only catalogue data. Anything unrecognised falls back to
   a neutral placeholder rather than borrowing another part's photo.

   The artwork is a vector reproduction of the actual hardware shown in the
   Millennium product film, so the versions are appended as a query string —
   the filenames stay stable but a redraw still reaches clients that already
   cached the old asset. */
const PART_IMAGE_VERSION = '20261018a';
const PART_IMAGES = {
  'CAM-4K-AI':  '/images/parts/cam-4k-ai.svg',
  'PEN-DUO-MAG': '/images/parts/pen-duo-mag.svg',
  'PWR-BD-350W': '/images/parts/pwr-bd-350w.svg',
  'RC-MIL-BT':  '/images/parts/rc-mil-bt.svg',
  'OPS-I7-12G': '/images/parts/ops-i7-12g.svg',
  'TF-86-PRO':  '/images/parts/tf-86-pro.svg',
};

const PART_CATEGORY_ICONS = {
  'AV Equipment': '',
  'Accessories': '',
  'Power & Mainboard': '',
  'Computing (OPS)': '',
  'Display & Touch': '',
};

function getPartImage(part) {
  if (!part) return null;
  if (part.imageUrl) return part.imageUrl;
  const code = String(part.partCode || '').trim().toUpperCase();
  const src = PART_IMAGES[code];
  return src ? `${src}?v=${PART_IMAGE_VERSION}` : null;
}

function getPartCategoryIcon(category) {
  return PART_CATEGORY_ICONS[category] || '';
}

function formatUnitCost(value) {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Mirrors the status rule the server applies, for optimistic redraws. */
function stockStatusFor(quantity, minThreshold) {
  const q = Number(quantity) || 0;
  const min = Number(minThreshold) || 5;
  if (q <= 0) return 'Out of Stock';
  return q < min ? 'Low Stock' : 'In Stock';
}

function inventoryTone(status) {
  return status === 'In Stock' ? 'is-in' : status === 'Low Stock' ? 'is-low' : 'is-out';
}

/* One card. Kept separate from the view so a price edit or a restock can repaint
   just the grid — a full fetchAllData() would re-render the page and throw away
   the scroll position and any in-progress inline editor. */
function renderInventoryCard(part, isAdmin) {
  const tone = inventoryTone(part.status);
  const statusPillClass =
    part.status === 'In Stock' ? 'status-online'
      : part.status === 'Low Stock' ? 'status-warning' : 'status-offline';

  // Fill bar: three times the minimum threshold is the "comfortable"
  // ceiling, so a part sitting at its minimum reads as one third full.
  const ceiling = Math.max(part.minThreshold * 3, 1);
  const fillPct = Math.max(4, Math.min(100, Math.round((part.stockQuantity / ceiling) * 100)));

  const img = getPartImage(part);
  const catIcon = getPartCategoryIcon(part.category);
  const priceText = `<span class="currency-symbol">₱</span>${formatUnitCost(part.unitCost)}`;

  return `
          <article class="inv-card ${tone}" data-part-id="${part.id}">
            <div class="inv-media">
              ${img
                ? `<img src="${img}" alt="${escapeHtml(part.name)}" loading="lazy" decoding="async" />`
                : `<span class="inv-media-fallback" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-package"></use></svg></span>`}
              <span class="status-pill ${statusPillClass} inv-media-pill">${part.status}</span>
            </div>

            <div class="inv-body">
              <div class="inv-code">${escapeHtml(part.partCode)}</div>
              <h3 class="inv-part-name">${escapeHtml(part.name)}</h3>
              <div class="inv-part-category"><span aria-hidden="true">${catIcon}</span>${escapeHtml(part.category)}</div>

              <div class="inv-stock-box">
                <div class="inv-stock-line">
                  <span class="inv-stock-number">${part.stockQuantity}</span>
                  <span class="inv-stock-hint">units remaining<br /><small>(Min: ${part.minThreshold})</small></span>
                </div>
                <div class="inv-stock-bar"><span style="width:${fillPct}%"></span></div>
              </div>

              <div class="inv-card-foot">
                <span class="inv-unit-cost">Unit Cost<br /><span class="inv-price-host" data-price-for="${part.id}">${
                  isAdmin
                    ? `<button type="button" class="inv-price-btn" onclick="editPartPrice('${part.id}')"
                         title="Edit unit cost" aria-label="Edit unit cost for ${escapeHtml(part.name)}"><strong>${priceText}</strong><svg class="inv-price-pencil" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button>`
                    : `<strong>${priceText}</strong>`
                }</span></span>
                ${isAdmin
                  ? `<button class="inv-restock-btn" onclick="restockOne('${part.id}')" title="Add 1 unit to stock">Restock<span class="inv-restock-plus">+1</span></button>`
                  : `<span class="status-pill ${statusPillClass}" style="font-size:0.72rem;">${part.status}</span>`}
              </div>

              ${isAdmin ? `
                <div class="inv-delete-row">
                  <button class="inv-delete-btn" onclick="deleteInventoryPart('${part.id}')">Delete Part</button>
                </div>
              ` : ''}
            </div>
          </article>
        `;
}

function renderInventoryCards() {
  const isAdmin = state.currentRole === 'admin';
  return (state.inventory || []).map((part) => renderInventoryCard(part, isAdmin)).join('');
}

/** Repaint the grid in place — no refetch, no scroll jump. */
function refreshInventoryGrid() {
  const grid = document.querySelector('.inv-grid');
  if (!grid) return;
  grid.innerHTML = renderInventoryCards();
}

function renderInventoryView() {
  const isAdmin = state.currentRole === 'admin';
  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">Spare Parts & Hardware Inventory</h1>
        <p class="page-description">Real-time stock tracking for Millennium replacements, touch frames, OPS boards, and accessories.</p>
      </div>
      <div class="page-actions">
        ${isAdmin ? `<button class="btn btn-primary" onclick="openRestockModal()">Restock Shipment</button>` : `<span style="font-size:0.82rem;color:var(--text-muted);">View only. Deduct parts via a ticket.</span>`}
      </div>
    </div>

    <!-- Inventory Cards -->
    <div class="inv-grid">${renderInventoryCards()}</div>
  `;
}

// 7. Digital Content Management (CMS) View
function renderCmsView() {
  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">Digital Display Content CMS</h1>
        <p class="page-description">Broadcast announcements, campus schedules, and corporate welcome slides directly to Millennium SmartBoards.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openCreateCmsModal()">Publish Content</button>
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
        <h1 class="page-title">AI Predictive Maintenance Engine</h1>
        <p class="page-description">Machine learning telemetry analysis predicts component degradation and hardware failure *before* customer outage.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openAnomalySimulatorModal()">Fault Injection Simulator</button>
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
              <span style="font-size: 1.8rem;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-alert"></use></svg></span>
              <div>
                <h3 style="font-size: 1.2rem; font-weight: 800; color: var(--text-primary);">
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
            <p style="font-size: 0.9rem; margin-top: 4px; color: var(--text-primary);">${alert.recommendedAction}</p>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="openRemoteControlModal('${alert.deviceId}')">Run Remote Diagnostic</button>
            <button class="btn btn-primary btn-sm" onclick="createPreventiveTicketFromAlert('${alert.deviceId}', '${alert.riskFactor.replace(/'/g, "\\'")}')">
              Dispatch Preventive Technician
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
        <h1 class="page-title">Business & Reliability Analytics</h1>
        <p class="page-description">Hardware performance insights, sales distribution, and after-sales failure mode Pareto charts.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="exportAnalyticsReport()">Export Executive Summary</button>
      </div>
    </div>

    <!-- Analytics Cards Grid (collapses to one column on mobile) -->
    <div class="analytics-grid">
      <!-- Popular Models -->
      <div class="glass-panel">
        <div class="panel-header">
          <div class="panel-title">Popular Display Sizes Sold</div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Total 327 Units</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${popular
            .map(
              (p, idx) => `
            <div>
              <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px;">
                <span>${idx === 0 ? '' : idx === 1 ? '' : ''} ${p.model}</span>
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
          <div class="panel-title">Common Support Issues (Pareto)</div>
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
        <div class="panel-title">After-Sales Operations Efficiency</div>
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
          <div style="font-size: 2.4rem; font-weight: 800; color: var(--accent-blue-text); font-family: 'JetBrains Mono';"><span class="currency-symbol">₱</span>1.2M</div>
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
    { id: 'users',      icon: '', label: 'System Users' },
    { id: 'customers',  icon: '', label: 'Registered Customers' },
    { id: 'allocation', icon: '', label: 'Device Allocation' },
  ];

  // Counts live on the tab that owns them. 'allocation' has no count of its own
  // (it is about devices, not accounts), so it stays clean.
  const tabCount = {
    users: (state.allUsers || []).length,
    customers: (state.allUsers || []).filter(u => u.role === 'customer').length,
  };

  return `
    <div class="page-header-row">
      <div>
        <h1 class="page-title">Data Manager</h1>
        <p class="page-description">Manage system users, customer organizations, and assign purchased devices to customers.</p>
      </div>
    </div>

    <!-- Sub-tab navigation.
         Was inline-styled with var(--neon-cyan) (#00f2fe, the same in BOTH
         themes) — against a white surface in light mode that is ~1.3:1, so the
         active tab label was effectively invisible. Now token-driven. -->
    <div class="dm-tabs" role="tablist">
      ${tabs.map(t => `
        <button type="button" role="tab" aria-selected="${subTab === t.id}"
          class="dm-tab${subTab === t.id ? ' is-active' : ''}"
          onclick="switchDataManagerTab('${t.id}')">
          <span class="dm-tab-ico" aria-hidden="true">${t.icon}</span>
          ${t.label}
          ${tabCount[t.id] !== undefined ? `<span class="dm-tab-count">${tabCount[t.id]}</span>` : ''}
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

/**
 * Set the client-type filter on the Data Manager customers tab.
 * Passing 'all' (or anything unknown) clears it.
 */
function setClientTypeFilter(type) {
  state.clientTypeFilter = ['school', 'corporate'].includes(type) ? type : 'all';
  // The filter only lives on the customers tab, so make sure that is showing.
  state.dataManagerSubTab = 'customers';
  renderApp();
}

/**
 * Dashboard drill-down: jump straight from a School / Corporate chip to the
 * matching list of client accounts. This is what makes those chips real
 * buttons rather than decoration.
 */
function showClientsByType(type) {
  const wanted = type === 'school' ? 'school' : 'corporate';
  const count = (state.customers || []).filter(c => c.clientType === wanted).length;

  setClientTypeFilter(wanted);

  if (count === 0) {
    showToast(`No ${wanted} clients have registered yet.`, 'info');
  } else {
    showToast(`Showing ${count} ${wanted} client${count === 1 ? '' : 's'}.`, 'success');
  }
}

// --- Data Manager: Users Sub-tab ---
function renderDMUsersTab() {
  const users = state.allUsers || [];
  // Role → class. The old version interpolated `${var(--accent-purple-text)}22`
  // to fake an alpha tint, which is not valid CSS — `var()` cannot take a
  // suffix — so every badge silently rendered with no background at all.
  const roleClass = { admin: 'dm-role--admin', technician: 'dm-role--tech', customer: 'dm-role--customer' };

  return `
    <div class="glass-panel">
      <div class="panel-header" style="margin-bottom: 16px;">
        <div class="panel-title">System Users</div>
        <button class="btn btn-primary btn-sm" onclick="openCreateUserModal()">Create User</button>
      </div>

      <div class="data-table-wrapper">
        <table class="data-table dm-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Email</th>
              <th>Organization</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${users.length === 0 ? `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">No users found.</td></tr>` : ''}
            ${users.map(u => `
              <tr>
                <td>
                  <div class="dm-user">
                    <div class="dm-avatar">${(u.fullName||u.username).charAt(0).toUpperCase()}</div>
                    <div class="dm-user-text">
                      <strong class="dm-name" title="User ID: ${u.id}">${u.fullName || u.username}</strong>
                      <span class="dm-handle">@${u.username}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="dm-role ${roleClass[u.role] || ''}">${u.role.toUpperCase()}</span>
                </td>
                <td><div class="dm-ellipsis" title="${u.email || ''}">${u.email || '—'}</div></td>
                <td>
                  <div class="dm-ellipsis" title="${u.organization || ''}">${u.organization || '—'}</div>
                  <div class="dm-sub">${u.location || '—'}</div>
                </td>
                <td class="col-actions">
                  <div class="dm-actions">
                    <button class="action-btn" title="Edit user" aria-label="Edit ${u.username}"
                      onclick="openEditUserModal('${u.id}')"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-pencil"></use></svg></button>
                    <button class="action-btn action-btn-danger" title="Delete user" aria-label="Delete ${u.username}"
                      onclick="deleteUser('${u.id}','${(u.fullName||u.username).replace(/'/g,"\\'")}')"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg></button>
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
  const allRows = registeredCustomers.map(u => {
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

  // Client-type filter. 'school' / 'corporate' are set by the dashboard chips
  // via showClientsByType(); accounts with no matching customer record fall
  // outside both groups and are therefore only visible under "All".
  const filter = state.clientTypeFilter || 'all';
  const rows = filter === 'all'
    ? allRows
    : allRows.filter(r => r.org && r.org.clientType === filter);

  const schoolCount = allRows.filter(r => r.org && r.org.clientType === 'school').length;
  const corpCount   = allRows.filter(r => r.org && r.org.clientType === 'corporate').length;

  const filterChip = (id, label, count) => {
    const active = filter === id;
    return `<button type="button" class="dm-filter-chip${active ? ' is-active' : ''}"
      onclick="setClientTypeFilter('${id}')"
      aria-pressed="${active}">${label} <strong>${count}</strong></button>`;
  };

  return `
    <div class="glass-panel">
      <div class="panel-header" style="margin-bottom: 16px;">
        <div class="panel-title">Registered Customers</div>
        <span style="font-size:0.82rem;color:var(--text-muted);">
          ${rows.length} of ${registeredCustomers.length} account${registeredCustomers.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div class="dm-filter-bar">
        ${filterChip('all', 'All clients', allRows.length)}
        ${filterChip('school', 'Schools', schoolCount)}
        ${filterChip('corporate', 'Corporate', corpCount)}
      </div>

      <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 16px;">
        ${filter === 'all'
          ? 'Every customer account registered on the platform.'
          : `Showing only ${filter === 'school' ? 'school' : 'corporate'} accounts.`}
      </p>

      <div class="data-table-wrapper">
        <table class="data-table dm-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Email</th>
              <th>Organization</th>
              <th class="col-actions">Devices</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 ? `<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted);">${filter === 'all' ? 'No registered customers found.' : `No ${filter} accounts found.`}</td></tr>` : ''}
            ${rows.map(({ user: u, org, deviceCount }) => `
              <tr>
                <td>
                  <div class="dm-user">
                    <div class="dm-avatar dm-avatar--customer">${(u.fullName || u.username).charAt(0).toUpperCase()}</div>
                    <div class="dm-user-text">
                      <strong class="dm-name" title="User ID: ${u.id}">${u.fullName || u.username}</strong>
                      <span class="dm-handle">@${u.username}</span>
                    </div>
                  </div>
                </td>
                <td><div class="dm-ellipsis" title="${u.email || ''}">${u.email || '—'}</div></td>
                <td>
                  ${org
                    ? `<div class="dm-org-line">
                         <span class="dm-ellipsis" title="${org.organizationName}">${org.organizationName}</span>
                         <span class="status-pill ${org.clientType === 'school' ? 'status-online' : 'status-maintenance'}" style="font-size:0.7rem;">
                           ${org.clientType === 'school' ? 'School' : 'Corporate'}
                         </span>
                       </div>
                       <div class="dm-sub">${u.location || '—'}</div>`
                    : `<div class="dm-ellipsis" style="color:#f59e0b;">${orgName || 'Not linked'}</div>
                       <div class="dm-sub">No customer record</div>`}
                </td>
                <td class="col-actions">
                  <span class="dm-count ${deviceCount > 0 ? 'is-set' : ''}">${deviceCount}</span>
                  <span class="dm-sub">unit${deviceCount !== 1 ? 's' : ''}</span>
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

  const filter = state.allocFilter || 'all';
  const visible = filter === 'assigned'   ? assignedDevices
                : filter === 'unassigned' ? unassignedDevices
                : devices;

  const chip = (id, label, count) => {
    const active = filter === id;
    return `<button type="button" class="dm-filter-chip${active ? ' is-active' : ''}"
      onclick="setAllocFilter('${id}')" aria-pressed="${active}">${label} <strong>${count}</strong></button>`;
  };

  return `
    <div class="alloc-stack">

      <!-- Summary Bar -->
      <div class="stat-cards-grid alloc-stats">
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Total Devices</span><div class="stat-icon" style="background:rgba(0,242,254,0.1);color:var(--neon-cyan);"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-monitor"></use></svg></div></div>
          <div class="stat-value" style="color:var(--neon-cyan);">${devices.length}</div>
          <div class="stat-footer">All registered SmartBoards</div>
        </div>
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Assigned</span><div class="stat-icon" style="background:rgba(16,185,129,0.1);color:#10b981;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-check-circle"></use></svg></div></div>
          <div class="stat-value" style="color:#10b981;">${assignedDevices.length}</div>
          <div class="stat-footer">Linked to a customer</div>
        </div>
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Unassigned</span><div class="stat-icon" style="background:rgba(245,158,11,0.1);color:#f59e0b;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-package"></use></svg></div></div>
          <div class="stat-value" style="color:#f59e0b;">${unassignedDevices.length}</div>
          <div class="stat-footer">Pending customer assignment</div>
        </div>
        <div class="stat-card">
          <div class="stat-header"><span class="stat-label">Customers</span><div class="stat-icon" style="background:rgba(168,85,247,0.1);color:#a855f7;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-building"></use></svg></div></div>
          <div class="stat-value" style="color:#a855f7;">${customers.length}</div>
          <div class="stat-footer">Registered organizations</div>
        </div>
      </div>

      <!-- Quick Assign Widget.
           This panel used to hardcode a dark gradient
           (linear-gradient(135deg, rgba(0,242,254,.07), rgba(17,24,39,.9))),
           which turned it into an unreadable dark slab in LIGHT theme — the
           labels are --text-secondary, so they vanished into it. It now uses
           theme tokens only, so it reads correctly in both themes. -->
      <section class="glass-panel alloc-panel">
        <header class="alloc-head">
          <div class="alloc-head-main">
            <span class="alloc-head-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-link"></use></svg></span>
            <div>
              <h2 class="alloc-head-title">Assign a SmartBoard</h2>
              <p class="alloc-head-sub">Link a registered device to the customer organization that owns it.</p>
            </div>
          </div>
          <span class="alloc-head-tag">Admin only</span>
        </header>

        <div class="alloc-grid">
          <div class="alloc-field">
            <label class="alloc-label" for="allocDeviceSelect">
              Device <span class="alloc-req">Required</span>
            </label>
            <select id="allocDeviceSelect" class="form-input">
              <option value="">— Choose a SmartBoard —</option>
              ${devices.map(d => {
                const owner = customers.find(c => c.id === d.customerId);
                return `<option value="${d.id}">${escapeHtml(d.id)} · ${escapeHtml(d.model || '')}${owner ? ' · currently ' + escapeHtml(owner.organizationName) : ' · unassigned'}</option>`;
              }).join('')}
            </select>
          </div>

          <div class="alloc-field">
            <label class="alloc-label" for="allocCustomerSelect">
              Customer <span class="alloc-req">Required</span>
            </label>
            <select id="allocCustomerSelect" class="form-input">
              <option value="">— Choose a Customer —</option>
              ${customers.map(c => `<option value="${c.id}">${escapeHtml(c.organizationName)} (${escapeHtml(c.id)})</option>`).join('')}
            </select>
          </div>

          <div class="alloc-field">
            <label class="alloc-label" for="allocLocationInput">
              Installation location <span class="alloc-opt">Optional</span>
            </label>
            <input type="text" id="allocLocationInput" class="form-input" placeholder="e.g. Room 301, Main Building" />
          </div>

          <div class="alloc-field">
            <label class="alloc-label" for="allocCityInput">
              City <span class="alloc-opt">Optional</span>
            </label>
            <input type="text" id="allocCityInput" class="form-input" placeholder="e.g. Quezon City" />
          </div>
        </div>

        <footer class="alloc-actions">
          <p class="alloc-hint">
            The device keeps its serial number, firmware and service history — only the owning organization changes.
          </p>
          <button type="button" class="btn btn-primary alloc-submit" onclick="executeDeviceAllocation()">
            Assign device
          </button>
        </footer>
      </section>

      <!-- All Devices Allocation Table -->
      <section class="glass-panel alloc-panel alloc-panel--flush">
        <header class="alloc-head alloc-head--bar">
          <div>
            <h2 class="alloc-head-title">All device assignments</h2>
            <p class="alloc-head-sub">${devices.length} SmartBoard${devices.length === 1 ? '' : 's'} registered</p>
          </div>
          <div class="dm-filter-bar">
            ${chip('all', 'All', devices.length)}
            ${chip('assigned', 'Assigned', assignedDevices.length)}
            ${chip('unassigned', 'Unassigned', unassignedDevices.length)}
          </div>
        </header>

        <div class="data-table-wrapper">
          <table class="data-table alloc-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Model</th>
                <th>Assigned to</th>
                <th>Location</th>
                <th>Status</th>
                <th class="col-actions">Action</th>
              </tr>
            </thead>
            <tbody>
              ${visible.length === 0 ? `
                <tr>
                  <td colspan="6" class="alloc-empty">
                    ${devices.length === 0
                      ? 'No devices registered yet. Register a SmartBoard from the Devices page first.'
                      : filter === 'unassigned'
                        ? 'Every registered device is already assigned to a customer.'
                        : 'No devices match this filter.'}
                  </td>
                </tr>` : ''}
              ${visible.map(dev => {
                const linkedCust = customers.find(c => c.id === dev.customerId);
                const isAssigned = !!linkedCust;
                const displayStatus = getDeviceDisplayStatus(dev);
                const statusCls = displayStatus === 'online' ? 'status-online'
                                : displayStatus === 'warning' ? 'status-warning'
                                : displayStatus === 'maintenance' ? 'status-maintenance'
                                : 'status-offline';
                const statusTxt = displayStatus === 'online' ? 'Online'
                                : displayStatus === 'offline' ? 'Offline'
                                : displayStatus === 'warning' ? 'Warning'
                                : 'Maintenance';
                return `
                <tr>
                  <td>
                    <div class="alloc-dev-id">${escapeHtml(dev.id)}</div>
                    <div class="alloc-dev-sub">${escapeHtml(dev.serialNumber || '—')}</div>
                  </td>
                  <td>
                    <div class="alloc-dev-model">${escapeHtml(dev.model || '—')}</div>
                    <div class="alloc-dev-sub">${escapeHtml(dev.firmwareVersion || '')}</div>
                  </td>
                  <td>
                    ${isAssigned
                      ? `<div class="alloc-owner">${escapeHtml(dev.customerName || linkedCust.organizationName)}</div>
                         <div class="alloc-dev-sub alloc-dev-sub--ok">${escapeHtml(dev.customerId)}</div>`
                      : `<div class="alloc-owner alloc-owner--none">Not assigned</div>
                         <div class="alloc-dev-sub">Awaiting a customer</div>`}
                  </td>
                  <td>
                    <div class="alloc-loc">${escapeHtml(dev.location || '—')}</div>
                    ${dev.city ? `<div class="alloc-dev-sub">${escapeHtml(dev.city)}</div>` : ''}
                  </td>
                  <td><span class="status-pill ${statusCls}">${statusTxt}</span></td>
                  <td class="col-actions">
                    <button class="btn btn-secondary btn-sm" onclick="quickAssignFromTable('${dev.id}')"
                      title="${isAssigned ? 'Reassign this device to a different customer' : 'Assign this device to a customer'}">
                      ${isAssigned ? 'Reassign' : 'Assign'}
                    </button>
                  </td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

/** Assignment-status filter on the Data Manager > Device Allocation tab. */
function setAllocFilter(filter) {
  state.allocFilter = ['all', 'assigned', 'unassigned'].includes(filter) ? filter : 'all';
  renderApp();
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
      showToast(`Device ${deviceId} successfully assigned to customer!`, 'success');
      await fetchAllData();
    } else {
      showToast(`${data.error || 'Assignment failed.'}`, 'error');
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
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,0.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:500px;">
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:20px;">Create System User</h2>
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
        <div id="uErrorMsg" class="form-error" role="alert" style="display:none;"></div>
        <div style="display:flex;gap:12px;margin-top:6px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('userModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" onclick="submitCreateUser()">Create User</button>
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
      showToast(`User @${body.username} created successfully!`, 'success');
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
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,0.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:500px;">
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:20px;">Edit User — <span style="color:var(--neon-cyan);">@${user.username}</span></h2>
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
        <div id="euErrorMsg" class="form-error" role="alert" style="display:none;"></div>
        <div style="display:flex;gap:12px;margin-top:6px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('userModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" onclick="submitEditUser('${userId}')">Save Changes</button>
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
      showToast('User updated successfully!', 'success');
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
          showToast(`User ${userName} deleted.`, 'success');
          fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,0.65);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:500px;">
      <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:20px;">Add Customer Organization</h2>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Organization Name *</label>
          <input id="cOrgName" class="form-input" placeholder="e.g. ABC University" /></div>
        <div><label style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px;">Client Type</label>
          <select id="cType" class="form-input">
            <option value="school">School / Educational</option>
            <option value="corporate">Corporate / Enterprise</option>
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
        <div id="cErrorMsg" class="form-error" role="alert" style="display:none;"></div>
        <div style="display:flex;gap:12px;margin-top:6px;">
          <button class="btn btn-secondary" style="flex:1;" onclick="document.getElementById('customerModalOverlay').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:1;" onclick="submitCreateCustomer()">Add Organization</button>
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
      showToast(`Customer "${body.organizationName}" added successfully!`, 'success');
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
          showToast(`Customer "${orgName}" deleted.`, 'success');
          fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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
    lockBtn.textContent = dev.screenLocked ? 'Unlock Display' : 'Lock Screen';
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

  if (title) title.textContent = `Ticket ${tck.ticketNumber}`;

  if (body) {
    // ---------------------------------------------------------------------
    // Conversation gate.
    //
    // The chat used to be rendered inline, in the middle of the ticket, with
    // its message list already polling. Opening a ticket therefore fired a
    // request every three seconds even when the reader only wanted to check
    // the device serial — and the composer pushed the status controls below
    // the fold. The panel is now closed until "Open chat" is pressed, and the
    // poll only runs while it is open.
    // ---------------------------------------------------------------------
    const chatCopy = isCustomer
      ? { title: 'Support conversation', hint: 'Private with Millennium support. Technicians cannot read this.', chip: 'Private', tone: 'green' }
      : isAdmin
        ? { title: 'Conversation', hint: 'Staff channel and the customer’s private support channel.', chip: '2 channels', tone: 'cyan' }
        : { title: 'Staff conversation', hint: 'Internal coordination with admin. Customers cannot read this.', chip: 'Internal', tone: 'purple' };

    const activeChannel = isCustomer ? 'customer' : (state._activeChatTab || 'staff');
    const sendChannelAttr = isCustomer ? "'customer'" : "(state._activeChatTab||'staff')";
    const inputPlaceholder = isCustomer
      ? 'Message Millennium support…'
      : activeChannel === 'customer'
        ? 'Reply to the customer…'
        : 'Reply to the technician…';

    const tabsHtml = isAdmin ? `
      <div class="tix-chat-tabs" role="tablist" aria-label="Conversation channel">
        <button type="button" id="tabStaffChat" role="tab" class="tix-chat-tab is-active"
          onclick="switchTicketChatTab('staff','${tck.id}')">Staff channel</button>
        <button type="button" id="tabCustomerChat" role="tab" class="tix-chat-tab"
          onclick="switchTicketChatTab('customer','${tck.id}')">Customer support</button>
      </div>` : '';

    const fact = (label, valueHtml) =>
      `<div class="tix-fact"><dt>${label}</dt><dd>${valueHtml}</dd></div>`;

    body.innerHTML = `
      <div class="tix-modal">

        <!-- Summary -->
        <section class="tix-sum">
          <div class="tix-sum-head">
            <div class="tix-sum-copy">
              <h3>${escapeHtml(tck.title)}</h3>
              <p>${escapeHtml(tck.description)}</p>
            </div>
            <span class="tix-status-chip is-${String(tck.status || '').toLowerCase().replace(/[^a-z]+/g, '-')}">
              ${escapeHtml(ticketStatusLabel(tck.status))}
            </span>
          </div>

          <dl class="tix-facts">
            ${fact('Device', `<span class="tix-mono">${escapeHtml(tck.deviceId)}</span><small>${escapeHtml(tck.deviceModel || '')}</small>`)}
            ${fact('Customer', escapeHtml(tck.customerName))}
            ${fact('Priority', `<span class="tix-pri is-${String(tck.priority || '').toLowerCase()}">${escapeHtml(tck.priority || '—')}</span>`)}
            ${fact('Warranty', tck.warrantyCovered
              ? '<span class="tix-flag is-ok">' + ico('shield') + ' Covered</span>'
              : '<span class="tix-flag is-off">' + ico('shield') + ' Not covered</span>')}
            ${fact('Assigned to', escapeHtml(tck.assignedTechnician || 'Unassigned'))}
            ${fact('Logged', escapeHtml(formatShortDate(tck.createdAt)))}
          </dl>
        </section>

        <!-- Conversation (collapsed until opened) -->
        <section class="tix-convo" id="tixConvo">
          <button type="button" class="tix-convo-bar" id="tixConvoBar"
            aria-expanded="false" aria-controls="tixConvoPanel" onclick="toggleTicketChat()">
            <span class="tix-convo-ico" aria-hidden="true">${ico('message')}</span>
            <span class="tix-convo-txt">
              <strong>${chatCopy.title}</strong>
              <small>${chatCopy.hint}</small>
            </span>
            <span class="tix-convo-chip is-${chatCopy.tone}">${chatCopy.chip}</span>
            <span class="tix-convo-cta" id="tixConvoCta">Open chat</span>
          </button>

          <div class="tix-convo-panel" id="tixConvoPanel">
            ${tabsHtml}
            <p id="ticketChatSubtitle" class="tix-convo-sub">
              ${isAdmin
                ? 'Staff channel — coordination with the assigned technician. <strong>Customers cannot see this.</strong>'
                : isCustomer
                  ? 'Messages here go to Millennium admin and support only.'
                  : 'Internal coordination with admin. <strong>Customer messages stay separate.</strong>'}
            </p>
            <div id="ticketChatMessages" class="tix-chat-messages">
              <div class="tix-chat-loading">
                <div class="spinner" style="margin:8px auto;"></div>
                Loading messages…
              </div>
            </div>
            <div class="tix-composer">
              <input type="text" id="ticketChatInput" class="form-input"
                placeholder="${inputPlaceholder}"
                aria-label="Message"
                onkeypress="if(event.key==='Enter') sendTicketMessage(${sendChannelAttr})" />
              <button type="button" class="tix-composer-send" onclick="sendTicketMessage(${sendChannelAttr})">
                ${ico('arrow-right')}<span>Send</span>
              </button>
            </div>
          </div>
        </section>

        ${isAdmin ? `
        <section class="tix-sec">
          <h4 class="tix-sec-title">${ico('wrench')} Assign technician</h4>
          <p class="tix-sec-hint">Send this ticket to a field technician for repair.</p>
          <div class="tix-sec-row">
            <select id="assignTechnicianSelect" class="form-select" style="flex:1;">
              <option value="">Select technician…</option>
              ${(state.allUsers || state.users || []).filter(u => u.role === 'technician').map(u =>
                `<option value="${u.id}" ${tck.assignedTechnicianId === u.id ? 'selected' : ''}>${u.fullName} (${u.location})</option>`
              ).join('')}
            </select>
            <button type="button" class="btn btn-primary btn-sm" onclick="assignTicketToTechnician()">
              ${tck.assignedTechnicianId ? 'Reassign' : 'Assign'}
            </button>
          </div>
        </section>` : ''}

        ${(isAdmin || isTechnician) ? `
        <div class="ticket-status-panel">
          <h4 class="ticket-status-title">Update status</h4>
          <p class="ticket-status-hint">
            New tickets land in <strong>New Tickets</strong>. Move one along as the work progresses —
            the lane updates the moment you save.
          </p>
          <div class="ticket-status-actions">
            <button type="button" class="ticket-status-btn${tck.status === 'Diagnosing' ? ' is-current' : ''}"
              onclick="advanceTicketStatus('${tck.id}','Diagnosing')">
              <span class="ticket-status-ico" aria-hidden="true">${ico('search')}</span>
              <span class="ticket-status-text"><strong>Needs diagnosis</strong><span>Investigate the fault</span></span>
            </button>
            <button type="button" class="ticket-status-btn${tck.status === 'Repairing' ? ' is-current' : ''}"
              onclick="advanceTicketStatus('${tck.id}','Repairing')">
              <span class="ticket-status-ico" aria-hidden="true">${ico('settings')}</span>
              <span class="ticket-status-text"><strong>Repair</strong><span>Work in progress</span></span>
            </button>
            <button type="button" class="ticket-status-btn ticket-status-btn--resolve${tck.status === 'Resolved' || tck.status === 'Closed' ? ' is-current' : ''}"
              onclick="advanceTicketStatus('${tck.id}','Resolved')">
              <span class="ticket-status-ico" aria-hidden="true">${ico('check-circle')}</span>
              <span class="ticket-status-text"><strong>Resolved</strong><span>Close the ticket</span></span>
            </button>
          </div>
        </div>

        <section class="tix-sec">
          <h4 class="tix-sec-title">${ico('package')} Consume spare part</h4>
          <p class="tix-sec-hint">Deduct a replacement part from inventory against this ticket.</p>
          <div class="tix-sec-row">
            <select id="ticketPartSelect" class="form-select" style="flex:2;">
              ${state.inventory.map(p => `<option value="${p.id}">${p.name} — ${p.stockQuantity} in stock</option>`).join('')}
            </select>
            <input type="number" id="ticketPartQty" class="form-input tix-qty" value="1" min="1" max="10"
              aria-label="Quantity" />
            <button type="button" class="btn btn-secondary btn-sm" onclick="consumePartForSelectedTicket()">Deduct</button>
          </div>
          ${tck.partsUsed && tck.partsUsed.length > 0 ? `
            <p class="tix-parts-used"><strong>Used:</strong> ${tck.partsUsed.map(p => `${p.quantity}× ${p.partName}`).join(', ')}</p>` : ''}
        </section>` : ''}
      </div>
    `;

    // Nothing polls until the conversation is actually opened.
    stopTicketChatPolling();
    state._activeChatTab = activeChannel;
  }

  if (modal) modal.classList.add('active');
}

/** Open / close the in-ticket conversation panel. */
function toggleTicketChat() {
  const wrap = document.getElementById('tixConvo');
  if (!wrap || !state.selectedTicket) return;

  const willOpen = !wrap.classList.contains('is-open');
  wrap.classList.toggle('is-open', willOpen);

  const bar = document.getElementById('tixConvoBar');
  if (bar) bar.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  const cta = document.getElementById('tixConvoCta');
  if (cta) cta.textContent = willOpen ? 'Hide chat' : 'Open chat';

  if (willOpen) {
    startTicketChatPolling(state.selectedTicket.id);
    setTimeout(() => document.getElementById('ticketChatInput')?.focus(), 80);
  } else {
    stopTicketChatPolling();
  }
}

/** Load the active channel once, then refresh it every 3s while the panel is open. */
function startTicketChatPolling(ticketId) {
  stopTicketChatPolling();
  const channel = state.currentRole === 'customer'
    ? 'customer'
    : (state._activeChatTab || 'staff');
  state._activeChatTab = channel;

  loadTicketMessages(ticketId, false, channel);
  state.ticketChatPollInterval = setInterval(() => {
    if (state.selectedTicket?.id !== ticketId) { stopTicketChatPolling(); return; }
    const live = state.currentRole === 'customer'
      ? 'customer'
      : (state._activeChatTab || 'staff');
    loadTicketMessages(ticketId, true, live);
  }, 3000);
}

function stopTicketChatPolling() {
  if (state.ticketChatPollInterval) {
    clearInterval(state.ticketChatPollInterval);
    state.ticketChatPollInterval = null;
  }
}

function closeTicketDetailModal() {
  const modal = document.getElementById('ticketDetailModal');
  if (modal) modal.classList.remove('active');
  stopTicketChatPolling();
  // The conversation collapses with the modal, so reopening a ticket always
  // starts from the gate rather than silently restoring a live chat panel.
  document.getElementById('tixConvo')?.classList.remove('is-open');
  const bar = document.getElementById('tixConvoBar');
  if (bar) bar.setAttribute('aria-expanded', 'false');
  state.selectedTicket = null;
  state._activeChatTab = 'staff';
}

// Switch between Staff / Customer chat tabs (Admin only)
function switchTicketChatTab(tab, ticketId) {
  if (!state.selectedTicket) return;
  state._activeChatTab = tab;

  const staffBtn    = document.getElementById('tabStaffChat');
  const customerBtn = document.getElementById('tabCustomerChat');
  const subtitle    = document.getElementById('ticketChatSubtitle');
  const input       = document.getElementById('ticketChatInput');

  // Toggle the .is-active class instead of inline styles
  if (tab === 'staff') {
    staffBtn?.classList.add('is-active');
    customerBtn?.classList.remove('is-active');
    staffBtn?.setAttribute('aria-selected', 'true');
    customerBtn?.setAttribute('aria-selected', 'false');
    if (subtitle) subtitle.innerHTML = 'Staff channel — coordination with the assigned technician. <strong>Customers cannot see this.</strong>';
    if (input) input.placeholder = 'Reply to the technician…';
  } else {
    customerBtn?.classList.add('is-active');
    staffBtn?.classList.remove('is-active');
    customerBtn?.setAttribute('aria-selected', 'true');
    staffBtn?.setAttribute('aria-selected', 'false');
    if (subtitle) subtitle.innerHTML = 'Customer support channel — private conversation with the customer. <strong>Technicians cannot see this.</strong>';
    if (input) input.placeholder = 'Reply to the customer…';
  }

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
      showToast(`Ticket assigned to ${technician.fullName}!`, 'success');
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
      <div class="tix-chat-loading">
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
          <div class="tix-chat-empty">
            <span class="tix-chat-emoji">${ico('message')}</span>
            <strong>No messages yet</strong>
            <span>${channel === 'customer'
              ? 'Anything you write here reaches Millennium admin and support.'
              : 'Use this thread to coordinate the repair with admin.'}</span>
          </div>
        `;
      } else {
        const wasScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 45;

        container.innerHTML = messages.map(msg => {
          const isCurrentUser = msg.senderId === state.currentUser?.id;
          const role = msg.senderRole || 'technician';
          const selfClass = isCurrentUser ? 'is-self' : 'is-other';
          const roleLabel = role === 'admin' ? 'Admin' : role === 'customer' ? 'Customer' : 'Technician';

          return `
            <div class="tix-chat-msg ${selfClass}">
              <div class="tix-chat-msg-meta">
                <strong>${isCurrentUser ? 'You' : escapeHtml(msg.senderName)}</strong>
                <span class="tix-chat-role ${role}">${roleLabel}</span>
                <time class="tix-chat-time" datetime="${escapeHtml(msg.createdAt || '')}" title="${escapeHtml(formatShortDate(msg.createdAt))}">${formatTimestamp(msg.createdAt)}</time>
              </div>
              <div class="tix-chat-bubble ${role}">${escapeHtml(msg.message)}</div>
            </div>
          `;
        }).join('');

        if (wasScrolledToBottom || !isSilent) container.scrollTop = container.scrollHeight;
      }
    } else {
      if (!isSilent) {
        container.innerHTML = `<div class="tix-chat-error">${escapeHtml(data.error || 'Failed to load messages')}</div>`;
      }
    }
  } catch (err) {
    if (!isSilent) {
      console.error('Load messages error:', err);
      container.innerHTML = `<div class="tix-chat-error">Network error loading chat</div>`;
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

/**
 * Short, unambiguous date for detail rows: "18 Oct 2026".
 * `toLocaleDateString()` on its own renders 10/18/2026 in the US and 18/10/2026
 * in most of Europe, so the same record read differently depending on the
 * browser's locale — a real problem on a support desk that spans regions.
 */
function formatShortDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
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

/** Close the Restock Shipment dialog (used by every button in it). */
function closeRestockModal() {
  document.getElementById('restockModalOverlay')?.remove();
}

// Restock Inventory Modal
function openRestockModal() {
  const existing = document.getElementById('restockModalOverlay');
  if (existing) existing.remove();

  const inventory = state.inventory || [];

  const overlay = document.createElement('div');
  overlay.id = 'restockModalOverlay';
  overlay.className = 'modal-backdrop';

  overlay.innerHTML = `
    <div class="modal-content modal-form" style="max-width:560px;" role="dialog" aria-modal="true" aria-labelledby="restockModalTitle">
      <div class="modal-header">
        <h3 class="modal-title" id="restockModalTitle">Restock Inventory Shipment</h3>
        <button type="button" class="modal-close" aria-label="Close" onclick="closeRestockModal()">×</button>
      </div>

      <form onsubmit="event.preventDefault(); submitRestockShipment();">
        <div class="form-body">

          <p class="form-hint" style="margin-top:-4px;">
            Record newly arrived parts from suppliers to update live stock levels for
            Millennium SmartBoard service operations.
          </p>

          <div class="seg-tabs" role="tablist" aria-label="Restock mode">
            <button id="tabExistingPart" type="button" class="seg-tab is-active" role="tab"
              aria-selected="true" onclick="toggleRestockMode('existing')">Existing Part</button>
            <button id="tabNewPart" type="button" class="seg-tab" role="tab"
              aria-selected="false" onclick="toggleRestockMode('new')">New Part Catalog</button>
          </div>

          <!-- Restock an existing part -->
          <div id="restockExistingSection" class="form-section">
            <div class="form-section-title">Shipment Details</div>
            <div class="form-group">
              <label class="form-label" for="restockPartSelect">Select Part to Restock *</label>
              <select id="restockPartSelect" class="form-select">
                <option value="">— Select an inventory item (${inventory.length} Available) —</option>
                ${inventory.map(p => `<option value="${p.id}">${p.partCode} — ${p.name} (Current: ${p.stockQuantity} in stock)</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="restockQuantity">Quantity to Add (Shipment Received) *</label>
              <input id="restockQuantity" class="form-input" type="number" min="1" max="1000" value="10" />
              <p class="form-hint">Added to the part's current stock level.</p>
            </div>
          </div>

          <!-- Add a brand-new part to the catalog -->
          <div id="restockNewSection" class="form-section" style="display:none;">
            <div class="form-section-title">New Catalog Entry</div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="newPartCode">Part Code *</label>
                <input id="newPartCode" class="form-input" placeholder="e.g. MSB-OPS-03" />
              </div>
              <div class="form-group">
                <label class="form-label" for="newPartCategory">Category *</label>
                <select id="newPartCategory" class="form-select">
                  <option value="Module">Module</option>
                  <option value="Display">Display</option>
                  <option value="Power">Power</option>
                  <option value="Audio">Audio</option>
                  <option value="Touch">Touch Surface</option>
                  <option value="Accessory">Accessory</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="newPartName">Part Name *</label>
              <input id="newPartName" class="form-input" placeholder="e.g. 4K Camera &amp; Integrated Mic Array" />
            </div>
            <div class="form-row">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="newPartStock">Initial Quantity *</label>
                <input id="newPartStock" class="form-input" type="number" min="1" value="5" />
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" for="newPartThreshold">Min Threshold</label>
                <input id="newPartThreshold" class="form-input" type="number" min="1" value="3" />
              </div>
            </div>
          </div>

          <div id="restockErrorMsg" class="form-error" role="alert" style="display:none;"></div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeRestockModal()">Cancel</button>
          <button type="button" class="btn btn-secondary" onclick="closeRestockModal(); navigateTo('inventory');">View Inventory</button>
          <button type="submit" class="btn btn-primary">Confirm Shipment</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeRestockModal(); });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      closeRestockModal();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

function toggleRestockMode(mode) {
  const existingSection = document.getElementById('restockExistingSection');
  const newSection = document.getElementById('restockNewSection');
  const tabExisting = document.getElementById('tabExistingPart');
  const tabNew = document.getElementById('tabNewPart');
  const errEl = document.getElementById('restockErrorMsg');
  if (errEl) errEl.style.display = 'none';

  const isExisting = mode === 'existing';
  if (existingSection) existingSection.style.display = isExisting ? '' : 'none';
  if (newSection) newSection.style.display = isExisting ? 'none' : '';

  // The segmented control marks the active tab. It no longer swaps
  // .btn-primary / .btn-secondary, which made an inactive tab read as a
  // primary action.
  const setTab = (el, active) => {
    if (!el) return;
    el.classList.toggle('is-active', active);
    el.setAttribute('aria-selected', String(active));
  };
  setTab(tabExisting, isExisting);
  setTab(tabNew, !isExisting);
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
        showToast(`Added +${addQty} units to ${part.name} (Total: ${newTotal})`, 'success');
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
        showToast(`New part "${name}" registered with ${stockQuantity} units!`, 'success');
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
            <h3 style="color: var(--accent-green-text); font-size: 1.15rem; font-weight: 800;">VERIFIED: UNDER WARRANTY </h3>
            <span class="status-pill status-online">${w.daysRemaining} Days Remaining</span>
          </div>
          <div style="font-size: 0.88rem; margin-top: 8px; color: var(--text-primary);">
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
          <h3 style="color: #fb7185; font-size: 1.15rem; font-weight: 800;">WARRANTY EXPIRED OR NOT FOUND </h3>
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

/* -------------------------------------------------------------------------
   Inventory card actions — restock by one, and edit the unit cost inline
   ------------------------------------------------------------------------- */

/**
 * Add exactly one unit to a part.
 *
 * The server increments in SQL rather than accepting an absolute quantity, so
 * two admins tapping at the same moment both land and a stale card can never
 * push the count backwards. Only the grid is repainted, which keeps the page
 * scroll position where the user left it.
 *
 * The button is deliberately NOT disabled while the request is in flight: this
 * is a counter, so tapping it three times quickly must add three units. Losing
 * a tap because the previous response had not arrived yet would read as a bug.
 * The server is atomic, and the state merge below keeps the display monotonic
 * even if the responses come back out of order.
 */
async function restockOne(partId) {
  try {
    const res = await fetch(`${API_BASE}/inventory/${partId}/restock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1 }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not restock this part.');

    const idx = (state.inventory || []).findIndex((p) => p.id === partId);
    // An older snapshot must never lower the number on screen.
    if (idx >= 0 && data.data.stockQuantity >= state.inventory[idx].stockQuantity) {
      state.inventory[idx] = data.data;
    }
    refreshInventoryGrid();
    showToast(`+1 unit — ${data.data.name} is now at ${data.data.stockQuantity}.`, 'success');
  } catch (err) {
    showToast(err.message || 'Could not restock this part.', 'error');
  }
}

/** Swap the unit-cost display for an inline editor. */
function editPartPrice(partId) {
  const part = (state.inventory || []).find((p) => p.id === partId);
  const host = document.querySelector(`.inv-price-host[data-price-for="${partId}"]`);
  if (!part || !host || host.classList.contains('is-editing')) return;

  // The editor needs the full card width, so the card switches to edit mode and
  // the footer collapses to one column (see .is-editing-price in the stylesheet).
  host.closest('.inv-card')?.classList.add('is-editing-price');
  host.classList.add('is-editing');
  host.innerHTML = `<form class="inv-price-form" onsubmit="event.preventDefault(); savePartPrice('${partId}')">
      <span class="inv-price-cur" aria-hidden="true">₱</span>
      <input class="inv-price-input" id="invPriceInput" type="number" min="0" step="0.01"
        inputmode="decimal" value="${Number(part.unitCost) || 0}"
        aria-label="Unit cost for ${escapeHtml(part.name)}"
        onkeydown="handlePartPriceKey(event, '${partId}')" />
      <button type="submit" class="inv-price-save" title="Save price" aria-label="Save price"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-check"></use></svg></button>
      <button type="button" class="inv-price-cancel" title="Cancel" aria-label="Cancel"
        onclick="cancelPartPrice('${partId}')"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x"></use></svg></button>
    </form>`;

  const input = document.getElementById('invPriceInput');
  if (input) {
    input.focus();
    input.select();
  }
}

/** Escape backs out of the editor; Enter is handled by the form's submit. */
function handlePartPriceKey(event, partId) {
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelPartPrice(partId);
  }
}

function cancelPartPrice() {
  refreshInventoryGrid();
}

async function savePartPrice(partId) {
  const input = document.getElementById('invPriceInput');
  if (!input) return;

  const raw = String(input.value).trim();
  const value = Number(raw);
  if (raw === '' || !Number.isFinite(value) || value < 0) {
    showToast('Enter a unit cost of 0 or more.', 'error');
    input.focus();
    return;
  }

  const saveBtn = document.querySelector('.inv-price-save');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/inventory/${partId}/price`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitCost: value }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not save the price.');

    const idx = (state.inventory || []).findIndex((p) => p.id === partId);
    if (idx >= 0) state.inventory[idx] = data.data;
    refreshInventoryGrid();
    showToast(`Unit cost updated to ₱${formatUnitCost(data.data.unitCost)}.`, 'success');
  } catch (err) {
    showToast(err.message || 'Could not save the price.', 'error');
    if (saveBtn) saveBtn.disabled = false;
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
      ${schools.length > 0 ? `<optgroup label="Schools & Universities (${schools.length})">
        ${schools.map(c => `<option value="${c.id}">${c.organizationName} — ${c.city || 'Metro Manila'}</option>`).join('')}
      </optgroup>` : ''}
      ${corporates.length > 0 ? `<optgroup label="Corporate Clients (${corporates.length})">
        ${corporates.map(c => `<option value="${c.id}">${c.organizationName} — ${c.city || 'Metro Manila'}</option>`).join('')}
      </optgroup>` : ''}
      <option value="__custom__">Register New Customer Organization...</option>
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
    showToast(`${state.customers.length} customer organizations loaded successfully`, 'info');
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
    showToast('Enter a new customer organization name to register', 'info');
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
        showToast(`Selected: ${cust.organizationName} (${cust.clientType === 'school' ? 'School' : 'Corporate'})`, 'success');
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
      showToast(`SmartBoard ${data.data.id} registered and connected to ${data.data.customerName}!`, 'success');
      closeRegisterModal();
      await fetchAllData();
    } else {
      showToast(`${data.error || 'Failed to register device.'}`, 'error');
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
    updateScannerStatus('Scanner library failed to load (offline?).', 'error');
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
    updateScannerStatus('Scanning... Point camera at QR code or barcode' + camLabel, 'scanning');
    
  } catch (err) {
    console.error('Failed to start scanner:', err);
    const friendly = describeCameraError(err);
    updateScannerStatus('' + friendly, 'error');
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
  updateScannerStatus('Code detected! Validating warranty...', 'success');

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
    scanning: '',
    success: '',
    error: '',
  };
  
  const icon = iconMap[type] || '';
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
      statusDiv.innerHTML = '<span style="color: var(--danger);">That file is not an image.</span>';
    }
    return;
  }

  // Check file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    showToast('Image file is too large. Maximum size is 10MB', 'error');
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--danger);">Image is larger than 10MB.</span>';
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
      statusDiv.innerHTML = '<span style="color: var(--danger);">Could not read that image file.</span>';
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
      statusDiv.innerHTML = '<span style="color: var(--danger);">Scanner library failed to load (offline?). Type the serial number instead.</span>';
    }
    showToast('Scanner library unavailable. Check your connection, or type the serial number manually.', 'error');
    return;
  }

  // Update status
  if (statusDiv) {
    statusDiv.innerHTML = '<span style="color: var(--primary);">Scanning image for barcode...</span>';
  }

  const imageFile = document.getElementById('barcodeImageInput')?.files?.[0] || null;
  const decode = await decodeBarcodeFromImage(uploadedImage.src, imageFile);

  if (decode.text) {
    if (statusDiv) {
      statusDiv.innerHTML = '<span style="color: var(--success);">Barcode detected! Validating warranty...</span>';
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
    statusDiv.innerHTML = '<span style="color: var(--danger);">No barcode detected in image. Try a clearer image or use camera scanner.</span>';
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
        <div style="font-size: 3rem; margin-bottom: 10px;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-x-circle"></use></svg></div>
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
  let statusIcon = '';
  
  if (daysRemaining < 0) {
    status = 'Warranty Expired';
    statusColor = 'error';
    statusIcon = '';
  } else if (daysRemaining <= 30) {
    status = 'Expiring Soon';
    statusColor = 'warning';
    statusIcon = '';
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
          Device Information
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
          Warranty Coverage
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
          ${ico('clock')} Warranty Timeline
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
              <strong>Warranty is active.</strong> Device is covered for repairs and replacements.
            </p>
          </div>
        ` : `
          <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; margin-top: 15px;">
            <p style="font-size: 0.85rem; color: var(--error); margin: 0;">
              <strong>Warranty has expired.</strong> Service may require payment. Contact support for renewal options.
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
        <div style="font-size: 4rem; margin-bottom: 15px;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-search"></use></svg></div>
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
        <div style="font-size: 4rem; margin-bottom: 15px;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-alert"></use></svg></div>
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

    const svgEl = document.getElementById('warrantyBarcode');

    JsBarcode('#warrantyBarcode', barcodeValue, {
      format: 'CODE128',
      width: 1.6,
      height: 62,
      displayValue: true,
      fontSize: 13,
      fontOptions: 'bold',
      textMargin: 5,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });

    // JsBarcode emits fixed pixel width/height and no viewBox, so a long serial
    // silently overflowed the sticker (and got clipped by the card's padding)
    // instead of shrinking. Adding a viewBox makes the SVG scale to its box.
    if (svgEl) {
      const w = Number(svgEl.getAttribute('width')) || svgEl.getBBox?.().width || 0;
      const h = Number(svgEl.getAttribute('height')) || 0;
      if (w && h && !svgEl.getAttribute('viewBox')) {
        svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
      }
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
      svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }

    const today = new Date();
    const expiryDate = new Date(warranty.expiryDate);
    const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);

    // One state machine for the pill: the old code carried an emoji icon plus a
    // colour, which meant the same contract could read "green" in the summary
    // and "amber" in the detail list.
    let stateLabel = 'Active';
    let stateClass = 'is-active';
    if (daysRemaining < 0) {
      stateLabel = 'Expired';
      stateClass = 'is-expired';
    } else if (daysRemaining <= 30) {
      stateLabel = 'Expiring soon';
      stateClass = 'is-soon';
    }

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('barcodeWarrantyTitle', `Contract ${warranty.id}`);
    // The coverage type has its own row below — repeating it here made the
    // heading read the same sentence twice.
    setText('barcodeWarrantySubtitle', warranty.status || 'Warranty coverage');
    setText('barcodeDeviceId', device.id || '—');
    setText('barcodeDeviceInfo', [device.model, device.customerName].filter(Boolean).join(' · '));

    const pill = document.getElementById('barcodeStatusPill');
    if (pill) {
      pill.textContent = stateLabel;
      pill.className = `bc-state ${stateClass}`;
    }

    const rows = [
      ['Coverage', warranty.coverageType || '—'],
      ['Purchased', formatShortDate(warranty.purchaseDate)],
      ['Expires', formatShortDate(warranty.expiryDate)],
      ['Remaining', daysRemaining < 0 ? 'Expired' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`],
      ['Serial', device.serialNumber || '—'],
      ['Location', [device.location, device.city].filter(Boolean).join(', ') || '—'],
    ];

    const details = document.getElementById('barcodeWarrantyDetails');
    if (details) {
      details.innerHTML = rows.map(([label, value], index) => `
        <div class="bc-row${index === 3 && daysRemaining < 0 ? ' is-alert' : ''}">
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(String(value))}</dd>
        </div>`).join('');
    }
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
  const displayStatuses = (state.devices || []).map(getDeviceDisplayStatus);
  const onlineDevices   = displayStatuses.filter(status => status === 'online').length;
  const offlineDevices  = displayStatuses.filter(status => status === 'offline').length;
  const problemDevices  = displayStatuses.filter(status => status === 'warning').length;
  const pendingRepairs  = displayStatuses.filter(status => status === 'maintenance').length;
  const totalDevices    = displayStatuses.length;
  const fleetHealthScore = totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0;
  const csvContent = `MILLENNIUM SMARTBOARD SYSTEM - EXECUTIVE REPORT
Generated: ${new Date().toLocaleString()}
Online Devices: ${onlineDevices}
Offline Devices: ${offlineDevices}
Devices with Problems: ${problemDevices}
Pending Repairs: ${pendingRepairs}
Total Units Sold: ${s.unitsSold}
Partner Schools: ${s.schoolsCount}
Corporate Clients: ${s.corporateCount}
Fleet Health Score: ${fleetHealthScore}%
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
        <h1 class="page-title">Device Rental Scheduling</h1>
        <p class="page-description">Manage device rentals, bookings, deliveries, and returns for the Millennium SmartBoard.</p>
      </div>
      <div class="page-actions">
        ${isAdmin || isCustomer ? `<button class="btn btn-primary" onclick="openRentalModal()">New Booking</button>` : ''}
        <button class="btn btn-secondary" onclick="toggleRentalViewMode()">
          ${state.rentalViewMode === 'list' ? 'Calendar View' : 'List View'}
        </button>
      </div>
    </div>

    <!-- Rental Stats Cards.
         .rentals-stats overrides the generic auto-fit track: there are five
         KPIs, and a 220px minimum only fits four per row at desktop width,
         which stranded the Revenue card alone on a second row. -->
    <div class="stat-cards-grid rentals-stats">
      <div class="stat-card card-online">
        <div class="stat-header">
          <span class="ticket-id">Active Rentals</span>
          <span class="status-pill status-online">Active</span>
        </div>
        <div class="rental-kpi-value">${activeCount}</div>
        <div class="rental-kpi-label">Devices currently rented out</div>
      </div>

      <div class="stat-card card-warning">
        <div class="stat-header">
          <span class="ticket-id">Pending</span>
          <span class="status-pill status-warning">Pending</span>
        </div>
        <div class="rental-kpi-value">${pendingCount}</div>
        <div class="rental-kpi-label">Awaiting approval</div>
      </div>

      <div class="stat-card ${overdueCount > 0 ? 'card-offline' : 'card-online'}">
        <div class="stat-header">
          <span class="ticket-id">Overdue</span>
          <span class="status-pill ${overdueCount > 0 ? 'status-offline' : 'status-online'}">${overdueCount > 0 ? 'Overdue' : 'OK'}</span>
        </div>
        <div class="rental-kpi-value">${overdueCount}</div>
        <div class="rental-kpi-label">Past return date</div>
      </div>

      <div class="stat-card card-online">
        <div class="stat-header">
          <span class="ticket-id">Upcoming</span>
          <span class="status-pill status-online">Soon</span>
        </div>
        <div class="rental-kpi-value">${upcomingCount}</div>
        <div class="rental-kpi-label">Scheduled deliveries</div>
      </div>

      ${isAdmin ? `
      <div class="stat-card card-online">
        <div class="stat-header">
          <span class="ticket-id">Revenue</span>
          <span class="status-pill status-online">Total</span>
        </div>
        <div class="rental-kpi-value"><span class="currency-symbol">₱</span>${(stats.revenue || 0).toLocaleString()}</div>
        <div class="rental-kpi-label">From active &amp; returned rentals</div>
      </div>
      ` : ''}
    </div>

    ${state.rentalViewMode === 'calendar' ? renderRentalCalendar(rentals) : renderRentalList(rentals, isAdmin)}
  `;
}

// --- Rental List View ---
function renderRentalList(rentals, isAdmin) {
  const STATUSES = ['Pending', 'Approved', 'Active', 'Returned', 'Overdue', 'Cancelled'];
  const all = getVisibleRentals();
  const activeFilter = state.rentalFilterStatus || '';

  // A filter chip bar rather than a bare <select>: the counts make it obvious
  // where the work is (e.g. 2 pending approvals) before you click anything, and
  // it matches the chip bar used on the Data Manager and Directory screens.
  const chip = (value, label, count) => {
    const active = activeFilter === value;
    return `<button type="button" class="dm-filter-chip${active ? ' is-active' : ''}"
      onclick="setRentalFilter('${value}')" aria-pressed="${active}">${label} <strong>${count}</strong></button>`;
  };

  const filterBar = `
    <div class="glass-panel rental-filter-bar">
      <div class="dm-filter-bar">
        ${chip('', 'All rentals', all.length)}
        ${STATUSES.map(s => {
          const n = all.filter(r => r.status === s).length;
          return n > 0 || activeFilter === s ? chip(s, s, n) : '';
        }).join('')}
      </div>
      <span class="rental-filter-count">${rentals.length} of ${all.length} shown</span>
    </div>`;

  if (rentals.length === 0) {
    // Two genuinely different situations: nothing booked at all, versus a filter
    // that happens to match nothing. Telling the user which one it is saves them
    // wondering whether the data is missing.
    const filtered = !!activeFilter;
    return `
      ${filterBar}
      <div class="glass-panel rental-empty">
        <div class="rental-empty-ico" aria-hidden="true"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-calendar"></use></svg></div>
        <h3 class="rental-empty-title">${filtered ? `No ${activeFilter.toLowerCase()} bookings` : 'No bookings yet'}</h3>
        <p class="rental-empty-text">
          ${filtered
            ? `Nothing matches the “${activeFilter}” filter.`
            : isAdmin
              ? 'Schedule the first device rental to see it appear here.'
              : 'Once a booking is made for your organization it will show up here.'}
        </p>
        ${(isAdmin || state.currentRole === 'customer') ? `
          <div class="rental-empty-actions">
            ${filtered ? `<button type="button" class="btn btn-secondary" onclick="setRentalFilter('')">Clear filter</button>` : ''}
            <button type="button" class="btn btn-primary" onclick="openRentalModal()">New booking</button>
          </div>` : ''}
      </div>
    `;
  }

  return `
    ${filterBar}

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
              ${isAdmin ? '<th class="col-actions">Actions</th>' : ''}
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
              const priorityClass = r.priority === 'High' ? 'is-high'
                                  : r.priority === 'Medium' ? 'is-medium'
                                  : 'is-low';

              return `
                <tr style="cursor:pointer;" onclick="viewRentalDetail('${r.id}')">
                  <td><span class="ticket-id">${r.rentalNumber}</span></td>
                  <td><strong>${escapeHtml(r.customerName || '—')}</strong></td>
                  <td>${escapeHtml(r.deviceModel || '—')}<br><span class="rental-sub">${escapeHtml(r.serialNumber || '')}</span></td>
                  <td>
                    <div class="rental-period">${formatDate(r.startDate)} → ${formatDate(r.endDate)}</div>
                    <div class="rental-sub">${days} day${days === 1 ? '' : 's'}</div>
                  </td>
                  <td><strong><span class="currency-symbol">₱</span>${r.totalCost.toLocaleString()}</strong><br><span class="rental-sub"><span class="currency-symbol">₱</span>${r.dailyRate}/day</span></td>
                  <td><span class="status-pill ${statusClass}">${r.status}</span></td>
                  <td><span class="rental-priority ${priorityClass}">${escapeHtml(r.priority || '—')}</span></td>
                  ${isAdmin ? `
                  <td class="col-actions" onclick="event.stopPropagation();">
                    <div class="dm-actions">
                      ${r.status === 'Pending' ? `<button class="action-btn action-btn-ok" title="Approve this booking" aria-label="Approve booking" onclick="approveRental('${r.id}')"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-check"></use></svg></button>` : ''}
                      ${r.status === 'Approved' ? `<button class="action-btn action-btn-go" title="Activate — mark as rented out" aria-label="Activate booking" onclick="activateRental('${r.id}')">${ico('play')}</button>` : ''}
                      ${r.status === 'Active' ? `<button class="action-btn" title="Mark as returned" aria-label="Return device" onclick="returnRental('${r.id}')">${ico('undo')}</button>` : ''}
                      <button class="action-btn" title="Edit booking" aria-label="Edit booking" onclick="editRental('${r.id}')"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-pencil"></use></svg></button>
                    </div>
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
        <button class="btn btn-secondary btn-sm" onclick="changeRentalMonth(-1)">${ico('chevron-left')} Prev</button>
        <h3 style="font-size:1.15rem;font-weight:800;">${monthNames[month]} ${year}</h3>
        <button class="btn btn-secondary btn-sm" onclick="changeRentalMonth(1)">Next ${ico('chevron-right')}</button>
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
          ${editing ? 'Edit Rental Booking' : 'New Device Rental Booking'}
        </h3>
        <button type="button" class="modal-close" aria-label="Close"
          onclick="document.getElementById('rentalModalOverlay').remove()">×</button>
      </div>

      <form id="rentalForm" onsubmit="submitRentalForm(event, '${rentalId || ''}')">
        <div class="form-body">

          <section class="form-section">
            <div class="form-section-title">Booking Details</div>
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
            <div class="form-section-title">Schedule</div>
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
            <div class="form-section-title">Pricing</div>
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
            <div class="form-section-title">Pricing</div>
            <div class="form-hint" style="margin-top:0;">
              The daily rate and deposit are set by our admin team after your booking is reviewed.
              You will be notified once it is approved.
            </div>
          </section>
          `}

          <section class="form-section">
            <div class="form-section-title">Delivery &amp; Contact</div>
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
            <div class="form-section-title">Notes</div>
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
            ${editing ? 'Update Booking' : 'Create Booking'}
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
      showToast(`Rental ${rentalId ? 'updated' : 'created'} successfully!`, 'success');
      document.getElementById('rentalModalOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`${json.error}`, 'error');
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
            <div class="detail-tile-value" style="font-size:1.15rem;"><span class="currency-symbol">₱</span>${Number(rental.totalCost || 0).toLocaleString()}</div>
            <div class="detail-tile-sub"><span class="currency-symbol">₱</span>${Number(rental.dailyRate || 0).toLocaleString()}/day + <span class="currency-symbol">₱</span>${Number(rental.depositAmount || 0).toLocaleString()} deposit</div>
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
            <div class="detail-tile-label" style="color:#22c55e;">Device Returned</div>
            <div class="detail-tile-value">Return Date: ${formatDate(rental.actualReturnDate)}</div>
          </div>
        ` : ''}
      </div>

      ${isAdmin ? `
        <div class="modal-footer" style="flex-wrap:wrap;justify-content:flex-end;">
          ${rental.status === 'Pending' ? `<button class="btn btn-success btn-sm" onclick="approveRental('${esc(rental.id)}')">Approve</button>` : ''}
          ${rental.status === 'Approved' ? `<button class="btn btn-primary btn-sm" onclick="activateRental('${esc(rental.id)}')">${ico('play')} Activate</button>` : ''}
          ${rental.status === 'Active' ? `<button class="btn btn-secondary btn-sm" onclick="returnRental('${esc(rental.id)}')">${ico('undo')} Mark Returned</button>` : ''}
          ${rental.status === 'Active' ? `<button class="btn btn-warning btn-sm" onclick="markOverdue('${esc(rental.id)}')">Mark Overdue</button>` : ''}
          ${(rental.status === 'Pending' || rental.status === 'Approved') ? `<button class="btn btn-secondary btn-sm" onclick="cancelRental('${esc(rental.id)}')">Cancel</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="editRental('${esc(rental.id)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRental('${esc(rental.id)}')">Delete</button>
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
      showToast('Rental approved.', 'success');
      document.getElementById('rentalDetailOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`${data.error}`, 'error');
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
      showToast('Rental activated. Device is now rented out.', 'success');
      document.getElementById('rentalDetailOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`${data.error}`, 'error');
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
          showToast('Rental marked as returned.', 'success');
          document.getElementById('rentalDetailOverlay')?.remove();
          await fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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
      showToast('Rental marked as overdue.', 'warning');
      document.getElementById('rentalDetailOverlay')?.remove();
      await fetchAllData();
    } else {
      showToast(`${data.error}`, 'error');
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
          showToast('Rental cancelled.', 'info');
          document.getElementById('rentalDetailOverlay')?.remove();
          await fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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
          showToast(`Rental ${rental.rentalNumber} deleted.`, 'success');
          document.getElementById('rentalDetailOverlay')?.remove();
          await fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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
      <div style="font-size:2.5rem;margin-bottom:12px;"><svg class="ico" aria-hidden="true" focusable="false"><use href="#i-trash"></use></svg></div>
      <h3 style="font-size:1.15rem;font-weight:800;color:#f43f5e;margin-bottom:10px;">Confirm Deletion</h3>
      <p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:24px;line-height:1.5;">${message}</p>
      <div class="modal-footer" style="border-top:none;background:transparent;padding:0;justify-content:center;">
        <button type="button" id="deleteCancelBtn" class="btn btn-secondary">Cancel</button>
        <button type="button" id="deleteConfirmBtn" class="btn btn-primary"
          style="background:linear-gradient(135deg,#f43f5e,#dc2626);box-shadow:0 4px 15px rgba(244,63,94,0.4);">
          Delete Permanently
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
          showToast(`Device ${id} deleted successfully.`, 'success');
          await fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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
          showToast(`Ticket ${tck.ticketNumber} deleted.`, 'success');
          await fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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
          showToast(`Part "${part.name}" deleted from inventory.`, 'success');
          await fetchAllData();
        } else {
          showToast(`${data.error}`, 'error');
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

  // The Light-mode pill lives inside Settings now. Its knob position and
  // highlight are synced here so the pill and the document can never disagree,
  // whichever of them triggered the change.
  const pill = document.getElementById('settingsThemeToggle');
  if (pill) {
    const isLight = theme === 'light';
    pill.classList.toggle('is-on', isLight);
    pill.setAttribute('aria-checked', isLight ? 'true' : 'false');
    pill.setAttribute('aria-label', isLight ? 'Light mode is on — switch to dark' : 'Light mode is off — switch to light');
  }
}

/** Flip the theme from the Settings pill. */
function toggleThemeFromSettings() {
  const isLight = document.documentElement.getAttribute('data-theme') !== 'dark';
  setThemeFromSettings(isLight ? 'dark' : 'light');
}

/** Apply a specific theme from the Settings dialog's Light-mode pill. */
function setThemeFromSettings(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  applyTheme(theme);
  showToast(`Switched to ${theme === 'dark' ? 'Dark Mode' : 'Light Mode'}`, 'info');
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  showToast(`Switched to ${newTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}`, 'info');
}

/* ==========================================================================
   PER-ACCOUNT USER PREFERENCES
   ==========================================================================
   Notification and accessibility choices are stored per user id, so two people
   signing in on the same browser never inherit each other's settings. They are
   purely local display preferences — the server still decides what a role is
   allowed to see, so nothing here can widen access.
   ========================================================================== */

const PREFS_DEFAULTS = {
  notifyTickets: true,
  notifyMessages: true,
  notifyStock: true,
  showBadge: true,
  reduceMotion: false,
  compact: false,
  largeText: false,
};

const PREFS_ALLOWED = Object.keys(PREFS_DEFAULTS);

function prefsStorageKey(userId) {
  return `millennium-prefs-${userId || 'anonymous'}`;
}

/** Read this account's preferences, merged over the defaults. */
function getUserPrefs(userId) {
  const id = userId || state.currentUser?.id;
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(prefsStorageKey(id)) || '{}') || {};
  } catch {
    stored = {};
  }
  const out = { ...PREFS_DEFAULTS };
  PREFS_ALLOWED.forEach((key) => {
    if (typeof stored[key] === 'boolean') out[key] = stored[key];
  });
  return out;
}

/** Persist one preference and apply the display side-effects immediately. */
function setUserPref(key, value) {
  if (!PREFS_ALLOWED.includes(key)) return;
  const id = state.currentUser?.id;
  const prefs = getUserPrefs(id);
  prefs[key] = !!value;
  try {
    localStorage.setItem(prefsStorageKey(id), JSON.stringify(prefs));
  } catch {
    // Storage can be full or blocked; the in-memory result still applies.
  }
  applyUserPrefs(prefs);
  renderNotifications();
}

/**
 * Reflect accessibility preferences onto <html> as data attributes. The CSS
 * does the rest, which keeps every view consistent without touching render
 * functions one by one.
 */
function applyUserPrefs(prefs) {
  const p = prefs || getUserPrefs();
  const root = document.documentElement;
  root.setAttribute('data-reduce-motion', p.reduceMotion ? 'on' : 'off');
  root.setAttribute('data-density', p.compact ? 'compact' : 'comfortable');
  root.setAttribute('data-text-size', p.largeText ? 'large' : 'normal');
}

/** Download a JSON snapshot of the signed-in account and its local preferences. */
function downloadMyAccountData() {
  const me = state.currentUser || {};
  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      id: me.id,
      username: me.username,
      fullName: me.fullName,
      email: me.email,
      role: me.role,
      organization: me.organization || null,
      location: me.location || null,
      createdAt: me.createdAt || null,
    },
    preferences: getUserPrefs(me.id),
    theme: localStorage.getItem('millennium-theme') || 'dark',
  };

  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `millennium-account-${me.username || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Account data downloaded', 'success');
  } catch (err) {
    console.error('Export failed:', err);
    showToast('Could not export account data', 'error');
  }
}

/** Restore notification and accessibility defaults for this account. */
function resetMyPreferences() {
  const id = state.currentUser?.id;
  try {
    localStorage.removeItem(prefsStorageKey(id));
  } catch {
    // Ignore storage failures — applying defaults below is still correct.
  }
  const defaults = { ...PREFS_DEFAULTS };
  applyUserPrefs(defaults);
  renderNotifications();
  showToast('Preferences reset to defaults', 'info');

  // Keep the open dialog in step with the reset.
  document.querySelectorAll('[data-pref-toggle]').forEach((btn) => {
    const on = !!defaults[btn.dataset.prefToggle];
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
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

  // Accessibility preferences (reduced motion, density, text size) are stored
  // per account but must be on <html> before the first view renders.
  applyUserPrefs();

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
    // Re-apply now that the account id is known, so the correct per-account
    // preferences are used instead of the anonymous defaults.
    applyUserPrefs();
    fetchAllData();
  } else {
    // Show login overlay, don't load data yet
    showAuthOverlay();
  }

  // Sync the register form with its default Account Type so the organization
  // label and the Client Category selector start out consistent with the
  // pre-selected role instead of showing the markup's static defaults.
  updateRegLocationLabel(document.getElementById('regRole')?.value);

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
