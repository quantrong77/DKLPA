// Ghi nhớ lựa chọn giao diện (tab đang mở, …) theo trình duyệt. Trình duyệt chặn bộ nhớ thì dùng mặc định.
import { useState } from 'react';

export function readChoice(storage, key, fallback, allowed) {
  try {
    const v = storage?.getItem(key);
    return v != null && (!allowed || allowed.includes(v)) ? v : fallback;
  } catch { return fallback; }
}

export function writeChoice(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* bỏ qua */ }
}

const store = () => (typeof localStorage === 'undefined' ? null : localStorage);

/** useState nhớ giá trị chuỗi trong localStorage (khóa "dkct.…"); giá trị lạ / không còn hợp lệ → mặc định. */
export function usePersistentState(key, fallback, allowed) {
  const [value, setValue] = useState(() => readChoice(store(), key, fallback, allowed));
  const set = (v) => { setValue(v); writeChoice(store(), key, v); };
  return [value, set];
}
