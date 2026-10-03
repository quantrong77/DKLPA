import React from 'react';
import { Upload } from 'lucide-react';
import { btnSecondary } from './ui.jsx';

// Trang QLTN (Quản lý thí nghiệm) của Tổng công ty: nơi đăng biên bản khảo sát, phương án đã xuất Word
export const QLTN_URL = 'https://qltn.npt.com.vn/QLTN_Web/eam/eamHome.jsf';

/** Nút mở trang QLTN ở thẻ mới. `highlight`: vừa tải Word xong — nhấn mạnh bước đăng tiếp theo. */
export default function QltnLink({ highlight = false, label = 'Đăng QLTN' }) {
  return (
    <a href={QLTN_URL} target="_blank" rel="noopener noreferrer"
      className={`${btnSecondary} ${highlight ? '!border-emerald-500 !text-emerald-700 dark:!text-emerald-300 ring-2 ring-emerald-500/30' : ''}`}
      title="Mở trang QLTN (Quản lý thí nghiệm) ở thẻ mới để đăng file Word đã tải">
      <Upload className="w-4 h-4" /> <span className="hidden sm:inline">{label}</span>
    </a>
  );
}
