/**
 * Tự tải lịch cắt điện từ trang Công ty theo giờ hẹn (giờ Việt Nam) rồi nạp, so sánh, báo thay đổi.
 *
 * Cấu hình (biến môi trường của máy chủ):
 *   OUTAGE_AUTO_FETCH   giờ tải trong ngày, vd "07:00,15:00" (bỏ trống = tắt)
 *   OUTAGE_AUTO_DAYS    số ngày tới cần tải, tính từ hôm nay (mặc định 14)
 * Cần tài khoản trang lịch (OUTAGE_SOURCE_USER/PASSWORD) và máy chủ vào được mạng nội bộ.
 *
 * Mỗi lần tải giữ một "slot" duy nhất trong dkct_outage_fetches ("auto:YYYY-MM-DD HH:mm"): nhiều tiến trình
 * (hoặc khởi động lại trong cùng phút) cũng chỉ tải một lần.
 */
const { newId } = require('../schema');
const { changedRows } = require('../util');
const { vnNow, vnToday } = require('./clock');
const { fetchOutageWorkbook, sourceConfig, configured } = require('./outageSource');

const DEFAULT_DAYS = 14;
const MAX_DAYS = 62;
const TICK_MS = 30 * 1000;

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

/** Ghi một lần tải vào nhật ký (giữ slot); trả id, hoặc null nếu slot đã có người tải. */
async function claimSlot(db, { slot, mode, from, to, actorId, now }) {
  const id = newId('TLCD');
  const res = await db.execute(`INSERT IGNORE INTO dkct_outage_fetches (id, slot, mode, fromDate, toDate, startedAt, actorId)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, slot, mode, from, to, vnNow(now), actorId || null]);
  return changedRows(res) ? id : null;
}

async function finishRun(db, id, { ok, result, error, now = new Date() }) {
  const summary = result ? JSON.stringify({
    inserted: result.inserted, updated: result.updated,
    postponed: result.compare?.postponed.length || 0, moved: result.compare?.moved.length || 0,
    edited: result.compare?.edited.length || 0, added: result.compare?.added.length || 0,
    restored: result.compare?.restored?.length || 0, compared: !!result.compare, notified: result.notified || 0
  }) : null;
  await db.execute('UPDATE dkct_outage_fetches SET finishedAt = ?, ok = ?, rowsCount = ?, summary = ?, error = ? WHERE id = ?',
    [vnNow(now), ok ? 1 : 0, result?.rows ?? null, summary, error ? String(error).slice(0, 1000) : null, id]);
}

/**
 * Tải + nạp một khoảng ngày, ghi nhật ký. `slot` khác nhau cho mỗi lần (tự động: theo giờ hẹn; bấm tay: id ngẫu nhiên).
 * -> kết quả nạp (importParsed) | null nếu slot đã được tải.
 */
async function fetchAndImport({ db, importer, outageSource, from, to, mode, slot, actorId, label, now = new Date() }) {
  const runId = await claimSlot(db, { slot, mode, from, to, actorId, now });
  if (!runId) return null;
  try {
    const buffer = await fetchOutageWorkbook({ from, to }, outageSource);
    const result = await importer.importParsed(await importer.parseBuffer(buffer),
      { compareFrom: from, compareTo: to, sourceFile: label, actorId: actorId || 'AUTO', now });
    await finishRun(db, runId, { ok: true, result });
    return result;
  } catch (err) {
    await finishRun(db, runId, { ok: false, error: err.message });
    throw err;
  }
}

/**
 * Bộ hẹn giờ: mỗi 30 giây xem đã tới giờ hẹn chưa. -> { config, start(), stop(), tick(now) }
 * Không bật (start trả false) khi chưa đặt giờ hoặc chưa có tài khoản trang lịch.
 */
function createAutoFetch({ db, importer, outageSource, auto, log = console }) {
  const config = autoConfig(auto);
  let timer = null;
  let running = false;

  async function tick(now = new Date()) {
    if (running) return null;
    const hhmm = vnNow(now).slice(11, 16);
    if (!config.times.includes(hhmm)) return null;
    running = true;
    try {
      const from = vnToday(now);
      const to = addDays(from, config.days - 1);
      const label = `Tự tải ${hhmm} ${from.split('-').reverse().join('/')}`;
      const result = await fetchAndImport({ db, importer, outageSource, from, to, mode: 'AUTO', slot: `auto:${from} ${hhmm}`, label, now });
      if (result) log.info?.(`[dkct] ${label}: ${result.rows} dòng, ${result.logged} thay đổi, báo ${result.notified} người.`);
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
    enabled: () => config.times.length > 0 && configured(sourceConfig(outageSource)),
    start() {
      if (timer || !config.times.length || !configured(sourceConfig(outageSource))) return false;
      timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
      timer.unref?.();
      log.info?.(`[dkct] Tự tải lịch cắt điện lúc ${config.times.join(', ')} hằng ngày (${config.days} ngày tới).`);
      return true;
    },
    stop() { if (timer) clearInterval(timer); timer = null; },
    tick
  };
}

module.exports = { createAutoFetch, fetchAndImport, parseTimes, autoConfig, addDays, MAX_DAYS };
