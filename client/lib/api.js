// Gọi API /api/dkct qua apiFetch của ChatLan (tự gắn Bearer token).
export const API_BASE = '/api/dkct';

export function createApi(apiFetch) {
  async function request(path, { method = 'GET', body, form } = {}) {
    const init = { method, headers: {} };
    if (form) init.body = form;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await apiFetch(`${API_BASE}${path}`, init);
    let payload = null;
    try { payload = await res.json(); } catch (e) { /* không phải JSON */ }
    if (!res.ok) {
      const err = new Error(payload?.error || `Lỗi ${res.status}`);
      err.status = res.status;
      err.errors = payload?.errors || [];
      throw err;
    }
    return payload;
  }
  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    del: (path) => request(path, { method: 'DELETE' }),
    upload: (path, file, method = 'POST') => {
      const form = new FormData();
      form.append('file', file);
      return request(path, { method, form });
    },
    /** Gửi FormData nhiều trường (vd PDF + ảnh trang bản vẽ). */
    sendForm: (path, form, method = 'PUT') => request(path, { method, form }),
    /** Tải tệp (vd ảnh sơ đồ) kèm xác thực; trả về Blob. */
    blob: async (path) => {
      const res = await apiFetch(`${API_BASE}${path}`);
      if (!res.ok) throw Object.assign(new Error(`Lỗi ${res.status}`), { status: res.status });
      return res.blob();
    },
    /** Gửi dữ liệu đang soạn, nhận bản Word xem trước (Blob); dữ liệu sai: lỗi kèm errors như khi lưu. */
    previewDocx: async (path, body) => {
      const res = await apiFetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        let payload = null;
        try { payload = await res.json(); } catch (e) { /* không phải JSON */ }
        throw Object.assign(new Error(payload?.error || `Lỗi ${res.status}`), { status: res.status, errors: payload?.errors || [] });
      }
      return res.blob();
    }
  };
}
