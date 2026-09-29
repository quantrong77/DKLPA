import React from 'react';
import { Field, Section, SourceBadge, inputCls, inputBorder } from './ui.jsx';

/** Đầu giấy, nơi nhận, mục 1–4 (nội dung, địa điểm, điều kiện, thời gian). */
export default function EditorWork({ form, setForm, errors, stations, departments = [], outage, docNumberPreview, isNew }) {
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const setIn = (key, patch) => setForm(f => ({ ...f, [key]: { ...f[key], ...patch } }));
  // giấy cũ có thể ghi tên tổ không còn trong danh sách: vẫn giữ làm một lựa chọn
  const teamOptions = departments.length
    ? [...new Set([...departments.map(d => d.name), form.header.teamName].filter(Boolean))]
    : [];
  const station = stations.find(s => s.id === form.recipient?.stationId);
  const recipientChoice = form.recipient?.stationId || (form.recipient?.manual || form.recipient?.name ? '__manual' : '');

  return (
    <>
      <Section title="Thông tin chung" subtitle={isNew ? `Số giấy dự kiến: ${docNumberPreview} — cấp khi lưu` : `Số giấy: ${docNumberPreview} (không đổi khi hiệu chỉnh)`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Đơn vị cấp trên (Đội/Phòng)" htmlFor="dk-unit">
            <input id="dk-unit" className={`${inputCls} ${inputBorder()}`} value={form.header.unitName || ''}
              onChange={e => setIn('header', { unitName: e.target.value })} placeholder="Đội Sửa chữa, thí nghiệm điện 3" />
          </Field>
          <Field label="Tổ đăng ký" htmlFor="dk-team">
            {teamOptions.length ? (
              <select id="dk-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''}
                onChange={e => setIn('header', { teamName: e.target.value })}>
                <option value="">— Chọn tổ —</option>
                {teamOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            ) : (
              <input id="dk-team" className={`${inputCls} ${inputBorder()}`} value={form.header.teamName || ''}
                onChange={e => setIn('header', { teamName: e.target.value })} />
            )}
          </Field>
          <Field label="Địa danh" htmlFor="dk-place">
            <input id="dk-place" className={`${inputCls} ${inputBorder()}`} value={form.header.place || ''}
              onChange={e => setIn('header', { place: e.target.value })} placeholder="Lâm Đồng" />
          </Field>
          <Field label="Ngày văn bản" htmlFor="dk-date">
            <input id="dk-date" type="date" className={`${inputCls} ${inputBorder()}`} value={form.header.date || ''}
              onChange={e => setIn('header', { date: e.target.value })} />
          </Field>
          <Field label="Căn cứ" htmlFor="dk-basis" className="sm:col-span-2">
            <input id="dk-basis" className={`${inputCls} ${inputBorder()}`} value={form.header.basis || ''}
              onChange={e => setIn('header', { basis: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[6rem_1fr_1fr_1.4fr] gap-3">
          <Field label="Danh xưng" htmlFor="dk-hon">
            <select id="dk-hon" className={`${inputCls} ${inputBorder()}`} value={form.representative.honorific || 'Ông'}
              onChange={e => setIn('representative', { honorific: e.target.value })}>
              <option>Ông</option><option>Bà</option>
            </select>
          </Field>
          <Field label="Người đại diện" htmlFor="dk-rep">
            <input id="dk-rep" className={`${inputCls} ${inputBorder()}`} value={form.representative.name || ''}
              onChange={e => setIn('representative', { name: e.target.value })} />
          </Field>
          <Field label="Chức vụ" htmlFor="dk-role">
            <input id="dk-role" className={`${inputCls} ${inputBorder()}`} value={form.representative.role || ''}
              onChange={e => setIn('representative', { role: e.target.value })} />
          </Field>
          <Field label="Điện thoại (Email)" htmlFor="dk-contact">
            <input id="dk-contact" className={`${inputCls} ${inputBorder()}`} value={form.representative.contact || ''}
              onChange={e => setIn('representative', { contact: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section title="Nơi nhận" subtitle="Đơn vị quản lý vận hành trạm — email tự điền theo danh mục">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Kính gửi" htmlFor="dk-recipient" required error={errors.recipient}>
            <select id="dk-recipient" className={`${inputCls} ${inputBorder(errors.recipient)}`}
              value={recipientChoice}
              onChange={e => {
                const v = e.target.value;
                if (v === '__manual') set('recipient', { stationId: null, name: '', email: '', manual: true });
                else {
                  const s = stations.find(x => x.id === v);
                  set('recipient', s ? { stationId: s.id, name: s.name, email: s.email || '' } : { stationId: null, name: '', email: '' });
                }
              }}>
              <option value="">— Chọn đơn vị —</option>
              {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              {form.recipient?.stationId && !station && (
                <option value={form.recipient.stationId}>{form.recipient.name} (đã ẩn khỏi danh mục)</option>
              )}
              <option value="__manual">Tự ghi…</option>
            </select>
          </Field>
          {form.recipient?.stationId ? (
            <Field label="Email đơn vị" hint={station && !station.email ? 'Danh mục chưa có email của đơn vị này.' : undefined}>
              <p className="py-1.5 text-sm text-slate-700 dark:text-slate-200 break-all">{station?.email || '—'}</p>
            </Field>
          ) : recipientChoice === '__manual' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tên đơn vị" htmlFor="dk-rname">
                <input id="dk-rname" className={`${inputCls} ${inputBorder(errors.recipient)}`} value={form.recipient.name || ''}
                  onChange={e => setIn('recipient', { name: e.target.value })} />
              </Field>
              <Field label="Email" htmlFor="dk-remail">
                <input id="dk-remail" type="email" className={`${inputCls} ${inputBorder()}`} value={form.recipient.email || ''}
                  onChange={e => setIn('recipient', { email: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <Section title="Công việc" subtitle={outage ? `Theo lịch cắt điện: ${outage.location || ''}` : 'Tự ghi hoặc tạo giấy từ tab Lịch cắt điện'}>
        <Field label={<>1. Nội dung công việc <SourceBadge source={form.workContent.source}
          onReset={outage && form.workContent.text !== outage.content ? () => set('workContent', { text: outage.content, source: 'outage' }) : null} /></>}
          htmlFor="dk-content" required error={errors.workContent}>
          <textarea id="dk-content" rows={3} className={`${inputCls} ${inputBorder(errors.workContent)}`} value={form.workContent.text}
            onChange={e => set('workContent', { text: e.target.value, source: 'manual' })} />
        </Field>
        <Field label="2. Địa điểm (hoặc thiết bị) tiến hành công việc" htmlFor="dk-location">
          <textarea id="dk-location" rows={2} className={`${inputCls} ${inputBorder()}`} value={form.workLocation || ''}
            onChange={e => set('workLocation', e.target.value)} />
        </Field>
        <Field label={<>3. Điều kiện cần có để thực hiện công việc <SourceBadge source={form.condition.source}
          onReset={outage && form.condition.text !== outage.scope ? () => set('condition', { text: outage.scope, source: 'outage' }) : null} /></>}
          htmlFor="dk-condition">
          <textarea id="dk-condition" rows={3} className={`${inputCls} ${inputBorder()}`} value={form.condition.text}
            onChange={e => set('condition', { text: e.target.value, source: 'manual' })} />
        </Field>
        <div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">4. Thời gian tiến hành <span className="text-red-500">*</span>{' '}
            <SourceBadge source={form.time.source} onReset={outage && (form.time.start !== outage.regStart || form.time.end !== outage.regEnd)
              ? () => set('time', { start: outage.regStart, end: outage.regEnd, source: 'outage' }) : null} /></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Bắt đầu" htmlFor="dk-start" error={errors.time}>
              <input id="dk-start" type="datetime-local" className={`${inputCls} ${inputBorder(errors.time)}`} value={form.time.start || ''}
                onChange={e => set('time', { ...form.time, start: e.target.value, source: 'manual' })} />
            </Field>
            <Field label="Kết thúc" htmlFor="dk-end">
              <input id="dk-end" type="datetime-local" className={`${inputCls} ${inputBorder(errors.time)}`} value={form.time.end || ''}
                onChange={e => set('time', { ...form.time, end: e.target.value, source: 'manual' })} />
            </Field>
          </div>
        </div>
      </Section>
    </>
  );
}
