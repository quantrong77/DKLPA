/**
 * Nạp lịch cắt điện (file Excel chọn tay, bấm "Tải lịch", hoặc tự tải theo giờ hẹn) — một quy trình dùng chung:
 *   đọc file -> so với lịch đã nạp trong khoảng ngày -> ghi dòng lịch -> đánh dấu thay đổi, ghi lịch sử -> báo người liên quan.
 *
 * Dấu thay đổi trên dòng lịch (changeKind):
 *  - NEW / MOVED / EDITED giữ MARK_DAYS ngày kể từ lúc phát hiện rồi tự hết (lần tải sau không xóa ngay);
 *  - POSTPONED giữ đến khi dòng lịch có lại trong lịch mới (ghi lịch sử RESTORED).
 * Lịch sử (dkct_outage_changes) chỉ ghi khi trạng thái đổi thật, nên tải lặp lại không sinh dòng trùng, không báo lặp.
 */
const { newId } = require('../schema');
const { readOutageWorkbook } = require('./outageExcel');
const { changedRows } = require('../util');
const { vnNow } = require('./clock');
const { pairChanges, changeNote, queryIn, markCutoff, MARK_DAYS } = require('./outageChange');
const { teamResolver, substationsIn, loadTeamAreas, loadTeamStations, loadAreaSubstations } = require('./outageArea');

// tình trạng ghi "Hoãn" trong file lịch
const POSTPONED_STATUS = /ho[ãa]n/i;
const isPostponed = (r) => POSTPONED_STATUS.test(r.status || '');
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const brief = (r) => ({ id: r.id || null, rowHash: r.rowHash, regStart: r.regStart, regEnd: r.regEnd, location: r.location, content: r.content, status: r.status || '' });
const CLEAR = 'changeKind = NULL, changeAt = NULL, changeNote = NULL, prevStart = NULL, prevEnd = NULL';

// id lịch sử tăng dần theo thời gian (sắp xếp đúng thứ tự khi nhiều thay đổi cùng một phút)
let historySeq = 0;
const historyId = () => `LS-${Date.now().toString(36).padStart(9, '0')}-${(++historySeq % 1679616).toString(36).padStart(4, '0')}-${Math.random().toString(36).slice(2, 6)}`;

const KIND_LABEL = { NEW: 'Phát sinh', POSTPONED: 'Hoãn', MOVED: 'Dời lịch', EDITED: 'Sửa nội dung', RESTORED: 'Có lại trong lịch' };

