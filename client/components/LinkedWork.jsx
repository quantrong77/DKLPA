import React, { useEffect, useState } from 'react';
import { Briefcase, Unlink, Loader2 } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { formatDateTime } from './ui.jsx';

const range = (a, b) => [formatDateTime(a), formatDateTime(b)].filter(Boolean).join(' → ');

/**
 * Dải "Công việc không có lịch cắt điện" của biên bản KSHT / phương án / giấy ĐKCT lập từ một công việc
 * (thay cho dải lịch cắt điện); bỏ gắn được để chuyển sang gắn lịch cắt điện.
 */
export default function LinkedWork({ workId, onUnlink, readOnly }) {
  const { api } = useDkct();
  const [work, setWork] = useState(null);
  const [state, setState] = useState('loading'); // loading | shown | missing

  useEffect(() => {
    let alive = true;
    setState('loading');
    api.get(`/works/${workId}`)
      .then(r => { if (alive) { setWork(r.work); setState('shown'); } })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [api, workId]);

  const place = work ? [work.location, work.stationName].filter(Boolean).join(' · ').replace(/\s+/g, ' ') : '';
  return (
    <div className="border-b border-sky-200 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-950/30 px-4 py-1 text-xs" aria-label="Công việc liên quan">
      <div className="flex items-center gap-1.5 min-h-[1.75rem]">
        <Briefcase className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0 truncate" title={work ? `${place}\n${work.content}` : undefined}>
          {state === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin text-chatlan-600 inline" aria-label="Đang tải công việc" />}
          {state === 'missing' && <span className="text-sky-800 dark:text-sky-300">Công việc đã gắn không còn (có thể đã bị xóa)</span>}
          {state === 'shown' && (
            <>
              <b className="font-semibold text-slate-900 dark:text-white">Công việc không có lịch cắt điện</b>
              {range(work.startTime, work.endTime) ? ` · ${range(work.startTime, work.endTime)}` : ''}
              {place ? ` · ${place}` : ''}
              <span className="text-slate-600 dark:text-slate-300"> · {String(work.content || '').replace(/\s+/g, ' ')}</span>
            </>
          )}
        </span>
        {!readOnly && (
          <button type="button" onClick={onUnlink} aria-label="Bỏ gắn công việc" title="Bỏ gắn công việc (để gắn lịch cắt điện)"
            className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-sky-100 dark:hover:bg-sky-900/40 flex-shrink-0">
            <Unlink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
