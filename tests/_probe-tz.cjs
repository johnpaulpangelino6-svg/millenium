const path = require('path');
(async () => {
  const { Pool } = require('pg');
  require('dotenv').config({ path: path.resolve('.env') });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await pool.query(`
    SELECT NOW() AS db_now,
           CURRENT_TIMESTAMP AS cur_ts,
           (SELECT created_at FROM password_reset_codes ORDER BY created_at DESC LIMIT 1) AS created_at,
           (SELECT expires_at FROM password_reset_codes ORDER BY created_at DESC LIMIT 1) AS expires_at,
           current_setting('TimeZone') AS tz
  `);
  const row = r.rows[0];
  console.log('DB timezone      :', row.tz);
  console.log('DB NOW()         :', row.db_now);
  console.log('Node now         :', new Date());
  console.log('Node local offset:', new Date().getTimezoneOffset(), 'minutes');
  console.log('row created_at   :', row.created_at);
  console.log('row expires_at   :', row.expires_at);
  if (row.expires_at) {
    const mins = (new Date(row.expires_at).getTime() - Date.now()) / 60000;
    console.log('expires_at - now :', mins.toFixed(1), 'minutes (should be ~10)');
  }
  if (row.created_at) {
    const age = (Date.now() - new Date(row.created_at).getTime()) / 1000;
    console.log('created_at age   :', age.toFixed(0), 'seconds (should be small/positive)');
  }
  await pool.end();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
