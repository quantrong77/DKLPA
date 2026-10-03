import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Save, FileDown, Loader2, AlertTriangle, Eye, Plus, Trash2, ImagePlus, ClipboardPaste, FileImage, ExternalLink, SquareDashedMousePointer } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Field, Section, inputCls, inputBorder, btnPrimary, btnSecondary, btnGhost } from './ui.jsx';
import DocPreview from './DocPreview.jsx';
import QltnLink from './QltnLink.jsx';
import { Risks } from './EditorAppendix.jsx';
import LinkedOutage from './LinkedOutage.jsx';
import { openDrawingPdf } from './DrawingDialog.jsx';
import { fieldErrors } from '../lib/form.js';
import { suggestDrawings } from '../lib/plan.js';
import { emptyRep, qlvhRoleFor, qlvhRoleOptions, workUnitRoleOptions, stationFromCatalog, withQlvhFor, markFromPoints } from '../lib/survey.js';

const MAX_IMAGE = 10 * 1024 * 1024;

function RepList({ label, prefix, reps, onChange, errors, field, roleOptions, peopleListId, onAdd }) {
  const setRep = (i, patch) => onChange(list => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const listId = `${field}-roles`;
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{label}</legend>
      {errors[field] && <p className="text-xs text-red-600" role="alert">{errors[field]}</p>}
      {reps.map((r, i) => (
        <div key={i} className="grid grid-cols-[2.5rem_5rem_1fr_auto] sm:grid-cols-[2.5rem_5rem_1fr_1.3fr_auto] gap-2 items-start">
          <span className="pt-1.5 text-xs font-semibold text-slate-500">{prefix}.{i + 1}.</span>
          <select aria-label={`Danh xưng ${prefix}.${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={r.honorific}
            onChange={e => setRep(i, { honorific: e.target.value })}>
            <option>Ông</option><option>Bà</option>
          </select>
          <input aria-label={`Họ tên ${prefix}.${i + 1}`} list={peopleListId} placeholder="Họ tên" value={r.name}
            className={`${inputCls} ${inputBorder(errors[`${field}.${i}.name`])}`} onChange={e => setRep(i, { name: e.target.value })} />
          <button type="button" className={`${btnGhost} sm:order-last`} aria-label={`Xóa đại diện ${prefix}.${i + 1}`}
            onClick={() => onChange(list => list.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
          <input aria-label={`Chức vụ ${prefix}.${i + 1}`} list={listId} placeholder="Chức vụ" value={r.role}
            className={`${inputCls} ${inputBorder()} col-span-3 col-start-2 sm:col-span-1 sm:col-start-auto`}
            onChange={e => setRep(i, { role: e.target.value })} />
        </div>
      ))}
      <datalist id={listId}>{roleOptions.map(o => <option key={o} value={o} />)}</datalist>
      <button type="button" className={btnSecondary} onClick={onAdd}><Plus className="w-4 h-4" /> Thêm đại diện</button>
    </fieldset>
  );
}

/** Ảnh sơ đồ + các khung "Khu vực công tác" (kéo chuột để vẽ; tọa độ tương đối theo ảnh). */
function MarkedImage({ url, marks, setMarks, drawing, onDrawn, readOnly }) {
  const [drag, setDrag] = useState(null); // { a, b }
  const rel = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const box = (m) => ({ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` });
  const draft = drag && markFromPoints(drag.a, drag.b, '');

  return (
    <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white">
      <div className="relative inline-block min-w-full select-none">
        <img src={url} alt="Sơ đồ một sợi" draggable={false} className="block w-full h-auto" />
        {marks.map((m, i) => (
          <div key={i} className="absolute border-[3px] border-red-600 pointer-events-none" style={box(m)} aria-label={`Khung ${i + 1}: ${m.label}`}>
            {m.label && (
              <span className={`absolute left-0 ${m.y < 0.06 ? 'top-full mt-0.5' : 'bottom-full mb-0.5'} px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap bg-white text-red-600 border border-red-600`}>
                {m.label}
              </span>
            )}
          </div>
        ))}
        {draft && <div className="absolute border-2 border-dashed border-red-600 bg-red-500/10 pointer-events-none" style={box(draft)} />}
        {drawing && !readOnly && (
          <div className="absolute inset-0 cursor-crosshair touch-none" aria-label="Kéo để khoanh khu vực công tác"
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const p = rel(e); setDrag({ a: p, b: p }); }}
            onPointerMove={e => {
              if (!drag) return;
              const b = rel(e); // đọc ngay: e.currentTarget không còn khi React chạy hàm cập nhật
              setDrag(d => (d ? { ...d, b } : d));
            }}
            onPointerUp={e => {
              const m = drag && markFromPoints(drag.a, rel(e));
              setDrag(null);
              if (m) { setMarks(list => [...list, m]); onDrawn(); }
            }} />
        )}
      </div>
    </div>
  );
}

/**
 * Sơ đồ một sợi: lấy bản vẽ của trạm, chọn file, hoặc dán ảnh chụp (Ctrl+V);
 * khoanh "Khu vực công tác" — khi xuất Word thành khung + nhãn nổi trên ảnh (sửa tiếp được trong Word).
 */
function DiagramPicker({ diagram, setDiagram, readOnly, marks, setMarks, stationDrawings, stationName, onUseStationDrawing, onOpenPdf }) {
  const { notify } = useDkct();
  const inputRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const take = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) return notify('Chỉ nhận ảnh PNG hoặc JPG.', 'error');
    if (file.size > MAX_IMAGE) return notify('Ảnh sơ đồ tối đa 10 MB.', 'error');
    setDiagram(d => ({ ...d, status: 'new', file, url: URL.createObjectURL(file), source: '' }));
  };
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
    if (item) { e.preventDefault(); take(item.getAsFile()); }
  };
  const shown = diagram.status === 'saved' || diagram.status === 'new';
  const setMark = (i, patch) => setMarks(list => list.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-2">
      {stationDrawings.length > 0 && (
        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
          <p>Bản vẽ của {stationName}{stationDrawings.length > 1 ? ` (${stationDrawings.length} sơ đồ, chọn sơ đồ có khu vực công tác)` : ''}:</p>
          {stationDrawings.map(d => (
            <div key={d.id} className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{d.label}</span>
              <span>{d.fileName} (trang {d.page})</span>
              {!readOnly && (
                <button type="button" className={btnSecondary} onClick={() => onUseStationDrawing(d)}>
                  <FileImage className="w-4 h-4 text-chatlan-600" /> {stationDrawings.length > 1 ? `Dùng sơ đồ ${d.label}` : 'Dùng bản vẽ của trạm'}
                </button>
              )}
              <button type="button" className={btnSecondary} aria-label={`Mở PDF ${d.label}`} onClick={() => onOpenPdf(d)}><ExternalLink className="w-4 h-4" /> Mở PDF</button>
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div tabIndex={0} onPaste={onPaste} role="group" aria-label="Dán ảnh sơ đồ"
          className="flex flex-wrap items-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 focus:outline-none focus:border-chatlan-500 text-xs text-slate-600 dark:text-slate-300">
          <button type="button" className={btnSecondary} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="w-4 h-4" /> Chọn ảnh…
          </button>
          <span className="inline-flex items-center gap-1"><ClipboardPaste className="w-4 h-4" /> hoặc bấm vào khung này rồi dán ảnh chụp (Ctrl+V)</span>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden"
            onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }} />
          {shown && (
            <button type="button" className={`${btnGhost} ml-auto`} aria-label="Bỏ ảnh sơ đồ"
              onClick={() => setDiagram(d => ({ ...d, status: d.hadSaved ? 'removed' : 'none', file: null, url: null, source: '' }))}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {diagram.source && shown && <p className="text-xs text-emerald-700 dark:text-emerald-400">{diagram.source}</p>}
      {shown && diagram.url ? (
        <>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={drawing ? btnPrimary : btnSecondary} aria-pressed={drawing} onClick={() => setDrawing(v => !v)}>
                <SquareDashedMousePointer className="w-4 h-4" /> {drawing ? 'Kéo chuột trên sơ đồ để khoanh…' : 'Khoanh khu vực công tác'}
              </button>
              <span className="text-xs text-slate-500">Khung đỏ và nhãn được đặt nổi trên sơ đồ trong file Word (có thể kéo, sửa tiếp trong Word).</span>
            </div>
          )}
          <MarkedImage url={diagram.url} marks={marks} setMarks={setMarks} drawing={drawing} onDrawn={() => setDrawing(false)} readOnly={readOnly} />
          {marks.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-red-600 flex-shrink-0" aria-hidden="true" />
              <input aria-label={`Nhãn khung ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={m.label} placeholder="Nhãn (để trống: chỉ khung)"
                onChange={e => setMark(i, { label: e.target.value })} />
              <button type="button" className={btnGhost} aria-label={`Xóa khung ${i + 1}`} onClick={() => setMarks(list => list.filter((_, j) => j !== i))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </>
      ) : <p className="text-xs text-slate-500">{shown ? 'Đang tải ảnh…' : 'Chưa có ảnh sơ đồ — trang sơ đồ trong file Word sẽ để trống.'}</p>}
    </div>
  );
}

/**
 * Lập mới / sửa / xem Biên bản khảo sát hiện trường.
 * survey: null khi lập mới; { id, canEdit, hasDiagram } khi mở biên bản đã lưu.
 */
export default function SurveyEditor({ initial, survey, catalogs, departments = [], onClose, onSaved }) {
  const { api, notify, confirmAction, downloadAuthenticatedFile, ModalOverlay } = useDkct();
  const [form, setForm] = useState(initial);
  const [current, setCurrent] = useState(survey);
  const [diagram, setDiagram] = useState({ status: survey?.hasDiagram ? 'saved' : 'none', hadSaved: !!survey?.hasDiagram, file: null, url: null });
  const [errorList, setErrorList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exported, setExported] = useState(false); // đã tải Word: nhắc bước đăng lên QLTN
  const [dirty, setDirty] = useState(false);
  const readOnly = !!current && !current.canEdit;
  const errors = useMemo(() => fieldErrors(errorList), [errorList]);
  const update = (fn) => { setDirty(true); setForm(fn); };
  const setField = (key, value) => update(f => ({ ...f, [key]: typeof value === 'function' ? value(f[key]) : value }));

  // ảnh đã lưu: tải kèm xác thực để xem trước
  useEffect(() => {
    if (!survey?.hasDiagram) return undefined;
    let url = null;
    api.blob(`/surveys/${survey.id}/diagram`)
      .then(b => { url = URL.createObjectURL(b); setDiagram(d => (d.status === 'saved' ? { ...d, url } : d)); })
      .catch(() => notify('Không tải được ảnh sơ đồ đã lưu.', 'warning'));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [survey?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const substations = catalogs.substations || [];
  const units = catalogs.stations || [];
  const stationChoice = form.station?.substationId || (form.station?.manual || form.station?.name ? '__manual' : '');
  const teamOptions = departments.length ? [...new Set([...departments.map(d => d.name), form.header.teamName].filter(Boolean))] : [];
  const qlvhUnit = form.station?.qlvhUnitName || form.station?.name || '';

  // chọn TBA: gắn đơn vị QLVH, điền người phụ trách vào 2.1 (nếu còn trống) và chức vụ gợi ý
  const chooseStation = (value) => update(f => {
    const oldUnit = f.station?.qlvhUnitName || f.station?.name;
    if (value === '__manual' || !value) {
      const station = { substationId: null, name: value && !f.station?.substationId ? f.station?.name || '' : '', qlvhUnitId: null, qlvhUnitName: '', manual: value === '__manual' };
      return { ...f, station };
    }
    const picked = stationFromCatalog(value, substations, units);
    if (!picked) return f;
    return { ...f, station: picked.station, qlvhReps: withQlvhFor(f.qlvhReps, oldUnit, picked.station.qlvhUnitName, picked.leaderName) };
  });
  // các sơ đồ của trạm đang chọn (nếu danh mục TBA đã có PDF); TBA 500kV có thể có sơ đồ phía 500kV, phía 220kV
  const stationDrawings = form.station?.substationId ? (catalogs.drawings || []).filter(d => d.substationId === form.station.substationId) : [];
  const useStationDrawing = async (drawing) => {
    try {
      const blob = await api.blob(`/drawings/${drawing.id}/image`);
      const file = new File([blob], `so-do-tram.${drawing.imageType === 'png' ? 'png' : 'jpg'}`, { type: blob.type || `image/${drawing.imageType}` });
      const which = stationDrawings.length > 1 ? ` — ${drawing.label}` : '';
      setDiagram(d => ({ ...d, status: 'new', file, url: URL.createObjectURL(file),
        source: `Sơ đồ lấy từ bản vẽ ${form.station.name}${which} (${drawing.fileName}, trang ${drawing.page}); biên bản giữ bản này kể cả khi bản vẽ của trạm đổi sau.` }));
    } catch (err) { notify(`Không tải được bản vẽ của trạm: ${err.message}`, 'error'); }
  };
  // chọn trạm có bản vẽ khi biên bản chưa có sơ đồ -> tự dùng sơ đồ hợp với thiết bị công tác (nhiều sơ đồ: theo cấp điện áp ngăn lộ)
  const autoDrawing = stationDrawings.find(d => d.id === suggestDrawings(stationDrawings, [form.equipment, ...(form.scopeItems || [])].join(' '))[0]) || null;
  useEffect(() => {
    if (!readOnly && autoDrawing && diagram.status === 'none') useStationDrawing(autoDrawing);
  }, [autoDrawing?.id, autoDrawing?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMarks = (fn) => setField('diagramMarks', list => fn(list || []));

  const chooseTeam = (name) => update(f => ({
    ...f, header: { ...f.header, teamName: name, teamShort: departments.find(d => d.name === name)?.shortName || f.header.teamShort }
  }));

  const close = async () => {
    const changed = dirty || diagram.status === 'new' || diagram.status === 'removed';
    if (changed && !readOnly && !(await confirmAction({ title: 'Đóng biên bản chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị hủy.', confirmLabel: 'Đóng, không lưu' }))) return;
    onClose();
  };

  async function download(target = current) {
    try {
      const date = String(target.surveyTime || form.surveyTime || '').slice(0, 10).replace(/-/g, '');
      await downloadAuthenticatedFile(`/api/dkct/surveys/${target.id}/docx`, `BienBanKhaoSat_${date}.docx`);
      setExported(true);
      notify('Đã tải file Word. Bấm “Đăng QLTN” để mở trang QLTN và đăng biên bản.', 'success');
    } catch (err) { notify(err.message, 'error'); }
  }

  const payload = () => {
    const { station, ...rest } = form;
    return { ...rest, station: { substationId: station?.substationId || null, name: station?.name || '' } };
  };

  async function save({ andDownload = false } = {}) {
    setSaving(true);
    try {
      const body = payload();
      const res = current ? await api.put(`/surveys/${current.id}`, body) : await api.post('/surveys', body);
      let saved = res.survey;
      setCurrent(saved);
      setErrorList([]);
      setDirty(false);
      if (diagram.status === 'new') {
        await api.upload(`/surveys/${saved.id}/diagram`, diagram.file, 'PUT');
        saved = { ...saved, hasDiagram: true };
      } else if (diagram.status === 'removed') {
        await api.del(`/surveys/${saved.id}/diagram`);
        saved = { ...saved, hasDiagram: false };
      }
      setDiagram(d => ({ ...d, status: saved.hasDiagram ? 'saved' : 'none', hadSaved: saved.hasDiagram, file: null }));
      notify('Đã lưu biên bản khảo sát hiện trường.', 'success');
      if (andDownload) await download(saved);
      onSaved(saved);
    } catch (err) {
      if (err.status === 422) setErrorList(err.errors);
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const personNames = [...new Set((catalogs.personnel || []).map(p => p.fullName))];

  return (
    <ModalOverlay onClose={close} className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-slate-50 dark:bg-slate-950 w-full md:max-w-5xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[92vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {current ? (readOnly ? 'Biên bản khảo sát hiện trường' : 'Hiệu chỉnh biên bản khảo sát hiện trường') : 'Lập biên bản khảo sát hiện trường'}
            </h2>
            {readOnly && <p className="text-xs text-slate-500">Chỉ xem — bạn không có quyền sửa biên bản này.</p>}
          </div>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={close}><X className="w-5 h-5" /></button>
        </header>

        {/* ngoài vùng cuộn: luôn thấy khi cuộn nội dung bên dưới */}
        <LinkedOutage outageId={form.outageId} onChange={id => setField('outageId', id)} readOnly={readOnly} />
        <div className="flex-1 overflow-y-auto p-4">
          {errorList.length > 0 && (
            <div className="mb-3 flex gap-2 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-sm text-red-700 dark:text-red-300" role="alert">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <ul className="list-disc pl-4 space-y-0.5">{errorList.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </div>
          )}
          <fieldset disabled={readOnly} className="space-y-4 min-w-0">
            <Section title="Thông tin chung">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Đơn vị cấp trên (Đội/Phòng)" htmlFor="ks-unit">
                  <input id="ks-unit" className={`${inputCls} ${inputBorder()}`} value={form.header.unitName || ''}
                    onChange={e => setField('header', h => ({ ...h, unitName: e.target.value }))} />
                </Field>
                <Field label="Tổ lập biên bản" htmlFor="ks-team">
                  {teamOptions.length ? (
                    <select id="ks-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''} onChange={e => chooseTeam(e.target.value)}>
                      <option value="">— Chọn tổ —</option>
                      {teamOptions.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <input id="ks-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''} onChange={e => chooseTeam(e.target.value)} />
                  )}
                </Field>
                <Field label="Thời điểm khảo sát" htmlFor="ks-time" required error={errors.surveyTime}>
                  <input id="ks-time" type="datetime-local" className={`${inputCls} ${inputBorder(errors.surveyTime)}`} value={form.surveyTime || ''}
                    onChange={e => setField('surveyTime', e.target.value)} />
                </Field>
                <Field label="Tại trạm" htmlFor="ks-station" required error={errors.station}
                  hint={form.station?.qlvhUnitName ? `Đơn vị QLVH: ${form.station.qlvhUnitName}` : undefined}>
                  <select id="ks-station" className={`${inputCls} ${inputBorder(errors.station)}`} value={stationChoice} onChange={e => chooseStation(e.target.value)}>
                    <option value="">— Chọn trạm biến áp —</option>
                    {substations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    {form.station?.substationId && !substations.some(s => s.id === form.station.substationId) && (
                      <option value={form.station.substationId}>{form.station.name} (đã ẩn)</option>
                    )}
                    <option value="__manual">Tự ghi…</option>
                  </select>
                  {stationChoice === '__manual' && (
                    <input aria-label="Tên trạm (tự ghi)" className={`${inputCls} ${inputBorder(errors.station)} mt-2`} value={form.station?.name || ''}
                      placeholder="TBA 220kV …" onChange={e => setField('station', s => ({ ...s, substationId: null, manual: true, name: e.target.value }))} />
                  )}
                </Field>
              </div>
            </Section>

            <Section title="Thành phần" subtitle="Đại diện đầu tiên của mỗi bên ký ở cuối biên bản.">
              <RepList label="1. Đại diện đơn vị công tác" prefix="1" field="workUnitReps" reps={form.workUnitReps} errors={errors}
                onChange={(fn) => setField('workUnitReps', fn)} roleOptions={workUnitRoleOptions(form.header.teamShort)} peopleListId="ks-people"
                onAdd={() => setField('workUnitReps', l => [...l, emptyRep()])} />
              <RepList label="2. Đại diện (các) đơn vị QLVH" prefix="2" field="qlvhReps" reps={form.qlvhReps} errors={errors}
                onChange={(fn) => setField('qlvhReps', fn)} roleOptions={qlvhRoleOptions(qlvhUnit)} peopleListId="ks-qlvh-people"
                onAdd={() => setField('qlvhReps', l => [...l, { ...emptyRep(), role: l.length ? '' : qlvhRoleFor(qlvhUnit) }])} />
              <datalist id="ks-qlvh-people">{units.map(u => u.leaderName).filter(Boolean).map(n => <option key={n} value={n} />)}</datalist>
              <datalist id="ks-people">{personNames.map(n => <option key={n} value={n} />)}</datalist>
              <Field label="3. Đại diện các đơn vị có liên quan" htmlFor="ks-related">
                <input id="ks-related" className={`${inputCls} ${inputBorder()}`} value={form.relatedUnits || ''} placeholder="không"
                  onChange={e => setField('relatedUnits', e.target.value)} />
              </Field>
            </Section>

            <Section title="Nội dung khảo sát">
              <Field label="4. Địa điểm (hoặc thiết bị) thực hiện công việc" htmlFor="ks-equipment" required error={errors.equipment}
                hint={form.station?.name ? `In ra: "… tại ${form.station.name}."` : undefined}>
                <input id="ks-equipment" className={`${inputCls} ${inputBorder(errors.equipment)}`} value={form.equipment || ''} placeholder="Ngăn 275: TU275, TI275"
                  onChange={e => setField('equipment', e.target.value)} />
              </Field>
              <Field label="5. Nội dung công việc" htmlFor="ks-content" required error={errors.workContent}>
                <textarea id="ks-content" rows={2} className={`${inputCls} ${inputBorder(errors.workContent)}`} value={form.workContent || ''}
                  onChange={e => setField('workContent', e.target.value)} />
              </Field>
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">6. Phạm vi làm việc</legend>
                {form.scopeItems.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <input aria-label={`Phạm vi ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={s} placeholder="TU 275 - 3 pha"
                      onChange={e => setField('scopeItems', l => l.map((x, j) => (j === i ? e.target.value : x)))} />
                    <button type="button" className={btnGhost} aria-label={`Xóa phạm vi ${i + 1}`}
                      onClick={() => setField('scopeItems', l => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                <button type="button" className={btnSecondary} onClick={() => setField('scopeItems', l => [...l, ''])}><Plus className="w-4 h-4" /> Thêm dòng</button>
              </fieldset>
              <Field label="7. Thời gian tiến hành công việc" htmlFor="ks-timetext">
                <input id="ks-timetext" className={`${inputCls} ${inputBorder()}`} value={form.timeText || ''}
                  onChange={e => setField('timeText', e.target.value)} />
              </Field>
            </Section>

            <Risks form={form} setForm={update} riskLibrary={catalogs.risks} customFirst newPerformer="Đơn vị QLVH"
              title="8. Đánh giá rủi ro / Trách nhiệm của các đơn vị liên quan" />

            <Section title="Sơ đồ một sợi kết nối thiết bị, lưới điện nơi làm việc" subtitle="In ở trang cuối (khổ ngang) của biên bản.">
              <Field label="Ngày lập ghi trên sơ đồ" htmlFor="ks-diagram-date" hint="Để trống: theo ngày khảo sát.">
                <input id="ks-diagram-date" type="date" className={`${inputCls} ${inputBorder()} !w-44`} value={form.diagramDate || ''}
                  onChange={e => setField('diagramDate', e.target.value || null)} />
              </Field>
              <DiagramPicker diagram={diagram} setDiagram={setDiagram} readOnly={readOnly}
                marks={form.diagramMarks || []} setMarks={setMarks}
                stationDrawings={stationDrawings} stationName={form.station?.name} onUseStationDrawing={useStationDrawing}
                onOpenPdf={(d) => openDrawingPdf(api, d.id).catch(e => notify(e.message, 'error'))} />
            </Section>
          </fieldset>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-b-2xl">
          <button type="button" className={`${btnSecondary} mr-auto`} onClick={() => setPreviewing(true)} disabled={saving} title="Xem bản Word trước khi lưu/tải">
            <Eye className="w-4 h-4" /> Xem trước
          </button>
          {current && (
            <button type="button" className={btnSecondary} onClick={() => download()} disabled={saving || dirty || diagram.status === 'new' || diagram.status === 'removed'}
              title={dirty ? 'Lưu thay đổi trước khi tải' : undefined}>
              <FileDown className="w-4 h-4" /> Tải Word
            </button>
          )}
          {current && <QltnLink highlight={exported} />}
          {!readOnly && (
            <>
              <button type="button" className={btnSecondary} onClick={() => save({ andDownload: true })} disabled={saving}>
                <FileDown className="w-4 h-4" /> Lưu & tải Word
              </button>
              <button type="button" className={btnPrimary} onClick={() => save()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {current ? 'Lưu thay đổi' : 'Lưu biên bản'}
              </button>
            </>
          )}
        </footer>
        {previewing && (
          <DocPreview
            title={current ? `Biên bản KSHT` : 'Biên bản KSHT (chưa lưu)'}
            note={(readOnly || (current && !dirty && diagram.status !== 'new' && diagram.status !== 'removed')) ? 'Bản đã lưu' : `Bản dựng từ dữ liệu đang soạn — chưa lưu${current ? '' : ', số chỉ là dự kiến'}${diagram.status === 'new' ? ' · ảnh sơ đồ mới chọn chỉ có sau khi lưu' : ''}`}
            load={() => ((readOnly || (current && !dirty && diagram.status !== 'new' && diagram.status !== 'removed'))
              ? api.blob(`/surveys/${current.id}/docx`)
              : api.previewDocx(current ? `/surveys/${current.id}/preview${diagram.status === 'removed' ? '?noDiagram=1' : ''}` : `/surveys/preview?docNumber=${encodeURIComponent('' || '')}`, payload()))}
            onDownload={(readOnly || (current && !dirty && diagram.status !== 'new' && diagram.status !== 'removed')) ? () => download() : () => { setPreviewing(false); save({ andDownload: true }); }}
            downloadLabel={(readOnly || (current && !dirty && diagram.status !== 'new' && diagram.status !== 'removed')) ? 'Tải Word' : 'Lưu & tải Word'}
            pdf={(readOnly || (current && !dirty && diagram.status !== 'new' && diagram.status !== 'removed'))}
            actions={current ? <QltnLink highlight={exported} /> : null}
            onClose={() => setPreviewing(false)} />
        )}
      </div>
    </ModalOverlay>
  );
}
