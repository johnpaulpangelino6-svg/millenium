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
          oauth_provider TEXT DEFAULT NULL,
          oauth_provider_id TEXT DEFAULT NULL,
          profile_photo TEXT DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Add OAuth columns if they don't exist (migration support)
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='oauth_provider') THEN
            ALTER TABLE users ADD COLUMN oauth_provider TEXT DEFAULT NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='oauth_provider_id') THEN
            ALTER TABLE users ADD COLUMN oauth_provider_id TEXT DEFAULT NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='profile_photo') THEN
            ALTER TABLE users ADD COLUMN profile_photo TEXT DEFAULT NULL;
          END IF;
        END $$;
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
          assigned_technician_id TEXT DEFAULT NULL,
          technician_notes TEXT DEFAULT '',
          warranty_covered BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_technician_id) REFERENCES users(id) ON DELETE SET NULL
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

      // Ticket Messages table (Private chat between admin and technician)
      await client.query(`
        CREATE TABLE IF NOT EXISTS ticket_messages (
          id TEXT PRIMARY KEY,
          ticket_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          sender_name TEXT NOT NULL,
          sender_role TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ticket_id) REFERENCES service_tickets(id) ON DELETE CASCADE,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages(created_at);`);

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
  // OAUTH USER REGISTRATION
  // -------------------------------------------------------------------------
  
  async registerOAuthUser(data: {
    email: string;
    fullName: string;
    role: string;
    location?: string;
    organization?: string;
    oauthProvider: string;
    oauthProviderId: string;
    profilePhoto?: string;
  }): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const id = `USR-${Date.now()}`;
      // Generate username from email
      const username = data.email.split('@')[0] + '_' + data.oauthProvider;
      // OAuth users don't need password, but we need a placeholder for schema
      const hash = hashPassword(`oauth_${data.oauthProviderId}_${Date.now()}`);
      
      await pool.query(
        `INSERT INTO users (id, username, email, password_hash, full_name, role, location, organization, 
         allowed_locations, oauth_provider, oauth_provider_id, profile_photo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          id,
          username,
          data.email,
          hash,
          data.fullName,
          data.role,
          data.location || 'All Locations',
          data.organization || '',
          JSON.stringify([data.location || 'All Locations']),
          data.oauthProvider,
          data.oauthProviderId,
          data.profilePhoto || null
        ]
      );

      console.log(`  💾 OAuth user saved to Supabase: ${username} (${data.role}) via ${data.oauthProvider}`);

      const user = {
        id,
        username,
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        location: data.location || 'All Locations',
        organization: data.organization || '',
        allowedLocations: [data.location || 'All Locations'],
        oauthProvider: data.oauthProvider,
        oauthProviderId: data.oauthProviderId,
        profilePhoto: data.profilePhoto || null,
      };

      return { success: true, user };
    } catch (err: any) {
      console.error(`  ❌ Failed to save OAuth user: ${err.message}`);
      return { success: false, error: err.message };
    }
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

  // -------------------------------------------------------------------------
  // DEVICES
  // -------------------------------------------------------------------------

  async getDevices(): Promise<Device[]> {
    const result = await pool.query(`
      SELECT id, serial_number as "serialNumber", model, customer_id as "customerId", 
             customer_name as "customerName", client_type as "clientType", location, city, 
             latitude, longitude, status, os_version as "osVersion", ops_spec as "opsSpec", 
             ip_address as "ipAddress", screen_locked as "screenLocked",
             power_schedule_on as "powerScheduleOn", power_schedule_off as "powerScheduleOff",
             wallpaper_url as "wallpaperUrl", firmware_version as "firmwareVersion", 
             last_ping as "lastPing", installed_at as "installedAt", 
             restarts_last_7_days as "restartsLast7Days", temperature_c as "temperatureC", 
             cpu_usage_pct as "cpuUsagePct", ram_usage_pct as "ramUsagePct", 
             storage_usage_pct as "storageUsagePct", touch_latency_ms as "touchLatencyMs", 
             created_at as "createdAt"
      FROM devices
      ORDER BY created_at DESC
    `);

    return result.rows as Device[];
  }

  async getDeviceById(id: string): Promise<Device | null> {
    const result = await pool.query(`
      SELECT id, serial_number as "serialNumber", model, customer_id as "customerId", 
             customer_name as "customerName", client_type as "clientType", location, city, 
             latitude, longitude, status, os_version as "osVersion", ops_spec as "opsSpec", 
             ip_address as "ipAddress", screen_locked as "screenLocked",
             power_schedule_on as "powerScheduleOn", power_schedule_off as "powerScheduleOff",
             wallpaper_url as "wallpaperUrl", firmware_version as "firmwareVersion", 
             last_ping as "lastPing", installed_at as "installedAt", 
             restarts_last_7_days as "restartsLast7Days", temperature_c as "temperatureC", 
             cpu_usage_pct as "cpuUsagePct", ram_usage_pct as "ramUsagePct", 
             storage_usage_pct as "storageUsagePct", touch_latency_ms as "touchLatencyMs", 
             created_at as "createdAt"
      FROM devices
      WHERE id = $1
    `, [id]);

    return result.rows[0] as Device | null;
  }

  async addDevice(data: any): Promise<Device> {
    const now = new Date().toISOString();
    
    await pool.query(
      `INSERT INTO devices (
        id, serial_number, model, customer_id, customer_name, client_type, location, city,
        latitude, longitude, status, os_version, ops_spec, ip_address, screen_locked,
        power_schedule_on, power_schedule_off, wallpaper_url, firmware_version, last_ping,
        installed_at, restarts_last_7_days, temperature_c, cpu_usage_pct, ram_usage_pct,
        storage_usage_pct, touch_latency_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
      [
        data.id, data.serialNumber, data.model, data.customerId, data.customerName, data.clientType,
        data.location, data.city, data.latitude, data.longitude, data.status, data.osVersion,
        data.opsSpec, data.ipAddress, data.screenLocked, data.powerScheduleOn,
        data.powerScheduleOff, data.wallpaperUrl, data.firmwareVersion, now, data.installedAt,
        data.restartsLast7Days, data.temperatureC, data.cpuUsagePct, data.ramUsagePct,
        data.storageUsagePct, data.touchLatencyMs
      ]
    );

    console.log(`  💾 Device saved to Supabase: ${data.id} - ${data.model}`);

    // Auto-create warranty
    const warrantyId = `WAR-${data.id.split('-').pop()}`;
    const purchaseDate = data.installedAt;
    const expiryDate = new Date(purchaseDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);
    const daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000));

    await pool.query(
      `INSERT INTO warranties (id, device_id, device_model, customer_name, purchase_date, 
                              warranty_years, expiry_date, status, coverage_type, days_remaining)
       VALUES ($1,$2,$3,$4,$5,2,$6,$7,$8,$9)`,
      [
        warrantyId, data.id, data.model, data.customerName, purchaseDate,
        expiryDate.toISOString().split('T')[0],
        daysRemaining > 0 ? 'Under Warranty' : 'Warranty Expired',
        'Comprehensive On-Site Hardware & OPS Coverage',
        daysRemaining
      ]
    );

    console.log(`  💾 Warranty saved to Supabase: ${warrantyId}`);
    return (await this.getDeviceById(data.id))!;
  }

  async deleteDevice(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM devices WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  async triggerRemoteAction(deviceId: string, action: string, payload?: any): Promise<any> {
    const device = await this.getDeviceById(deviceId);
    if (!device) return { success: false, error: 'Device not found' };

    const now = new Date().toISOString();
    let updateField = '';
    let updateValue: any = null;
    let logAction = '';

    switch (action) {
      case 'restart':
        updateField = 'last_ping';
        updateValue = now;
        logAction = 'Remote Reboot Triggered';
        break;
      case 'lock':
        updateField = 'screen_locked';
        updateValue = true;
        logAction = 'Screen Locked Remotely';
        break;
      case 'unlock':
        updateField = 'screen_locked';
        updateValue = false;
        logAction = 'Screen Unlocked Remotely';
        break;
      default:
        return { success: false, error: 'Unknown action' };
    }

    if (updateField) {
      await pool.query(
        `UPDATE devices SET ${updateField} = $1, last_ping = $2 WHERE id = $3`,
        [updateValue, now, deviceId]
      );
    }

    // Log action
    await pool.query(
      `INSERT INTO audit_logs (id, device_id, user_name, action, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`LOG-${Date.now()}`, deviceId, 'Admin (Remote)', logAction, '', now]
    );

    return { success: true, message: `${logAction} successfully` };
  }

  async assignDeviceToCustomer(deviceId: string, customerId: string, location?: string, city?: string): Promise<any> {
    const customer = await this.getCustomerById(customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    await pool.query(
      `UPDATE devices 
       SET customer_id = $1, customer_name = $2, client_type = $3, city = $4, location = $5
       WHERE id = $6`,
      [
        customerId,
        customer.organizationName,
        customer.clientType,
        city || customer.city,
        location || 'Main Building',
        deviceId
      ]
    );

    const device = await this.getDeviceById(deviceId);
    return { success: true, device };
  }

  // -------------------------------------------------------------------------
  // TICKETS
  // -------------------------------------------------------------------------

  async getTickets(): Promise<ServiceTicket[]> {
    const result = await pool.query(`
      SELECT id, ticket_number as "ticketNumber", device_id as "deviceId", 
             device_model as "deviceModel", customer_id as "customerId", 
             customer_name as "customerName", title, description, category, priority, status, 
             assigned_technician as "assignedTechnician", assigned_technician_id as "assignedTechnicianId",
             technician_notes as "technicianNotes", 
             warranty_covered as "warrantyCovered", created_at as "createdAt", 
             updated_at as "updatedAt", resolved_at as "resolvedAt"
      FROM service_tickets
      ORDER BY created_at DESC
    `);

    const tickets = result.rows;

    // Load parts for each ticket
    for (const ticket of tickets) {
      const parts = await pool.query(
        `SELECT part_id as "partId", part_name as "partName", quantity, 
                technician_name as "technicianName", used_at as "usedAt"
         FROM ticket_parts_used
         WHERE ticket_id = $1`,
        [ticket.id]
      );
      (ticket as any).partsUsed = parts.rows;
    }

    return tickets as ServiceTicket[];
  }

  async getTicketById(id: string): Promise<ServiceTicket | null> {
    const result = await pool.query(`
      SELECT id, ticket_number as "ticketNumber", device_id as "deviceId", 
             device_model as "deviceModel", customer_id as "customerId", 
             customer_name as "customerName", title, description, category, priority, status, 
             assigned_technician as "assignedTechnician", assigned_technician_id as "assignedTechnicianId",
             technician_notes as "technicianNotes", 
             warranty_covered as "warrantyCovered", created_at as "createdAt", 
             updated_at as "updatedAt", resolved_at as "resolvedAt"
      FROM service_tickets
      WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) return null;

    const ticket = result.rows[0];

    const parts = await pool.query(
      `SELECT part_id as "partId", part_name as "partName", quantity, 
              technician_name as "technicianName", used_at as "usedAt"
       FROM ticket_parts_used
       WHERE ticket_id = $1`,
      [id]
    );

    (ticket as any).partsUsed = parts.rows;

    return ticket as ServiceTicket;
  }

  async createTicket(data: any): Promise<ServiceTicket> {
    const id = `TCK-${Date.now()}`;
    const ticketNumber = `#M-${10000 + Math.floor(Math.random() * 90000)}`;
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO service_tickets (
        id, ticket_number, device_id, device_model, customer_id, customer_name,
        title, description, category, priority, status, assigned_technician,
        technician_notes, warranty_covered, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id, ticketNumber, data.deviceId, data.deviceModel, data.customerId, data.customerName,
        data.title, data.description, data.category, data.priority, data.status || 'Received',
        data.assignedTechnician || 'Unassigned', data.technicianNotes || 'Ticket logged.',
        data.warrantyCovered !== false, now, now
      ]
    );

    console.log(`  💾 Service ticket saved to Supabase: ${ticketNumber} - ${data.title}`);
    return (await this.getTicketById(id))!;
  }

  async deleteTicket(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM service_tickets WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  async updateTicketStatus(id: string, status: string, notes?: string): Promise<ServiceTicket | null> {
    const now = new Date().toISOString();
    const resolved = (status === 'Resolved' || status === 'Closed') ? now : null;

    await pool.query(
      `UPDATE service_tickets 
       SET status = $1, technician_notes = COALESCE($2, technician_notes), 
           updated_at = $3, resolved_at = $4
       WHERE id = $5`,
      [status, notes, now, resolved, id]
    );

    return this.getTicketById(id);
  }

  async usePartForTicket(ticketId: string, partId: string, quantity: number, technicianName: string): Promise<any> {
    const partResult = await pool.query('SELECT * FROM inventory_parts WHERE id = $1', [partId]);
    if (partResult.rows.length === 0) return { success: false, message: 'Part not found' };

    const part = partResult.rows[0];

    if (part.stock_quantity < quantity) {
      return { success: false, message: `Insufficient stock. Only ${part.stock_quantity} available.` };
    }

    // Deduct stock
    const newStock = part.stock_quantity - quantity;
    await pool.query('UPDATE inventory_parts SET stock_quantity = $1 WHERE id = $2', [newStock, partId]);

    // Record usage
    await pool.query(
      `INSERT INTO ticket_parts_used (ticket_id, part_id, part_name, quantity, technician_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [ticketId, partId, part.name, quantity, technicianName]
    );

    // Update part status
    const status = newStock === 0 ? 'Out of Stock' : newStock < part.min_threshold ? 'Low Stock' : 'In Stock';
    await pool.query('UPDATE inventory_parts SET status = $1 WHERE id = $2', [status, partId]);

    return { success: true, message: `${quantity}x ${part.name} deducted from inventory.` };
  }

  // Assign ticket to technician
  async assignTicketToTechnician(ticketId: string, technicianId: string, technicianName: string): Promise<ServiceTicket | null> {
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE service_tickets 
       SET assigned_technician = $1, assigned_technician_id = $2, updated_at = $3
       WHERE id = $4`,
      [technicianName, technicianId, now, ticketId]
    );
    return this.getTicketById(ticketId);
  }

  // Get ticket messages (private chat between admin and technician)
  async getTicketMessages(ticketId: string): Promise<any[]> {
    const result = await pool.query(`
      SELECT id, ticket_id as "ticketId", sender_id as "senderId", 
             sender_name as "senderName", sender_role as "senderRole", 
             message, created_at as "createdAt"
      FROM ticket_messages
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `, [ticketId]);
    
    return result.rows;
  }

  // Add ticket message
  async addTicketMessage(ticketId: string, senderId: string, senderName: string, senderRole: string, message: string): Promise<any> {
    const id = `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const result = await pool.query(
      `INSERT INTO ticket_messages (id, ticket_id, sender_id, sender_name, sender_role, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, ticket_id as "ticketId", sender_id as "senderId", 
                 sender_name as "senderName", sender_role as "senderRole", 
                 message, created_at as "createdAt"`,
      [id, ticketId, senderId, senderName, senderRole, message]
    );
    
    return result.rows[0];
  }

  // -------------------------------------------------------------------------
  // WARRANTIES
  // -------------------------------------------------------------------------

  async getWarranties(): Promise<Warranty[]> {
    const result = await pool.query(`
      SELECT id, device_id as "deviceId", device_model as "deviceModel", 
             customer_name as "customerName", purchase_date as "purchaseDate", 
             warranty_years as "warrantyYears", expiry_date as "expiryDate", status, 
             coverage_type as "coverageType", days_remaining as "daysRemaining", 
             created_at as "createdAt"
      FROM warranties
      ORDER BY expiry_date DESC
    `);

    return result.rows as Warranty[];
  }

  async getWarrantyByDevice(deviceId: string): Promise<Warranty | null> {
    const result = await pool.query(`
      SELECT id, device_id as "deviceId", device_model as "deviceModel", 
             customer_name as "customerName", purchase_date as "purchaseDate", 
             warranty_years as "warrantyYears", expiry_date as "expiryDate", status, 
             coverage_type as "coverageType", days_remaining as "daysRemaining", 
             created_at as "createdAt"
      FROM warranties
      WHERE device_id = $1
    `, [deviceId]);

    return result.rows[0] as Warranty | null;
  }

  // -------------------------------------------------------------------------
  // INVENTORY
  // -------------------------------------------------------------------------

  async getInventory(): Promise<InventoryPart[]> {
    const result = await pool.query(`
      SELECT id, part_code as "partCode", name, category, stock_quantity as "stockQuantity", 
             min_threshold as "minThreshold", unit_cost as "unitCost", status, 
             last_restocked as "lastRestocked", created_at as "createdAt"
      FROM inventory_parts
      ORDER BY name
    `);

    return result.rows as InventoryPart[];
  }

  async getInventoryPartById(id: string): Promise<InventoryPart | null> {
    const result = await pool.query(`
      SELECT id, part_code as "partCode", name, category, stock_quantity as "stockQuantity", 
             min_threshold as "minThreshold", unit_cost as "unitCost", status, 
             last_restocked as "lastRestocked", created_at as "createdAt"
      FROM inventory_parts
      WHERE id = $1
    `, [id]);

    return result.rows[0] as InventoryPart | null;
  }

  async addInventoryPart(data: any): Promise<InventoryPart> {
    await pool.query(
      `INSERT INTO inventory_parts (id, part_code, name, category, stock_quantity, 
                                     min_threshold, unit_cost, status, last_restocked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE 
       SET stock_quantity = EXCLUDED.stock_quantity, 
           min_threshold = EXCLUDED.min_threshold, 
           unit_cost = EXCLUDED.unit_cost, 
           status = EXCLUDED.status`,
      [
        data.id, data.partCode, data.name, data.category, data.stockQuantity || 0,
        data.minThreshold || 5, data.unitCost || 0, data.status || 'In Stock', 
        data.lastRestocked || new Date().toISOString()
      ]
    );

    return (await this.getInventoryPartById(data.id))!;
  }

  async updateInventoryPart(id: string, data: any): Promise<InventoryPart | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.stockQuantity !== undefined) { updates.push(`stock_quantity = $${paramCount++}`); values.push(data.stockQuantity); }
    if (data.minThreshold !== undefined) { updates.push(`min_threshold = $${paramCount++}`); values.push(data.minThreshold); }
    if (data.unitCost !== undefined) { updates.push(`unit_cost = $${paramCount++}`); values.push(data.unitCost); }
    if (data.status) { updates.push(`status = $${paramCount++}`); values.push(data.status); }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE inventory_parts SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
    }

    return this.getInventoryPartById(id);
  }

  async deleteInventoryPart(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM inventory_parts WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // -------------------------------------------------------------------------
  // CMS
  // -------------------------------------------------------------------------

  async getCms(): Promise<CmsContent[]> {
    const result = await pool.query(`
      SELECT id, title, type, content, target_audience as "targetAudience", 
             target_device_id as "targetDeviceId", active, 
             scheduled_from as "scheduledFrom", scheduled_to as "scheduledTo", 
             created_at as "createdAt"
      FROM cms_content
      ORDER BY created_at DESC
    `);

    return result.rows as CmsContent[];
  }

  async getCmsById(id: string): Promise<CmsContent | null> {
    const result = await pool.query(`
      SELECT id, title, type, content, target_audience as "targetAudience", 
             target_device_id as "targetDeviceId", active, 
             scheduled_from as "scheduledFrom", scheduled_to as "scheduledTo", 
             created_at as "createdAt"
      FROM cms_content
      WHERE id = $1
    `, [id]);

    return result.rows[0] as CmsContent | null;
  }

  async addCms(data: any): Promise<CmsContent> {
    const id = `CMS-${Date.now()}`;
    const now = new Date().toISOString();

    await pool.query(
      `INSERT INTO cms_content (id, title, type, content, target_audience, target_device_id, 
                                 active, scheduled_from, scheduled_to, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id, data.title, data.type, data.content, data.targetAudience || 'all',
        data.targetDeviceId || null, data.active !== false, data.scheduledFrom, 
        data.scheduledTo, now
      ]
    );

    return (await this.getCmsById(id))!;
  }

  async updateCms(id: string, data: any): Promise<CmsContent | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.title) { updates.push(`title = $${paramCount++}`); values.push(data.title); }
    if (data.content) { updates.push(`content = $${paramCount++}`); values.push(data.content); }
    if (data.active !== undefined) { updates.push(`active = $${paramCount++}`); values.push(data.active); }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE cms_content SET ${updates.join(', ')} WHERE id = $${paramCount}`, values);
    }

    return this.getCmsById(id);
  }

  async deleteCms(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM cms_content WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  // -------------------------------------------------------------------------
  // PREDICTIVE ALERTS
  // -------------------------------------------------------------------------

  async getPredictiveAlerts(): Promise<PredictiveAlert[]> {
    const result = await pool.query(`
      SELECT id, device_id as "deviceId", device_model as "deviceModel", 
             customer_name as "customerName", risk_level as "riskLevel", 
             risk_factor as "riskFactor", unexpected_restarts as "unexpectedRestarts", 
             temperature_c as "temperatureC", uptime_hours as "uptimeHours", 
             recommended_action as "recommendedAction", created_at as "createdAt"
      FROM predictive_alerts
      ORDER BY created_at DESC
    `);

    return result.rows as PredictiveAlert[];
  }

  async simulateTelemetryAnomaly(deviceId: string, tempC: number, restarts: number): Promise<void> {
    const device = await this.getDeviceById(deviceId);
    if (!device) return;

    const id = `ALERT-${Date.now()}`;
    let riskLevel = 'Low';
    let riskFactor = 'Normal operation';
    let recommendedAction = 'Continue monitoring';

    if (tempC > 80 || restarts > 10) {
      riskLevel = 'Critical';
      riskFactor = 'Excessive temperature and restarts detected';
      recommendedAction = 'Immediate on-site inspection required';
    } else if (tempC > 65 || restarts > 5) {
      riskLevel = 'High';
      riskFactor = 'High temperature or frequent restarts';
      recommendedAction = 'Schedule preventive maintenance';
    }

    await pool.query(
      `INSERT INTO predictive_alerts (id, device_id, device_model, customer_name, 
                                       risk_level, risk_factor, unexpected_restarts, 
                                       temperature_c, uptime_hours, recommended_action)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id, deviceId, device.model, device.customerName, riskLevel, riskFactor,
        restarts, tempC, 168, recommendedAction
      ]
    );
  }

  // -------------------------------------------------------------------------
  // AUDIT LOGS
  // -------------------------------------------------------------------------

  async getAuditLogs(deviceId?: string): Promise<AuditLog[]> {
    let query = `
      SELECT id, device_id as "deviceId", user_name as "userName", action, details, 
             timestamp
      FROM audit_logs
    `;
    const values: any[] = [];

    if (deviceId) {
      query += ' WHERE device_id = $1';
      values.push(deviceId);
    }

    query += ' ORDER BY timestamp DESC LIMIT 100';

    const result = await pool.query(query, values);
    return result.rows as AuditLog[];
  }

  async logAudit(data: any): Promise<void> {
    await pool.query(
      `INSERT INTO audit_logs (id, device_id, user_name, action, details, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `LOG-${Date.now()}`,
        data.deviceId || null,
        data.userName,
        data.action,
        data.details || '',
        new Date().toISOString()
      ]
    );
  }

  // -------------------------------------------------------------------------
  // DASHBOARD STATS
  // -------------------------------------------------------------------------

  async getDashboardStats(): Promise<DashboardStats> {
    // Get device counts
    const deviceStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'online') as online,
        COUNT(*) FILTER (WHERE status = 'offline') as offline,
        COUNT(*) FILTER (WHERE status = 'warning') as warning,
        COUNT(*) FILTER (WHERE status = 'maintenance') as maintenance
      FROM devices
    `);

    // Get customer counts
    const customerStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE client_type = 'school') as schools,
        COUNT(*) FILTER (WHERE client_type = 'corporate') as corporate
      FROM customers
    `);

    // Get ticket counts
    const ticketStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status NOT IN ('Resolved', 'Closed')) as open,
        COUNT(*) FILTER (WHERE status IN ('Resolved', 'Closed')) as resolved,
        COUNT(*) FILTER (WHERE priority = 'Critical') as critical
      FROM service_tickets
    `);

    // Get inventory counts
    const inventoryStats = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE stock_quantity < min_threshold) as low_stock
      FROM inventory_parts
    `);

    // Get warranty counts
    const warrantyStats = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE days_remaining <= 30) as expiring_soon
      FROM warranties
    `);

    // Get recent activity
    const recentActivity = await pool.query(`
      SELECT action, details, timestamp
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    return {
      totalDevices: parseInt(deviceStats.rows[0].total) || 0,
      devicesOnline: parseInt(deviceStats.rows[0].online) || 0,
      devicesOffline: parseInt(deviceStats.rows[0].offline) || 0,
      devicesWarning: parseInt(deviceStats.rows[0].warning) || 0,
      devicesMaintenance: parseInt(deviceStats.rows[0].maintenance) || 0,
      totalCustomers: parseInt(customerStats.rows[0].total) || 0,
      schoolClients: parseInt(customerStats.rows[0].schools) || 0,
      corporateClients: parseInt(customerStats.rows[0].corporate) || 0,
      openTickets: parseInt(ticketStats.rows[0].open) || 0,
      resolvedTickets: parseInt(ticketStats.rows[0].resolved) || 0,
      criticalTickets: parseInt(ticketStats.rows[0].critical) || 0,
      warrantyExpiringSoon: parseInt(warrantyStats.rows[0].expiring_soon) || 0,
      lowStockParts: parseInt(inventoryStats.rows[0].low_stock) || 0,
      recentActivity: recentActivity.rows.map(r => `${r.action}: ${r.details}`),
      avgResponseTime: '2.4h',
    };
  }
}

export const db = new MillenniumDatabase();
