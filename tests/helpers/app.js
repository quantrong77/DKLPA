/** Ứng dụng Express thử: module ĐKCT trên SQLite trong bộ nhớ; người dùng chọn qua header x-test-user. */
const express = require('express');
const { createTestDb } = require('./sqliteDb');
const createDkctModule = require('../../server');

const USERS = {
  lead: { id: 'U1', role: 'member', department: 'Tổ Thí nghiệm điện Lâm Đồng', fullName: 'Nguyễn Hữu Kính', position: 'Tổ trưởng', phone: '0962524070', email: 'kinh@example.com' },
  member: { id: 'U2', role: 'member', department: 'Tổ Thí nghiệm điện Lâm Đồng', fullName: 'Lê Hữu Anh', position: 'Kỹ sư' },
  other: { id: 'U3', role: 'member', department: 'Tổ Vận tải', fullName: 'Đặng Minh Hải', position: 'Tổ trưởng' },
  admin: { id: 'U9', role: 'admin', department: 'Ban giám đốc', fullName: 'Admin', position: 'Quản trị' }
};
const byId = Object.fromEntries(Object.values(USERS).map(u => [u.id, u]));
const SHORT = { 'Tổ Thí nghiệm điện Lâm Đồng': 'TNLĐ', 'Tổ Vận tải': 'VT', 'Ban giám đốc': 'BGĐ' };

async function startApp({ legacyLastIssued, outageSource, outageAuto, notifyUsers, listTeamLeads, secretKey } = {}) {
  const db = createTestDb();
  const dkct = createDkctModule({
    db,
    getActor: async (id) => byId[id] || null,
    getProfile: async (id) => byId[id] || null,
    isAdmin: (a) => a?.role === 'admin',
    isDepartmentHead: (a, dept) => a?.role === 'manager' && a.department === dept,
    isUnitLead: async (id, dept) => id === 'U1' && dept === USERS.lead.department,
    getUnit: async (id) => ({ department: byId[id].department, shortName: SHORT[byId[id].department] }),
    listDepartments: async () => Object.entries(SHORT).map(([name, shortName]) => ({ name, shortName })),
    legacyLastIssued,
    outageSource,
    outageAuto,
    notifyUsers,
    listTeamLeads,
    secretKey
  });
  await dkct.migrate();
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/dkct', (req, res, next) => { req.userId = req.headers['x-test-user']; next(); }, dkct.router);
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/dkct`;
  const call = async (user, method, url, body) => {
    const init = { method, headers: { 'x-test-user': USERS[user].id } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
    const res = await fetch(base + url, init);
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  return { db, dkct, call, close: () => { dkct.stopAutoFetch(); server.close(); db.close(); } };
}

module.exports = { USERS, startApp };
