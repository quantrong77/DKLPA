import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Users, Building2, Loader2, ArrowLeft } from 'lucide-react';
import { btnPrimary, btnGhost, btnSecondary, cardCls, inputCls, inputBorder } from '@dkct/components/ui.jsx';
import { appApi } from './api.js';
import { notify, confirmAction } from './ui/feedback.js';

const ROLE_LABEL = { admin: 'Quản trị viên', lead: 'Trưởng/phó tổ', member: 'Thành viên' };

/** Quản trị: danh sách tổ (tên viết tắt dùng trong số giấy) và xếp người dùng vào tổ, cấp vai trò. */
export default function AdminPanel({ me, onChanged, onBack }) {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ name: '', shortName: '' });

  const load = useCallback(async () => {
    try {
      const [u, d] = await Promise.all([appApi('/users'), appApi('/departments')]);
      setUsers(u.items); setDepartments(d.items);
    } catch (err) { notify(err.message, 'error'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => {
    try { await fn(); if (ok) notify(ok, 'success'); await load(); onChanged?.(); } catch (err) { notify(err.message, 'error'); }
  };
  const addDept = (e) => {
    e.preventDefault();
    run(async () => { await appApi('/departments', { method: 'POST', body: draft }); setDraft({ name: '', shortName: '' }); }, 'Đã thêm tổ.');
  };
  const renameShort = (d, shortName) => {
    if (shortName.trim() && shortName.trim() !== d.shortName) run(() => appApi(`/departments/${encodeURIComponent(d.name)}`, { method: 'PUT', body: { shortName } }));
  };
  const removeDept = async (d) => {
    if (await confirmAction({ message: `Xóa tổ "${d.name}"?` })) run(() => appApi(`/departments/${encodeURIComponent(d.name)}`, { method: 'DELETE' }), 'Đã xóa tổ.');
  };
  const updateUser = (u, body) => run(() => appApi(`/users/${u.id}`, { method: 'PUT', body }));

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-chatlan-600" /></div>;
  const pending = users.filter(u => !u.department && u.role !== 'admin').length;

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <button type="button" className={btnSecondary} onClick={onBack}><ArrowLeft className="w-4 h-4" /> Về trang chính</button>
        <h1 className="text-base font-bold text-slate-900 dark:text-white">Quản trị</h1>
      </div>
      <p className="text-xs text-slate-500">Tổ và người dùng. Khu vực, trạm của tổ, tải lịch tự động, mẫu văn bản: trang chính → tab <b>Cài đặt</b>.</p>
      <section className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-chatlan-600" /> Tổ</h2>
        <p className="text-xs text-slate-500 mt-1">Tên viết tắt dùng trong số giấy, vd 12/ĐK-<b>TNKH</b>. Tên tổ đã ghi vào hồ sơ nên không đổi được sau khi tạo.</p>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {departments.map(d => (
            <li key={d.name} className="py-2 flex items-center gap-2">
              <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">{d.name}</span>
              <input aria-label={`Tên viết tắt của ${d.name}`} defaultValue={d.shortName} onBlur={e => renameShort(d, e.target.value)}
                className={`${inputCls} ${inputBorder()} !w-28`} />
              <button type="button" className={btnGhost} aria-label={`Xóa ${d.name}`} onClick={() => removeDept(d)}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={addDept} className="mt-3 flex flex-wrap gap-2">
          <input placeholder="Tên tổ, vd Tổ Thí nghiệm khu vực Hàm Tân" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className={`${inputCls} ${inputBorder()} flex-1 min-w-[14rem]`} aria-label="Tên tổ" />
          <input placeholder="Viết tắt, vd TNKH" value={draft.shortName} onChange={e => setDraft(d => ({ ...d, shortName: e.target.value }))}
            className={`${inputCls} ${inputBorder()} !w-40`} aria-label="Tên viết tắt" />
          <button type="submit" className={btnPrimary}><Plus className="w-4 h-4" /> Thêm tổ</button>
        </form>
      </section>

      <section className={cardCls}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><Users className="w-4 h-4 text-chatlan-600" /> Người dùng</h2>
        <p className="text-xs text-slate-500 mt-1">
          Người mới đăng ký chưa thuộc tổ nào nên chưa xem được hồ sơ. Xếp tổ để họ bắt đầu dùng; trưởng/phó tổ được lập, sửa hồ sơ và danh mục của tổ.
          {pending > 0 && <b className="text-amber-700"> Đang chờ xếp tổ: {pending}.</b>}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-2">Họ tên / email</th><th className="py-2 pr-2">Tổ</th><th className="py-2">Vai trò</th>
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
                    <select aria-label={`Tổ của ${u.email}`} value={u.department || ''} onChange={e => updateUser(u, { department: e.target.value })}
                      className={`${inputCls} ${inputBorder()}`}>
                      <option value="">— Chưa xếp tổ —</option>
                      {departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <select aria-label={`Vai trò của ${u.email}`} value={u.role} disabled={u.id === me.id} onChange={e => updateUser(u, { role: e.target.value })}
                      className={`${inputCls} ${inputBorder()}`}>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
