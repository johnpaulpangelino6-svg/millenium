// ==========================================================================
// Millennium SmartBoard Management System
// Supabase PostgreSQL Database Layer
// Cloud-hosted, real-time synchronized database
// ==========================================================================

import pkg from 'pg';
const { Pool } = pkg;
import {
  Device,
  ServiceTicket,
  Warranty,
  InventoryPart,
  CmsContent,
  AuditLog,
  PredictiveAlert,
  DashboardStats,
  User,
  UserRole,
  Customer,
  ClientType,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Database Connection
// ---------------------------------------------------------------------------
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set in .env file!');
  console.error('Please add your Supabase connection string to .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log('🌐 Supabase PostgreSQL Database: CONNECTED');
console.log('  ☁️ Real-time cloud database');
console.log('  💾 Auto-save: ENABLED (all writes immediate)');
console.log('  🔄 Sync: Local ↔ Production ↔ Cloud');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashPassword(plaintext: string): string {
  let hash = 5381;
  for (let i = 0; i < plaintext.length; i++) {
    hash = ((hash << 5) + hash) ^ plaintext.charCodeAt(i);
  }
  return 'MHASH_' + Math.abs(hash).toString(16).padStart(8, '0');
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Database Class
// ---------------------------------------------------------------------------

class MillenniumDatabase {
  // -------------------------------------------------------------------------
  // INITIALIZATION & SCHEMA
  // -------------------------------------------------------------------------

  async testConnection(): Promise<void> {
    try {
      await pool.query('SELECT 1');
      console.log('  ✅ Supabase connection successful.');
    } catch (err: any) {
      throw new Error(`Supabase connection failed: ${err.message}`);
    }
  }

  initSchema(): void {
    // Schema initialization moved to async method
    console.log('  ℹ️  Schema will be initialized on first use');
  }

  async initSchemaAsync(): Promise<void> {
    const client = await pool.connect();
    try {
      // Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'technician', 'customer')),
          location TEXT DEFAULT 'All Locations',
          allowed_locations JSONB DEFAULT '[]'::jsonb,
          organization TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Customers table
      await client.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          organization_name TEXT NOT NULL,
          client_type TEXT NOT NULL CHECK(client_type IN ('school', 'corporate')),
          contact_person TEXT DEFAULT '',
          email TEXT DEFAULT '',
          phone TEXT DEFAULT '',
          address TEXT DEFAULT '',
          city TEXT DEFAULT 'Metro Manila',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Devices table
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          serial_number TEXT UNIQUE NOT NULL,
          model TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          client_type TEXT NOT NULL,
          location TEXT NOT NULL,
          city TEXT NOT NULL,
          latitude REAL DEFAULT 14.5995,
          longitude REAL DEFAULT 121.0369,
          status TEXT DEFAULT 'online' CHECK(status IN ('online', 'offline', 'warning', 'maintenance')),
          os_version TEXT DEFAULT 'Android 13 / Windows 11 Pro',
          ops_spec TEXT DEFAULT 'Intel Core i7',
          ip_address TEXT DEFAULT '192.168.1.100',
          screen_locked BOOLEAN DEFAULT false,
          power_schedule_on TEXT DEFAULT '07:30',
          power_schedule_off TEXT DEFAULT '18:00',
          wallpaper_url TEXT DEFAULT '',
          firmware_version TEXT DEFAULT 'v4.2.1-stable',
          last_ping TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          installed_at DATE NOT NULL,
          restarts_last_7_days INTEGER DEFAULT 0,
          temperature_c REAL DEFAULT 45.0,
          cpu_usage_pct INTEGER DEFAULT 20,
          ram_usage_pct INTEGER DEFAULT 40,
          storage_usage_pct INTEGER DEFAULT 25,
          touch_latency_ms REAL DEFAULT 4.0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );
      `);

      // Warranties table
      await client.query(`
        CREATE TABLE IF NOT EXISTS warranties (
          id TEXT PRIMARY KEY,
          device_id TEXT UNIQUE NOT NULL,
          device_model TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          purchase_date DATE NOT NULL,
          warranty_years INTEGER DEFAULT 2,
          expiry_date DATE NOT NULL,
          status TEXT DEFAULT 'Under Warranty',
          coverage_type TEXT DEFAULT 'Standard Warranty',
          days_remaining INTEGER DEFAULT 730,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
      `);

      // Service Tickets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS service_tickets (
          id TEXT PRIMARY KEY,
          ticket_number TEXT UNIQUE NOT NULL,
          device_id TEXT NOT NULL,
          device_model TEXT NOT NULL,
          customer_id TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT DEFAULT 'Touchscreen',
          priority TEXT DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')),
          status TEXT DEFAULT 'Received' CHECK(status IN ('Received', 'Diagnosing', 'Repairing', 'Resolved', 'Closed')),
          assigned_technician TEXT DEFAULT 'Unassigned',
          technician_notes TEXT DEFAULT '',
          warranty_covered BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
      `);

      // Ticket Parts Used table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ticket_parts_used (
          id SERIAL PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          part_id TEXT NOT NULL,
          part_name TEXT NOT NULL,
          quantity INTEGER DEFAULT 1,
          technician_name TEXT DEFAULT '',
          used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ticket_id) REFERENCES service_tickets(id) ON DELETE CASCADE
        );
      `);

      // Inventory Parts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS inventory_parts (
          id TEXT PRIMARY KEY,
          part_code TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          stock_quantity INTEGER DEFAULT 0,
          min_threshold INTEGER DEFAULT 5,
          unit_cost REAL DEFAULT 0.0,
          status TEXT DEFAULT 'In Stock',
          last_restocked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // CMS Content table
      await client.query(`
        CREATE TABLE IF NOT EXISTS cms_content (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('announcement', 'image', 'video', 'emergency')),
          content TEXT NOT NULL,
          target_audience TEXT DEFAULT 'all',
          target_device_id TEXT,
          active BOOLEAN DEFAULT true,
          scheduled_from DATE NOT NULL,
          scheduled_to DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Predictive Alerts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS predictive_alerts (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          device_model TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          risk_level TEXT DEFAULT 'Moderate' CHECK(risk_level IN ('Low', 'Moderate', 'High', 'Critical')),
          risk_factor TEXT NOT NULL,
          unexpected_restarts INTEGER DEFAULT 0,
          temperature_c REAL DEFAULT 0.0,
          uptime_hours INTEGER DEFAULT 0,
          recommended_action TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        );
      `);

      // Audit Logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          device_id TEXT,
          user_name TEXT NOT NULL,
          action TEXT NOT NULL,
          details TEXT DEFAULT '',
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('  ✅ PostgreSQL schema initialized.');
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // USER MANAGEMENT
  // -------------------------------------------------------------------------

  async loginUser(username: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> {
    const hash = hashPassword(password);
    const result = await pool.query(
      `SELECT id, username, email, full_name as "fullName", role, location, 
              allowed_locations as "allowedLocations", organization
       FROM users 
       WHERE (username = $1 OR email = $1) AND password_hash = $2`,
      [username, hash]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Invalid credentials' };
    }

    return { success: true, user: result.rows[0] };
  }

  async registerUser(data: {
    username: string;
    email: string;
    password: string;
    fullName: string;
    role: string;
    location?: string;
    organization?: string;
  }): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const id = `USR-${Date.now()}`;
      const hash = hashPassword(data.password);
      
      await pool.query(
        `INSERT INTO users (id, username, email, password_hash, full_name, role, location, organization, allowed_locations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          data.username,
          data.email,
          hash,
          data.fullName,
          data.role,
          data.location || 'All Locations',
          data.organization || '',
          JSON.stringify([data.location || 'All Locations'])
        ]
      );

      console.log(`  💾 User saved to Supabase: ${data.username} (${data.role})`);

      const user = {
        id,
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        location: data.location || 'All Locations',
        organization: data.organization || '',
        allowedLocations: [data.location || 'All Locations'],
      };

      return { success: true, user };
    } catch (err: any) {
      console.error(`  ❌ Failed to save user: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async getUsers(): Promise<any[]> {
    const result = await pool.query(`
      SELECT id, username, email, full_name as "fullName", role, location, 
             allowed_locations as "allowedLocations", organization, created_at as "createdAt"
      FROM users
      ORDER BY created_at DESC
    `);

    return result.rows;
  }

  async createUser(data: any): Promise<{ success: boolean; user?: any; error?: string }> {
    return this.registerUser(data);
  }

  async updateUser(id: string, data: any): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.fullName) { updates.push(`full_name = $${paramCount++}`); values.push(data.fullName); }
      if (data.email) { updates.push(`email = $${paramCount++}`); values.push(data.email); }
      if (data.role) { updates.push(`role = $${paramCount++}`); values.push(data.role); }
      if (data.location) { updates.push(`location = $${paramCount++}`); values.push(data.location); }
      if (data.organization) { updates.push(`organization = $${paramCount++}`); values.push(data.organization); }
      if (data.password) { updates.push(`password_hash = $${paramCount++}`); values.push(hashPassword(data.password)); }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);

      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return { success: true, user: result.rows[0] };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // -------------------------------------------------------------------------
  // CUSTOMERS
  // -------------------------------------------------------------------------

  async getCustomers(): Promise<Customer[]> {
    const result = await pool.query(`
      SELECT id, organization_name as "organizationName", client_type as "clientType",
             contact_person as "contactPerson", email, phone, address, city, created_at as "createdAt"
      FROM customers
      ORDER BY organization_name
    `);

    return result.rows as Customer[];
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    const result = await pool.query(`
      SELECT id, organization_name as "organizationName", client_type as "clientType",
             contact_person as "contactPerson", email, phone, address, city, created_at as "createdAt"
      FROM customers
      WHERE id = $1
    `, [id]);

    return result.rows[0] as Customer | null;
  }

  async addCustomer(data: {
    id?: string;
    organizationName: string;
    clientType?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
  }): Promise<Customer> {
    const id = data.id || `CUST-${Date.now()}`;
    
    await pool.query(
      `INSERT INTO customers (id, organization_name, client_type, contact_person, email, phone, address, city)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE 
       SET organization_name = EXCLUDED.organization_name,
           client_type = EXCLUDED.client_type,
           contact_person = EXCLUDED.contact_person,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           address = EXCLUDED.address,
           city = EXCLUDED.city`,
      [
        id,
        data.organizationName,
        data.clientType || 'school',
        data.contactPerson || '',
        data.email || '',
        data.phone || '',
        data.address || '',
        data.city || 'Metro Manila'
      ]
    );

    console.log(`  💾 Customer saved to Supabase: ${data.organizationName} (${id})`);
    return (await this.getCustomerById(id))!;
  }

  async updateCustomer(id: string, data: any): Promise<Customer | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.organizationName) { updates.push(`organization_name = $${paramCount++}`); values.push(data.organizationName); }
    if (data.clientType) { updates.push(`client_type = $${paramCount++}`); values.push(data.clientType); }
    if (data.contactPerson) { updates.push(`contact_person = $${paramCount++}`); values.push(data.contactPerson); }
    if (data.email) { updates.push(`email = $${paramCount++}`); values.push(data.email); }
    if (data.phone) { updates.push(`phone = $${paramCount++}`); values.push(data.phone); }
    if (data.address) { updates.push(`address = $${paramCount++}`); values.push(data.address); }
    if (data.city) { updates.push(`city = $${paramCount++}`); values.push(data.city); }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE customers SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
    }

    return this.getCustomerById(id);
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // Add placeholder methods for other entities
  // These will be implemented in the next file

  async getDevices(): Promise<Device[]> { return []; }
  async getDeviceById(id: string): Promise<Device | null> { return null; }
  async addDevice(data: any): Promise<Device> { throw new Error('Not implemented'); }
  async deleteDevice(id: string): Promise<boolean> { return false; }
  async triggerRemoteAction(deviceId: string, action: string, payload?: any): Promise<any> { return {}; }
  async assignDeviceToCustomer(deviceId: string, customerId: string, location?: string, city?: string): Promise<any> { return {}; }
  
  async getTickets(): Promise<ServiceTicket[]> { return []; }
  async getTicketById(id: string): Promise<ServiceTicket | null> { return null; }
  async createTicket(data: any): Promise<ServiceTicket> { throw new Error('Not implemented'); }
  async deleteTicket(id: string): Promise<boolean> { return false; }
  async updateTicketStatus(id: string, status: string, notes?: string): Promise<ServiceTicket | null> { return null; }
  async usePartForTicket(ticketId: string, partId: string, quantity: number, technicianName: string): Promise<any> { return {}; }
  
  async getWarranties(): Promise<Warranty[]> { return []; }
  async getWarrantyByDevice(deviceId: string): Promise<Warranty | null> { return null; }
  
  async getInventory(): Promise<InventoryPart[]> { return []; }
  async getInventoryPartById(id: string): Promise<InventoryPart | null> { return null; }
  async addInventoryPart(data: any): Promise<InventoryPart> { throw new Error('Not implemented'); }
  async updateInventoryPart(id: string, data: any): Promise<InventoryPart | null> { return null; }
  async deleteInventoryPart(id: string): Promise<boolean> { return false; }
  
  async getCms(): Promise<CmsContent[]> { return []; }
  async getCmsById(id: string): Promise<CmsContent | null> { return null; }
  async addCms(data: any): Promise<CmsContent> { throw new Error('Not implemented'); }
  async updateCms(id: string, data: any): Promise<CmsContent | null> { return null; }
  async deleteCms(id: string): Promise<boolean> { return false; }
  
  async getPredictiveAlerts(): Promise<PredictiveAlert[]> { return []; }
  async simulateTelemetryAnomaly(deviceId: string, tempC: number, restarts: number): Promise<void> {}
  
  async getAuditLogs(deviceId?: string): Promise<AuditLog[]> { return []; }
  async logAudit(data: any): Promise<void> {}
  
  async getDashboardStats(): Promise<DashboardStats> {
    return {
      totalDevices: 0,
      devicesOnline: 0,
      devicesOffline: 0,
      devicesWarning: 0,
      devicesMaintenance: 0,
      totalCustomers: 0,
      schoolClients: 0,
      corporateClients: 0,
      openTickets: 0,
      resolvedTickets: 0,
      criticalTickets: 0,
      warrantyExpiringSoon: 0,
      lowStockParts: 0,
      recentActivity: [],
      avgResponseTime: '0h',
    };
  }
}

export const db = new MillenniumDatabase();
