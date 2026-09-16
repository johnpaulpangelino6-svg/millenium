// Fix Admin User Access
import Database from 'better-sqlite3';

const db = new Database('data/millennium.db');

// Millennium's custom hash function (matches database.ts)
function hashPassword(plaintext) {
  let hash = 5381;
  for (let i = 0; i < plaintext.length; i++) {
    hash = ((hash << 5) + hash) ^ plaintext.charCodeAt(i);
  }
  return 'MHASH_' + Math.abs(hash).toString(16).padStart(8, '0');
}

console.log('\n🔧 FIXING ADMIN PORTAL ACCESS\n');
console.log('='.repeat(60));

// Check current users
const allUsers = db.prepare('SELECT id, username, full_name, email, role, password_hash FROM users').all();

console.log('\n📊 CURRENT USERS IN DATABASE:\n');
if (allUsers.length === 0) {
  console.log('❌ No users found! Database needs to be seeded.');
} else {
  console.table(allUsers.map(u => ({
    ID: u.id,
    Username: u.username,
    Name: u.full_name,
    Email: u.email,
    Role: u.role
  })));
}

// Check if admin user exists
const admin = db.prepare('SELECT * FROM users WHERE username = ? OR role = ?').get('admin', 'admin');

if (!admin) {
  console.log('\n❌ Admin user not found! Creating new admin user...');
  
  const adminId = `USR-${Date.now()}`;
  const passwordHash = hashPassword('admin123');
  
  db.prepare(`
    INSERT INTO users (id, username, password_hash, full_name, email, role, location, organization, allowed_locations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    adminId,
    'admin',
    passwordHash,
    'System Administrator',
    'admin@brains.asia',
    'admin',
    'Head Office',
    'Brains Infinite Innovations Inc.',
    'all'
  );
  
  console.log('✅ Admin user created successfully!');
  console.log(`   ID: ${adminId}`);
} else {
  console.log('\n✅ Admin user found!');
  console.log(`   ID: ${admin.id}`);
  console.log(`   Username: ${admin.username}`);
  console.log(`   Full Name: ${admin.full_name}`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Role: ${admin.role}`);
  
  // Reset admin password to default
  console.log('\n🔄 Resetting admin password to default...');
  const newPasswordHash = hashPassword('admin123');
  
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(newPasswordHash, admin.id);
  
  console.log('✅ Password reset successfully!');
}

// Verify the password works
const testHash = hashPassword('admin123');
const verifyUser = db.prepare('SELECT * FROM users WHERE username = ? AND password_hash = ?').get('admin', testHash);

console.log('\n🔐 PASSWORD VERIFICATION:');
if (verifyUser) {
  console.log('✅ Password hash matches! Login should work.');
} else {
  console.log('❌ Password verification failed! There may be an issue.');
}

console.log('\n' + '='.repeat(60));
console.log('\n✅ ADMIN LOGIN CREDENTIALS:');
console.log('   Username: admin');
console.log('   Password: admin123');
console.log('   Role: admin');
console.log('\n🌐 Access the portal at: http://localhost:3000');
console.log('   OR deployed at: https://your-render-url.onrender.com\n');

db.close();
