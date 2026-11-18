import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Users, Building2, Loader2, Pencil, Save, X, Search } from 'lucide-react';
import { btnPrimary, btnGhost, btnSecondary, cardCls, inputCls, inputBorder } from '@dkct/components/ui.jsx';
import { DkctProvider } from '@dkct/context.jsx';
import { SETTINGS_SECTIONS } from '@dkct/components/SettingsPanel.jsx';
import ErrorBoundary from '@dkct/components/ErrorBoundary.jsx';
import { appApi, apiFetch } from './api.js';
import { notify, confirmAction } from './ui/feedback.js';

// tên vai trò mặc định; admin đổi ở Quản trị → Cài đặt → Tên đơn vị, chức danh
const ROLE_LABEL = { admin: 'Quản trị viên', lead: 'Trưởng/phó đơn vị', member: 'Thành viên' };

// mục của trang Quản trị: địa chỉ #quan-tri/<slug> (nút Back của trình duyệt quay lại mục trước)
const SLUG = { teamAreas: 'khu-vuc', outageSettings: 'tai-lich', zalo: 'zalo', templates: 'mau-van-ban', testPlan: 'ke-hoach-thi-nghiem', orgNames: 'ten-don-vi' };
export const ADMIN_GROUPS = [
  {
    label: 'Người dùng và đơn vị',
    items: [
      { slug: 'nguoi-dung', label: 'Người dùng', icon: Users, description: 'Xếp người mới đăng ký vào đơn vị và cấp vai trò. Người chưa có đơn vị chưa xem được hồ sơ.' },
      { slug: 'don-vi', label: 'Đơn vị trực tiếp', icon: Building2, description: 'Các tổ, đội và tên viết tắt dùng trong số văn bản, vd 12/ĐK-TNKH.' }
    ]
  },
  {
    label: 'Cài đặt',
    // mục đã có đoạn giới thiệu riêng (selfDescribed) thì đầu trang chỉ ghi tên, mô tả để làm chú thích ở thanh mục
    items: SETTINGS_SECTIONS.map(s => ({ slug: SLUG[s.id] || s.id, label: s.label, icon: s.icon, description: s.description, selfDescribed: s.selfDescribed, render: s.render }))
  }
];
const ALL_ITEMS = ADMIN_GROUPS.flatMap(g => g.items);
export const DEFAULT_ADMIN_SECTION = 'nguoi-dung';
export const isPending = (u) => !u.department && u.role !== 'admin';

/** Danh sách tổ, người dùng, tên vai trò: dùng chung cho hai mục đầu. */
function useOrgData(onChanged) {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleLabels, setRoleLabels] = useState(ROLE_LABEL);
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
  const run = useCallback(async (fn, ok) => {
    try { await fn(); if (ok) notify(ok, 'success'); await load(); onChanged?.(); } catch (err) { notify(err.message, 'error'); }
  }, [load, onChanged]);
  return { users, departments, loading, roleLabels, run };
}

