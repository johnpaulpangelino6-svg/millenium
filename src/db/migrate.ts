// Database Migration Script
// Adds ticket_messages table and assigned_technician_id column

import { config } from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// Load environment variables
config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set in .env file!');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  },
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Starting database migration...\n');

    // 1. Add assigned_technician_id column to service_tickets if it doesn't exist
    console.log('📋 Step 1: Adding assigned_technician_id column to service_tickets...');
    await client.query(`
      ALTER TABLE service_tickets 
      ADD COLUMN IF NOT EXISTS assigned_technician_id TEXT DEFAULT NULL;
    `);
    console.log('   ✅ Column added successfully\n');

    // 2. Add foreign key constraint
    console.log('📋 Step 2: Adding foreign key constraint...');
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_assigned_technician'
        ) THEN
          ALTER TABLE service_tickets 
          ADD CONSTRAINT fk_assigned_technician 
          FOREIGN KEY (assigned_technician_id) 
          REFERENCES users(id) 
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    console.log('   ✅ Foreign key constraint added\n');

    // 3. Create ticket_messages table if it doesn't exist
    console.log('📋 Step 3: Creating ticket_messages table...');
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
    console.log('   ✅ Table created successfully\n');

    // 4. Create indexes for performance
    console.log('📋 Step 4: Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id 
      ON ticket_messages(ticket_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at 
      ON ticket_messages(created_at);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_service_tickets_assigned_technician_id 
      ON service_tickets(assigned_technician_id);
    `);
    console.log('   ✅ Indexes created successfully\n');

    // 5. Verify the changes
    console.log('📋 Step 5: Verifying migration...');
    const ticketsCheck = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'service_tickets' 
      AND column_name = 'assigned_technician_id';
    `);
    
    const messagesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'ticket_messages';
    `);

    if (ticketsCheck.rows.length > 0) {
      console.log('   ✅ assigned_technician_id column exists');
    } else {
      console.log('   ⚠️  assigned_technician_id column not found');
    }

    if (messagesCheck.rows.length > 0) {
      console.log('   ✅ ticket_messages table exists');
    } else {
      console.log('   ⚠️  ticket_messages table not found');
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           🎉 MIGRATION COMPLETED SUCCESSFULLY! 🎉          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log('Your database is now ready for ticket assignment and chat!\n');
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
