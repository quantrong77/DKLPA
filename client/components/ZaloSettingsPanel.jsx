import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Send, KeyRound, Users, Plus, Trash2, Search, RotateCcw, BellRing, ExternalLink } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnPrimary, btnSecondary, btnGhost, inputCls, inputBorder, formatDateTime } from './ui.jsx';

const FROM_TEXT = { admin: 'admin đã lưu', env: 'mặc định của máy chủ (ZALO_BOT_TOKEN)' };
const emptyRow = () => ({ chatId: '', label: '', department: '' });

/**
 * Thông báo Zalo (admin): bot Zalo gửi tin khi lịch cắt điện thay đổi sau lần tự tải theo giờ hẹn.
 * Token bot lưu mã hóa, không hiện lại; người nhận là chat_id của người / nhóm đã nhắn tin cho bot.
 */
export default function ZaloSettingsPanel() {
  const { api, notify } = useDkct();
  const [view, setView] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [found, setFound] = useState(null); // người vừa nhắn bot

  const fill = useCallback((v) => {
    setView(v);
    setForm({ token: '', enabled: v.enabled, onAuto: v.onAuto, onManual: v.onManual, appUrl: v.appUrl, recipients: v.recipients.length ? v.recipients : [emptyRow()] });
  }, []);
  useEffect(() => { api.get('/zalo-settings').then(fill).catch(err => notify(err.message, 'error')); }, [api, notify, fill]);

  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const payload = () => ({ ...form, recipients: form.recipients.filter(r => r.chatId.trim()) });
  const save = () => run('save', async () => {
    fill(await api.put('/zalo-settings', payload()));
    notify('Đã lưu thông báo Zalo; có hiệu lực ngay.', 'success');
  });
  const report = (r) => {
    if (r.failed.length) notify(`Gửi được ${r.sent}, lỗi ${r.failed.length}: ${r.failed[0].label || r.failed[0].chatId} — ${r.failed[0].error}`, 'error');
    else notify(`Đã gửi tin thử tới ${r.sent} người nhận. Kiểm tra Zalo.`, 'success');
  };
  const testAll = () => run('test', async () => {
    fill(await api.put('/zalo-settings', payload())); // gửi thử theo cấu hình đang thấy
    report(await api.post('/zalo-settings/test', {}));
  });
  const testOne = (chatId) => run(`test:${chatId}`, async () => report(await api.post('/zalo-settings/test', { chatId })));
  const discover = () => run('discover', async () => {
    const { chats } = await api.post('/zalo-settings/discover', {});
    setFound(chats);
    if (!chats.length) notify('Không có tin nhắn nào tới bot trong lúc chờ. Bấm lại rồi nhắn bot ngay trong lúc nút đang quay.', 'info');
  });
  const clearToken = () => run('reset', async () => {
    fill(await api.put('/zalo-settings', { clearToken: true }));
    notify('Đã xóa token admin lưu.', 'success');
  });

  if (!form) return <Loader2 className="w-5 h-5 animate-spin text-chatlan-600" aria-label="Đang tải" />;
  const field = `${inputCls} ${inputBorder()}`;
  const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2';
  const label = 'block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1';
  const hint = 'text-xs text-slate-500 dark:text-slate-400';
  const setRow = (i, patch) => setForm(f => ({ ...f, recipients: f.recipients.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addChat = (c) => setForm(f => {
    if (f.recipients.some(r => r.chatId === c.chatId)) return f;
    const rows = f.recipients.filter(r => r.chatId.trim() || r.label.trim());
    return { ...f, recipients: [...rows, { chatId: c.chatId, label: c.name || (c.type === 'GROUP' ? 'Nhóm' : ''), department: '' }] };
  });
  const status = view.status || {};

  return (
    <form className="space-y-3 max-w-3xl" onSubmit={e => { e.preventDefault(); save(); }}>
      <p className={hint}>
        Bot Zalo gửi tin cho trưởng/phó đơn vị / nhóm Zalo của đơn vị khi lịch cắt điện có <b>phát sinh, hoãn, dời lịch, sửa nội dung</b>
        {' '}sau mỗi lần tự tải theo giờ hẹn (Cài đặt → Tải lịch tự động). Máy chủ cần ra được Internet.
      </p>
      <details className={`${card} text-xs text-slate-600 dark:text-slate-300`}>
        <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-100">Cách tạo bot và lấy người nhận</summary>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>Trên Zalo, tìm <b>Zalo Bot Creator</b> → tạo bot → nhận <b>token</b> (dạng 1234567890:AbCd…). Dán token bên dưới, Lưu.</li>
          <li>Mỗi người cần nhận báo: tìm bot trên Zalo, bấm <b>Quan tâm</b> và nhắn một tin bất kỳ (vd "đăng ký"). Nhóm Zalo: thêm bot vào nhóm rồi nhắn trong nhóm (Zalo đang thử nghiệm bot trong nhóm).</li>
          <li>Bấm <b>Tìm người vừa nhắn bot</b>, rồi <b>trong lúc nút đang chờ</b> nhắn một tin cho bot (Zalo chỉ trả tin đến trong lúc chờ) → <b>Thêm</b> người / nhóm hiện ra → chọn đơn vị (chỉ nhận thay đổi của đơn vị đó) → Lưu → <b>Gửi thử</b>.</li>
        </ol>
        <a className="inline-flex items-center gap-1 mt-2 underline" href="https://bot.zapps.me/docs/" target="_blank" rel="noreferrer">
          Tài liệu Zalo Bot <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </details>

      <section className={card} aria-labelledby="dkct-zalo-token">
        <h3 id="dkct-zalo-token" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <KeyRound className="w-4 h-4 text-chatlan-600" aria-hidden="true" /> Bot Zalo
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="dkct-zalo-tk" className={label}>Token bot mới</label>
            <input id="dkct-zalo-tk" type="password" autoComplete="off" className={field} value={form.token} disabled={!view.canStoreToken}
              placeholder={view.hasToken ? 'Để trống = giữ token hiện tại' : '1234567890:AbCd…'} onChange={e => setForm({ ...form, token: e.target.value })} />
          </div>
          <div>
            <label htmlFor="dkct-zalo-url" className={label}>Đường dẫn ứng dụng (ghi cuối tin)</label>
            <input id="dkct-zalo-url" type="url" className={field} value={form.appUrl} placeholder="https://dkct.onrender.com"
              onChange={e => setForm({ ...form, appUrl: e.target.value })} />
          </div>
        </div>
        <p className={hint} role="status">
          Token đang dùng: {view.hasToken ? <b>{FROM_TEXT[view.tokenFrom]}</b> : <b className="text-red-700 dark:text-red-400">chưa có</b>}. Token được mã hóa khi lưu và không hiện lại.
        </p>
        {view.tokenUnreadable && <p className="text-xs text-red-700 dark:text-red-400" role="alert">Token đã lưu không giải mã được (khóa DKCT_SECRET_KEY đã đổi). Nhập lại token.</p>}
        {!view.canStoreToken && <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">Máy chủ chưa có khóa mã hóa (DKCT_SECRET_KEY) nên không lưu token ở đây được; đặt ZALO_BOT_TOKEN trong .env.</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-200">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Bật thông báo Zalo</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.onAuto} disabled={!form.enabled} onChange={e => setForm({ ...form, onAuto: e.target.checked })} /> Sau khi tự tải theo giờ hẹn</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.onManual} disabled={!form.enabled} onChange={e => setForm({ ...form, onManual: e.target.checked })} /> Cả khi bấm tải / chọn file lịch</label>
        </div>
        {view.tokenFrom === 'admin' && (
          <button type="button" className={btnSecondary} disabled={!!busy} onClick={clearToken}><RotateCcw className="w-4 h-4" /> Xóa token đã lưu</button>
        )}
      </section>

      <section className={card} aria-labelledby="dkct-zalo-to">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="dkct-zalo-to" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Users className="w-4 h-4 text-chatlan-600" aria-hidden="true" /> Người nhận ({form.recipients.filter(r => r.chatId.trim()).length})
          </h3>
          <button type="button" className={btnSecondary} disabled={!!busy || !view.hasToken} onClick={discover}
            title={view.hasToken ? 'Bấm rồi nhắn một tin cho bot: chờ tối đa 50 giây để lấy chat ID' : 'Lưu token trước'}>
            {busy === 'discover' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {busy === 'discover' ? 'Đang chờ tin nhắn tới bot…' : 'Tìm người vừa nhắn bot'}
          </button>
        </div>
        {busy === 'discover' && (
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400" role="status">
            Nhắn một tin bất kỳ cho bot ngay bây giờ (trên Zalo của người cần nhận báo, hoặc trong nhóm có bot) — đang chờ tối đa 50 giây.
          </p>
        )}
        {found && found.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-chatlan-50/60 dark:bg-chatlan-900/20 p-2" aria-label="Người vừa nhắn bot">
            {found.map(c => (
              <li key={c.chatId} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{c.name || '(không tên)'}</span>
                <span className="text-slate-500">{c.type === 'GROUP' ? 'Nhóm' : 'Cá nhân'} · {c.chatId}{c.text ? ` · "${c.text}"` : ''}</span>
                <button type="button" className="ml-auto underline disabled:opacity-50" disabled={form.recipients.some(r => r.chatId === c.chatId)} onClick={() => addChat(c)}>
                  {form.recipients.some(r => r.chatId === c.chatId) ? 'Đã có' : 'Thêm'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          {form.recipients.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-center">
              <input aria-label={`Tên người nhận ${i + 1}`} className={field} value={r.label} placeholder="Tên (vd Tổ trưởng TN Lâm Đồng)" onChange={e => setRow(i, { label: e.target.value })} />
              <input aria-label={`Chat ID ${i + 1}`} className={`${field} font-mono`} value={r.chatId} placeholder="Chat ID" onChange={e => setRow(i, { chatId: e.target.value.trim() })} />
              <select aria-label={`Đơn vị của người nhận ${i + 1}`} className={field} value={r.department} onChange={e => setRow(i, { department: e.target.value })}>
                <option value="">Mọi đơn vị (mọi thay đổi)</option>
                {view.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex">
                <button type="button" className={btnGhost} aria-label={`Gửi thử tới ${r.label || r.chatId || 'người nhận'}`} title="Gửi tin thử"
                  disabled={!!busy || !r.chatId.trim() || !view.hasToken} onClick={() => testOne(r.chatId.trim())}>
                  {busy === `test:${r.chatId.trim()}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
                <button type="button" className={btnGhost} aria-label={`Bỏ người nhận ${i + 1}`} title="Bỏ"
                  onClick={() => setForm(f => ({ ...f, recipients: f.recipients.length > 1 ? f.recipients.filter((_, j) => j !== i) : [emptyRow()] }))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={btnSecondary} onClick={() => setForm(f => ({ ...f, recipients: [...f.recipients, emptyRow()] }))}>
          <Plus className="w-4 h-4" /> Thêm người nhận
        </button>
        <p className={hint}>Chọn đơn vị: người nhận chỉ nhận thay đổi ở trạm / khu vực đơn vị đó phụ trách (Cài đặt → Khu vực, trạm của đơn vị) hoặc dòng lịch đã có hồ sơ của đơn vị.</p>
      </section>

      {status.at && (
        <p className={`${hint} flex items-start gap-1.5`} role="status">
          <BellRing className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>
            Lần báo gần nhất {formatDateTime(status.at)}{status.source ? ` (${status.source})` : ''}: gửi {status.sent} tin
            {status.errors?.length ? <span className="text-red-700 dark:text-red-400">; lỗi: {status.errors.join('; ')}</span> : null}.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={!!busy}>
          {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
        </button>
        <button type="button" className={btnSecondary} disabled={!!busy || (!view.hasToken && !form.token)} onClick={testAll} title="Lưu rồi gửi tin thử tới mọi người nhận">
          {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Lưu & gửi thử tất cả
        </button>
        {view.updatedAt && <span className={hint}>Sửa lần cuối {formatDateTime(view.updatedAt)}</span>}
      </div>
    </form>
  );
}
