import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Pencil, X } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';

/**
 * Khu vực truyền tải điện (TTĐ) mỗi tổ phụ trách: dùng cho "Chỉ tổ của tôi" ở tab Lịch cắt điện
 * và để báo thay đổi lịch cho tổ trưởng. Mọi người xem; admin sửa.
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
    </div>
  );
}
