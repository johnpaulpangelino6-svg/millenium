// ==========================================================================
// Millennium SmartBoard Management System
// Data Migration Script: Local SQLite -> External Cloud Database (Turso)
//
// Usage:
// 1. In .env, set DATABASE_URL and DATABASE_AUTH_TOKEN
// 2. Run: npm run db:migrate-cloud
// ==========================================================================

import 'dotenv/config';
import { createClient } from '@libsql/client';
import path from 'node:path';
import fs from 'node:fs';

async function migrate() {
  console.log('\n================================================================');
  console.log('  🚀 MILLENNIUM DATABASE MIGRATION: Local -> Cloud');
  console.log('================================================================\n');

  const cloudUrl = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  const cloudAuthToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;

  if (!cloudUrl || cloudUrl.trim() === '') {
    console.error('❌ Error: DATABASE_URL is not set in your .env file!');
    console.log('\nTo set up your external cloud database:');
    console.log('1. Go to https://turso.tech (or use Turso CLI)');
    console.log('2. Create a free database (e.g. "millennium-db")');
    console.log('3. Copy your Database URL and Auth Token');
    console.log('4. Add them to your .env file:');
    console.log('   DATABASE_URL=libsql://your-db-name.turso.io');
    console.log('   DATABASE_AUTH_TOKEN=your_auth_token_here');
    console.log('5. Run this command again: npm run db:migrate-cloud\n');
    process.exit(1);
  }

  const localDbPath = path.resolve(process.cwd(), 'data', 'millennium.db');
  if (!fs.existsSync(localDbPath)) {
    console.error(`❌ Local database file not found at: ${localDbPath}`);
    process.exit(1);
  }

  console.log(`📁 Source (Local SQLite):  ${localDbPath}`);
  console.log(`☁️  Target (Cloud Database): ${cloudUrl.replace(/:\/\/.*@/, '://***@')}\n`);

  const localClient = createClient({ url: `file:${localDbPath}` });
  const cloudClient = createClient({
    url: cloudUrl.trim(),
    authToken: cloudAuthToken ? cloudAuthToken.trim() : undefined,
  });

  // 1. Test connections
  try {
    await localClient.execute('SELECT 1');
    console.log('  ✅ Connected to local database');
  } catch (err: any) {
    console.error(`  ❌ Failed to connect to local database: ${err.message}`);
    process.exit(1);
  }

  try {
    await cloudClient.execute('SELECT 1');
    console.log('  ✅ Connected to external cloud database\n');
  } catch (err: any) {
    console.error(`  ❌ Failed to connect to external cloud database: ${err.message}`);
    console.error('     Please check your DATABASE_URL and DATABASE_AUTH_TOKEN.');
    process.exit(1);
  }

  // 2. Initialize schema on cloud database
  console.log('📦 Initializing tables on cloud database...');
  await cloudClient.executeMultiple(`
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

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      device_id TEXT,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('  ✅ Cloud tables ready.\n');

  // 3. Migrate tables
  const tables = [
    'users',
    'customers',
    'devices',
    'warranties',
    'service_tickets',
    'ticket_parts_used',
    'inventory_parts',
    'cms_content',
    'predictive_alerts',
    'audit_logs',
  ];

  console.log('🚚 Transferring data to cloud database...');
  for (const table of tables) {
    const localRows = await localClient.execute(`SELECT * FROM ${table}`);
    if (localRows.rows.length === 0) {
      console.log(`  ⚪ ${table}: 0 records (skipped)`);
      continue;
    }

    const sample = localRows.rows[0];
    const columns = Object.keys(sample);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

    for (const row of localRows.rows) {
      const values = columns.map((col) => (row as any)[col]);
      await cloudClient.execute({ sql, args: values });
    }

    console.log(`  ✅ ${table}: ${localRows.rows.length} records transferred`);
  }

  console.log('\n================================================================');
  console.log('  🎉 MIGRATION COMPLETE!');
  console.log('  Your external cloud database now contains all your data.');
  console.log('================================================================\n');
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
