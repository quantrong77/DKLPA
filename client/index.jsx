import React from 'react';
import { DkctProvider } from './context.jsx';
import DkctApp from './DkctApp.jsx';

/**
 * Màn hình module Đăng ký công tác, nhúng vào ChatLan:
 *
 *   <DkctModule services={{ apiFetch, downloadAuthenticatedFile, notify, confirmAction, ModalOverlay, EmptyState }} />
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
