import React, { useId, useMemo, useState } from 'react';
import { X, UserCheck, PenLine } from 'lucide-react';
import { fromCatalog, personLabel, personKey, sameName } from '../lib/form.js';
import { inputCls, inputBorder } from './ui.jsx';

// Chỉ dùng để LỌC gợi ý (gõ không dấu vẫn ra); ghép tên gõ tay với danh mục thì giữ dấu (sameName).
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/**
 * Chọn người từ danh mục nhân sự ATĐ hoặc tự ghi tên.
 * - chọn từ danh sách: Bậc ATĐ tự hiển thị (chỉ đọc)
 * - tự ghi: nhập được Bậc ATĐ bên cạnh
 * Chữ đang gõ được ghi nhận ngay khi rời ô (blur) — trước khi nút Lưu kịp xử lý click.
 * value: PersonRef | null; onChange(PersonRef | null)
 */
export default function PersonPicker({
  value, onChange, personnel, placeholder = 'Chọn từ danh sách hoặc tự ghi…',
  invalid = false, exclude = [], showLevel = true, inputId, ariaLabel, autoFocus = false, clearOnSelect = false
}) {
  const listId = useId();
  const [draft, setDraft] = useState(null); // chữ đang gõ; null = hiển thị value
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // -1 = chưa chủ động chọn gợi ý bằng phím

  const text = draft ?? (value?.name || '');
  const excluded = useMemo(() => new Set(exclude.map(personKey)), [exclude]);
  const selectable = useMemo(() => personnel.filter(p => !excluded.has(`id:${p.id}`)), [personnel, excluded]);
  const options = useMemo(() => {
    const q = fold(draft ?? '');
    return selectable.filter(p => !q || fold(p.fullName).includes(q) || fold(p.safetyCard).includes(q)).slice(0, 30);
  }, [selectable, draft]);

  const reset = () => { setDraft(clearOnSelect ? '' : null); setOpen(false); setActive(-1); };

  const choose = (row) => {
    onChange(fromCatalog(row));
    reset();
  };

  const commitTyped = () => {
    if (draft === null) { setOpen(false); return; }
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) {
      if (!clearOnSelect) onChange(null);
      reset();
      return;
    }
    const exact = selectable.find(p => sameName(p.fullName, name));
    if (exact) { choose(exact); return; }
    if (!value || value.personnelId || value.name !== name) {
      onChange({ personnelId: null, name, safetyLevel: value && !value.personnelId ? value.safetyLevel : '', safetyCard: '' });
    }
    reset();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && options[active]) choose(options[active]);
      else commitTyped();
    } else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); setActive(-1); }
  };

  const manual = value && !value.personnelId;
  return (
    <div className="flex items-start gap-2">
      <div className="relative flex-1 min-w-0">
        <div className="relative">
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={invalid || undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            value={text}
            placeholder={placeholder}
            onChange={(e) => { setDraft(e.target.value); setOpen(true); setActive(-1); }}
            onFocus={() => setOpen(true)}
            onBlur={commitTyped}
            onKeyDown={onKeyDown}
            className={`${inputCls} ${inputBorder(invalid)} pr-14`}
          />
          <span className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400" title={manual ? 'Tự ghi' : value ? 'Từ danh mục' : ''}>
            {value && !clearOnSelect && (manual
              ? <PenLine className="w-3.5 h-3.5" aria-label="Tự ghi" />
              : <UserCheck className="w-3.5 h-3.5 text-emerald-600" aria-label="Từ danh mục" />)}
          </span>
          {value && !clearOnSelect && (
            <button type="button" aria-label="Bỏ chọn" onClick={() => { setDraft(null); onChange(null); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {open && options.length > 0 && (
          <ul id={listId} role="listbox"
            className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
            {options.map((p, i) => (
              <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                // mousedown + preventDefault: ô nhập không mất focus nên không ghi nhận chữ đang gõ trước khi chọn
                onMouseDown={(e) => { e.preventDefault(); choose(p); }}
                onMouseEnter={() => setActive(i)}
                className={`px-3 py-1.5 text-sm cursor-pointer ${i === active ? 'bg-chatlan-50 dark:bg-chatlan-900/50 text-chatlan-700 dark:text-chatlan-300' : 'text-slate-700 dark:text-slate-200'}`}>
                {personLabel(p)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {showLevel && !clearOnSelect && (
        manual ? (
          <input type="text" aria-label="Bậc ATĐ" placeholder="Bậc" value={value.safetyLevel || ''}
            onChange={(e) => onChange({ ...value, safetyLevel: e.target.value })}
            className={`${inputCls} ${inputBorder(false)} !w-20 flex-shrink-0 text-center`} />
        ) : (
          <span className="w-20 flex-shrink-0 py-1.5 text-center text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            title="Bậc an toàn điện">
            {value?.safetyLevel ? `Bậc ${value.safetyLevel}` : '—'}
          </span>
        )
      )}
    </div>
  );
}
