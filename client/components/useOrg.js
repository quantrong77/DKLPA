import { useEffect, useState } from 'react';
import { useDkct } from '../context.jsx';

/** Mặc định như server (services/orgNames.js DEFAULTS) khi chưa tải xong / lỗi. */
export const ORG_DEFAULTS = {
  teamWord: 'Tổ',
  positions: ['Tổ trưởng', 'Tổ phó', 'Kỹ sư', 'Công nhân'],
  leadSignTitle: 'Tổ trưởng/ Tổ phó',
  roleLabels: { admin: 'Quản trị viên', lead: 'Trưởng/phó đơn vị', member: 'Thành viên' }
};

const cache = new WeakMap(); // api -> Promise<effective>

/** Tên gọi đơn vị trực tiếp, chức danh đang dùng (Cài đặt → Tên đơn vị, chức danh); tải một lần cho mỗi API. */
export function useOrg() {
  const { api } = useDkct();
  const [org, setOrg] = useState(ORG_DEFAULTS);
  useEffect(() => {
    let p = cache.get(api);
    if (!p) {
      p = api.get('/org-names').then(r => ({ ...ORG_DEFAULTS, ...r.effective })).catch(() => ORG_DEFAULTS);
      cache.set(api, p);
    }
    let alive = true;
    p.then(v => { if (alive) setOrg(v); });
    return () => { alive = false; };
  }, [api]);
  return org;
}

/** Sau khi admin lưu: lần mở sau tải lại. */
export const forgetOrg = (api) => cache.delete(api);
