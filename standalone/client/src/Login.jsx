import React, { useState } from 'react';
import { FileSignature, Loader2, LogIn, UserPlus } from 'lucide-react';
import { btnPrimary, inputCls, inputBorder } from '@dkct/components/ui.jsx';
import { getSupabase } from './api.js';

const MESSAGES = {
  'Invalid login credentials': 'Sai email hoặc mật khẩu.',
  'Email not confirmed': 'Email chưa được xác nhận. Mở thư xác nhận Supabase gửi tới email của bạn.',
  'User already registered': 'Email này đã đăng ký, hãy đăng nhập.'
};
const vi = (err) => MESSAGES[err?.message] || err?.message || 'Có lỗi xảy ra.';

/** Đăng nhập / đăng ký bằng email + mật khẩu (Supabase Auth). */
export default function Login() {
  const [mode, setMode] = useState('login'); // login | register
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
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
  return (
    <div className="min-h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-chatlan-50 text-chatlan-600 flex items-center justify-center">
            <FileSignature className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Đăng ký công tác</h1>
            <p className="text-xs text-slate-500">{register ? 'Tạo tài khoản mới' : 'Đăng nhập để tiếp tục'}</p>
          </div>
        </div>

        {register && (
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Họ tên
            <input className={`${inputCls} ${inputBorder()} mt-1`} value={form.fullName} onChange={set('fullName')} autoComplete="name" />
          </label>
        )}
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Email
          <input type="email" required className={`${inputCls} ${inputBorder()} mt-1`} value={form.email} onChange={set('email')} autoComplete="email" />
        </label>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Mật khẩu
          <input type="password" required className={`${inputCls} ${inputBorder()} mt-1`} value={form.password} onChange={set('password')}
            autoComplete={register ? 'new-password' : 'current-password'} />
        </label>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        {info && <p className="text-sm text-emerald-700" role="status">{info}</p>}

        <button type="submit" className={`${btnPrimary} w-full justify-center py-2.5 text-sm`} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : register ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
          {register ? 'Đăng ký' : 'Đăng nhập'}
        </button>
        <p className="text-xs text-center text-slate-500">
          {register ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
          <button type="button" className="font-semibold text-chatlan-600 hover:underline" onClick={() => { setMode(register ? 'login' : 'register'); setError(''); }}>
            {register ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </p>
        {!register && <p className="text-[11px] text-center text-slate-400">Quên mật khẩu: nhờ quản trị viên đặt lại.</p>}
      </form>
    </div>
  );
}
