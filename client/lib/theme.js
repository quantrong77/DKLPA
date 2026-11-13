// Giao diện của module (thuần, không phụ thuộc React).
//
// Màu "chatlan" trong Tailwind của ứng dụng chủ là biến CSS --chatlan-50 … --chatlan-900 (giá trị mặc định = màu ChatLan),
// nên một giao diện chỉ cần đặt lại các biến này trên khung gốc của module: phần còn lại của ChatLan không đổi.

export const THEMES = [
  {
    id: 'evnnpt', label: 'EVNNPT', description: 'Xanh – đỏ nhận diện EVNNPT, biểu tượng sơ đồ một sợi',
    swatch: ['#02199d', '#f21a25', '#ffef03']
  },
  {
    id: 'default', label: 'ChatLan', description: 'Xanh ChatLan, bo tròn, thoáng',
    swatch: ['#0068FF', '#e0edff', '#f8fafc']
  },
  {
    id: 'pro', label: 'Chuyên nghiệp', description: 'Xanh navy, góc vuông gọn, nền dịu — hợp làm việc văn phòng lâu',
    swatch: ['#213f6b', '#e4eaf2', '#eef1f5']
  }
];

// v2: đổi khóa khi thêm giao diện EVNNPT làm mặc định — ai đã chọn trước đây cũng thấy giao diện mới một lần, rồi chọn lại được
export const THEME_KEY = 'dkct.theme.v2';
export const DEFAULT_THEME = 'evnnpt';
export const themeOf = (id) => THEMES.find(t => t.id === id) || THEMES.find(t => t.id === DEFAULT_THEME);
export const themeClass = (id) => (themeOf(id).id === 'default' ? '' : `dkct-theme-${themeOf(id).id}`);

export function loadTheme(storage) {
  try { return themeOf(storage?.getItem(THEME_KEY)).id; } catch { return DEFAULT_THEME; }
}

export const THEME_EVENT = 'dkct:theme';

/** Lưu giao diện và báo cho ứng dụng chủ (sự kiện window "dkct:theme", detail = id) để khung ngoài đổi theo nếu muốn. */
export function saveTheme(storage, id) {
  try { storage?.setItem(THEME_KEY, themeOf(id).id); } catch { /* chế độ riêng tư: bỏ qua */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: themeOf(id).id }));
}
