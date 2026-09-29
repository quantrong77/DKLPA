// In-app replacements for window.alert / window.confirm.
// Works from components and plain modules (contexts, helpers); the UI is
// rendered by <FeedbackHost /> mounted once at the app root.

let nextId = 1;
let state = { toasts: [], confirm: null };
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function subscribeFeedback(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function dismissToast(id) {
  state = { ...state, toasts: state.toasts.filter((t) => t.id !== id) };
  emit();
}

/**
 * Show a short message.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type='info']
 */
export function notify(message, type = 'info') {
  const id = nextId++;
  const text = String(message ?? '').trim() || 'Đã xảy ra lỗi';
  // keep at most 3 on screen
  state = { ...state, toasts: [...state.toasts.slice(-2), { id, message: text, type }] };
  emit();
  const duration = type === 'error' || type === 'warning' ? 6000 : 3500;
  setTimeout(() => dismissToast(id), duration);
  return id;
}

const DANGER_WORDS = /xóa|hủy|rời|giải tán|đặt lại|cảnh báo|không thể hoàn tác/i;

/**
 * Ask the user to confirm an action.
 * @param {string|{title?:string,message:string,confirmLabel?:string,cancelLabel?:string,danger?:boolean}} options
 * @returns {Promise<boolean>}
 */
export function confirmAction(options) {
  const opts = typeof options === 'string' ? { message: options } : { ...options };
  const danger = opts.danger ?? DANGER_WORDS.test(`${opts.title || ''} ${opts.message || ''}`);
  return new Promise((resolve) => {
    // a second request replaces an unanswered one (treated as cancelled)
    if (state.confirm) state.confirm.resolve(false);
    state = {
      ...state,
      confirm: {
        title: opts.title || (danger ? 'Xác nhận thao tác' : 'Xác nhận'),
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || (danger ? 'Đồng ý' : 'Xác nhận'),
        cancelLabel: opts.cancelLabel || 'Hủy',
        danger,
        resolve
      }
    };
    emit();
  });
}

export function settleConfirm(result) {
  const current = state.confirm;
  if (!current) return;
  state = { ...state, confirm: null };
  emit();
  current.resolve(result);
}
