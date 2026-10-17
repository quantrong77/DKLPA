import React, { useState } from 'react';
import { Plus, Pencil, EyeOff, Save, X, Users, Building2, ClipboardList, ShieldAlert, Zap, FileImage, FileUp, Cable, Search } from 'lucide-react';
import { useDkct } from '../context.jsx';
import DrawingDialog from './DrawingDialog.jsx';
import CtLibraryPanel from './CtLibraryPanel.jsx';
import { TabButton, btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';
import { usePersistentState } from '../lib/persist.js';

const CATALOGS = {
  personnel: {
    label: 'Nhân sự ATĐ', icon: Users,
    columns: [
      { key: 'fullName', label: 'Họ tên', required: true },
      { key: 'safetyLevel', label: 'Bậc ATĐ', width: '!w-24', placeholder: '5/5' },
      { key: 'safetyCard', label: 'Số thẻ', width: '!w-24', placeholder: '058' },
      { key: 'position', label: 'Chức danh' }
    ]
  },
  stations: {
    label: 'Đơn vị QLVH (nơi nhận)', icon: Building2,
    columns: [
      { key: 'name', label: 'Tên đơn vị', required: true },
      { key: 'shortName', label: 'Viết tắt', width: '!w-28' },
      { key: 'leaderName', label: 'Người phụ trách' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Điện thoại', width: '!w-36' }
    ]
  },
  substations: {
    label: 'Trạm biến áp', icon: Zap,
    hint: 'Mỗi trạm thuộc một đơn vị QLVH; biên bản khảo sát chọn trạm thì tự điền người phụ trách của đơn vị đó. Phương án chọn trạm thì tự điền Truyền tải điện khu vực.',
    columns: [
      { key: 'name', label: 'Tên trạm', required: true, placeholder: 'TBA 220kV …' },
      { key: 'stationId', label: 'Đơn vị QLVH', type: 'select', options: (c) => c.stations, display: (row, c) => c.stations.find(u => u.id === row.stationId)?.name || '' },
      { key: 'transmissionName', label: 'Truyền tải điện khu vực', placeholder: 'Truyền tải điện Lâm Đồng', suggest: (c) => [...new Set(c.substations.map(s => s.transmissionName).filter(Boolean))] },
      { key: 'sortOrder', label: 'Thứ tự', width: '!w-20', type: 'number' }
    ]
  },
  duties: {
    label: 'Nhiệm vụ', icon: ClipboardList,
    hint: 'Dùng {n} để chèn số ĐVCT, vd "Nhân viên đơn vị công tác {n}".',
    columns: [
      { key: 'name', label: 'Nhiệm vụ', required: true },
      { key: 'sortOrder', label: 'Thứ tự', width: '!w-20', type: 'number' }
    ]
  },
  risks: {
    label: 'Thư viện rủi ro', icon: ShieldAlert,
    columns: [
      { key: 'hazard', label: 'Công việc, vị trí, mối nguy', required: true, multiline: true },
      { key: 'measures', label: 'Biện pháp an toàn', multiline: true },
      { key: 'performer', label: 'Đơn vị thực hiện', multiline: true },
      { key: 'sortOrder', label: 'Thứ tự', width: '!w-20', type: 'number' }
    ]
  }
};

function RowEditor({ cfg, value, onChange, catalogs }) {
  return cfg.columns.map(c => {
    const common = {
      'aria-label': c.label,
      value: value[c.key] ?? '',
      placeholder: c.placeholder || c.label,
      onChange: e => onChange({ ...value, [c.key]: e.target.value }),
      className: `${inputCls} ${inputBorder()} ${c.width || ''}`
    };
    if (c.type === 'select') {
      return (
        <select key={c.key} {...common}>
          <option value="">— {c.label} —</option>
          {c.options(catalogs).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      );
    }
    if (c.suggest) {
      return (
        <React.Fragment key={c.key}>
          <input type="text" list={`catalog-${c.key}`} {...common} />
          <datalist id={`catalog-${c.key}`}>{c.suggest(catalogs).map(v => <option key={v} value={v} />)}</datalist>
        </React.Fragment>
      );
    }
    return c.multiline ? <textarea key={c.key} rows={3} {...common} /> : <input key={c.key} type={c.type || 'text'} {...common} />;
  });
}

/** Quản lý các danh mục; thành viên thường chỉ xem. Thư viện mạch dòng: tạm thời chỉ admin sửa.
 * Cài đặt hệ thống (khu vực của tổ, tải lịch tự động, mẫu văn bản) ở tab "Cài đặt" của admin. */
export default function CatalogPanel({ catalogs, canManage, isAdmin, onChanged }) {
  const { api, notify, confirmAction } = useDkct();
  const [tab, setTab] = usePersistentState('dkct.catalogTab', 'personnel', [...Object.keys(CATALOGS), 'ctLibrary']);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null); // { id?, ...values }
  const [drawingOf, setDrawingOf] = useState(null); // trạm đang mở bản vẽ
  const drawingsOf = (substationId) => (catalogs.drawings || []).filter(d => d.substationId === substationId);
  const cfg = CATALOGS[tab];
  const all = (cfg && catalogs[tab]) || [];
  // lọc nhanh trên mọi cột hiển thị (không phân biệt hoa thường, dấu)
  const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const needle = fold(filter.trim());
  const rows = needle ? all.filter(row => cfg.columns.some(c => fold(c.display ? c.display(row, catalogs) : row[c.key]).includes(needle))) : all;

  const save = async () => {
    try {
      const { id, ...values } = editing;
      if (id) await api.put(`/${tab}/${id}`, values);
      else await api.post(`/${tab}`, values);
      notify('Đã lưu danh mục.', 'success');
      setEditing(null);
      onChanged(tab);
    } catch (err) { notify(err.message, 'error'); }
  };
  const remove = async (row) => {
    const name = row[cfg.columns[0].key];
    if (!(await confirmAction({ title: 'Ẩn khỏi danh mục?', message: `"${String(name).slice(0, 80)}" sẽ không còn trong danh sách chọn. Giấy đã lập vẫn giữ nguyên.`, danger: true }))) return;
    try { await api.del(`/${tab}/${row.id}`); onChanged(tab); } catch (err) { notify(err.message, 'error'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto">
        {Object.entries(CATALOGS).map(([key, c]) => (
          <TabButton key={key} icon={c.icon} active={tab === key} onClick={() => { setTab(key); setEditing(null); setFilter(''); }}>
            {c.label} ({(catalogs[key] || []).length})
          </TabButton>
        ))}
        <TabButton icon={Cable} active={tab === 'ctLibrary'} onClick={() => { setTab('ctLibrary'); setEditing(null); }}>Mạch dòng TI</TabButton>
      </div>
      {tab === 'ctLibrary' && <CtLibraryPanel catalogs={catalogs} canManage={!!isAdmin} />}
      {cfg && <>
      {cfg.hint && <p className="text-xs text-slate-500 dark:text-slate-400">{cfg.hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {canManage && !editing && (
          <button type="button" className={btnSecondary} onClick={() => setEditing({})}><Plus className="w-4 h-4" /> Thêm</button>
        )}
        {all.length > 8 && (
          <label className="relative flex-1 min-w-[12rem] max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder={`Tìm trong ${cfg.label.toLowerCase()}…`}
              aria-label={`Tìm trong ${cfg.label}`} className={`${inputCls} ${inputBorder()} pl-8`} />
          </label>
        )}
        {needle && <span className="text-xs text-slate-500">{rows.length}/{all.length} dòng</span>}
      </div>
      {editing && (
        <div className="bg-white dark:bg-slate-900 border border-chatlan-200 dark:border-chatlan-900 rounded-xl p-3 space-y-2">
          <div className={`grid gap-2 ${cfg.columns.some(c => c.multiline) ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-4'}`}>
            <RowEditor cfg={cfg} value={editing} onChange={setEditing} catalogs={catalogs} />
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={save}><Save className="w-4 h-4" /> Lưu</button>
            <button type="button" className={btnSecondary} onClick={() => setEditing(null)}><X className="w-4 h-4" /> Hủy</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs text-slate-600 dark:text-slate-300">
            <tr>
              {cfg.columns.map(c => <th key={c.key} className="p-2">{c.label}</th>)}
              {tab === 'substations' && <th className="p-2">Bản vẽ sơ đồ</th>}
              {canManage && <th className="p-2 w-20" />}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={cfg.columns.length + 2} className="p-4 text-center text-sm text-slate-500">
                {needle ? `Không có dòng nào khớp "${filter.trim()}".` : 'Chưa có dữ liệu.'}
              </td></tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800 align-top text-slate-700 dark:text-slate-200">
                {cfg.columns.map(c => <td key={c.key} className="p-2 whitespace-pre-line">{c.display ? c.display(row, catalogs) : row[c.key]}</td>)}
                {tab === 'substations' && (
                  <td className="p-1">
                    {drawingsOf(row.id).length ? (
                      <button type="button" className={btnSecondary} onClick={() => setDrawingOf(row)} title={drawingsOf(row.id).map(d => `${d.label}: ${d.fileName} (trang ${d.page})`).join('\n')}>
                        <FileImage className="w-4 h-4 text-chatlan-600" /> {drawingsOf(row.id).map(d => d.label).join(' · ')}
                      </button>
                    ) : canManage ? (
                      <button type="button" className={btnSecondary} onClick={() => setDrawingOf(row)}><FileUp className="w-4 h-4" /> Tải PDF</button>
                    ) : <span className="text-xs text-slate-400">Chưa có</span>}
                  </td>
                )}
                {canManage && (
                  <td className="p-1 whitespace-nowrap">
                    <button type="button" className={btnGhost} aria-label="Sửa" title="Sửa" onClick={() => setEditing({ ...row })}><Pencil className="w-4 h-4" /></button>
                    <button type="button" className={btnGhost} aria-label="Ẩn" title="Ẩn khỏi danh sách chọn (giấy đã lập giữ nguyên)" onClick={() => remove(row)}><EyeOff className="w-4 h-4" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {drawingOf && (
        <DrawingDialog substation={drawingOf} drawings={drawingsOf(drawingOf.id)} canManage={canManage}
          onClose={() => setDrawingOf(null)} onChanged={() => onChanged('drawings')} />
      )}
      </>}
    </div>
  );
}
