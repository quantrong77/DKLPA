import React, { useEffect, useState } from 'react';
import { Trash2, Loader2, X } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnSecondary, cardCls, inputCls, inputBorder } from './ui.jsx';

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d); };
const vn = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

/**
 * Dọn lịch cắt điện cũ (admin): chọn khoảng ngày bắt đầu, xem trước số dòng sẽ xóa, xác nhận rồi xóa.
 * Dòng đã có biên bản KSHT / phương án / giấy ĐKCT gắn được giữ lại.
 */
export default function OutagePurge({ onDone }) {
  const { api, notify, confirmAction } = useDkct();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => ({ from: '', to: daysAgo(90) }));
  const [preview, setPreview] = useState(null); // { total, linked, deletable } | { error }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setPreview(null);
    if (!range.to || (range.from && range.from > range.to)) { setPreview({ error: 'Chọn đến ngày (từ ngày ≤ đến ngày).' }); return undefined; }
    const t = setTimeout(() => {
      api.get(`/outages/purge/preview?${new URLSearchParams({ from: range.from, to: range.to })}`)
        .then(setPreview).catch(err => setPreview({ error: err.message }));
    }, 250);
    return () => clearTimeout(t);
  }, [api, open, range]);

  const purge = async () => {
    const span = range.from ? `từ ${vn(range.from)} đến ${vn(range.to)}` : `đến hết ${vn(range.to)}`;
    if (!(await confirmAction({
      title: `Xóa ${preview.deletable} dòng lịch cắt điện?`,
      message: `Các dòng lịch có ngày bắt đầu ${span} và lịch sử thay đổi của chúng sẽ bị xóa hẳn, không khôi phục được.${preview.linked ? ` Giữ lại ${preview.linked} dòng đã có hồ sơ gắn.` : ''}`,
      confirmLabel: 'Xóa', danger: true
    }))) return;
    setBusy(true);
    try {
      const res = await api.post('/outages/purge', range);
      notify(`Đã xóa ${res.deleted} dòng lịch${res.kept ? `, giữ ${res.kept} dòng có hồ sơ` : ''}.`, 'success');
      setOpen(false);
      onDone();
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" className={btnSecondary} onClick={() => setOpen(true)} title="Xóa các dòng lịch cũ theo khoảng ngày để gọn dữ liệu">
        <Trash2 className="w-4 h-4 text-red-600" /> Dọn lịch cũ
      </button>
    );
  }
  return (
    <div className={`${cardCls} w-full space-y-2`} role="group" aria-label="Dọn lịch cắt điện cũ">
      <div className="flex items-center gap-2">
        <Trash2 className="w-4 h-4 text-red-600" aria-hidden="true" />
        <p className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">Dọn lịch cắt điện cũ</p>
        <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Đóng" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Xóa các dòng lịch có ngày bắt đầu trong khoảng chọn (bỏ trống "từ ngày" = từ dòng cũ nhất). Dòng đã có biên bản KSHT,
        phương án hoặc giấy ĐKCT gắn được giữ lại để hồ sơ không mất liên kết.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Từ ngày
          <input type="date" aria-label="Dọn từ ngày" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className={`${inputCls} ${inputBorder()} block mt-1`} />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Đến ngày
          <input type="date" aria-label="Dọn đến ngày" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className={`${inputCls} ${inputBorder()} block mt-1`} />
        </label>
        <button type="button" onClick={purge} disabled={busy || !preview || preview.error || !preview.deletable}
          className="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Xóa {preview && !preview.error ? preview.deletable : ''} dòng
        </button>
      </div>
      <p className="text-xs text-slate-700 dark:text-slate-200" role="status">
        {!preview ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" aria-label="Đang đếm" />
          : preview.error ? <span className="text-red-700 dark:text-red-400">{preview.error}</span>
            : preview.total === 0 ? 'Không có dòng lịch nào trong khoảng này.'
              : <>Trong khoảng có <b>{preview.total}</b> dòng: xóa <b className="text-red-700 dark:text-red-400">{preview.deletable}</b>{preview.linked ? <>, giữ <b>{preview.linked}</b> dòng có hồ sơ gắn</> : null}.</>}
      </p>
    </div>
  );
}
