import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, PlugZap, KeyRound, CalendarClock, RotateCcw } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnPrimary, btnSecondary, inputCls, inputBorder, formatDateTime } from './ui.jsx';

const FROM_TEXT = { admin: 'admin đã lưu', env: 'mặc định của máy chủ (.env)' };

/**
 * Cấu hình tải lịch cắt điện (admin): tài khoản trang lịch Công ty, mật khẩu (lưu mã hóa, không hiện lại),
 * giờ tự tải hằng ngày và số ngày tải. Lưu là có hiệu lực ngay, không cần khởi động lại máy chủ.
 */
export default function OutageSettingsPanel() {
  const { api, notify } = useDkct();
  const [view, setView] = useState(null);
  const [form, setForm] = useState(null); // { user, password, times, days }
  const [busy, setBusy] = useState(''); // 'save' | 'test' | 'reset'

  const fill = useCallback((v) => {
    setView(v);
    setForm({ user: v.user, password: '', times: v.times, days: String(v.days) });
  }, []);
  useEffect(() => { api.get('/outage-settings').then(fill).catch(err => notify(err.message, 'error')); }, [api, notify, fill]);

  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const save = () => run('save', async () => {
    fill(await api.put('/outage-settings', { user: form.user, password: form.password, times: form.times, days: form.days }));
    notify('Đã lưu cấu hình tải lịch; có hiệu lực ngay.', 'success');
  });
  const test = () => run('test', async () => {
    await api.post('/outage-settings/test', {});
    notify('Kết nối được trang lịch cắt điện: đăng nhập và kết xuất lịch hôm nay thành công.', 'success');
  });
  const clearPassword = () => run('reset', async () => {
    fill(await api.put('/outage-settings', { clearPassword: true }));
    notify('Đã xóa mật khẩu admin lưu; dùng mật khẩu trong .env (nếu có).', 'success');
  });
  const resetAuto = () => run('reset', async () => {
    fill(await api.put('/outage-settings', { resetAuto: true }));
    notify('Giờ tự tải quay về mặc định của máy chủ (.env).', 'success');
  });

  if (!form) return <Loader2 className="w-5 h-5 animate-spin text-chatlan-600" aria-label="Đang tải" />;
  const field = `${inputCls} ${inputBorder()}`;
  const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2';
  const label = 'block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1';
  const hint = 'text-xs text-slate-500 dark:text-slate-400';
  return (
    <form className="space-y-3 max-w-2xl" onSubmit={e => { e.preventDefault(); save(); }}>
      <p className={hint}>
        Tài khoản đăng nhập trang lịch cắt điện của Công ty và giờ máy chủ tự tải lịch. Ô để trống dùng giá trị trong .env của
        máy chủ. Máy chủ phải vào được mạng nội bộ Công ty.
      </p>

      <section className={card} aria-labelledby="dkct-src-title">
        <h3 id="dkct-src-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <KeyRound className="w-4 h-4 text-chatlan-600" aria-hidden="true" /> Tài khoản trang lịch
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="dkct-src-user" className={label}>Tên đăng nhập</label>
            <input id="dkct-src-user" type="text" autoComplete="off" className={field} value={form.user}
              placeholder={view.defaultUser ? `${view.defaultUser} (.env)` : 'Tên đăng nhập'}
              onChange={e => setForm({ ...form, user: e.target.value })} />
          </div>
          <div>
            <label htmlFor="dkct-src-pass" className={label}>Mật khẩu mới</label>
            <input id="dkct-src-pass" type="password" autoComplete="new-password" className={field} value={form.password}
              disabled={!view.canStorePassword}
              placeholder={view.passwordFrom ? 'Để trống = giữ mật khẩu hiện tại' : 'Chưa có mật khẩu'}
              onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
        </div>
        <p className={hint} role="status">
          Mật khẩu đang dùng: {view.passwordFrom ? <b>{FROM_TEXT[view.passwordFrom]}</b> : <b className="text-red-700 dark:text-red-400">chưa có</b>}.
          {' '}Mật khẩu được mã hóa khi lưu và không hiện lại.
        </p>
        {view.passwordUnreadable && (
          <p className="text-xs text-red-700 dark:text-red-400" role="alert">
            Mật khẩu admin đã lưu không giải mã được (khóa DKCT_SECRET_KEY của máy chủ đã đổi). Nhập lại mật khẩu.
          </p>
        )}
        {!view.canStorePassword && (
          <p className="text-xs text-amber-700 dark:text-amber-400" role="alert">
            Máy chủ chưa có khóa mã hóa (DKCT_SECRET_KEY trong .env) nên không lưu mật khẩu ở đây được; mật khẩu đặt trong .env.
          </p>
        )}
        {view.passwordFrom === 'admin' && (
          <button type="button" className={btnSecondary} disabled={!!busy} onClick={clearPassword}>
            <RotateCcw className="w-4 h-4" /> Xóa mật khẩu đã lưu (dùng .env)
          </button>
        )}
      </section>

      <section className={card} aria-labelledby="dkct-auto-title">
        <h3 id="dkct-auto-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <CalendarClock className="w-4 h-4 text-chatlan-600" aria-hidden="true" /> Tự tải theo giờ
        </h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
          <div>
            <label htmlFor="dkct-auto-times" className={label}>Giờ tải hằng ngày (giờ Việt Nam)</label>
            <input id="dkct-auto-times" type="text" className={field} value={form.times} placeholder="07:00, 15:00 — để trống = tắt"
              onChange={e => setForm({ ...form, times: e.target.value })} />
          </div>
          <div>
            <label htmlFor="dkct-auto-days" className={label}>Số ngày tới</label>
            <input id="dkct-auto-days" type="number" min={1} max={view.maxDays} className={field} value={form.days}
              onChange={e => setForm({ ...form, days: e.target.value })} />
          </div>
        </div>
        <p className={hint}>
          Đang dùng: <b>{FROM_TEXT[view.autoFrom]}</b>
          {view.autoFrom === 'admin' && <> (mặc định .env: {view.defaultTimes || 'tắt'}, {view.defaultDays} ngày)</>}.
          {' '}Mỗi giờ hẹn tải lịch từ hôm nay đến hết số ngày tới, so sánh và báo thay đổi.
        </p>
        {view.autoFrom === 'admin' && (
          <button type="button" className={btnSecondary} disabled={!!busy} onClick={resetAuto}>
            <RotateCcw className="w-4 h-4" /> Dùng giờ mặc định (.env)
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={!!busy}>
          {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu
        </button>
        <button type="button" className={btnSecondary} disabled={!!busy} onClick={test} title="Đăng nhập và kết xuất lịch hôm nay bằng cấu hình đã lưu (không nạp)">
          {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />} Thử kết nối
        </button>
        {view.updatedAt && <span className={hint}>Sửa lần cuối {formatDateTime(view.updatedAt)}</span>}
      </div>
    </form>
  );
}
