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
 *  - outageAuto: { times: '07:00,15:00', days: 14 } giờ tự tải lịch (tùy chọn; mặc định OUTAGE_AUTO_FETCH, OUTAGE_AUTO_DAYS)
 *    (admin đổi được tài khoản, mật khẩu, giờ tải trên giao diện; giá trị trên chỉ là mặc định)
 *  - secretKey: khóa mã hóa mật khẩu trang lịch admin lưu (tùy chọn; mặc định DKCT_SECRET_KEY, rồi JWT_SECRET trong env)
 *  - notifyUsers([{ userId, text }]) gửi tin nhắn báo lịch cắt điện thay đổi (tùy chọn; ChatLan: tin nhắn riêng)
 *  - listTeamLeads(department) -> [userId] tổ trưởng/tổ phó nhận báo (tùy chọn)
 *
 * Sau migrate(): dkct.startAutoFetch() bật hẹn giờ tự tải lịch (tải khi đã có giờ hẹn và tài khoản trang lịch).
 */
const express = require('express');
const { migrate } = require('./schema');
const { createPolicy } = require('./policy');
const { createNumbering } = require('./services/numbering');
const { catalogRouter } = require('./routes/catalogs');
const { outageRouter } = require('./routes/outages');
const { zaloRouter } = require('./routes/zalo');
const { workRouter } = require('./routes/works');
const { registrationRouter } = require('./routes/registrations');
const { surveyRouter } = require('./routes/surveys');
const { drawingRouter } = require('./routes/drawings');
const { planRouter } = require('./routes/plans');
const { confirmationRouter } = require('./routes/confirmations');
const { ctLibraryRouter } = require('./routes/ctLibrary');
const { workflowRouter } = require('./routes/workflow');
const { docTemplateRouter } = require('./routes/docTemplates');
const { createTemplateStore } = require('./services/templateStore');
const { renderSurveyDocx } = require('./services/surveyRender');
const { renderPlanDocx } = require('./services/planRender');
const { renderRegistrationDocx } = require('./services/docxRender');
const { renderConfirmationDocx } = require('./services/confirmationRender');
const { vnToday } = require('./services/clock');
const { createOutageImporter } = require('./services/outageImport');
const { createAutoFetch } = require('./services/outageAutoFetch');
const { createOutageSettings } = require('./services/outageSettings');
const { createZaloBot } = require('./services/zaloBot');
const { createWebPush } = require('./services/webPush');
const { createOrgNames } = require('./services/orgNames');
const { orgNamesRouter } = require('./routes/orgNames');
const { createTestPlan } = require('./services/testPlan');
const { testPlanRouter } = require('./routes/testPlan');
const { pushRouter } = require('./routes/push');
const path = require('node:path');
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
    const { unitName } = await shared.orgNames.headerNames(lastHeader, deps.defaultUnitName || DEFAULT_UNIT_NAME);
    const phone = profile?.phone || '';
    const email = profile?.email || '';
    return {
      header: {
        unitName,
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
    defaultUnitName: deps.defaultUnitName || DEFAULT_UNIT_NAME
  };
  // tài khoản trang lịch, giờ tự tải: admin đặt trên giao diện, mặc định deps.outageSource/outageAuto rồi OUTAGE_* trong env
  // khóa mã hóa mật khẩu trang lịch, token Zalo; dùng chung CSDL với ứng dụng khác thì phải cùng khóa
  // (deps.secretKey = '' : không có khóa, không dùng JWT_SECRET của ứng dụng chủ)
  const secretKey = deps.secretKey ?? (process.env.DKCT_SECRET_KEY || process.env.JWT_SECRET || '');
  // tên công ty, đội in trên văn bản mới (admin đổi ở Cài đặt → Tên đơn vị)
  shared.orgNames = createOrgNames(db);
  // kế hoạch thí nghiệm hằng năm (Google Sheet / .xlsx) để lấy hạng mục khi lập phương án
  shared.testPlan = createTestPlan({ db, fetch: deps.testPlanFetch });
  shared.outageSettings = createOutageSettings({ db, source: deps.outageSource, auto: deps.outageAuto, secret: secretKey });
  // báo biến động lịch qua Zalo Bot (admin đặt token, người nhận ở Cài đặt → Thông báo Zalo; mặc định ZALO_BOT_TOKEN)
  shared.zalo = createZaloBot({
    db, secret: secretKey, envToken: deps.zalo?.token ?? process.env.ZALO_BOT_TOKEN ?? '',
    fetch: deps.zalo?.fetch, listDepartments
  });
  // thông báo đẩy tới máy tính / điện thoại (mỗi người tự bật trên thiết bị); khóa VAPID chung trong CSDL
  shared.push = createWebPush({ db, send: deps.pushSend });
  // nạp lịch (chọn file / bấm tải / tự tải) dùng chung một quy trình; tự tải theo giờ hẹn
  shared.importer = createOutageImporter({
    db, notifyUsers: deps.notifyUsers, listTeamLeads: deps.listTeamLeads,
    // Zalo và thông báo đẩy (không lỗi ngược: mỗi kênh tự ghi lỗi); trả về số tin Zalo như trước
    onChanges: async (events, ctx) => (await Promise.all([shared.zalo.onChanges(events, ctx), shared.push.onChanges(events, ctx)]))[0]
  });
  shared.autoFetch = createAutoFetch({ db, importer: shared.importer, settings: shared.outageSettings });
  // mẫu Word: mẫu admin tải lên (đang dùng) hoặc mẫu gốc trong templates/; thử điền bằng văn bản gần nhất
  const SAMPLE_TABLE = {
    survey: ['dkct_surveys', 'Biên bản KSHT', 'NULL'], plan: ['dkct_plans', 'Phương án', 'docNumber'],
    registration: ['dkct_registrations', 'Giấy ĐKCT', 'docNumber'], confirmation: ['dkct_confirmations', 'Giấy xác nhận', 'docNumber']
  };
  shared.templates = createTemplateStore({
    db,
    renderers: {
      survey: (doc, tpl) => renderSurveyDocx({ data: doc.data }, null, tpl),
      plan: (doc, tpl) => renderPlanDocx(doc, [], tpl),
      registration: (doc, tpl) => renderRegistrationDocx(doc, tpl),
      confirmation: (doc, tpl) => renderConfirmationDocx(doc, tpl)
    },
    async sampleOf(kind) {
      const [table, label, number] = SAMPLE_TABLE[kind];
      const row = await db.queryOne(`SELECT ${number} AS docNumber, data FROM ${table} ORDER BY createdAt DESC LIMIT 1`);
      if (!row) return { doc: { docNumber: '', data: {} }, label: 'dữ liệu trống (chưa có văn bản nào)' };
      return { doc: { docNumber: row.docNumber || '', data: safeParse(row.data) }, label: `${label} ${row.docNumber || 'gần nhất'}` };
    }
  });
  let migrated = null; // Promise của migrate(): request đến sớm chờ tạo bảng xong
  const router = express.Router();
  router.use((req, res, next) => (migrated ? migrated.then(() => next(), next) : next()));
  router.use(express.json({ limit: '2mb' }));
  router.use(catalogRouter(shared));
  router.use(outageRouter(shared));
  router.use(zaloRouter(shared));
  router.use(pushRouter(shared));
  router.use(orgNamesRouter(shared));
  router.use(testPlanRouter(shared));
  router.use(workRouter(shared));
  router.use(registrationRouter(shared));
  router.use(surveyRouter(shared));
  router.use(drawingRouter(shared));
  router.use(planRouter(shared));
  router.use(confirmationRouter(shared));
  router.use(ctLibraryRouter(shared));
  router.use(workflowRouter(shared));
  router.use(docTemplateRouter(shared));
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error('[dkct]', err);
    // errors: danh sách chi tiết (vd lỗi của mẫu Word tải lên) khi có
    res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ khi xử lý yêu cầu.' : err.message, ...(status < 500 && Array.isArray(err.errors) ? { errors: err.errors } : {}) });
  });

  return {
    router,
    migrate: () => (migrated = migrate(db)),
    startAutoFetch: () => shared.autoFetch.start(),
    stopAutoFetch: () => shared.autoFetch.stop(),
    autoFetch: shared.autoFetch,
    zalo: shared.zalo,
    push: shared.push,
    /** Service worker thông báo đẩy: ứng dụng chủ phục vụ công khai (không cần đăng nhập) tại SERVICE_WORKER_PATH. */
    serviceWorker: serveServiceWorker
  };
}

const SERVICE_WORKER_PATH = '/dkct-sw.js';
const SERVICE_WORKER_FILE = path.join(__dirname, 'static', 'dkct-sw.js');
function serveServiceWorker(req, res) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(SERVICE_WORKER_FILE);
}

module.exports = createDkctModule;
module.exports.SERVICE_WORKER_PATH = SERVICE_WORKER_PATH;
module.exports.serveServiceWorker = serveServiceWorker;
