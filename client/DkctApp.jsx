import React, { useCallback, useEffect, useState } from 'react';
import { FileSignature, FileText, Zap, BookUser, Archive, Plus, RefreshCw, Loader2, ClipboardList, FileStack, BadgeCheck } from 'lucide-react';
import { useDkct } from './context.jsx';
import { TabButton, btnPrimary, btnGhost } from './components/ui.jsx';
import RegistrationList from './components/RegistrationList.jsx';
import RegistrationEditor from './components/RegistrationEditor.jsx';
import OutagePanel from './components/OutagePanel.jsx';
import CatalogPanel from './components/CatalogPanel.jsx';
import LegacyPanel from './components/LegacyPanel.jsx';
import SurveyList from './components/SurveyList.jsx';
import SurveyEditor from './components/SurveyEditor.jsx';
import PlanList from './components/PlanList.jsx';
import PlanEditor from './components/PlanEditor.jsx';
import ConfirmationList from './components/ConfirmationList.jsx';
import ConfirmationEditor from './components/ConfirmationEditor.jsx';
import { defaultWorkload, planFromSurvey } from './lib/plan.js';
import { fromSaved } from './lib/form.js';
import { emptyRep, qlvhRoleFor, registrationFromSurvey, withQlvhFor } from './lib/survey.js';

const EMPTY_WORK = {
  recipient: {},
  workContent: { text: '', source: 'manual' },
  workLocation: '',
  condition: { text: '', source: 'manual' },
  time: { start: '', end: '', source: 'manual' },
  leader: null
};

