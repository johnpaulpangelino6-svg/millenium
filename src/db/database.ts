// ==========================================================================
// Millennium SmartBoard Management System
// Universal Database Layer (Cloud External Database + Local SQLite Fallback)
//
// Supports:
// 1. External Cloud Database (Turso / LibSQL) via DATABASE_URL & DATABASE_AUTH_TOKEN
// 2. Local File SQLite (data/millennium.db) when no cloud credentials provided
// ==========================================================================

import { createClient, Client } from '@libsql/client';
import path from 'node:path';
import fs from 'node:fs';
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
// Database Connection Setup
// ---------------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

const isExternal = Boolean(databaseUrl && databaseUrl.trim() !== '');

let client: Client;

if (isExternal) {
  const cleanUrl = databaseUrl!.trim();
  const maskedUrl = cleanUrl.replace(/:\/\/.*@/, '://***@');
  console.log(`🌐 External Database: CONNECTING to ${maskedUrl}`);
  console.log(`  ☁️ Mode: Cloud Synchronized (Shared between localhost and web hosting)`);
  client = createClient({
    url: cleanUrl,
    authToken: authToken ? authToken.trim() : undefined,
  });
} else {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'millennium.db');
  console.log(`📁 Local SQLite Database: ${dbPath}`);
  console.log(`  💾 Auto-save: ENABLED (local mode)`);
  client = createClient({
    url: `file:${dbPath}`,
  });
}

