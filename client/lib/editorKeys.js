// Phím tắt chung của các biểu mẫu: Ctrl+S (⌘S) lưu; còn thay đổi chưa lưu thì cảnh báo khi đóng / tải lại tab trình duyệt.
import { useEffect, useRef } from 'react';

export const isSaveKey = (e) => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 's';

/**
 * onSave: hàm lưu; dirty: còn thay đổi chưa lưu; disabled: đang lưu / chỉ xem / đang mở hộp thoại con
 * (Ctrl+S vẫn bị chặn để trình duyệt không mở hộp "Lưu trang").
 */
export function useEditorKeys({ onSave, dirty, disabled }) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const onKey = (e) => {
      if (!isSaveKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      // đang mở hộp thoại con (xem trước, bản vẽ, TI, hộp xác nhận…) thì không lưu biểu mẫu bên dưới
      const nested = typeof document !== 'undefined' && document.querySelectorAll('[aria-modal="true"]').length > 1;
      if (!disabledRef.current && !nested) saveRef.current?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
