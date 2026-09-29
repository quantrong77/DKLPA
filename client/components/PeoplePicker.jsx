import React from 'react';
import { X } from 'lucide-react';
import PersonPicker from './PersonPicker.jsx';
import { personKey, formatCard } from '../lib/form.js';

/** Danh sách nhiều người (thẻ tên) + ô chọn để thêm; số người tự đếm. */
export default function PeoplePicker({ value = [], onChange, personnel, exclude = [], placeholder = 'Thêm người…', ariaLabel, invalid }) {
  const add = (p) => {
    if (!p || value.some(v => personKey(v) === personKey(p))) return;
    onChange([...value, p]);
  };
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={ariaLabel}>
          {value.map((p) => (
            <li key={personKey(p)}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200">
              <span>{p.name}</span>
              {formatCard(p) && <span className="text-slate-500 dark:text-slate-400">({formatCard(p)})</span>}
              <button type="button" aria-label={`Bỏ ${p.name}`} onClick={() => onChange(value.filter(v => personKey(v) !== personKey(p)))}
                className="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-white dark:hover:bg-slate-700">
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PersonPicker value={null} onChange={add} personnel={personnel} clearOnSelect showLevel={false}
        exclude={[...exclude, ...value]} placeholder={placeholder} ariaLabel={ariaLabel} invalid={invalid} />
    </div>
  );
}
