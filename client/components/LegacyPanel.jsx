import React, { useEffect, useState } from 'react';
import { Archive, FileDown } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost } from './ui.jsx';

/** Giấy lập bằng module ĐKCT cũ của ChatLan: chỉ xem danh sách và tải Word. */
export default function LegacyPanel() {
  const { apiFetch, downloadAuthenticatedFile, notify, EmptyState } = useDkct();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/work-registrations')
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `Lỗi ${r.status}`);
        setItems(d.registrations || []);
      })
      .catch(err => { setError(err.message); setItems([]); });
  }, [apiFetch]);

  if (items === null) return <p className="text-xs text-slate-500">Đang tải…</p>;
  if (error) return <p className="text-sm text-red-600" role="alert">Không tải được giấy cũ: {error}</p>;
  if (items.length === 0) return <EmptyState icon={Archive} title="Không có giấy cũ" description="Giấy lập bằng phiên bản trước sẽ hiện ở đây (chỉ đọc)." />;
  return (
    <ul className="space-y-2">
      {items.map(r => (
        <li key={r.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-start gap-3">
          <span className="font-mono text-sm font-bold text-slate-600 dark:text-slate-300">{r.docNumber || '—'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-900 dark:text-white line-clamp-2">{r.workContent}</p>
            <p className="text-xs text-slate-500">{r.startTime} · {r.recipient}</p>
          </div>
          <button type="button" className={btnGhost} aria-label="Tải Word"
            onClick={() => downloadAuthenticatedFile(`/api/work-registrations/${r.id}/export-docx`, `DangKyCongTac_${r.docNumber || r.id}.docx`).catch(e => notify(e.message, 'error'))}>
            <FileDown className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
