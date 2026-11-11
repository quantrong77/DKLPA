/**
 * Báo biến động lịch cắt điện qua Zalo Bot (Zalo Bot Platform, https://bot.zapps.me/docs).
 *
 * - Admin tạo bot bằng Zalo Bot Creator, lấy token, đặt ở Cài đặt → Thông báo Zalo (token mã hóa như mật khẩu trang lịch;
 *   không có thì dùng ZALO_BOT_TOKEN trong .env). Token không bao giờ trả về trình duyệt, không ghi vào nhật ký.
 * - Người nhận: chat_id của người / nhóm đã nhắn tin cho bot ("Tìm người vừa nhắn bot" đọc getUpdates).
 *   Mỗi người nhận chọn tổ: chỉ nhận thay đổi ở trạm / khu vực tổ đó phụ trách hoặc dòng lịch có hồ sơ của tổ; để trống = mọi tổ.
 * - Gửi sau khi tự tải lịch theo giờ hẹn (mặc định); tùy chọn gửi cả khi bấm tải / chọn file.
 */
const { encrypt, decrypt } = require('./outageSettings');
const { changedRows } = require('../util');
const { vnNow } = require('./clock');

const API_BASE = 'https://bot-api.zaloplatforms.com';
const CONFIG = 'zalo.config';
const STATUS = 'zalo.status';
const MAX_TEXT = 2000; // giới hạn sendMessage
const MAX_PARTS = 4; // mỗi người nhận tối đa 4 tin cho một lần thay đổi
const MAX_RECIPIENTS = 50;
const DISCOVER_WAIT_MS = 50 * 1000; // "Tìm người vừa nhắn bot" chờ tin nhắn tới bot tối đa 50 giây
const TOKEN_RE = /^[A-Za-z0-9:_.-]{10,300}$/; // token nằm trong đường dẫn URL: không cho "/", "?", "#"
const CHAT_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

/**
 * Gọi Bot API; lỗi mạng / Zalo báo lỗi -> Error (không chứa token) mã 424: lỗi ở phía Zalo, không phải lỗi máy chủ
 * này, nên lý do được hiện cho admin (lỗi ≥ 500 bị che thành "Lỗi máy chủ"). err.zaloCode = error_code của Zalo.
 */
async function callApi(token, method, body, { fetch = globalThis.fetch, timeoutMs = 15000 } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw fail(424, `Không kết nối được Zalo Bot API (${err.name === 'TimeoutError' ? 'quá thời gian chờ' : 'lỗi mạng'}). Máy chủ cần ra được Internet.`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const code = Number(data?.error_code) || res.status;
    const why = clean(data?.description || data?.message || data?.error_code || `HTTP ${res.status}`, 200);
    const err = /token|unauthori[sz]ed/i.test(why) || res.status === 401 || res.status === 404 || code === 401
      ? fail(424, `Zalo từ chối token của bot (${why}). Kiểm tra lại token.`)
      : fail(424, `Zalo báo lỗi: ${why}${code ? ` (mã ${code})` : ''}`);
    err.zaloCode = code;
    throw err;
  }
  return data.result;
}

/** Cắt nội dung thành các tin ≤ 2000 ký tự theo dòng (một dòng quá dài thì cắt cứng). */
function splitMessage(text, max = MAX_TEXT) {
  const parts = [];
  let cur = '';
  for (const raw of String(text).split('\n')) {
    let line = raw;
    while (line.length > max) { parts.push(line.slice(0, max)); line = line.slice(max); }
    if (cur && cur.length + 1 + line.length > max) { parts.push(cur); cur = line; } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) parts.push(cur);
  return parts;
}

/**
 * Nội dung gửi một người nhận: các dòng thay đổi thuộc tổ của họ (department rỗng = mọi tổ). -> [tin] | [] nếu không có gì.
 * @param described [{ line, teams }] (importer.describeEvents)
 */
function messagesFor(described, { department = '', source = '', appUrl = '' } = {}) {
  const lines = described.filter(d => !department || d.teams.includes(department)).map(d => d.line);
  if (!lines.length) return [];
  const header = `⚡ Lịch cắt điện thay đổi${source ? ` (${source})` : ''}${department ? ` — ${department}` : ''}: ${lines.length} mục`;
  const footer = appUrl ? `Xem chi tiết: ${appUrl}` : 'Xem chi tiết: Chuẩn bị công tác → 1. Lịch cắt điện.';
  const parts = splitMessage([header, ...lines, footer].join('\n'));
  if (parts.length <= MAX_PARTS) return parts;
  return [...parts.slice(0, MAX_PARTS - 1), `… còn nhiều thay đổi khác (tổng ${lines.length} mục).\n${footer}`];
}