function UsersSection({ me, data }) {
  const { users, departments, roleLabels, run } = data;
  const [query, setQuery] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const pending = users.filter(isPending).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter(u => (!onlyPending || isPending(u)) && (!q || `${u.fullName || ''} ${u.email} ${u.department || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(isPending(b)) - Number(isPending(a)));
  }, [users, query, onlyPending]);
  const updateUser = (u, body) => run(() => appApi(`/users/${u.id}`, { method: 'PUT', body }),
    `Đã lưu: ${u.fullName || u.email}${body.department !== undefined ? ` → ${body.department || 'chưa xếp đơn vị'}` : ''}${body.role ? ` (${roleLabels[body.role]})` : ''}.`);

  return (
    <section className={cardCls} aria-label="Danh sách người dùng">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[14rem]">
          <span className="sr-only">Tìm người dùng</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên, email, đơn vị"
            className={`${inputCls} ${inputBorder()} pl-8`} />
        </label>
        <button type="button" aria-pressed={onlyPending} onClick={() => setOnlyPending(v => !v)} disabled={!pending && !onlyPending}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-50 ${onlyPending
            ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-200'
            : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
          Chờ xếp đơn vị ({pending})
        </button>
      </div>

      <div className="mt-3 hidden md:grid grid-cols-[minmax(0,1fr)_16rem_12rem] gap-3 px-1 pb-1 text-xs font-medium text-slate-500" aria-hidden="true">
        <span>Người dùng</span><span>Đơn vị trực tiếp</span><span>Vai trò</span>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800 md:border-t-0">
        {shown.map(u => {
          const wait = isPending(u);
          return (
            <li key={u.id} className={`grid gap-2 py-3 px-1 md:grid-cols-[minmax(0,1fr)_16rem_12rem] md:items-center md:gap-3 ${wait ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{u.fullName || 'Chưa ghi tên'}</span>
                  {u.id === me.id && <span className="text-[11px] text-slate-500">(bạn)</span>}
                  {wait && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 text-[11px] font-semibold">Chờ xếp đơn vị</span>}
                </div>
                <div className="text-xs text-slate-500 truncate">{u.email}</div>
              </div>
              <label className="block">
                <span className="md:sr-only text-xs text-slate-500">Đơn vị trực tiếp</span>
                <select aria-label={`Đơn vị của ${u.fullName || u.email}`} value={u.department || ''} onChange={e => updateUser(u, { department: e.target.value })}
                  className={`${inputCls} ${inputBorder()} mt-0.5 md:mt-0`}>
                  <option value="">Chưa xếp đơn vị</option>
                  {departments.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="md:sr-only text-xs text-slate-500">Vai trò</span>
                <select aria-label={`Vai trò của ${u.fullName || u.email}`} value={u.role} disabled={u.id === me.id} onChange={e => updateUser(u, { role: e.target.value })}
                  title={u.id === me.id ? 'Không tự đổi vai trò của mình' : undefined}
                  className={`${inputCls} ${inputBorder()} mt-0.5 md:mt-0 disabled:opacity-60`}>
                  {Object.entries(roleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          {onlyPending ? 'Không còn ai chờ xếp đơn vị.' : 'Không có người dùng khớp với từ tìm.'}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Trưởng/phó đơn vị lập, sửa hồ sơ và danh mục của đơn vị; thành viên xem. Người dùng tải lại trang để nhận quyền mới.
      </p>
    </section>
  );
}

function DepartmentsSection({ data }) {
  const { users, departments, run } = data;
  const [draft, setDraft] = useState({ name: '', shortName: '' });
  const [editing, setEditing] = useState(null); // { from, name, shortName, oldShort }: tổ đang sửa
  const [saving, setSaving] = useState(false);
  const members = useMemo(() => users.reduce((m, u) => (u.department ? { ...m, [u.department]: (m[u.department] || 0) + 1 } : m), {}), [users]);

  const addDept = (e) => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.shortName.trim()) { notify('Nhập tên đơn vị và tên viết tắt.', 'error'); return; }
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
    if (await confirmAction({ title: 'Xóa đơn vị?', message: `Xóa "${d.name}"? Đơn vị đã xóa không còn trong danh sách chọn.`, confirmLabel: 'Xóa' })) run(() => appApi(`/departments/${encodeURIComponent(d.name)}`, { method: 'DELETE' }), 'Đã xóa đơn vị.');
  };
  const cancelOnEsc = (e) => { if (e.key === 'Escape') setEditing(null); };

  return (
    <section className={cardCls} aria-label="Danh sách đơn vị trực tiếp">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {departments.map(d => (
          <li key={d.name} className="py-2.5">
            {editing?.from === d.name ? (
              <form onSubmit={saveDept} className="flex flex-wrap items-center gap-2">
                <input autoFocus aria-label={`Tên mới của ${d.name}`} value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}
                  onKeyDown={cancelOnEsc} className={`${inputCls} ${inputBorder()} flex-1 min-w-[14rem]`} />
                <input aria-label={`Tên viết tắt của ${d.name}`} value={editing.shortName} onChange={e => setEditing(x => ({ ...x, shortName: e.target.value }))}
                  onKeyDown={cancelOnEsc} className={`${inputCls} ${inputBorder()} !w-32`} />
                <button type="submit" className={btnPrimary} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
                </button>
                <button type="button" className={btnSecondary} onClick={() => setEditing(null)} disabled={saving}><X className="w-4 h-4" /> Hủy</button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[12rem]">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{d.name}</div>
                  <div className="text-xs text-slate-500">{members[d.name] ? `${members[d.name]} người` : 'Chưa có ai'}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300" title="Tên viết tắt (dùng trong số văn bản)">{d.shortName}</span>
                <button type="button" className={btnSecondary} aria-label={`Sửa ${d.name}`} disabled={!!editing}
                  onClick={() => setEditing({ from: d.name, name: d.name, shortName: d.shortName || '', oldShort: d.shortName || '' })}>
                  <Pencil className="w-4 h-4" /> Sửa
                </button>
                {/* máy chủ không cho xóa đơn vị còn thành viên: khóa nút và nói lý do */}
                <button type="button" className={`${btnGhost} disabled:opacity-40 disabled:cursor-not-allowed`} aria-label={`Xóa ${d.name}`}
                  disabled={members[d.name] > 0} title={members[d.name] > 0 ? 'Còn thành viên: chuyển họ sang đơn vị khác (mục Người dùng) trước khi xóa' : 'Xóa đơn vị'}
                  onClick={() => removeDept(d)}><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {departments.length === 0 && <p className="py-4 text-sm text-slate-500">Chưa có đơn vị nào. Thêm đơn vị đầu tiên ở dưới.</p>}
      <form onSubmit={addDept} className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
        <input placeholder="Tên đơn vị, vd Tổ Thí nghiệm khu vực Hàm Tân" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          className={`${inputCls} ${inputBorder()} flex-1 min-w-[14rem]`} aria-label="Tên đơn vị trực tiếp" />
        <input placeholder="Viết tắt, vd TNKH" value={draft.shortName} onChange={e => setDraft(d => ({ ...d, shortName: e.target.value }))}
          className={`${inputCls} ${inputBorder()} !w-40`} aria-label="Tên viết tắt" />
        <button type="submit" className={btnPrimary}><Plus className="w-4 h-4" /> Thêm đơn vị</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        Đổi tên đơn vị: thành viên, hồ sơ, số văn bản chuyển theo tên mới; văn bản đã lập giữ tên cũ đã in.
        Tên công ty, đội in trên văn bản: mục <b>Tên đơn vị, chức danh</b>.
      </p>
    </section>
  );
}

/**
 * Trang Quản trị (chỉ admin): người dùng, đơn vị trực tiếp và các mục cài đặt hệ thống.
 * section: slug đang mở; onSection(slug): chuyển mục; services: dịch vụ của module (cho các mục Cài đặt).
 */
export default function AdminPanel({ me, section, onSection, onChanged, services }) {
  const current = ALL_ITEMS.find(i => i.slug === section) || ALL_ITEMS[0];
  const data = useOrgData(onChanged);
  const pending = data.users.filter(isPending).length;

  let content;
  if (current.render) content = <DkctProvider services={services}>{current.render()}</DkctProvider>;
  else if (data.loading) content = <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-chatlan-600" aria-label="Đang tải" /></div>;
  else if (current.slug === 'don-vi') content = <DepartmentsSection data={data} />;
  else content = <UsersSection me={me} data={data} />;

  return (
    <div className="min-h-full md:flex">
      <aside className="bg-white dark:bg-slate-900 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 md:w-64 md:shrink-0">
        <div className="px-4 pt-4 pb-3 md:sticky md:top-0">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Quản trị</h1>
          {/* điện thoại: chọn mục bằng danh sách thả xuống */}
          <label className="md:hidden mt-2 block">
            <span className="sr-only">Mục quản trị</span>
            <select value={current.slug} onChange={e => onSection(e.target.value)} className={`${inputCls} ${inputBorder()} py-2 text-[15px]`}>
              {ADMIN_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map(i => <option key={i.slug} value={i.slug}>{i.label}{i.slug === 'nguoi-dung' && pending ? ` (${pending} chờ xếp)` : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <nav className="hidden md:block mt-4 space-y-5" aria-label="Mục quản trị">
            {ADMIN_GROUPS.map(g => (
              <div key={g.label}>
                <h2 className="px-2 mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{g.label}</h2>
                <ul className="space-y-0.5">
                  {g.items.map(i => {
                    const active = i.slug === current.slug;
                    const Icon = i.icon;
                    return (
                      <li key={i.slug}>
                        <a href={`#quan-tri/${i.slug}`} aria-current={active ? 'page' : undefined} title={i.description}
                          onClick={(e) => { e.preventDefault(); onSection(i.slug); }}
                          className={`flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors ${active
                            ? 'bg-chatlan-50 text-chatlan-700 font-semibold dark:bg-chatlan-900/40 dark:text-chatlan-200'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                          <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-chatlan-600 dark:text-chatlan-300' : 'text-slate-400'}`} aria-hidden="true" />
                          <span className="flex-1 min-w-0 truncate">{i.label}</span>
                          {i.slug === 'nguoi-dung' && pending > 0 && (
                            <span className="min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-bold text-center" title={`${pending} người chờ xếp đơn vị`}>
                              {pending}<span className="sr-only"> người chờ xếp đơn vị</span>
                            </span>
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <section className="flex-1 min-w-0 p-4 md:p-6" aria-labelledby="dkct-admin-title">
        <div className="max-w-5xl space-y-4">
          <header>
            <h2 id="dkct-admin-title" className="text-xl font-bold text-slate-900 dark:text-white">{current.label}</h2>
            {!current.selfDescribed && <p className="mt-1 max-w-[70ch] text-sm text-slate-500 dark:text-slate-400">{current.description}</p>}
          </header>
          <ErrorBoundary resetKeys={[current.slug]}>{content}</ErrorBoundary>
        </div>
      </section>
    </div>
  );
}
