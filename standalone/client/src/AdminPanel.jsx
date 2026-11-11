import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Users, Building2, Loader2, ArrowLeft, Pencil, Save, X } from 'lucide-react';
import { btnPrimary, btnGhost, btnSecondary, cardCls, inputCls, inputBorder } from '@dkct/components/ui.jsx';
import { appApi, apiFetch } from './api.js';
import { notify, confirmAction } from './ui/feedback.js';

// tên vai trò mặc định; admin đổi ở trang chính → Cài đặt → Tên đơn vị, chức danh
const ROLE_LABEL = { admin: 'Quản trị viên', lead: 'Trưởng/phó đơn vị', member: 'Thành viên' };

/** Quản trị: danh sách tổ (tên viết tắt dùng trong số giấy) và xếp người dùng vào tổ, cấp vai trò. */
export default function AdminPanel({ me, onChanged, onBack }) {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleLabels, setRoleLabels] = useState(ROLE_LABEL);
  const [draft, setDraft] = useState({ name: '', shortName: '' });
  const [editing, setEditing] = useState(null); // { from, name, shortName, oldShort }: tổ đang sửa
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, d] = await Promise.all([appApi('/users'), appApi('/departments')]);
      setUsers(u.items); setDepartments(d.items);
    } catch (err) { notify(err.message, 'error'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiFetch('/api/dkct/org-names').then(r => (r.ok ? r.json() : null))
      .then(r => { if (r?.effective?.roleLabels) setRoleLabels({ ...ROLE_LABEL, ...r.effective.roleLabels }); })
      .catch(() => {});
  }, []);

  const run = async (fn, ok) => {
    try { await fn(); if (ok) notify(ok, 'success'); await load(); onChanged?.(); } catch (err) { notify(err.message, 'error'); }
  };
  const addDept = (e) => {
    e.preventDefault();
    run(async () => { await appApi('/departments', { method: 'POST', body: draft }); setDraft({ name: '', shortName: '' }); }, 'Đã thêm đơn vị.');
  };
  // Lưu tổ đang sửa: đổi tên tổ (thành viên, hồ sơ, số văn bản, khu vực / trạm, người nhận thông báo chuyển theo tên mới)
  // và / hoặc tên viết tắt; xong tải lại danh sách tổ và người dùng (người dùng hiện tên tổ mới)
  const saveDept = async (e) => {
    e.preventDefault();
    const { from, oldShort } = editing;
    const name = editing.name.trim();
    const shortName = editing.shortName.trim();
    if (!name || !shortName) { notify('Nhập tên đơn vị và tên viết tắt.', 'error'); return; }
    const renamed = name !== from;
    if (!renamed && shortName === oldShort) { setEditing(null); return; }
    if (renamed && !(await confirmAction({
      title: 'Đổi tên đơn vị?',
      message: `"${from}" → "${name}".

Thành viên, hồ sơ, số văn bản (đánh tiếp), khu vực / trạm phụ trách, người nhận Zalo và thiết bị nhận thông báo chuyển sang tên mới. Văn bản đã lập giữ tên đơn vị đã in; văn bản lập sau dùng tên mới.`,
      confirmLabel: 'Đổi tên'
    }))) return;
    setSaving(true);
    await run(async () => {
      await appApi(`/departments/${encodeURIComponent(from)}`, { method: 'PUT', body: renamed ? { name, shortName } : { shortName } });
      setEditing(null);
    }, renamed ? `Đã đổi tên đơn vị thành "${name}"; thành viên đã chuyển theo.` : 'Đã lưu tên viết tắt.');
    setSaving(false);
  };
  const removeDept = async (d) => {
    if (await confirmAction({ message: `Xóa đơn vị "${d.name}"?` })) run(() => appApi(`/departments/${encodeURIComponent(d.name)}`, { method: 'DELETE' }), 'Đã xóa đơn vị.');
  };
  const updateUser = (u, body) => run(() => appApi(`/users/${u.id}`, { method: 'PUT', body }),
    `Đã lưu: ${u.fullName || u.email}${body.department !== undefined ? ` → ${body.department || 'chưa xếp đơn vị'}` : ''}${body.role ? ` (${roleLabels[body.role]})` : ''}.`);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-chatlan-600" /></div>;
  const pending = users.filter(u => !u.department && u.role !== 'admin').length;

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <button type="button" className={btnSecondary} onClick={onBack}><ArrowLeft className="w-4 h-4" /> Về trang chính</button>
        <h1 className="text-base font-bold text-slate-900 dark:text-white">Quản trị</h1>
      </div>
      <p className="text-xs text-slate-500">Đơn vị trực tiếp và người dùng. Khu vực, trạm của đơn vị, tải lịch tự động, mẫu văn bản: trang chính → tab <b>Cài đặt</b>.</p>
      <section className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-chatlan-600" /> Đơn vị trực tiếp</h2>
        <p className="text-xs text-slate-500 mt-1">
          Tên viết tắt dùng trong số giấy, vd 12/ĐK-<b>TNKH</b>. Bấm <b>Sửa</b> để đổi tên đơn vị / tên viết tắt rồi <b>Lưu</b>: thành viên, hồ sơ,
          số văn bản chuyển theo tên mới; văn bản đã lập giữ tên cũ đã in. Tên đội, công ty in trên văn bản: trang chính → <b>Cài đặt</b> → <b>Tên đơn vị</b>.
        </p>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {departments.map(d => (
            <li key={d.name} className="py-2">
              {editing?.from === d.name ? (
                <form onSubmit={saveDept} className="flex flex-wrap items-center gap-2">
                  <input autoFocus aria-label={`Tên mới của ${d.name}`} value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }} className={`${inputCls} ${inputBorder()} flex-1 min-w-[14rem]`} />
                  <input aria-label={`Tên viết tắt của ${d.name}`} value={editing.shortName} onChange={e => setEditing(x => ({ ...x, shortName: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }} className={`${inputCls} ${inputBorder()} !w-32`} />
                  <button type="submit" className={btnPrimary} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setEditing(null)} disabled={saving}><X className="w-4 h-4" /> Hủy</button>
                </form>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-100">{d.name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300" title="Tên viết tắt (dùng trong số giấy)">{d.shortName}</span>
                  <button type="button" className={btnSecondary} aria-label={`Sửa ${d.name}`} disabled={!!editing}
                    onClick={() => setEditing({ from: d.name, name: d.name, shortName: d.shortName || '', oldShort: d.shortName || '' })}>
                    <Pencil className="w-4 h-4" /> Sửa
                  </button>
                  <button type="button" className={btnGhost} aria-label={`Xóa ${d.name}`} onClick={() => removeDept(d)}><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={addDept} className="mt-3 flex flex-wrap gap-2">
          <input placeholder="Tên đơn vị trực tiếp, vd Tổ Thí nghiệm khu vực Hàm Tân" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className={`${inputCls} ${inputBorder()} flex-1 min-w-[14rem]`} aria-label="Tên đơn vị trực tiếp" />
          <input placeholder="Viết tắt, vd TNKH" value={draft.shortName} onChange={e => setDraft(d => ({ ...d, shortName: e.target.value }))}
            className={`${inputCls} ${inputBorder()} !w-40`} aria-label="Tên viết tắt" />
          <button type="submit" className={btnPrimary}><Plus className="w-4 h-4" /> Thêm đơn vị trực tiếp</button>
        </form>
      </section>

      <section className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Users className="w-4 h-4 text-chatlan-600" /> Người dùng</h2>
        <p className="text-xs text-slate-500 mt-1">
          Người mới đăng ký chưa thuộc đơn vị nào nên chưa xem được hồ sơ. Xếp đơn vị để họ bắt đầu dùng; trưởng/phó đơn vị được lập, sửa hồ sơ và danh mục của đơn vị.
          {pending > 0 && <b className="text-amber-700"> Đang chờ xếp đơn vị: {pending}.</b>}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-2">Họ tên / email</th><th className="py-2 pr-2">Đơn vị trực tiếp</th><th className="py-2">Vai trò</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={`border-t border-slate-100 dark:border-slate-800 ${!u.department && u.role !== 'admin' ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                  <td className="py-2 pr-2">
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{u.fullName || '(chưa ghi tên)'}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <select aria-label={`Đơn vị của ${u.email}`} value={u.department || ''} onChange={e => updateUser(u, { department: e.target.value })}
                      className={`${inputCls} ${inputBorder()}`}>
                      <option value="">— Chưa xếp đơn vị —</option>
                      {departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <select aria-label={`Vai trò của ${u.email}`} value={u.role} disabled={u.id === me.id} onChange={e => updateUser(u, { role: e.target.value })}
                      className={`${inputCls} ${inputBorder()}`}>
                      {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
