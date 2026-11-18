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

/**
 * Các mục cài đặt hệ thống (chỉ admin). Dùng chung: tab "Cài đặt" của module (khi chạy trong ChatLan)
 * và trang Quản trị của bản độc lập (nhóm "Cài đặt"). Cần <DkctProvider> bao ngoài.
 */
export const SETTINGS_SECTIONS = [
  { id: 'teamAreas', label: 'Khu vực, trạm của đơn vị', icon: MapPinned,
    description: 'Trạm, khu vực từng đơn vị trực tiếp phụ trách: dùng để lọc lịch cắt điện và chọn người nhận thông báo.',
    selfDescribed: true, render: () => <TeamAreasPanel canManage /> },
  { id: 'outageSettings', label: 'Tải lịch tự động', icon: CloudDownload,
    description: 'Tài khoản trang lịch cắt điện của Công ty và giờ máy chủ tự tải lịch mỗi ngày.',
    selfDescribed: true, render: () => <OutageSettingsPanel /> },
  { id: 'zalo', label: 'Thông báo Zalo', icon: MessageCircle,
    description: 'Token Zalo Bot và người nhận tin khi lịch cắt điện thay đổi.',
    selfDescribed: true, render: () => <ZaloSettingsPanel /> },
  { id: 'templates', label: 'Mẫu văn bản', icon: FileText,
    description: 'Mẫu Word dùng để xuất biên bản khảo sát, phương án, giấy đăng ký và giấy xác nhận.',
    selfDescribed: true, render: () => <TemplatesPanel canManage /> },
  { id: 'testPlan', label: 'Kế hoạch thí nghiệm', icon: CalendarRange,
    description: 'Kế hoạch thí nghiệm từng năm (Google Sheet hoặc .xlsx): lấy thiết bị vào phương án.',
    selfDescribed: true, render: () => <TestPlanSettingsPanel /> },
  { id: 'orgNames', label: 'Tên đơn vị, chức danh', icon: Building2,
    description: 'Tên công ty, đội in ở đầu văn bản; tên gọi đơn vị trực tiếp và chức danh người ký.',
    selfDescribed: true, render: () => <OrgNamesPanel /> }
];

/** Tab "Cài đặt" của module (chỉ admin, khi nơi nhúng không có trang quản trị riêng). */
export default function SettingsPanel() {
  const [tab, setTab] = usePersistentState('dkct.settingsTab', 'teamAreas', SETTINGS_SECTIONS.map(t => t.id));
  const current = SETTINGS_SECTIONS.find(t => t.id === tab) || SETTINGS_SECTIONS[0];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Mục cài đặt">
        {SETTINGS_SECTIONS.map(t => <TabButton key={t.id} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</TabButton>)}
      </div>
      {current.render()}
    </div>
  );
}
