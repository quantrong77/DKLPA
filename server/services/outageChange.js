/**
 * Nhận ra dòng lịch "dời lịch" / "sửa nội dung" khi nạp lại lịch cắt điện.
 *
 * Dấu vân tay (rowHash) của dòng lịch gồm cả giờ và nội dung, nên khi Công ty dời giờ hay sửa chữ, dòng cũ biến mất và
 * một dòng mới xuất hiện. Ở đây ghép cặp dòng cũ đã mất với dòng mới theo địa điểm và độ giống nội dung:
 *  - cùng giờ, chữ khác  -> EDITED (sửa nội dung);
 *  - khác giờ, nội dung giống -> MOVED (dời lịch).
 * Dòng ghép được cập nhật tại chỗ (giữ id) để biên bản, phương án, giấy ĐKCT đã gắn vẫn trỏ đúng dòng lịch.
 */

const { vnNow } = require('./clock');

// dấu đổi hiển thị trên hồ sơ đã gắn (phát sinh không ảnh hưởng hồ sơ đã lập)
const ALERT_KINDS = ['POSTPONED', 'MOVED', 'EDITED'];
// dấu phát sinh / dời / sửa còn hiệu lực bao nhiêu ngày (hoãn: đến khi có lại trong lịch)
const MARK_DAYS = 7;
/** Mốc "YYYY-MM-DDTHH:mm": dấu đặt trước mốc này đã hết hạn. */
const markCutoff = (now = new Date()) => vnNow(new Date(now.getTime() - MARK_DAYS * 86400000));

const norm = (v) => String(v ?? '').normalize('NFC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (v) => new Set(norm(v).split(' ').filter(Boolean));

/** Độ giống hai đoạn chữ (Jaccard theo từ), 0..1; hai đoạn rỗng coi như giống. */
function similarity(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const t of x) if (y.has(t)) both += 1;
  return both / (x.size + y.size - both);
}

const dayGap = (a, b) => Math.abs(Date.parse(String(a).slice(0, 10)) - Date.parse(String(b).slice(0, 10))) / 86400000 || 0;

/** Điểm ghép dòng cũ `o` với dòng mới `r`; null nếu không coi là cùng một công việc. */
function matchScore(o, r) {
  const sameTime = o.regStart === r.regStart && o.regEnd === r.regEnd;
  const sameLocation = norm(o.location) === norm(r.location);
  const content = similarity(o.content, r.content);
  const scope = similarity(o.scope, r.scope);
  if (sameTime) {
    // cùng giờ: chấp nhận sửa chữ nhiều hơn; đổi cả địa điểm thì nội dung phải gần như giữ nguyên
    const ok = sameLocation ? Math.max(content, scope) >= 0.4 : content >= 0.8;
    return ok ? { kind: 'EDITED', score: 2 + content } : null;
  }
  if (!sameLocation || content < 0.6) return null;
  return { kind: 'MOVED', score: 1 + content + 0.2 * scope - Math.min(dayGap(o.regStart, r.regStart), 60) / 100 };
}

/**
 * Ghép từng dòng cũ đã mất (`gone`) với tối đa một dòng mới (`fresh`), ưu tiên cặp điểm cao.
 * -> [{ old, row, kind: 'MOVED' | 'EDITED' }]
 */
function pairChanges(gone, fresh) {
  const candidates = [];
  gone.forEach((o, i) => fresh.forEach((r, j) => {
    const m = matchScore(o, r);
    if (m) candidates.push({ i, j, ...m });
  }));
  candidates.sort((a, b) => b.score - a.score);
  const usedOld = new Set();
  const usedNew = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (usedOld.has(c.i) || usedNew.has(c.j)) continue;
    usedOld.add(c.i);
    usedNew.add(c.j);
    pairs.push({ old: gone[c.i], row: fresh[c.j], kind: c.kind });
  }
  return pairs;
}

// "2026-10-10T08:00" -> "10/10 08:00"
const short = (t) => {
  const m = String(t || '').match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[2]}/${m[1]} ${m[3]}` : String(t || '');
};
const span = (a, b) => (String(a).slice(0, 10) === String(b).slice(0, 10) ? `${short(a)}–${String(b).slice(11, 16)}` : `${short(a)} – ${short(b)}`);

/** Ghi chú ngắn cho một cặp: thời gian cũ -> mới, hoặc các mục chữ đã sửa. */
function changeNote(kind, o, r) {
  if (kind === 'MOVED') return `Dời lịch: ${span(o.regStart, o.regEnd)} → ${span(r.regStart, r.regEnd)}`;
  const fields = [['location', 'địa điểm'], ['content', 'nội dung'], ['scope', 'phạm vi']]
    .filter(([k]) => norm(o[k]) !== norm(r[k])).map(([, label]) => label);
  return `Sửa ${fields.length ? fields.join(', ') : 'cách ghi'} trong lịch`;
}

const IN_CHUNK = 200; // số tham số mỗi câu IN (...): dưới giới hạn biến của SQLite cũ (999)

/** Chạy `sql` có chỗ `{in}` cho từng nhóm giá trị, gộp kết quả. `params` đứng trước các giá trị IN (đặt `?` của chúng trước `{in}`). */
async function queryIn(db, sql, values, params = []) {
  const out = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const part = values.slice(i, i + IN_CHUNK);
    out.push(...await db.query(sql.replace('{in}', part.map(() => '?').join(', ')), [...params, ...part]));
  }
  return out;
}

async function executeIn(db, sql, values, params = []) {
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const part = values.slice(i, i + IN_CHUNK);
    await db.execute(sql.replace('{in}', part.map(() => '?').join(', ')), [...params, ...part]);
  }
}

/**
 * Gắn `outageChange` ({ kind, note, at }) vào các hồ sơ (có outageId) mà dòng lịch đã hoãn / dời / sửa —
 * để danh sách biên bản, phương án, giấy ĐKCT cảnh báo.
 */
async function attachOutageChanges(db, rows) {
  const ids = [...new Set(rows.map(r => r.outageId).filter(Boolean))];
  if (!ids.length) return rows;
  const found = await queryIn(db, `SELECT id, changeKind, changeNote, changeAt FROM dkct_outages
    WHERE (changeKind = 'POSTPONED' OR (changeKind IN ('MOVED', 'EDITED') AND changeAt >= ?)) AND id IN ({in})`, ids, [markCutoff()]);
  const byId = new Map(found.map(o => [o.id, { kind: o.changeKind, note: o.changeNote || '', at: o.changeAt || null }]));
  return rows.map(r => (byId.has(r.outageId) ? { ...r, outageChange: byId.get(r.outageId) } : r));
}

module.exports = { MARK_DAYS, markCutoff, ALERT_KINDS, similarity, matchScore, pairChanges, changeNote, queryIn, executeIn, attachOutageChanges, IN_CHUNK };
