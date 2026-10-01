/**
 * Module Đăng ký công tác (ĐKCT) cho ChatLan.
 *
 * ChatLan truyền vào kết nối CSDL và các hàm phân quyền của nó; module không tự xác thực:
 *
 *   const dkct = require('dkct-module')({ db, getActor, getProfile, isAdmin, isDepartmentHead, isUnitLead, getUnit, legacyLastIssued });
 *   await dkct.migrate();
 *   app.use('/api/dkct', requireAuth, dkct.router);   // requireAuth gán req.userId
 *
 *  - db: { query, queryOne, execute, isMySQL } (server/src/db.js của ChatLan)
 *  - getActor(userId) -> { id, role, department } ; getProfile(userId) -> { fullName, position, phone, email }
 *  - isAdmin(actor), isDepartmentHead(actor, department), isUnitLead(userId, department)
 *  - getUnit(userId) -> { department, shortName }   (shortName dùng cho số "215/ĐK-TNLĐ")
 *  - legacyLastIssued(department, year) -> số lớn nhất module ĐKCT cũ đã cấp (tùy chọn)
 *  - defaultUnitName: đơn vị cấp trên mặc định khi tổ chưa có giấy nào (tùy chọn)
 *  - listDepartments() -> [{ name, shortName }]: danh sách tổ cho ô "Tổ đăng ký" (tùy chọn)
 *  - outageSource: { url, user, password, fetch } tải lịch cắt điện từ trang Công ty (tùy chọn; mặc định OUTAGE_SOURCE_* trong env)
 */
const express = require('express');
const { migrate } = require('./schema');
const { createPolicy } = require('./policy');
const { createNumbering } = require('./services/numbering');
const { catalogRouter } = require('./routes/catalogs');
const { outageRouter } = require('./routes/outages');
const { registrationRouter } = require('./routes/registrations');
const { surveyRouter } = require('./routes/surveys');
const { drawingRouter } = require('./routes/drawings');
const { planRouter } = require('./routes/plans');
const { confirmationRouter } = require('./routes/confirmations');
const { ctLibraryRouter } = require('./routes/ctLibrary');
const { workflowRouter } = require('./routes/workflow');
const { vnToday } = require('./services/clock');
const { safeParse } = require('./util');

const REQUIRED = ['db', 'getActor', 'getProfile', 'isAdmin', 'isDepartmentHead', 'isUnitLead', 'getUnit'];

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

/** Đơn vị cấp trên khi tổ chưa có giấy nào (đổi được qua deps.defaultUnitName). */
const DEFAULT_UNIT_NAME = 'Đội Sửa chữa, thí nghiệm điện 3';

function createDkctModule(deps) {
  const missing = REQUIRED.filter(k => !deps || !deps[k]);
  if (missing.length) throw new Error(`dkct-module thiếu tham số: ${missing.join(', ')}`);
  const { db, getProfile, getUnit } = deps;
  const policy = createPolicy(deps);
  const numbering = createNumbering(db, deps.legacyLastIssued);

  /** Danh sách tổ cho ô "Tổ đăng ký": [{ name, shortName }] (rỗng nếu ChatLan không cung cấp). */
  async function listDepartments() {
    if (!deps.listDepartments) return [];
    const rows = await deps.listDepartments();
    return (rows || []).filter(d => d && d.name).map(d => ({ name: d.name, shortName: d.shortName || '' }));
  }

  /** Giá trị mặc định của form: tổ đăng ký là tổ của người đang đăng nhập, phần còn lại của đầu giấy
   * lấy theo giấy gần nhất của tổ; người đại diện là người đang đăng nhập. */
  async function buildDraftDefaults(actor) {
    const [profile, last, risks] = await Promise.all([
      getProfile(actor.id),
      db.queryOne('SELECT data FROM dkct_registrations WHERE department = ? ORDER BY createdAt DESC, docSeq DESC LIMIT 1', [actor.department || '']),
      db.query('SELECT hazard, measures, performer FROM dkct_risks WHERE active = 1 ORDER BY sortOrder')
    ]);
    const lastHeader = (last && safeParse(last.data).header) || {};
    const phone = profile?.phone || '';
    const email = profile?.email || '';
    return {
      header: {
        unitName: lastHeader.unitName || deps.defaultUnitName || DEFAULT_UNIT_NAME,
        teamName: actor.department || lastHeader.teamName || '',
        place: lastHeader.place || '',
        date: vnToday(),
        basis: lastHeader.basis || '... (Biên bản khảo sát hiện trường/Đánh giá rủi ro) ...'
      },
      representative: {
        honorific: 'Ông',
        name: profile?.fullName || '',
        role: profile?.position || '',
        contact: phone && email ? `${phone} (${email})` : phone || email
      },
      signatoryName: profile?.fullName || '',
      workUnitCount: 1,
      workUnits: [{ commander: null, members: [], location: '', start: null, end: null }],
      supervisors: [],
      watchmen: [],
      otherUnits: [],
      nominees: [],
      permits: [],
      risks
    };
  }

  const shared = {
    db, policy, wrap, numbering, getUnit, getProfile, buildDraftDefaults, listDepartments,
    defaultUnitName: deps.defaultUnitName || DEFAULT_UNIT_NAME,
    outageSource: deps.outageSource // { url, user, password, fetch } (tùy chọn; mặc định đọc OUTAGE_SOURCE_* trong biến môi trường)
  };
  let migrated = null; // Promise của migrate(): request đến sớm chờ tạo bảng xong
  const router = express.Router();
  router.use((req, res, next) => (migrated ? migrated.then(() => next(), next) : next()));
  router.use(express.json({ limit: '2mb' }));
  router.use(catalogRouter(shared));
  router.use(outageRouter(shared));
  router.use(registrationRouter(shared));
  router.use(surveyRouter(shared));
  router.use(drawingRouter(shared));
  router.use(planRouter(shared));
  router.use(confirmationRouter(shared));
  router.use(ctLibraryRouter(shared));
  router.use(workflowRouter(shared));
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error('[dkct]', err);
    res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ khi xử lý yêu cầu.' : err.message });
  });

  return { router, migrate: () => (migrated = migrate(db)) };
}

module.exports = createDkctModule;
