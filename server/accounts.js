/**
 * Tài khoản và tổ của bản chạy độc lập (bảng dkct_app_users, dkct_app_departments) — dùng chung cho:
 *  - standalone (dkct.onrender.com, đăng nhập Supabase), và
 *  - ứng dụng khác gắn module vào cùng CSDL (ChatLan-cloud, xem server/shared.js): người dùng khớp theo email.
 * Vai trò: admin / lead (trưởng-phó tổ) / member. Người chưa được xếp tổ chưa xem được gì.
 */
const ROLES = ['admin', 'lead', 'member'];

/** Bảng của phần tài khoản (cùng kiểu dữ liệu cho Postgres và SQLite). */
const APP_TABLES = {
  dkct_app_departments: `
      name VARCHAR(191) PRIMARY KEY,
      shortName VARCHAR(64) NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
  dkct_app_users: `
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      fullName VARCHAR(255),
      position VARCHAR(255),
      phone VARCHAR(64),
      department VARCHAR(191),
      role VARCHAR(16) NOT NULL DEFAULT 'member',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
};
const APP_TABLE_TEXT = Object.values(APP_TABLES).join(',');
const USER_COLUMNS = 'id, email, fullName, position, phone, department, role, createdAt';

function createAccounts(db) {
  const getUser = (id) => db.queryOne(`SELECT ${USER_COLUMNS} FROM dkct_app_users WHERE id = ?`, [id]);
  const emailKey = (email) => String(email || '').trim().toLowerCase();
  /** Một email có thể có nhiều dòng (hiếm): ưu tiên dòng đã được xếp tổ / admin, rồi dòng tạo trước. */
  async function getUserByEmail(email) {
    const key = emailKey(email);
    if (!key) return null;
    const rows = await db.query(`SELECT ${USER_COLUMNS} FROM dkct_app_users WHERE LOWER(email) = ? ORDER BY createdAt, id`, [key]);
    return rows.find(u => u.role === 'admin') || rows.find(u => u.department) || rows[0] || null;
  }
  const listDepartments = () => db.query('SELECT name, shortName FROM dkct_app_departments ORDER BY sortOrder, name');

  async function migrate() {
    for (const [name, columns] of Object.entries(APP_TABLES)) {
      await db.execute(`CREATE TABLE IF NOT EXISTS ${name} (${columns}\n)`);
    }
  }

  return {
    getUser,
    getUserByEmail,
    listDepartments,
    migrate,
    isAdmin: (actor) => actor?.role === 'admin',
    isUnitLead: async (userId, department) => {
      const u = await getUser(userId);
      return !!u && u.role === 'lead' && u.department === department;
    },
    getUnit: async (userId) => {
      const u = await getUser(userId);
      const dept = u?.department ? await db.queryOne('SELECT shortName FROM dkct_app_departments WHERE name = ?', [u.department]) : null;
      return { department: u?.department || '', shortName: dept?.shortName || '' };
    },
    /** Trưởng / phó tổ (nhận báo lịch cắt điện thay đổi trong khu vực của tổ). */
    listTeamLeads: async (department) => (await db.query("SELECT id FROM dkct_app_users WHERE role = 'lead' AND department = ?", [department])).map(r => r.id),
    /** id -> email (gửi tin qua ứng dụng khác khớp theo email). */
    emailsOf: async (ids) => {
      const out = new Map();
      for (const id of new Set(ids)) {
        const u = await getUser(id);
        if (u?.email) out.set(id, emailKey(u.email));
      }
      return out;
    }
  };
}

module.exports = { createAccounts, APP_TABLES, APP_TABLE_TEXT, USER_COLUMNS, ROLES };
