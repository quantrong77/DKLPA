import React from 'react';
import { MapPinned, FileText, CloudDownload, MessageCircle, Building2, CalendarRange } from 'lucide-react';
import TeamAreasPanel from './TeamAreasPanel.jsx';
import TemplatesPanel from './TemplatesPanel.jsx';
import OutageSettingsPanel from './OutageSettingsPanel.jsx';
import ZaloSettingsPanel from './ZaloSettingsPanel.jsx';
import OrgNamesPanel from './OrgNamesPanel.jsx';
import TestPlanSettingsPanel from './TestPlanSettingsPanel.jsx';
import { TabButton } from './ui.jsx';
import { usePersistentState } from '../lib/persist.js';

const TABS = [
  { id: 'teamAreas', label: 'Khu vực, trạm của đơn vị', icon: MapPinned },
  { id: 'outageSettings', label: 'Tải lịch tự động', icon: CloudDownload },
  { id: 'zalo', label: 'Thông báo Zalo', icon: MessageCircle },
  { id: 'templates', label: 'Mẫu văn bản', icon: FileText },
  { id: 'testPlan', label: 'Kế hoạch thí nghiệm', icon: CalendarRange },
  { id: 'orgNames', label: 'Tên đơn vị, chức danh', icon: Building2 }
];

/** Cài đặt hệ thống (chỉ admin): khu vực / trạm từng tổ phụ trách, tải lịch cắt điện tự động, thông báo Zalo, mẫu Word, tên đơn vị. */
export default function SettingsPanel() {
  const [tab, setTab] = usePersistentState('dkct.settingsTab', 'teamAreas', TABS.map(t => t.id));
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Mục cài đặt">
        {TABS.map(t => <TabButton key={t.id} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</TabButton>)}
      </div>
      {tab === 'teamAreas' && <TeamAreasPanel canManage />}
      {tab === 'outageSettings' && <OutageSettingsPanel />}
      {tab === 'zalo' && <ZaloSettingsPanel />}
      {tab === 'templates' && <TemplatesPanel canManage />}
      {tab === 'orgNames' && <OrgNamesPanel />}
      {tab === 'testPlan' && <TestPlanSettingsPanel />}
    </div>
  );
}
