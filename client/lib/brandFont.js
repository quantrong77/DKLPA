import { useEffect } from 'react';

// chữ Be Vietnam Pro cho giao diện EVNNPT: nạp một lần khi cần (mất mạng thì dùng phông hệ thống)
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap';

export function useBrandFont(enabled) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || document.querySelector('link[data-dkct-font]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    link.dataset.dkctFont = '1';
    document.head.appendChild(link);
  }, [enabled]);
}
