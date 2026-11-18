import React from 'react';
import { DkctProvider } from './context.jsx';
import DkctApp from './DkctApp.jsx';

/**
 * Màn hình module Chuẩn bị công tác (ĐKCT), nhúng vào ChatLan:
 *
 *   <DkctModule services={{ apiFetch, downloadAuthenticatedFile, notify, confirmAction, ModalOverlay, EmptyState }} />
 *
 * services.features (tùy chọn): { settingsTab: false } khi nơi nhúng có trang quản trị riêng chứa các mục Cài đặt
 * (dùng SETTINGS_SECTIONS trong components/SettingsPanel.jsx); { legacy: false } ẩn tab Giấy cũ (nơi nhúng không có giấy của module cũ).
 *
 * `services` nên ổn định (khai báo ở cấp module hoặc useMemo) để không tạo lại API client mỗi lần render.
 */
export default function DkctModule({ services }) {
  return (
    <DkctProvider services={services}>
      <DkctApp />
    </DkctProvider>
  );
}
