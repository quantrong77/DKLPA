const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers/app');
const { makePng } = require('./helpers/png');

/** 6 điểm của core theo quy ước Xk-1/-4…, kS1/kS2 (dữ liệu thử). */
const points = (no, block = `X4${no}`, ct2 = 'S2') =>
  [1, 4, 2, 5, 3, 6].map((t, i) => ({ terminal: `${block}-${t}`, ctTerminal: `${no}${i % 2 ? ct2 : 'S1'}` }));
const pageForm = ({ image = makePng(400, 300), pageLabel = '115/147', newRevision } = {}) => {
  const form = new FormData();
  if (image) form.append('image', new Blob([image], { type: 'image/png' }), 'trang.png');
  form.append('pageLabel', pageLabel);
  form.append('fileName', 'D02-272.pdf');
  if (newRevision) form.append('newRevision', '1');
  return form;
};

async function setup() {
  const app = await startApp();
  const sub = (await app.call('admin', 'GET', '/substations')).body.items.find(s => s.name === 'TBA 220kV Phan Rí');
  return { app, sub };
}

test('Thư viện mạch dòng: chỉ admin thêm/sửa; ai đăng nhập cũng xem; mặc định 4 core trống', async () => {
  const { app, sub } = await setup();
  try {
    const body = { substationId: sub.id, name: 'TI 272', bay: '272', panel: '=D02+MK202' };
    assert.equal((await app.call('lead', 'POST', '/ct-library', body)).status, 403, 'trưởng tổ chưa được sửa (tạm thời chỉ admin)');
    assert.equal((await app.call('admin', 'POST', '/ct-library', { ...body, substationId: 'KHONG-CO' })).status, 400);
    const created = await app.call('admin', 'POST', '/ct-library', body);
    assert.equal(created.status, 201);
    const ct = created.body.ct;
    assert.equal(ct.status, 'DRAFT');
    assert.deepEqual(ct.cores.map(c => c.coreNo), [1, 2, 3, 4]);
    assert.equal(ct.cores[0].points.length, 6);
    assert.equal(ct.cores[0].points[0].status, 'INSUFFICIENT_DATA');
    assert.ok(created.body.issues.some(i => i.code === 'INSUFFICIENT_DATA'));

    const list = (await app.call('member', 'GET', `/ct-library?substationId=${sub.id}`)).body.items;
    assert.deepEqual(list.map(x => [x.name, x.coreCount, x.substationName]), [['TI 272', 4, 'TBA 220kV Phan Rí']]);
    assert.equal((await app.call('member', 'GET', `/ct-library/${ct.id}`)).status, 200);
    assert.equal((await app.call('admin', 'POST', '/ct-library', body)).status, 409, 'trùng tên TI trong trạm');
  } finally { app.close(); }
});

test('Thư viện mạch dòng: lưu core/điểm, ghi nhật ký thay đổi, xác nhận khi đủ dữ liệu; sửa sau xác nhận thì về nháp', async () => {
  const { app, sub } = await setup();
  try {
    const ct = (await app.call('admin', 'POST', '/ct-library', { substationId: sub.id, name: 'TI 272', panel: '=D02+MK202' })).body.ct;
    const page = (await app.call('admin', 'POST', `/ct-library/${ct.id}/pages`, pageForm())).body.page;
    assert.equal(page.pageLabel, '115/147');
    assert.equal((await app.call('member', 'GET', `/ct-pages/${page.id}/image`)).headers.get('content-type'), 'image/png');

    const cores = [1, 2].map(no => ({ coreNo: no, terminalBlock: `X4${no}`, drawingRef: '=D02+MK202/115', pageId: page.id,
      region: { x: 0.1 * no, y: 0.1, w: 0.3, h: 0.5 }, points: points(no) }));
    cores[1].points[5].ctTerminal = '';
    const saved = await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.ct.cores[0].region, { x: 0.1, y: 0.1, w: 0.3, h: 0.5 });
    assert.equal(saved.body.ct.cores[0].points[1].terminal, 'X41-4');

    const blocked = await app.call('admin', 'POST', `/ct-library/${ct.id}/verify`);
    assert.equal(blocked.status, 422, 'còn ô CHƯA ĐỦ DỮ LIỆU thì chưa xác nhận được');
    assert.match(blocked.body.error, /CHƯA ĐỦ DỮ LIỆU/);

    cores[1].points[5].ctTerminal = '2S2';
    await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores });
    const verified = await app.call('admin', 'POST', `/ct-library/${ct.id}/verify`);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.ct.status, 'VERIFIED');
    assert.ok(verified.body.ct.cores.every(c => c.points.every(p => p.status === 'VERIFIED')));

    cores[0].points[1].ctTerminal = '1S4';
    const edited = (await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores })).body.ct;
    assert.equal(edited.status, 'DRAFT', 'sửa sau khi xác nhận thì phải xác nhận lại');
    const audit = (await app.call('admin', 'GET', `/ct-library/${ct.id}/audit`)).body.items;
    assert.ok(audit.some(a => a.action === 'VERIFY'));
    assert.ok(audit[0].changes.some(c => c.core === 1 && c.seq === 2 && c.from === '1S2' && c.to === '1S4'), 'mới nhất trước');
    // lưu lại y nguyên: không đổi trạng thái, không thêm nhật ký
    await app.call('admin', 'POST', `/ct-library/${ct.id}/verify`);
    const again = (await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores })).body.ct;
    assert.equal(again.status, 'VERIFIED');
  } finally { app.close(); }
});

