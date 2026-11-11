/**
 * Luồng chuẩn bị công tác của một hồ sơ: lịch cắt điện (hoặc công việc không có lịch) → biên bản KSHT → phương án
 * → giấy ĐKCT → giấy xác nhận.
 * Từ hồ sơ đang chọn, đi theo các liên kết (outageId, workId, surveyId, planId, registrationId) theo cả hai chiều
 * để biết mỗi bước đã có hồ sơ nào. Chỉ đi qua hồ sơ người xem được phép xem (lịch cắt điện dùng chung mọi tổ).
 */
const express = require('express');
const { forbidden } = require('../policy');

const TYPES = {
  outage: { table: 'dkct_outages', columns: 'id, regStart, regEnd, location, content, status, changeKind, changeNote', shared: true },
  work: { table: 'dkct_works', columns: 'id, department, content, stationName, location, startTime, endTime' },
  survey: { table: 'dkct_surveys', columns: 'id, department, surveyTime, stationName, workContent, outageId, workId' },
  plan: { table: 'dkct_plans', columns: 'id, department, docNumber, workTitle, stationName, startTime, surveyId, outageId, workId' },
  registration: { table: 'dkct_registrations', columns: 'id, department, docNumber, workContent, startTime, outageId, workId, surveyId, planId' },
  confirmation: { table: 'dkct_confirmations', columns: 'id, department, docNumber, stationName, bays, workDate, registrationId, planId' }
};
/** Liên kết lưu ở chính hồ sơ (đi lên bước trước). */
const PARENTS = {
  survey: [['outage', 'outageId'], ['work', 'workId']],
  plan: [['outage', 'outageId'], ['work', 'workId'], ['survey', 'surveyId']],
  registration: [['outage', 'outageId'], ['work', 'workId'], ['survey', 'surveyId'], ['plan', 'planId']],
  confirmation: [['registration', 'registrationId'], ['plan', 'planId']]
};
/** Hồ sơ bước sau trỏ về hồ sơ này. */
const CHILDREN = {
  outage: [['survey', 'outageId'], ['plan', 'outageId'], ['registration', 'outageId']],
  work: [['survey', 'workId'], ['plan', 'workId'], ['registration', 'workId']],
  survey: [['plan', 'surveyId'], ['registration', 'surveyId']],
  plan: [['confirmation', 'planId'], ['registration', 'planId']],
  registration: [['confirmation', 'registrationId']]
};
const MAX_NODES = 200;
const ORDER = { outage: 'regStart', work: 'startTime', survey: 'surveyTime', plan: 'startTime', registration: 'startTime', confirmation: 'workDate' };

function workflowRouter({ db, policy, wrap, importer }) {
  const router = express.Router();

  router.get('/workflow/:type/:id', wrap(async (req, res) => {
    const actor = await policy.actorOf(req);
    await importer?.expireMarks(); // cảnh báo lịch cắt điện: bỏ dấu đã hết hạn
    const { type, id } = req.params;
    if (!TYPES[type]) throw Object.assign(new Error('Loại hồ sơ không hợp lệ.'), { status: 400 });
    const visible = (t, row) => TYPES[t].shared || policy.canView(actor, row);

    const found = Object.fromEntries(Object.keys(TYPES).map(t => [t, new Map()]));
    const seen = new Set();
    let pending = { [type]: new Set([String(id)]) };
    let total = 0;
    while (Object.values(pending).some(s => s.size) && total < MAX_NODES) {
      const next = Object.fromEntries(Object.keys(TYPES).map(t => [t, new Set()]));
      for (const [t, ids] of Object.entries(pending)) {
        const fresh = [...ids].filter(x => x && !seen.has(`${t}:${x}`));
        if (!fresh.length) continue;
        fresh.forEach(x => seen.add(`${t}:${x}`));
        const rows = await db.query(`SELECT ${TYPES[t].columns} FROM ${TYPES[t].table} WHERE id IN (${fresh.map(() => '?').join(', ')})`, fresh);
        const shown = rows.filter(r => visible(t, r));
        if (t === type && !found[t].size && !shown.some(r => r.id === id)) {
          if (rows.length) throw forbidden('Hồ sơ này thuộc đơn vị khác.');
          throw Object.assign(new Error('Không tìm thấy hồ sơ.'), { status: 404 });
        }
        for (const r of shown) {
          if (total >= MAX_NODES) break;
          found[t].set(r.id, r);
          total += 1;
          for (const [pt, col] of PARENTS[t] || []) if (r[col]) next[pt].add(r[col]);
        }
        const ok = shown.map(r => r.id);
        for (const [ct, col] of (ok.length ? CHILDREN[t] || [] : [])) {
          const kids = await db.query(`SELECT id FROM ${TYPES[ct].table} WHERE ${col} IN (${ok.map(() => '?').join(', ')})`, ok);
          kids.forEach(k => next[ct].add(k.id));
        }
      }
      pending = next;
    }

    const list = (t) => [...found[t].values()].sort((a, b) => String(a[ORDER[t]] || '').localeCompare(String(b[ORDER[t]] || '')));
    res.json({
      selected: { type, id },
      outages: list('outage'),
      works: list('work'),
      surveys: list('survey'),
      plans: list('plan'),
      registrations: list('registration'),
      confirmations: list('confirmation'),
      truncated: total >= MAX_NODES
    });
  }));

  return router;
}

module.exports = { workflowRouter };
