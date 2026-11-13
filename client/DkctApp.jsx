import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import { EvnMark, StarField, IconBusbar, IconMeter, IconFileStack, IconIsolatorOpen, IconHelmet } from './components/powerIcons.jsx';
import { useDkct } from './context.jsx';
import { TabButton, btnPrimary, btnGhost } from './components/ui.jsx';
import RegistrationList from './components/RegistrationList.jsx';
import OutagePanel from './components/OutagePanel.jsx';
import SurveyList from './components/SurveyList.jsx';
import PlanList from './components/PlanList.jsx';
import ConfirmationList from './components/ConfirmationList.jsx';
import WorkList from './components/WorkList.jsx';
import WorkflowBar, { WorkflowMini } from './components/WorkflowBar.jsx';
import { APP_NAME, linkedIds, WORKFLOW_STEPS } from './lib/workflow.js';
import { defaultWorkload, planFromSurvey, registrationFromPlan } from './lib/plan.js';
import { confirmationFromPlan } from './lib/confirmation.js';
import { fromSaved } from './lib/form.js';
import { loadTheme, saveTheme, themeClass } from './lib/theme.js';
import ThemePicker from './components/ThemePicker.jsx';
import PushButton from './components/PushButton.jsx';
import { receiveOpenRequests, takeOpenRequest, OPEN_EVENT } from './lib/push.js';
import HelpAboutButtons from './components/HelpAbout.jsx';
import { reloadHint, refreshedLabel } from './lib/help.js';
import { usePersistentState } from './lib/persist.js';
import './dkct-theme.css';
import { emptyRep, qlvhRoleFor, registrationFromSurvey, withQlvhFor } from './lib/survey.js';

// tải khi cần: biểu mẫu soạn thảo và các trang ít dùng (trang đầu mở nhanh hơn)
const RegistrationEditor = lazy(() => import('./components/RegistrationEditor.jsx'));
const CatalogPanel = lazy(() => import('./components/CatalogPanel.jsx'));
const SettingsPanel = lazy(() => import('./components/SettingsPanel.jsx'));
const LegacyPanel = lazy(() => import('./components/LegacyPanel.jsx'));
const SurveyEditor = lazy(() => import('./components/SurveyEditor.jsx'));
const PlanEditor = lazy(() => import('./components/PlanEditor.jsx'));
const ConfirmationEditor = lazy(() => import('./components/ConfirmationEditor.jsx'));
const WorkEditor = lazy(() => import('./components/WorkEditor.jsx'));

const TABS = ['outages', 'surveys', 'plans', 'registrations', 'confirmations', 'catalogs', 'settings', 'legacy'];

const EMPTY_WORK = {
  recipient: {},
  workContent: { text: '', source: 'manual' },
  workLocation: '',
  condition: { text: '', source: 'manual' },
  time: { start: '', end: '', source: 'manual' },
  leader: null
};

// chữ Be Vietnam Pro cho giao diện EVNNPT: nạp một lần khi cần (mất mạng thì dùng phông hệ thống)
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap';
function useBrandFont(enabled) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || document.querySelector('link[data-dkct-font]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    link.dataset.dkctFont = '1';
    document.head.appendChild(link);
  }, [enabled]);
}

const PageLoading = () => (
  <div className="flex items-center gap-2 p-4 text-sm text-slate-500" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Đang tải…</div>
);

