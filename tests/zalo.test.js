const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { startApp, USERS } = require('./helpers/app');
const { splitMessage, messagesFor, chatsFromUpdates, API_BASE } = require('../server/services/zaloBot');

const HEADER = ['Thời gian bắt đầu', 'Thời gian kết thúc', 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'];
const xlsx = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LỊCH CẮT ĐIỆN'], [], HEADER, ...rows]), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};
const excelFrom = (rows, range) => {
  const f = new FormData();
  f.append('file', new Blob([xlsx(rows)]), 'lich.xlsx');
  if (range) { f.append('compareFrom', range[0]); f.append('compareTo', range[1]); }
  return f;
};
const LD = USERS.lead.department;
const TOKEN = '1234567890:AbCdEf-gh_ij';

/** Bot API giả: ghi lại tin gửi; getUpdates trả tin người dùng vừa nhắn. */
function fakeZalo({ reject = false, updates = 'one' } = {}) {
  const sent = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (reject) return new Response(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }), { status: 401 });
    if (url.endsWith('/getUpdates') && updates === 'timeout') return Response.json({ ok: false, error_code: 408, description: 'Request timeout' });
    if (url.endsWith('/getUpdates') && updates === 'webhook') return Response.json({ ok: false, error_code: 400, description: 'Webhook is active' });
    if (url.endsWith('/getUpdates') && updates === 'down') throw new TypeError('fetch failed');
    if (url.endsWith('/getUpdates')) {
      return Response.json({ ok: true, result: { event_name: 'message.text.received', message: {
        from: { id: 'u1', display_name: 'Nguyễn Văn A' }, chat: { id: 'chat-a', chat_type: 'PRIVATE' }, text: 'xin chào', message_id: 'm1', date: 1
      } } });
    }
    sent.push({ url, chatId: body.chat_id, text: body.text });
    return Response.json({ ok: true, result: { message_id: `m${sent.length}`, date: Date.now() } });
  };
  return { fetch, sent };
}

test('splitMessage / messagesFor / chatsFromUpdates: chia tin ≤ 2000 ký tự theo dòng; lọc theo tổ; lấy chat_id', () => {
  const parts = splitMessage(Array.from({ length: 50 }, (_, i) => `dòng ${i} ${'x'.repeat(80)}`).join('\n'));
  assert.ok(parts.length > 1 && parts.every(p => p.length <= 2000));
  assert.equal(parts.join('\n').split('\n').length, 50);
  assert.ok(splitMessage('y'.repeat(4500)).every(p => p.length <= 2000));

  const described = [{ line: '• Hoãn: A', teams: ['Tổ 1'] }, { line: '• Phát sinh: B', teams: ['Tổ 2'] }];
  assert.deepEqual(messagesFor(described, { department: 'Tổ 3' }), []);
  const [one] = messagesFor(described, { department: 'Tổ 1', source: 'Tự tải 07:00', appUrl: 'https://dkct.onrender.com' });
  assert.match(one, /^⚡ Lịch cắt điện thay đổi \(Tự tải 07:00\) — Tổ 1: 1 mục/);
  assert.ok(one.includes('• Hoãn: A') && !one.includes('Phát sinh'));
  assert.match(one, /Xem chi tiết: https:\/\/dkct\.onrender\.com$/);
  assert.equal(messagesFor(described, {})[0].split('\n').length, 4, 'không chọn tổ: mọi thay đổi');
  const many = Array.from({ length: 200 }, (_, i) => ({ line: `• Phát sinh: ${i} ${'z'.repeat(100)}`, teams: [] }));
  const capped = messagesFor(many, {});
  assert.equal(capped.length, 4);
  assert.match(capped[3], /còn nhiều thay đổi khác \(tổng 200 mục\)/);

  assert.deepEqual(chatsFromUpdates([{ message: { chat: { id: 'g1', chat_type: 'GROUP' }, from: { display_name: 'B' }, text: 'hi' } }, {}]),
    [{ chatId: 'g1', type: 'GROUP', name: 'B', text: 'hi', date: null }]);
});

