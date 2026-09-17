// ==========================================================================
// MILLENNIUM APP - Main Application Controller (OOP)
// ==========================================================================

class MillenniumApp {
  constructor() {
    this.state = new StateManager();
    this.api = new ApiService();
    this.auth = new AuthManager(this.api, this.state);
    this.ui = new UIManager(this.state);
    
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    console.log('🌟 Initializing Millennium SmartBoard Management System...');

    // Check for existing session
    const user = this.auth.getSession();
    
    if (user) {
      console.log('✅ Session restored:', user.fullName);
      await this.loadDashboard();
    } else {
      this.showAuthPage();
    }

    this.setupEventListeners();
    this.initialized = true;
  }

  showAuthPage() {
    const authPage = document.getElementById('auth-page');
    const appContainer = document.getElementById('app-container');
    
    if (authPage) authPage.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
  }

  hideAuthPage() {
    const authPage = document.getElementById('auth-page');
    const appContainer = document.getElementById('app-container');
    
    if (authPage) authPage.style.display = 'none';
    if (appContainer) appContainer.style.display = 'flex';
  }

  async handleLogin(username, password) {
    this.ui.showLoading();
    
    const result = await this.auth.login(username, password);
    
    this.ui.hideLoading();
    
    if (result.success) {
      this.ui.showToast(`Welcome, ${result.user.fullName}!`, 'success');
      this.hideAuthPage();
      this.ui.updateHeader(result.user);
      await this.loadDashboard();
    } else {
      this.ui.showToast(result.error, 'error');
    }
  }

  async handleRegister(userData) {
    this.ui.showLoading();
    
    const result = await this.auth.register(userData);
    
    this.ui.hideLoading();
    
    if (result.success) {
      this.ui.showToast(`Account created! Welcome, ${result.user.fullName}!`, 'success');
      this.hideAuthPage();
      this.ui.updateHeader(result.user);
      await this.loadDashboard();
    } else {
      this.ui.showToast(result.error, 'error');
    }
  }

  handleLogout() {
    this.auth.logout();
    this.state.reset();
    this.ui.showToast('Logged out successfully', 'info');
    this.showAuthPage();
  }

  async loadDashboard() {
    this.ui.showLoading();
    
    try {
      // Load all necessary data
      await Promise.all([
        this.loadDevices(),
        this.loadTickets(),
        this.loadWarranties(),
        this.loadCustomers(),
        this.loadInventory(),
        this.loadCMS(),
        this.loadPredictiveAlerts(),
        this.loadDashboardStats(),
      ]);

      // Navigate to default tab for role
      const user = this.auth.getCurrentUser();
      const ROLE_META = {
        admin: { defaultTab: 'dashboard' },
        technician: { defaultTab: 'tickets' },
        customer: { defaultTab: 'customer-portal' },
      };
      
      const defaultTab = ROLE_META[user.role]?.defaultTab || 'dashboard';
      this.ui.switchTab(defaultTab);
      
    } catch (error) {
      console.error('Error loading dashboard:', error);
      this.ui.showToast('Error loading data', 'error');
    }
    
    this.ui.hideLoading();
  }

  async loadDevices() {
    try {
      const response = await this.api.getDevices();
      if (response.success) {
        this.state.set('devices', response.data);
        this.renderDevices();
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  }

  async loadTickets() {
    try {
      const response = await this.api.getTickets();
      if (response.success) {
        this.state.set('tickets', response.data);
        this.renderTickets();
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    }
  }

  async loadWarranties() {
    try {
      const response = await this.api.getWarranties();
      if (response.success) {
        this.state.set('warranties', response.data);
        this.renderWarranties();
      }
    } catch (error) {
      console.error('Error loading warranties:', error);
    }
  }

  async loadCustomers() {
    try {
      const response = await this.api.getCustomers();
      if (response.success) {
        this.state.set('customers', response.data);
        this.renderCustomers();
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  }

  async loadInventory() {
    try {
      const response = await this.api.getInventory();
      if (response.success) {
        this.state.set('inventory', response.data);
        this.renderInventory();
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
    }
  }

  async loadCMS() {
    try {
      const response = await this.api.getCMS();
      if (response.success) {
        this.state.set('cms', response.data);
        this.renderCMS();
      }
    } catch (error) {
      console.error('Error loading CMS:', error);
    }
  }

  async loadPredictiveAlerts() {
    try {
      const response = await this.api.getPredictiveAlerts();
      if (response.success) {
        this.state.set('predictiveAlerts', response.data);
        this.renderPredictiveAlerts();
      }
    } catch (error) {
      console.error('Error loading predictive alerts:', error);
    }
  }

  async loadDashboardStats() {
    try {
      const response = await this.api.getDashboardStats();
      if (response.success) {
        this.state.set('stats', response.data);
        this.ui.updateStats(response.data);
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    }
  }

  renderDevices() {
    // Render logic here
  }

  renderTickets() {
    // Render logic here
  }

  renderWarranties() {
    // Render logic here
  }

  renderCustomers() {
    // Render logic here
  }

  renderInventory() {
    // Render logic here
  }

  renderCMS() {
    // Render logic here
  }

  renderPredictiveAlerts() {
    // Render logic here
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        if (tabName && this.auth.hasAccess(tabName)) {
          this.ui.switchTab(tabName);
        }
      });
    });

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
  }
}
