/**
 * Tự tải lịch cắt điện từ trang Công ty theo giờ hẹn (giờ Việt Nam) rồi nạp, so sánh, báo thay đổi.
 *
 * Cấu hình: admin đặt ở Cài đặt → Tải lịch tự động (services/outageSettings); mặc định lấy biến môi trường
 *   OUTAGE_AUTO_FETCH   giờ tải trong ngày, vd "07:00,15:00" (bỏ trống = tắt)
 *   OUTAGE_AUTO_DAYS    số ngày tới cần tải, tính từ hôm nay (mặc định 14)
 * Cần tài khoản trang lịch (admin đặt hoặc OUTAGE_SOURCE_USER/PASSWORD) và máy chủ vào được mạng nội bộ.
 *
 * Mỗi lần tải giữ một "slot" duy nhất trong dkct_outage_fetches ("auto:YYYY-MM-DD HH:mm"): nhiều tiến trình
 * (hoặc khởi động lại trong cùng phút) cũng chỉ tải một lần.
 */
const { changedRows } = require('../util');
const { vnNow, vnToday } = require('./clock');
const { fetchOutageWorkbook, sourceConfig, configured } = require('./outageSource');

const DEFAULT_DAYS = 14;
const MAX_DAYS = 62;
const TICK_MS = 30 * 1000;
// lỡ giờ hẹn (máy chủ đang ngủ / khởi động lại, vd Render gói miễn phí) thì tải bù khi thức dậy, trong vòng 2 giờ
const CATCH_UP_MIN = 120;
// tải tự động lỗi: thử lại sau 10 phút, tối đa 3 lần mỗi giờ hẹn (vẫn trong khoảng tải bù)
const RETRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Giờ hẹn cần tải lúc `hhmm`: giờ hẹn gần nhất đã tới, chưa quá CATCH_UP_MIN phút (không có -> null). */
function dueTime(times, hhmm) {
  const now = minutesOf(hhmm);
  const due = times.filter(t => minutesOf(t) <= now && now - minutesOf(t) < CATCH_UP_MIN);
  return due.length ? due[due.length - 1] : null;
}

/** "07:00, 15:30" -> ["07:00", "15:30"] (bỏ giờ sai, sắp xếp, không trùng) */
function parseTimes(text) {
  const out = new Set();
  for (const part of String(text || '').split(/[,;\s]+/)) {
    const m = part.match(/^(\d{1,2})[:hH](\d{2})?$/);
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2] || 0);
    if (h < 24 && min < 60) out.add(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return [...out].sort();
}