// "2026-10-10T07:00" -> "10/10 07:00"
const short = (t) => {
  const m = String(t || '').match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[2]}/${m[1]} ${m[3]}` : '';
};

/**
 * @param deps.db
 * @param deps.notifyUsers  async ([{ userId, text }]) — gửi tin nhắn (ChatLan); không có thì không báo
 * @param deps.listTeamLeads async (department) -> [userId] — tổ trưởng/tổ phó (nhận báo thay đổi trong khu vực của tổ)
 * @param deps.onChanges     async (events, { source, trigger, describe }) -> số tin đã gửi — báo thêm kênh khác (Zalo);
 *                           trigger: 'AUTO' (tự tải theo giờ hẹn) | 'MANUAL' (bấm tải) | 'UPLOAD' (chọn file)
 * @param deps.log           (message, err) ghi lỗi gửi báo (mặc định console.warn)
 */
function createOutageImporter({ db, notifyUsers, listTeamLeads, onChanges, log = (m, e) => console.warn(m, e?.message || e) }) {
  async function parseBuffer(buffer) {
    const parsed = await readOutageWorkbook(buffer);
    const existing = new Map();
    if (parsed.rows.length) {
      // theo nhóm: file lịch nhiều tháng có thể vượt giới hạn tham số của một câu SQL
      const found = await queryIn(db, 'SELECT id, rowHash FROM dkct_outages WHERE rowHash IN ({in})', parsed.rows.map(r => r.rowHash));
      found.forEach(r => existing.set(r.rowHash, r.id));
    }
    return { parsed, existing };
  }

  /**
   * So file mới với lịch đã nạp trong khoảng [compareFrom, compareTo] (theo ngày bắt đầu đăng ký):
   * - dời lịch / sửa nội dung: dòng đã nạp không còn nguyên văn nhưng file có dòng cùng công việc (pairChanges)
   *   -> cập nhật tại chỗ, giữ id để hồ sơ đã gắn vẫn trỏ đúng;
   * - hoãn: dòng đã nạp không còn và không ghép được, hoặc file ghi tình trạng "Hoãn";
   * - phát sinh: dòng trong file chưa có trước đó và không ghép được;
   * - có lại: dòng đang đánh dấu hoãn nay có lại trong lịch;
   * - không đổi: còn lại. Không có khoảng, hoặc trong khoảng chưa nạp lịch nào -> null (không so sánh).
   */
  async function compareImport(parsed, existing, range) {
    const from = isoDate(range?.compareFrom);
    const to = isoDate(range?.compareTo);
    if (!from || !to || from > to) return null;
    const lo = `${from}T00:00`;
    const hi = `${to}T23:59`;
    const inRange = (r) => r.regStart >= lo && r.regStart <= hi;
    const fileRows = parsed.rows.filter(inRange);
    const byHash = new Map(parsed.rows.map(r => [r.rowHash, r]));
    const before = await db.query(`SELECT id, regStart, regEnd, location, content, scope, status, rowHash, changeKind FROM dkct_outages
      WHERE regStart >= ? AND regStart <= ? ORDER BY regStart`, [lo, hi]);
    if (!before.length) return null; // chưa nạp lịch nào trong khoảng: không có gì để so (không đánh dấu cả file là phát sinh)
    const idOf = new Map(before.map(o => [o.rowHash, o.id]));
    // dòng mới có thể là lịch dời ra ngoài khoảng: ghép với mọi dòng mới của file
    const gone = before.filter(o => !byHash.has(o.rowHash));
    const fresh = parsed.rows.filter(r => !existing.has(r.rowHash) && !isPostponed(r));
    const pairs = pairChanges(gone, fresh);
    const pairedOld = new Set(pairs.map(p => p.old.id));
    const pairedNew = new Set(pairs.map(p => p.row.rowHash));
    const changed = pairs.map(({ old, row, kind }) => ({
      ...brief({ ...row, id: old.id }), kind, reason: changeNote(kind, old, row), prevStart: old.regStart, prevEnd: old.regEnd
    }));
    const postponed = [
      ...gone.filter(o => !pairedOld.has(o.id)).map(o => ({ ...brief(o), reason: 'Không còn trong lịch mới' })),
      ...fileRows.filter(isPostponed).map(r => ({ ...brief({ ...r, id: idOf.get(r.rowHash) || existing.get(r.rowHash) }), reason: `Tình trạng: ${r.status}` }))
    ];
    const restored = before.filter(o => o.changeKind === 'POSTPONED' && byHash.has(o.rowHash) && !isPostponed(byHash.get(o.rowHash)))
      .map(o => ({ ...brief(o), reason: 'Có lại trong lịch mới' }));
    const added = fileRows.filter(r => !existing.has(r.rowHash) && !isPostponed(r) && !pairedNew.has(r.rowHash)).map(r => brief(r));
    return {
      from, to, previous: before.length, postponed, added, restored,
      moved: changed.filter(c => c.kind === 'MOVED'),
      edited: changed.filter(c => c.kind === 'EDITED'),
      unchanged: fileRows.filter(r => existing.has(r.rowHash) && !isPostponed(r)).length
    };
  }

  /** dòng mới (rowHash) -> id dòng cũ được cập nhật tại chỗ (dời lịch / sửa nội dung) */
  const replacementsOf = (cmp) => new Map([...(cmp?.moved || []), ...(cmp?.edited || [])].map(c => [c.rowHash, c.id]));

  /**
   * Ghi các dòng lịch: dòng đã có -> cập nhật tình trạng/giờ thực tế/đơn vị; dòng dời lịch / sửa nội dung
   * (`replace`: rowHash mới -> id dòng cũ) -> ghi đè dòng cũ, giữ id; dòng mới -> thêm.
   */
  async function saveRows(parsed, existing, sourceFile, actorId, replace = new Map()) {
    let inserted = 0;
    let updated = 0;
    const source = String(sourceFile || '').slice(0, 255);
    for (const r of parsed.rows) {
      if (replace.has(r.rowHash)) {
        updated += changedRows(await db.execute(`
          UPDATE dkct_outages SET regStart = ?, regEnd = ?, actualStart = ?, actualEnd = ?, location = ?, content = ?, scope = ?,
            registrationUnit = ?, workUnit = ?, status = ?, rowHash = ?, sourceFile = ? WHERE id = ?`,
        [r.regStart, r.regEnd, r.actualStart, r.actualEnd, r.location, r.content, r.scope,
          r.registrationUnit, r.workUnit, r.status, r.rowHash, source, replace.get(r.rowHash)]));
        continue;
      }
      if (existing.has(r.rowHash)) {
        updated += changedRows(await db.execute(`
          UPDATE dkct_outages SET actualStart = ?, actualEnd = ?, registrationUnit = ?, workUnit = ?, status = ?
          WHERE id = ? AND (COALESCE(actualStart, '') <> COALESCE(?, '') OR COALESCE(actualEnd, '') <> COALESCE(?, '')
            OR COALESCE(registrationUnit, '') <> ? OR COALESCE(workUnit, '') <> ? OR COALESCE(status, '') <> ?)`,
        [r.actualStart, r.actualEnd, r.registrationUnit, r.workUnit, r.status, existing.get(r.rowHash),
          r.actualStart, r.actualEnd, r.registrationUnit, r.workUnit, r.status]));
        continue;
      }
      inserted += changedRows(await db.execute(`
        INSERT IGNORE INTO dkct_outages (id, regStart, regEnd, actualStart, actualEnd, location, content, scope,
          registrationUnit, workUnit, status, rowHash, sourceFile, importedBy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId('LCD'), r.regStart, r.regEnd, r.actualStart, r.actualEnd, r.location, r.content, r.scope,
        r.registrationUnit, r.workUnit, r.status, r.rowHash, source, actorId]));
    }
    return { inserted, updated, skipped: parsed.rows.length - inserted - updated };
  }

  /**
   * Bỏ dấu phát sinh / dời / sửa đã quá MARK_DAYS ngày (dấu hoãn giữ đến khi có lại trong lịch).
   * Gọi khi đọc danh sách: chạy tối đa mỗi phút một lần, trừ khi `force`.
   */
  let lastExpire = 0;
  async function expireMarks(now = new Date(), { force = false } = {}) {
    if (!force && Date.now() - lastExpire < 60 * 1000) return;
    lastExpire = Date.now();
    const cutoff = markCutoff(now);
    await db.execute(`UPDATE dkct_outages SET ${CLEAR} WHERE changeKind IN ('NEW', 'MOVED', 'EDITED') AND changeAt < ?`, [cutoff]);
  }

  /**
   * Ghi dấu so sánh và lịch sử (gọi sau saveRows). Chỉ ghi khi trạng thái đổi thật (khác dấu đang có).
   * -> các sự kiện vừa ghi [{ outageId, kind, note, ... }] (để báo người liên quan)
   */
  async function markChanges(cmp, { source = '', now = new Date() } = {}) {
    const at = vnNow(now);
    // id của dòng vừa thêm (để liên kết tới dòng trong danh sách)
    const lists = [cmp.added, cmp.postponed];
    const hashes = lists.flat().filter(r => !r.id).map(r => r.rowHash);
    if (hashes.length) {
      const rows = await queryIn(db, 'SELECT id, rowHash FROM dkct_outages WHERE rowHash IN ({in})', hashes);
      const ids = new Map(rows.map(r => [r.rowHash, r.id]));
      for (const r of lists.flat()) r.id = r.id || ids.get(r.rowHash) || null;
    }
    const wanted = [
      ...cmp.added.map(r => ({ r, kind: 'NEW', note: '' })),
      ...cmp.postponed.map(r => ({ r, kind: 'POSTPONED', note: r.reason })),
      ...[...cmp.moved, ...cmp.edited].map(r => ({ r, kind: r.kind, note: r.reason })),
      ...(cmp.restored || []).map(r => ({ r, kind: 'RESTORED', note: r.reason }))
    ].filter(w => w.r.id);
    const ids = [...new Set(wanted.map(w => w.r.id))];
    const current = new Map((await queryIn(db, 'SELECT id, changeKind, changeNote, regStart, regEnd FROM dkct_outages WHERE id IN ({in})', ids))
      .map(o => [o.id, o]));
    const events = [];
    for (const { r, kind, note } of wanted) {
      const cur = current.get(r.id);
      if (!cur) continue;
      if (kind === 'RESTORED') {
        if (cur.changeKind !== 'POSTPONED') continue;
        await db.execute(`UPDATE dkct_outages SET ${CLEAR} WHERE id = ?`, [r.id]);
      } else {
        if (cur.changeKind === kind && (cur.changeNote || '') === (note || '')) continue; // đã đánh dấu y như vậy
        const moved = kind === 'MOVED';
        await db.execute('UPDATE dkct_outages SET changeKind = ?, changeAt = ?, changeNote = ?, prevStart = ?, prevEnd = ? WHERE id = ?',
          [kind, at, note || null, moved ? r.prevStart : null, moved ? r.prevEnd : null, r.id]);
      }
      const ev = {
        id: historyId(), outageId: r.id, kind, note: note || '', prevStart: r.prevStart || null, prevEnd: r.prevEnd || null,
        newStart: cur.regStart, newEnd: cur.regEnd, source: String(source || '').slice(0, 255), changedAt: at
      };
      await db.execute(`INSERT INTO dkct_outage_changes (id, outageId, kind, note, prevStart, prevEnd, newStart, newEnd, source, changedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [ev.id, ev.outageId, ev.kind, ev.note, ev.prevStart, ev.prevEnd, ev.newStart, ev.newEnd, ev.source, ev.changedAt]);
      events.push(ev);
    }
    await expireMarks(now, { force: true });
    return events;
  }

  /**
   * Người cần báo cho các sự kiện: [{ userId, text }].
   *  - hoãn / dời / sửa: người lập và tổ trưởng của tổ có biên bản KSHT / phương án / giấy ĐKCT gắn dòng lịch đó;
   *  - mọi thay đổi (cả phát sinh, có lại): tổ trưởng của tổ phụ trách khu vực của dòng lịch.
   */
  /** Dòng lịch, hồ sơ gắn dòng lịch và hàm "tổ phụ trách" cho các sự kiện. */
  async function contextOf(events) {
    const ids = [...new Set(events.map(e => e.outageId))];
    const outages = new Map((await queryIn(db, `SELECT id, regStart, regEnd, location, content, registrationUnit, workUnit
      FROM dkct_outages WHERE id IN ({in})`, ids)).map(o => [o.id, o]));
    const docs = [];
    for (const [table, label, title] of [['dkct_surveys', 'Biên bản KSHT', 'surveyTime'], ['dkct_plans', 'Phương án', 'docNumber'], ['dkct_registrations', 'Giấy ĐKCT', 'docNumber']]) {
      const rows = await queryIn(db, `SELECT id, outageId, department, createdBy, ${title} AS title FROM ${table} WHERE outageId IN ({in})`, ids);
      rows.forEach(d => docs.push({ ...d, label: table === 'dkct_surveys' ? `${label} ${short(d.title) || ''}`.trim() : `${label} ${d.title || ''}`.trim() }));
    }
    // tổ phụ trách: trạm tổ đã tích chọn, tổ chưa tích trạm thì theo khu vực TTĐ
    const known = [...outages.values()].flatMap(o => substationsIn(o.location).strong.map(x => x.key));
    const teamsOf = teamResolver(await loadTeamAreas(db), await loadAreaSubstations(db), await loadTeamStations(db), known);
    return { outages, docs, teamsOf };
  }
  const headOf = (ev, o) => `• ${KIND_LABEL[ev.kind]}: ${short(o.regStart)} ${o.location || ''} — ${String(o.content || '').replace(/\s+/g, ' ').slice(0, 90)}`;
  const noteOf = (ev) => (ev.note && ev.kind !== 'RESTORED' ? `\n   ${ev.note}` : '');

  /**
   * Tóm tắt từng sự kiện cho kênh báo ngoài (Zalo): [{ event, line, teams: [tổ phụ trách / tổ có hồ sơ gắn] }].
   */
  async function describeEvents(events) {
    if (!events.length) return [];
    const { outages, docs, teamsOf } = await contextOf(events);
    const out = [];
    for (const ev of events) {
      const o = outages.get(ev.outageId);
      if (!o) continue;
      const linked = docs.filter(d => d.outageId === ev.outageId);
      const related = linked.length && ['POSTPONED', 'MOVED', 'EDITED'].includes(ev.kind) ? `\n   Hồ sơ liên quan: ${linked.map(d => d.label).join(', ')}` : '';
      out.push({ event: ev, line: `${headOf(ev, o)}${noteOf(ev)}${related}`, teams: [...new Set([...teamsOf(o), ...linked.map(d => d.department)].filter(Boolean))] });
    }
    return out;
  }

  async function recipientsOf(events, source) {
    if (!events.length) return [];
    const { outages, docs, teamsOf } = await contextOf(events);
    const leadsCache = new Map();
    const leadsOf = async (dept) => {
      if (!listTeamLeads || !dept) return [];
      if (!leadsCache.has(dept)) leadsCache.set(dept, await Promise.resolve(listTeamLeads(dept)).catch(() => []) || []);
      return leadsCache.get(dept);
    };

    const perUser = new Map(); // userId -> Map<eventId, line>
    const push = (userId, ev, line) => {
      if (!userId) return;
      if (!perUser.has(userId)) perUser.set(userId, new Map());
      perUser.get(userId).set(ev.id, line);
    };
    for (const ev of events) {
      const o = outages.get(ev.outageId);
      if (!o) continue;
      const linked = docs.filter(d => d.outageId === ev.outageId);
      const head = headOf(ev, o);
      const note = noteOf(ev);
      if (['POSTPONED', 'MOVED', 'EDITED'].includes(ev.kind)) {
        for (const d of linked) {
          const line = `${head}${note}\n   Hồ sơ liên quan: ${linked.filter(x => x.department === d.department).map(x => x.label).join(', ')}`;
          push(d.createdBy, ev, line);
          for (const lead of await leadsOf(d.department)) push(lead, ev, line);
        }
      }
      for (const dept of teamsOf(o)) {
        for (const lead of await leadsOf(dept)) if (!perUser.get(lead)?.has(ev.id)) push(lead, ev, `${head}${note}`);
      }
    }
    const header = `⚡ Lịch cắt điện thay đổi${source ? ` (${source})` : ''}:`;
    return [...perUser].map(([userId, lines]) => ({
      userId, text: `${header}\n${[...lines.values()].join('\n')}\nXem chi tiết: Chuẩn bị công tác → 1. Lịch cắt điện.`
    }));
  }

  async function notifyChanges(events, source) {
    if (!notifyUsers || !events.length) return 0;
    try {
      const messages = await recipientsOf(events, source);
      if (messages.length) await notifyUsers(messages);
      return messages.length;
    } catch (err) {
      log('[dkct] Không gửi được báo thay đổi lịch cắt điện:', err);
      return 0;
    }
  }

  // kênh báo ngoài (Zalo): lỗi không làm hỏng việc nạp lịch
  async function notifyOther(events, source, trigger) {
    if (!onChanges || !events.length) return 0;
    try {
      return Number(await onChanges(events, { source, trigger, describe: describeEvents })) || 0;
    } catch (err) {
      log('[dkct] Không gửi được báo Zalo:', err);
      return 0;
    }
  }

  /** Nạp một file lịch: so sánh (nếu có khoảng), ghi, đánh dấu, ghi lịch sử, báo người liên quan. */
  async function importParsed({ parsed, existing }, { compareFrom, compareTo, sourceFile, actorId, trigger = 'UPLOAD', now = new Date() }) {
    const compare = await compareImport(parsed, existing, { compareFrom, compareTo }); // so với lịch trước khi ghi
    const saved = await saveRows(parsed, existing, sourceFile, actorId, replacementsOf(compare));
    const events = compare ? await markChanges(compare, { source: sourceFile, now }) : [];
    const notified = await notifyChanges(events, sourceFile);
    const zalo = await notifyOther(events, sourceFile, trigger);
    return { ...saved, rows: parsed.rows.length, errors: parsed.errors, compare, logged: events.length, notified, zalo };
  }

  return { parseBuffer, compareImport, saveRows, markChanges, expireMarks, recipientsOf, describeEvents, importParsed };
}

module.exports = { createOutageImporter, MARK_DAYS, KIND_LABEL, isoDate };
