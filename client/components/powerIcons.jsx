import React from 'react';

/**
 * Biểu tượng ngành điện, vẽ theo ký hiệu sơ đồ một sợi (IEC 60617) và đồ dùng hiện trường — thay cho biểu tượng phổ thông
 * ở thanh luồng, tab và đầu trang. Cùng giao diện với lucide-react: className, strokeWidth, aria-hidden mặc định.
 */
function make(name, body, { fill = false } = {}) {
  const Icon = ({ className = 'w-4 h-4', strokeWidth = 1.75, title, ...rest }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}
      aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} {...rest}>
      {title && <title>{title}</title>}
      {body}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
}

/** Lịch cắt điện: dao cách ly ở trạng thái mở. */
export const IconIsolatorOpen = make('IconIsolatorOpen', <>
  <path d="M12 2v5M9 7h6" />
  <path d="M12 22v-4.5" />
  <path d="M12 17.5 6.5 8.8" />
  <circle cx="12" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
</>);

/** Khảo sát hiện trường: cột điện truyền tải. */
export const IconPylon = make('IconPylon', <>
  <path d="M12 2 7.6 22M12 2l4.4 20" />
  <path d="M4.5 7h15M6.5 11.5h11" />
  <path d="M4.5 7v2.2M19.5 7v2.2M6.5 11.5v2.2M17.5 11.5v2.2" />
  <path d="M9.8 16h4.4M8.8 20.5l5.4-4.5M15.2 20.5 9.8 16" />
</>);

/** Phương án, biện pháp an toàn: văn bản có ký hiệu tiếp địa. */
export const IconSafetyPlan = make('IconSafetyPlan', <>
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  <path d="M14 2v6h6" />
  <path d="M12 10.5v3.5M8 14h8M9.6 16.6h4.8M11.1 19.2h1.8" />
</>);

/** Giấy đăng ký công tác: văn bản có dấu sét. */
export const IconPermit = make('IconPermit', <>
  <path d="M11 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7" />
  <path d="M8 7h7M8 10.5h5" />
  <circle cx="16.5" cy="17" r="4.5" />
  <path d="m17.1 14.4-1.7 2.8h2.2l-1.7 2.8" />
</>);

/** Giấy xác nhận đủ điều kiện đóng điện: máy cắt đóng (ô tô đặc) và dấu kiểm. */
export const IconEnergize = make('IconEnergize', <>
  <path d="M7.5 2v6.5M7.5 15.5V22" />
  <rect x="4.5" y="8.5" width="6" height="7" rx="0.5" fill="currentColor" />
  <path d="m13.5 12.5 2.6 2.6L21 10" />
</>);

/** Công việc không có lịch cắt điện: mũ bảo hộ. */
export const IconHelmet = make('IconHelmet', <>
  <path d="M2.5 18.5h19" />
  <path d="M4.5 18.5v-1A7.5 7.5 0 0 1 12 10a7.5 7.5 0 0 1 7.5 7.5v1" />
  <path d="M10 10.3V6.5a2 2 0 0 1 4 0v3.8" />
  <path d="M7.4 13.2 8.6 15M16.6 13.2 15.4 15" />
</>);

/** Danh mục (trạm, người, rủi ro): thanh cái và các ngăn lộ có máy cắt. */
export const IconBusbar = make('IconBusbar', <>
  <path d="M2.5 5h19" strokeWidth="2.4" />
  <path d="M6 5v4.5M12 5v4.5M18 5v4.5" />
  <rect x="4.5" y="9.5" width="3" height="3" />
  <rect x="10.5" y="9.5" width="3" height="3" />
  <rect x="16.5" y="9.5" width="3" height="3" />
  <path d="M6 12.5V20M12 12.5V20M18 12.5V20" />
  <path d="m4.6 18.4 1.4 1.8 1.4-1.8M10.6 18.4l1.4 1.8 1.4-1.8M16.6 18.4l1.4 1.8 1.4-1.8" />
</>);

/** Cài đặt: đồng hồ đo (rơ le, thiết bị thí nghiệm). */
export const IconMeter = make('IconMeter', <>
  <rect x="3" y="3" width="18" height="18" rx="2.5" />
  <path d="M6.5 14a5.5 5.5 0 0 1 11 0" />
  <path d="M12 14l3-4" />
  <path d="M8.2 10.6 7.4 9.8M12 8.5V7.4M15.8 10.6l.8-.8" />
  <path d="M8 17.5h8" />
</>);

/** Giấy cũ: tập hồ sơ lưu. */
export const IconFileStack = make('IconFileStack', <>
  <path d="M8 6V4a1.5 1.5 0 0 1 1.5-1.5h8L21 6v11.5a1.5 1.5 0 0 1-1.5 1.5H17" />
  <rect x="3" y="6" width="14" height="15.5" rx="1.5" />
  <path d="M6.5 11h7M6.5 14h7M6.5 17h4" />
</>);

/** Máy biến áp: hai cuộn dây. */
export const IconTransformer = make('IconTransformer', <>
  <path d="M12 2v3.5M12 18.5V22" />
  <circle cx="12" cy="9.5" r="4" />
  <circle cx="12" cy="14.5" r="4" />
</>);

/** Dấu sao bốn cánh trong vòng tròn (theo nhận diện EVNNPT): đỏ, tâm vàng, viền xanh. */
export function EvnMark({ className = 'w-9 h-9', title }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
      {title && <title>{title}</title>}
      <circle cx="24" cy="24" r="22" fill="#fff" stroke="#02199d" strokeWidth="2" />
      <path d="M24 5.5 26.6 21.4 42.5 24 26.6 26.6 24 42.5 21.4 26.6 5.5 24 21.4 21.4Z" fill="#02199d" />
      <path d="M24 10 25.9 22.1 38 24 25.9 25.9 24 38 22.1 25.9 10 24 22.1 22.1Z" fill="#f21a25" />
      <path d="M24 18.5 24.9 23.1 29.5 24 24.9 24.9 24 29.5 23.1 24.9 18.5 24 23.1 23.1Z" fill="#ffef03" />
    </svg>
  );
}

// dải sao bốn cánh chạy chéo như hình nền nhận diện: vị trí cố định (giả ngẫu nhiên có hạt giống) để không nhảy khi vẽ lại
const STARS = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const out = [];
  for (let i = 0; i < 110; i++) {
    const t = rnd(); // dọc theo dải, từ dưới trái lên trên phải
    const off = (rnd() - 0.5) * 2; // ngang dải
    const dense = 1 - Math.abs(off); // giữa dải sao to, mép dải sao nhỏ
    const x = 40 + t * 300 + off * 34;
    const y = 120 - t * 110 + off * 30;
    const r = 1.5 + dense * dense * (3 + rnd() * 6);
    out.push({ x, y, r });
  }
  return out;
})();
const starPath = ({ x, y, r }) => {
  const k = r * 0.22;
  return `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`;
};
const STAR_D = STARS.map(starPath).join('');

/** Hoa văn dải sao (trang trí): màu theo currentColor, chỉ hiện ở giao diện EVNNPT (CSS .dkct-starfield). */
export function StarField({ className = '', fit = 'slice' }) {
  return (
    <svg viewBox="0 0 380 130" preserveAspectRatio={fit === 'meet' ? 'xMaxYMax meet' : 'xMaxYMin slice'} className={className} aria-hidden="true" focusable="false">
      <path d={STAR_D} fill="currentColor" />
    </svg>
  );
}
