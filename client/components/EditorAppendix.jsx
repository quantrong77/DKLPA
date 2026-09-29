import React from 'react';
import { Plus, Trash2, Wand2, ArrowUp, ArrowDown } from 'lucide-react';
import PersonPicker from './PersonPicker.jsx';
import { Field, Section, inputCls, inputBorder, btnSecondary, btnGhost } from './ui.jsx';
import { fillDuty, formatCard, nomineesFromUnits, personKey, registeredPeople, unitLabel } from '../lib/form.js';

const move = (list, i, d) => {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

function Nominees({ form, setForm, personnel, duties, errors }) {
  const rows = form.nominees;
  // cập nhật dựa trên state mới nhất (không dùng bản `rows` lúc render)
  const setRows = (next) => setForm(f => ({ ...f, nominees: typeof next === 'function' ? next(f.nominees) : next }));
  const setRow = (i, patch) => setRows(list => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const dutyOptions = [];
  duties.forEach(d => {
    const total = form.workUnits.length;
    if (d.name.includes('{n}')) form.workUnits.forEach((_, i) => dutyOptions.push(fillDuty(d.name, i + 1, total)));
    else dutyOptions.push(d.name);
  });

  return (
    <Section title="Phụ lục 11.a — Danh sách người được cử" subtitle="Chọn người: số thẻ ATĐ tự theo; nhiệm vụ chọn từ danh mục hoặc tự ghi."
      actions={(
        <button type="button" className={btnSecondary} onClick={() => setRows(nomineesFromUnits(form.workUnits, rows))}
          title="Lập lại danh sách theo CHTT và nhân viên các ĐVCT; giữ người thêm tay (vd lái xe)">
          <Wand2 className="w-4 h-4" /> Lập từ các ĐVCT
        </button>
      )}>
      {rows.length === 0 && <p className="text-xs text-slate-500">Chưa có ai. Bấm "Lập từ các ĐVCT" hoặc thêm từng người.</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[2rem_1fr_auto] sm:grid-cols-[2rem_1.2fr_6rem_1.4fr_auto] gap-2 items-start">
          <span className="pt-1.5 text-xs font-semibold text-slate-500">{i + 1}</span>
          <div>
            <PersonPicker value={r.person} personnel={personnel} showLevel={false} ariaLabel={`Người được cử ${i + 1}`}
              invalid={!!errors[`nominees.${i}`]} onChange={(p) => (p ? setRow(i, { person: p }) : setRows(list => list.filter((_, j) => j !== i)))} />
          </div>
          <span className="hidden sm:block py-1.5 text-center text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            title="Thẻ ATĐ">{formatCard(r.person) || '—'}</span>
          <div className="col-span-2 sm:col-span-1 col-start-2 sm:col-start-auto">
            <input list="dkct-duties" aria-label={`Nhiệm vụ ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={r.duty}
              placeholder="Nhiệm vụ" onChange={e => setRow(i, { duty: e.target.value })} />
          </div>
          <div className="flex row-start-1 col-start-3 sm:row-start-auto sm:col-start-auto">
            <button type="button" className={btnGhost} aria-label="Lên" onClick={() => setRows(list => move(list, i, -1))}><ArrowUp className="w-4 h-4" /></button>
            <button type="button" className={btnGhost} aria-label="Xuống" onClick={() => setRows(list => move(list, i, 1))}><ArrowDown className="w-4 h-4" /></button>
            <button type="button" className={btnGhost} aria-label={`Xóa dòng ${i + 1}`} onClick={() => setRows(list => list.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}
      <datalist id="dkct-duties">{dutyOptions.map(d => <option key={d} value={d} />)}</datalist>
      <button type="button" className={btnSecondary} onClick={() => setRows(list => [...list, { person: { personnelId: null, name: '', safetyLevel: '', safetyCard: '' }, duty: '' }])}>
        <Plus className="w-4 h-4" /> Thêm người
      </button>
    </Section>
  );
}

function Permits({ form, setForm, errors }) {
  const rows = form.permits;
  const people = registeredPeople(form);
  const setRows = (next) => setForm(f => ({ ...f, permits: typeof next === 'function' ? next(f.permits) : next }));
  const setRow = (i, patch) => setRows(list => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggleWorker = (i, p) => {
    const has = rows[i].workers.some(w => personKey(w) === personKey(p));
    setRow(i, { workers: has ? rows[i].workers.filter(w => personKey(w) !== personKey(p)) : [...rows[i].workers, p] });
  };
  const unitMembers = (seq) => (form.workUnits[seq - 1]?.members || []);

  return (
    <Section title="Phụ lục 11.b — Cấp phiếu theo điều kiện cắt điện và nội dung công tác"
      subtitle="Mỗi dòng một phiếu: chọn ĐVCT (CHTT tự theo) và nhân viên trong danh sách đã đăng ký.">
      {rows.map((r, i) => {
        const cmd = r.workUnitSeq ? form.workUnits[r.workUnitSeq - 1]?.commander : null;
        return (
          <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Phiếu {String(i + 1).padStart(2, '0')}</h4>
              <button type="button" className={btnGhost} aria-label={`Xóa phiếu ${i + 1}`} onClick={() => setRows(list => list.filter((_, j) => j !== i))}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="Thiết bị cần cô lập" htmlFor={`pm-iso-${i}`}
                hint={<button type="button" className="underline" onClick={() => setRow(i, { isolation: form.condition.text })}>Lấy theo mục 3</button>}>
                <textarea id={`pm-iso-${i}`} rows={2} className={`${inputCls} ${inputBorder()}`} value={r.isolation}
                  onChange={e => setRow(i, { isolation: e.target.value })} />
              </Field>
              <Field label="Nội dung công tác" htmlFor={`pm-content-${i}`}
                hint={<button type="button" className="underline" onClick={() => setRow(i, { content: form.workContent.text })}>Lấy theo mục 1</button>}>
                <textarea id={`pm-content-${i}`} rows={2} className={`${inputCls} ${inputBorder()}`} value={r.content}
                  onChange={e => setRow(i, { content: e.target.value })} />
              </Field>
              <Field label="ĐVCT / Chỉ huy trực tiếp" htmlFor={`pm-unit-${i}`} error={errors[`permits.${i}.workUnitSeq`]}>
                <select id={`pm-unit-${i}`} className={`${inputCls} ${inputBorder(errors[`permits.${i}.workUnitSeq`])}`} value={r.workUnitSeq || ''}
                  onChange={e => {
                    const seq = Number(e.target.value) || null;
                    setRow(i, { workUnitSeq: seq, workers: r.workers.length ? r.workers : (seq ? unitMembers(seq) : []) });
                  }}>
                  <option value="">— Chọn ĐVCT —</option>
                  {form.workUnits.map((u, j) => (
                    <option key={j} value={j + 1}>{unitLabel(j, form.workUnits.length)} — {u.commander?.name || '(chưa có CHTT)'}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ghi chú" htmlFor={`pm-note-${i}`}>
                <input id={`pm-note-${i}`} className={`${inputCls} ${inputBorder()}`} value={r.note || ''} onChange={e => setRow(i, { note: e.target.value })} />
              </Field>
            </div>
            <fieldset>
              <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nhân viên đơn vị công tác ({r.workers.length})
                {r.workUnitSeq && (
                  <button type="button" className="ml-2 font-normal underline" onClick={() => setRow(i, { workers: unitMembers(r.workUnitSeq) })}>
                    theo {unitLabel(r.workUnitSeq - 1, form.workUnits.length)}
                  </button>
                )}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {people.filter(p => !cmd || personKey(p) !== personKey(cmd)).map(p => {
                  const on = r.workers.some(w => personKey(w) === personKey(p));
                  return (
                    <label key={personKey(p)} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs cursor-pointer ${
                      on ? 'bg-chatlan-50 border-chatlan-200 text-chatlan-700 dark:bg-chatlan-900/50 dark:border-chatlan-800 dark:text-chatlan-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      <input type="checkbox" className="accent-chatlan-600" checked={on} onChange={() => toggleWorker(i, p)} />
                      {p.name}
                    </label>
                  );
                })}
                {people.length === 0 && <span className="text-xs text-slate-500">Khai ĐVCT hoặc danh sách người được cử trước.</span>}
              </div>
              {errors[`permits.${i}.workers`] && <p className="mt-1 text-xs text-red-600">{errors[`permits.${i}.workers`]}</p>}
            </fieldset>
          </div>
        );
      })}
      <button type="button" className={btnSecondary}
        onClick={() => setRows(list => [...list, { isolation: form.condition.text, workUnitSeq: null, content: '', workers: [], note: '' }])}>
        <Plus className="w-4 h-4" /> Thêm phiếu
      </button>
    </Section>
  );
}

/**
 * Đánh giá rủi ro: tick chọn từ thư viện + mục riêng của giấy/biên bản.
 * customFirst: mục riêng đứng trước các mục thư viện (BBKSHT: "Chuẩn bị biện pháp kỹ thuật…" ở đầu bảng).
 */
export function Risks({ form, setForm, riskLibrary, title = 'Mục 13 — Đánh giá rủi ro', customFirst = false, newPerformer = 'Đơn vị công tác.' }) {
  const rows = form.risks;
  const setRows = (risks) => setForm(f => ({ ...f, risks }));
  const selected = new Set(rows.map(r => r.hazard));
  const isLibrary = (r) => riskLibrary.some(l => l.hazard === r.hazard);
  const toggle = (lib) => (selected.has(lib.hazard)
    ? setRows(rows.filter(r => r.hazard !== lib.hazard))
    : setRows([...rows, { hazard: lib.hazard, measures: lib.measures, performer: lib.performer }]));
  const custom = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isLibrary(r));
  const addCustom = () => {
    const blank = { hazard: '', measures: '', performer: newPerformer };
    const at = customFirst ? rows.findIndex(isLibrary) : -1;
    setRows(at < 0 ? [...rows, blank] : [...rows.slice(0, at), blank, ...rows.slice(at)]);
  };

  return (
    <Section title={title} subtitle={`Đã chọn ${rows.length} mục. Tick chọn từ thư viện; thêm mục riêng nếu cần.`}
      actions={(
        <>
          <button type="button" className={btnSecondary} onClick={() => setRows(riskLibrary.map(l => ({ hazard: l.hazard, measures: l.measures, performer: l.performer })))}>Chọn tất cả</button>
          <button type="button" className={btnSecondary} onClick={() => setRows([])}>Bỏ chọn</button>
        </>
      )}>
      <ul className="space-y-1.5">
        {riskLibrary.map(l => (
          <li key={l.id}>
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="checkbox" className="mt-1 accent-chatlan-600" checked={selected.has(l.hazard)} onChange={() => toggle(l)} />
              <span>{l.hazard}<span className="block text-xs text-slate-500 dark:text-slate-400">{l.performer}</span></span>
            </label>
          </li>
        ))}
      </ul>
      {custom.map(({ r, i }) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_1fr_auto] gap-2 items-start border-t border-slate-100 dark:border-slate-800 pt-2">
          <textarea aria-label="Mối nguy" rows={2} className={`${inputCls} ${inputBorder()}`} value={r.hazard}
            onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, hazard: e.target.value } : x)))} placeholder="Công việc, vị trí, mối nguy" />
          <textarea aria-label="Biện pháp an toàn" rows={2} className={`${inputCls} ${inputBorder()}`} value={r.measures}
            onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, measures: e.target.value } : x)))} placeholder="Biện pháp an toàn" />
          <textarea aria-label="Đơn vị thực hiện" rows={2} className={`${inputCls} ${inputBorder()}`} value={r.performer}
            onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, performer: e.target.value } : x)))} placeholder="Đơn vị thực hiện" />
          <button type="button" className={btnGhost} aria-label="Xóa mục rủi ro" onClick={() => setRows(list => list.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" className={btnSecondary} onClick={addCustom}>
        <Plus className="w-4 h-4" /> Thêm rủi ro riêng
      </button>
    </Section>
  );
}

export default function EditorAppendix(props) {
  return (
    <>
      <Nominees {...props} />
      <Permits {...props} />
      <Risks {...props} />
    </>
  );
}
