/**
 * Danh mục ĐKCT: nhân sự ATĐ, đơn vị QLVH (nơi nhận), trạm biến áp (thuộc đơn vị QLVH), nhiệm vụ, thư viện rủi ro.
 * Ai đăng nhập cũng xem được; trưởng/phó tổ, trưởng phòng, admin được thêm/sửa/ẩn.
 */
const express = require('express');
const { newId } = require('../schema');
const { forbidden } = require('../policy');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CATALOGS = {
  personnel: {
    table: 'dkct_personnel', prefix: 'NS', required: 'fullName', orderBy: 'fullName',
    // Bậc/thẻ ATĐ là dữ liệu an toàn: mỗi tổ chỉ sửa nhân sự của tổ mình (hoặc chưa gán tổ)
    scopedByDepartment: true,
    fields: ['fullName', 'safetyLevel', 'safetyCard', 'department', 'position'],
    label: 'Họ tên'
  },
  stations: {
    table: 'dkct_stations', prefix: 'ST', required: 'name', orderBy: 'name',
    fields: ['name', 'shortName', 'leaderName', 'email', 'phone', 'note'],
    label: 'Tên đơn vị',
    validate: (v) => (v.email && !EMAIL_RE.test(v.email) ? 'Email không hợp lệ.' : null)
  },
  substations: {
    table: 'dkct_substations', prefix: 'TBA', required: 'name', orderBy: 'sortOrder, name',
    fields: ['name', 'stationId', 'transmissionName', 'sortOrder'], numeric: ['sortOrder'],
    label: 'Tên trạm biến áp',
    // khóa ngoại tới đơn vị QLVH: báo lỗi dễ hiểu thay vì lỗi ràng buộc của CSDL
    check: async (db, v) => (v.stationId && await db.queryOne('SELECT id FROM dkct_stations WHERE id = ?', [v.stationId])
      ? null : 'Chọn đơn vị QLVH quản lý trạm.')
  },
  duties: {
    table: 'dkct_duties', prefix: 'NV', required: 'name', orderBy: 'sortOrder, name',
    fields: ['name', 'sortOrder'], numeric: ['sortOrder'],
    label: 'Tên nhiệm vụ'
  },
  risks: {
    table: 'dkct_risks', prefix: 'RR', required: 'hazard', orderBy: 'sortOrder',
    fields: ['hazard', 'measures', 'performer', 'sortOrder'], numeric: ['sortOrder'],
    label: 'Mối nguy'
  }
};

function pickValues(cfg, body = {}) {
  const values = {};
  for (const f of cfg.fields) {
    if (cfg.numeric?.includes(f)) values[f] = Math.max(0, Math.min(100000, Number.parseInt(body[f], 10) || 0));
    else values[f] = body[f] === null || body[f] === undefined ? '' : String(body[f]).replace(/\r\n?/g, '\n').trim();
  }
  if (!values[cfg.required]) throw Object.assign(new Error(`${cfg.label} là bắt buộc.`), { status: 400 });
  const invalid = cfg.validate?.(values);
  if (invalid) throw Object.assign(new Error(invalid), { status: 400 });
  return values;
}

function catalogRouter({ db, policy, wrap }) {
  const router = express.Router();

  for (const [name, cfg] of Object.entries(CATALOGS)) {
    const getOne = (id) => db.queryOne(`SELECT * FROM ${cfg.table} WHERE id = ?`, [id]);
    const requireManager = async (req) => {
      const actor = await policy.actorOf(req);
      if (!(await policy.canManageCatalog(actor))) throw forbidden('Chỉ trưởng/phó tổ, trưởng phòng hoặc admin được sửa danh mục.');
      return actor;
    };
    const ownsRow = (actor, row) => !cfg.scopedByDepartment || policy.isAdmin(actor) || !row.department || row.department === actor.department;
    /** Người không phải admin luôn ghi nhân sự vào tổ của mình (hoặc giữ tổ đã có của dòng). */
    const scopeValues = (actor, values, row) => {
      if (!cfg.scopedByDepartment) return values;
      if (!policy.isAdmin(actor) || !values.department) values.department = row?.department || actor.department || '';
      return values;
    };
    const loadOwned = async (actor, id) => {
      const row = await getOne(id);
      if (!row) throw Object.assign(new Error('Không tìm thấy mục này.'), { status: 404 });
      if (!ownsRow(actor, row)) throw forbidden('Nhân sự này thuộc tổ khác; chỉ tổ đó hoặc admin được sửa.');
      return row;
    };

    router.get(`/${name}`, wrap(async (req, res) => {
      await policy.actorOf(req);
      const where = req.query.includeInactive === '1' ? '' : 'WHERE active = 1';
      res.json({ items: await db.query(`SELECT * FROM ${cfg.table} ${where} ORDER BY ${cfg.orderBy}`) });
    }));

    const checked = async (values) => {
      const problem = cfg.check && await cfg.check(db, values);
      if (problem) throw Object.assign(new Error(problem), { status: 400 });
      return values;
    };

    router.post(`/${name}`, wrap(async (req, res) => {
      const actor = await requireManager(req);
      const values = await checked(scopeValues(actor, pickValues(cfg, req.body), null));
      const id = newId(cfg.prefix);
      await db.execute(
        `INSERT INTO ${cfg.table} (id, ${cfg.fields.join(', ')}) VALUES (?, ${cfg.fields.map(() => '?').join(', ')})`,
        [id, ...cfg.fields.map(f => values[f])]
      );
      res.status(201).json({ item: await getOne(id) });
    }));

    router.put(`/${name}/:id`, wrap(async (req, res) => {
      const actor = await requireManager(req);
      const row = await loadOwned(actor, req.params.id);
      const values = await checked(scopeValues(actor, pickValues(cfg, req.body), row));
      await db.execute(
        `UPDATE ${cfg.table} SET ${cfg.fields.map(f => `${f} = ?`).join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        [...cfg.fields.map(f => values[f]), req.params.id]
      );
      res.json({ item: await getOne(req.params.id) });
    }));

    // Ẩn thay vì xóa: giấy cũ vẫn tham chiếu được, danh sách chọn không còn hiện
    router.delete(`/${name}/:id`, wrap(async (req, res) => {
      const actor = await requireManager(req);
      await loadOwned(actor, req.params.id);
      const result = await db.execute(`UPDATE ${cfg.table} SET active = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
      if (!Number(result.changes ?? result.affectedRows)) return res.status(404).json({ error: 'Không tìm thấy mục này.' });
      res.json({ success: true });
    }));
  }
  return router;
}

module.exports = { catalogRouter, CATALOGS };
