// Gõ tìm nhanh, đổi năm liên tiếp: kết quả về sau của lần tải cũ không được đè lên kết quả mới.
import { useCallback, useRef } from 'react';

/** begin() mỗi lần tải; trả về isLatest() — false khi đã có lần tải mới hơn. */
export function useLatestRequest() {
  const seq = useRef(0);
  return useCallback(() => {
    const mine = ++seq.current;
    return () => mine === seq.current;
  }, []);
}