test('Bản vẽ cập nhật: tăng phiên bản, TI về nháp; trang cũ vẫn xem được (phương án đã lập trỏ tới)', async () => {
  const { app, sub } = await setup();
  try {
    const ct = (await app.call('admin', 'POST', '/ct-library', { substationId: sub.id, name: 'TI 272' })).body.ct;
    const old = (await app.call('admin', 'POST', `/ct-library/${ct.id}/pages`, pageForm())).body.page;
    const cores = [{ coreNo: 1, terminalBlock: 'X41', pageId: old.id, points: points(1) }];
    await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores });
    await app.call('admin', 'POST', `/ct-library/${ct.id}/verify`);

    const added = await app.call('admin', 'POST', `/ct-library/${ct.id}/pages`, pageForm({ pageLabel: '115/150', newRevision: true }));
    assert.equal(added.status, 201);
    const now = (await app.call('admin', 'GET', `/ct-library/${ct.id}`)).body.ct;
    assert.equal(now.revision, 2);
    assert.equal(now.status, 'DRAFT');
    assert.deepEqual(now.pages.map(p => [p.revision, p.pageLabel]), [[1, '115/147'], [2, '115/150']]);
    assert.equal((await app.call('member', 'GET', `/ct-pages/${old.id}/image`)).status, 200);
    assert.equal((await app.call('admin', 'DELETE', `/ct-pages/${old.id}`)).status, 409, 'trang đang dùng cho core thì không xóa');
  } finally { app.close(); }
});

test('Trang mạch dòng: chỉ nhận ảnh PNG/JPG hợp lệ; ẩn TI thì không còn trong danh sách', async () => {
  const { app, sub } = await setup();
  try {
    const ct = (await app.call('admin', 'POST', '/ct-library', { substationId: sub.id, name: 'TI 272' })).body.ct;
    const bad = pageForm({ image: Buffer.from('%PDF-1.7 không phải ảnh') });
    assert.equal((await app.call('admin', 'POST', `/ct-library/${ct.id}/pages`, bad)).status, 400);
    assert.equal((await app.call('lead', 'POST', `/ct-library/${ct.id}/pages`, pageForm())).status, 403);
    assert.equal((await app.call('admin', 'DELETE', `/ct-library/${ct.id}`)).status, 200);
    assert.deepEqual((await app.call('member', 'GET', '/ct-library')).body.items, []);
  } finally { app.close(); }
});

test('Lưu TI: core trùng số vẫn lưu đúng dòng đã sửa; chỉ đổi thứ tự core cũng được lưu', async () => {
  const { app, sub } = await setup();
  try {
    const ct = (await app.call('admin', 'POST', '/ct-library', { substationId: sub.id, name: 'TI 272' })).body.ct;
    const two = (await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores: [
      { coreNo: 1, terminalBlock: 'X41', points: points(1) }, { coreNo: 1, terminalBlock: 'X42', points: points(1, 'X42') }] })).body.ct;
    const cores = two.cores.map(c => ({ ...c }));
    cores[0] = { ...cores[0], points: cores[0].points.map((p, i) => (i === 0 ? { ...p, terminal: 'X41-9' } : p)) };
    const saved = (await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores })).body.ct;
    assert.equal(saved.cores[0].points[0].terminal, 'X41-9', 'không bỏ qua sửa đổi khi số core trùng');
    const swapped = (await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores: [saved.cores[1], saved.cores[0]] })).body.ct;
    assert.deepEqual(swapped.cores.map(c => c.terminalBlock), ['X42', 'X41']);
  } finally { app.close(); }
});

