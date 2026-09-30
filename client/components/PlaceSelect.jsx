import React, { useEffect, useState } from 'react';
import { useDkct } from '../context.jsx';
import { inputCls, inputBorder } from './ui.jsx';

const FALLBACK = ['Lâm Đồng', 'Khánh Hòa'];
const NEW = '__new';
let cache = null; // danh sách địa danh dùng chung trong phiên

/**
 * Địa danh ("<địa danh>, ngày … tháng … năm …"): chọn trong danh sách (mặc định Lâm Đồng, Khánh Hòa)
 * hoặc "Thêm địa danh khác…" để gõ; địa danh mới được server nhớ khi lưu văn bản.
 */
export default function PlaceSelect({ id, value, onChange }) {
  const { api } = useDkct();
  const [places, setPlaces] = useState(cache || FALLBACK);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    api.get('/places').then(r => { cache = r.items; setPlaces(r.items); }).catch(() => {});
  }, [api]);

  const known = !value || places.includes(value);
  if (typing || !known) {
    return (
      <div className="flex gap-2">
        <input id={id} autoFocus={typing} className={`${inputCls} ${inputBorder()}`} value={value || ''} placeholder="Gõ địa danh, vd Ninh Thuận"
          onChange={e => onChange(e.target.value)} />
        <button type="button" className="text-xs font-semibold text-chatlan-600 hover:underline whitespace-nowrap"
          onClick={() => { setTyping(false); if (!places.includes(value)) onChange(places[0]); }}>Chọn từ danh sách</button>
      </div>
    );
  }
  return (
    <select id={id} className={`${inputCls} ${inputBorder()}`} value={value || ''}
      onChange={e => { if (e.target.value === NEW) { setTyping(true); onChange(''); } else onChange(e.target.value); }}>
      {!value && <option value="">— Chọn địa danh —</option>}
      {places.map(p => <option key={p} value={p}>{p}</option>)}
      <option value={NEW}>＋ Thêm địa danh khác…</option>
    </select>
  );
}
