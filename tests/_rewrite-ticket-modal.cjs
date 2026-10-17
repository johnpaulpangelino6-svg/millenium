// Replaces openTicketDetailModal() in public/js/app.js with the restructured
// ticket view: summary card -> collapsible conversation -> admin actions.
const fs = require('fs');

const FILE = 'public/js/app.js';
const src = fs.readFileSync(FILE, 'utf8');

const START = 'function openTicketDetailModal(ticketId) {';
const END = 'function closeTicketDetailModal() {';
const i = src.indexOf(START);
const j = src.indexOf(END);
if (i < 0 || j < 0 || j < i) throw new Error('anchors not found');

const replacement = `function openTicketDetailModal(ticketId) {
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

  if (title) title.textContent = \`Ticket \${tck.ticketNumber}\`;

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

    const tabsHtml = isAdmin ? \`
      <div class="tix-chat-tabs" role="tablist" aria-label="Conversation channel">
        <button type="button" id="tabStaffChat" role="tab" class="tix-chat-tab is-active"
          onclick="switchTicketChatTab('staff','\${tck.id}')">Staff channel</button>
        <button type="button" id="tabCustomerChat" role="tab" class="tix-chat-tab"
          onclick="switchTicketChatTab('customer','\${tck.id}')">Customer support</button>
      </div>\` : '';

    const fact = (label, valueHtml) =>
      \`<div class="tix-fact"><dt>\${label}</dt><dd>\${valueHtml}</dd></div>\`;

    body.innerHTML = \`
      <div class="tix-modal">

        <!-- Summary -->
        <section class="tix-sum">
          <div class="tix-sum-head">
            <div class="tix-sum-copy">
              <h3>\${escapeHtml(tck.title)}</h3>
              <p>\${escapeHtml(tck.description)}</p>
            </div>
            <span class="tix-status-chip is-\${String(tck.status || '').toLowerCase().replace(/[^a-z]+/g, '-')}">
              \${escapeHtml(ticketStatusLabel(tck.status))}
            </span>
          </div>

          <dl class="tix-facts">
            \${fact('Device', \`<span class="tix-mono">\${escapeHtml(tck.deviceId)}</span><small>\${escapeHtml(tck.deviceModel || '')}</small>\`)}
            \${fact('Customer', escapeHtml(tck.customerName))}
            \${fact('Priority', \`<span class="tix-pri is-\${String(tck.priority || '').toLowerCase()}">\${escapeHtml(tck.priority || '—')}</span>\`)}
            \${fact('Warranty', tck.warrantyCovered
              ? '<span class="tix-flag is-ok">' + ico('shield') + ' Covered</span>'
              : '<span class="tix-flag is-off">' + ico('shield') + ' Not covered</span>')}
            \${fact('Assigned to', escapeHtml(tck.assignedTechnician || 'Unassigned'))}
            \${fact('Logged', escapeHtml(formatShortDate(tck.createdAt)))}
          </dl>
        </section>

        <!-- Conversation (collapsed until opened) -->
        <section class="tix-convo" id="tixConvo">
          <button type="button" class="tix-convo-bar" id="tixConvoBar"
            aria-expanded="false" aria-controls="tixConvoPanel" onclick="toggleTicketChat()">
            <span class="tix-convo-ico" aria-hidden="true">\${ico('message')}</span>
            <span class="tix-convo-txt">
              <strong>\${chatCopy.title}</strong>
              <small>\${chatCopy.hint}</small>
            </span>
            <span class="tix-convo-chip is-\${chatCopy.tone}">\${chatCopy.chip}</span>
            <span class="tix-convo-cta" id="tixConvoCta">Open chat</span>
          </button>

          <div class="tix-convo-panel" id="tixConvoPanel">
            \${tabsHtml}
            <p id="ticketChatSubtitle" class="tix-convo-sub">
              \${isAdmin
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
                placeholder="\${inputPlaceholder}"
                aria-label="Message"
                onkeypress="if(event.key==='Enter') sendTicketMessage(\${sendChannelAttr})" />
              <button type="button" class="tix-composer-send" onclick="sendTicketMessage(\${sendChannelAttr})">
                \${ico('arrow-right')}<span>Send</span>
              </button>
            </div>
          </div>
        </section>

        \${isAdmin ? \`
        <section class="tix-sec">
          <h4 class="tix-sec-title">\${ico('wrench')} Assign technician</h4>
          <p class="tix-sec-hint">Send this ticket to a field technician for repair.</p>
          <div class="tix-sec-row">
            <select id="assignTechnicianSelect" class="form-select" style="flex:1;">
              <option value="">Select technician…</option>
              \${(state.allUsers || state.users || []).filter(u => u.role === 'technician').map(u =>
                \`<option value="\${u.id}" \${tck.assignedTechnicianId === u.id ? 'selected' : ''}>\${u.fullName} (\${u.location})</option>\`
              ).join('')}
            </select>
            <button type="button" class="btn btn-primary btn-sm" onclick="assignTicketToTechnician()">
              \${tck.assignedTechnicianId ? 'Reassign' : 'Assign'}
            </button>
          </div>
        </section>\` : ''}

        \${(isAdmin || isTechnician) ? \`
        <div class="ticket-status-panel">
          <h4 class="ticket-status-title">Update status</h4>
          <p class="ticket-status-hint">
            New tickets land in <strong>New Tickets</strong>. Move one along as the work progresses —
            the lane updates the moment you save.
          </p>
          <div class="ticket-status-actions">
            <button type="button" class="ticket-status-btn\${tck.status === 'Diagnosing' ? ' is-current' : ''}"
              onclick="advanceTicketStatus('\${tck.id}','Diagnosing')">
              <span class="ticket-status-ico" aria-hidden="true">\${ico('search')}</span>
              <span class="ticket-status-text"><strong>Needs diagnosis</strong><span>Investigate the fault</span></span>
            </button>
            <button type="button" class="ticket-status-btn\${tck.status === 'Repairing' ? ' is-current' : ''}"
              onclick="advanceTicketStatus('\${tck.id}','Repairing')">
              <span class="ticket-status-ico" aria-hidden="true">\${ico('settings')}</span>
              <span class="ticket-status-text"><strong>Repair</strong><span>Work in progress</span></span>
            </button>
            <button type="button" class="ticket-status-btn ticket-status-btn--resolve\${tck.status === 'Resolved' || tck.status === 'Closed' ? ' is-current' : ''}"
              onclick="advanceTicketStatus('\${tck.id}','Resolved')">
              <span class="ticket-status-ico" aria-hidden="true">\${ico('check-circle')}</span>
              <span class="ticket-status-text"><strong>Resolved</strong><span>Close the ticket</span></span>
            </button>
          </div>
        </div>

        <section class="tix-sec">
          <h4 class="tix-sec-title">\${ico('package')} Consume spare part</h4>
          <p class="tix-sec-hint">Deduct a replacement part from inventory against this ticket.</p>
          <div class="tix-sec-row">
            <select id="ticketPartSelect" class="form-select" style="flex:2;">
              \${state.inventory.map(p => \`<option value="\${p.id}">\${p.name} — \${p.stockQuantity} in stock</option>\`).join('')}
            </select>
            <input type="number" id="ticketPartQty" class="form-input tix-qty" value="1" min="1" max="10"
              aria-label="Quantity" />
            <button type="button" class="btn btn-secondary btn-sm" onclick="consumePartForSelectedTicket()">Deduct</button>
          </div>
          \${tck.partsUsed && tck.partsUsed.length > 0 ? \`
            <p class="tix-parts-used"><strong>Used:</strong> \${tck.partsUsed.map(p => \`\${p.quantity}× \${p.partName}\`).join(', ')}</p>\` : ''}
        </section>\` : ''}
      </div>
    \`;

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

`;

fs.writeFileSync(FILE, src.slice(0, i) + replacement + src.slice(j));
console.log('replaced', j - i, 'chars with', replacement.length);
