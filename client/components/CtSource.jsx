import React, { useEffect, useState } from 'react';
import { X, Loader2, Maximize2, Crop, Check } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost, btnPrimary, btnSecondary } from './ui.jsx';
import { cropStyle } from '../lib/ctLibrary.js';
import { markFromPoints } from '../lib/survey.js';

// ảnh trang mạch dòng dùng lại trong phiên (thư viện và phương án cùng xem một trang nhiều lần);
// giữ tối đa MAX_CACHED trang gần nhất, trang cũ hơn thì giải phóng
const MAX_CACHED = 20;
const pageUrls = new Map();
function pageUrl(api, pageId) {
  const hit = pageUrls.get(pageId);
  if (hit) {
    pageUrls.delete(pageId);
    pageUrls.set(pageId, hit); // dùng gần nhất: đưa về cuối
    return hit;
  }
  const p = api.blob(`/ct-pages/${pageId}/image`).then(b => URL.createObjectURL(b));
  p.catch(() => pageUrls.delete(pageId));
  pageUrls.set(pageId, p);
  while (pageUrls.size > MAX_CACHED) {
    const [oldest, url] = pageUrls.entries().next().value;
    pageUrls.delete(oldest);
    url.then(u => URL.revokeObjectURL(u), () => {});
  }
  return p;
}

/** URL ảnh của một trang mạch dòng đã lưu (null khi đang tải hoặc lỗi). */
export function usePageImage(pageId) {
  const { api } = useDkct();
  const [state, setState] = useState({ url: null, error: false });
  useEffect(() => {
    let alive = true;
    setState({ url: null, error: false });
    if (pageId) pageUrl(api, pageId).then(url => alive && setState({ url, error: false }), () => alive && setState({ url: null, error: true }));
    return () => { alive = false; };
  }, [api, pageId]);
  return state;
}

const box = (r) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

/** Chỉ vùng core trên ảnh trang (phóng theo vùng); chưa có vùng thì cả trang. */
export function CropView({ pageId, region, alt, className = '' }) {
  const { url, error } = usePageImage(pageId);
  const [size, setSize] = useState(null);
  useEffect(() => { setSize(null); }, [url]); // trang khác: đo lại kích thước trước khi cắt
  if (error) return <p className="text-xs text-red-600">Không tải được ảnh bản vẽ.</p>;
  if (!url) return <div className="flex items-center gap-1 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Đang tải…</div>;
  if (!region) return <img src={url} alt={alt} className={`w-full h-auto bg-white ${className}`} />;
  const s = size && cropStyle(region, size.w, size.h);
  return (
    <div className={`relative overflow-hidden bg-white ${className}`} style={s ? s.box : { aspectRatio: '4 / 3' }}>
      <img src={url} alt={alt} draggable={false} className="absolute max-w-none h-auto" style={s ? s.img : { visibility: 'hidden' }}
        onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
    </div>
  );
}

/** Xem lại mạch dòng của một core: vùng đã khoanh, hoặc cả trang có đánh dấu vùng. */
export function SourceDialog({ title, subtitle, pageId, region, onClose }) {
  const { ModalOverlay } = useDkct();
  const { url } = usePageImage(pageId);
  const [whole, setWhole] = useState(!region);
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[60] bg-slate-900/50 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-white dark:bg-slate-900 w-full md:max-w-5xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[92vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1">
            {region && (
              <button type="button" className={btnSecondary} onClick={() => setWhole(w => !w)}>
                {whole ? <><Crop className="w-4 h-4" /> Vùng core</> : <><Maximize2 className="w-4 h-4" /> Cả trang</>}
              </button>
            )}
            <button type="button" className={btnGhost} aria-label="Đóng" onClick={onClose}><X className="w-5 h-5" /></button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {whole ? (
            url ? (
              <div className="relative">
                <img src={url} alt={title} className="w-full h-auto bg-white rounded-lg border border-slate-200 dark:border-slate-700" />
                {region && <div className="absolute border-[3px] border-red-600 pointer-events-none" style={box(region)} />}
              </div>
            ) : <CropView pageId={pageId} region={null} alt={title} />
          ) : <CropView pageId={pageId} region={region} alt={title} className="rounded-lg border border-slate-200 dark:border-slate-700" />}
        </div>
      </div>
    </ModalOverlay>
  );
}

/** Khoanh vùng một core trên ảnh trang: kéo chuột để vẽ khung (tọa độ tương đối 0–1). */
export function RegionPicker({ title, pageId, region, onSave, onClose }) {
  const { ModalOverlay } = useDkct();
  const { url } = usePageImage(pageId);
  const [value, setValue] = useState(region);
  const [drag, setDrag] = useState(null);
  const rel = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const draft = drag && markFromPoints(drag.a, drag.b, '');
  const strip = (m) => (m ? { x: m.x, y: m.y, w: m.w, h: m.h } : null);
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[60] bg-slate-900/50 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-white dark:bg-slate-900 w-full md:max-w-6xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[94vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{title}</h2>
            <p className="text-xs text-slate-500">Kéo chuột khoanh phần mạch của core: từ cuộn CT tới hàng kẹp tủ trung gian.</p>
          </div>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={onClose}><X className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {!url ? <Loader2 className="w-5 h-5 animate-spin text-slate-500" /> : (
            <div className="relative select-none">
              <img src={url} alt={title} draggable={false} className="block w-full h-auto bg-white rounded-lg border border-slate-200 dark:border-slate-700" />
              {value && !draft && <div className="absolute border-[3px] border-red-600 bg-red-500/5 pointer-events-none" style={box(value)} />}
              {draft && <div className="absolute border-2 border-dashed border-red-600 bg-red-500/10 pointer-events-none" style={box(draft)} />}
              <div className="absolute inset-0 cursor-crosshair touch-none" aria-label="Kéo để khoanh vùng core"
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const p = rel(e); setDrag({ a: p, b: p }); }}
                onPointerMove={e => { if (!drag) return; const b = rel(e); setDrag(d => (d ? { ...d, b } : d)); }}
                onPointerUp={e => { const m = drag && markFromPoints(drag.a, rel(e), ''); setDrag(null); if (m) setValue(strip(m)); }}
                onPointerCancel={() => setDrag(null)} />
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800">
          <button type="button" className={btnSecondary} onClick={onClose}>Hủy</button>
          <button type="button" className={btnPrimary} disabled={!value} onClick={() => onSave(value)}><Check className="w-4 h-4" /> Dùng vùng này</button>
        </footer>
      </div>
    </ModalOverlay>
  );
}
