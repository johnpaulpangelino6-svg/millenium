// ==========================================================================
// UI MANAGER - User Interface Controller (OOP)
// ==========================================================================

class UIManager {
  constructor(stateManager) {
    this.state = stateManager;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast-message');
    if (!toast) return;

    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#0284c7',
    };

    toast.textContent = message;
    toast.style.background = colors[type] || colors.info;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  }

  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  switchTab(tabName) {
    this.state.set('currentTab', tabName);
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
      selectedTab.classList.add('active');
    }
    
    // Update navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedBtn) {
      selectedBtn.classList.add('active');
    }
  }

  updateHeader(user) {
    const userNameEl = document.getElementById('current-user-name');
    const userRoleEl = document.getElementById('current-user-role');
    const userAvatarEl = document.getElementById('user-avatar-text');

    if (userNameEl) userNameEl.textContent = user.fullName;
    if (userRoleEl) userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    if (userAvatarEl) {
      const initials = user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2);
      userAvatarEl.textContent = initials;
    }
  }

  showLoading() {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = 'flex';
  }

  hideLoading() {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.style.display = 'none';
  }

  renderTable(containerId, data, columns, actions = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = '<p class="empty-state">No data available</p>';
      return;
    }

    let html = '<table class="data-table"><thead><tr>';
    
    columns.forEach(col => {
      html += `<th>${col.label}</th>`;
    });
    
    if (actions.length > 0) {
      html += '<th>Actions</th>';
    }
    
    html += '</tr></thead><tbody>';

    data.forEach(item => {
      html += '<tr>';
      
      columns.forEach(col => {
        const value = col.render ? col.render(item) : item[col.key];
        html += `<td>${value}</td>`;
      });
      
      if (actions.length > 0) {
        html += '<td class="action-cell">';
        actions.forEach(action => {
          html += `<button class="btn btn-sm ${action.class || ''}" onclick="${action.onClick}('${item.id}')">${action.label}</button>`;
        });
        html += '</td>';
      }
      
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  renderCards(containerId, data, cardTemplate) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (data.length === 0) {
      container.innerHTML = '<p class="empty-state">No data available</p>';
      return;
    }

    const html = data.map(item => cardTemplate(item)).join('');
    container.innerHTML = html;
  }

  updateStats(stats) {
    if (!stats) return;

    Object.keys(stats).forEach(key => {
      const element = document.getElementById(`stat-${key}`);
      if (element) {
        element.textContent = stats[key];
      }
    });
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getStatusBadge(status) {
    const badges = {
      online: '<span class="badge badge-success">Online</span>',
      offline: '<span class="badge badge-danger">Offline</span>',
      warning: '<span class="badge badge-warning">Warning</span>',
      maintenance: '<span class="badge badge-info">Maintenance</span>',
      open: '<span class="badge badge-info">Open</span>',
      closed: '<span class="badge badge-success">Closed</span>',
      'in-progress': '<span class="badge badge-warning">In Progress</span>',
    };
    return badges[status] || `<span class="badge">${status}</span>`;
  }

  getPriorityBadge(priority) {
    const badges = {
      low: '<span class="badge badge-info">Low</span>',
      medium: '<span class="badge badge-warning">Medium</span>',
      high: '<span class="badge badge-danger">High</span>',
      critical: '<span class="badge badge-danger">Critical</span>',
    };
    return badges[priority.toLowerCase()] || `<span class="badge">${priority}</span>`;
  }
}
