import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { EvnMark, StarField, IconIsolatorOpen, IconPylon, IconSafetyPlan, IconPermit, IconEnergize } from '@dkct/components/powerIcons.jsx';
import { loadTheme, themeClass } from '@dkct/lib/theme.js';
import { useBrandFont } from '@dkct/lib/brandFont.js';
import { inputCls, inputBorder } from '@dkct/components/ui.jsx';
import { getSupabase } from './api.js';

const MESSAGES = {
  'Invalid login credentials': 'Sai email hoặc mật khẩu.',
  'Email not confirmed': 'Email chưa được xác nhận. Mở thư xác nhận Supabase gửi tới email của bạn.',
  'User already registered': 'Email này đã đăng ký, hãy đăng nhập.'
};
const vi = (err) => MESSAGES[err?.message] || err?.message || 'Có lỗi xảy ra.';

// luồng công việc vẽ như một ngăn lộ trên sơ đồ một sợi: từ thanh cái, qua từng thiết bị, đến khi đủ điều kiện đóng điện
const BAY = [
  { Icon: IconIsolatorOpen, label: 'Lịch cắt điện', tone: 'open' },
  { Icon: IconPylon, label: 'Khảo sát hiện trường' },
  { Icon: IconSafetyPlan, label: 'Phương án, biện pháp an toàn' },
  { Icon: IconPermit, label: 'Đăng ký công tác' },
  { Icon: IconEnergize, label: 'Xác nhận đủ điều kiện đóng điện', tone: 'live' }
];

function WorkflowBay() {
  return (
    <div className="dkct-bay relative mt-12 hidden md:block">
      <div className="dkct-bay-bus h-1.5 w-56 rounded-[1px] bg-white" aria-hidden="true" />
      <span className="dkct-bay-feeder absolute left-[23px] top-1.5 bottom-6 w-0.5 bg-white/45" aria-hidden="true" />
      <ol className="relative space-y-4 pt-5" aria-label="Các bước của luồng công việc">
        {BAY.map(({ Icon, label, tone }, i) => (
          <li key={label} className="grid grid-cols-[48px_1fr] items-center gap-4" style={{ '--i': i }}>
            <span className={`dkct-bay-node ${tone ? `dkct-bay-node-${tone}` : ''} grid h-12 w-12 place-items-center rounded-full`}>
              <Icon className="h-6 w-6" />
            </span>
            <span className="text-[15px] font-medium leading-snug text-white/90">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Đăng nhập / đăng ký bằng email + mật khẩu (Supabase Auth). */
export default function Login() {
  const theme = loadTheme(localStorage);
  useBrandFont(theme === 'evnnpt');
  const [mode, setMode] = useState('login'); // login | register
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    const email = form.email.trim();
    if (mode === 'register' && !form.fullName.trim()) return setError('Nhập họ tên.');
    if (form.password.length < 6) return setError('Mật khẩu tối thiểu 6 ký tự.');
    setBusy(true);
    try {
      const auth = getSupabase().auth;
      if (mode === 'login') {
        const { error: err } = await auth.signInWithPassword({ email, password: form.password });
        if (err) throw err;
      } else {
        const { data, error: err } = await auth.signUp({
          email, password: form.password, options: { data: { full_name: form.fullName.trim() } }
        });
        if (err) throw err;
        if (!data.session) {
          setInfo('Đã đăng ký. Mở thư xác nhận gửi tới email rồi quay lại đăng nhập.');
          setMode('login');
        }
      }
    } catch (err) {
      setError(vi(err));
    } finally {
      setBusy(false);
    }
  };

  const register = mode === 'register';
  const label = 'block text-sm font-medium text-slate-700 dark:text-slate-200';
  const field = `${inputCls} ${inputBorder()} mt-1.5 py-2.5 text-[15px]`;
  return (
    <div className={`dkct-login min-h-full grid grid-rows-[auto_1fr] md:grid-rows-1 bg-white dark:bg-slate-950 md:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] ${themeClass(theme)}`}>
      <section className="relative isolate overflow-hidden bg-chatlan-600 px-6 py-7 text-white md:px-14 md:py-12 lg:px-20" aria-labelledby="dkct-login-title">
        <StarField fit="meet" className="pointer-events-none absolute -z-10 bottom-0 right-0 h-2/3 w-full text-white opacity-[0.07]" />
        <div className="flex items-center gap-3">
          <EvnMark className="h-10 w-10 shrink-0" />
          <span className="text-sm font-semibold text-white/85">EVNNPT</span>
        </div>
        <div className="md:mt-16 lg:mt-24">
          <h1 id="dkct-login-title" className="mt-5 text-[28px] font-bold leading-[1.1] tracking-[-0.02em] md:mt-0 md:text-[44px]">
            Chuẩn bị công tác
          </h1>
          <p className="mt-3 max-w-[38ch] [text-wrap:pretty] text-[15px] leading-relaxed text-white/75 md:mt-4 md:text-base">
            Lập hồ sơ cho từng công việc trên lưới truyền tải, từ lịch cắt điện đến giấy xác nhận đủ điều kiện đóng điện.
          </p>
          <WorkflowBay />
        </div>
      </section>

      <main className="flex items-start justify-center px-6 py-8 md:items-center md:px-12 md:py-10">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.01em] text-slate-900 dark:text-white">{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {register
                ? 'Sau khi đăng ký, quản trị viên xếp bạn vào đơn vị để bắt đầu dùng.'
                : 'Dùng email bạn đã đăng ký với ứng dụng.'}
            </p>
          </div>

          {register && (
            <label className={label}>Họ tên
              <input className={field} value={form.fullName} onChange={set('fullName')} autoComplete="name" />
            </label>
          )}
          <label className={label}>Email
            <input type="email" required inputMode="email" className={field} value={form.email} onChange={set('email')} autoComplete="email" />
          </label>
          <div>
            <label htmlFor="dkct-password" className={label}>Mật khẩu</label>
            <div className="relative">
              <input id="dkct-password" type={showPassword ? 'text' : 'password'} required className={`${field} pr-11`} value={form.password} onChange={set('password')}
                autoComplete={register ? 'new-password' : 'current-password'} />
              <button type="button" onClick={() => setShowPassword(v => !v)} aria-pressed={showPassword}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-1 top-1/2 mt-[3px] grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100">
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            {register && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Tối thiểu 6 ký tự.</p>}
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300" role="alert">{error}</p>}
          {info && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300" role="status">{info}</p>}

          <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-chatlan-600 px-4 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:bg-chatlan-700 disabled:opacity-60" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? (register ? 'Đang đăng ký…' : 'Đang đăng nhập…') : register ? 'Đăng ký' : 'Đăng nhập'}
          </button>

          <div className="space-y-1.5 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <p>
              {register ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
              <button type="button" className="font-semibold text-chatlan-600 hover:underline dark:text-chatlan-300"
                onClick={() => { setMode(register ? 'login' : 'register'); setError(''); setInfo(''); }}>
                {register ? 'Đăng nhập' : 'Đăng ký'}
              </button>
            </p>
            {!register && <p className="text-slate-500">Quên mật khẩu: nhờ quản trị viên đặt lại.</p>}
          </div>
        </form>
      </main>
    </div>
  );
}
