const path = require('path');
(async () => {
  const { Pool } = require('pg');
  require('dotenv').config({ path: path.resolve('.env') });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const t = await pool.query("SELECT to_regclass('public.password_reset_codes') AS t");
  console.log('table:', t.rows[0].t);
  const u = await pool.query("SELECT username, email, role FROM users WHERE username='admin'");
  console.log('admin:', JSON.stringify(u.rows[0]));
  const n = await pool.query('SELECT COUNT(*)::int AS n FROM password_reset_codes');
  console.log('codes rows:', n.rows[0].n);
  await pool.end();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
