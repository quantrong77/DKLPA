const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { startApp, USERS } = require('./helpers/app');
const { notificationFor, cleanSubscription } = require('../server/services/webPush');
const createDkctModule = require('../server');

const HEADER = ['Thời gian bắt đầu', 'Thời gian kết thúc', 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'];
const excelFrom = (rows, range) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['LỊCH CẮT ĐIỆN'], [], HEADER, ...rows]), 'Sheet1');
  const f = new FormData();
  f.append('file', new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })]), 'lich.xlsx');
  if (range) { f.append('compareFrom', range[0]); f.append('compareTo', range[1]); }
  return f;
};
const LD = USERS.lead.department;
const KEY = 'BOrYwJ8w3b0Yb4l5mGkS5uM0Gq3b0bG0D2l8Y8D0bq9wq1v3ZbI7m1X2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s';
const sub = (n) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/thiet-bi-${n}`, keys: { p256dh: `${KEY}${n}`, auth: 'c2VjcmV0LWF1dGgtMTIz' } });

/** Dịch vụ đẩy giả: ghi lại tin; endpoint có trong `gone` trả 410 (thiết bị đã hủy). */
function fakePush(gone = new Set()) {
  const sent = [];
  const send = async (s, payload, options) => {
    if (gone.has(s.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload), options });
  };
  return { sent, send, gone };
}

test('notificationFor: lọc theo tổ, rút gọn thân tin, tiêu đề có số mục', () => {
  const described = [
    { line: '• Hoãn: 05/10 07:00 Trạm A — việc A', teams: [LD] },
    { line: '• Phát sinh: 06/10 07:00 Trạm B — việc B', teams: ['Tổ Vận tải'] }
  ];
  const mine = notificationFor(described, { department: LD, openUrl: 'https://dkct.test/' });
  assert.equal(mine.title, `⚡ Lịch cắt điện thay đổi: 1 mục — ${LD}`);
  assert.equal(mine.body, '• Hoãn: 05/10 07:00 Trạm A — việc A');
  assert.equal(mine.url, 'https://dkct.test/');
  assert.equal(notificationFor(described, {}).title, '⚡ Lịch cắt điện thay đổi: 2 mục');
  assert.equal(notificationFor(described, { department: 'Tổ khác' }), null);
  const many = Array.from({ length: 30 }, (_, i) => ({ line: `• Phát sinh: dòng số ${i} ${'x'.repeat(60)}`, teams: [LD] }));
  const long = notificationFor(many, {});
  assert.ok(long.body.length < 1000);
  assert.match(long.body, /… và \d+ thay đổi khác\.$/);
});

test('cleanSubscription: chỉ nhận endpoint https và khóa base64url', () => {
  assert.equal(cleanSubscription(sub(1)).endpoint, sub(1).endpoint);
  assert.throws(() => cleanSubscription({ ...sub(1), endpoint: 'http://x.test/a' }), { status: 400 });
  assert.throws(() => cleanSubscription({ ...sub(1), endpoint: 'javascript:alert(1)' }), { status: 400 });
  assert.throws(() => cleanSubscription({ ...sub(1), keys: { p256dh: 'có dấu', auth: 'x' } }), { status: 400 });
  assert.throws(() => cleanSubscription({}), { status: 400 });
});

test('thông báo đẩy: khóa VAPID chung trong CSDL, bật / tắt từng thiết bị, gửi khi lịch thay đổi theo tổ, gửi thử, xóa thiết bị đã hủy', async () => {
  const push = fakePush();
  const app = await startApp({ pushSend: push.send });
  try {
    const config = (await app.call('member', 'GET', '/push/config')).body;
    assert.match(config.publicKey, /^[A-Za-z0-9_-]{80,}$/);
    assert.deepEqual(config.devices, []);
    assert.equal(config.department, LD);
    assert.equal((await app.call('lead', 'GET', '/push/config')).body.publicKey, config.publicKey, 'một khóa cho mọi người');
    const stored = JSON.parse((await app.db.queryOne("SELECT value FROM dkct_settings WHERE name = 'push.vapid'")).value);
    assert.equal(stored.publicKey, config.publicKey);

    assert.equal((await app.call('member', 'POST', '/push/subscriptions', { subscription: { endpoint: 'http://x' } })).status, 400);
    const on = await app.call('member', 'POST', '/push/subscriptions', { subscription: sub(1), scope: 'team', label: 'Chrome trên Android', openUrl: 'https://dkct.test/' });
    assert.equal(on.status, 201);
    assert.equal(on.body.device.current, true);
    assert.equal(on.body.device.label, 'Chrome trên Android');
    await app.call('other', 'POST', '/push/subscriptions', { subscription: sub(2), scope: 'team', openUrl: 'javascript:alert(1)' });
    await app.call('admin', 'POST', '/push/subscriptions', { subscription: sub(3), scope: 'all' });
    // cùng trình duyệt đăng nhập tài khoản khác: thiết bị chuyển sang người mới, không nhân đôi
    await app.call('lead', 'POST', '/push/subscriptions', { subscription: sub(4) });
    await app.call('member', 'POST', '/push/subscriptions', { subscription: sub(4), scope: 'all' });
    assert.equal((await app.call('lead', 'GET', '/push/config')).body.devices.length, 0);
    const mine = (await app.call('member', 'GET', `/push/config?endpoint=${encodeURIComponent(sub(4).endpoint)}`)).body.devices;
    assert.deepEqual(mine.map(d => [d.scope, d.current]), [['team', false], ['all', true]]);
    assert.equal(mine.some(d => 'endpoint' in d || 'endpointHash' in d), false, 'không trả endpoint ra ngoài');

    // lịch thay đổi (trạm của tổ LĐ): thiết bị tổ LĐ, thiết bị nhận tất cả; tổ Vận tải không nhận
    await app.call('admin', 'PUT', '/team-areas', { department: LD, areas: ['Truyền tải điện Lâm Đồng'] });
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm 220kV Phan Thiết', 'Thí nghiệm MC 272', '', 'TTĐ Lâm Đồng', '', ''];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A]));
    assert.equal(push.sent.length, 0, 'nạp lần đầu: không có thay đổi');
    push.gone.add(sub(3).endpoint); // thiết bị admin đã hủy đăng ký ở trình duyệt
    const r = await app.call('lead', 'POST', '/outages/import/commit', excelFrom([{ ...A, 7: 'Hoãn' }].map(x => Object.values(x)), ['2024-10-05', '2024-10-05']));
    assert.equal(r.body.logged, 1);
    assert.deepEqual(push.sent.map(s => s.endpoint).sort(), [sub(1).endpoint, sub(4).endpoint]);
    const msg = push.sent.find(s => s.endpoint === sub(1).endpoint);
    assert.equal(msg.payload.title, `⚡ Lịch cắt điện thay đổi: 1 mục — ${LD}`);
    assert.match(msg.payload.body, /Trạm 220kV Phan Thiết/);
    assert.equal(msg.payload.url, 'https://dkct.test/');
    assert.equal(msg.options.vapidDetails.publicKey, config.publicKey);
    assert.equal(msg.options.TTL, 12 * 3600);
    assert.equal(await app.db.queryOne('SELECT id FROM dkct_push_subscriptions WHERE userId = ?', [USERS.admin.id]), null, '410: xóa thiết bị');
    assert.equal((await app.db.queryOne('SELECT openUrl FROM dkct_push_subscriptions WHERE userId = ?', [USERS.other.id])).openUrl, '', 'bỏ địa chỉ không phải http(s)');

    // gửi thử: chỉ thiết bị của mình
    push.sent.length = 0;
    const t = (await app.call('member', 'POST', '/push/test', {})).body;
    assert.deepEqual(t, { sent: 2, total: 2 });
    assert.ok(push.sent.every(s => /Thử thông báo/.test(s.payload.title)));
    assert.equal((await app.call('lead', 'POST', '/push/test', {})).status, 400, 'chưa bật thiết bị nào');

    // tắt thiết bị đang dùng; gỡ thiết bị khác trong danh sách; không gỡ được của người khác
    let devices = (await app.call('member', 'POST', '/push/unsubscribe', { endpoint: sub(4).endpoint })).body.devices;
    assert.equal(devices.length, 1);
    const otherId = (await app.db.queryOne('SELECT id FROM dkct_push_subscriptions WHERE userId = ?', [USERS.other.id])).id;
    await app.call('member', 'DELETE', `/push/subscriptions/${otherId}`);
    assert.ok(await app.db.queryOne('SELECT id FROM dkct_push_subscriptions WHERE id = ?', [otherId]));
    devices = (await app.call('member', 'DELETE', `/push/subscriptions/${devices[0].id}`)).body.devices;
    assert.deepEqual(devices, []);
  } finally { app.close(); }
});

test('service worker /dkct-sw.js: ứng dụng chủ phục vụ công khai, kiểu JavaScript, không lưu đệm', async () => {
  const express = require('express');
  const app = express();
  app.get(createDkctModule.SERVICE_WORKER_PATH, createDkctModule.serveServiceWorker);
  const server = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/dkct-sw.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    const js = await res.text();
    assert.match(js, /addEventListener\('push'/);
    assert.match(js, /addEventListener\('notificationclick'/);
  } finally { server.close(); }
});
