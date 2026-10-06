import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Pencil, X, Zap, Search } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';

const NO_AREA = 'Chưa có khu vực';

/**
 * Giao riêng trạm cho tổ: trạm trong một khu vực có thể do tổ thí nghiệm khác phụ trách.
 * Mỗi trạm: "Theo khu vực" (tổ phụ trách khu vực của trạm) hoặc một tổ cụ thể.
 */
function SubstationTeams({ data, canManage, onChanged }) {
  const { api, notify } = useDkct();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(null);
  const label = (dept) => {
    const t = data.teams.find(x => x.department === dept);
    return t?.shortName || dept;
  };
  const assign = async (sub, department) => {
    setBusy(sub.key);
    try {
      await api.put('/team-substations', { key: sub.key, name: sub.name, department });
      notify(department ? `${sub.name}: giao cho ${department}.` : `${sub.name}: theo khu vực.`, 'success');
      await onChanged();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(null); }
  };
  const q = query.trim().toLowerCase();
  const shown = data.substations.filter(s => !q || s.name.toLowerCase().includes(q));
  const groups = new Map();
  shown.forEach(s => { const k = s.areaLabel || NO_AREA; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
  const assigned = data.substations.filter(s => s.teamDepartment).length;

  return (
    <section className="space-y-2 pt-2" aria-labelledby="dkct-subteams-title">
      <h3 id="dkct-subteams-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
        <Zap className="w-4 h-4 text-chatlan-600" aria-hidden="true" /> Trạm do tổ khác phụ trách
        <span className="text-xs font-normal text-slate-500">({assigned} trạm giao riêng)</span>
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Danh sách gồm trạm trong danh mục và trạm ghi trong lịch cắt điện. Mặc định mỗi trạm thuộc tổ phụ trách khu vực của trạm.
        Trạm nào do tổ thí nghiệm khác phụ trách thì chọn tổ đó: lịch cắt điện ghi trạm này (vd "Trạm 220kV Phan Thiết, ĐZ …")
        tính cho tổ được chọn ("Chỉ tổ của tôi", báo thay đổi cho tổ trưởng), không tính cho tổ của khu vực.
      </p>
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" aria-label="Tìm trạm" placeholder="Tìm trạm…" value={query} onChange={e => setQuery(e.target.value)}
          className={`${inputCls} ${inputBorder()} pl-8`} />
      </div>
      {[...groups].map(([area, subs]) => {
        const custom = subs.filter(s => s.teamDepartment).length;
        return (
          <details key={area} open={!!q || custom > 0} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {area} <span className="font-normal text-xs text-slate-500">· {subs.length} trạm{custom ? ` · ${custom} giao riêng` : ''}</span>
            </summary>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
              {subs.map(s => {
                const byArea = s.areaTeams.length ? s.areaTeams.map(label).join(', ') : 'chưa có tổ';
                return (
                  <li key={s.key} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                    <span className={`flex-1 min-w-[10rem] text-sm ${s.teamDepartment ? 'font-semibold text-chatlan-700 dark:text-chatlan-300' : 'text-slate-700 dark:text-slate-200'}`}>
                      {s.name}
                      {s.count > 0 && <span className="ml-1.5 text-[11px] font-normal text-slate-500">· {s.count} dòng lịch</span>}
                      {!s.inCatalog && <span className="ml-1.5 text-[11px] font-normal text-amber-700 dark:text-amber-400" title="Trạm ghi trong lịch cắt điện, chưa có trong danh mục Trạm biến áp">· ngoài danh mục</span>}
                    </span>
                    {canManage ? (
                      <select aria-label={`Tổ phụ trách ${s.name}`} value={s.teamDepartment || ''} disabled={busy === s.key}
                        onChange={e => assign(s, e.target.value)} className={`${inputCls} ${inputBorder()} !w-auto max-w-[18rem]`}>
                        <option value="">Theo khu vực ({byArea})</option>
                        {data.teams.map(t => <option key={t.department} value={t.department}>{t.department}{t.shortName ? ` (${t.shortName})` : ''}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-600 dark:text-slate-300">{s.teamDepartment || `Theo khu vực (${byArea})`}</span>
                    )}
                    {busy === s.key && <Loader2 className="w-4 h-4 animate-spin text-chatlan-600" aria-label="Đang lưu" />}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      {!shown.length && <p className="text-sm text-slate-500" role="status">Không có trạm nào khớp.</p>}
    </section>
  );
}

/**
 * Khu vực truyền tải điện (TTĐ) mỗi tổ phụ trách: dùng cho "Chỉ tổ của tôi" ở tab Lịch cắt điện
 * và để báo thay đổi lịch cho tổ trưởng. Trạm trong khu vực có thể giao riêng cho tổ khác. Mọi người xem; admin sửa.
 */
export default function TeamAreasPanel({ canManage }) {
  const { api, notify } = useDkct();
  const [data, setData] = useState(null); // { teams: [{ department, shortName, areas }], options }
  const [editing, setEditing] = useState(null); // { department, areas: Set, extra }
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get('/team-areas').then(setData).catch(err => notify(err.message, 'error')), [api, notify]);
  useEffect(() => { load(); }, [load]);

  const toggle = (area) => setEditing(e => {
    const areas = new Set(e.areas);
    if (areas.has(area)) areas.delete(area); else areas.add(area);
    return { ...e, areas };
  });
  const save = async () => {
    setSaving(true);
    try {
      const areas = [...editing.areas, ...editing.extra.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)];
      await api.put('/team-areas', { department: editing.department, areas });
      notify(`Đã lưu khu vực của ${editing.department}.`, 'success');
      setEditing(null);
      load();
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };

  const subs = data?.substations || [];
  const own = (t) => subs.filter(s => s.teamDepartment === t.department).map(s => s.name);
  const except = (t) => subs.filter(s => s.teamDepartment && s.teamDepartment !== t.department && s.areaTeams.includes(t.department)).map(s => s.name);

  if (!data) return <Loader2 className="w-5 h-5 animate-spin text-chatlan-600" aria-label="Đang tải" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Lịch cắt điện của Công ty chỉ ghi đơn vị TTĐ (vd "TTĐ Lâm Đồng"), không ghi tổ. Chọn khu vực mỗi tổ phụ trách để lọc
        "Chỉ tổ của tôi" và báo lịch thay đổi cho tổ trưởng/tổ phó. Dòng lịch thuộc khu vực khi ô đơn vị ghi TTĐ đó, hoặc
        địa điểm là TBA có "Truyền tải điện" là khu vực đó trong danh mục TBA.
      </p>
      {data.teams.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Chưa có tổ nào. Thêm tổ ở phần quản trị (danh sách tổ/phòng) trước.</p>
      )}
      <ul className="space-y-2">
        {data.teams.map(t => {
          const open = editing?.department === t.department;
          return (
            <li key={t.department} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 min-w-[12rem] text-sm font-semibold text-slate-900 dark:text-white">
                  {t.department}{t.shortName ? <span className="text-slate-500 font-normal"> ({t.shortName})</span> : null}
                </p>
                {!open && (
                  <span className="text-xs text-slate-600 dark:text-slate-300">{t.areas.length ? t.areas.join(', ') : <i className="text-slate-400">chưa chọn khu vực</i>}</span>
                )}
                {canManage && !open && (
                  <button type="button" className={btnGhost} aria-label={`Sửa khu vực của ${t.department}`}
                    onClick={() => setEditing({ department: t.department, areas: new Set(t.areas), extra: '' })}>
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {!open && (own(t).length > 0 || except(t).length > 0) && (
                  <span className="basis-full text-xs text-slate-500 dark:text-slate-400">
                    {own(t).length > 0 && <>Trạm giao riêng: <b className="text-slate-700 dark:text-slate-200">{own(t).join(', ')}</b>. </>}
                    {except(t).length > 0 && <>Trừ (tổ khác phụ trách): {except(t).join(', ')}.</>}
                  </span>
                )}
              </div>
              {open && (
                <div className="mt-2 space-y-2">
                  <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
                    <legend className="sr-only">Khu vực của {t.department}</legend>
                    {[...new Set([...data.options, ...editing.areas])].map(a => (
                      <label key={a} className="inline-flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
                        <input type="checkbox" checked={editing.areas.has(a)} onChange={() => toggle(a)} /> {a}
                      </label>
                    ))}
                  </fieldset>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Khu vực khác (cách nhau bởi dấu phẩy)
                    <input value={editing.extra} onChange={e => setEditing(v => ({ ...v, extra: e.target.value }))} placeholder="vd Truyền tải điện Phú Yên"
                      className={`${inputCls} ${inputBorder()} block mt-1`} />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => setEditing(null)}><X className="w-4 h-4" /> Hủy</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {subs.length > 0 && <SubstationTeams data={data} canManage={canManage} onChanged={load} />}
    </div>
  );
}
