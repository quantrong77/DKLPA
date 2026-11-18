/**
 * Chạy bản độc lập ở máy như trên Render (thay khi Render tạm dừng):
 *   - CSDL Supabase thật, đăng nhập thật, tự tải lịch theo giờ hẹn — cùng standalone/.env
 *   - cài thư viện nếu thiếu, build lại giao diện nếu mã nguồn mới hơn bản build (như buildCommand của Render)
 *   - NODE_ENV=production; máy chủ dừng bất thường thì tự chạy lại (như Render khởi động lại dịch vụ)
 *   - in địa chỉ mở từ máy này, mạng LAN và Tailscale (HTTPS: thông báo đẩy, cài lên điện thoại)
 *
 *   npm run local --prefix standalone      (hoặc nhấp đúp Chay-local.cmd ở thư mục gốc)
 *   Cổng: PORT trong standalone/.env, mặc định 3000.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const STANDALONE = path.join(__dirname, '..');
const ROOT = path.join(STANDALONE, '..');
const ENV_FILE = path.join(STANDALONE, '.env');
const log = (...a) => console.log('[chạy máy]', ...a);

if (!fs.existsSync(ENV_FILE)) {
  console.error('Chưa có standalone/.env — chép standalone/.env.example thành .env rồi điền DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_EMAILS.');
  process.exit(1);
}
process.loadEnvFile(ENV_FILE);
const PORT = Number(process.env.PORT) || 3000;

function npm(args, cwd) {
  log(`npm ${args.join(' ')}  (${path.relative(ROOT, cwd) || '.'})`);
  const r = spawnSync(`npm ${args.join(' ')}`, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error(`Lỗi khi chạy npm ${args.join(' ')}`); process.exit(r.status || 1); }
}

/** Thời điểm sửa mới nhất của các tệp trong thư mục (bỏ node_modules, dist). */
function newest(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}

// 1. thư viện (giống Render: gốc không kèm devDependencies, standalone kèm để build giao diện)
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) npm(['ci', '--omit=dev'], ROOT);
if (!fs.existsSync(path.join(STANDALONE, 'node_modules'))) npm(['ci', '--include=dev'], STANDALONE);

// 2. build giao diện khi mã nguồn (client/ của module, standalone/client/) mới hơn bản build
const built = path.join(STANDALONE, 'dist', 'index.html');
const builtAt = fs.existsSync(built) ? fs.statSync(built).mtimeMs : 0;
const sourceAt = Math.max(newest(path.join(ROOT, 'client')), newest(path.join(STANDALONE, 'client')));
if (process.argv.includes('--build') || sourceAt > builtAt) npm(['run', 'build'], STANDALONE);
else log('Giao diện đã build, bỏ qua (thêm --build để build lại).');

// 3. cổng đã có máy chủ dkct chạy thì không chạy thêm
function probe() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/healthz', timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve(res.statusCode === 200 && body.includes('"ok"') ? 'dkct' : 'other'));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function addresses() {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address);
  let tailnet = '';
  const ts = spawnSync('tailscale status --json', { encoding: 'utf8', shell: true, timeout: 5000 });
  try { tailnet = String(JSON.parse(ts.stdout).Self?.DNSName || '').replace(/\.$/, ''); } catch { /* không có Tailscale */ }
  console.log('');
  log(`Máy này:     http://localhost:${PORT}`);
  for (const ip of lan.filter(ip => !ip.startsWith('100.'))) log(`Mạng LAN:    http://${ip}:${PORT}   (không có thông báo đẩy: trình duyệt chỉ cho phép trên HTTPS)`);
  if (tailnet) {
    log(`Tailscale:   http://${tailnet}:${PORT}`);
    log(`HTTPS (thông báo đẩy, cài lên điện thoại): chạy một lần "tailscale serve --bg ${PORT}" rồi mở https://${tailnet}`);
  }
  console.log('');
}

// 4. chạy máy chủ, tự chạy lại khi dừng bất thường (chờ tăng dần, tối đa 60 giây)
let child = null;
let stopping = false;
let delay = 2000;
function start() {
  const startedAt = Date.now();
  child = spawn(process.execPath, ['--use-system-ca', path.join(STANDALONE, 'server', 'index.js')], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) }
  });
  child.on('exit', (code, signal) => {
    if (stopping) process.exit(0);
    if (Date.now() - startedAt > 60_000) delay = 2000; // chạy ổn được một lúc: lần sau chờ ngắn lại
    log(`Máy chủ dừng (${signal || `mã ${code}`}); chạy lại sau ${delay / 1000} giây…`);
    setTimeout(start, delay);
    delay = Math.min(delay * 2, 60_000);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    log('Đang dừng…');
    if (child && child.exitCode === null) child.kill('SIGTERM'); else process.exit(0);
    setTimeout(() => process.exit(0), 12_000).unref();
  });
}

probe().then((state) => {
  if (state === 'dkct') {
    log(`Cổng ${PORT} đã có máy chủ Chuẩn bị công tác đang chạy — không chạy thêm. Dừng bản đó trước nếu muốn chạy lại (vd. sau khi build).`);
    addresses();
    process.exit(0);
  }
  if (state === 'other') {
    console.error(`Cổng ${PORT} đang có chương trình khác dùng. Đặt PORT=<cổng khác> trong standalone/.env.`);
    process.exit(1);
  }
  start();
  setTimeout(addresses, 4000);
});
