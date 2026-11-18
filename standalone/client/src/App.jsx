import React, { useCallback, useEffect, useState } from 'react';
import { EvnMark, IconMeter } from '@dkct/components/powerIcons.jsx';
import { ClipboardCheck, LogOut, UserRound, Loader2, Hourglass, X, House } from 'lucide-react';
import DkctModule from '@dkct/index.jsx';
import { btnPrimary, btnSecondary, btnGhost, inputCls, inputBorder } from '@dkct/components/ui.jsx';
import { loadTheme, themeClass, THEME_EVENT } from '@dkct/lib/theme.js';
import ModalOverlay from './ui/ModalOverlay.jsx';
import EmptyState from './ui/EmptyState.jsx';
import FeedbackHost from './ui/FeedbackHost.jsx';
import { notify, confirmAction } from './ui/feedback.js';
import { initSupabase, getSupabase, apiFetch, appApi, downloadAuthenticatedFile } from './api.js';
import Login from './Login.jsx';
import AdminPanel, { DEFAULT_ADMIN_SECTION, isPending } from './AdminPanel.jsx';

// Dịch vụ cho module ĐKCT, giống ChatLan cung cấp (xem ../../client/index.jsx).
// features: bản độc lập đưa Cài đặt vào trang Quản trị; không có giấy của module ĐKCT cũ trong ChatLan nên ẩn Giấy cũ.
const services = { apiFetch, downloadAuthenticatedFile, notify, confirmAction, ModalOverlay, EmptyState, features: { settingsTab: false, legacy: false } };

// trang đang mở theo địa chỉ: #quan-tri/<mục> là trang Quản trị, còn lại là trang chính (nút Back của trình duyệt dùng được)
const ADMIN_HASH = '#quan-tri';
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((next) => {
    if (next) { window.location.hash = next; return; }
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    setHash('');
  }, []);
  const admin = hash === ADMIN_HASH || hash.startsWith(`${ADMIN_HASH}/`);
  const section = admin ? decodeURIComponent(hash.slice(ADMIN_HASH.length + 1)) || DEFAULT_ADMIN_SECTION : null;
  return { view: admin ? 'admin' : 'dkct', section, go };
}
// mục Quản trị mở gần nhất: lần sau bấm "Quản trị" mở lại đúng mục đó
const ADMIN_SECTION_KEY = 'dkct.admin.section';
const lastAdminSection = () => { try { return localStorage.getItem(ADMIN_SECTION_KEY) || DEFAULT_ADMIN_SECTION; } catch { return DEFAULT_ADMIN_SECTION; } };
const rememberAdminSection = (slug) => { try { localStorage.setItem(ADMIN_SECTION_KEY, slug); } catch { /* trình duyệt chặn bộ nhớ */ } };

