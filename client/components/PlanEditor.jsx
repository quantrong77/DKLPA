import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, FileDown, Loader2, AlertTriangle, Plus, Trash2, ArrowUp, ArrowDown, Wand2, RefreshCw, ClipboardList, ExternalLink, Eye } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Field, Section, TabButton, SourceBadge, inputCls, inputBorder, btnPrimary, btnSecondary, btnGhost } from './ui.jsx';
import { Risks } from './EditorAppendix.jsx';
import LinkedOutage from './LinkedOutage.jsx';
import PlaceSelect from './PlaceSelect.jsx';
import PersonPicker from './PersonPicker.jsx';
import { openDrawingPdf } from './DrawingDialog.jsx';
import { SourceDialog } from './CtSource.jsx';
import DocPreview from './DocPreview.jsx';
import { StatusBadge, SideInput } from './CtEditor.jsx';
import { blockFromLibrary, libraryChanges } from '../lib/ctLibrary.js';
import { fieldErrors } from '../lib/form.js';
import { stationFromCatalog } from '../lib/survey.js';
import { CYCLE_LABELS, testGroupFor, itemsFor, devicesFromSteps, defaultRecipients, defaultWorkload, planFromSurvey, suggestDrawings, baysFromScope } from '../lib/plan.js';

const STEPS = [
  { id: 'general', label: '1. Chung & pháp lý', owns: /^(header|workType|year|equipmentText|bays|station|drawingIds|time|approvalRef|legalBases)/ },
  { id: 'work', label: '2. Thi công & an toàn', owns: /^(workloads|isolationSteps|ctIsolation|liveDisconnectors|risks|reserve)/ },
  { id: 'appendix1', label: '3. Phụ lục I', owns: /^(isolationDevices|testGroups|instruments)/ },
  { id: 'appendix23', label: '4. Phụ lục II, III, ký', owns: /^(ctBlocks|people|teamLeader|recipients)/ }
];
const DUTIES = ['CHTT', 'NVĐVCT', 'LĐCV', 'GSATĐ', 'Người cảnh giới', 'Lái xe'];

