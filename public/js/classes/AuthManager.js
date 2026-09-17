// ==========================================================================
// AUTH MANAGER - Authentication & Session Management (OOP)
// ==========================================================================

class AuthManager {
  constructor(apiService, stateManager) {
    this.api = apiService;
    this.state = stateManager;
    this.SESSION_KEY = 'millennium_auth_user';
  }

  async login(username, password) {
    try {
      const response = await this.api.login(username, password);
      
      if (response.success && response.user) {
        this.setSession(response.user);
        return { success: true, user: response.user };
      }
      
      return { success: false, error: response.error || 'Login failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async register(userData) {
    try {
      const response = await this.api.register(userData);
      
      if (response.success && response.user) {
        this.setSession(response.user);
        return { success: true, user: response.user };
      }
      
      return { success: false, error: response.error || 'Registration failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  setSession(user) {
    this.state.set('currentUser', user);
    this.state.set('currentRole', user.role);
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
  }

  getSession() {
    try {
      const stored = localStorage.getItem(this.SESSION_KEY);
      if (stored) {
        const user = JSON.parse(stored);
        this.state.set('currentUser', user);
        this.state.set('currentRole', user.role);
        return user;
      }
    } catch (error) {
      console.error('Session restore error:', error);
    }
    return null;
  }

  logout() {
    this.state.set('currentUser', null);
    this.state.set('currentRole', 'admin');
    localStorage.removeItem(this.SESSION_KEY);
  }

  isAuthenticated() {
    return this.state.get('currentUser') !== null;
  }

  getCurrentUser() {
    return this.state.get('currentUser');
  }

  getCurrentRole() {
    return this.state.get('currentRole');
  }

  hasAccess(tabName) {
    const role = this.getCurrentRole();
    const ROLE_ACCESS = {
      admin: ['dashboard', 'showcase', 'devices', 'tickets', 'customer-portal', 'warranty', 'inventory', 'data-manager', 'cms', 'predictive', 'analytics'],
      technician: ['showcase', 'devices', 'tickets', 'inventory'],
      customer: ['showcase', 'customer-portal', 'tickets', 'warranty'],
    };
    return ROLE_ACCESS[role]?.includes(tabName) || false;
  }
}
