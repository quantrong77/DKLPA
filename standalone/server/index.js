/**
 * Chạy ứng dụng ĐKCT độc lập: Postgres của Supabase + Supabase Auth.
 *
 * Biến môi trường (Render → Environment; chạy ở máy thì đặt trong standalone/.env):
 *   DATABASE_URL       chuỗi kết nối Postgres của Supabase (Transaction pooler, cổng 6543)
 *   SUPABASE_URL       https://<mã dự án>.supabase.co
 *   SUPABASE_ANON_KEY  khóa "anon public" (công khai, trình duyệt cũng dùng)
 *   ADMIN_EMAILS       email quản trị viên, cách nhau dấu phẩy
 *   PORT               Render tự đặt
 */
const path = require('node:path');
const { Pool, types } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { createPgDb } = require('../../server/pgDb');
const { createApp, APP_TABLE_TEXT } = require('./app');

try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* không có file .env: dùng biến môi trường */ }

const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Thiếu biến môi trường: ${missing.join(', ')}`);
  process.exit(1);
}

// TIMESTAMP giữ dạng chuỗi "YYYY-MM-DD HH:MM:SS" như SQLite/ChatLan; COUNT(*) (BIGINT) -> number
types.setTypeParser(1114, (v) => v);
types.setTypeParser(20, (v) => Number(v));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase bắt buộc SSL
  max: 5
});
pool.on('error', (err) => console.error('[pg]', err.message));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function verifyToken(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const u = data.user;
  return { id: u.id, email: u.email || '', fullName: u.user_metadata?.full_name || '' };
}

const { app, migrate } = createApp({
  db: createPgDb(pool, { names: [APP_TABLE_TEXT] }),
  verifyToken,
  adminEmails: String(process.env.ADMIN_EMAILS || '').split(','),
  clientDir: path.join(__dirname, '..', 'dist'),
  publicConfig: { supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY }
});

migrate()
  .then(() => {
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => console.log(`ĐKCT đang chạy ở cổng ${port}`));
  })
  .catch((err) => {
    console.error('Không tạo được bảng trong CSDL:', err);
    process.exit(1);
  });