test('cấu hình Zalo: chỉ admin; token mã hóa, không trả về; người nhận hợp lệ; tìm người vừa nhắn bot; gửi thử', async () => {
  const zalo = fakeZalo();
  const app = await startApp({ secretKey: 'khoa-thu', zalo: { token: '', fetch: zalo.fetch } });
  try {
    assert.equal((await app.call('lead', 'GET', '/zalo-settings')).status, 403);
    assert.equal((await app.call('lead', 'PUT', '/zalo-settings', { token: TOKEN })).status, 403);
    let v = (await app.call('admin', 'GET', '/zalo-settings')).body;
    assert.deepEqual([v.hasToken, v.enabled, v.onAuto, v.onManual, v.canStoreToken], [false, true, true, false, true]);
    assert.ok(v.departments.includes(LD));

    assert.equal((await app.call('admin', 'PUT', '/zalo-settings', { token: 'abc/../x?y' })).status, 400, 'token có ký tự lạ');
    assert.equal((await app.call('admin', 'PUT', '/zalo-settings', { recipients: [{ chatId: 'a b' }] })).status, 400);
    assert.equal((await app.call('admin', 'PUT', '/zalo-settings', { recipients: [{ chatId: 'x', department: 'Tổ không có' }] })).status, 400);
    assert.equal((await app.call('admin', 'PUT', '/zalo-settings', { appUrl: 'javascript:alert(1)' })).status, 400);
    const put = await app.call('admin', 'PUT', '/zalo-settings', {
      token: TOKEN, appUrl: 'https://dkct.onrender.com',
      recipients: [{ chatId: 'chat-a', label: 'Anh A', department: LD }, { chatId: 'chat-a', label: 'trùng' }, { chatId: '', label: 'trống' }]
    });
    assert.equal(put.status, 200);
    assert.equal(put.body.hasToken, true);
    assert.equal(JSON.stringify(put.body).includes(TOKEN), false, 'không trả token');
    assert.deepEqual(put.body.recipients, [{ chatId: 'chat-a', label: 'Anh A', department: LD }]);
    const stored = await app.db.queryOne("SELECT value FROM dkct_settings WHERE name = 'zalo.config'");
    assert.equal(stored.value.includes(TOKEN), false, 'token lưu mã hóa');

    const found = (await app.call('admin', 'POST', '/zalo-settings/discover')).body.chats;
    assert.deepEqual(found.map(c => [c.chatId, c.name]), [['chat-a', 'Nguyễn Văn A']]);
    const t = (await app.call('admin', 'POST', '/zalo-settings/test', {})).body;
    assert.deepEqual([t.sent, t.failed.length], [1, 0]);
    assert.equal(zalo.sent[0].url, `${API_BASE}/bot${TOKEN}/sendMessage`);
    assert.equal(zalo.sent[0].chatId, 'chat-a');

    // xóa token: tắt hẳn
    v = (await app.call('admin', 'PUT', '/zalo-settings', { clearToken: true })).body;
    assert.equal(v.hasToken, false);
    assert.equal((await app.call('admin', 'POST', '/zalo-settings/test', {})).status, 400);
  } finally { app.close(); }
});

