import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Wand2, ChevronDown, ChevronRight } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Section, btnPrimary, btnGhost } from './ui.jsx';
import { planBayKeys, bayMatches, fromTestPlan, itemNote } from '../lib/testPlan.js';

/**
 * Phương án → Phụ lục I: các thiết bị của trạm trong kế hoạch thí nghiệm năm (đồng bộ từ Google Sheet ở Cài đặt).
 * Gom theo ngăn lộ; ngăn lộ ghi ở phương án được chọn sẵn. "Thêm vào phương án": Bảng 1 (hạng mục QĐ 1901 theo chu kỳ)
 * và bảng thiết bị cần thí nghiệm (mục E.3).
 */
export default function TestPlanPicker({ form, update, devices }) {
  const { api, notify } = useDkct();
  const station = form.station?.name || '';
  // năm của phương án (ô Năm, không thì năm bắt đầu công tác); có thể chọn kế hoạch năm khác
  const planYear = Number(form.year) || Number(String(form.time?.start || '').slice(0, 4)) || new Date().getFullYear();
  const [year, setYear] = useState(planYear);
  useEffect(() => { setYear(planYear); }, [planYear]);
  const [data, setData] = useState(null); // { year, years, syncedAt, items }
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    if (!station) { setData(null); return undefined; }
    let alive = true;
    setLoading(true);
    api.get(`/test-plan/items?${new URLSearchParams({ station, year })}`)
      .then(r => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, station, year]);

  // gom theo ngăn lộ, ngăn lộ của phương án lên đầu
  const mine = useMemo(() => planBayKeys(form.bays), [form.bays]);
  const bays = useMemo(() => {
    const map = new Map();
    for (const it of data?.items || []) {
      const k = it.bay || '(không ghi ngăn)';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return [...map].map(([bay, items]) => ({ bay, items, mine: bayMatches(mine, bay) }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.bay.localeCompare(b.bay, 'vi', { numeric: true }));
  }, [data, mine]);

  // chọn sẵn thiết bị thuộc ngăn lộ của phương án, chưa lấy vào phương án
  useEffect(() => {
    const used = new Set(form.testPlanItemIds || []);
    setPicked(new Set(bays.filter(b => b.mine).flatMap(b => b.items).filter(it => !used.has(it.id)).map(it => it.id)));
    setOpen(new Set(bays.filter(b => b.mine).map(b => b.bay)));
  }, [bays]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!station) return null;
  const toggle = (set, setSet, key) => setSet(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const toggleBay = (b) => setPicked(prev => {
    const next = new Set(prev);
    const all = b.items.every(it => next.has(it.id));
    b.items.forEach(it => (all ? next.delete(it.id) : next.add(it.id)));
    return next;
  });
  const add = () => {
    const items = (data?.items || []).filter(it => picked.has(it.id));
    const result = fromTestPlan(form, items, devices);
    update(() => result.form);
    notify(`Đã thêm ${result.groups} nhóm vào Bảng 1, ${result.rows} dòng vào bảng thiết bị cần thí nghiệm (mục E.3).`, 'success');
    setPicked(new Set());
  };
  const used = new Set(form.testPlanItemIds || []);

  return (
    <Section title={`Kế hoạch thí nghiệm năm ${data?.year || ''}`.trim()}
      subtitle={data?.syncedAt ? `${station} · đồng bộ lúc ${new Date(data.syncedAt).toLocaleString('vi-VN')}` : station}
      actions={data?.years?.length > 1 ? (
        <select aria-label="Kế hoạch năm" className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900"
          value={data.year} onChange={e => setYear(Number(e.target.value))}>
          {data.years.map(y => <option key={y} value={y}>Kế hoạch {y}</option>)}
        </select>
      ) : null}>
      {data?.year && data.year !== planYear && !loading && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-1.5">Chưa có kế hoạch năm {planYear}: đang hiện kế hoạch năm {data.year}.</p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải kế hoạch…</p>
      ) : !bays.length ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {data?.year ? `Kế hoạch năm ${data.year} chưa có thiết bị của trạm này` : 'Chưa có kế hoạch thí nghiệm'}{data?.syncedAt ? '' : ' (admin vào Cài đặt → Kế hoạch thí nghiệm để thêm, đồng bộ kế hoạch)'}.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chọn thiết bị rồi bấm <b>Thêm vào phương án</b>: Bảng 1 lập hạng mục QĐ 1901 theo chu kỳ (thiết bị có bảng QĐ 1901), bảng thiết bị cần
            thí nghiệm (E.3) thêm mọi thiết bị đã chọn. Ngăn lộ của phương án được chọn sẵn.
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            {bays.map(b => {
              const all = b.items.every(it => picked.has(it.id));
              const some = !all && b.items.some(it => picked.has(it.id));
              const expanded = open.has(b.bay);
              return (
                <li key={b.bay} className={b.mine ? 'bg-chatlan-50/60 dark:bg-chatlan-900/20' : ''}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <button type="button" className={btnGhost} aria-label={expanded ? `Thu ngăn ${b.bay}` : `Mở ngăn ${b.bay}`} aria-expanded={expanded}
                      onClick={() => toggle(open, setOpen, b.bay)}>
                      {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = some; }} onChange={() => toggleBay(b)}
                      aria-label={`Chọn cả ngăn ${b.bay}`} className="w-4 h-4 accent-chatlan-600" />
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{b.bay}</span>
                    <span className="text-xs text-slate-500">{b.items.length} thiết bị{b.mine ? ' · ngăn của phương án' : ''}</span>
                  </div>
                  {expanded && (
                    <ul className="pb-1.5 pl-12 pr-2 space-y-0.5">
                      {b.items.map(it => (
                        <li key={it.id}>
                          <label className="flex items-start gap-2 text-xs">
                            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-chatlan-600" checked={picked.has(it.id)} onChange={() => toggle(picked, setPicked, it.id)} />
                            <span className="min-w-0">
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{it.deviceName}</span>
                              <span className="text-slate-500"> · {itemNote(it)}</span>
                              {!it.deviceKey && <span className="text-slate-400"> · không có bảng QĐ 1901</span>}
                              {used.has(it.id) && <span className="text-emerald-700 dark:text-emerald-400"> · đã thêm</span>}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <button type="button" className={btnPrimary} onClick={add} disabled={!picked.size}>
            <Wand2 className="w-4 h-4" /> Thêm vào phương án ({picked.size})
          </button>
        </div>
      )}
    </Section>
  );
}

