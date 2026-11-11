import React, { useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Field, cardCls, inputCls, inputBorder, btnPrimary } from './ui.jsx';
import { forgetOrg } from './useOrg.js';

const ROLES = [['lead', 'Vai trò trưởng/phó đơn vị'], ['member', 'Vai trò thành viên'], ['admin', 'Vai trò quản trị']];
const formOf = (r) => ({
  companyName: r.companyName, unitName: r.unitName, teamWord: r.teamWord, leadSignTitle: r.leadSignTitle,
  positions: (r.positions || []).join('\n'), roleLabels: { ...r.roleLabels }
});

/**
 * Cài đặt → Tên đơn vị, chức danh (admin): tên công ty, đội, tên gọi đơn vị trực tiếp trên văn bản, chức danh gợi ý,
 * chức danh người ký phương án, tên vai trò trong phần mềm. Để trống: dùng mặc định. Văn bản đã lập giữ giá trị lúc lập.
 */
export default function OrgNamesPanel() {
  const { api, notify } = useDkct();
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/org-names')
      .then(r => { setForm(formOf(r)); setDefaults(r.defaults); })
      .catch(err => notify(err.message, 'error'));
  }, [api, notify]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/org-names', { ...form, positions: form.positions.split('\n') });
      setForm(formOf(r));
      forgetOrg(api);
      notify('Đã lưu. Văn bản lập từ bây giờ dùng tên, chức danh mới.', 'success');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };

  if (!form || !defaults) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-chatlan-600" /></div>;
  const input = (id, key, max, placeholder) => (
    <input id={id} className={`${inputCls} ${inputBorder()}`} value={form[key]} maxLength={max} placeholder={placeholder} onChange={e => set(key, e.target.value)} />
  );
  const word = form.teamWord || defaults.teamWord;
  return (
    <form onSubmit={save} className={`${cardCls} space-y-4 max-w-3xl`}>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Dùng cho văn bản lập mới (giấy ĐKCT, biên bản KSHT, phương án, giấy xác nhận); văn bản đã lập giữ tên, chức danh lúc lập
        và người lập vẫn sửa được trên từng văn bản. Ô để trống: dùng mặc định (chữ mờ trong ô).
        Đổi tên <b>đơn vị trực tiếp</b> (tổ): trang Quản trị → Đơn vị trực tiếp → nút Sửa.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tên đơn vị</legend>
        <Field label="Tên công ty" htmlFor="org-company" hint="Để trống: theo văn bản gần nhất của đơn vị, không có thì mặc định.">
          {input('org-company', 'companyName', 200, defaults.companyName)}
        </Field>
        <Field label="Tên đội (đơn vị cấp trên của các đơn vị trực tiếp)" htmlFor="org-unit" hint="Để trống: theo văn bản gần nhất của đơn vị, không có thì mặc định.">
          {input('org-unit', 'unitName', 200, defaults.unitName)}
        </Field>
        <Field label="Tên gọi đơn vị trực tiếp trên văn bản" htmlFor="org-word" hint={`Đứng trước tên viết tắt, vd "Lưu: VT, ${word} TNLĐ", "Kỹ sư - ${word} TNLĐ".`}>
          {input('org-word', 'teamWord', 40, defaults.teamWord)}
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Chức danh</legend>
        <Field label="Chức danh gợi ý cho người của đơn vị (mỗi dòng một chức danh)" htmlFor="org-positions"
          hint="Gợi ý ở ô Chức vụ (biên bản KSHT, …); vẫn ghi tay được chức danh khác.">
          <textarea id="org-positions" rows={4} className={`${inputCls} ${inputBorder()}`} value={form.positions}
            placeholder={defaults.positions.join('\n')} onChange={e => set('positions', e.target.value)} />
        </Field>
        <Field label="Chức danh người ký phương án" htmlFor="org-sign" hint="In ở phần ký của phương án (thay cho chữ có sẵn của mẫu).">
          {input('org-sign', 'leadSignTitle', 100, defaults.leadSignTitle)}
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ROLES.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`org-role-${key}`} hint="Tên hiện trong phần mềm (Quản trị → Người dùng).">
              <input id={`org-role-${key}`} className={`${inputCls} ${inputBorder()}`} value={form.roleLabels[key] || ''} maxLength={60}
                placeholder={defaults.roleLabels[key]} onChange={e => set('roleLabels', { ...form.roleLabels, [key]: e.target.value })} />
            </Field>
          ))}
        </div>
      </fieldset>

      <button type="submit" className={btnPrimary} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
      </button>
    </form>
  );
}
