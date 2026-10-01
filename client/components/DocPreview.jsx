import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, FileDown, FileText, RefreshCw, Loader2, AlertTriangle, Eye } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost, btnSecondary } from './ui.jsx';

const escapeHtml = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Đặt dấu Tab tới đúng điểm dừng tab của đoạn như Word (docx-preview chỉ vẽ một khoảng trống cố định).
 * Ghép tab trong cây tài liệu (thứ tự xuất hiện trong thân văn bản) với các <span> tab đã dựng; vị trí tab tính
 * từ mép trái cột chữ (ô bảng hoặc lề trang). Phải gọi khi khung đang ở tỉ lệ 1. Không khớp được thì để nguyên.
 */
function layoutTabs(doc, hostEl) {
  const stopsOfTabs = [];
  const walk = (el, tabs) => {
    if (!el || typeof el !== 'object') return;
    if (el.type === 'paragraph') tabs = el.tabs || [];
    if (el.type === 'tab') stopsOfTabs.push(tabs || []);
    for (const c of el.children || []) walk(c, tabs);
  };
  walk(doc?.documentPart?.body, []);
  const spans = [...hostEl.querySelectorAll('section.dkct-docx article span')].filter(s => s.childElementCount === 0 && s.textContent === ' ');
  if (!spans.length || spans.length !== stopsOfTabs.length) return;
  const pt = (v) => parseFloat(v) || 0;
  const step = pt(doc.settingsPart?.settings?.defaultTabStop) || 36;
  spans.forEach((span, i) => {
    const column = span.closest('td, th, article');
    if (!column) return;
    const cs = getComputedStyle(column);
    const origin = column.getBoundingClientRect().left + pt(cs.borderLeftWidth) + pt(cs.paddingLeft);
    const x = (span.getBoundingClientRect().left - origin) * 0.75; // px -> pt
    const stops = stopsOfTabs[i].filter(t => t.style !== 'clear').map(t => pt(t.position)).sort((a, b) => a - b);
    const next = stops.find(p => p > x + 0.5) ?? (Math.floor(x / step) + 1) * step;
    span.textContent = '';
    Object.assign(span.style, { display: 'inline-block', width: `${(next - x).toFixed(1)}pt` });
  });
}

/**
 * "Tải PDF": in riêng các trang đang xem trong một iframe ẩn để trình duyệt "Lưu dưới dạng PDF" (chữ giữ dạng vector).
 * Lề trang lấy theo lề của văn bản; nội dung dài tự sang trang có đủ lề. Tên tệp gợi ý = tiêu đề.
 */
