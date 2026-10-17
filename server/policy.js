/**
 * Phân quyền của module, dựng trên các hàm phân quyền ChatLan truyền vào
 * (isAdmin, isDepartmentHead, isUnitLead = trưởng/phó tổ theo departments.leaderId/deputyIds).
 */
function createPolicy({ getActor, isAdmin, isDepartmentHead, isUnitLead }) {
  async function actorOf(req) {
    const actor = await getActor(req.userId);
    if (!actor) throw Object.assign(new Error('Chưa đăng nhập.'), { status: 401 });
    return actor;
  }

  /** Trưởng/phó tổ, trưởng phòng hoặc admin của `department`. */
  async function leads(actor, department) {
    if (isAdmin(actor)) return true;
    if (!department || actor.department !== department) return false;
    return isDepartmentHead(actor, department) || !!(await isUnitLead(actor.id, department));
  }

  return {
    actorOf,
    canCreate: (actor) => leads(actor, actor.department),
    canManageCatalog: (actor) => leads(actor, actor.department),
    canView: (actor, reg) => isAdmin(actor) || (!!actor.department && reg.department === actor.department),
    canEdit: async (actor, reg) => reg.createdBy === actor.id || leads(actor, reg.department),
    /** canEdit cho cả danh sách: quyền chỉ phụ thuộc (người lập, tổ) nên mỗi tổ chỉ hỏi một lần (tránh N truy vấn). */
    editChecker: () => {
      const byDepartment = new Map();
      return async (actor, reg) => {
        if (reg.createdBy === actor.id) return true;
        if (!byDepartment.has(reg.department)) byDepartment.set(reg.department, leads(actor, reg.department));
        return byDepartment.get(reg.department);
      };
    },
    isAdmin
  };
}

const forbidden = (message) => Object.assign(new Error(message), { status: 403 });

module.exports = { createPolicy, forbidden };