/** Người / nhóm vừa nhắn bot (getUpdates) -> [{ chatId, type, name, text, date }] (gộp theo chat). */
function chatsFromUpdates(result) {
  const updates = Array.isArray(result) ? result : result ? [result] : [];
  const chats = new Map();
  for (const u of updates) {
    const m = u?.message || u?.result?.message;
    const id = m?.chat?.id;
    if (!id) continue;
    chats.set(String(id), {
      chatId: String(id),
      type: m.chat.chat_type === 'GROUP' ? 'GROUP' : 'PRIVATE',
      name: clean(m.chat.display_name || m.chat.title || m.from?.display_name || m.from?.name || '', 100),
      text: clean(m.text, 100),
      date: m.date || null
    });
  }
  return [...chats.values()];
}

/**
 * @param db
 * @param secret khóa mã hóa (như mật khẩu trang lịch)
 * @param envToken ZALO_BOT_TOKEN (tùy chọn)
 * @param fetch  (thử nghiệm)
 * @param listDepartments async () -> [{ name }] (kiểm tra tổ của người nhận)
 */
function createZaloBot({ db, secret, envToken = '', fetch = globalThis.fetch, listDepartments = async () => [], log = console }) {
  async function read(name) {
    const row = await db.queryOne('SELECT value FROM dkct_settings WHERE name = ?', [name]);
    try { return row?.value ? JSON.parse(row.value) : {}; } catch { return {}; }
  }
  async function write(name, obj) {
    const value = JSON.stringify(obj);
    const res = await db.execute('UPDATE dkct_settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE name = ?', [value, name]);
    if (!changedRows(res)) await db.execute('INSERT INTO dkct_settings (name, value) VALUES (?, ?)', [name, value]);
  }

  async function config() {
    const s = await read(CONFIG);
    const saved = s.token ? decrypt(secret, s.token) : null;
    return {
      token: saved || (TOKEN_RE.test(envToken) ? envToken : ''),
      tokenFrom: saved ? 'admin' : TOKEN_RE.test(envToken) ? 'env' : '',
      tokenUnreadable: !!s.token && !saved,
      enabled: s.enabled !== false,
      onAuto: s.onAuto !== false,
      onManual: !!s.onManual,
      appUrl: s.appUrl || '',
      recipients: Array.isArray(s.recipients) ? s.recipients : [],
      updatedAt: s.updatedAt || null
    };
  }

  /** Cấu hình cho admin (không có token). */
  async function view() {
    const { token, ...c } = await config();
    return { ...c, hasToken: !!token, canStoreToken: !!secret, status: await read(STATUS), departments: (await listDepartments()).map(d => d.name) };
  }

  /** input: { token (bỏ trống = giữ), clearToken, enabled, onAuto, onManual, appUrl, recipients: [{ chatId, label, department }] } */
  async function save(input = {}, actorId) {
    const s = await read(CONFIG);
    if (input.clearToken) delete s.token;
    const token = String(input.token || '').trim();
    if (token) {
      if (!TOKEN_RE.test(token)) throw fail(400, 'Token bot không hợp lệ (dạng 1234567890:AbCd…, lấy ở Zalo Bot Creator).');
      if (!secret) throw fail(400, 'Máy chủ chưa có khóa mã hóa (DKCT_SECRET_KEY) nên không lưu được token; đặt ZALO_BOT_TOKEN trong .env.');
      s.token = encrypt(secret, token);
    }
    for (const key of ['enabled', 'onAuto', 'onManual']) if (input[key] !== undefined) s[key] = !!input[key];
    if (input.appUrl !== undefined) {
      const url = clean(input.appUrl, 300);
      if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw fail(400, 'Đường dẫn ứng dụng phải bắt đầu bằng http:// hoặc https://');
      s.appUrl = url;
    }
    if (input.recipients !== undefined) {
      if (!Array.isArray(input.recipients) || input.recipients.length > MAX_RECIPIENTS) throw fail(400, `Tối đa ${MAX_RECIPIENTS} người nhận.`);
      const departments = new Set((await listDepartments()).map(d => d.name));
      const seen = new Set();
      s.recipients = [];
      for (const r of input.recipients) {
        const chatId = clean(r?.chatId, 128);
        if (!chatId) continue;
        if (!CHAT_RE.test(chatId)) throw fail(400, `Chat ID không hợp lệ: "${chatId.slice(0, 40)}".`);
        if (seen.has(chatId)) continue;
        seen.add(chatId);
        const department = clean(r?.department, 191);
        if (department && departments.size && !departments.has(department)) throw fail(400, `Đơn vị không tồn tại: "${department}".`);
        s.recipients.push({ chatId, label: clean(r?.label, 100), department });
      }
    }
    s.updatedBy = actorId || null;
    s.updatedAt = vnNow();
    await write(CONFIG, s);
    return view();
  }

  async function send(token, chatId, text) {
    return callApi(token, 'sendMessage', { chat_id: chatId, text }, { fetch });
  }

  /** Gửi tin thử tới một người nhận (chatId) hoặc tất cả. -> { sent, failed: [{ chatId, label, error }] } */
  async function test(chatId) {
    const c = await config();
    if (!c.token) throw fail(400, 'Chưa có token bot Zalo.');
    const targets = chatId ? [{ chatId: clean(chatId, 128), label: '' }] : c.recipients;
    if (!targets.length) throw fail(400, 'Chưa có người nhận.');
    if (targets.some(t => !CHAT_RE.test(t.chatId))) throw fail(400, 'Chat ID không hợp lệ.');
    const out = { sent: 0, failed: [] };
    for (const t of targets) {
      try {
        await send(c.token, t.chatId, `✅ Thử thông báo lịch cắt điện từ ứng dụng Chuẩn bị công tác${t.department ? ` (${t.department})` : ''}.`);
        out.sent += 1;
      } catch (err) { out.failed.push({ chatId: t.chatId, label: t.label, error: err.message }); }
    }
    return out;
  }

  /**
   * Người / nhóm nhắn bot (để lấy chat_id). getUpdates là long polling: Zalo trả tin đến trong lúc đang chờ (tin cũ có thể
   * không còn), nên chờ tới `waitMs` (mặc định 50 giây) — admin bấm nút rồi nhắn bot. Bot đang đặt webhook thì Zalo không cho đọc.
   */
  async function discover({ waitMs = DISCOVER_WAIT_MS, pollSeconds = 25 } = {}) {
    const c = await config();
    if (!c.token) throw fail(400, 'Chưa có token bot Zalo — lưu token trước.');
    const deadline = Date.now() + waitMs;
    do {
      const left = Math.max(1, Math.min(pollSeconds, Math.round((deadline - Date.now()) / 1000)));
      try {
        const chats = chatsFromUpdates(await callApi(c.token, 'getUpdates', { timeout: String(left) }, { fetch, timeoutMs: (left + 10) * 1000 }));
        if (chats.length) return chats;
      } catch (err) {
        // 408: hết thời gian chờ mà chưa có tin nhắn mới — chờ tiếp tới hạn
        if (err.zaloCode !== 408) {
          if (/webhook/i.test(err.message)) throw fail(409, 'Bot đang dùng webhook nên không đọc được tin nhắn mới; xóa Webhook URL của bot hoặc nhập chat ID bằng tay.');
          throw err;
        }
      }
    } while (Date.now() < deadline - 1000);
    return [];
  }

  /**
   * Gọi sau khi nạp lịch có thay đổi (importer deps.onChanges). -> số tin đã gửi. Không ném lỗi: ghi trạng thái lần gửi.
   */
  async function onChanges(events, { source, trigger, describe }) {
    const c = await config();
    if (!c.enabled || !c.token || !c.recipients.length || !events.length) return 0;
    if (trigger === 'AUTO' ? !c.onAuto : !c.onManual) return 0;
    const described = await describe(events);
    let sent = 0;
    const errors = [];
    for (const r of c.recipients) {
      for (const text of messagesFor(described, { department: r.department, source, appUrl: c.appUrl })) {
        try {
          await send(c.token, r.chatId, text);
          sent += 1;
        } catch (err) {
          errors.push(`${r.label || r.chatId}: ${err.message}`);
          break; // người nhận này lỗi: bỏ các tin còn lại của họ
        }
      }
    }
    await write(STATUS, { at: vnNow(), source: clean(source, 200), sent, errors: errors.slice(0, 10) }).catch(() => {});
    if (errors.length) log.warn?.(`[dkct] Zalo: ${errors.length} người nhận lỗi — ${errors[0]}`);
    return sent;
  }

  return { config, view, save, test, discover, onChanges };
}

module.exports = { createZaloBot, splitMessage, messagesFor, chatsFromUpdates, API_BASE, MAX_TEXT };