// ---------------------------------------------------------------------------
// Query Adapter (Unified async interface for both Cloud and Local)
// ---------------------------------------------------------------------------
export const dbClient = {
  async get<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const res = await client.execute({ sql, args: flat });
    if (!res.rows || res.rows.length === 0) return null;
    return res.rows[0] as unknown as T;
  },

  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const res = await client.execute({ sql, args: flat });
    return (res.rows || []) as unknown as T[];
  },

  async run(sql: string, ...params: any[]): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const res = await client.execute({ sql, args: flat });
    return {
      changes: res.rowsAffected,
      lastInsertRowid: res.lastInsertRowid,
    };
  },

  async exec(sql: string): Promise<void> {
    await client.executeMultiple(sql);
  },

  getClient(): Client {
    return client;
  },

  isCloud(): boolean {
    return isExternal;
  },
};

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
      await client.execute('SELECT 1');
      console.log(`  ✅ Database connection successful (${isExternal ? 'Cloud External Database' : 'Local SQLite'}).`);
    } catch (err: any) {
      throw new Error(`Database connection failed: ${err.message}`);
    }
  }

  async initSchema(): Promise<void> {
    // Users table
    await dbClient.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'technician', 'customer')),
        location TEXT DEFAULT 'All Locations',
        allowed_locations TEXT DEFAULT '[]',
        organization TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Customers table
    await dbClient.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        organization_name TEXT NOT NULL,
        client_type TEXT NOT NULL CHECK(client_type IN ('school', 'corporate')),
        contact_person TEXT DEFAULT '',
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        address TEXT DEFAULT '',
        city TEXT DEFAULT 'Metro Manila',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Devices table
    await dbClient.exec(`
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
        screen_locked INTEGER DEFAULT 0,
        power_schedule_on TEXT DEFAULT '07:30',
        power_schedule_off TEXT DEFAULT '18:00',
        wallpaper_url TEXT DEFAULT '',
        firmware_version TEXT DEFAULT 'v4.2.1-stable',
        last_ping TEXT DEFAULT (datetime('now')),
        installed_at TEXT NOT NULL,
        restarts_last_7_days INTEGER DEFAULT 0,
        temperature_c REAL DEFAULT 45.0,
        cpu_usage_pct INTEGER DEFAULT 20,
        ram_usage_pct INTEGER DEFAULT 40,
        storage_usage_pct INTEGER DEFAULT 25,
        touch_latency_ms REAL DEFAULT 4.0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
    `);

    // Warranties table
    await dbClient.exec(`
      CREATE TABLE IF NOT EXISTS warranties (
        id TEXT PRIMARY KEY,
        device_id TEXT UNIQUE NOT NULL,
        device_model TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        purchase_date TEXT NOT NULL,
        warranty_years INTEGER DEFAULT 2,
        expiry_date TEXT NOT NULL,
        status TEXT DEFAULT 'Under Warranty',
        coverage_type TEXT DEFAULT 'Standard Warranty',
        days_remaining INTEGER DEFAULT 730,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
    `);

    // Service Tickets table
    await dbClient.exec(`
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
        warranty_covered INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
    `);

    // Ticket Parts Used (join table)
    await dbClient.exec(`
      CREATE TABLE IF NOT EXISTS ticket_parts_used (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL,
        part_id TEXT NOT NULL,
        part_name TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        technician_name TEXT DEFAULT '',
        used_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (ticket_id) REFERENCES service_tickets(id) ON DELETE CASCADE
      );
    `);

    // Inventory Parts table
    await dbClient.exec(`
      CREATE TABLE IF NOT EXISTS inventory_parts (
        id TEXT PRIMARY KEY,
        part_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        min_threshold INTEGER DEFAULT 5,
        unit_cost REAL DEFAULT 0.0,
        status TEXT DEFAULT 'In Stock',
        last_restocked TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // CMS Content table
    await dbClient.exec(`
      CREATE TABLE IF NOT EXISTS cms_content (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('announcement', 'image', 'video', 'emergency')),
        content TEXT NOT NULL,
        target_audience TEXT DEFAULT 'all',
        target_device_id TEXT,
        active INTEGER DEFAULT 1,
        scheduled_from TEXT NOT NULL,
        scheduled_to TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Predictive Alerts table
    await dbClient.exec(`
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
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );
    `);

    // Audit Logs table
    await dbClient.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        device_id TEXT,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT DEFAULT '',
        timestamp TEXT DEFAULT (datetime('now'))
      );
    `);

    console.log('  ✅ Database schema initialized.');
  }

  // -------------------------------------------------------------------------
  // USER MANAGEMENT
  // -------------------------------------------------------------------------

  async loginUser(username: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> {
    const hash = hashPassword(password);
    const user = await dbClient.get(`
      SELECT id, username, email, full_name as fullName, role, location, 
             allowed_locations as allowedLocations, organization
      FROM users 
      WHERE (username = ? OR email = ?) AND password_hash = ?
    `, username, username, hash);

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const u = user as any;
    u.allowedLocations = typeof u.allowedLocations === 'string'
      ? JSON.parse(u.allowedLocations || '[]')
      : (u.allowedLocations || []);
    return { success: true, user: u };
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
      
      const result = await dbClient.run(`
        INSERT INTO users (id, username, email, password_hash, full_name, role, location, organization, allowed_locations)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        id,
        data.username,
        data.email,
        hash,
        data.fullName,
        data.role,
        data.location || 'All Locations',
        data.organization || '',
        JSON.stringify([data.location || 'All Locations'])
      );

      // Verify data was saved to database
      if (result.changes === 0) {
        throw new Error('Failed to save user to database');
      }

      console.log(`  💾 User saved to database: ${data.username} (${data.role})`);

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
    const rows = await dbClient.all(`
      SELECT id, username, email, full_name as fullName, role, location, 
             allowed_locations as allowedLocations, organization, created_at as createdAt
      FROM users
      ORDER BY created_at DESC
    `);

    return rows.map((u: any) => ({
      ...u,
      allowedLocations: typeof u.allowedLocations === 'string'
        ? JSON.parse(u.allowedLocations || '[]')
        : (u.allowedLocations || []),
    }));
  }

  async createUser(data: any): Promise<{ success: boolean; user?: any; error?: string }> {
    return this.registerUser(data);
  }

  async updateUser(id: string, data: any): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (data.fullName) { updates.push('full_name = ?'); values.push(data.fullName); }
      if (data.email) { updates.push('email = ?'); values.push(data.email); }
      if (data.role) { updates.push('role = ?'); values.push(data.role); }
      if (data.location) { updates.push('location = ?'); values.push(data.location); }
      if (data.organization) { updates.push('organization = ?'); values.push(data.organization); }
      if (data.password) { updates.push('password_hash = ?'); values.push(hashPassword(data.password)); }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);
      await dbClient.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

      const user = await dbClient.get('SELECT * FROM users WHERE id = ?', id);
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await dbClient.run('DELETE FROM users WHERE id = ?', id);
    return result.changes > 0;
  }

  // -------------------------------------------------------------------------
  // CUSTOMERS
  // -------------------------------------------------------------------------

  async getCustomers(): Promise<Customer[]> {
    const rows = await dbClient.all(`
      SELECT id, organization_name as organizationName, client_type as clientType,
             contact_person as contactPerson, email, phone, address, city, created_at as createdAt
      FROM customers
      ORDER BY organization_name
    `);

    return rows as Customer[];
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    const row = await dbClient.get(`
      SELECT id, organization_name as organizationName, client_type as clientType,
             contact_person as contactPerson, email, phone, address, city, created_at as createdAt
      FROM customers
      WHERE id = ?
    `, id);

    return row as Customer | null;
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
    
    await dbClient.run(`
      INSERT OR REPLACE INTO customers (id, organization_name, client_type, contact_person, email, phone, address, city)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      id,
      data.organizationName,
      data.clientType || 'school',
      data.contactPerson || '',
      data.email || '',
      data.phone || '',
      data.address || '',
      data.city || 'Metro Manila'
    );

    console.log(`  💾 Customer saved to database: ${data.organizationName} (${id})`);
    return (await this.getCustomerById(id)) as Customer;
  }

  async updateCustomer(id: string, data: any): Promise<Customer | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.organizationName) { updates.push('organization_name = ?'); values.push(data.organizationName); }
    if (data.clientType) { updates.push('client_type = ?'); values.push(data.clientType); }
    if (data.contactPerson) { updates.push('contact_person = ?'); values.push(data.contactPerson); }
    if (data.email) { updates.push('email = ?'); values.push(data.email); }
    if (data.phone) { updates.push('phone = ?'); values.push(data.phone); }
    if (data.address) { updates.push('address = ?'); values.push(data.address); }
    if (data.city) { updates.push('city = ?'); values.push(data.city); }

    if (updates.length > 0) {
      values.push(id);
      await dbClient.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    return this.getCustomerById(id);
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await dbClient.run('DELETE FROM customers WHERE id = ?', id);
    return result.changes > 0;
  }

  // -------------------------------------------------------------------------
  // DEVICES
  // -------------------------------------------------------------------------

  async getDevices(): Promise<Device[]> {
    const rows = await dbClient.all(`
      SELECT id, serial_number as serialNumber, model, customer_id as customerId, customer_name as customerName,
             client_type as clientType, location, city, latitude, longitude, status, os_version as osVersion,
             ops_spec as opsSpec, ip_address as ipAddress, screen_locked as screenLocked,
             power_schedule_on as powerScheduleOn, power_schedule_off as powerScheduleOff,
             wallpaper_url as wallpaperUrl, firmware_version as firmwareVersion, last_ping as lastPing,
             installed_at as installedAt, restarts_last_7_days as restartsLast7Days,
             temperature_c as temperatureC, cpu_usage_pct as cpuUsagePct, ram_usage_pct as ramUsagePct,
             storage_usage_pct as storageUsagePct, touch_latency_ms as touchLatencyMs, created_at as createdAt
      FROM devices
      ORDER BY created_at DESC
    `);

    return rows.map((r: any) => ({
      ...r,
      screenLocked: r.screenLocked === 1,
    })) as Device[];
  }

  async getDeviceById(id: string): Promise<Device | null> {
    const row = await dbClient.get(`
      SELECT id, serial_number as serialNumber, model, customer_id as customerId, customer_name as customerName,
             client_type as clientType, location, city, latitude, longitude, status, os_version as osVersion,
             ops_spec as opsSpec, ip_address as ipAddress, screen_locked as screenLocked,
             power_schedule_on as powerScheduleOn, power_schedule_off as powerScheduleOff,
             wallpaper_url as wallpaperUrl, firmware_version as firmwareVersion, last_ping as lastPing,
             installed_at as installedAt, restarts_last_7_days as restartsLast7Days,
             temperature_c as temperatureC, cpu_usage_pct as cpuUsagePct, ram_usage_pct as ramUsagePct,
             storage_usage_pct as storageUsagePct, touch_latency_ms as touchLatencyMs, created_at as createdAt
      FROM devices
      WHERE id = ?
    `, id);

    if (!row) return null;
    const r: any = row;
    return {
      ...r,
      screenLocked: r.screenLocked === 1,
    } as Device;
  }

  async addDevice(data: any): Promise<Device> {
    const now = new Date().toISOString();
    
    await dbClient.run(`
      INSERT INTO devices (
        id, serial_number, model, customer_id, customer_name, client_type, location, city,
        latitude, longitude, status, os_version, ops_spec, ip_address, screen_locked,
        power_schedule_on, power_schedule_off, wallpaper_url, firmware_version, last_ping,
        installed_at, restarts_last_7_days, temperature_c, cpu_usage_pct, ram_usage_pct,
        storage_usage_pct, touch_latency_ms
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
      data.id, data.serialNumber, data.model, data.customerId, data.customerName, data.clientType,
      data.location, data.city, data.latitude, data.longitude, data.status, data.osVersion,
      data.opsSpec, data.ipAddress, data.screenLocked ? 1 : 0, data.powerScheduleOn,
      data.powerScheduleOff, data.wallpaperUrl, data.firmwareVersion, now, data.installedAt,
      data.restartsLast7Days, data.temperatureC, data.cpuUsagePct, data.ramUsagePct,
      data.storageUsagePct, data.touchLatencyMs
    );

    console.log(`  💾 Device saved to database: ${data.id} - ${data.model}`);

    // Auto-create warranty
    const warrantyId = `WAR-${data.id.split('-').pop()}`;
    const purchaseDate = data.installedAt;
    const expiryDate = new Date(purchaseDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 2);
    const daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000));

    await dbClient.run(`
      INSERT OR REPLACE INTO warranties (id, device_id, device_model, customer_name, purchase_date, 
                              warranty_years, expiry_date, status, coverage_type, days_remaining)
      VALUES (?,?,?,?,?,2,?,?,?,?)
    `,
      warrantyId, data.id, data.model, data.customerName, purchaseDate,
      expiryDate.toISOString().split('T')[0],
      daysRemaining > 0 ? 'Under Warranty' : 'Warranty Expired',
      'Comprehensive On-Site Hardware & OPS Coverage',
      daysRemaining
    );

    console.log(`  💾 Warranty saved to database: ${warrantyId}`);
    return (await this.getDeviceById(data.id)) as Device;
  }

  async deleteDevice(id: string): Promise<boolean> {
    const result = await dbClient.run('DELETE FROM devices WHERE id = ?', id);
    return result.changes > 0;
  }

  async triggerRemoteAction(deviceId: string, action: string, payload?: any): Promise<any> {
    const device: any = await this.getDeviceById(deviceId);
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
        updateValue = 1;
        logAction = 'Screen Locked Remotely';
        break;
      case 'unlock':
        updateField = 'screen_locked';
        updateValue = 0;
        logAction = 'Screen Unlocked Remotely';
        break;
      default:
        return { success: false, error: 'Unknown action' };
    }

    if (updateField) {
      await dbClient.run(`UPDATE devices SET ${updateField} = ?, last_ping = ? WHERE id = ?`,
        updateValue, now, deviceId);
    }

    // Log action
    await dbClient.run(`
      INSERT INTO audit_logs (id, device_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, `LOG-${Date.now()}`, deviceId, 'Admin (Remote)', logAction, '', now);

    return { success: true, message: `${logAction} successfully` };
  }

  async assignDeviceToCustomer(deviceId: string, customerId: string, location?: string, city?: string): Promise<any> {
    const customer = await this.getCustomerById(customerId);
    if (!customer) return { success: false, error: 'Customer not found' };

    await dbClient.run(`
      UPDATE devices 
      SET customer_id = ?, customer_name = ?, client_type = ?, city = ?, location = ?
      WHERE id = ?
    `,
      customerId,
      customer.organizationName,
      customer.clientType,
      city || customer.city,
      location || 'Main Building',
      deviceId
    );

    const device = await this.getDeviceById(deviceId);
    return { success: true, device };
  }

  // -------------------------------------------------------------------------
  // TICKETS
  // -------------------------------------------------------------------------

  async getTickets(): Promise<ServiceTicket[]> {
    const rows = await dbClient.all(`
      SELECT id, ticket_number as ticketNumber, device_id as deviceId, device_model as deviceModel,
             customer_id as customerId, customer_name as customerName, title, description,
             category, priority, status, assigned_technician as assignedTechnician,
             technician_notes as technicianNotes, warranty_covered as warrantyCovered,
             created_at as createdAt, updated_at as updatedAt, resolved_at as resolvedAt
      FROM service_tickets
      ORDER BY created_at DESC
    `);

    const tickets = rows.map((r: any) => ({
      ...r,
      warrantyCovered: r.warrantyCovered === 1,
      partsUsed: [],
    }));

    // Load parts for each ticket
    for (const ticket of tickets) {
      const parts = await dbClient.all(`
        SELECT part_id as partId, part_name as partName, quantity, technician_name as technicianName, used_at as usedAt
        FROM ticket_parts_used
        WHERE ticket_id = ?
      `, ticket.id);
      (ticket as any).partsUsed = parts;
    }

    return tickets as ServiceTicket[];
  }

  async getTicketById(id: string): Promise<ServiceTicket | null> {
    const ticket: any = await dbClient.get(`
      SELECT id, ticket_number as ticketNumber, device_id as deviceId, device_model as deviceModel,
             customer_id as customerId, customer_name as customerName, title, description,
             category, priority, status, assigned_technician as assignedTechnician,
             technician_notes as technicianNotes, warranty_covered as warrantyCovered,
             created_at as createdAt, updated_at as updatedAt, resolved_at as resolvedAt
      FROM service_tickets
      WHERE id = ?
    `, id);

    if (!ticket) return null;

    const parts = await dbClient.all(`
      SELECT part_id as partId, part_name as partName, quantity, technician_name as technicianName, used_at as usedAt
      FROM ticket_parts_used
      WHERE ticket_id = ?
    `, id);

    ticket.warrantyCovered = ticket.warrantyCovered === 1;
    ticket.partsUsed = parts;

    return ticket as ServiceTicket;
  }

  async createTicket(data: any): Promise<ServiceTicket> {
    const id = `TCK-${Date.now()}`;
    const ticketNumber = `#M-${10000 + Math.floor(Math.random() * 90000)}`;
    const now = new Date().toISOString();

    await dbClient.run(`
      INSERT INTO service_tickets (
        id, ticket_number, device_id, device_model, customer_id, customer_name,
        title, description, category, priority, status, assigned_technician,
        technician_notes, warranty_covered, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
      id, ticketNumber, data.deviceId, data.deviceModel, data.customerId, data.customerName,
      data.title, data.description, data.category, data.priority, data.status || 'Received',
      data.assignedTechnician || 'Unassigned', data.technicianNotes || 'Ticket logged.',
      data.warrantyCovered ? 1 : 0, now, now
    );

    console.log(`  💾 Service ticket saved to database: ${ticketNumber} - ${data.title}`);
    return (await this.getTicketById(id)) as ServiceTicket;
  }

  async deleteTicket(id: string): Promise<boolean> {
    const result = await dbClient.run('DELETE FROM service_tickets WHERE id = ?', id);
    return result.changes > 0;
  }

  async updateTicketStatus(id: string, status: string, notes?: string): Promise<ServiceTicket | null> {
    const now = new Date().toISOString();
    const resolved = (status === 'Resolved' || status === 'Closed') ? now : null;

    await dbClient.run(`
      UPDATE service_tickets 
      SET status = ?, technician_notes = COALESCE(?, technician_notes), 
          updated_at = ?, resolved_at = ?
      WHERE id = ?
    `, status, notes, now, resolved, id);

    return this.getTicketById(id);
  }

  async usePartForTicket(ticketId: string, partId: string, quantity: number, technicianName: string): Promise<any> {
    const part: any = await dbClient.get('SELECT * FROM inventory_parts WHERE id = ?', partId);
    if (!part) return { success: false, message: 'Part not found' };

    if (part.stock_quantity < quantity) {
      return { success: false, message: `Insufficient stock. Only ${part.stock_quantity} available.` };
    }

    // Deduct stock
    const newStock = part.stock_quantity - quantity;
    await dbClient.run('UPDATE inventory_parts SET stock_quantity = ? WHERE id = ?', newStock, partId);

    // Record usage
    await dbClient.run(`
      INSERT INTO ticket_parts_used (ticket_id, part_id, part_name, quantity, technician_name)
      VALUES (?, ?, ?, ?, ?)
    `, ticketId, partId, part.name, quantity, technicianName);

    // Update part status
    const status = newStock === 0 ? 'Out of Stock' : newStock < part.min_threshold ? 'Low Stock' : 'In Stock';
    await dbClient.run('UPDATE inventory_parts SET status = ? WHERE id = ?', status, partId);

    return { success: true, message: `${quantity}x ${part.name} deducted from inventory.` };
  }

  // -------------------------------------------------------------------------
  // WARRANTIES
  // -------------------------------------------------------------------------

  async getWarranties(): Promise<Warranty[]> {
    const rows = await dbClient.all(`
      SELECT id, device_id as deviceId, device_model as deviceModel, customer_name as customerName,
             purchase_date as purchaseDate, warranty_years as warrantyYears, expiry_date as expiryDate,
             status, coverage_type as coverageType, days_remaining as daysRemaining, created_at as createdAt
      FROM warranties
      ORDER BY expiry_date DESC
    `);

    return rows as Warranty[];
  }

  async getWarrantyByDevice(deviceId: string): Promise<Warranty | null> {
    const row = await dbClient.get(`
      SELECT id, device_id as deviceId, device_model as deviceModel, customer_name as customerName,
             purchase_date as purchaseDate, warranty_years as warrantyYears, expiry_date as expiryDate,
             status, coverage_type as coverageType, days_remaining as daysRemaining, created_at as createdAt
      FROM warranties
      WHERE device_id = ?
    `, deviceId);

    return row as Warranty | null;
  }

  // -------------------------------------------------------------------------
  // INVENTORY
  // -------------------------------------------------------------------------

  async getInventory(): Promise<InventoryPart[]> {
    const rows = await dbClient.all(`
      SELECT id, part_code as partCode, name, category, stock_quantity as stockQuantity,
             min_threshold as minThreshold, unit_cost as unitCost, status, 
             last_restocked as lastRestocked, created_at as createdAt
      FROM inventory_parts
      ORDER BY category, name
    `);

    return rows as InventoryPart[];
  }

  async addInventoryPart(part: {
    id: string;
    partCode: string;
    name: string;
    category: string;
    stockQuantity: number;
    minThreshold: number;
    unitCost: number;
    status: string;
    lastRestocked: string;
  }): Promise<InventoryPart> {
    const now = new Date().toISOString();
    
    await dbClient.run(`
      INSERT OR REPLACE INTO inventory_parts 
        (id, part_code, name, category, stock_quantity, min_threshold, unit_cost, status, last_restocked, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      part.id,
      part.partCode,
      part.name,
      part.category,
      part.stockQuantity,
      part.minThreshold,
      part.unitCost,
      part.status,
      part.lastRestocked,
      now
    );

    const inserted: any = await dbClient.get('SELECT * FROM inventory_parts WHERE id = ?', part.id);
    return {
      id: inserted.id,
      partCode: inserted.part_code,
      name: inserted.name,
      category: inserted.category,
      stockQuantity: inserted.stock_quantity,
      minThreshold: inserted.min_threshold,
      unitCost: inserted.unit_cost,
      status: inserted.status,
      lastRestocked: inserted.last_restocked,
      createdAt: inserted.created_at,
    } as InventoryPart;
  }

  async updatePartStock(id: string, quantity: number): Promise<InventoryPart | null> {
    const part: any = await dbClient.get('SELECT * FROM inventory_parts WHERE id = ?', id);
    if (!part) return null;

    const status = quantity === 0 ? 'Out of Stock' : quantity < part.min_threshold ? 'Low Stock' : 'In Stock';
    const now = new Date().toISOString();

    await dbClient.run(`
      UPDATE inventory_parts 
      SET stock_quantity = ?, status = ?, last_restocked = ?
      WHERE id = ?
    `, quantity, status, now, id);

    const updated: any = await dbClient.get('SELECT * FROM inventory_parts WHERE id = ?', id);
    return {
      id: updated.id,
      partCode: updated.part_code,
      name: updated.name,
      category: updated.category,
      stockQuantity: updated.stock_quantity,
      minThreshold: updated.min_threshold,
      unitCost: updated.unit_cost,
      status: updated.status,
      lastRestocked: updated.last_restocked,
      createdAt: updated.created_at,
    } as InventoryPart;
  }

  async deleteInventoryPart(id: string): Promise<boolean> {
    const result = await dbClient.run('DELETE FROM inventory_parts WHERE id = ?', id);
    return result.changes > 0;
  }

  // -------------------------------------------------------------------------
  // CMS
  // -------------------------------------------------------------------------

  async getCms(): Promise<CmsContent[]> {
    const rows = await dbClient.all(`
      SELECT id, title, type, content, target_audience as targetAudience, 
             target_device_id as targetDeviceId, active, scheduled_from as scheduledFrom,
             scheduled_to as scheduledTo, created_at as createdAt
      FROM cms_content
      ORDER BY created_at DESC
    `);

    return rows.map((r: any) => ({ ...r, active: r.active === 1 })) as CmsContent[];
  }

  async addCms(data: any): Promise<CmsContent> {
    const id = `CMS-${Date.now()}`;
    const now = new Date().toISOString();

    await dbClient.run(`
      INSERT INTO cms_content (id, title, type, content, target_audience, target_device_id, 
                               active, scheduled_from, scheduled_to, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `,
      id, data.title, data.type, data.content, data.targetAudience, data.targetDeviceId || null,
      data.active ? 1 : 0, data.scheduledFrom, data.scheduledTo, now
    );

    const cms: any = await dbClient.get('SELECT * FROM cms_content WHERE id = ?', id);
    return {
      id: cms.id,
      title: cms.title,
      type: cms.type,
      content: cms.content,
      targetAudience: cms.target_audience,
      targetDeviceId: cms.target_device_id,
      active: cms.active === 1,
      scheduledFrom: cms.scheduled_from,
      scheduledTo: cms.scheduled_to,
      createdAt: cms.created_at,
    } as CmsContent;
  }

  async toggleCms(id: string): Promise<CmsContent | null> {
    const cms: any = await dbClient.get('SELECT active FROM cms_content WHERE id = ?', id);
    if (!cms) return null;

    const newActive = cms.active === 1 ? 0 : 1;
    await dbClient.run('UPDATE cms_content SET active = ? WHERE id = ?', newActive, id);

    const updated: any = await dbClient.get('SELECT * FROM cms_content WHERE id = ?', id);
    return {
      id: updated.id,
      title: updated.title,
      type: updated.type,
      content: updated.content,
      targetAudience: updated.target_audience,
      targetDeviceId: updated.target_device_id,
      active: updated.active === 1,
      scheduledFrom: updated.scheduled_from,
      scheduledTo: updated.scheduled_to,
      createdAt: updated.created_at,
    } as CmsContent;
  }

  async deleteCms(id: string): Promise<boolean> {
    const result = await dbClient.run('DELETE FROM cms_content WHERE id = ?', id);
    return result.changes > 0;
  }

  // -------------------------------------------------------------------------
  // PREDICTIVE ALERTS
  // -------------------------------------------------------------------------

  async getPredictiveAlerts(): Promise<PredictiveAlert[]> {
    const rows = await dbClient.all(`
      SELECT id, device_id as deviceId, device_model as deviceModel, customer_name as customerName,
             risk_level as riskLevel, risk_factor as riskFactor, unexpected_restarts as unexpectedRestarts,
             temperature_c as temperatureC, uptime_hours as uptimeHours, 
             recommended_action as recommendedAction, created_at as createdAt
      FROM predictive_alerts
      ORDER BY created_at DESC
    `);

    return rows as PredictiveAlert[];
  }

  async simulateTelemetryAnomaly(deviceId: string, tempSpike: number, restartSpike: number): Promise<PredictiveAlert | null> {
    const device: any = await this.getDeviceById(deviceId);
    if (!device) return null;

    // Update device telemetry
    await dbClient.run(`
      UPDATE devices 
      SET temperature_c = ?, restarts_last_7_days = ?
      WHERE id = ?
    `, tempSpike, restartSpike, deviceId);

    // Create alert
    const id = `PRED-${Date.now()}`;
    const riskLevel = tempSpike > 80 || restartSpike > 10 ? 'High' : 'Moderate';
    const riskFactor = `Simulated Anomaly: Temp ${tempSpike}°C, ${restartSpike} restarts`;
    const action = 'Dispatch technician for immediate inspection.';

    await dbClient.run(`
      INSERT INTO predictive_alerts (
        id, device_id, device_model, customer_name, risk_level, risk_factor,
        unexpected_restarts, temperature_c, uptime_hours, recommended_action
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `,
      id, deviceId, device.model, device.customerName, riskLevel, riskFactor,
      restartSpike, tempSpike, 0, action
    );

    const alert: any = await dbClient.get('SELECT * FROM predictive_alerts WHERE id = ?', id);
    return {
      id: alert.id,
      deviceId: alert.device_id,
      deviceModel: alert.device_model,
      customerName: alert.customer_name,
      riskLevel: alert.risk_level,
      riskFactor: alert.risk_factor,
      unexpectedRestarts: alert.unexpected_restarts,
      temperatureC: alert.temperature_c,
      uptimeHours: alert.uptime_hours,
      recommendedAction: alert.recommended_action,
      timestamp: alert.created_at,
    } as PredictiveAlert;
  }

  // -------------------------------------------------------------------------
  // AUDIT LOGS
  // -------------------------------------------------------------------------

  async getAuditLogs(deviceId?: string): Promise<AuditLog[]> {
    let query = `
      SELECT id, device_id as deviceId, user_name as userName, action, details, timestamp
      FROM audit_logs
    `;
    const params: any[] = [];

    if (deviceId) {
      query += ' WHERE device_id = ?';
      params.push(deviceId);
    }

    query += ' ORDER BY timestamp DESC LIMIT 100';

    const rows = await dbClient.all(query, params);
    return rows as AuditLog[];
  }

  async addAuditLog(userName: string, action: string, details: string = '', deviceId: string | null = null): Promise<void> {
    const id = `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    await dbClient.run(`
      INSERT INTO audit_logs (id, device_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, deviceId, userName, action, details, now);
  }

  // -------------------------------------------------------------------------
  // DASHBOARD STATS
  // -------------------------------------------------------------------------

  async getDashboardStats(): Promise<DashboardStats> {
    const devices = await this.getDevices();
    const tickets = await this.getTickets();
    const customers = await this.getCustomers();

    const onlineDevices = devices.filter((d) => d.status === 'online').length;
    const offlineDevices = devices.filter((d) => d.status === 'offline').length;
    const problemDevices = devices.filter((d) => d.status === 'warning' || d.status === 'maintenance').length;
    const pendingRepairs = tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed').length;

    // Count devices by model
    const modelCounts: Record<string, number> = {};
    devices.forEach(d => {
      modelCounts[d.model] = (modelCounts[d.model] || 0) + 1;
    });

    const popularModels = Object.entries(modelCounts).map(([model, count]) => ({
      model,
      count,
      percentage: parseFloat(((count / Math.max(devices.length, 1)) * 100).toFixed(1))
    })).sort((a, b) => b.count - a.count);

    // Count ticket categories
    const categoryCounts: Record<string, number> = {};
    tickets.forEach(t => {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    });

    const commonProblems = Object.entries(categoryCounts).map(([category, count]) => ({
      category,
      percentage: parseFloat(((count / Math.max(tickets.length, 1)) * 100).toFixed(0))
    })).sort((a, b) => b.percentage - a.percentage);

    // Calculate fleet health score
    const healthScore = devices.length > 0 
      ? parseFloat((((onlineDevices / devices.length) * 100)).toFixed(1))
      : 100;

    return {
      onlineDevices,
      offlineDevices,
      problemDevices,
      pendingRepairs,
      unitsSold: devices.length,
      schoolsCount: customers.filter(c => c.clientType === 'school').length,
      corporateCount: customers.filter(c => c.clientType === 'corporate').length,
      fleetHealthScore: healthScore,
      popularModels,
      commonProblems,
    };
  }
}

// ---------------------------------------------------------------------------
// Export singleton instance
// ---------------------------------------------------------------------------
export const db = new MillenniumDatabase();
