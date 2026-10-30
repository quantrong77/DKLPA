import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, Send, Trash2 } from 'lucide-react';
import { useDkct } from '../context.jsx';
import { btnGhost, btnPrimary, btnSecondary, inputCls, inputBorder } from './ui.jsx';
import { pushSupport, SUPPORT_HINT, deviceLabel, currentSubscription, subscribeDevice } from '../lib/push.js';

/**
 * Nút chuông ở đầu trang: bật / tắt thông báo đẩy "lịch cắt điện thay đổi" trên thiết bị đang dùng
 * (máy tính, điện thoại), chọn nhận của tổ mình hay tất cả, gửi thử, xem / gỡ các thiết bị đã bật.
 */
export default function PushButton() {
  const { api, notify } = useDkct();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: true, endpoint: '', devices: [], department: '', publicKey: '' });
  const [scope, setScope] = useState('team');
  const [busy, setBusy] = useState('');
  const box = useRef(null);
  const support = pushSupport();

  const load = useCallback(async () => {
    try {
      const sub = support.ok ? await currentSubscription().catch(() => null) : null;
      const config = await api.get(`/push/config${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ''}`);
      setState({ loading: false, endpoint: sub?.endpoint || '', devices: config.devices, department: config.department, publicKey: config.publicKey });
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, [api, support.ok]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const run = async (name, fn) => {
    setBusy(name);
    try { await fn(); } catch (err) { notify(err.message, 'error'); } finally { setBusy(''); }
  };
  const turnOn = () => run('on', async () => {
    const sub = await subscribeDevice(state.publicKey);
    const { devices } = await api.post('/push/subscriptions', {
      subscription: sub.toJSON(), scope, label: deviceLabel(), openUrl: window.location.origin + window.location.pathname
    });
    setState(s => ({ ...s, endpoint: sub.endpoint, devices }));
    notify('Đã bật thông báo lịch cắt điện trên thiết bị này.', 'success');
  });
  const turnOff = () => run('off', async () => {
    const sub = await currentSubscription();
    const { devices } = await api.post('/push/unsubscribe', { endpoint: sub?.endpoint || state.endpoint });
    await sub?.unsubscribe().catch(() => {});
    setState(s => ({ ...s, endpoint: '', devices }));
    notify('Đã tắt thông báo trên thiết bị này.', 'success');
  });
  const changeScope = (value) => {
    setScope(value);
    if (on) run('scope', async () => {
      const sub = await currentSubscription();
      if (!sub) return;
      const { devices } = await api.post('/push/subscriptions', { subscription: sub.toJSON(), scope: value, label: deviceLabel(), openUrl: window.location.origin + window.location.pathname });
      setState(s => ({ ...s, devices }));
    });
  };
  const test = () => run('test', async () => {
    const { sent, total } = await api.post('/push/test', {});
    notify(`Đã gửi thử tới ${sent}/${total} thiết bị.`, sent ? 'success' : 'error');
  });
  const remove = (id) => run(`rm:${id}`, async () => {
    const { devices } = await api.del(`/push/subscriptions/${id}${state.endpoint ? `?endpoint=${encodeURIComponent(state.endpoint)}` : ''}`);
    setState(s => ({ ...s, devices }));
  });

  // thiết bị này đang bật (máy chủ còn giữ đăng ký của trình duyệt này): phạm vi theo đăng ký đã lưu
  const current = state.devices.find(d => d.current);
  const on = !!current;
  useEffect(() => { if (current?.scope) setScope(current.scope); }, [current?.scope]);

  const Icon = on ? BellRing : support.ok ? Bell : BellOff;
  return (
    <div ref={box} className="relative">
      <button type="button" className={btnGhost} aria-haspopup="true" aria-expanded={open}
        aria-label="Thông báo lịch cắt điện" title={on ? 'Đang bật thông báo lịch cắt điện trên thiết bị này' : 'Thông báo lịch cắt điện'}
        onClick={() => setOpen(v => !v)}>
        <Icon className={`w-4 h-4 ${on ? 'text-chatlan-600' : ''}`} />
      </button>
      {open && (
        <div role="dialog" aria-label="Thông báo lịch cắt điện"
          className="absolute right-0 top-full mt-1 z-50 w-80 max-w-[calc(100vw-2rem)] p-3 space-y-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Thông báo lịch cắt điện</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Hiện thông báo trên máy tính / điện thoại này khi lịch cắt điện phát sinh, hoãn, dời, sửa — kể cả khi không mở trang.
          </p>
          {state.loading ? (
            <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Đang kiểm tra…</p>
          ) : !support.ok ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{SUPPORT_HINT[support.reason]}</p>
          ) : (
            <>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nhận thay đổi
                <select className={`${inputCls} ${inputBorder()} mt-1`} value={scope} onChange={e => changeScope(e.target.value)} disabled={!!busy}>
                  <option value="team">{state.department ? `Của ${state.department}` : 'Của tổ tôi'}</option>
                  <option value="all">Tất cả các tổ</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                {on ? (
                  <button type="button" className={btnSecondary} onClick={turnOff} disabled={!!busy}>
                    {busy === 'off' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />} Tắt trên thiết bị này
                  </button>
                ) : (
                  <button type="button" className={btnPrimary} onClick={turnOn} disabled={!!busy || !state.publicKey}>
                    {busy === 'on' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />} Bật trên thiết bị này
                  </button>
                )}
                {state.devices.length > 0 && (
                  <button type="button" className={btnSecondary} onClick={test} disabled={!!busy}>
                    {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gửi thử
                  </button>
                )}
              </div>
            </>
          )}
          {state.devices.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-500 mb-1">Thiết bị đã bật ({state.devices.length})</p>
              <ul className="space-y-1">
                {state.devices.map(d => (
                  <li key={d.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 min-w-0 truncate" title={d.lastSentAt ? `Gửi gần nhất: ${d.lastSentAt.replace('T', ' ')}` : 'Chưa gửi tin nào'}>
                      {d.label || 'Thiết bị'}{d.current ? ' (thiết bị này)' : ''} · {d.scope === 'all' ? 'tất cả' : 'tổ mình'}
                    </span>
                    <button type="button" className={btnGhost} aria-label={`Gỡ ${d.label || 'thiết bị'}`} onClick={() => remove(d.id)} disabled={!!busy}>
                      {busy === `rm:${d.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