export default function DkctApp() {
  const { api, notify } = useDkct();
  // tab đang mở, gốc luồng (Lịch / Công việc) nhớ theo trình duyệt: tải lại trang vẫn ở chỗ cũ
  const [tab, setTab] = usePersistentState('dkct.tab', 'outages', TABS);
  // giao diện: EVNNPT (mặc định) | ChatLan | Chuyên nghiệp — nhớ theo trình duyệt
  const [theme, setTheme] = useState(() => loadTheme(typeof localStorage === 'undefined' ? null : localStorage));
  const chooseTheme = (id) => { setTheme(id); saveTheme(typeof localStorage === 'undefined' ? null : localStorage, id); };
  useBrandFont(theme === 'evnnpt');
  const [meta, setMeta] = useState(null);
  const [catalogs, setCatalogs] = useState({ personnel: [], stations: [], substations: [], drawings: [], duties: [], risks: [] });
  const [editor, setEditor] = useState(null); // { initial, registration, outage }
  const [reloadKey, setReloadKey] = useState(0);
  const [opening, setOpening] = useState(false);
  // hồ sơ đang theo dõi luồng { type, id } và các hồ sơ cùng luồng (kết quả /workflow)
  const [selection, setSelection] = useState(null);
  const [chain, setChain] = useState(null);
  // bước 1: danh sách lịch cắt điện hoặc công việc không có lịch cắt điện
  const [firstView, setFirstView] = usePersistentState('dkct.firstView', 'outages', ['outages', 'works']);
  const track = (type, item) => setSelection(s => (s?.type === type && s.id === item.id ? null : { type, id: item.id }));
  const follow = (type, item) => {
    if (!item?.id) return;
    setSelection({ type, id: item.id });
    if (type === 'work') setFirstView('works');
  };

  useEffect(() => {
    if (!selection) { setChain(null); return undefined; }
    let alive = true;
    api.get(`/workflow/${selection.type}/${encodeURIComponent(selection.id)}`)
      .then(r => { if (alive) setChain(r); })
      .catch(() => { if (alive) { setChain(null); setSelection(null); } }); // hồ sơ đã xóa / không còn quyền xem
    return () => { alive = false; };
  }, [api, selection, reloadKey]);

  // bấm thông báo đẩy "lịch cắt điện thay đổi": mở tab Lịch cắt điện, tới các dòng đó (OutagePanel focus)
  const [outageFocus, setOutageFocus] = useState(null); // { list: [{ id, day }], at }
  useEffect(() => {
    const off = receiveOpenRequests();
    const open = () => {
      const list = takeOpenRequest();
      if (!list.length) return;
      setTab('outages');
      setFirstView('outages');
      setOutageFocus({ list, at: Date.now() });
    };
    open();
    window.addEventListener(OPEN_EVENT, open);
    return () => { off(); window.removeEventListener(OPEN_EVENT, open); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMeta = useCallback(() => api.get('/meta').then(setMeta).catch(err => notify(err.message, 'error')), [api, notify]);
  const loadCatalog = useCallback(async (name) => {
    // "drawings": danh sách bản vẽ trạm (chỉ thông tin, không kèm file)
    const { items } = await api.get(name === 'drawings' ? '/substation-drawings' : `/${name}`);
    setCatalogs(c => ({ ...c, [name]: items }));
  }, [api]);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const loadAll = useCallback(() => Promise.all([
    loadMeta(),
    Promise.all(['personnel', 'stations', 'substations', 'drawings', 'duties', 'risks'].map(loadCatalog)).catch(err => notify(err.message, 'error'))
  ]).then(() => setRefreshedAt(new Date())), [loadMeta, loadCatalog, notify]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // nút Tải lại: danh mục + quyền, danh sách của tab đang mở và luồng đang theo dõi (reloadKey);
  // vòng xoay quay ít nhất 0,6 giây để thấy đã bấm, không bấm chồng khi đang tải
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const started = Date.now();
    setReloadKey(k => k + 1);
    try { await loadAll(); } finally {
      setTimeout(() => setRefreshing(false), Math.max(0, 600 - (Date.now() - started)));
    }
  };

  const withOpening = async (fn) => {
    setOpening(true);
    try { await fn(); } catch (err) { notify(err.message, 'error'); } finally { setOpening(false); }
  };

  const openNew = () => setEditor({ initial: fromSaved({ ...meta.defaults, ...EMPTY_WORK }), registration: null, outage: null });
  const openFromOutage = (outage) => withOpening(async () => {
    const { draft } = await api.get(`/outages/${outage.id}/draft`);
    setEditor({ initial: fromSaved(draft), registration: null, outage });
  });
  const openExisting = (item) => withOpening(async () => {
    follow('registration', item);
    const { registration } = await api.get(`/registrations/${item.id}`);
    setEditor({ initial: fromSaved(registration.data), registration, outage: null });
  });

  // Biên bản khảo sát hiện trường: form mới có sẵn một dòng đại diện QLVH để điền
  const [surveyEditor, setSurveyEditor] = useState(null); // { initial, survey }
  const surveyForm = (draft) => {
    const unit = catalogs.stations.find(u => u.id === draft.station?.qlvhUnitId);
    return {
      ...draft,
      qlvhReps: draft.qlvhReps?.length ? draft.qlvhReps
        : unit ? withQlvhFor([], '', unit.name, unit.leaderName) : [{ ...emptyRep(), role: qlvhRoleFor(draft.station?.name) }],
      scopeItems: draft.scopeItems?.length ? draft.scopeItems : ['']
    };
  };
  const openNewSurvey = () => withOpening(async () => {
    const { draft } = await api.get('/survey-defaults');
    setSurveyEditor({ initial: surveyForm(draft), survey: null });
  });
  const openSurveyFromOutage = (outage) => withOpening(async () => {
    const { draft } = await api.get(`/outages/${outage.id}/survey-draft`);
    setSurveyEditor({ initial: surveyForm(draft), survey: null });
  });
  const openSurvey = (item) => withOpening(async () => {
    follow('survey', item);
    const { survey } = await api.get(`/surveys/${item.id}`);
    setSurveyEditor({ initial: surveyForm(survey.data), survey });
  });
  // Phương án thi công, biện pháp an toàn
  const [planEditor, setPlanEditor] = useState(null); // { initial, plan, numberPreview }
  const planForm = (draft) => {
    const unit = catalogs.stations.find(u => u.id === draft.station?.qlvhUnitId);
    const f = { ...draft, station: { ...draft.station, qlvhShort: draft.station?.qlvhShort || unit?.shortName || '' } };
    // nơi nhận điền khi mở bước "Ký duyệt · Nơi nhận" (lúc đó đã chọn trạm, khu vực truyền tải)
    return { ...f, workloads: f.workloads?.length ? f.workloads : (f.bays ? [defaultWorkload(f)] : []) };
  };
  const openNewPlan = (fromSurvey = null) => withOpening(async () => {
    const { draft, numbering } = await api.get('/plan-defaults');
    let initial = draft;
    if (fromSurvey) initial = planFromSurvey(draft, (await api.get(`/surveys/${fromSurvey.id}`)).survey);
    setPlanEditor({ initial: planForm(initial), plan: null, numberPreview: numbering.preview });
  });
  const openPlanFromOutage = (outage) => withOpening(async () => {
    const [{ draft }, { numbering }] = await Promise.all([api.get(`/outages/${outage.id}/plan-draft`), api.get('/plan-numbering')]);
    setPlanEditor({ initial: planForm(draft), plan: null, numberPreview: numbering.preview });
  });
  const openPlan = (item) => withOpening(async () => {
    follow('plan', item);
    const { plan } = await api.get(`/plans/${item.id}`);
    setPlanEditor({ initial: planForm(plan.data), plan, numberPreview: plan.docNumber });
  });

  // Giấy xác nhận đủ điều kiện đóng điện: lập mới, từ một giấy ĐKCT hoặc một dòng lịch cắt điện
  const [confirmationEditor, setConfirmationEditor] = useState(null); // { initial, confirmation, numberPreview }
  const openNewConfirmation = () => withOpening(async () => {
    const { draft, numbering } = await api.get('/confirmation-defaults');
    setConfirmationEditor({ initial: draft, confirmation: null, numberPreview: numbering.preview });
  });
  const openConfirmationFrom = (draftUrl) => withOpening(async () => {
    const [{ draft }, { numbering }] = await Promise.all([api.get(draftUrl), api.get('/confirmation-numbering')]);
    // có phương án (giấy ĐKCT lập từ phương án / phương án của dòng lịch): lấy luôn hạng mục của phương án đó
    let initial = draft;
    if (draft.planId) initial = confirmationFromPlan(draft, (await api.get(`/plans/${draft.planId}`)).plan);
    setConfirmationEditor({ initial, confirmation: null, numberPreview: numbering.preview });
  });
  const openConfirmationFromRegistration = (item) => openConfirmationFrom(`/registrations/${item.id}/confirmation-draft`);
  const openConfirmationFromOutage = (outage) => openConfirmationFrom(`/outages/${outage.id}/confirmation-draft`);
  const openConfirmation = (item) => withOpening(async () => {
    follow('confirmation', item);
    const { confirmation } = await api.get(`/confirmations/${item.id}`);
    setConfirmationEditor({ initial: confirmation.data, confirmation, numberPreview: confirmation.docNumber });
  });

  const registrationFromSurveyItem = (item) => withOpening(async () => {
    const { survey } = await api.get(`/surveys/${item.id}`);
    const fromSurvey = registrationFromSurvey(survey.data, survey.id);
    const initial = fromSaved({
      ...meta.defaults, ...EMPTY_WORK, ...fromSurvey,
      header: { ...meta.defaults.header, ...fromSurvey.header }
    });
    setEditor({ initial, registration: null, outage: null });
  });
  const registrationFromPlanItem = (item) => withOpening(async () => {
    const { plan } = await api.get(`/plans/${item.id}`);
    const fromPlan = registrationFromPlan(plan);
    const initial = fromSaved({
      ...meta.defaults, ...EMPTY_WORK, ...fromPlan,
      header: { ...meta.defaults.header, ...fromPlan.header }
    });
    setEditor({ initial, registration: null, outage: null });
  });

  // Công việc không có lịch cắt điện: thêm/sửa, lập biên bản KSHT / phương án / giấy ĐKCT điền sẵn từ công việc
  const [workEditor, setWorkEditor] = useState(null); // { initial, work }
  const openNewWork = () => withOpening(async () => {
    const { draft } = await api.get('/work-defaults');
    setWorkEditor({ initial: draft, work: null });
  });
  const openWork = (item) => withOpening(async () => {
    follow('work', item);
    const { work } = await api.get(`/works/${item.id}`);
    setWorkEditor({ initial: work, work });
  });
  const openSurveyFromWork = (work) => withOpening(async () => {
    const { draft } = await api.get(`/works/${work.id}/survey-draft`);
    setSurveyEditor({ initial: surveyForm(draft), survey: null });
  });
  const openPlanFromWork = (work) => withOpening(async () => {
    const { draft, numbering } = await api.get(`/works/${work.id}/plan-draft`);
    setPlanEditor({ initial: planForm(draft), plan: null, numberPreview: numbering.preview });
  });
  const openRegistrationFromWork = (work) => withOpening(async () => {
    const { draft } = await api.get(`/works/${work.id}/draft`);
    setEditor({ initial: fromSaved(draft), registration: null, outage: null });
  });

  const permissions = meta?.permissions || {};
  // trang Cài đặt chỉ admin; quyền đổi (đăng nhập tài khoản khác) thì quay về Lịch cắt điện
  useEffect(() => { if (meta && tab === 'settings' && !permissions.isAdmin) setTab('outages'); }, [meta, tab, permissions.isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  // nút chính đầu trang theo tab; Danh mục, Cài đặt, Giấy cũ không có
  const PRIMARY = {
    outages: firstView === 'works' ? { label: 'Thêm công việc', onClick: openNewWork } : { label: 'Lập giấy mới', onClick: openNew },
    surveys: { label: 'Lập biên bản', onClick: openNewSurvey },
    plans: { label: 'Lập phương án', onClick: () => openNewPlan() },
    registrations: { label: 'Lập giấy mới', onClick: openNew },
    confirmations: { label: 'Lập giấy xác nhận', onClick: openNewConfirmation }
  };
  const primary = permissions.canCreate ? PRIMARY[tab] : null;
  // phím tắt: Alt+1…5 mở bước của luồng, Alt+N bấm nút chính (lập mới) — chỉ khi chưa mở biểu mẫu nào
  const anyEditor = Boolean(editor || surveyEditor || planEditor || confirmationEditor || workEditor);
  const shortcut = React.useRef(null);
  shortcut.current = { anyEditor, primary, ready: Boolean(meta) };
  useEffect(() => {
    const onKey = (e) => {
      const cur = shortcut.current;
      if (!e.altKey || e.ctrlKey || e.metaKey || cur.anyEditor) return;
      const step = WORKFLOW_STEPS[Number(e.key) - 1];
      if (step) { e.preventDefault(); setTab(step.tab); return; }
      if ((e.key === 'n' || e.key === 'N') && cur.primary && cur.ready) { e.preventDefault(); cur.primary.onClick(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = linkedIds(chain);
  const pick = (type) => ({ selectedId: selection?.type === type ? selection.id : null, linked, onTrack: (item) => track(type, item) });
  return (
    <div className={`h-full flex flex-col bg-slate-50 dark:bg-slate-950 ${themeClass(theme)}`} data-dkct-theme={theme}>
      <div data-dkct-header className="relative isolate px-4 pt-4 pb-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="dkct-starfield pointer-events-none absolute top-0 right-0 h-16 w-[min(360px,40%)] -z-10 overflow-hidden" aria-hidden="true">
          <StarField className="w-full h-full" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <EvnMark className="w-10 h-10 flex-shrink-0" />
            <div>
              <h1 data-dkct-title className="text-base font-bold text-slate-900 dark:text-white">{APP_NAME}</h1>
              <WorkflowMini tab={tab} onTab={setTab} chain={chain} selection={selection} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {opening && (
              <span className="inline-flex items-center gap-1 text-xs text-chatlan-700 dark:text-chatlan-300" role="status" title="Đang lấy dữ liệu để mở biểu mẫu…">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /><span className="hidden sm:inline">Đang mở…</span>
              </span>
            )}
            {primary && (
              <button type="button" className={btnPrimary} onClick={primary.onClick} disabled={!meta} title={`${primary.label} (Alt+N)`} aria-keyshortcuts="Alt+N"><Plus className="w-4 h-4" /> {primary.label}</button>
            )}
            <HelpAboutButtons tab={tab} />
            <PushButton />
            <ThemePicker value={theme} onChange={chooseTheme} />
            <button type="button" className={`${btnGhost} inline-flex items-center gap-1.5 disabled:opacity-70`} onClick={refresh} disabled={refreshing}
              aria-label={refreshing ? 'Đang tải lại' : 'Tải lại dữ liệu'} title={reloadHint(tab, firstView, refreshedAt)}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-chatlan-600' : ''}`} aria-hidden="true" />
              {refreshedAt && (
                <span className="hidden lg:inline text-[11px] text-slate-400 dark:text-slate-500 tabular-nums" aria-live="polite">
                  {refreshing ? 'Đang tải…' : refreshedLabel(refreshedAt)}
                </span>
              )}
            </button>
          </div>
        </div>
        <WorkflowBar tab={tab} onTab={setTab} chain={chain} selection={selection} onClearSelection={() => setSelection(null)}
          extraTabs={<>
            <TabButton icon={IconBusbar} active={tab === 'catalogs'} onClick={() => setTab('catalogs')}>Danh mục</TabButton>
            {permissions.isAdmin && <TabButton icon={IconMeter} active={tab === 'settings'} onClick={() => setTab('settings')}>Cài đặt</TabButton>}
            <TabButton icon={IconFileStack} active={tab === 'legacy'} onClick={() => setTab('legacy')}>Giấy cũ</TabButton>
          </>} />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4">
        {tab === 'registrations' && (
          <RegistrationList {...pick('registration')} reloadKey={reloadKey} onOpen={openExisting} numbering={meta?.numbering}
            canCreate={permissions.canCreate} onNumberingChanged={loadMeta} onCreateConfirmation={openConfirmationFromRegistration} />
        )}
        {tab === 'confirmations' && <ConfirmationList {...pick('confirmation')} reloadKey={reloadKey} onOpen={openConfirmation} canCreate={permissions.canCreate} />}
        {tab === 'surveys' && (
          <SurveyList {...pick('survey')} reloadKey={reloadKey} onOpen={openSurvey} canCreate={permissions.canCreate} onCreateRegistration={registrationFromSurveyItem}
            onCreatePlan={(item) => openNewPlan(item)} />
        )}
        {tab === 'plans' && <PlanList {...pick('plan')} reloadKey={reloadKey} onOpen={openPlan} canCreate={permissions.canCreate} onCreateRegistration={registrationFromPlanItem} />}
        {tab === 'outages' && (
          <div className="mb-3 inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80" role="group" aria-label="Gốc của luồng">
            <TabButton icon={IconIsolatorOpen} active={firstView === 'outages'} onClick={() => setFirstView('outages')}>Lịch cắt điện</TabButton>
            <TabButton icon={IconHelmet} active={firstView === 'works'} onClick={() => setFirstView('works')}>Công việc không có lịch cắt điện</TabButton>
          </div>
        )}
        {tab === 'outages' && firstView === 'outages' && (
          <OutagePanel {...pick('outage')} reloadKey={reloadKey} canCreate={permissions.canCreate} canPurge={permissions.isAdmin} canConfigure={permissions.isAdmin} onCreateFromOutage={openFromOutage} onCreateSurveyFromOutage={openSurveyFromOutage}
            onCreatePlanFromOutage={openPlanFromOutage} onCreateConfirmationFromOutage={openConfirmationFromOutage} focus={outageFocus} />
        )}
        {tab === 'outages' && firstView === 'works' && (
          <WorkList {...pick('work')} reloadKey={reloadKey} canCreate={permissions.canCreate} onOpen={openWork}
            onCreateSurvey={openSurveyFromWork} onCreatePlan={openPlanFromWork} onCreateRegistration={openRegistrationFromWork} />
        )}
        <Suspense fallback={<PageLoading />}>
        {tab === 'catalogs' && <CatalogPanel catalogs={catalogs} canManage={permissions.canManageCatalog} isAdmin={permissions.isAdmin} onChanged={loadCatalog} />}
        {tab === 'settings' && permissions.isAdmin && <SettingsPanel />}
        {tab === 'legacy' && <LegacyPanel />}
        </Suspense>
      </div>

      <Suspense fallback={null}>
      {editor && (
        <RegistrationEditor
          {...editor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          docNumberPreview={editor.registration?.docNumber || meta?.numbering?.preview || ''}
          onClose={() => setEditor(null)}
          onSaved={(saved) => { follow('registration', saved); setEditor(null); setTab('registrations'); setReloadKey(k => k + 1); loadMeta(); }}
        />
      )}
      {surveyEditor && (
        <SurveyEditor
          {...surveyEditor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          onClose={() => setSurveyEditor(null)}
          onSaved={(saved) => { follow('survey', saved); setSurveyEditor(null); setTab('surveys'); setReloadKey(k => k + 1); }}
        />
      )}
      {confirmationEditor && (
        <ConfirmationEditor
          {...confirmationEditor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          onClose={() => setConfirmationEditor(null)}
          onSaved={(saved) => { follow('confirmation', saved); setConfirmationEditor(null); setTab('confirmations'); setReloadKey(k => k + 1); }}
        />
      )}
      {workEditor && (
        <WorkEditor
          {...workEditor}
          catalogs={catalogs}
          onClose={() => setWorkEditor(null)}
          onSaved={(saved) => { follow('work', saved); setWorkEditor(null); setTab('outages'); setReloadKey(k => k + 1); }}
        />
      )}
      {planEditor && (
        <PlanEditor
          {...planEditor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          onClose={() => setPlanEditor(null)}
          onSaved={(saved) => { follow('plan', saved); setPlanEditor(null); setTab('plans'); setReloadKey(k => k + 1); }}
        />
      )}
      </Suspense>
    </div>
  );
}
