import React, { useEffect, useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { Field, cardCls, inputCls, inputBorder, btnPrimary } from './ui.jsx';

/**
 * Cài đặt → Tên đơn vị (admin): tên công ty, tên đội in trên văn bản lập mới. Văn bản đã lập giữ tên lúc lập.
 * Để trống: theo văn bản gần nhất của tổ (như trước), không thì tên mặc định.
 */
export default function OrgNamesPanel() {
  const { api, notify } = useDkct();
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/org-names')
      .then(r => { setForm({ companyName: r.companyName, unitName: r.unitName }); setDefaults(r.defaults || {}); })
      .catch(err => notify(err.message, 'error'));
  }, [api, notify]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.put('/org-names', form);
      setForm({ companyName: r.companyName, unitName: r.unitName });
      notify('Đã lưu tên đơn vị. Văn bản lập từ bây giờ dùng tên mới.', 'success');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };

  if (!form) return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-chatlan-600" /></div>;
  return (
    <form onSubmit={save} className={`${cardCls} space-y-3 max-w-2xl`}>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Tên in ở đầu văn bản lập mới (giấy ĐKCT, biên bản KSHT, phương án, giấy xác nhận). Văn bản đã lập giữ tên lúc lập; người lập
        vẫn sửa được trên từng văn bản. Để trống: lấy theo văn bản gần nhất của tổ. Đổi tên <b>tổ</b>: trang Quản trị → Tổ → nút Sửa.
      </p>
      <Field label="Tên công ty" htmlFor="org-company" hint={`Mặc định: ${defaults.companyName || ''}`}>
        <input id="org-company" className={`${inputCls} ${inputBorder()}`} value={form.companyName} maxLength={200}
          placeholder={defaults.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
      </Field>
      <Field label="Tên đội (đơn vị cấp trên của các tổ)" htmlFor="org-unit" hint={`Mặc định: ${defaults.unitName || ''}`}>
        <input id="org-unit" className={`${inputCls} ${inputBorder()}`} value={form.unitName} maxLength={200}
          placeholder={defaults.unitName} onChange={e => setForm(f => ({ ...f, unitName: e.target.value }))} />
      </Field>
      <button type="submit" className={btnPrimary} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
      </button>
    </form>
  );
}