async function printPages(stylesEl, hostEl, fileName) {
  const first = hostEl.querySelector('section.dkct-docx');
  const cs = first ? getComputedStyle(first) : null;
  const margin = cs ? [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' ') : '2cm';
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(fileName)}</title></head><body></body></html>`);
  doc.close();
  doc.head.insertAdjacentHTML('beforeend', stylesEl.innerHTML);
  const css = doc.createElement('style');
  css.textContent = `@page { size: A4; margin: ${margin}; }
    html, body { margin: 0; background: #fff; }
    .dkct-docx-wrapper { background: none !important; padding: 0 !important; display: block !important; }
    .dkct-docx-wrapper > section.dkct-docx { box-shadow: none !important; margin: 0 !important; padding: 0 !important;
      width: auto !important; min-height: 0 !important; break-after: page; }
    .dkct-docx-wrapper > section.dkct-docx:last-child { break-after: auto; }`;
  doc.head.appendChild(css);
  doc.body.innerHTML = hostEl.innerHTML;
  await Promise.all([...doc.images].map(img => (img.complete ? null : new Promise(r => { img.onload = r; img.onerror = r; }))));
  await doc.fonts?.ready;
  // Chrome lấy tên tệp PDF theo tiêu đề trang chính: đổi tạm trong lúc in
  const oldTitle = document.title;
  const cleanup = () => { document.title = oldTitle; frame.remove(); };
  frame.contentWindow.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true });
  setTimeout(() => { if (frame.isConnected) cleanup(); }, 5 * 60 * 1000);
  document.title = fileName;
  frame.contentWindow.focus();
  frame.contentWindow.print();
}

/**
 * Khung xem trước bản Word bên phải màn hình (toàn màn hình trên điện thoại).
 * Dựng .docx ngay trong trình duyệt bằng docx-preview (tải khi mở lần đầu), tự thu nhỏ trang A4 cho vừa khung.
 * load(): Promise<Blob> — bản Word đã lưu hoặc bản dựng từ dữ liệu đang soạn.
 * pdf: cho "Tải PDF" (chỉ bản đã lưu — bản nháp chưa có số chính thức).
 */
export default function DocPreview({ title, note, load, onDownload, downloadLabel = 'Tải Word', pdf = true, onClose }) {
  const { ModalOverlay, notify } = useDkct();
  const frame = useRef(null);
  const zoomBox = useRef(null);
  const host = useRef(null);
  const styles = useRef(null);
  const pageWidth = useRef(0);
  const [state, setState] = useState({ status: 'loading' }); // loading | ready | error
  const [fit, setFit] = useState(1);

  const measure = useCallback(() => {
    if (!frame.current || !pageWidth.current) return;
    setFit(Math.min(1, Math.max(0.3, (frame.current.clientWidth - 8) / pageWidth.current)));
  }, []);

  const run = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [blob, lib] = await Promise.all([load(), import('docx-preview')]);
      const options = { className: 'dkct-docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: true, renderFooters: true };
      // dựng hai bước (thay renderAsync) để giữ cây tài liệu: cần điểm dừng tab của từng đoạn
      const doc = await lib.parseAsync(blob, options);
      const nodes = await lib.renderDocument(doc, options);
      host.current.innerHTML = '';
      styles.current.innerHTML = '';
      for (const n of nodes) (n.nodeName === 'STYLE' ? styles.current : host.current).appendChild(n);
      // Word: "căn giữa" của hàng bảng (trPr/jc) là vị trí hàng, không phải căn chữ; docx-preview lại đổi thành
      // text-align của <tr> nên đoạn không tự căn (mặc định trái) bị căn giữa. Trả về căn trái như Word.
      const fix = document.createElement('style');
      fix.textContent = 'section.dkct-docx tr { text-align: start !important; }';
      styles.current.appendChild(fix);
      // đo ở tỉ lệ 1 (tab, bề rộng trang) rồi mới thu nhỏ cho vừa khung
      zoomBox.current.style.zoom = '1';
      layoutTabs(doc, host.current);
      const page = host.current.querySelector('section.dkct-docx');
      pageWidth.current = (page?.offsetWidth || 794) + 60; // khung của docx-preview lề 30px mỗi bên
      zoomBox.current.style.zoom = '';
      measure();
      setState({ status: 'ready' });
    } catch (err) {
      setState({ status: 'error', message: err.message || 'Không dựng được bản xem trước.', errors: err.errors || [] });
    }
  }, [load, measure]);

  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!frame.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(frame.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[60] flex justify-end bg-slate-900/30">
      <aside className="h-full w-full md:w-[min(920px,62vw)] bg-slate-200 dark:bg-slate-900 shadow-2xl flex flex-col" aria-label={`Xem trước: ${title}`}>
        <header className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <Eye className="w-4 h-4 text-chatlan-600 flex-shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">Xem trước: {title}</h2>
            {note && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{note}</p>}
          </div>
          <button type="button" className={btnGhost} onClick={run} disabled={state.status === 'loading'} aria-label="Dựng lại bản xem trước" title="Dựng lại (lấy dữ liệu mới nhất)">
            <RefreshCw className={`w-4 h-4 ${state.status === 'loading' ? 'animate-spin' : ''}`} />
          </button>
          {state.status === 'ready' && (
            <button type="button" className={btnSecondary} disabled={!pdf}
              onClick={() => printPages(styles.current, host.current, title.replace(/[\\/:*?"<>|]+/g, '-')).catch(err => notify(err.message, 'error'))}
              title={pdf ? 'Mở hộp thoại in: chọn “Lưu dưới dạng PDF” (Save as PDF)' : 'Lưu trước khi tải PDF'}>
              <FileText className="w-4 h-4" /> <span className="hidden sm:inline">Tải PDF</span>
            </button>
          )}
          {onDownload && (
            <button type="button" className={btnSecondary} onClick={onDownload}><FileDown className="w-4 h-4" /> <span className="hidden sm:inline">{downloadLabel}</span></button>
          )}
          <button type="button" className={btnGhost} onClick={onClose} aria-label="Đóng xem trước"><X className="w-5 h-5" /></button>
        </header>

        <div ref={frame} className="relative flex-1 overflow-auto">
          {state.status === 'loading' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-200/60 dark:bg-slate-900/60">
              <Loader2 className="w-6 h-6 animate-spin text-chatlan-600" aria-label="Đang dựng bản xem trước" />
            </div>
          )}
          {state.status === 'error' && (
            <div className="m-4 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-sm text-red-700 dark:text-red-300" role="alert">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {state.errors.length ? 'Cần sửa trước khi xem trước:' : state.message}</p>
              {state.errors.length > 0 && <ul className="list-disc pl-5 mt-1 space-y-0.5">{state.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>}
            </div>
          )}
          <div ref={zoomBox} style={{ zoom: fit }} className={state.status === 'error' ? 'hidden' : ''}>
            <div ref={styles} />
            <div ref={host} />
          </div>
        </div>
      </aside>
    </ModalOverlay>
  );
}