test('Zalo báo biến động lịch sau khi tự tải theo giờ hẹn; lọc theo tổ; bấm tải / chọn file chỉ gửi khi bật', async () => {
  const zalo = fakeZalo();
  const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm 220kV Phan Thiết', 'Thí nghiệm MC 272', '', 'TTĐ Lâm Đồng', '', ''];
  let rows = [A];
  const sourceFetch = async (url, init) => {
    if (init.method === 'GET') return new Response('<input type="hidden" name="__VIEWSTATE" value="vs" /><input name="txtTuNgay" />', { headers: { 'content-type': 'text/html' } });
    return new Response(xlsx(rows), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  };
  const app = await startApp({
    secretKey: 'khoa-thu', zalo: { token: '', fetch: zalo.fetch },
    outageSource: { url: 'https://lich.test/lcd.aspx', user: 'u', password: 'p', fetch: sourceFetch }, outageAuto: { times: '07:00,15:00', days: 3 }
  });
  const info = console.info;
  console.info = () => {};
  try {
    await app.call('admin', 'PUT', '/team-areas', { department: LD, areas: ['Truyền tải điện Lâm Đồng'] });
    await app.call('admin', 'PUT', '/zalo-settings', {
      token: TOKEN,
      recipients: [{ chatId: 'to-ld', label: 'Tổ LĐ', department: LD }, { chatId: 'to-vt', label: 'Tổ VT', department: 'Tổ Vận tải' }, { chatId: 'tat-ca', label: 'Chung' }]
    });
    const at = (iso) => new Date(iso);
    const first = await app.dkct.autoFetch.tick(at('2024-10-05T00:00:30Z')); // 07:00: lịch nạp lần đầu
    assert.equal(first.zalo, 0, 'không có thay đổi so với lịch trước');
    // 15:00: phát sinh một dòng -> báo người nhận của tổ LĐ và người nhận chung, không báo tổ VT
    rows = [A, ['06/10/2024 07h00', '06/10/2024 17h00', 'Trạm 220kV Phan Thiết', 'Thí nghiệm MC 272', '', 'TTĐ Lâm Đồng', '', '']];
    const second = await app.dkct.autoFetch.tick(at('2024-10-05T08:00:00Z'));
    assert.equal(second.zalo, 2);
    assert.deepEqual(zalo.sent.map(m => m.chatId).sort(), ['tat-ca', 'to-ld']);
    assert.match(zalo.sent[0].text, /^⚡ Lịch cắt điện thay đổi \(Tự tải 15:00 05\/10\/2024\)/);
    assert.match(zalo.sent[0].text, /• Phát sinh: 06\/10 07:00 Trạm 220kV Phan Thiết — Thí nghiệm MC 272/);

    // chọn file có thay đổi: mặc định không gửi Zalo
    zalo.sent.length = 0;
    const upload = await app.call('lead', 'POST', '/outages/import/commit', excelFrom([{ ...A, 7: 'Hoãn' }].map(r => Object.values(r)), ['2024-10-05', '2024-10-05']));
    assert.equal(upload.body.logged, 1);
    assert.equal(upload.body.zalo, 0);
    assert.equal(zalo.sent.length, 0);

    // bật "cả khi bấm tải / chọn file" thì gửi
    await app.call('admin', 'PUT', '/zalo-settings', { onManual: true });
    const again = await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A], ['2024-10-05', '2024-10-05']));
    assert.equal(again.body.zalo, 2);
    assert.ok(zalo.sent.every(m => /Có lại trong lịch/.test(m.text)));

    const status = (await app.call('admin', 'GET', '/zalo-settings')).body.status;
    assert.deepEqual([status.sent, status.errors], [2, []]);
  } finally { console.info = info; app.close(); }
});

test('Zalo lỗi (token sai): việc nạp lịch vẫn xong, ghi lỗi để admin xem', async () => {
  const zalo = fakeZalo({ reject: true });
  const app = await startApp({ secretKey: 'khoa-thu', zalo: { token: '', fetch: zalo.fetch } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await app.call('admin', 'PUT', '/zalo-settings', { token: TOKEN, onManual: true, recipients: [{ chatId: 'c1', label: 'A' }] });
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', '', '', '', ''];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A]));
    const r = await app.call('lead', 'POST', '/outages/import/commit', excelFrom([], ['2024-10-05', '2024-10-05']));
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.logged, r.body.zalo], [1, 0]);
    const status = (await app.call('admin', 'GET', '/zalo-settings')).body.status;
    assert.match(status.errors[0], /^A: Zalo từ chối token/);
    assert.equal(JSON.stringify(status).includes(TOKEN), false);
    const t = (await app.call('admin', 'POST', '/zalo-settings/test', {})).body;
    assert.equal(t.failed.length, 1);
  } finally { console.warn = warn; app.close(); }
});

test('Tìm người vừa nhắn bot: chưa có tin mới (408) -> danh sách trống; lỗi Zalo hiện đúng lý do, không phải "Lỗi máy chủ"', async () => {
  for (const [updates, status, pattern] of [
    ['timeout', 200, null],
    ['webhook', 409, /webhook/],
    ['down', 424, /Không kết nối được Zalo Bot API/]
  ]) {
    const app = await startApp({ secretKey: 'khoa-thu', zalo: { token: '', fetch: fakeZalo({ updates }).fetch } });
    try {
      await app.call('admin', 'PUT', '/zalo-settings', { token: TOKEN });
      const r = await app.call('admin', 'POST', '/zalo-settings/discover');
      assert.equal(r.status, status, updates);
      if (pattern) assert.match(r.body.error, pattern);
      else assert.deepEqual(r.body.chats, []);
    } finally { app.close(); }
  }
  const bad = await startApp({ secretKey: 'khoa-thu', zalo: { token: '', fetch: fakeZalo({ reject: true }).fetch } });
  try {
    await bad.call('admin', 'PUT', '/zalo-settings', { token: TOKEN });
    const r = await bad.call('admin', 'POST', '/zalo-settings/discover');
    assert.equal(r.status, 424);
    assert.match(r.body.error, /Zalo từ chối token/);
  } finally { bad.close(); }
});
