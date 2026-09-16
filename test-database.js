// Database Connection Test & Fix Script
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

console.log('\n🔍 TESTING DATABASE CONNECTION\n');
console.log('='.repeat(70));

// Check if data directory exists
const dataDir = path.resolve(process.cwd(), 'data');
console.log(`\n📁 Checking data directory: ${dataDir}`);

if (!fs.existsSync(dataDir)) {
  console.log('❌ Data directory does not exist. Creating...');
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✅ Data directory created successfully.');
} else {
  console.log('✅ Data directory exists.');
}

// Check if database file exists
const dbPath = path.join(dataDir, 'millennium.db');
console.log(`\n💾 Checking database file: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.log('❌ Database file does not exist.');
  console.log('   Creating new database...');
} else {
  const stats = fs.statSync(dbPath);
  console.log('✅ Database file exists.');
  console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
}

// Try to connect to database
console.log('\n🔌 Attempting to connect to database...');

let db;
try {
  db = new Database(dbPath);
  console.log('✅ Database connection successful!');
  
  // Enable optimizations
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  console.log('✅ Database pragmas set.');
  
} catch (error) {
  console.error('❌ Failed to connect to database:', error.message);
  process.exit(1);
}

// Test query
console.log('\n🧪 Running test query...');
try {
  const result = db.prepare('SELECT 1 as test').get();
  console.log('✅ Test query successful:', result);
} catch (error) {
  console.error('❌ Test query failed:', error.message);
}

// Check if tables exist
console.log('\n📊 Checking database tables...');
try {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `).all();
  
  if (tables.length === 0) {
    console.log('⚠️  No tables found in database.');
    console.log('   Run: npm run db:seed');
  } else {
    console.log(`✅ Found ${tables.length} tables:`);
    tables.forEach(t => console.log(`   - ${t.name}`));
  }
} catch (error) {
  console.error('❌ Failed to list tables:', error.message);
}

// Check users table
console.log('\n👥 Checking users table...');
try {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  console.log(`✅ Users table exists with ${userCount.count} users.`);
  
  if (userCount.count > 0) {
    const users = db.prepare('SELECT id, username, full_name, email, role FROM users').all();
    console.log('\n   Registered Users:');
    users.forEach(u => {
      console.log(`   • ${u.username} (${u.role}) - ${u.full_name}`);
    });
  } else {
    console.log('⚠️  No users found. Database needs to be seeded.');
  }
} catch (error) {
  console.log('⚠️  Users table does not exist or query failed.');
  console.log('   Run: npm run db:seed');
}

// Check devices table
console.log('\n🖥️  Checking devices table...');
try {
  const deviceCount = db.prepare('SELECT COUNT(*) as count FROM devices').get();
  console.log(`✅ Devices table exists with ${deviceCount.count} devices.`);
} catch (error) {
  console.log('⚠️  Devices table does not exist.');
}

// Check tickets table
console.log('\n🎫 Checking service_tickets table...');
try {
  const ticketCount = db.prepare('SELECT COUNT(*) as count FROM service_tickets').get();
  console.log(`✅ Service tickets table exists with ${ticketCount.count} tickets.`);
} catch (error) {
  console.log('⚠️  Service tickets table does not exist.');
}

// Database health summary
console.log('\n' + '='.repeat(70));
console.log('📋 DATABASE HEALTH SUMMARY\n');

const health = {
  connection: '✅ Connected',
  file_exists: fs.existsSync(dbPath) ? '✅ Yes' : '❌ No',
  file_size: fs.existsSync(dbPath) ? `${(fs.statSync(dbPath).size / 1024).toFixed(2)} KB` : 'N/A',
  tables: 'Unknown',
  users: 'Unknown',
  seeded: 'Unknown'
};

try {
  const tables = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get();
  health.tables = `✅ ${tables.count} tables`;
  
  const users = db.prepare('SELECT COUNT(*) as count FROM users').get();
  health.users = `✅ ${users.count} users`;
  health.seeded = users.count > 0 ? '✅ Yes' : '⚠️  No (run npm run db:seed)';
} catch (error) {
  health.tables = '⚠️  No tables';
  health.seeded = '❌ Not seeded';
}

console.log('Connection Status:', health.connection);
console.log('Database File:   ', health.file_exists);
console.log('File Size:       ', health.file_size);
console.log('Tables Created:  ', health.tables);
console.log('Users Count:     ', health.users);
console.log('Database Seeded: ', health.seeded);

console.log('\n' + '='.repeat(70));

// Recommendations
if (health.seeded.includes('No') || health.seeded.includes('Not')) {
  console.log('\n💡 RECOMMENDATION:');
  console.log('   Your database needs to be seeded with initial data.');
  console.log('   Run this command:');
  console.log('   npm run db:seed\n');
} else {
  console.log('\n✅ DATABASE IS READY!');
  console.log('   Your database is properly configured and seeded.');
  console.log('   You can now start the server with: npm run dev\n');
}

db.close();
console.log('🔒 Database connection closed.\n');
