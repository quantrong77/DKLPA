import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';
import CtEditor, { StatusBadge } from './CtEditor.jsx';

/**
 * Thư viện cô lập mạch dòng: các biến dòng (TI) theo trạm; phương án chọn TI để in Phụ lục II.
 * Ai cũng xem được; tạm thời chỉ admin thêm/sửa/xác nhận.
 */
export default function CtLibraryPanel({ catalogs, canManage }) {
  const { api, notify } = useDkct();
  const substations = catalogs.substations || [];
  const [substationId, setSubstationId] = useState('');
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(null); // { substationId, name }
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    api.get(`/ct-library${substationId ? `?substationId=${encodeURIComponent(substationId)}` : ''}`)
      .then(r => setItems(r.items)).catch(err => notify(err.message, 'error'));
  }, [api, notify, substationId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const { ct } = await api.post('/ct-library', adding);
      setAdding(null);
      load();
      setOpenId(ct.id);
    } catch (err) { notify(err.message, 'error'); }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Bảng cô lập mạch dòng của từng biến dòng cho Phụ lục II của phương án: mỗi core tách 6 hàng kẹp đầu tiên tại tủ trung gian (L1, L2, L3), kèm đầu phía CT theo bản vẽ.
        Tải trang bản vẽ mạch dòng (PDF/ảnh), khoanh vùng từng core để xem lại khi lập phương án.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Lọc theo trạm" className={`${inputCls} ${inputBorder()} !w-72`} value={substationId} onChange={e => setSubstationId(e.target.value)}>
          <option value="">Tất cả trạm</option>
          {substations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {canManage && !adding && (
          <button type="button" className={btnSecondary} onClick={() => setAdding({ substationId: substationId || substations[0]?.id || '', name: '' })}>
            <Plus className="w-4 h-4" /> Thêm biến dòng
          </button>
        )}
      </div>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 bg-white dark:bg-slate-900 border border-chatlan-200 dark:border-chatlan-900 rounded-xl p-3">
          <select aria-label="Trạm của biến dòng" className={`${inputCls} ${inputBorder()} !w-64`} value={adding.substationId} onChange={e => setAdding(a => ({ ...a, substationId: e.target.value }))}>
            {substations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input aria-label="Tên biến dòng" className={`${inputCls} ${inputBorder()} !w-40`} value={adding.name} placeholder="TI 272" autoFocus
            onChange={e => setAdding(a => ({ ...a, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && adding.name.trim() && create()} />
          <button type="button" className={btnPrimary} disabled={!adding.name.trim() || !adding.substationId} onClick={create}>Tạo (4 core)</button>
          <button type="button" className={btnSecondary} onClick={() => setAdding(null)}>Hủy</button>
        </div>
      )}
      <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        {!items ? <div className="p-3"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div> : !items.length ? (
          <p className="p-3 text-sm text-slate-500">Chưa có biến dòng nào{substationId ? ' của trạm này' : ''}.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs text-slate-600 dark:text-slate-300">
              <tr><th className="p-2">Trạm</th><th className="p-2">Biến dòng</th><th className="p-2">Ngăn</th><th className="p-2">Tủ trung gian</th><th className="p-2">Số core</th><th className="p-2">Phiên bản</th><th className="p-2">Trạng thái</th></tr>
            </thead>
            <tbody>
              {items.map(x => (
                <tr key={x.id} className="border-t border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer" onClick={() => setOpenId(x.id)}>
                  <td className="p-2">{x.substationName}</td>
                  <td className="p-2 font-semibold"><button type="button" className="hover:underline" onClick={() => setOpenId(x.id)}>{x.name}</button></td>
                  <td className="p-2">{x.bay}</td>
                  <td className="p-2">{x.panel}</td>
                  <td className="p-2">{x.coreCount}</td>
                  <td className="p-2">{x.revision}</td>
                  <td className="p-2"><StatusBadge status={x.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {openId && <CtEditor ctId={openId} catalogs={catalogs} canManage={canManage} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
