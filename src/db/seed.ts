// ==========================================================================
// Millennium SmartBoard Management System — SQLite Seed Script
// Run once after installing:  npm run db:seed
// ==========================================================================

import { db } from './database.js';

function hashPassword(plaintext: string): string {
  let hash = 5381;
  for (let i = 0; i < plaintext.length; i++) {
    hash = ((hash << 5) + hash) ^ plaintext.charCodeAt(i);
  }
  return 'MHASH_' + Math.abs(hash).toString(16).padStart(8, '0');
}

async function seed() {
  console.log('\n🌱 Millennium SmartBoard — SQLite Seed Script');
  console.log('============================================\n');

  // ── 1. Initialize Schema ──────────────────────────────────────────────
  console.log('📦 Initializing database schema...');
  db.initSchema();

  // Check if database already has data (idempotent seeding)
  const existingUsers = await db.getUsers();
  if (existingUsers.length > 0) {
    console.log('✅ Database already seeded. Skipping...\n');
    console.log('============================================');
    console.log('✅ Database is ready!');
    console.log('');
    console.log('   Demo login credentials:');
    console.log('   Admin      — admin / Admin@2026!');
    console.log('   Technician — jsantos / Tech@2026!');
    console.log('   Customer   — abcuniv / School@2026!');
    console.log('============================================\n');
    return;
  }

  // ── 2. Seed Users ─────────────────────────────────────────────────────
  console.log('👤 Seeding users...');
  const users = [
    { id: 'USR-ADMIN-001', username: 'admin', email: 'admin@brains.asia', password: 'Admin@2026!', fullName: 'System Administrator', role: 'admin', location: 'All Locations', organization: 'Brains Infinite Innovations Inc.' },
    { id: 'USR-ADMIN-002', username: 'manager', email: 'manager@brains.asia', password: 'Manager@2026!', fullName: 'Operations Manager', role: 'admin', location: 'Quezon City', organization: 'Brains Infinite Innovations Inc.' },
    { id: 'USR-TECH-001', username: 'jsantos', email: 'john.santos@brains.asia', password: 'Tech@2026!', fullName: 'John Santos', role: 'technician', location: 'Taguig (BGC)', organization: 'Brains Infinite Innovations Inc.' },
    { id: 'USR-TECH-002', username: 'amendoza', email: 'arnel.mendoza@brains.asia', password: 'Tech@2026!', fullName: 'Arnel Mendoza', role: 'technician', location: 'Quezon City', organization: 'Brains Infinite Innovations Inc.' },
    { id: 'USR-CUST-001', username: 'abcuniv', email: 'it@abcuniversity.edu.ph', password: 'School@2026!', fullName: 'ABC University IT Office', role: 'customer', location: 'Quezon City', organization: 'ABC University' },
    { id: 'USR-CUST-002', username: 'ayalaland', email: 'smartroom@ayalaland.com.ph', password: 'Corp@2026!', fullName: 'Ayala Land Facilities', role: 'customer', location: 'Makati', organization: 'Ayala Land Inc.' },
  ];

  await Promise.all(users.map(u => db.registerUser(u)));
  console.log(`   ✅ ${users.length} users seeded.\n`);

  // ── 3. Seed Customers ─────────────────────────────────────────────────
  console.log('🏫 Seeding customers...');
  const customers = [
    { id: 'CUST-001', organizationName: 'ABC University', clientType: 'school', city: 'Quezon City' },
    { id: 'CUST-002', organizationName: 'XYZ International School', clientType: 'school', city: 'Taguig (BGC)' },
    { id: 'CUST-003', organizationName: 'Ateneo Innovation Hub', clientType: 'school', city: 'Quezon City' },
    { id: 'CUST-004', organizationName: 'Ayala Land Headquarters', clientType: 'corporate', city: 'Makati' },
    { id: 'CUST-005', organizationName: 'San Miguel Corporation', clientType: 'corporate', city: 'Mandaluyong' },
    { id: 'CUST-006', organizationName: 'De La Salle University', clientType: 'school', city: 'Manila' },
    { id: 'CUST-007', organizationName: 'BDO Unibank Corporate Center', clientType: 'corporate', city: 'Pasig (Ortigas)' },
    { id: 'CUST-008', organizationName: 'University of Santo Tomas', clientType: 'school', city: 'Manila' },
    { id: 'CUST-009', organizationName: 'Globe Telecom Plaza', clientType: 'corporate', city: 'Taguig (BGC)' },
    { id: 'CUST-010', organizationName: 'University of the Philippines Diliman', clientType: 'school', city: 'Quezon City' },
  ];

  await Promise.all(customers.map(c => db.addCustomer(c as any)));
  console.log(`   ✅ ${customers.length} customers seeded.\n`);

  // ── 4. Seed Devices ───────────────────────────────────────────────────
  console.log('🖥️  Seeding devices...');
  const devices = [
    { id: 'MIL-2026-00125', serialNumber: 'SN-MIL86-2026-00125', model: 'Millennium 86"', customerId: 'CUST-001', customerName: 'ABC University', clientType: 'school', location: 'Main Building, Lecture Hall 4A', city: 'Quezon City', latitude: 14.6538, longitude: 121.0685, status: 'online', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i7-12700 / 16GB / 512GB NVMe SSD', ipAddress: '192.168.10.45', screenLocked: false, powerScheduleOn: '07:30', powerScheduleOff: '18:00', firmwareVersion: 'v4.2.1-stable', installedAt: '2026-01-15', restartsLast7Days: 1, temperatureC: 46.5, cpuUsagePct: 24, ramUsagePct: 48, storageUsagePct: 35, touchLatencyMs: 4.2, wallpaperUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-86-0021', serialNumber: 'SN-MIL86-2025-00021', model: 'Millennium 86"', customerId: 'CUST-002', customerName: 'XYZ International School', clientType: 'school', location: 'STEM Innovation Center, Room 201', city: 'Taguig (BGC)', latitude: 14.5547, longitude: 121.0494, status: 'warning', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i7-12700 / 32GB / 1TB NVMe SSD', ipAddress: '192.168.20.104', screenLocked: false, powerScheduleOn: '07:00', powerScheduleOff: '17:30', firmwareVersion: 'v4.1.8', installedAt: '2025-08-10', restartsLast7Days: 6, temperatureC: 68.2, cpuUsagePct: 78, ramUsagePct: 82, storageUsagePct: 71, touchLatencyMs: 18.5, wallpaperUrl: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-2026-0088', serialNumber: 'SN-MIL75-2025-00088', model: 'Millennium 75"', customerId: 'CUST-003', customerName: 'Ateneo Innovation Hub', clientType: 'school', location: 'Science Complex, Lab B', city: 'Quezon City', latitude: 14.6392, longitude: 121.0776, status: 'warning', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i7-12700 / 16GB / 512GB NVMe SSD', ipAddress: '192.168.30.55', screenLocked: false, powerScheduleOn: '08:00', powerScheduleOff: '19:00', firmwareVersion: 'v4.1.5', installedAt: '2025-09-20', restartsLast7Days: 12, temperatureC: 84.1, cpuUsagePct: 89, ramUsagePct: 91, storageUsagePct: 88, touchLatencyMs: 28.0, wallpaperUrl: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-2026-0054', serialNumber: 'SN-MIL75-2026-00054', model: 'Millennium 75"', customerId: 'CUST-004', customerName: 'Ayala Land Headquarters', clientType: 'corporate', location: 'Executive Tower, Boardroom Alpha', city: 'Makati', latitude: 14.5547, longitude: 121.0244, status: 'online', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i9-12900 / 32GB / 1TB NVMe SSD', ipAddress: '10.50.12.18', screenLocked: false, powerScheduleOn: '08:30', powerScheduleOff: '20:00', firmwareVersion: 'v4.2.1-stable', installedAt: '2026-03-10', restartsLast7Days: 0, temperatureC: 44.0, cpuUsagePct: 18, ramUsagePct: 39, storageUsagePct: 22, touchLatencyMs: 3.8, wallpaperUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-65-0102', serialNumber: 'SN-MIL65-2024-00102', model: 'Millennium 65"', customerId: 'CUST-005', customerName: 'San Miguel Corporation', clientType: 'corporate', location: 'Treasury Dept, Conference Room 3', city: 'Mandaluyong', latitude: 14.5832, longitude: 121.0583, status: 'online', osVersion: 'Android 12 / Windows 10 Pro', opsSpec: 'Intel Core i5-11400 / 16GB / 256GB SSD', ipAddress: '10.10.8.92', screenLocked: true, powerScheduleOn: '08:00', powerScheduleOff: '17:00', firmwareVersion: 'v4.0.9', installedAt: '2024-02-18', restartsLast7Days: 2, temperatureC: 51.0, cpuUsagePct: 35, ramUsagePct: 62, storageUsagePct: 81, touchLatencyMs: 5.5, wallpaperUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-86-0310', serialNumber: 'SN-MIL86-2025-00310', model: 'Millennium 86"', customerId: 'CUST-006', customerName: 'De La Salle University', clientType: 'school', location: 'Henry Sy Sr. Hall, Amphitheater 1', city: 'Manila', latitude: 14.5649, longitude: 120.9932, status: 'online', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i7-12700 / 32GB / 512GB SSD', ipAddress: '192.168.105.12', screenLocked: false, powerScheduleOn: '07:30', powerScheduleOff: '21:00', firmwareVersion: 'v4.2.1-stable', installedAt: '2025-11-04', restartsLast7Days: 0, temperatureC: 47.8, cpuUsagePct: 32, ramUsagePct: 54, storageUsagePct: 40, touchLatencyMs: 4.1, wallpaperUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-75-0211', serialNumber: 'SN-MIL75-2024-00211', model: 'Millennium 75"', customerId: 'CUST-007', customerName: 'BDO Unibank Corporate Center', clientType: 'corporate', location: 'FinTech Strategy Floor, Room 14B', city: 'Pasig (Ortigas)', latitude: 14.5866, longitude: 121.0617, status: 'offline', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i7-12700 / 16GB / 512GB SSD', ipAddress: '10.80.3.44', screenLocked: false, powerScheduleOn: '08:00', powerScheduleOff: '19:00', firmwareVersion: 'v4.1.9', installedAt: '2024-06-15', restartsLast7Days: 8, temperatureC: 0.0, cpuUsagePct: 0, ramUsagePct: 0, storageUsagePct: 65, touchLatencyMs: 0.0, wallpaperUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-86-0415', serialNumber: 'SN-MIL86-2025-00415', model: 'Millennium 86"', customerId: 'CUST-008', customerName: 'University of Santo Tomas', clientType: 'school', location: 'Faculty of Engineering, Audio-Visual 2', city: 'Manila', latitude: 14.6095, longitude: 120.9898, status: 'maintenance', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i7-12700 / 16GB / 512GB SSD', ipAddress: '192.168.140.22', screenLocked: true, powerScheduleOn: '07:30', powerScheduleOff: '18:30', firmwareVersion: 'v4.1.8', installedAt: '2025-07-22', restartsLast7Days: 4, temperatureC: 55.4, cpuUsagePct: 45, ramUsagePct: 60, storageUsagePct: 52, touchLatencyMs: 12.0, wallpaperUrl: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-65-0332', serialNumber: 'SN-MIL65-2025-00332', model: 'Millennium 65"', customerId: 'CUST-009', customerName: 'Globe Telecom Plaza', clientType: 'corporate', location: 'Agile Collab Space 7', city: 'Taguig (BGC)', latitude: 14.5492, longitude: 121.0507, status: 'online', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i5-12500 / 16GB / 512GB SSD', ipAddress: '10.90.15.71', screenLocked: false, powerScheduleOn: '08:00', powerScheduleOff: '20:00', firmwareVersion: 'v4.2.1-stable', installedAt: '2025-10-12', restartsLast7Days: 1, temperatureC: 45.1, cpuUsagePct: 28, ramUsagePct: 52, storageUsagePct: 38, touchLatencyMs: 4.0, wallpaperUrl: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80' },
    { id: 'MIL-86-0520', serialNumber: 'SN-MIL86-2026-00520', model: 'Millennium 86"', customerId: 'CUST-010', customerName: 'University of the Philippines Diliman', clientType: 'school', location: 'Institute of Computer Science, Room 301', city: 'Quezon City', latitude: 14.6537, longitude: 121.0694, status: 'online', osVersion: 'Android 13 / Windows 11 Pro', opsSpec: 'Intel Core i9-12900 / 32GB / 1TB SSD', ipAddress: '192.168.200.88', screenLocked: false, powerScheduleOn: '08:00', powerScheduleOff: '21:00', firmwareVersion: 'v4.2.1-stable', installedAt: '2026-02-01', restartsLast7Days: 0, temperatureC: 43.5, cpuUsagePct: 22, ramUsagePct: 41, storageUsagePct: 29, touchLatencyMs: 3.9, wallpaperUrl: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1200&q=80' },
  ];

  await Promise.all(devices.map(d => db.addDevice(d)));
  console.log(`   ✅ ${devices.length} devices seeded.\n`);

  // ── 5. Seed Inventory Parts ───────────────────────────────────────────
  console.log('📦 Seeding inventory parts...');
  const parts = [
    { id: 'PART-001', partCode: 'TF-86-PRO', name: 'Touch Frame 86" Zero-Gap IR', category: 'Display & Touch', stockQuantity: 15, minThreshold: 5, unitCost: 14500, status: 'In Stock', lastRestocked: '2026-08-15' },
    { id: 'PART-002', partCode: 'RC-MIL-BT', name: 'Millennium Remote Control & Air Mouse', category: 'Accessories', stockQuantity: 43, minThreshold: 10, unitCost: 1200, status: 'In Stock', lastRestocked: '2026-09-01' },
    { id: 'PART-003', partCode: 'OPS-I7-12G', name: 'OPS i7-12700 Module (16GB/512GB)', category: 'Computing (OPS)', stockQuantity: 6, minThreshold: 4, unitCost: 38500, status: 'Low Stock', lastRestocked: '2026-07-20' },
    { id: 'PART-004', partCode: 'CAM-4K-AI', name: '4K AI Auto-Framing Conference Camera', category: 'AV Equipment', stockQuantity: 12, minThreshold: 5, unitCost: 9800, status: 'In Stock', lastRestocked: '2026-08-10' },
    { id: 'PART-005', partCode: 'PWR-BD-350W', name: 'High-Efficiency Power Board 350W', category: 'Power & Mainboard', stockQuantity: 2, minThreshold: 5, unitCost: 6500, status: 'Out of Stock', lastRestocked: '2026-06-12' },
    { id: 'PART-006', partCode: 'PEN-DUO-MAG', name: 'Dual-Tip Magnetic Passive Stylus Set', category: 'Accessories', stockQuantity: 58, minThreshold: 15, unitCost: 850, status: 'In Stock', lastRestocked: '2026-09-02' },
  ];

  await Promise.all(parts.map(p => db.updatePartStock(p.id, p.stockQuantity).then(() => p)));
  console.log(`   ✅ ${parts.length} inventory parts seeded.\n`);

  // ── 6. Seed Service Tickets ───────────────────────────────────────────
  console.log('🔧 Seeding service tickets...');
  const tickets = [
    { deviceId: 'MIL-86-0021', deviceModel: 'Millennium 86"', customerId: 'CUST-002', customerName: 'XYZ International School', title: 'Touchscreen lag & ghost touch in upper right quadrant', description: 'Teacher reported intermittent dead zones and ghost touch clicks during morning physics class.', category: 'Touchscreen', priority: 'High', status: 'Diagnosing', assignedTechnician: 'John Santos (Senior Tech)', technicianNotes: 'Investigating optical IR touch frame.', warrantyCovered: true },
    { deviceId: 'MIL-2026-0088', deviceModel: 'Millennium 75"', customerId: 'CUST-003', customerName: 'Ateneo Innovation Hub', title: 'Frequent automatic restarts & thermal throttle warning', description: 'AI Predictive Alert. Telemetry indicates 12 unexpected restarts in 7 days with core temp reaching 84.1°C.', category: 'OPS Hardware', priority: 'Critical', status: 'Received', assignedTechnician: 'Mark Dela Cruz', technicianNotes: 'Preventive ticket created from AI engine.', warrantyCovered: true },
    { deviceId: 'MIL-86-0415', deviceModel: 'Millennium 86"', customerId: 'CUST-008', customerName: 'University of Santo Tomas', title: 'OPS Module Windows OS boot failure (BSOD)', description: 'Windows 11 partition failed to boot after campus power surge.', category: 'Software', priority: 'High', status: 'Repairing', assignedTechnician: 'John Santos (Senior Tech)', technicianNotes: 'NVMe SSD sector corrupted. Re-imaging Windows 11.', warrantyCovered: true },
    { deviceId: 'MIL-65-0102', deviceModel: 'Millennium 65"', customerId: 'CUST-005', customerName: 'San Miguel Corporation', title: 'Replacement remote control and stylus pens requested', description: 'Original infrared remote damaged during conference room renovation.', category: 'Other', priority: 'Low', status: 'Resolved', assignedTechnician: 'Arnel Mendoza', technicianNotes: 'Delivered 1x Remote and 2x Stylus Pens. Tested paired operation.', warrantyCovered: false },
  ];

  await Promise.all(tickets.map(t => db.createTicket(t)));
  console.log(`   ✅ ${tickets.length} tickets seeded.\n`);

  // ── 7. Seed CMS Content ───────────────────────────────────────────────
  console.log('📢 Seeding CMS content...');
  const cms = [
    { title: 'Academic Quarter Exams Schedule 2026', type: 'announcement', content: 'Reminder: First Periodical Examinations will proceed as scheduled on Sept 15-18.', targetAudience: 'schools', active: true, scheduledFrom: '2026-09-10', scheduledTo: '2026-09-20' },
    { title: 'Corporate Townhall Broadcast', type: 'image', content: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1920&q=80', targetAudience: 'corporate', active: true, scheduledFrom: '2026-09-09', scheduledTo: '2026-09-12' },
    { title: 'Emergency Weather Safety Advisory', type: 'emergency', content: 'PAGASA Advisory: Heavy rainfall warning raised. All afternoon classes suspended.', targetAudience: 'all', active: false, scheduledFrom: '2026-09-09', scheduledTo: '2026-09-10' },
  ];

  await Promise.all(cms.map(c => db.addCms(c)));
  console.log(`   ✅ ${cms.length} CMS items seeded.\n`);

  // ── 8. Seed Predictive Alerts ─────────────────────────────────────────
  console.log('🤖 Seeding predictive alerts...');
  await db.simulateTelemetryAnomaly('MIL-2026-0088', 84.1, 12);
  await db.simulateTelemetryAnomaly('MIL-86-0021', 68.2, 6);
  console.log(`   ✅ 3 predictive alerts seeded.\n`);

  console.log('============================================');
  console.log('✅ Database seeded successfully!');
  console.log('');
  console.log('   You can now start the server:  npm run dev');
  console.log('');
  console.log('   Demo login credentials:');
  console.log('   Admin      — admin / Admin@2026!');
  console.log('   Technician — jsantos / Tech@2026!');
  console.log('   Customer   — abcuniv / School@2026!');
  console.log('============================================\n');
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  console.error(err);
  process.exit(1);
});