export default function DkctApp() {
  const { api, notify } = useDkct();
  const [tab, setTab] = useState('outages');
  const [meta, setMeta] = useState(null);
  const [catalogs, setCatalogs] = useState({ personnel: [], stations: [], substations: [], drawings: [], duties: [], risks: [] });
  const [editor, setEditor] = useState(null); // { initial, registration, outage }
  const [reloadKey, setReloadKey] = useState(0);
  const [opening, setOpening] = useState(false);

  const loadMeta = useCallback(() => api.get('/meta').then(setMeta).catch(err => notify(err.message, 'error')), [api, notify]);
  const loadCatalog = useCallback(async (name) => {
    // "drawings": danh sách bản vẽ trạm (chỉ thông tin, không kèm file)
    const { items } = await api.get(name === 'drawings' ? '/substation-drawings' : `/${name}`);
    setCatalogs(c => ({ ...c, [name]: items }));
  }, [api]);
  const loadAll = useCallback(() => {
    loadMeta();
    Promise.all(['personnel', 'stations', 'substations', 'drawings', 'duties', 'risks'].map(loadCatalog)).catch(err => notify(err.message, 'error'));
  }, [loadMeta, loadCatalog, notify]);

  useEffect(() => { loadAll(); }, [loadAll]);

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
    const { plan } = await api.get(`/plans/${item.id}`);
    setPlanEditor({ initial: planForm(plan.data), plan, numberPreview: plan.docNumber });
  });

  // Giấy xác nhận đủ điều kiện đóng điện: lập mới hoặc từ một giấy ĐKCT
  const [confirmationEditor, setConfirmationEditor] = useState(null); // { initial, confirmation, numberPreview }
  const openNewConfirmation = () => withOpening(async () => {
    const { draft, numbering } = await api.get('/confirmation-defaults');
    setConfirmationEditor({ initial: draft, confirmation: null, numberPreview: numbering.preview });
  });
  const openConfirmationFromRegistration = (item) => withOpening(async () => {
    const [{ draft }, { numbering }] = await Promise.all([api.get(`/registrations/${item.id}/confirmation-draft`), api.get('/confirmation-numbering')]);
    setConfirmationEditor({ initial: draft, confirmation: null, numberPreview: numbering.preview });
  });
  const openConfirmation = (item) => withOpening(async () => {
    const { confirmation } = await api.get(`/confirmations/${item.id}`);
    setConfirmationEditor({ initial: confirmation.data, confirmation, numberPreview: confirmation.docNumber });
  });

  const registrationFromSurveyItem = (item) => withOpening(async () => {
    const { survey } = await api.get(`/surveys/${item.id}`);
    const fromSurvey = registrationFromSurvey(survey.data);
    const initial = fromSaved({
      ...meta.defaults, ...EMPTY_WORK, ...fromSurvey,
      header: { ...meta.defaults.header, ...fromSurvey.header }
    });
    setEditor({ initial, registration: null, outage: null });
  });

  const permissions = meta?.permissions || {};
  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="px-4 pt-4 pb-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-chatlan-50 dark:bg-chatlan-900/50 text-chatlan-600 dark:text-chatlan-400 flex items-center justify-center">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Đăng ký công tác</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Lịch cắt điện → khảo sát → phương án → giấy ĐKCT → giấy xác nhận</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {opening && <Loader2 className="w-4 h-4 animate-spin text-chatlan-600" aria-label="Đang mở" />}
            {permissions.canCreate && (tab === 'surveys' ? (
              <button type="button" className={btnPrimary} onClick={openNewSurvey} disabled={!meta}><Plus className="w-4 h-4" /> Lập biên bản</button>
            ) : tab === 'plans' ? (
              <button type="button" className={btnPrimary} onClick={() => openNewPlan()} disabled={!meta}><Plus className="w-4 h-4" /> Lập phương án</button>
            ) : tab === 'confirmations' ? (
              <button type="button" className={btnPrimary} onClick={openNewConfirmation} disabled={!meta}><Plus className="w-4 h-4" /> Lập giấy xác nhận</button>
            ) : (
              <button type="button" className={btnPrimary} onClick={openNew} disabled={!meta}><Plus className="w-4 h-4" /> Lập giấy mới</button>
            ))}
            <button type="button" className={btnGhost} aria-label="Tải lại" onClick={() => { loadAll(); setReloadKey(k => k + 1); }}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 overflow-x-auto -mx-1 px-1" aria-label="Đăng ký công tác">
          {/* theo trình tự công việc: lịch cắt điện -> khảo sát -> phương án -> đăng ký */}
          <TabButton icon={Zap} active={tab === 'outages'} onClick={() => setTab('outages')}>Lịch cắt điện</TabButton>
          <TabButton icon={ClipboardList} active={tab === 'surveys'} onClick={() => setTab('surveys')}>Biên bản KSHT</TabButton>
          <TabButton icon={FileStack} active={tab === 'plans'} onClick={() => setTab('plans')}>Phương án</TabButton>
          <TabButton icon={FileText} active={tab === 'registrations'} onClick={() => setTab('registrations')}>Giấy ĐKCT</TabButton>
          <TabButton icon={BadgeCheck} active={tab === 'confirmations'} onClick={() => setTab('confirmations')}>Giấy xác nhận</TabButton>
          <TabButton icon={BookUser} active={tab === 'catalogs'} onClick={() => setTab('catalogs')}>Danh mục</TabButton>
          <TabButton icon={Archive} active={tab === 'legacy'} onClick={() => setTab('legacy')}>Giấy cũ</TabButton>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24 md:pb-4">
        {tab === 'registrations' && (
          <RegistrationList reloadKey={reloadKey} onOpen={openExisting} numbering={meta?.numbering}
            canCreate={permissions.canCreate} onNumberingChanged={loadMeta} onCreateConfirmation={openConfirmationFromRegistration} />
        )}
        {tab === 'confirmations' && <ConfirmationList reloadKey={reloadKey} onOpen={openConfirmation} canCreate={permissions.canCreate} />}
        {tab === 'surveys' && (
          <SurveyList reloadKey={reloadKey} onOpen={openSurvey} canCreate={permissions.canCreate} onCreateRegistration={registrationFromSurveyItem}
            onCreatePlan={(item) => openNewPlan(item)} />
        )}
        {tab === 'plans' && <PlanList reloadKey={reloadKey} onOpen={openPlan} canCreate={permissions.canCreate} />}
        {tab === 'outages' && (
          <OutagePanel canCreate={permissions.canCreate} onCreateFromOutage={openFromOutage} onCreateSurveyFromOutage={openSurveyFromOutage}
            onCreatePlanFromOutage={openPlanFromOutage} />
        )}
        {tab === 'catalogs' && <CatalogPanel catalogs={catalogs} canManage={permissions.canManageCatalog} onChanged={loadCatalog} />}
        {tab === 'legacy' && <LegacyPanel />}
      </div>

      {editor && (
        <RegistrationEditor
          {...editor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          docNumberPreview={editor.registration?.docNumber || meta?.numbering?.preview || ''}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); setTab('registrations'); setReloadKey(k => k + 1); loadMeta(); }}
        />
      )}
      {surveyEditor && (
        <SurveyEditor
          {...surveyEditor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          onClose={() => setSurveyEditor(null)}
          onSaved={() => { setSurveyEditor(null); setTab('surveys'); setReloadKey(k => k + 1); }}
        />
      )}
      {confirmationEditor && (
        <ConfirmationEditor
          {...confirmationEditor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          onClose={() => setConfirmationEditor(null)}
          onSaved={() => { setConfirmationEditor(null); setTab('confirmations'); setReloadKey(k => k + 1); }}
        />
      )}
      {planEditor && (
        <PlanEditor
          {...planEditor}
          catalogs={catalogs}
          departments={meta?.departments || []}
          onClose={() => setPlanEditor(null)}
          onSaved={() => { setPlanEditor(null); setTab('plans'); setReloadKey(k => k + 1); }}
        />
      )}
    </div>
  );
}
