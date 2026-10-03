import React, { useState } from 'react';
import { CircleHelp, Info, X, ClipboardCheck, Mail, UserRound, Check } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { ABOUT, HELP_SECTIONS, helpFor } from '../lib/help.js';
import { APP_NAME } from '../lib/workflow.js';
import { btnGhost } from './ui.jsx';
import pkg from '../../package.json';

/** Khung "Hướng dẫn" bên phải: mở đúng mục của tab đang xem, chọn mục khác ở danh sách bên trái. */
export function HelpPanel({ tab, onClose }) {
  const { ModalOverlay } = useDkct();
  const [current, setCurrent] = useState(() => helpFor(tab).id);
  const section = helpFor(current);
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[60] flex justify-end bg-slate-900/30">
      <aside role="dialog" aria-modal="true" aria-label="Hướng dẫn sử dụng"
        className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <CircleHelp className="w-5 h-5 text-chatlan-600" aria-hidden="true" />
          <h2 className="flex-1 text-base font-bold text-slate-900 dark:text-white">Hướng dẫn sử dụng</h2>
          <button type="button" className={btnGhost} onClick={onClose} aria-label="Đóng hướng dẫn"><X className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          <nav aria-label="Mục hướng dẫn" className="sm:w-44 flex-shrink-0 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-800 overflow-x-auto sm:overflow-y-auto">
            <ul className="flex sm:flex-col gap-0.5 p-2 min-w-max sm:min-w-0">
              {HELP_SECTIONS.map(s => (
                <li key={s.id}>
                  <button type="button" onClick={() => setCurrent(s.id)} aria-current={s.id === current ? 'true' : undefined}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap ${s.id === current
                      ? 'bg-chatlan-50 text-chatlan-700 font-semibold dark:bg-chatlan-900/40 dark:text-chatlan-300'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <section className="flex-1 overflow-y-auto p-4" aria-labelledby="dkct-help-title">
            <h3 id="dkct-help-title" className="text-lg font-bold text-slate-900 dark:text-white mb-3">{section.title}</h3>
            <dl className="space-y-3">
              {section.items.map(([term, text]) => (
                <div key={term}>
                  <dt className="text-sm font-semibold text-slate-900 dark:text-white">{term}</dt>
                  <dd className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">{text}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </aside>
    </ModalOverlay>
  );
}

/** Hộp "Giới thiệu": ứng dụng, tính năng chính, phiên bản, người phát triển. */
export function AboutDialog({ onClose }) {
  const { ModalOverlay } = useDkct();
  const dev = ABOUT.developer;
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40">
      <div role="dialog" aria-modal="true" aria-labelledby="dkct-about-title"
        className="w-full max-w-lg max-h-full overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="w-11 h-11 rounded-xl bg-chatlan-600 text-white flex items-center justify-center flex-shrink-0">
            <ClipboardCheck className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="dkct-about-title" className="text-lg font-bold text-slate-900 dark:text-white">{APP_NAME}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Phiên bản {pkg.version}</p>
          </div>
          <button type="button" className={btnGhost} onClick={onClose} aria-label="Đóng giới thiệu"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{ABOUT.summary}</p>
          <ul className="space-y-1.5">
            {ABOUT.features.map(f => (
              <li key={f} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden="true" /> <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Phát triển</p>
            <p className="flex items-center gap-2 text-sm text-slate-900 dark:text-white">
              <UserRound className="w-4 h-4 text-chatlan-600" aria-hidden="true" /> {dev.name}
            </p>
            <p className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-chatlan-600" aria-hidden="true" />
              <a href={`mailto:${dev.email}?subject=${encodeURIComponent(`[${APP_NAME}] Góp ý`)}`} className="text-chatlan-700 dark:text-chatlan-300 hover:underline">{dev.email}</a>
            </p>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

/** Hai nút ở đầu trang: Hướng dẫn (theo tab đang xem), Giới thiệu. */
export default function HelpAboutButtons({ tab }) {
  const [open, setOpen] = useState(null); // 'help' | 'about'
  return (
    <>
      <button type="button" className={btnGhost} aria-label="Hướng dẫn" title="Hướng dẫn sử dụng" onClick={() => setOpen('help')}>
        <CircleHelp className="w-4 h-4" />
      </button>
      <button type="button" className={btnGhost} aria-label="Giới thiệu" title="Giới thiệu" onClick={() => setOpen('about')}>
        <Info className="w-4 h-4" />
      </button>
      {open === 'help' && <HelpPanel tab={tab} onClose={() => setOpen(null)} />}
      {open === 'about' && <AboutDialog onClose={() => setOpen(null)} />}
    </>
  );
}
