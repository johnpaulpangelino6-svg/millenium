// ==========================================================================
// API SERVICE - HTTP Request Handler (OOP)
// ==========================================================================

class ApiService {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async patch(endpoint, body) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Authentication
  async login(username, password) {
    return this.post('/auth/login', { username, password });
  }

  async register(userData) {
    return this.post('/auth/register', userData);
  }

  // Devices
  async getDevices() {
    return this.get('/devices');
  }

  async getDevice(id) {
    return this.get(`/devices/${id}`);
  }

  async createDevice(deviceData) {
    return this.post('/devices', deviceData);
  }

  async updateDevice(id, deviceData) {
    return this.put(`/devices/${id}`, deviceData);
  }

  async deleteDevice(id) {
    return this.delete(`/devices/${id}`);
  }

  // Tickets
  async getTickets() {
    return this.get('/tickets');
  }

  async getTicket(id) {
    return this.get(`/tickets/${id}`);
  }

  async createTicket(ticketData) {
    return this.post('/tickets', ticketData);
  }

  async updateTicket(id, ticketData) {
    return this.put(`/tickets/${id}`, ticketData);
  }

  async deleteTicket(id) {
    return this.delete(`/tickets/${id}`);
  }

  // Warranties
  async getWarranties() {
    return this.get('/warranties');
  }

  async getWarranty(id) {
    return this.get(`/warranties/${id}`);
  }

  // Customers
  async getCustomers() {
    return this.get('/customers');
  }

  async createCustomer(customerData) {
    return this.post('/customers', customerData);
  }

  async updateCustomer(id, customerData) {
    return this.put(`/customers/${id}`, customerData);
  }

  async deleteCustomer(id) {
    return this.delete(`/customers/${id}`);
  }

  // Inventory
  async getInventory() {
    return this.get('/inventory');
  }

  async updateInventoryStock(id, stockQuantity) {
    return this.patch(`/inventory/${id}/stock`, { stockQuantity });
  }

  // CMS
  async getCMS() {
    return this.get('/cms');
  }

  async createCMS(cmsData) {
    return this.post('/cms', cmsData);
  }

  async updateCMS(id, cmsData) {
    return this.put(`/cms/${id}`, cmsData);
  }

  async toggleCMS(id) {
    return this.patch(`/cms/${id}/toggle`);
  }

  async deleteCMS(id) {
    return this.delete(`/cms/${id}`);
  }

  // Predictive Alerts
  async getPredictiveAlerts() {
    return this.get('/predictive-alerts');
  }

  // Audit Logs
  async getAuditLogs(deviceId = null) {
    const endpoint = deviceId ? `/audit-logs?deviceId=${deviceId}` : '/audit-logs';
    return this.get(endpoint);
  }

  // Dashboard Stats
  async getDashboardStats() {
    return this.get('/dashboard-stats');
  }

  // Users
  async getUsers() {
    return this.get('/users');
  }

  async createUser(userData) {
    return this.post('/users', userData);
  }

  async updateUser(id, userData) {
    return this.put(`/users/${id}`, userData);
  }

  async deleteUser(id) {
    return this.delete(`/users/${id}`);
  }
}
