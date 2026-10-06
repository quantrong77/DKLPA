import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Pencil, X, Search } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';

const NO_AREA = 'Chưa rõ khu vực';
const SHOW_NAMES = 8;

/** "Truyền tải điện Đắk Lắk" / "TTĐ ĐăkLăk" -> "daklak" (so khu vực không phân biệt dấu, khoảng trắng). */
const areaKey = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
  .toLowerCase().replace(/^(truyen tai dien|ttd)\s+/, '').replace(/[^a-z0-9]/g, '');

/**
 * Tích chọn trạm tổ phụ trách, gom theo khu vực (khu vực của tổ mở sẵn); tích cả khu vực một lần.
 * `stations`: Map<khóa, tên> đang tích; `onChange(Map)`.
 */
function StationPicker({ substations, teamAreas, stations, onChange }) {
  const [query, setQuery] = useState('');
  const mine = new Set(teamAreas.map(areaKey));
  const q = query.trim().toLowerCase();
  const shown = substations.filter(s => !q || s.name.toLowerCase().includes(q));
  const groups = new Map();
  shown.forEach(s => { const k = s.areaLabel || NO_AREA; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
  const set = (list, on) => {
    const next = new Map(stations);
    list.forEach(s => { if (on) next.set(s.key, s.name); else next.delete(s.key); });
    onChange(next);
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">
        Trạm tổ phụ trách <span className="font-normal text-slate-500">({stations.size} trạm đã tích)</span>
      </legend>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Đã tích trạm: "Chỉ tổ của tôi" và tin báo lịch thay đổi chỉ gồm lịch của các trạm đã tích (dòng lịch không ghi rõ trạm,
        vd chỉ ghi đường dây, vẫn theo khu vực ở trên). Không tích trạm nào: tổ phụ trách mọi trạm trong các khu vực đã chọn.
        Một trạm có thể tích cho nhiều tổ.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" aria-label="Tìm trạm" placeholder="Tìm trạm…" value={query} onChange={e => setQuery(e.target.value)}
            className={`${inputCls} ${inputBorder()} pl-8`} />
        </div>
        {stations.size > 0 && (
          <button type="button" className={btnSecondary} onClick={() => onChange(new Map())}>Bỏ tích tất cả</button>
        )}
      </div>
      {[...groups].map(([area, subs]) => {
        const picked = subs.filter(s => stations.has(s.key)).length;
        const all = picked === subs.length;
        return (
          <details key={area} open={!!q || picked > 0 || mine.has(areaKey(area))}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {area} <span className="font-normal text-xs text-slate-500">· {picked}/{subs.length} trạm</span>
            </summary>
            <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2 space-y-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-chatlan-700 dark:text-chatlan-300">
                <input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = picked > 0 && !all; }}
                  onChange={() => set(subs, !all)} aria-label={`Tích cả ${area}`} /> Cả khu vực
              </label>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {subs.map(s => (
                  <label key={s.key} className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
                    <input type="checkbox" className="mt-1" checked={stations.has(s.key)} onChange={e => set([s], e.target.checked)} />
                    <span>
                      {s.name}
                      {s.count > 0 && <span className="ml-1 text-[11px] text-slate-500">· {s.count} dòng lịch</span>}
                      {!s.inCatalog && <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400" title="Trạm ghi trong lịch cắt điện, chưa có trong danh mục Trạm biến áp">· ngoài danh mục</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        );
      })}
      {!shown.length && <p className="text-sm text-slate-500" role="status">Không có trạm nào khớp.</p>}
    </fieldset>
  );
}

/** "a, b, c và 5 trạm khác" */
const nameList = (names) => (names.length > SHOW_NAMES
  ? `${names.slice(0, SHOW_NAMES).join(', ')} và ${names.length - SHOW_NAMES} trạm khác`
  : names.join(', '));

/**
 * Khu vực truyền tải điện (TTĐ) và trạm mỗi tổ phụ trách: dùng cho "Chỉ tổ của tôi" ở tab Lịch cắt điện
 * và để báo thay đổi lịch cho tổ trưởng. Mọi người xem; admin sửa.
 */
export default function TeamAreasPanel({ canManage }) {
  const { api, notify } = useDkct();
  const [data, setData] = useState(null); // { teams: [{ department, shortName, areas, stations }], options, substations }
  const [editing, setEditing] = useState(null); // { department, areas: Set, extra, stations: Map<key, name> }
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
      const stations = [...editing.stations].map(([key, name]) => ({ key, name }));
      await api.put('/team-areas', { department: editing.department, areas, stations });
      notify(`Đã lưu khu vực và trạm của ${editing.department}.`, 'success');
      setEditing(null);
      load();
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };

  if (!data) return <Loader2 className="w-5 h-5 animate-spin text-chatlan-600" aria-label="Đang tải" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Lịch cắt điện của Công ty chỉ ghi đơn vị TTĐ (vd "TTĐ Lâm Đồng") và địa điểm, không ghi tổ. Mỗi tổ chọn khu vực, và
        tích đúng các trạm tổ phụ trách: "Chỉ tổ của tôi" và tin báo lịch thay đổi cho tổ trưởng/tổ phó chỉ gồm các trạm đó.
        Trạm được nhận từ địa điểm của dòng lịch (vd "Trạm 220kV Phan Thiết, ĐZ …").
      </p>
      {data.teams.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Chưa có tổ nào. Thêm tổ ở phần quản trị (danh sách tổ/phòng) trước.</p>
      )}
      <ul className="space-y-2">
        {data.teams.map(t => {
          const open = editing?.department === t.department;
          const stationNames = t.stations.map(s => s.name);
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
                  <button type="button" className={btnGhost} aria-label={`Sửa khu vực và trạm của ${t.department}`}
                    onClick={() => setEditing({
                      department: t.department, areas: new Set(t.areas), extra: '',
                      stations: new Map(t.stations.map(s => [s.key, s.name]))
                    })}>
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {!open && (
                  <span className="basis-full text-xs text-slate-500 dark:text-slate-400">
                    {stationNames.length
                      ? <>Trạm phụ trách ({stationNames.length}): <b className="text-slate-700 dark:text-slate-200">{nameList(stationNames)}</b>.</>
                      : <>Chưa tích trạm: phụ trách mọi trạm trong khu vực đã chọn.</>}
                  </span>
                )}
              </div>
              {open && (
                <div className="mt-2 space-y-3">
                  <fieldset className="space-y-1">
                    <legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">Khu vực</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {[...new Set([...data.options, ...editing.areas])].map(a => (
                        <label key={a} className="inline-flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
                          <input type="checkbox" checked={editing.areas.has(a)} onChange={() => toggle(a)} /> {a}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Khu vực khác (cách nhau bởi dấu phẩy)
                    <input value={editing.extra} onChange={e => setEditing(v => ({ ...v, extra: e.target.value }))} placeholder="vd Truyền tải điện Phú Yên"
                      className={`${inputCls} ${inputBorder()} block mt-1`} />
                  </label>
                  <StationPicker substations={data.substations || []} teamAreas={[...editing.areas]} stations={editing.stations}
                    onChange={stations => setEditing(v => ({ ...v, stations }))} />
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