function autoConfig(options = {}) {
  const env = process.env;
  const times = parseTimes(options.times ?? env.OUTAGE_AUTO_FETCH ?? '');
  const days = Math.min(MAX_DAYS, Math.max(1, Number.parseInt(options.days ?? env.OUTAGE_AUTO_DAYS, 10) || DEFAULT_DAYS));
  return { times, days };
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// id tăng theo thời gian: startedAt chỉ tới phút, hai lần tải trong cùng phút vẫn sắp đúng thứ tự
let runSeq = 0;
const fetchRunId = () => `TLCD-${Date.now().toString(36).padStart(9, '0')}-${(++runSeq % 1679616).toString(36).padStart(4, '0')}-${Math.random().toString(36).slice(2, 6)}`;

/** Ghi một lần tải vào nhật ký (giữ slot); trả id, hoặc null nếu slot đã có người tải. */
async function claimSlot(db, { slot, mode, from, to, actorId, now }) {
  const id = fetchRunId();
  const res = await db.execute(`INSERT IGNORE INTO dkct_outage_fetches (id, slot, mode, fromDate, toDate, startedAt, actorId)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, slot, mode, from, to, vnNow(now), actorId || null]);
  return changedRows(res) ? id : null;
}

async function finishRun(db, id, { ok, result, error, now = new Date() }) {
  const summary = result ? JSON.stringify({
    inserted: result.inserted, updated: result.updated,
    postponed: result.compare?.postponed.length || 0, moved: result.compare?.moved.length || 0,
    edited: result.compare?.edited.length || 0, added: result.compare?.added.length || 0,
    restored: result.compare?.restored?.length || 0, compared: !!result.compare, notified: result.notified || 0, zalo: result.zalo || 0
  }) : null;
  await db.execute('UPDATE dkct_outage_fetches SET finishedAt = ?, ok = ?, rowsCount = ?, summary = ?, error = ? WHERE id = ?',
    [vnNow(now), ok ? 1 : 0, result?.rows ?? null, summary, error ? String(error).slice(0, 1000) : null, id]);
}

/**
 * Tải + nạp một khoảng ngày, ghi nhật ký. `slot` khác nhau cho mỗi lần (tự động: theo giờ hẹn; bấm tay: id ngẫu nhiên).
 * -> kết quả nạp (importParsed) | null nếu slot đã được tải.
 */
async function fetchAndImport({ db, importer, outageSource, from, to, mode, slot, actorId, label, now = new Date(), releaseOnFail = false }) {
  const runId = await claimSlot(db, { slot, mode, from, to, actorId, now });
  if (!runId) return null;
  try {
    const buffer = await fetchOutageWorkbook({ from, to }, outageSource);
    const result = await importer.importParsed(await importer.parseBuffer(buffer),
      { compareFrom: from, compareTo: to, sourceFile: label, actorId: actorId || 'AUTO', trigger: mode, now });
    await finishRun(db, runId, { ok: true, result });
    return result;
  } catch (err) {
    await finishRun(db, runId, { ok: false, error: err.message });
    // tải tự động lỗi (mạng chập chờn, trang Công ty bận): trả slot để lần kiểm tra sau thử lại; nhật ký vẫn giữ lần lỗi
    if (releaseOnFail) await db.execute('UPDATE dkct_outage_fetches SET slot = ? WHERE id = ?', [`${slot}#lỗi:${runId}`.slice(0, 191), runId]);
    throw err;
  }
}

/**
 * Bộ hẹn giờ: mỗi 30 giây (và ngay khi khởi động) xem có giờ hẹn cần tải không. -> { start(), stop(), tick(now), enabled(), config() }
 * Giờ hẹn và tài khoản đọc lại mỗi lần (admin đổi trên giao diện có hiệu lực ngay, không cần khởi động lại).
 * Mỗi giờ hẹn mỗi ngày tải đúng một lần (slot trong CSDL), kể cả tải bù sau khi máy chủ thức dậy.
 * @param settings { autoOptions(), sourceOptions() } (services/outageSettings)
 */
function createAutoFetch({ db, importer, settings, log = console }) {
  let timer = null;
  let running = false;
  // slot đã thử trong tiến trình này { attempts, retryAt, done }: không hỏi CSDL lại mỗi 30 giây; lỗi thì thử lại sau RETRY_MS
  const tried = new Map();

  const config = () => settings.autoOptions();
  async function enabled() {
    const cfg = await config();
    return cfg.times.length > 0 && configured(sourceConfig(await settings.sourceOptions()));
  }

  async function tick(now = new Date()) {
    if (running) return null;
    const hhmm = vnNow(now).slice(11, 16);
    running = true;
    try {
      const cfg = await config();
      const due = dueTime(cfg.times, hhmm);
      if (!due) return null;
      const from = vnToday(now);
      const slot = `auto:${from} ${due}`;
      const seen = tried.get(slot);
      if (seen && (seen.done || seen.attempts >= MAX_ATTEMPTS || now.getTime() < seen.retryAt)) return null;
      const outageSource = await settings.sourceOptions();
      if (!configured(sourceConfig(outageSource))) return null;
      if (tried.size > 50) tried.clear();
      const attempt = { attempts: (seen?.attempts || 0) + 1, retryAt: now.getTime() + RETRY_MS, done: false };
      tried.set(slot, attempt);
      const to = addDays(from, cfg.days - 1);
      const label = `Tự tải ${due} ${from.split('-').reverse().join('/')}${due === hhmm ? '' : ` (tải bù lúc ${hhmm})`}`;
      const result = await fetchAndImport({ db, importer, outageSource, from, to, mode: 'AUTO', slot, label, now, releaseOnFail: true });
      attempt.done = true; // đã tải (hoặc tiến trình khác đã giữ slot)
      if (result) log.info?.(`[dkct] ${label}: ${result.rows} dòng, ${result.logged} thay đổi, báo ${result.notified} người, ${result.zalo || 0} tin Zalo.`);
      return result;
    } catch (err) {
      log.warn?.(`[dkct] Tự tải lịch cắt điện lỗi: ${err.message}`);
      return null;
    } finally {
      running = false;
    }
  }

  return {
    config,
    enabled,
    /** Bật bộ hẹn giờ (luôn chạy; chưa đặt giờ/tài khoản thì mỗi lần kiểm tra không làm gì). */
    start() {
      if (timer) return true;
      timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
      timer.unref?.();
      // vừa khởi động (vd Render thức dậy vì có người gọi): tải bù ngay nếu lỡ giờ hẹn
      setTimeout(() => { tick().catch(() => {}); }, 3000).unref?.();
      config().then(async (cfg) => {
        if (await enabled()) log.info?.(`[dkct] Tự tải lịch cắt điện lúc ${cfg.times.join(', ')} hằng ngày (${cfg.days} ngày tới).`);
      }).catch(() => {});
      return true;
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
    tick
  };
}

module.exports = { createAutoFetch, fetchAndImport, parseTimes, autoConfig, addDays, dueTime, MAX_DAYS, CATCH_UP_MIN, RETRY_MS, MAX_ATTEMPTS };
