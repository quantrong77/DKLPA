import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, ClipboardPaste, Trash2, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { inputCls, inputBorder, btnSecondary, btnGhost } from './ui.jsx';
import { shrinkImage } from '../lib/image.js';

export const MAX_PHOTOS = 30;
const MAX_INPUT = 25 * 1024 * 1024; // ảnh gốc trước khi thu nhỏ
let seq = 0;
const nextKey = () => `p${++seq}`;

/**
 * Trạng thái hình ảnh khảo sát của một biên bản: ảnh đã lưu (tải từ máy chủ) + ảnh mới chọn, chú thích, thứ tự.
 * Ảnh mới, ảnh xóa, chú thích/thứ tự đổi chỉ gửi lên khi lưu biên bản (sync).
 */
export function useSurveyPhotos(surveyId) {
  const { api, notify } = useDkct();
  const [photos, setPhotos] = useState([]); // [{ key, id, url, file, caption, savedCaption }]
  const [removed, setRemoved] = useState([]); // id ảnh đã lưu bị bỏ
  const [savedOrder, setSavedOrder] = useState([]);
  const [loading, setLoading] = useState(false);
  const urls = useRef(new Set());
  const track = (url) => { urls.current.add(url); return url; };
  useEffect(() => () => urls.current.forEach(u => URL.revokeObjectURL(u)), []);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const { items } = await api.get(`/surveys/${id}/photos`);
      const list = await Promise.all(items.map(async (p) => {
        const blob = await api.blob(`/surveys/${id}/photos/${p.id}`).catch(() => null);
        return { key: nextKey(), id: p.id, url: blob ? track(URL.createObjectURL(blob)) : null, file: null, caption: p.caption, savedCaption: p.caption };
      }));
      setPhotos(list);
      setSavedOrder(list.map(p => p.id));
      setRemoved([]);
    } catch (err) { notify(`Không tải được hình ảnh khảo sát: ${err.message}`, 'warning'); } finally { setLoading(false); }
  }, [api, notify]);
  useEffect(() => { load(surveyId); }, [surveyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = removed.length > 0 || photos.some(p => !p.id || p.caption !== p.savedCaption)
    || photos.map(p => p.id).join('|') !== savedOrder.join('|');

  /** Thêm ảnh (đã thu nhỏ). */
  const add = async (files) => {
    const list = [...files].filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) { notify(`Mỗi biên bản tối đa ${MAX_PHOTOS} ảnh.`, 'error'); return; }
    if (list.length > room) notify(`Chỉ thêm ${room} ảnh (tối đa ${MAX_PHOTOS} ảnh mỗi biên bản).`, 'warning');
    setLoading(true);
    try {
      const added = [];
      for (const f of list.slice(0, room)) {
        if (f.size > MAX_INPUT) { notify(`Ảnh "${f.name}" quá lớn (tối đa 25 MB).`, 'error'); continue; }
        try {
          const file = await shrinkImage(f);
          added.push({ key: nextKey(), id: null, url: track(URL.createObjectURL(file)), file, caption: '', savedCaption: null });
        } catch (err) { notify(err.message, 'error'); }
      }
      setPhotos(ps => [...ps, ...added]);
    } finally { setLoading(false); }
  };

  /** Gửi thay đổi ảnh lên biên bản đã lưu (id). */
  const sync = async (id) => {
    if (!changed) return;
    for (const photoId of removed) await api.del(`/surveys/${id}/photos/${photoId}`);
    const ids = [];
    for (const p of photos) {
      if (p.id) { ids.push(p.id); continue; }
      const form = new FormData();
      form.append('caption', p.caption || '');
      form.append('file', p.file);
      const res = await api.sendForm(`/surveys/${id}/photos`, form, 'POST');
      ids.push(res.photo.id);
    }
    await api.put(`/surveys/${id}/photos`, { items: photos.map((p, i) => ({ id: ids[i], caption: p.caption || '' })) });
    setPhotos(ps => ps.map((p, i) => ({ ...p, id: ids[i], file: null, savedCaption: p.caption })));
    setSavedOrder(ids);
    setRemoved([]);
  };

  return { photos, setPhotos, removed, setRemoved, add, sync, changed, loading };
}