test('Trang bản vẽ: không xóa được trang mà phương án đã lập đang trỏ tới', async () => {
  const { app, sub } = await setup();
  try {
    const ct = (await app.call('admin', 'POST', '/ct-library', { substationId: sub.id, name: 'TI 272' })).body.ct;
    const page = (await app.call('admin', 'POST', `/ct-library/${ct.id}/pages`, pageForm())).body.page;
    await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores: [{ coreNo: 1, terminalBlock: 'X41', pageId: page.id, points: points(1) }] });
    const lib = (await app.call('admin', 'GET', `/ct-library/${ct.id}`)).body.ct;
    await app.call('admin', 'POST', '/plans', { ...(await planInput(app, sub)), ctBlocks: [snapshot(lib)] });
    // core chuyển sang trang khác: trang cũ không còn core nào dùng nhưng phương án vẫn trỏ tới
    const other = (await app.call('admin', 'POST', `/ct-library/${ct.id}/pages`, pageForm({ pageLabel: '116/147' }))).body.page;
    await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...lib, cores: [{ ...lib.cores[0], pageId: other.id }] });
    assert.equal((await app.call('admin', 'DELETE', `/ct-pages/${page.id}`)).status, 409);
  } finally { app.close(); }
});

test('Phương án: trạng thái "đã xác nhận" của bảng mạch dòng do máy chủ đối chiếu thư viện, không tin dữ liệu gửi lên', async () => {
  const { app, sub } = await setup();
  try {
    const ct = (await app.call('admin', 'POST', '/ct-library', { substationId: sub.id, name: 'TI 272', panel: '=D02+MK202' })).body.ct;
    await app.call('admin', 'PUT', `/ct-library/${ct.id}`, { ...ct, cores: [{ coreNo: 1, terminalBlock: 'X41', points: points(1) }] });
    await app.call('admin', 'POST', `/ct-library/${ct.id}/verify`);
    const lib = (await app.call('admin', 'GET', `/ct-library/${ct.id}`)).body.ct;
    const input = await planInput(app, sub);
    const ok = (await app.call('lead', 'POST', '/plans', { ...input, ctBlocks: [snapshot(lib)] })).body.plan;
    assert.equal(ok.data.ctBlocks[0].status, 'VERIFIED');
    const forged = snapshot(lib);
    forged.cores[0].points[0].ctTerminal = '9S9';
    const bad = (await app.call('lead', 'POST', '/plans', { ...input, ctBlocks: [forged] })).body.plan;
    assert.equal(bad.data.ctBlocks[0].status, 'DRAFT', 'bảng khác thư viện đã xác nhận thì in bản nháp');
    const fake = (await app.call('lead', 'POST', '/plans', { ...input, ctBlocks: [{ ...snapshot(lib), ctId: 'KHONG-CO' }] })).body.plan;
    assert.equal(fake.data.ctBlocks[0].status, 'DRAFT');
  } finally { app.close(); }
});

/** Bản chụp TI như client/lib/ctLibrary.blockFromLibrary. */
function snapshot(ct) {
  return {
    ctId: ct.id, revision: ct.revision, status: 'VERIFIED', name: ct.name, panel: ct.panel, coresShown: 4, updatedAt: ct.updatedAt,
    cores: ct.cores.map(c => ({ coreId: c.id, coreNo: c.coreNo, terminalBlock: c.terminalBlock, drawingRef: c.drawingRef, pageId: c.pageId, region: c.region,
      points: c.points.map(p => ({ terminal: p.terminal || '', ctTerminal: p.ctTerminal || '' })) }))
  };
}

async function planInput(app, sub) {
  return { header: { teamName: 'Tổ Thí nghiệm điện Lâm Đồng', teamShort: 'TNLĐ' }, workType: 'Thí nghiệm định kỳ', equipmentText: 'ngăn 272', bays: '272',
    station: { substationId: sub.id }, people: [] };
}
