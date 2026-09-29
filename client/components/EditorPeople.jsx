import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import PersonPicker from './PersonPicker.jsx';
import PeoplePicker from './PeoplePicker.jsx';
import { Field, Section, inputCls, inputBorder, btnSecondary, btnGhost } from './ui.jsx';
import { resizeWorkUnits, removeWorkUnit, unitHasData } from '../lib/form.js';
import { useDkct } from '../context.jsx';

/** Danh sách người có thể trống, mỗi người một dòng (GSATĐ 8.x, cảnh giới). */
/** update(fn): fn(danh sách hiện tại) -> danh sách mới — luôn dựa trên state mới nhất. */
function PersonList({ prefix, value, update, personnel, label, errors, field }) {
  const rows = value;
  return (
    <div className="space-y-2">
      {rows.map((p, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="w-9 pt-1.5 text-xs font-semibold text-slate-500">{prefix}.{i + 1})</span>
          <div className="flex-1">
            <PersonPicker value={p} personnel={personnel} ariaLabel={`${label} ${i + 1}`} autoFocus={!p.name} invalid={!!errors[`${field}.${i}`]}
              onChange={(np) => update(list => (np ? list.map((x, j) => (j === i ? np : x)) : list.filter((_, j) => j !== i)))} />
            {errors[`${field}.${i}`] && <p className="mt-1 text-xs text-red-600">{errors[`${field}.${i}`]}</p>}
          </div>
          <button type="button" className={btnGhost} aria-label={`Xóa ${label} ${i + 1}`} onClick={() => update(list => list.filter((_, j) => j !== i))}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" className={btnSecondary} onClick={() => update(list => [...list, { personnelId: null, name: '', safetyLevel: '', safetyCard: '' }])}>
        <Plus className="w-4 h-4" /> Thêm {label}
      </button>
    </div>
  );
}

function WorkUnitCard({ unit, index, total, onPatch, onRemove, canRemove, personnel, errors }) {
  const set = onPatch;
  const n = index + 1;
  const cmdError = errors[`workUnits.${index}.commander`];
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Đơn vị công tác{total > 1 ? ` ${n}` : ''}</h4>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-chatlan-50 dark:bg-chatlan-900/50 text-chatlan-700 dark:text-chatlan-300 text-xs font-semibold"
            aria-live="polite">
            <Users className="w-3.5 h-3.5" /> {String(unit.members.length).padStart(2, '0')}/ng
          </span>
          {canRemove && (
            <button type="button" className={btnGhost} aria-label={`Xóa ĐVCT ${n}`} onClick={onRemove}><Trash2 className="w-4 h-4" /></button>
          )}
        </div>
      </div>
      <Field label={`${total > 1 ? `9.${n})` : '9.'} Người chỉ huy trực tiếp (CHTT)`} required error={cmdError}>
        <PersonPicker value={unit.commander} personnel={personnel} invalid={!!cmdError} ariaLabel={`CHTT đơn vị công tác ${n}`}
          onChange={(p) => set({ commander: p })} />
      </Field>
      <Field label={`${total > 1 ? `6.${n})` : '6.'} Nhân viên đơn vị công tác`} hint="Số lượng tự đếm, không tính CHTT (như mẫu).">
        <PeoplePicker value={unit.members} personnel={personnel} exclude={unit.commander ? [unit.commander] : []}
          ariaLabel={`Nhân viên đơn vị công tác ${n}`} onChange={(members) => set({ members })} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Địa điểm riêng (nếu khác)" htmlFor={`wu-loc-${n}`}>
          <input id={`wu-loc-${n}`} className={`${inputCls} ${inputBorder()}`} value={unit.location} onChange={e => set({ location: e.target.value })} />
        </Field>
        <Field label="Bắt đầu" htmlFor={`wu-start-${n}`} error={errors[`workUnits.${index}.time`]}>
          <input id={`wu-start-${n}`} type="datetime-local" className={`${inputCls} ${inputBorder(errors[`workUnits.${index}.time`])}`}
            value={unit.start || ''} onChange={e => set({ start: e.target.value })} />
        </Field>
        <Field label="Kết thúc" htmlFor={`wu-end-${n}`}>
          <input id={`wu-end-${n}`} type="datetime-local" className={`${inputCls} ${inputBorder(errors[`workUnits.${index}.time`])}`}
            value={unit.end || ''} onChange={e => set({ end: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

/** Mục 5–10 và 12. */
/** Ô "5. Số lượng ĐVCT": áp dụng khi rời ô / Enter; hỏi trước khi bớt các ĐVCT đã khai. */
function UnitCountInput({ count, onApply, invalid }) {
  const [draft, setDraft] = useState(String(count));
  useEffect(() => setDraft(String(count)), [count]);
  const apply = () => {
    const n = Number.parseInt(draft, 10);
    if (!Number.isInteger(n) || n < 1 || n > 20) { setDraft(String(count)); return; }
    if (n !== count) onApply(n);
  };
  return (
    <input type="number" min={1} max={20} value={draft} aria-label="Số lượng đơn vị công tác"
      onChange={e => setDraft(e.target.value)} onBlur={apply}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
      className={`${inputCls} ${inputBorder(invalid)} !w-16 text-center`} />
  );
}

export default function EditorPeople({ form, setForm, errors, personnel }) {
  const { confirmAction } = useDkct();
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const updateList = (key) => (fn) => setForm(f => ({ ...f, [key]: fn(f[key]) }));
  const patchUnit = (i) => (patch) => setForm(f => ({ ...f, workUnits: f.workUnits.map((u, j) => (j === i ? { ...u, ...patch } : u)) }));
  const askDrop = (units) => {
    const filled = units.filter(unitHasData).length;
    return !filled || confirmAction({
      title: 'Bớt đơn vị công tác?',
      message: `${filled} ĐVCT sẽ bị xóa cùng người đã khai; các phiếu gắn với ĐVCT đó sẽ bỏ chọn.`,
      danger: true
    });
  };
  const resize = async (n) => {
    if (n < form.workUnits.length && !(await askDrop(form.workUnits.slice(n)))) return;
    setForm(f => ({ ...f, workUnits: resizeWorkUnits(f.workUnits, n), workUnitCount: n }));
  };
  const remove = async (i) => {
    if (!(await askDrop([form.workUnits[i]]))) return;
    setForm(f => removeWorkUnit(f, i));
  };

  return (
    <>
      <Section title="Người lãnh đạo, giám sát, cảnh giới" subtitle="Chọn từ danh mục hoặc tự ghi; Bậc ATĐ hiển thị theo người được chọn. Có thể để trống.">
        <Field label="7. Người lãnh đạo công việc (LĐCV)" error={errors.leader}>
          <PersonPicker value={form.leader} personnel={personnel} ariaLabel="Người lãnh đạo công việc" invalid={!!errors.leader}
            onChange={(p) => set('leader', p)} />
        </Field>
        <Field label="8. Người giám sát an toàn điện (GSATĐ)">
          <PersonList prefix="8" label="GSATĐ" field="supervisors" value={form.supervisors} personnel={personnel} errors={errors}
            update={updateList('supervisors')} />
        </Field>
        <Field label="10. Người cảnh giới (CG)">
          <PersonList prefix="10" label="người cảnh giới" field="watchmen" value={form.watchmen} personnel={personnel} errors={errors}
            update={updateList('watchmen')} />
        </Field>
      </Section>

      <Section title="Đơn vị công tác (mục 5, 6, 9)" subtitle="Mỗi ĐVCT bắt buộc có CHTT; một nhân viên có thể thuộc nhiều ĐVCT."
        actions={(
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            5. Số lượng ĐVCT
            <UnitCountInput count={form.workUnits.length} onApply={resize} invalid={!!errors.workUnits} />
          </label>
        )}>
        {errors.workUnits && <p className="text-xs text-red-600" role="alert">{errors.workUnits}</p>}
        {form.workUnits.map((u, i) => (
          <WorkUnitCard key={i} unit={u} index={i} total={form.workUnits.length} personnel={personnel} errors={errors} canRemove={form.workUnits.length > 1}
            onPatch={patchUnit(i)} onRemove={() => remove(i)} />
        ))}
      </Section>

      <Section title="12. Các đơn vị QLVH khác có liên quan" subtitle="Tự ghi, có thể để trống.">
        {form.otherUnits.map((u, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-12 text-xs font-semibold text-slate-500">12.{i + 1}.</span>
            <input aria-label={`Đơn vị liên quan ${i + 1}`} className={`${inputCls} ${inputBorder()}`} value={u}
              onChange={e => { const v = e.target.value; updateList('otherUnits')(l => l.map((x, j) => (j === i ? v : x))); }} />
            <button type="button" className={btnGhost} aria-label={`Xóa đơn vị ${i + 1}`}
              onClick={() => updateList('otherUnits')(l => l.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" className={btnSecondary} onClick={() => updateList('otherUnits')(l => [...l, ''])}>
          <Plus className="w-4 h-4" /> Thêm đơn vị
        </button>
      </Section>
    </>
  );
}
