import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { THEMES } from '../lib/theme.js';
import { btnGhost } from './ui.jsx';

/** Chọn giao diện của module (ghi nhớ theo trình duyệt). */
export default function ThemePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" className={btnGhost} aria-haspopup="true" aria-expanded={open} aria-label="Chọn giao diện" title="Giao diện"
        onClick={() => setOpen(v => !v)}>
        <Palette className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" aria-label="Giao diện"
          className="absolute right-0 top-full mt-1 z-50 w-72 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg">
          <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Giao diện</p>
          {THEMES.map(t => {
            const active = t.id === value;
            return (
              <button key={t.id} type="button" role="menuitemradio" aria-checked={active}
                onClick={() => { onChange(t.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition ${active ? 'bg-chatlan-50 dark:bg-chatlan-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span className="flex -space-x-1.5 flex-shrink-0" aria-hidden="true">
                  {t.swatch.map((c, i) => (
                    <span key={i} className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-900 shadow-sm" style={{ background: c }} />
                  ))}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">{t.label}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">{t.description}</span>
                </span>
                {active && <Check className="w-4 h-4 text-chatlan-600 flex-shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