/** Mục "Hình ảnh khảo sát hiện trường (nếu có)": chọn nhiều ảnh, dán, kéo thả; chú thích, thứ tự, xóa. */
export default function SurveyPhotos({ state, readOnly }) {
  const { photos, setPhotos, setRemoved, add, loading } = state;
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const setCaption = (key, caption) => setPhotos(ps => ps.map(p => (p.key === key ? { ...p, caption } : p)));
  const move = (i, d) => setPhotos(ps => {
    const j = i + d;
    if (j < 0 || j >= ps.length) return ps;
    const next = [...ps];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (p) => {
    setPhotos(ps => ps.filter(x => x.key !== p.key));
    if (p.id) setRemoved(r => [...r, p.id]);
  };
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile());
    if (files.length) { e.preventDefault(); add(files); }
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div tabIndex={0} onPaste={onPaste} role="group" aria-label="Thêm hình ảnh khảo sát"
          onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer?.files || []); }}
          className={`flex flex-wrap items-center gap-2 p-3 rounded-xl border-2 border-dashed text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:border-chatlan-500 ${over ? 'border-chatlan-500 bg-chatlan-50 dark:bg-chatlan-900/30' : 'border-slate-300 dark:border-slate-700'}`}>
          <button type="button" className={btnSecondary} onClick={() => inputRef.current?.click()} disabled={loading || photos.length >= MAX_PHOTOS}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Chọn ảnh…
          </button>
          <span className="inline-flex items-center gap-1"><ClipboardPaste className="w-4 h-4" /> chọn nhiều ảnh, kéo thả vào khung này, hoặc bấm vào khung rồi dán (Ctrl+V)</span>
          <span className="ml-auto text-slate-500">{photos.length}/{MAX_PHOTOS} ảnh</span>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { add(e.target.files || []); e.target.value = ''; }} />
        </div>
      )}
      {photos.length === 0 ? (
        <p className="text-xs text-slate-500">{loading ? 'Đang tải ảnh…' : 'Chưa có ảnh — biên bản không có trang hình ảnh.'}</p>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-2" aria-label="Hình ảnh khảo sát">
          {photos.map((p, i) => (
            <li key={p.key} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <a href={p.url || undefined} target="_blank" rel="noopener noreferrer" className="block bg-slate-100 dark:bg-slate-800" title="Mở ảnh cỡ lớn">
                {p.url
                  ? <img src={p.url} alt={p.caption || `Ảnh ${i + 1}`} className="w-full h-44 object-contain" />
                  : <span className="flex h-44 items-center justify-center text-xs text-slate-500">Không tải được ảnh</span>}
              </a>
              <div className="p-2 space-y-1.5">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">Ảnh {i + 1}{!p.id ? ' (mới)' : ''}</span>
                  {!readOnly && (
                    <span className="ml-auto flex">
                      <button type="button" className={btnGhost} aria-label={`Đưa ảnh ${i + 1} lên trước`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowLeft className="w-4 h-4" /></button>
                      <button type="button" className={btnGhost} aria-label={`Đưa ảnh ${i + 1} ra sau`} disabled={i === photos.length - 1} onClick={() => move(i, 1)}><ArrowRight className="w-4 h-4" /></button>
                      <button type="button" className={btnGhost} aria-label={`Xóa ảnh ${i + 1}`} onClick={() => remove(p)}><Trash2 className="w-4 h-4" /></button>
                    </span>
                  )}
                </div>
                {readOnly
                  ? <p className="text-sm text-slate-700 dark:text-slate-200">{p.caption || <i className="text-slate-400">không có chú thích</i>}</p>
                  : <input aria-label={`Chú thích ảnh ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={p.caption} maxLength={300}
                    placeholder="Chú thích, vd Ngăn lộ 272 nhìn từ phía MC" onChange={e => setCaption(p.key, e.target.value)} />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