const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/** Danh sách dòng chữ (mỗi dòng một đoạn trong Word): thêm, xóa, đổi thứ tự. */
function LinesEditor({ label, lines, onChange, placeholder, rows = 1, actions, hint }) {
  const set = (i, v) => onChange(l => l.map((x, j) => (j === i ? v : x)));
  return (
    <fieldset className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</legend>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {lines.map((line, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          {rows > 1
            ? <textarea aria-label={`${label} ${i + 1}`} rows={rows} className={`${inputCls} ${inputBorder()}`} value={line} placeholder={placeholder} onChange={e => set(i, e.target.value)} />
            : <input aria-label={`${label} ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={line} placeholder={placeholder} onChange={e => set(i, e.target.value)} />}
          <button type="button" className={btnGhost} aria-label="Lên" onClick={() => onChange(l => move(l, i, -1))}><ArrowUp className="w-4 h-4" /></button>
          <button type="button" className={btnGhost} aria-label="Xuống" onClick={() => onChange(l => move(l, i, 1))}><ArrowDown className="w-4 h-4" /></button>
          <button type="button" className={btnGhost} aria-label={`Xóa dòng ${i + 1}`} onClick={() => onChange(l => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" className={btnSecondary} onClick={() => onChange(l => [...l, ''])}><Plus className="w-4 h-4" /> Thêm dòng</button>
    </fieldset>
  );
}

/** Sơ đồ trạm của phương án (theo thứ tự in) và các id đang chọn (chưa chọn: gợi ý theo ngăn lộ). */
export function drawingSelection(form, catalogs) {
  const list = form.station?.substationId ? (catalogs.drawings || []).filter(d => d.substationId === form.station.substationId) : [];
  const auto = !Array.isArray(form.drawingIds);
  return { list, auto, ids: auto ? suggestDrawings(list, `${form.bays || ''} ${form.equipmentText || ''}`) : form.drawingIds };
}

/** Phụ lục IV: chọn một hoặc nhiều sơ đồ của trạm (TBA 500kV: phía 500kV, phía 220kV). */
function DrawingChoice({ form, setField, catalogs }) {
  const { api, notify } = useDkct();
  const { list, auto, ids } = drawingSelection(form, catalogs);
  const toggle = (id) => setField('drawingIds', ids.includes(id) ? ids.filter(x => x !== id) : list.map(d => d.id).filter(x => x === id || ids.includes(x)));
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-bold text-slate-700 dark:text-slate-300">Sơ đồ trạm in ở Phụ lục IV</legend>
      {!form.station?.substationId ? (
        <p className="text-xs text-slate-500">Chọn trạm trong danh mục để chèn bản vẽ sơ đồ.</p>
      ) : !list.length ? (
        <p className="text-xs text-slate-500">Trạm này chưa có bản vẽ (tải PDF ở Danh mục → Trạm biến áp).</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {list.map(d => (
              <span key={d.id} className="inline-flex items-center gap-1.5">
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                  <input type="checkbox" checked={ids.includes(d.id)} onChange={() => toggle(d.id)} /> {d.label}
                </label>
                <button type="button" className={`${btnGhost} !p-1`} aria-label={`Xem PDF ${d.label}`} title={`${d.fileName} · trang ${d.page}`}
                  onClick={() => openDrawingPdf(api, d.id).catch(e => notify(e.message, 'error'))}><ExternalLink className="w-3.5 h-3.5" /></button>
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {auto && list.length > 1 ? 'Đang tự chọn theo ngăn lộ (5xx → phía 500kV, 2xx → phía 220kV; MBA AT → cả hai). Tick để chọn lại. ' : ''}
            {ids.length ? `Mỗi sơ đồ in một trang${list.length > 1 ? ', có tên sơ đồ phía trên' : ''}.` : 'Không chèn sơ đồ nào.'}
          </p>
        </>
      )}
    </fieldset>
  );
}

function GeneralStep({ form, setField, errors, catalogs, departments, outage }) {
  const substations = catalogs.substations || [];
  const units = catalogs.stations || [];
  const choice = form.station?.substationId || (form.station?.manual || form.station?.name ? '__manual' : '');
  const setHeader = (patch) => setField('header', h => ({ ...h, ...patch }));
  const teamOptions = departments.length ? [...new Set([...departments.map(d => d.name), form.header.teamName].filter(Boolean))] : [];
  const chooseStation = (value) => {
    setField('drawingIds', null); // trạm khác: gợi ý lại sơ đồ Phụ lục IV
    if (!value || value === '__manual') {
      setField('station', s => ({ substationId: null, name: value && !s?.substationId ? s?.name || '' : '', qlvhUnitId: null, qlvhUnitName: '', qlvhShort: '', manual: value === '__manual' }));
      return;
    }
    const picked = stationFromCatalog(value, substations, units);
    const unit = units.find(u => u.id === picked?.station.qlvhUnitId);
    if (picked) setField('station', { ...picked.station, qlvhShort: unit?.shortName || '' });
    if (picked?.transmissionName) setHeader({ transmissionName: picked.transmissionName }); // Truyền tải điện khu vực theo trạm
  };

  return (
    <>
      <Section title="Đầu văn bản">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Công ty" htmlFor="pa-company"><input id="pa-company" className={`${inputCls} ${inputBorder()}`} value={form.header.companyName || ''} onChange={e => setHeader({ companyName: e.target.value })} /></Field>
          <Field label="Đội" htmlFor="pa-unit"><input id="pa-unit" className={`${inputCls} ${inputBorder()}`} value={form.header.unitName || ''} onChange={e => setHeader({ unitName: e.target.value })} /></Field>
          <Field label="Tổ lập phương án" htmlFor="pa-team">
            {teamOptions.length ? (
              <select id="pa-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''}
                onChange={e => setHeader({ teamName: e.target.value, teamShort: departments.find(d => d.name === e.target.value)?.shortName || form.header.teamShort })}>
                <option value="">— Chọn tổ —</option>
                {teamOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : <input id="pa-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''} onChange={e => setHeader({ teamName: e.target.value })} />}
          </Field>
          <Field label="Truyền tải điện (khu vực)" htmlFor="pa-tt" hint="Tự điền theo trạm (Danh mục → Trạm biến áp)."><input id="pa-tt" className={`${inputCls} ${inputBorder()}`} value={form.header.transmissionName || ''} placeholder="Truyền tải điện Lâm Đồng" onChange={e => setHeader({ transmissionName: e.target.value })} /></Field>
          <Field label="Địa danh" htmlFor="pa-place"><PlaceSelect id="pa-place" value={form.header.place || ''} onChange={place => setHeader({ place })} /></Field>
          <Field label="Ngày văn bản" htmlFor="pa-date"><input id="pa-date" type="date" className={`${inputCls} ${inputBorder()}`} value={form.header.date || ''} onChange={e => setHeader({ date: e.target.value })} /></Field>
          <Field label="Hậu tố số phương án" htmlFor="pa-suffix" hint={`Số: …/PA-${form.header.teamShort || '…'}.${form.header.numberSuffix || ''}`}>
            <input id="pa-suffix" className={`${inputCls} ${inputBorder()}`} value={form.header.numberSuffix || ''} placeholder="Nhatthu" onChange={e => setHeader({ numberSuffix: e.target.value })} />
          </Field>
        </div>
      </Section>
      <Section title="Công tác">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem] gap-3">
          <Field label="Loại công tác" htmlFor="pa-type" required error={errors.workType}>
            <input id="pa-type" list="pa-types" className={`${inputCls} ${inputBorder(errors.workType)}`} value={form.workType || ''} onChange={e => setField('workType', e.target.value)} />
            <datalist id="pa-types"><option value="Thí nghiệm định kỳ" /><option value="Thí nghiệm sau lắp đặt" /><option value="Thí nghiệm sau sửa chữa" /><option value="Kiểm tra, thí nghiệm bất thường" /></datalist>
          </Field>
          <Field label="Năm" htmlFor="pa-year"><input id="pa-year" type="number" className={`${inputCls} ${inputBorder()}`} value={form.year || ''} onChange={e => setField('year', e.target.value)} /></Field>
        </div>
        <Field label="Thiết bị công tác (in ở dòng Công tác, mục A)" htmlFor="pa-equip" required error={errors.equipmentText}>
          <input id="pa-equip" className={`${inputCls} ${inputBorder(errors.equipmentText)}`} value={form.equipmentText || ''} placeholder="các thiết bị nhất thứ ngăn 530, 532, MBA AT2, 232, 255, 342" onChange={e => setField('equipmentText', e.target.value)} />
        </Field>
        <Field label={<>Ngăn lộ cắt điện cô lập{' '}
          {outage?.scope && <SourceBadge source={form.bays === baysFromScope(outage.scope) ? 'outage' : 'manual'}
            onReset={form.bays !== baysFromScope(outage.scope) ? () => setField('bays', baysFromScope(outage.scope)) : null} />}</>}
          htmlFor="pa-bays" required error={errors.bays} hint="Dùng ở mục D, E.3, E.4 và Phụ lục I.">
          <input id="pa-bays" className={`${inputCls} ${inputBorder(errors.bays)}`} value={form.bays || ''} placeholder="530, 532, MBA AT2, 232, 255, 342" onChange={e => setField('bays', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Trạm biến áp" htmlFor="pa-station" required error={errors.station}
            hint={form.station?.qlvhUnitName ? `Đơn vị QLVH: ${form.station.qlvhUnitName}${form.station.qlvhShort ? ` (${form.station.qlvhShort})` : ''}` : undefined}>
            <select id="pa-station" className={`${inputCls} ${inputBorder(errors.station)}`} value={choice} onChange={e => chooseStation(e.target.value)}>
              <option value="">— Chọn trạm —</option>
              {substations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__manual">Tự ghi…</option>
            </select>
            {choice === '__manual' && (
              <input aria-label="Tên trạm (tự ghi)" className={`${inputCls} ${inputBorder(errors.station)} mt-2`} value={form.station?.name || ''}
                placeholder="Trạm biến áp 500kV …" onChange={e => setField('station', s => ({ ...s, substationId: null, manual: true, name: e.target.value }))} />
            )}
          </Field>
          <Field label="Bắt đầu" htmlFor="pa-start"><input id="pa-start" type="datetime-local" className={`${inputCls} ${inputBorder()}`} value={form.time?.start || ''} onChange={e => setField('time', t => ({ ...t, start: e.target.value }))} /></Field>
          <Field label="Kết thúc" htmlFor="pa-end"><input id="pa-end" type="datetime-local" className={`${inputCls} ${inputBorder()}`} value={form.time?.end || ''} onChange={e => setField('time', t => ({ ...t, end: e.target.value }))} /></Field>
        </div>
        <DrawingChoice form={form} setField={setField} catalogs={catalogs} />
      </Section>
      <Section title="B. Cơ sở pháp lý · C. Đặc điểm công trình">
        <LinesEditor label="Các căn cứ" lines={form.legalBases} rows={2} onChange={fn => setField('legalBases', fn)} />
        <Field label="Kế hoạch đã phê duyệt (mã tham chiếu ở mục C)" htmlFor="pa-approval" hint='Vd "[4187]" — để trống nếu không có.'>
          <input id="pa-approval" className={`${inputCls} ${inputBorder()} !w-40`} value={form.approvalRef || ''} onChange={e => setField('approvalRef', e.target.value)} />
        </Field>
      </Section>
    </>
  );
}

function WorkStep({ form, setField, update, catalogs, onPickSurvey, surveys }) {
  return (
    <>
      <Section title="E.2 Khối lượng thi công">
        <LinesEditor label="Khối lượng" lines={form.workloads} rows={2} onChange={fn => setField('workloads', fn)}
          actions={<button type="button" className={btnSecondary} onClick={() => setField('workloads', l => [...l, defaultWorkload(form)])}><Wand2 className="w-4 h-4" /> Theo ngăn lộ</button>} />
      </Section>
      <Section title="E.3 Phương án thực hiện">
        <LinesEditor label="Kiểm tra: trình tự cắt điện cô lập" lines={form.isolationSteps} rows={2} onChange={fn => setField('isolationSteps', fn)}
          placeholder="Cắt điện cô lập ngăn MC 530, 532: mở MC 530, MC 532, mở các DCL …; đóng các DTĐ …" />
        <Field label="Cô lập mạch dòng (để trống nếu không)" htmlFor="pa-ct" hint='In: "Cô lập mạch dòng … (thực hiện theo phụ lục II)."'>
          <input id="pa-ct" className={`${inputCls} ${inputBorder()}`} value={form.ctIsolation || ''} placeholder="TI 532, TI 530, TI 232" onChange={e => setField('ctIsolation', e.target.value)} />
        </Field>
        <Field label="DCL một má còn mang điện (để trống nếu không)" htmlFor="pa-live">
          <input id="pa-live" className={`${inputCls} ${inputBorder()}`} value={form.liveDisconnectors || ''} placeholder="532-2, 530-6, 255-6" onChange={e => setField('liveDisconnectors', e.target.value)} />
        </Field>
      </Section>
      <Section title="E.5 Nhận diện rủi ro — lấy từ biên bản khảo sát hiện trường"
        actions={(
          <div className="flex items-center gap-2">
            <select aria-label="Chọn biên bản khảo sát" className={`${inputCls} ${inputBorder()} !w-72`} value="" onChange={e => e.target.value && onPickSurvey(e.target.value)}>
              <option value="">— Lấy từ BBKSHT… —</option>
              {surveys.map(s => <option key={s.id} value={s.id}>{s.stationName} · {String(s.workContent || '').slice(0, 40)}</option>)}
            </select>
          </div>
        )}>
        {form.surveyId && <p className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"><ClipboardList className="w-4 h-4" /> Đã liên kết biên bản khảo sát; có thể chỉnh lại danh sách bên dưới.</p>}
      </Section>
      <Risks form={form} setForm={update} riskLibrary={catalogs.risks} customFirst newPerformer="Đơn vị QLVH" title="Bảng nhận diện rủi ro và biện pháp phòng ngừa" />
      <Section title="Phương án dự phòng">
        <input aria-label="Phương án dự phòng" className={`${inputCls} ${inputBorder()}`} value={form.reserve || ''} onChange={e => setField('reserve', e.target.value)} />
      </Section>
    </>
  );
}

function TestGroups({ form, setField, devices }) {
  const [deviceKey, setDeviceKey] = useState('');
  const [cycle, setCycle] = useState('y3');
  const [label, setLabel] = useState('');
  const device = devices.find(d => d.key === deviceKey);
  const setGroup = (i, fn) => setField('testGroups', l => l.map((g, j) => (j === i ? fn(g) : g)));
  const add = () => {
    if (!device) return;
    setField('testGroups', l => [...l, testGroupFor(device, cycle, label.trim())]);
    setLabel('');
  };

  return (
    <Section title="II. Bảng 1 — Hạng mục thí nghiệm (theo QĐ 1901/QĐ-EVNNPT)"
      subtitle="Chọn loại thiết bị và chu kỳ: hạng mục tự lập theo bảng khối lượng của QĐ 1901; bỏ tick hạng mục không làm hoặc thêm hạng mục riêng.">
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_10rem_1fr_auto] gap-2 items-end">
        <Field label="Loại thiết bị" htmlFor="pa-dev">
          <select id="pa-dev" className={`${inputCls} ${inputBorder()}`} value={deviceKey} onChange={e => setDeviceKey(e.target.value)}>
            <option value="">— Chọn —</option>
            {devices.map(d => <option key={d.key} value={d.key}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Chu kỳ" htmlFor="pa-cycle">
          <select id="pa-cycle" className={`${inputCls} ${inputBorder()}`} value={cycle} onChange={e => setCycle(e.target.value)}>
            {Object.entries(CYCLE_LABELS).filter(([k]) => !device || device.cycles.includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Tên nhóm in trong bảng (tùy chọn)" htmlFor="pa-glabel">
          <input id="pa-glabel" className={`${inputCls} ${inputBorder()}`} value={label} placeholder={device?.name || 'vd MÁY CẮT 530, 532'} onChange={e => setLabel(e.target.value)} />
        </Field>
        <button type="button" className={btnPrimary} onClick={add} disabled={!device}><Plus className="w-4 h-4" /> Thêm nhóm</button>
      </div>
      {device && <p className="text-xs text-slate-500">Căn cứ: {device.source}</p>}

      {form.testGroups.map((g, i) => {
        const dev = devices.find(d => d.key === g.deviceKey);
        const checked = g.items.filter(it => it.checked !== false).length;
        return (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={`Tên nhóm ${i + 1}`} className={`${inputCls} ${inputBorder()} font-bold flex-1 min-w-[12rem]`} value={g.label}
                onChange={e => setGroup(i, x => ({ ...x, label: e.target.value }))} />
              <span className="text-xs text-slate-500">{CYCLE_LABELS[g.cycle] || 'Tự lập'} · {checked}/{g.items.length} hạng mục</span>
              {dev && g.cycle && (
                <button type="button" className={btnGhost} title="Lập lại theo QĐ 1901 (bỏ các thay đổi của nhóm này)" aria-label={`Lập lại nhóm ${i + 1}`}
                  onClick={() => setGroup(i, x => ({ ...x, items: itemsFor(dev, x.cycle) }))}><RefreshCw className="w-4 h-4" /></button>
              )}
              <button type="button" className={btnGhost} aria-label={`Lên nhóm ${i + 1}`} onClick={() => setField('testGroups', l => move(l, i, -1))}><ArrowUp className="w-4 h-4" /></button>
              <button type="button" className={btnGhost} aria-label={`Xóa nhóm ${i + 1}`} onClick={() => setField('testGroups', l => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
            </div>
            <ul className="space-y-1">
              {g.items.map((it, k) => (
                <li key={k} className={`flex items-start gap-2 text-sm ${it.level ? 'pl-6' : ''}`}>
                  <input type="checkbox" aria-label={it.name} className="mt-1 accent-chatlan-600" checked={it.checked !== false}
                    onChange={() => setGroup(i, x => ({ ...x, items: x.items.map((y, m) => (m === k ? { ...y, checked: y.checked === false } : y)) }))} />
                  {dev && g.cycle ? (
                    <span className={it.checked === false ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}>
                      {it.name}{it.note && <span className="block text-xs text-slate-500">{it.note}</span>}
                    </span>
                  ) : (
                    <input aria-label={`Hạng mục ${k + 1}`} className={`${inputCls} ${inputBorder()}`} value={it.name}
                      onChange={e => setGroup(i, x => ({ ...x, items: x.items.map((y, m) => (m === k ? { ...y, name: e.target.value } : y)) }))} />
                  )}
                </li>
              ))}
            </ul>
            <button type="button" className={btnSecondary}
              onClick={() => setGroup(i, x => ({ ...x, deviceKey: x.deviceKey, items: [...x.items, { name: 'Hạng mục khác', note: '', level: 0, checked: true }] }))}>
              <Plus className="w-4 h-4" /> Thêm hạng mục riêng
            </button>
          </div>
        );
      })}
    </Section>
  );
}

function Instruments({ form, setField }) {
  const set = (i, patch) => setField('instruments', l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Section title="Bảng 2 — Danh mục thiết bị thí nghiệm" subtitle="Nhóm (vd Nhất thứ, Thiết bị nâng) in thành dòng I, II…">
      {form.instruments.map((x, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] sm:grid-cols-[8rem_1fr_4rem_4rem_1fr_auto] gap-1.5 items-center">
          <input aria-label={`Nhóm thiết bị ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={x.group} placeholder="Nhóm" onChange={e => set(i, { group: e.target.value })} />
          <button type="button" className={`${btnGhost} sm:order-last`} aria-label={`Xóa thiết bị ${i + 1}`} onClick={() => setField('instruments', l => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
          <input aria-label={`Tên thiết bị ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={x.name} placeholder="Tên thiết bị" onChange={e => set(i, { name: e.target.value })} />
          <input aria-label={`ĐVT ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={x.unit} placeholder="ĐVT" onChange={e => set(i, { unit: e.target.value })} />
          <input aria-label={`Số lượng ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={x.qty} placeholder="SL" onChange={e => set(i, { qty: e.target.value })} />
          <input aria-label={`Ghi chú thiết bị ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={x.note} placeholder="Ghi chú" onChange={e => set(i, { note: e.target.value })} />
        </div>
      ))}
      <button type="button" className={btnSecondary} onClick={() => setField('instruments', l => [...l, { group: l[l.length - 1]?.group || 'Nhất thứ', name: '', unit: 'Máy', qty: '01', note: '' }])}>
        <Plus className="w-4 h-4" /> Thêm thiết bị
      </button>
    </Section>
  );
}

/** Một bảng Phụ lục II lấy từ thư viện mạch dòng: số core in (mặc định 4), xem lại nguồn từng core, đối chiếu thư viện. */
function LibraryCtBlock({ block, index, set, remove }) {
  const { api, notify, confirmAction } = useDkct();
  const [viewing, setViewing] = useState(null);
  const total = block.cores.length;
  const refresh = async () => {
    try {
      const { ct } = await api.get(`/ct-library/${block.ctId}`);
      const changes = libraryChanges(block, ct);
      if (!changes.length) return notify(`${block.name}: khớp với thư viện.`, 'success');
      const list = changes.slice(0, 15).join('\n') + (changes.length > 15 ? `\n… và ${changes.length - 15} thay đổi khác` : '');
      if (await confirmAction({ title: `Cập nhật ${block.name} theo thư viện?`, message: list, confirmLabel: 'Cập nhật' })) set(blockFromLibrary(ct, block.coresShown));
    } catch (err) { notify(err.status === 404 ? 'Biến dòng này không còn trong thư viện.' : err.message, 'error'); }
  };
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{block.name}{block.panel ? ` tại tủ ${block.panel}` : ''}</p>
          <p className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
            <StatusBadge status={block.status} /> phiên bản bản vẽ {block.revision}
            {block.status !== 'VERIFIED' && <span className="text-amber-700 dark:text-amber-400">· in bản nháp</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
            Số core in
            <select aria-label={`Số core in của ${block.name}`} className={`${inputCls} ${inputBorder()} !w-16 !px-1`} value={block.coresShown}
              onChange={e => set({ ...block, coresShown: Number(e.target.value) })}>
              {block.cores.map((_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}
            </select>
            / {total}
          </label>
          <button type="button" className={btnSecondary} disabled={block.coresShown >= total} onClick={() => set({ ...block, coresShown: block.coresShown + 1 })}><Plus className="w-4 h-4" /> Thêm core</button>
          <button type="button" className={btnSecondary} onClick={refresh} title="So với thư viện hiện tại"><RefreshCw className="w-4 h-4" /> Đối chiếu thư viện</button>
          <button type="button" className={btnGhost} aria-label={`Xóa bảng mạch dòng ${index + 1}`} onClick={remove}><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {block.cores.map((c, k) => (
          <button key={k} type="button" disabled={!c.pageId}
            className={`px-2 py-1 rounded-lg border text-xs inline-flex items-center gap-1 ${k < block.coresShown ? 'border-chatlan-200 bg-chatlan-50 text-chatlan-700 dark:bg-chatlan-900/40 dark:border-chatlan-900 dark:text-chatlan-300' : 'border-slate-200 dark:border-slate-700 text-slate-400'} disabled:cursor-default`}
            title={c.pageId ? 'Xem lại mạch dòng của core trên bản vẽ' : 'Core chưa có vùng bản vẽ'} onClick={() => setViewing(c)}>
            {c.pageId && <Eye className="w-3.5 h-3.5" />} Core {c.coreNo ?? '?'} · {c.terminalBlock || '—'}
            {c.points.some(p => !p.terminal || !p.ctTerminal) && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-label="Có ô chưa đủ dữ liệu" />}
          </button>
        ))}
      </div>
      {viewing && (
        <SourceDialog title={`${block.name} — core ${viewing.coreNo ?? ''}`} subtitle={[viewing.terminalBlock, viewing.drawingRef].filter(Boolean).join(' · ')}
          pageId={viewing.pageId} region={viewing.region} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

/** Bảng theo quy ước XAk: tick core có đầu phía TI khác đầu chung của bảng, rồi chọn đầu riêng cho core đó. */
function CoreSides({ block, onChange }) {
  const sides = block.coreSides || {};
  const nos = Array.from({ length: Math.max(1, Number(block.cores) || 1) }, (_, k) => (Number(block.firstCore) || 1) + k);
  const toggle = (no) => {
    const next = { ...sides };
    if (next[no]) delete next[no]; else next[no] = block.side;
    onChange(next);
  };
  return (
    <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
      <span>Core có đầu phía TI khác:</span>
      {nos.map(no => (
        <span key={no} className="inline-flex items-center gap-1">
          <label className="inline-flex items-center gap-1"><input type="checkbox" checked={!!sides[no]} onChange={() => toggle(no)} /> Core {no}</label>
          {sides[no] && <SideInput ariaLabel={`Đầu phía TI core ${no}`} value={sides[no]} onChange={side => onChange({ ...sides, [no]: side })} />}
        </span>
      ))}
    </div>
  );
}

function CtBlocks({ form, setField }) {
  const { api, notify } = useDkct();
  const [library, setLibrary] = useState(null);
  const substationId = form.station?.substationId || '';
  useEffect(() => {
    api.get(`/ct-library${substationId ? `?substationId=${encodeURIComponent(substationId)}` : ''}`)
      .then(r => setLibrary(r.items)).catch(() => setLibrary([]));
  }, [api, substationId]);
  const set = (i, patch) => setField('ctBlocks', l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i) => setField('ctBlocks', l => l.filter((_, j) => j !== i));
  const addFromLibrary = async (id) => {
    try {
      const { ct } = await api.get(`/ct-library/${id}`);
      setField('ctBlocks', l => [...l, blockFromLibrary(ct)]);
      // mục E.3 "Cô lập mạch dòng …": thêm tên TI nếu chưa có trong danh sách
      setField('ctIsolation', v => {
        const names = String(v || '').split(',').map(x => x.trim()).filter(Boolean);
        return names.includes(ct.name) ? v : [...names, ct.name].join(', ');
      });
    } catch (err) { notify(err.message, 'error'); }
  };
  const used = new Set(form.ctBlocks.map(b => b.ctId).filter(Boolean));
  return (
    <Section title="Phụ lục II — Cô lập mạch dòng"
      subtitle='Chọn biến dòng trong thư viện (Danh mục → Mạch dòng TI); mặc định in 4 core. Bấm vào core để xem lại mạch dòng trên bản vẽ. Không có bảng nào: in "Không.".'>
      <select aria-label="Lấy biến dòng từ thư viện" className={`${inputCls} ${inputBorder()} !w-80`} value="" onChange={e => e.target.value && addFromLibrary(e.target.value)}>
        <option value="">{library === null ? 'Đang tải thư viện…' : library.length ? '— Thêm biến dòng từ thư viện —' : `Thư viện chưa có biến dòng${substationId ? ' của trạm này' : ''}`}</option>
        {(library || []).filter(x => !used.has(x.id)).map(x => (
          <option key={x.id} value={x.id}>{x.name}{substationId ? '' : ` — ${x.substationName}`} ({x.coreCount} core{x.status === 'VERIFIED' ? '' : ', cần kiểm tra'})</option>
        ))}
      </select>
      {form.ctBlocks.map((b, i) => (b.ctId ? (
        <LibraryCtBlock key={`lib-${b.ctId}-${i}`} block={b} index={i} set={next => set(i, next)} remove={() => remove(i)} />
      ) : (
        <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.4fr_1fr_4rem_4rem_4rem_7rem_auto] gap-1.5 items-end">
          <Field label="TI / vị trí" htmlFor={`ct-t-${i}`}><input id={`ct-t-${i}`} className={`${inputCls} ${inputBorder()}`} value={b.title} placeholder="TI 532 tại tủ =B02+SV1" onChange={e => set(i, { title: e.target.value })} /></Field>
          <Field label="Tủ" htmlFor={`ct-p-${i}`}><input id={`ct-p-${i}`} className={`${inputCls} ${inputBorder()}`} value={b.panel} placeholder="B02+SV1" onChange={e => set(i, { panel: e.target.value })} /></Field>
          <Field label="Hàng kẹp" htmlFor={`ct-x-${i}`}><input id={`ct-x-${i}`} className={`${inputCls} ${inputBorder()}`} value={b.prefix} onChange={e => set(i, { prefix: e.target.value })} /></Field>
          <Field label="Từ core" htmlFor={`ct-f-${i}`}><input id={`ct-f-${i}`} type="number" min={1} className={`${inputCls} ${inputBorder()}`} value={b.firstCore} onChange={e => set(i, { firstCore: Number(e.target.value) || 1 })} /></Field>
          <Field label="Số core" htmlFor={`ct-n-${i}`}><input id={`ct-n-${i}`} type="number" min={1} max={20} className={`${inputCls} ${inputBorder()}`} value={b.cores} onChange={e => set(i, { cores: Number(e.target.value) || 1 })} /></Field>
          <Field label="Đầu phía TI">
            <SideInput ariaLabel={`Đầu phía TI bảng ${i + 1}`} value={b.side} className="!w-full" onChange={side => set(i, { side })} />
          </Field>
          <button type="button" className={btnGhost} aria-label={`Xóa bảng mạch dòng ${i + 1}`} onClick={() => remove(i)}><Trash2 className="w-4 h-4" /></button>
          <CoreSides block={b} onChange={coreSides => set(i, { coreSides })} />
        </div>
      )))}
      <button type="button" className={btnSecondary} onClick={() => setField('ctBlocks', l => [...l, { title: '', panel: '', prefix: 'XA', firstCore: 1, cores: 4, side: 'S1-S2', coreSides: {} }])}>
        <Plus className="w-4 h-4" /> Bảng theo quy ước XAk (không dùng thư viện)
      </button>
    </Section>
  );
}

function People({ form, setField, personnel }) {
  const set = (i, patch) => setField('people', l => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Section title="Phụ lục III — Danh sách lực lượng thi công" subtitle="Chọn trong danh mục nhân sự: bậc an toàn tự theo.">
      {form.people.map((p, i) => (
        <div key={i} className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1.5fr_1fr_auto] gap-2 items-start">
          <span className="pt-1.5 text-xs font-semibold text-slate-500">{i + 1}</span>
          <PersonPicker value={p.person} personnel={personnel} ariaLabel={`Người thi công ${i + 1}`}
            onChange={(v) => (v ? set(i, { person: v }) : setField('people', l => l.filter((_, j) => j !== i)))} />
          <input aria-label={`Nhiệm vụ ${i + 1}`} list="pa-duties" className={`${inputCls} ${inputBorder()} col-start-2 sm:col-start-auto`} value={p.duty} placeholder="Nhiệm vụ" onChange={e => set(i, { duty: e.target.value })} />
          <button type="button" className={`${btnGhost} row-start-1 col-start-3 sm:row-start-auto sm:col-start-auto`} aria-label={`Xóa người ${i + 1}`} onClick={() => setField('people', l => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <datalist id="pa-duties">{DUTIES.map(d => <option key={d} value={d} />)}</datalist>
      <button type="button" className={btnSecondary} onClick={() => setField('people', l => [...l, { person: { personnelId: null, name: '', safetyLevel: '', safetyCard: '' }, duty: 'NVĐVCT' }])}>
        <Plus className="w-4 h-4" /> Thêm người
      </button>
    </Section>
  );
}

/**
 * Lập mới / sửa / xem Phương án thi công, biện pháp an toàn.
 * plan: null khi lập mới; { id, docNumber, canEdit } khi mở phương án đã lưu.
 */
export default function PlanEditor({ initial, plan, catalogs, departments = [], numberPreview, onClose, onSaved }) {
  const { api, notify, confirmAction, downloadAuthenticatedFile, ModalOverlay } = useDkct();
  const [form, setForm] = useState(initial);
  const [current, setCurrent] = useState(plan);
  const [step, setStep] = useState('general');
  const [errorList, setErrorList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [devices, setDevices] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [outage, setOutage] = useState(null);
  const readOnly = !!current && !current.canEdit;
  const errors = useMemo(() => fieldErrors(errorList), [errorList]);
  const update = (fn) => { setDirty(true); setForm(fn); };
  const setField = (key, value) => update(f => ({ ...f, [key]: typeof value === 'function' ? value(f[key]) : value }));

  useEffect(() => {
    api.get('/tests1901').then(r => setDevices(r.devices)).catch(err => notify(err.message, 'error'));
    api.get('/surveys').then(r => setSurveys(r.items)).catch(() => {});
  }, [api, notify]);

  // nơi nhận mặc định khi mở bước ký duyệt (đã có trạm, khu vực truyền tải, tổ)
  useEffect(() => {
    if (step === 'appendix23' && !readOnly && !form.recipients.length) setField('recipients', defaultRecipients(form));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSurvey = async (id) => {
    try {
      const { survey } = await api.get(`/surveys/${id}`);
      if (form.risks.length && !(await confirmAction({ title: 'Thay bảng nhận diện rủi ro?', message: 'Danh sách hiện có sẽ được thay bằng mục 8 của biên bản khảo sát.' }))) return;
      update(f => {
        const next = planFromSurvey(f, survey);
        const tt = (catalogs.substations || []).find(s => s.id === next.station?.substationId)?.transmissionName;
        return tt ? { ...next, header: { ...next.header, transmissionName: tt } } : next;
      });
      notify('Đã lấy rủi ro và trạm từ biên bản khảo sát.', 'success');
    } catch (err) { notify(err.message, 'error'); }
  };

  const close = async () => {
    if (dirty && !readOnly && !(await confirmAction({ title: 'Đóng phương án chưa lưu?', message: 'Các thay đổi chưa lưu sẽ bị hủy.', confirmLabel: 'Đóng, không lưu' }))) return;
    onClose();
  };

  async function download(target = current) {
    try {
      await downloadAuthenticatedFile(`/api/dkct/plans/${target.id}/docx`, `PhuongAn_${String(target.docNumber).replace(/\//g, '-')}.docx`);
    } catch (err) { notify(err.message, 'error'); }
  }

  // dữ liệu gửi máy chủ (lưu / xem trước): lưu đúng các sơ đồ đang thấy được chọn (kể cả khi đang tự gợi ý)
  const payload = () => {
    const { station, ...rest } = form;
    const { manual, ...cleanStation } = station || {};
    return { ...rest, station: cleanStation, drawingIds: drawingSelection(form, catalogs).ids };
  };

  async function save({ andDownload = false } = {}) {
    setSaving(true);
    try {
      const body = payload();
      const res = current ? await api.put(`/plans/${current.id}`, body) : await api.post('/plans', body);
      setCurrent(res.plan);
      setErrorList([]);
      setDirty(false);
      notify(`Đã lưu phương án số ${res.plan.docNumber}.`, 'success');
      if (andDownload) await download(res.plan);
      onSaved(res.plan);
    } catch (err) {
      if (err.status === 422) {
        setErrorList(err.errors);
        const owner = STEPS.find(s => s.owns.test(err.errors[0]?.field || ''));
        if (owner) setStep(owner.id);
      }
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const stepErrors = (s) => errorList.filter(e => s.owns.test(e.field)).length;
  const shared = { form, setField, update, errors, catalogs, departments, outage };
  // gắn dòng lịch: điền ngăn lộ từ phạm vi cắt điện nếu đang trống hoặc vẫn theo lịch cũ
  const linkOutage = (id, o) => update(f => ({
    ...f, outageId: id,
    bays: o?.scope && (!String(f.bays || '').trim() || (outage && f.bays === baysFromScope(outage.scope))) ? baysFromScope(o.scope) : f.bays
  }));

  return (
    <ModalOverlay onClose={close} className="fixed inset-0 z-50 bg-slate-900/40 flex items-stretch md:items-center justify-center md:p-4">
      <div className="bg-slate-50 dark:bg-slate-950 w-full md:max-w-5xl md:rounded-2xl shadow-xl flex flex-col max-h-full md:max-h-[92vh]">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
              {current ? `${readOnly ? 'Phương án' : 'Hiệu chỉnh phương án'} số ${current.docNumber}` : 'Lập phương án thi công, biện pháp an toàn'}
            </h2>
            <p className="text-xs text-slate-500">{current ? 'Số phương án giữ nguyên khi hiệu chỉnh.' : `Số dự kiến: ${numberPreview || '…'} — cấp khi lưu`}{readOnly ? ' · Chỉ xem.' : ''}</p>
          </div>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={close}><X className="w-5 h-5" /></button>
        </header>
        <nav className="flex gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900" aria-label="Các phần của phương án">
          {STEPS.map(s => (
            <TabButton key={s.id} active={step === s.id} onClick={() => setStep(s.id)}>
              {s.label}{stepErrors(s) > 0 && <span className="ml-1 text-red-600">({stepErrors(s)} lỗi)</span>}
            </TabButton>
          ))}
        </nav>
        {/* ngoài vùng cuộn: luôn thấy khi cuộn nội dung bên dưới */}
        <LinkedOutage outageId={form.outageId} onChange={linkOutage} onOutage={setOutage} readOnly={readOnly} />
        <div className="flex-1 overflow-y-auto p-4">
          {errorList.length > 0 && (
            <div className="mb-3 flex gap-2 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 text-sm text-red-700 dark:text-red-300" role="alert">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <ul className="list-disc pl-4 space-y-0.5">{errorList.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </div>
          )}
          <fieldset disabled={readOnly} className="space-y-4 min-w-0">
            {step === 'general' && <GeneralStep {...shared} />}
            {step === 'work' && <WorkStep {...shared} onPickSurvey={pickSurvey} surveys={surveys} />}
            {step === 'appendix1' && (
              <>
                <Section title="Phụ lục I.1 — Trạng thái cô lập (thiết bị)">
                  <LinesEditor label="Thiết bị" lines={form.isolationDevices} onChange={fn => setField('isolationDevices', fn)} placeholder="MC530"
                    actions={(
                      <button type="button" className={btnSecondary} onClick={() => setField('isolationDevices', l => [...new Set([...l, ...devicesFromSteps(form.isolationSteps)])])}>
                        <Wand2 className="w-4 h-4" /> Lấy từ trình tự cô lập
                      </button>
                    )} />
                </Section>
                <TestGroups form={form} setField={setField} devices={devices} />
                <Instruments form={form} setField={setField} />
              </>
            )}
            {step === 'appendix23' && (
              <>
                <CtBlocks form={form} setField={setField} />
                <People form={form} setField={setField} personnel={catalogs.personnel} />
                <Section title="Ký duyệt · Nơi nhận">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Người lập" htmlFor="pa-prep" hint="Theo người lập phương án."><input id="pa-prep" className={`${inputCls} ${inputBorder()}`} value={form.preparedBy || ''} disabled /></Field>
                    <Field label="Tổ trưởng / Tổ phó ký" htmlFor="pa-lead">
                      <input id="pa-lead" list="pa-people" className={`${inputCls} ${inputBorder()}`} value={form.teamLeader || ''} onChange={e => setField('teamLeader', e.target.value)} />
                      <datalist id="pa-people">{(catalogs.personnel || []).map(p => <option key={p.id} value={p.fullName} />)}</datalist>
                    </Field>
                  </div>
                  <LinesEditor label="Nơi nhận" lines={form.recipients} onChange={fn => setField('recipients', fn)}
                    actions={<button type="button" className={btnSecondary} onClick={() => setField('recipients', defaultRecipients(form))}><Wand2 className="w-4 h-4" /> Mặc định</button>} />
                </Section>
                <Section title="Phụ lục IV — Bản vẽ sơ đồ nhất thứ">
                  <DrawingChoice form={form} setField={setField} catalogs={catalogs} />
                </Section>
              </>
            )}
          </fieldset>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:rounded-b-2xl">
          <button type="button" className={`${btnSecondary} mr-auto`} onClick={() => setPreviewing(true)} disabled={saving} title="Xem bản Word trước khi lưu/tải">
            <Eye className="w-4 h-4" /> Xem trước
          </button>
          {current && (
            <button type="button" className={btnSecondary} onClick={() => download()} disabled={saving || dirty} title={dirty ? 'Lưu thay đổi trước khi tải' : undefined}>
              <FileDown className="w-4 h-4" /> Tải Word
            </button>
          )}
          {!readOnly && (
            <>
              <button type="button" className={btnSecondary} onClick={() => save({ andDownload: true })} disabled={saving}><FileDown className="w-4 h-4" /> Lưu & tải Word</button>
              <button type="button" className={btnPrimary} onClick={() => save()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {current ? 'Lưu thay đổi' : 'Lưu & cấp số'}
              </button>
            </>
          )}
        </footer>
        {previewing && (
          <DocPreview
            title={current ? `Phương án ${current.docNumber}` : 'Phương án (chưa lưu)'}
            note={(readOnly || (current && !dirty)) ? 'Bản đã lưu' : `Bản dựng từ dữ liệu đang soạn — chưa lưu${current ? '' : ', số chỉ là dự kiến'}`}
            load={() => ((readOnly || (current && !dirty))
              ? api.blob(`/plans/${current.id}/docx`)
              : api.previewDocx(current ? `/plans/${current.id}/preview` : `/plans/preview?docNumber=${encodeURIComponent(numberPreview || '')}`, payload()))}
            onDownload={(readOnly || (current && !dirty)) ? () => download() : () => { setPreviewing(false); save({ andDownload: true }); }}
            downloadLabel={(readOnly || (current && !dirty)) ? 'Tải Word' : 'Lưu & tải Word'}
            pdf={(readOnly || (current && !dirty))}
            onClose={() => setPreviewing(false)} />
        )}
      </div>
    </ModalOverlay>
  );
}