/** Hồ sơ: họ tên, chức danh, điện thoại dùng cho mục "người đại diện" trên giấy. */
function ProfileDialog({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ fullName: user.fullName || '', position: user.position || '', phone: user.phone || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { onSaved((await appApi('/me', { method: 'PUT', body: form })).user); notify('Đã lưu hồ sơ.', 'success'); onClose(); } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  };
  const field = (k, label, props = {}) => (
    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{label}
      <input className={`${inputCls} ${inputBorder()} mt-1`} value={form[k]} onChange={set(k)} {...props} />
    </label>
  );
  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-[100] bg-slate-900/40 flex items-center justify-center p-4">
      <form onSubmit={save} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Hồ sơ của tôi</h2>
          <button type="button" className={btnGhost} aria-label="Đóng" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500">{user.email}{user.department ? ` · ${user.department}` : ''}</p>
        {field('fullName', 'Họ tên', { autoComplete: 'name' })}
        {field('position', 'Chức danh', { placeholder: 'vd Tổ trưởng, Kỹ sư' })}
        {field('phone', 'Điện thoại', { autoComplete: 'tel' })}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnSecondary} onClick={onClose}>Hủy</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Lưu</button>
        </div>
      </form>
    </ModalOverlay>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [me, setMe] = useState(null);
  const { view, section, go } = useHashRoute();
  const [pending, setPending] = useState(0); // số người chờ xếp đơn vị: huy hiệu ở nút Quản trị
  const [profileOpen, setProfileOpen] = useState(false);
  const [bootError, setBootError] = useState('');
  // bản độc lập: thanh trên cùng đổi theo giao diện chọn trong module
  const [theme, setTheme] = useState(() => loadTheme(localStorage));
  useEffect(() => {
    const on = (e) => setTheme(e.detail);
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);

  useEffect(() => {
    let sub;
    initSupabase().then(async (supabase) => {
      setSession((await supabase.auth.getSession()).data.session);
      sub = supabase.auth.onAuthStateChange((_event, s) => setSession(s)).data.subscription;
      setReady(true);
    }).catch(err => setBootError(err.message));
    return () => sub?.unsubscribe();
  }, []);

  const loadMe = useCallback(async () => {
    try { setMe((await appApi('/me')).user); } catch (err) { if (err.status !== 401) notify(err.message, 'error'); }
  }, []);
  useEffect(() => { if (session) loadMe(); else setMe(null); }, [session?.user?.id, loadMe]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdminUser = me?.role === 'admin';
  const loadPending = useCallback(async () => {
    try { setPending((await appApi('/users')).items.filter(isPending).length); } catch { /* chỉ là huy hiệu, lỗi thì bỏ qua */ }
  }, []);
  useEffect(() => { if (isAdminUser) loadPending(); else setPending(0); }, [isAdminUser, loadPending]);
  const onAdminChanged = useCallback(() => { loadMe(); loadPending(); }, [loadMe, loadPending]);

  const logout = useCallback(() => getSupabase()?.auth.signOut(), []);
  useEffect(() => {
    window.addEventListener('dkct:unauthorized', logout);
    return () => window.removeEventListener('dkct:unauthorized', logout);
  }, [logout]);

  let body;
  if (bootError) body = <EmptyState icon={ClipboardCheck} title="Không kết nối được máy chủ" description={bootError} />;
  else if (!ready || (session && !me)) body = <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-chatlan-600" aria-label="Đang tải" /></div>;
  else if (!session) body = <Login />;
  else {
    const isAdmin = me.role === 'admin';
    const waiting = !me.department && !isAdmin;
    body = (
      <div className={`h-full flex flex-col ${themeClass(theme)}`}>
        <header className="flex items-center gap-2 px-4 py-2 bg-chatlan-600 text-white">
          <EvnMark className="w-7 h-7 flex-shrink-0" />
          {/* trang chính: tên ứng dụng đã ở đầu module, thanh này chỉ ghi đơn vị; trang Quản trị / chờ xếp đơn vị: ghi tên ứng dụng */}
          <span className="font-bold text-sm flex-1 truncate">{view === 'dkct' && !waiting ? (me.department || 'EVNNPT') : `Chuẩn bị công tác${me.department ? ` · ${me.department}` : ''}`}</span>
          {isAdmin && (
            view === 'admin' ? (
              <button type="button" onClick={() => go('')} title="Về trang chính"
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-white text-chatlan-700">
                <House className="w-4 h-4" aria-hidden="true" /> Trang chính
              </button>
            ) : (
              <button type="button" onClick={() => go(`${ADMIN_HASH}/${pending ? DEFAULT_ADMIN_SECTION : lastAdminSection()}`)}
                title={pending ? `Quản trị: ${pending} người chờ xếp đơn vị` : 'Quản trị: người dùng, đơn vị, cài đặt'}
                className="relative px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-white/15">
                <IconMeter className="w-4 h-4" /> <span className="sr-only sm:not-sr-only">Quản trị</span>
                {pending > 0 && (
                  <span className="min-w-[1.125rem] px-1 rounded-full bg-amber-400 text-[11px] font-bold leading-[1.125rem] text-slate-900 text-center">
                    {pending}<span className="sr-only"> người chờ xếp đơn vị</span>
                  </span>
                )}
              </button>
            )
          )}
          <button type="button" onClick={() => setProfileOpen(true)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-white/15"
            title={me.email}>
            <UserRound className="w-4 h-4" /> <span className="hidden sm:inline max-w-[10rem] truncate">{me.fullName || me.email}</span>
          </button>
          <button type="button" onClick={async () => { if (await confirmAction({ message: 'Đăng xuất khỏi ứng dụng?', confirmLabel: 'Đăng xuất' })) logout(); }}
            className="p-1.5 rounded-lg hover:bg-white/15" aria-label="Đăng xuất" title="Đăng xuất">
            <LogOut className="w-4 h-4" />
          </button>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto">
          {view === 'admin' && isAdmin ? (
            <AdminPanel me={me} section={section} services={services} onChanged={onAdminChanged}
              onSection={(slug) => { rememberAdminSection(slug); go(`${ADMIN_HASH}/${slug}`); }} />
          )
            : waiting ? (
              <EmptyState icon={Hourglass} title="Đang chờ quản trị viên xếp đơn vị"
                description="Tài khoản đã tạo. Khi quản trị viên xếp bạn vào đơn vị, tải lại trang để bắt đầu dùng.">
                <button type="button" className={btnSecondary} onClick={loadMe}>Tải lại</button>
                <button type="button" className={btnSecondary} onClick={() => setProfileOpen(true)}>Cập nhật hồ sơ</button>
              </EmptyState>
            ) : <DkctModule services={services} />}
        </main>
        {profileOpen && <ProfileDialog user={me} onClose={() => setProfileOpen(false)} onSaved={setMe} />}
      </div>
    );
  }

  return (
    <>
      {body}
      <FeedbackHost />
    </>
  );
}
