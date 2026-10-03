const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const { USERS, startApp } = require('./helpers/app');

function excelForm() {
  const form = new FormData();
  const file = fs.readFileSync(path.join(__dirname, 'fixtures', 'lichcatdien-sample.xlsx'));
  form.append('file', new Blob([file]), 'lichcatdien.xlsx');
  return form;
}

async function validInput(call) {
  const personnel = (await call('lead', 'GET', '/personnel')).body.items;
  const stations = (await call('lead', 'GET', '/stations')).body.items;
  const find = (name) => personnel.find(p => p.fullName === name).id;
  return {
    header: { unitName: 'Đội Sửa chữa, thí nghiệm điện 3', teamName: 'Tổ Thí nghiệm điện Lâm Đồng', place: 'Lâm Đồng', date: '2026-09-23' },
    recipient: { stationId: stations.find(s => s.name.includes('Vĩnh Tân')).id },
    workContent: { text: 'TNĐK ngăn MBA AT1', source: 'manual' },
    workLocation: 'Trạm 500kV Vĩnh Tân',
    condition: { text: 'Cô lập MBA AT1', source: 'manual' },
    time: { start: '2026-10-07T17:00', end: '2026-10-08T07:00', source: 'manual' },
    workUnits: [{ commander: { personnelId: find('Trần Văn Hoàng') }, members: [{ personnelId: find('Kim Văn Quỳnh') }] }],
    nominees: [{ person: { personnelId: find('Trần Văn Hoàng') }, duty: 'Chỉ huy trực tiếp đơn vị công tác 1' }],
    permits: [{ isolation: 'Cô lập MBA AT1', workUnitSeq: 1, content: 'TNĐK', workers: [{ personnelId: find('Kim Văn Quỳnh') }] }]
  };
}

test('migrate nạp danh mục ban đầu và chạy lại nhiều lần không nhân đôi', async () => {
  const app = await startApp();
  try {
    const { body } = await app.call('member', 'GET', '/personnel');
    assert.equal(body.items.length, 16);
    const hoang = body.items.find(p => p.fullName === 'Trần Văn Hoàng');
    assert.equal(hoang.safetyLevel, '5/5');
    assert.equal(hoang.safetyCard, '058');
    assert.equal((await app.call('member', 'GET', '/risks')).body.items.length, 17);
    const stations = (await app.call('member', 'GET', '/stations')).body.items;
    assert.equal(stations.find(s => s.name === 'Tổ QLVH TBA 500kV Vĩnh Tân').email, 'tramvinhtan@gmail.com');
    assert.ok((await app.call('member', 'GET', '/duties')).body.items.length >= 5);
  } finally { app.close(); }
});

test('danh mục: chỉ trưởng/phó tổ, trưởng phòng, admin được sửa; xóa là ẩn đi', async () => {
  const app = await startApp();
  try {
    const denied = await app.call('member', 'POST', '/personnel', { fullName: 'A' });
    assert.equal(denied.status, 403);
    const created = await app.call('lead', 'POST', '/personnel', { fullName: ' Phạm Văn Mới ', safetyLevel: '4/5', safetyCard: '070', hacked: 'x' });
    assert.equal(created.status, 201);
    assert.equal(created.body.item.fullName, 'Phạm Văn Mới');
    assert.equal(created.body.item.hacked, undefined);
    const id = created.body.item.id;
    const updated = await app.call('lead', 'PUT', `/personnel/${id}`, { fullName: 'Phạm Văn Mới', safetyLevel: '5/5', safetyCard: '070' });
    assert.equal(updated.body.item.safetyLevel, '5/5');
    assert.equal((await app.call('lead', 'POST', '/personnel', { fullName: '  ' })).status, 400);
    assert.equal((await app.call('lead', 'DELETE', `/personnel/${id}`)).status, 200);
    const list = (await app.call('lead', 'GET', '/personnel')).body.items;
    assert.ok(!list.some(p => p.id === id));
    assert.equal((await app.call('lead', 'GET', '/personnel?includeInactive=1')).body.items.some(p => p.id === id), true);
  } finally { app.close(); }
});

test('lịch cắt điện: xem trước, lưu, import lại không trùng; thành viên thường không được import', async () => {
  const app = await startApp();
  try {
    assert.equal((await app.call('member', 'POST', '/outages/import/preview', excelForm())).status, 403);
    const preview = await app.call('lead', 'POST', '/outages/import/preview', excelForm());
    assert.equal(preview.status, 200);
    assert.equal(preview.body.rows.length, 64);
    assert.equal(preview.body.rows.filter(r => r.alreadyImported).length, 0);

    const commit = await app.call('lead', 'POST', '/outages/import/commit', excelForm());
    assert.deepEqual({ inserted: commit.body.inserted, skipped: commit.body.skipped }, { inserted: 64, skipped: 0 });
    const again = await app.call('lead', 'POST', '/outages/import/commit', excelForm());
    assert.deepEqual({ inserted: again.body.inserted, skipped: again.body.skipped }, { inserted: 0, skipped: 64 });
    const preview2 = await app.call('lead', 'POST', '/outages/import/preview', excelForm());
    assert.equal(preview2.body.rows.filter(r => r.alreadyImported).length, 64);

    const list = await app.call('member', 'GET', '/outages?from=2024-10-20&to=2024-10-21&search=Krông');
    assert.ok(list.body.items.length >= 1);
    assert.ok(list.body.items.every(o => o.regStart >= '2024-10-20' && o.regStart < '2024-10-22'));
    assert.ok(list.body.items.every(o => /krông/i.test(o.location + o.content + o.scope)));

    const draft = await app.call('lead', 'GET', `/outages/${list.body.items[0].id}/draft`);
    assert.equal(draft.body.draft.workContent.source, 'outage');
    assert.equal(draft.body.draft.header.teamName, 'Tổ Thí nghiệm điện Lâm Đồng');
    assert.equal(draft.body.draft.representative.name, 'Nguyễn Hữu Kính');
    assert.equal(draft.body.draft.representative.role, 'Tổ trưởng');
    assert.equal(draft.body.draft.risks.length, 17, 'mặc định chọn toàn bộ thư viện rủi ro');
  } finally { app.close(); }
});

test('import file không phải Excel báo lỗi 400', async () => {
  const app = await startApp();
  try {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('không phải excel')]), 'x.xlsx');
    const res = await app.call('lead', 'POST', '/outages/import/preview', form);
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  } finally { app.close(); }
});

test('giấy ĐKCT: cấp số theo tổ/năm, đặt số khởi đầu, lỗi 422, xem/sửa theo phạm vi tổ', async () => {
  const app = await startApp({ legacyLastIssued: async () => 214 });
  try {
    const input = await validInput(app.call);
    assert.equal((await app.call('member', 'POST', '/registrations', input)).status, 403, 'chỉ trưởng/phó tổ lập giấy');

    const numbering = await app.call('lead', 'GET', '/numbering');
    assert.equal(numbering.body.numbering.preview, '215/ĐK-TNLĐ', 'tiếp nối số đã cấp ở module cũ');

    const bad = await app.call('lead', 'POST', '/registrations', { ...input, workUnits: [{ commander: { name: '' } }] });
    assert.equal(bad.status, 422);
    assert.deepEqual(bad.body.errors.map(e => e.field), ['workUnits.0.commander', 'permits.0.workers']);

    const created = await app.call('lead', 'POST', '/registrations', input);
    assert.equal(created.status, 201);
    assert.equal(created.body.registration.docNumber, '215/ĐK-TNLĐ');
    assert.equal(created.body.registration.data.recipient.email, 'tramvinhtan@gmail.com');
    const id = created.body.registration.id;

    assert.equal((await app.call('member', 'PUT', '/numbering', { startNumber: 300 })).status, 403);
    assert.equal((await app.call('lead', 'PUT', '/numbering', { startNumber: 215 })).status, 400, 'không lùi về số đã cấp');
    assert.equal((await app.call('lead', 'PUT', '/numbering', { startNumber: 300 })).body.numbering.preview, '300/ĐK-TNLĐ');
    const second = await app.call('lead', 'POST', '/registrations', input);
    assert.equal(second.body.registration.docNumber, '300/ĐK-TNLĐ');

    assert.equal((await app.call('member', 'GET', `/registrations/${id}`)).status, 200, 'cùng tổ được xem');
    assert.equal((await app.call('other', 'GET', `/registrations/${id}`)).status, 403, 'tổ khác không được xem');
    assert.equal((await app.call('admin', 'GET', `/registrations/${id}`)).status, 200);
    assert.equal((await app.call('other', 'GET', '/registrations')).body.items.length, 0);
    assert.equal((await app.call('member', 'GET', '/registrations?search=MBA')).body.items.length, 2);

    assert.equal((await app.call('member', 'PUT', `/registrations/${id}`, input)).status, 403);
    const upd = await app.call('lead', 'PUT', `/registrations/${id}`, { ...input, workLocation: 'Ngăn MBA AT1' });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.registration.docNumber, '215/ĐK-TNLĐ', 'sửa giấy không đổi số');
    assert.equal(upd.body.registration.data.workLocation, 'Ngăn MBA AT1');

    const docx = await app.call('member', 'GET', `/registrations/${id}/docx`);
    assert.equal(docx.status, 200);
    assert.match(docx.headers.get('content-disposition'), /filename="20260923_215-DK-TNLD_DKCT_MBA-AT1_Ngan-MBA-AT1\.docx"/);
    const xml = new PizZip(docx.body).file('word/document.xml').asText();
    assert.match(xml, /215\/ĐK-TNLĐ/);
    assert.match(xml, /Ngăn MBA AT1/);

    assert.equal((await app.call('member', 'DELETE', `/registrations/${id}`)).status, 403);
    assert.equal((await app.call('lead', 'DELETE', `/registrations/${id}`)).status, 200);
    assert.equal((await app.call('lead', 'GET', `/registrations/${id}`)).status, 404);
  } finally { app.close(); }
});

test('meta: quyền của người dùng và giá trị mặc định cho form', async () => {
  const app = await startApp();
  try {
    const lead = (await app.call('lead', 'GET', '/meta')).body;
    assert.equal(lead.permissions.canCreate, true);
    assert.equal(lead.permissions.canManageCatalog, true);
    assert.equal(lead.defaults.representative.contact, '0962524070 (kinh@example.com)');
    assert.equal(lead.defaults.header.unitName, 'Đội Sửa chữa, thí nghiệm điện 3');
    assert.equal(lead.defaults.header.teamName, 'Tổ Thí nghiệm điện Lâm Đồng');
    assert.deepEqual(lead.departments.map(d => d.name), ['Tổ Thí nghiệm điện Lâm Đồng', 'Tổ Vận tải', 'Ban giám đốc']);
    const member = (await app.call('member', 'GET', '/meta')).body;
    assert.equal(member.permissions.canCreate, false);
  } finally { app.close(); }
});

test('meta: tổ đăng ký mặc định là tổ của người lập, kể cả khi giấy gần nhất ghi tổ khác', async () => {
  const app = await startApp();
  try {
    const body = await validInput(app.call);
    body.header.teamName = 'Tổ Vận tải';
    assert.equal((await app.call('lead', 'POST', '/registrations', body)).status, 201);
    const lead = (await app.call('lead', 'GET', '/meta')).body;
    assert.equal(lead.defaults.header.teamName, 'Tổ Thí nghiệm điện Lâm Đồng');
    assert.equal(lead.defaults.header.unitName, 'Đội Sửa chữa, thí nghiệm điện 3', 'đơn vị cấp trên vẫn theo giấy gần nhất');
  } finally { app.close(); }
});

const XLSX = require('xlsx');
function excelFrom(rows) {
  const ws = XLSX.utils.aoa_to_sheet([
    ['LỊCH CẮT ĐIỆN'], [],
    ['Thời gian bắt đầu', 'Thời gian kết thúc', 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'],
    ...rows
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const form = new FormData();
  form.append('file', new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })]), 'lich.xlsx');
  return form;
}

test('import lại cùng lịch: cập nhật tình trạng/đơn vị công tác thay vì bỏ qua', async () => {
  const app = await startApp();
  try {
    const row = ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ1'];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([[...row, 'Chờ duyệt']]));
    const again = await app.call('lead', 'POST', '/outages/import/commit', excelFrom([[...row, 'Đã có lịch công tác A3']]));
    assert.deepEqual({ inserted: again.body.inserted, updated: again.body.updated }, { inserted: 0, updated: 1 });
    const [o] = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items;
    assert.equal(o.status, 'Đã có lịch công tác A3');
  } finally { app.close(); }
});

test('không xóa được dòng lịch đã có giấy ĐKCT; đếm giấy chỉ trong tổ mình', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ1', '']]));
    const [o] = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items;
    const input = { ...(await validInput(app.call)), outageId: o.id };
    assert.equal((await app.call('lead', 'POST', '/registrations', input)).status, 201);
    assert.equal((await app.call('lead', 'DELETE', `/outages/${o.id}`)).status, 409);
    const mine = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items[0];
    const other = (await app.call('other', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items[0];
    assert.equal(mine.registrationCount, 1);
    assert.equal(other.registrationCount, 0);
  } finally { app.close(); }
});

test('outageId không tồn tại bị bỏ; tìm kiếm với ký tự % không trả tất cả', async () => {
  const app = await startApp();
  try {
    const created = await app.call('lead', 'POST', '/registrations', { ...(await validInput(app.call)), outageId: 'không-có' });
    assert.equal(created.status, 201);
    assert.equal(created.body.registration.outageId, null);
    assert.equal((await app.call('lead', 'GET', '/registrations?search=%25')).body.items.length, 0);
  } finally { app.close(); }
});

test('danh mục: includeInactive=0 không hiện mục ẩn; sửa mục ẩn không tự hiện lại', async () => {
  const app = await startApp();
  try {
    const { item } = (await app.call('lead', 'POST', '/duties', { name: 'Tạm' })).body;
    await app.call('lead', 'DELETE', `/duties/${item.id}`);
    assert.ok(!(await app.call('lead', 'GET', '/duties?includeInactive=0')).body.items.some(d => d.id === item.id));
    await app.call('lead', 'PUT', `/duties/${item.id}`, { name: 'Tạm 2' });
    assert.ok(!(await app.call('lead', 'GET', '/duties')).body.items.some(d => d.id === item.id));
  } finally { app.close(); }
});

test('một giấy có dữ liệu JSON hỏng không làm hỏng /meta của cả tổ', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/registrations', await validInput(app.call));
    await app.db.execute("UPDATE dkct_registrations SET data = '{hỏng'");
    assert.equal((await app.call('lead', 'GET', '/meta')).status, 200);
  } finally { app.close(); }
});

test('nhân sự tổ khác: trưởng tổ không sửa/ẩn được; người chưa gán tổ thì sửa được', async () => {
  const app = await startApp();
  try {
    const other = await app.db.execute("INSERT INTO dkct_personnel (id, fullName, department) VALUES ('P-OTHER', 'Người tổ khác', 'Tổ Vận tải')");
    assert.ok(other);
    assert.equal((await app.call('lead', 'PUT', '/personnel/P-OTHER', { fullName: 'Sửa trộm' })).status, 403);
    assert.equal((await app.call('lead', 'DELETE', '/personnel/P-OTHER')).status, 403);
    assert.equal((await app.call('admin', 'PUT', '/personnel/P-OTHER', { fullName: 'Admin sửa', department: 'Tổ Vận tải' })).status, 200);
    const created = (await app.call('lead', 'POST', '/personnel', { fullName: 'Người mới' })).body.item;
    assert.equal(created.department, USERS.lead.department, 'người mới gán vào tổ của người tạo');
    const seeded = (await app.call('lead', 'GET', '/personnel')).body.items.find(p => p.fullName === 'Trần Văn Hoàng');
    assert.equal((await app.call('lead', 'PUT', `/personnel/${seeded.id}`, { fullName: 'Trần Văn Hoàng', safetyLevel: '5/5', safetyCard: '058' })).status, 200);
  } finally { app.close(); }
});

test('lịch cắt điện: chỉ người import hoặc admin xóa được', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', '', '', '', '']]));
    const [o] = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items;
    await app.db.execute("UPDATE dkct_outages SET importedBy = 'U-KHAC'");
    assert.equal((await app.call('lead', 'DELETE', `/outages/${o.id}`)).status, 403);
    assert.equal((await app.call('admin', 'DELETE', `/outages/${o.id}`)).status, 200);
  } finally { app.close(); }
});

test('danh sách giấy cho biết người xem có được sửa từng giấy không', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/registrations', await validInput(app.call));
    assert.equal((await app.call('lead', 'GET', '/registrations')).body.items[0].canEdit, true);
    assert.equal((await app.call('member', 'GET', '/registrations')).body.items[0].canEdit, false);
  } finally { app.close(); }
});

const { SURVEY } = require('./fixtures/sampleSurvey');
const { makePng } = require('./helpers/png');

function pngForm(buffer, type = 'image/png', name = 'sodo.png') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), name);
  return form;
}

test('BBKSHT: mặc định theo người lập, lập/sửa/xem/xóa, phân quyền theo tổ', async () => {
  const app = await startApp();
  try {
    const { draft } = (await app.call('lead', 'GET', '/survey-defaults')).body;
    assert.equal(draft.header.unitName, 'Đội Sửa chữa, thí nghiệm điện 3');
    assert.equal(draft.header.teamShort, 'TNLĐ');
    assert.deepEqual(draft.workUnitReps, [{ honorific: 'Ông', name: 'Nguyễn Hữu Kính', role: 'Tổ trưởng - Tổ TNLĐ' }]);
    assert.match(draft.surveyTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    assert.equal((await app.call('member', 'POST', '/surveys', SURVEY)).status, 403);
    const bad = await app.call('lead', 'POST', '/surveys', { ...SURVEY, workContent: '' });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.errors[0].field, 'workContent');

    const created = await app.call('lead', 'POST', '/surveys', SURVEY);
    assert.equal(created.status, 201);
    const id = created.body.survey.id;
    assert.equal(created.body.survey.hasDiagram, false);

    const list = (await app.call('member', 'GET', '/surveys?search=Tháp Chàm')).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].canEdit, false);
    assert.equal(list[0].data, undefined, 'danh sách không trả dữ liệu đầy đủ');
    assert.equal((await app.call('other', 'GET', `/surveys/${id}`)).status, 403);
    assert.equal((await app.call('other', 'GET', '/surveys')).body.items.length, 0);

    const edited = await app.call('lead', 'PUT', `/surveys/${id}`, { ...SURVEY, equipment: 'Ngăn 276' });
    assert.equal(edited.body.survey.data.equipment, 'Ngăn 276');
    assert.equal((await app.call('member', 'PUT', `/surveys/${id}`, SURVEY)).status, 403);

    const defaults2 = (await app.call('lead', 'GET', '/survey-defaults')).body.draft;
    assert.equal(defaults2.header.unitName, 'Đội Sửa chữa, thí nghiệm điện 3');

    assert.equal((await app.call('member', 'DELETE', `/surveys/${id}`)).status, 403);
    assert.equal((await app.call('lead', 'DELETE', `/surveys/${id}`)).status, 200);
    assert.equal((await app.call('lead', 'GET', `/surveys/${id}`)).status, 404);
  } finally { app.close(); }
});

test('BBKSHT: ảnh sơ đồ tải lên/xem/xóa, xuất Word có ảnh', async () => {
  const app = await startApp();
  try {
    const id = (await app.call('lead', 'POST', '/surveys', SURVEY)).body.survey.id;
    assert.equal((await app.call('member', 'PUT', `/surveys/${id}/diagram`, pngForm(makePng(40, 20)))).status, 403);
    assert.equal((await app.call('lead', 'PUT', `/surveys/${id}/diagram`, pngForm(Buffer.from('không phải ảnh'), 'image/png'))).status, 400);
    assert.equal((await app.call('lead', 'PUT', `/surveys/${id}/diagram`, pngForm(Buffer.from('GIF89a....'), 'image/gif', 'a.gif'))).status, 400);

    const up = await app.call('lead', 'PUT', `/surveys/${id}/diagram`, pngForm(makePng(40, 20)));
    assert.equal(up.status, 200);
    assert.deepEqual([up.body.width, up.body.height], [40, 20]);
    assert.equal((await app.call('lead', 'GET', `/surveys/${id}`)).body.survey.hasDiagram, true);
    const img = await app.call('member', 'GET', `/surveys/${id}/diagram`);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.body.readUInt32BE(16), 40);
    assert.equal((await app.call('other', 'GET', `/surveys/${id}/diagram`)).status, 403);

    const docx = await app.call('member', 'GET', `/surveys/${id}/docx`);
    assert.equal(docx.status, 200);
    assert.match(docx.headers.get('content-disposition'), /filename="20260721_BBKSHT_TU275-TI275_TBA-220kV-Thap-Cham\.docx"/);
    const zip = new PizZip(docx.body);
    assert.ok(zip.file('word/media/dkct_diagram.png'));
    assert.match(zip.file('word/document.xml').asText(), /Nguyễn Yên/);

    assert.equal((await app.call('lead', 'DELETE', `/surveys/${id}/diagram`)).status, 200);
    assert.equal((await app.call('lead', 'GET', `/surveys/${id}/diagram`)).status, 404);
    assert.equal(new PizZip((await app.call('lead', 'GET', `/surveys/${id}/docx`)).body).file('word/media/dkct_diagram.png'), null);
  } finally { app.close(); }
});

test('BBKSHT: lập nháp từ dòng lịch cắt điện', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'TBA 220kV Tháp Chàm', 'Thí nghiệm TU275', 'Cô lập MC275', '', '', '']]));
    const [o] = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items;
    const { draft } = (await app.call('lead', 'GET', `/outages/${o.id}/survey-draft`)).body;
    assert.equal(draft.outageId, o.id);
    assert.equal(draft.station.name, 'TBA 220kV Tháp Chàm');
    assert.ok(draft.station.substationId, 'địa điểm trùng tên TBA trong danh mục thì gắn TBA');
    assert.equal(draft.station.qlvhUnitName, 'Tổ Thao tác lưu động Tháp Chàm');
    assert.equal(draft.workContent, 'Thí nghiệm TU275');
    assert.equal(draft.risks[0].measures, 'Cô lập MC275');
    assert.equal(draft.workUnitReps[0].name, 'Nguyễn Hữu Kính');
    assert.equal((await app.call('lead', 'GET', '/outages/khong-co/survey-draft')).status, 404);
  } finally { app.close(); }
});

test('danh mục TBA: gắn đơn vị QLVH (khóa ngoại), BBKSHT lưu liên kết TBA', async () => {
  const app = await startApp();
  try {
    const subs = (await app.call('member', 'GET', '/substations')).body.items;
    assert.equal(subs.length, 14);
    const units = (await app.call('member', 'GET', '/stations')).body.items;
    const thapCham = units.find(u => u.name === 'Tổ Thao tác lưu động Tháp Chàm');
    assert.deepEqual([thapCham.shortName, thapCham.leaderName], ['TTLĐTC', 'Nguyễn Yên']);

    assert.equal((await app.call('lead', 'POST', '/substations', { name: 'TBA mới', stationId: 'KHONG-CO' })).status, 400);
    assert.equal((await app.call('member', 'POST', '/substations', { name: 'TBA mới', stationId: thapCham.id })).status, 403);
    const created = await app.call('lead', 'POST', '/substations', { name: 'TBA 110kV Mới', stationId: thapCham.id, transmissionName: 'Truyền tải điện Khánh Hòa' });
    assert.equal(created.status, 201);
    assert.equal(created.body.item.transmissionName, 'Truyền tải điện Khánh Hòa');

    const sub = subs.find(s => s.name === 'TBA 220kV Tháp Chàm');
    const survey = (await app.call('lead', 'POST', '/surveys', { ...SURVEY, station: { substationId: sub.id } })).body.survey;
    assert.equal(survey.substationId, sub.id);
    assert.equal(survey.data.station.qlvhUnitName, 'Tổ Thao tác lưu động Tháp Chàm');
  } finally { app.close(); }
});

const PDF = Buffer.from('%PDF-1.7\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n');
function drawingForm({ pdf = PDF, image = makePng(300, 150), page = '2', pageCount = '3', label = 'Sơ đồ trạm' } = {}) {
  const form = new FormData();
  if (pdf) form.append('pdf', new Blob([pdf], { type: 'application/pdf' }), 'So do TBA Thap Cham.pdf');
  if (image) form.append('image', new Blob([image], { type: 'image/png' }), 'trang2.png');
  if (label !== null) form.append('label', label);
  form.append('page', page);
  form.append('pageCount', pageCount);
  return form;
}
const labelForm = (label) => { const f = new FormData(); f.append('label', label); return f; };

test('bản vẽ trạm: tải PDF + ảnh trang, xem, tải PDF gốc, đổi tên, thay file, xóa; phân quyền', async () => {
  const app = await startApp();
  try {
    const sub = (await app.call('lead', 'GET', '/substations')).body.items.find(s => s.name === 'TBA 220kV Tháp Chàm');
    const url = `/substations/${sub.id}/drawings`;
    assert.deepEqual((await app.call('member', 'GET', url)).body.items, []);
    assert.equal((await app.call('member', 'POST', url, drawingForm())).status, 403);
    assert.equal((await app.call('lead', 'POST', url, drawingForm({ pdf: Buffer.from('không phải pdf') }))).status, 400);
    assert.equal((await app.call('lead', 'POST', url, drawingForm({ image: Buffer.from('xx') }))).status, 400);
    assert.equal((await app.call('lead', 'POST', url, drawingForm({ image: null }))).status, 400);
    assert.equal((await app.call('lead', 'POST', url, drawingForm({ label: '  ' }))).status, 400, 'phải đặt tên sơ đồ');
    assert.equal((await app.call('lead', 'POST', '/substations/KHONG-CO/drawings', drawingForm())).status, 404);

    const up = await app.call('lead', 'POST', url, drawingForm());
    assert.equal(up.status, 201);
    const d = up.body.drawing;
    assert.deepEqual([d.label, d.page, d.pageCount, d.width, d.height, d.pdfSize], ['Sơ đồ trạm', 2, 3, 300, 150, PDF.length]);
    assert.equal(d.fileName, 'So do TBA Thap Cham.pdf');
    const list = (await app.call('member', 'GET', '/substation-drawings')).body.items;
    assert.deepEqual(list.map(x => x.substationId), [sub.id]);
    assert.equal(list[0].image, undefined, 'danh sách không kèm dữ liệu file');

    const img = await app.call('member', 'GET', `/drawings/${d.id}/image`);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.body.readUInt32BE(16), 300);
    const pdf = await app.call('member', 'GET', `/drawings/${d.id}/pdf`);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.ok(pdf.body.equals(PDF));

    // đổi tên (không gửi file), thay file
    assert.equal((await app.call('member', 'PUT', `/drawings/${d.id}`, labelForm('Phía 220kV'))).status, 403);
    assert.equal((await app.call('lead', 'PUT', `/drawings/${d.id}`, labelForm('Phía 220kV'))).body.drawing.label, 'Phía 220kV');
    const replaced = (await app.call('lead', 'PUT', `/drawings/${d.id}`, drawingForm({ page: '1', pageCount: '1', label: 'Phía 220kV' }))).body.drawing;
    assert.deepEqual([replaced.page, replaced.pageCount], [1, 1]);
    assert.equal((await app.call('member', 'GET', '/substation-drawings')).body.items.length, 1);

    assert.equal((await app.call('member', 'DELETE', `/drawings/${d.id}`)).status, 403);
    assert.equal((await app.call('lead', 'DELETE', `/drawings/${d.id}`)).status, 200);
    assert.equal((await app.call('member', 'GET', `/drawings/${d.id}/image`)).status, 404);
  } finally { app.close(); }
});

test('bản vẽ trạm 500kV: hai sơ đồ "Phía 500kV", "Phía 220kV" (500kV xếp trước); tên không trùng trong một trạm', async () => {
  const app = await startApp();
  try {
    const sub = (await app.call('lead', 'GET', '/substations')).body.items.find(s => s.name === 'TBA 500kV Vĩnh Tân');
    const url = `/substations/${sub.id}/drawings`;
    assert.equal((await app.call('lead', 'POST', url, drawingForm({ label: 'Phía 220kV' }))).status, 201);
    assert.equal((await app.call('lead', 'POST', url, drawingForm({ label: 'Phía 500kV' }))).status, 201);
    assert.equal((await app.call('lead', 'POST', url, drawingForm({ label: 'phía  500KV' }))).status, 409, 'trùng tên (bỏ qua hoa thường, khoảng trắng)');
    const items = (await app.call('member', 'GET', url)).body.items;
    assert.deepEqual(items.map(x => x.label), ['Phía 500kV', 'Phía 220kV']);
    assert.equal((await app.call('lead', 'PUT', `/drawings/${items[1].id}`, labelForm('Phía 500kV'))).status, 409);
  } finally { app.close(); }
});

test('BBKSHT: khung "Khu vực công tác" lưu cùng biên bản và thành hình vẽ trên sơ đồ trong Word', async () => {
  const app = await startApp();
  try {
    const marks = [{ x: 0.1, y: 0.2, w: 0.3, h: 0.25, label: 'Khu vực công tác' }, { x: 2, y: -1, w: 5, h: 0, label: '' }];
    const id = (await app.call('lead', 'POST', '/surveys', { ...SURVEY, diagramMarks: marks })).body.survey.id;
    await app.call('lead', 'PUT', `/surveys/${id}/diagram`, pngForm(makePng(400, 200)));
    const saved = (await app.call('lead', 'GET', `/surveys/${id}`)).body.survey.data.diagramMarks;
    assert.equal(saved.length, 1, 'bỏ khung không hợp lệ (ngoài ảnh / kích thước 0)');
    const xml = new PizZip((await app.call('lead', 'GET', `/surveys/${id}/docx`)).body).file('word/document.xml').asText();
    assert.match(xml, /<wps:wsp>[\s\S]*prst="rect"[\s\S]*FF0000/);
    assert.match(xml, /Khu vực công tác/);
  } finally { app.close(); }
});

const { PLAN } = require('./fixtures/samplePlan');

test('Phương án: số riêng "n/PA-<tổ>.Nhatthu", lập/sửa/xóa, quyền, xuất Word có bản vẽ trạm', async () => {
  const app = await startApp();
  try {
    const { draft, numbering } = (await app.call('lead', 'GET', '/plan-defaults')).body;
    assert.equal(numbering.preview, '1/PA-TNLĐ.Nhatthu');
    assert.equal(draft.header.teamName, 'Tổ Thí nghiệm điện Lâm Đồng');
    assert.equal(draft.preparedBy, 'Nguyễn Hữu Kính');
    assert.equal(draft.legalBases.length, 5);
    assert.ok(draft.instruments.length > 5);
    const devices = (await app.call('member', 'GET', '/tests1901')).body.devices;
    assert.ok(devices.find(d => d.key === 'MBA').items.length > 20);

    assert.equal((await app.call('member', 'POST', '/plans', PLAN)).status, 403);
    assert.equal((await app.call('lead', 'POST', '/plans', { ...PLAN, bays: '' })).status, 422);
    // số phương án không dùng chung bộ đếm với giấy ĐKCT
    await app.call('lead', 'PUT', '/numbering', { startNumber: 215 });
    assert.equal((await app.call('lead', 'PUT', '/plan-numbering', { startNumber: 12 })).body.numbering.preview, '12/PA-TNLĐ.Nhatthu');

    const sub = (await app.call('lead', 'GET', '/substations')).body.items.find(s => s.name === 'TBA 500kV Vĩnh Tân');
    const d500 = (await app.call('lead', 'POST', `/substations/${sub.id}/drawings`, drawingForm({ label: 'Phía 500kV' }))).body.drawing;
    const d220 = (await app.call('lead', 'POST', `/substations/${sub.id}/drawings`, drawingForm({ label: 'Phía 220kV' }))).body.drawing;
    const created = await app.call('lead', 'POST', '/plans', { ...PLAN, station: { substationId: sub.id } });
    assert.equal(created.status, 201);
    const plan = created.body.plan;
    assert.equal(plan.docNumber, '12/PA-TNLĐ.Nhatthu');
    assert.equal(plan.substationId, sub.id);
    assert.equal(plan.data.preparedBy, 'Nguyễn Hữu Kính');
    assert.equal(plan.data.station.qlvhShort, 'TBAVT');
    assert.equal((await app.call('lead', 'GET', '/registrations')).body.items.length, 0);

    const list = (await app.call('member', 'GET', '/plans?search=Vĩnh Tân')).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].canEdit, false);
    assert.equal((await app.call('other', 'GET', `/plans/${plan.id}`)).status, 403);

    const edited = await app.call('lead', 'PUT', `/plans/${plan.id}`, { ...PLAN, bays: '530, 532' });
    assert.equal(edited.body.plan.data.bays, '530, 532');
    assert.equal(edited.body.plan.docNumber, '12/PA-TNLĐ.Nhatthu', 'số không đổi khi hiệu chỉnh');

    // chưa chọn sơ đồ (phương án cũ): in mọi sơ đồ của trạm
    assert.equal(plan.data.drawingIds, null);
    await app.call('lead', 'PUT', `/plans/${plan.id}`, { ...PLAN, station: { substationId: sub.id } });
    const docx = await app.call('member', 'GET', `/plans/${plan.id}/docx`);
    assert.equal(docx.status, 200);
    assert.match(docx.headers.get('content-disposition'), /filename="20260821_12-PA-TNLD\.Nhatthu_PA_530-532-MBA-AT2-232-255-342_TBA-500kV-Vinh-Tan\.docx"/);
    const zip = new PizZip(docx.body);
    assert.ok(zip.file('word/media/dkct_station_drawing_2.png'), 'Phụ lục IV có cả hai sơ đồ');
    assert.match(zip.file('word/document.xml').asText(), /12\/PA-TNLĐ\.Nhatthu/);

    // chỉ chọn sơ đồ phía 220kV (id lạ bị bỏ khi xuất)
    const only220 = await app.call('lead', 'PUT', `/plans/${plan.id}`, { ...PLAN, station: { substationId: sub.id }, drawingIds: [d220.id, d220.id, 'BV-LA'] });
    assert.deepEqual(only220.body.plan.data.drawingIds, [d220.id, 'BV-LA']);
    const zip220 = new PizZip((await app.call('member', 'GET', `/plans/${plan.id}/docx`)).body);
    assert.ok(zip220.file('word/media/dkct_station_drawing_1.png') && !zip220.file('word/media/dkct_station_drawing_2.png'));
    const xml220 = zip220.file('word/document.xml').asText();
    assert.match(xml220, /Phía 220kV/);
    assert.doesNotMatch(xml220, /Phía 500kV/);
    // bỏ chọn hết: Phụ lục IV ghi chưa có bản vẽ
    await app.call('lead', 'PUT', `/plans/${plan.id}`, { ...PLAN, station: { substationId: sub.id }, drawingIds: [] });
    assert.match(new PizZip((await app.call('member', 'GET', `/plans/${plan.id}/docx`)).body).file('word/document.xml').asText(), /Chưa có bản vẽ/);
    assert.ok(d500.id);

    assert.equal((await app.call('member', 'DELETE', `/plans/${plan.id}`)).status, 403);
    assert.equal((await app.call('lead', 'DELETE', `/plans/${plan.id}`)).status, 200);
    assert.equal((await app.call('lead', 'GET', '/plan-numbering')).body.numbering.nextNumber, 13, 'số đã cấp không cấp lại');
  } finally { app.close(); }
});

test('Phương án: nháp từ lịch cắt điện; khóa ngoại tới BBKSHT/lịch (xóa thì bỏ liên kết)', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'TBA 220kV Tháp Chàm', 'Thí nghiệm định kỳ ngăn 232', 'Cô lập MC232\nĐóng DTĐ 232-25', '', '', '']]));
    const [o] = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items;
    const { draft } = (await app.call('lead', 'GET', `/outages/${o.id}/plan-draft`)).body;
    assert.equal(draft.outageId, o.id);
    assert.equal(draft.station.qlvhUnitName, 'Tổ Thao tác lưu động Tháp Chàm');
    assert.equal(draft.station.qlvhShort, 'TTLĐTC');
    assert.deepEqual(draft.isolationSteps, ['Cô lập MC232', 'Đóng DTĐ 232-25']);
    assert.equal(draft.bays, 'Cô lập MC232; Đóng DTĐ 232-25', 'ngăn lộ cắt điện cô lập lấy từ phạm vi cắt điện');
    assert.equal(draft.time.start, '2024-10-05T07:00');

    const surveyId = (await app.call('lead', 'POST', '/surveys', SURVEY)).body.survey.id;
    const plan = (await app.call('lead', 'POST', '/plans', { ...PLAN, outageId: o.id, surveyId })).body.plan;
    assert.deepEqual([plan.outageId, plan.surveyId], [o.id, surveyId]);
    assert.equal((await app.call('lead', 'POST', '/plans', { ...PLAN, surveyId: 'KHONG-CO' })).body.plan.surveyId, null);
    await app.call('lead', 'DELETE', `/surveys/${surveyId}`);
    assert.equal((await app.call('lead', 'GET', `/plans/${plan.id}`)).body.plan.surveyId, null, 'xóa BBKSHT thì phương án bỏ liên kết');
  } finally { app.close(); }
});

test('Lịch cắt điện: đếm biên bản KSHT/phương án/giấy ĐKCT theo dòng, chỉ trong tổ mình', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ1', '']]));
    const list = async (who) => (await app.call(who, 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items[0];
    const counts = (o) => [o.surveyCount, o.planCount, o.registrationCount];
    const o = await list('lead');
    assert.deepEqual(counts(o), [0, 0, 0]);
    assert.equal((await app.call('lead', 'POST', '/surveys', { ...SURVEY, outageId: o.id })).status, 201);
    assert.equal((await app.call('lead', 'POST', '/plans', { ...PLAN, outageId: o.id })).status, 201);
    assert.equal((await app.call('lead', 'POST', '/plans', { ...PLAN, outageId: o.id })).status, 201);
    assert.deepEqual(counts(await list('lead')), [1, 2, 0]);
    assert.deepEqual(counts(await list('other')), [0, 0, 0], 'tổ khác không thấy hồ sơ của tổ này');
  } finally { app.close(); }
});

test('Chi tiết một dòng lịch (khung "Lịch cắt điện liên quan"); lập biên bản riêng rồi gắn lịch sau', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ2', 'Chờ duyệt']]));
    const [o] = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items;
    const detail = (await app.call('other', 'GET', `/outages/${o.id}`)).body.outage;
    assert.deepEqual([detail.regStart, detail.location, detail.content, detail.scope, detail.status], ['2024-10-05T07:00', 'Trạm A', 'Việc A', 'Cô lập A', 'Chờ duyệt']);
    assert.equal((await app.call('lead', 'GET', '/outages/KHONG-CO')).status, 404);

    const survey = (await app.call('lead', 'POST', '/surveys', SURVEY)).body.survey;
    const { survey: full } = (await app.call('lead', 'GET', `/surveys/${survey.id}`)).body;
    assert.equal((await app.call('lead', 'PUT', `/surveys/${survey.id}`, { ...full.data, outageId: o.id })).status, 200);
    assert.equal((await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items[0].surveyCount, 1);
  } finally { app.close(); }
});

test('Địa danh phương án: mặc định Lâm Đồng; danh sách Lâm Đồng, Khánh Hòa; địa danh mới được nhớ', async () => {
  const app = await startApp();
  try {
    assert.equal((await app.call('lead', 'GET', '/plan-defaults')).body.draft.header.place, 'Lâm Đồng');
    assert.deepEqual((await app.call('member', 'GET', '/places')).body.items, ['Lâm Đồng', 'Khánh Hòa']);
    const sub = (await app.call('lead', 'GET', '/substations')).body.items[0];
    const created = await app.call('lead', 'POST', '/plans', { ...PLAN, station: { substationId: sub.id }, header: { ...PLAN.header, place: ' Ninh  Thuận ' } });
    assert.equal(created.status, 201);
    await app.call('lead', 'POST', '/plans', { ...PLAN, station: { substationId: sub.id }, header: { ...PLAN.header, place: 'ninh thuận' } });
    await app.call('lead', 'POST', '/plans', { ...PLAN, station: { substationId: sub.id }, header: { ...PLAN.header, place: 'Khánh Hòa' } });
    assert.deepEqual((await app.call('other', 'GET', '/places')).body.items, ['Lâm Đồng', 'Khánh Hòa', 'Ninh Thuận']);
  } finally { app.close(); }
});

test('Giấy xác nhận: lập từ giấy ĐKCT (trạm, ngăn lộ, mục kết quả), số riêng "n/GXN-<tổ>", sửa/xóa, quyền, xuất Word', async () => {
  const app = await startApp();
  try {
    const reg = (await app.call('lead', 'POST', '/registrations', await validInput(app.call))).body.registration;
    const { draft } = (await app.call('lead', 'GET', `/registrations/${reg.id}/confirmation-draft`)).body;
    assert.equal(draft.registrationId, reg.id);
    assert.equal(draft.station.name, 'TBA 500kV Vĩnh Tân', 'trạm khớp danh mục TBA từ địa điểm');
    assert.ok(draft.station.substationId);
    assert.equal(draft.bays, 'MBA AT1');
    assert.deepEqual(draft.items, [{ text: 'Thí nghiệm định kỳ ngăn MBA AT1', result: 'đạt' }]);
    assert.equal(draft.workDate, '2026-10-08', 'ngày kết thúc công tác theo giấy');
    assert.equal(draft.header.teamName, 'Tổ Thí nghiệm điện Lâm Đồng');
    assert.equal(draft.signer, 'Nguyễn Hữu Kính');
    assert.equal((await app.call('other', 'GET', `/registrations/${reg.id}/confirmation-draft`)).status, 403);

    // số riêng, không dùng chung bộ đếm với giấy ĐKCT / phương án
    assert.equal((await app.call('lead', 'GET', '/confirmation-numbering')).body.numbering.preview, '1/GXN-TNLĐ');
    await app.call('lead', 'PUT', '/confirmation-numbering', { startNumber: 5 });
    assert.equal((await app.call('member', 'POST', '/confirmations', draft)).status, 403);
    assert.equal((await app.call('lead', 'POST', '/confirmations', { ...draft, items: [] })).status, 422);
    const created = await app.call('lead', 'POST', '/confirmations', draft);
    assert.equal(created.status, 201);
    const c = created.body.confirmation;
    assert.equal(c.docNumber, '5/GXN-TNLĐ');
    assert.deepEqual([c.registrationId, c.substationId, c.stationName, c.bays], [reg.id, draft.station.substationId, 'TBA 500kV Vĩnh Tân', 'MBA AT1']);
    assert.equal((await app.call('lead', 'GET', '/registrations')).body.items[0].docNumber, '1/ĐK-TNLĐ');

    const list = (await app.call('member', 'GET', '/confirmations?search=AT1')).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].canEdit, false);
    assert.equal((await app.call('other', 'GET', `/confirmations/${c.id}`)).status, 403);

    const edited = await app.call('lead', 'PUT', `/confirmations/${c.id}`, { ...draft, note: 'Đã tháo tiếp địa', registrationId: 'KHONG-CO' });
    assert.equal(edited.body.confirmation.data.note, 'Đã tháo tiếp địa');
    assert.equal(edited.body.confirmation.registrationId, null, 'liên kết tới giấy không tồn tại bị bỏ');
    assert.equal(edited.body.confirmation.docNumber, '5/GXN-TNLĐ');

    const docx = await app.call('member', 'GET', `/confirmations/${c.id}/docx`);
    assert.equal(docx.status, 200);
    assert.match(docx.headers.get('content-disposition'), /filename="20261008_5-GXN-TNLD_GXN_MBA-AT1_TBA-500kV-Vinh-Tan\.docx"/);
    const zip = new PizZip(docx.body);
    assert.match(zip.file('word/header1.xml').asText(), /5\/GXN-TNLĐ/);
    assert.match(zip.file('word/document.xml').asText(), /Thí nghiệm định kỳ ngăn MBA AT1:/);

    // xóa giấy ĐKCT: giấy xác nhận giữ lại, bỏ liên kết
    await app.call('lead', 'PUT', `/confirmations/${c.id}`, draft);
    await app.call('lead', 'DELETE', `/registrations/${reg.id}`);
    assert.equal((await app.call('lead', 'GET', `/confirmations/${c.id}`)).body.confirmation.registrationId, null);

    assert.equal((await app.call('member', 'DELETE', `/confirmations/${c.id}`)).status, 403);
    assert.equal((await app.call('lead', 'DELETE', `/confirmations/${c.id}`)).status, 200);
    assert.equal((await app.call('lead', 'GET', '/confirmation-numbering')).body.numbering.nextNumber, 6);
  } finally { app.close(); }
});

test('luồng chuẩn bị công tác: từ hồ sơ bất kỳ thấy đủ lịch → KSHT → phương án → giấy ĐKCT → giấy xác nhận; không lộ hồ sơ tổ khác', async () => {
  const app = await startApp();
  try {
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'TBA 220kV Tháp Chàm', 'TNĐK ngăn 232', 'Cô lập MC232', '', '', '']]));
    const [o] = (await app.call('lead', 'GET', '/outages?from=2024-10-05&to=2024-10-05')).body.items;
    const survey = (await app.call('lead', 'POST', '/surveys', { ...SURVEY, outageId: o.id })).body.survey;
    const plan = (await app.call('lead', 'POST', '/plans', { ...PLAN, surveyId: survey.id })).body.plan;
    const reg = (await app.call('lead', 'POST', '/registrations', { ...(await validInput(app.call)), outageId: o.id })).body.registration;
    const { draft } = (await app.call('lead', 'GET', `/registrations/${reg.id}/confirmation-draft`)).body;
    const conf = (await app.call('lead', 'POST', '/confirmations', { ...draft, planId: plan.id })).body.confirmation;
    // hồ sơ tổ khác cùng lịch: không hiện
    await app.call('admin', 'POST', '/surveys', { ...SURVEY, outageId: o.id });

    const ids = (w) => [w.outages, w.surveys, w.plans, w.registrations, w.confirmations].map(l => l.map(x => x.id));
    const all = [[o.id], [survey.id], [plan.id], [reg.id], [conf.id]];
    for (const [type, id] of [['outage', o.id], ['plan', plan.id], ['confirmation', conf.id], ['registration', reg.id]]) {
      const w = (await app.call('member', 'GET', `/workflow/${type}/${id}`)).body;
      assert.deepEqual(ids(w), all, `chọn ${type}`);
      assert.deepEqual(w.selected, { type, id });
    }
    assert.equal((await app.call('member', 'GET', `/workflow/plan/${plan.id}`)).body.plans[0].docNumber, plan.docNumber);
    assert.equal((await app.call('other', 'GET', `/workflow/plan/${plan.id}`)).status, 403);
    assert.deepEqual(ids((await app.call('other', 'GET', `/workflow/outage/${o.id}`)).body), [[o.id], [], [], [], []], 'tổ khác chỉ thấy lịch');
    assert.equal((await app.call('lead', 'GET', '/workflow/plan/KHONG-CO')).status, 404);
    assert.equal((await app.call('lead', 'GET', '/workflow/khac/1')).status, 400);
  } finally { app.close(); }
});

test('xem trước bản Word từ dữ liệu đang soạn: không lưu, không cấp số; dữ liệu sai báo 422; chỉ người lập được xem trước', async () => {
  const app = await startApp();
  try {
    const text = (buf) => new PizZip(buf).file('word/document.xml').asText().replace(/<[^>]+>/g, '');
    const before = (await app.call('lead', 'GET', '/plan-numbering')).body.numbering.nextNumber;
    const pv = await app.call('lead', 'POST', `/plans/preview?docNumber=${encodeURIComponent('7/PA-TNLĐ.Nhatthu')}`, PLAN);
    assert.equal(pv.status, 200);
    assert.match(pv.headers.get('content-type'), /wordprocessingml/);
    assert.equal(pv.headers.get('cache-control'), 'private, no-store');
    assert.match(text(pv.body), /Số: 7\/PA-TNLĐ\.Nhatthu/);
    assert.equal((await app.call('lead', 'GET', '/plans')).body.items.length, 0, 'không lưu');
    assert.equal((await app.call('lead', 'GET', '/plan-numbering')).body.numbering.nextNumber, before, 'không cấp số');
    assert.equal((await app.call('lead', 'POST', '/plans/preview', { ...PLAN, bays: '' })).status, 422);
    assert.equal((await app.call('member', 'POST', '/plans/preview', PLAN)).status, 403);

    // hồ sơ đã lưu: in số đã cấp, dữ liệu đang sửa (chưa lưu)
    const plan = (await app.call('lead', 'POST', '/plans', PLAN)).body.plan;
    const edited = await app.call('lead', 'POST', `/plans/${plan.id}/preview`, { ...PLAN, equipmentText: 'ngăn 999 sửa thử' });
    assert.match(text(edited.body), new RegExp(`Số: ${plan.docNumber.replace(/[.]/g, '\.')}`));
    assert.match(text(edited.body), /ngăn 999 sửa thử/);
    assert.doesNotMatch(text((await app.call('lead', 'GET', `/plans/${plan.id}/docx`)).body), /ngăn 999 sửa thử/, 'bản đã lưu không đổi');
    assert.equal((await app.call('other', 'POST', `/plans/${plan.id}/preview`, PLAN)).status, 403);

    assert.equal((await app.call('lead', 'POST', '/surveys/preview', SURVEY)).status, 200);
    assert.equal((await app.call('lead', 'POST', '/registrations/preview', await validInput(app.call))).status, 200);
    assert.equal((await app.call('lead', 'GET', '/registrations')).body.items.length, 0);
  } finally { app.close(); }
});

test('nạp lại lịch: so với lịch cùng khoảng đã nạp -> hoãn (không còn / tình trạng Hoãn), phát sinh, không đổi; đánh dấu dòng lịch', async () => {
  const app = await startApp();
  try {
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ1', 'Đã duyệt'];
    const B = ['06/10/2024 07h00', '06/10/2024 17h00', 'Trạm B', 'Việc B', 'Cô lập B', 'Đ1', 'Đ1', 'Đã duyệt'];
    const C = ['07/10/2024 07h00', '07/10/2024 17h00', 'Trạm C', 'Việc C', 'Cô lập C', 'Đ1', 'Đ1', 'Đã duyệt'];
    const D = ['08/10/2024 07h00', '08/10/2024 17h00', 'Trạm D', 'Việc D', 'Cô lập D', 'Đ1', 'Đ1', 'Chờ duyệt'];
    const OUT = ['20/10/2024 07h00', '20/10/2024 17h00', 'Trạm X', 'Việc ngoài khoảng', '', 'Đ1', 'Đ1', ''];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A, B, C, OUT]));
    // lịch mới 05–08/10: A không đổi, B hoãn (tình trạng), C không còn (hoãn), D phát sinh; dòng 20/10 ngoài khoảng không xét
    const withRange = (rows) => { const f = excelFrom(rows); f.append('compareFrom', '2024-10-05'); f.append('compareTo', '2024-10-08'); return f; };
    const next = [A, [...B.slice(0, 7), 'Hoãn do thời tiết'], D];
    const pv = (await app.call('lead', 'POST', '/outages/import/preview', withRange(next))).body;
    assert.deepEqual(pv.span, { from: '2024-10-05', to: '2024-10-08' });
    assert.deepEqual(pv.compare.added.map(r => r.location), ['Trạm D']);
    assert.deepEqual(pv.compare.postponed.map(r => r.location).sort(), ['Trạm B', 'Trạm C']);
    assert.equal(pv.compare.unchanged, 1);
    assert.equal(pv.compare.previous, 3);
    assert.equal((await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items.filter(o => o.changeKind).length, 0, 'xem trước không ghi gì');

    const res = (await app.call('lead', 'POST', '/outages/import/commit', withRange(next))).body;
    assert.equal(res.inserted, 1);
    assert.ok(res.compare.added[0].id, 'dòng phát sinh có id để liên kết tới');
    const items = (await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items;
    const kind = Object.fromEntries(items.map(o => [o.location, o.changeKind || null]));
    assert.deepEqual(kind, { 'Trạm A': null, 'Trạm B': 'POSTPONED', 'Trạm C': 'POSTPONED', 'Trạm D': 'NEW', 'Trạm X': null });

    // không chọn khoảng so sánh: nạp như cũ, không đổi dấu đã có
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A]));
    assert.equal((await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items.find(o => o.location === 'Trạm D').changeKind, 'NEW');
    // nạp lại lịch có lại B, C: hết hoãn (ghi lịch sử "có lại"); dấu phát sinh của D giữ đến hết hạn
    const back = (await app.call('lead', 'POST', '/outages/import/commit', withRange([A, B, C, D]))).body;
    assert.deepEqual(back.compare.restored.map(r => r.location).sort(), ['Trạm B', 'Trạm C']);
    const again = (await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items;
    assert.deepEqual(again.filter(o => o.changeKind).map(o => [o.location, o.changeKind]), [['Trạm D', 'NEW']]);
    const hist = (await app.call('lead', 'GET', `/outages/${again.find(o => o.location === 'Trạm C').id}/history`)).body.items;
    assert.deepEqual(hist.map(h => h.kind), ['RESTORED', 'POSTPONED']);
    assert.equal(again.find(o => o.location === 'Trạm C').changeCount, 2);
    // nạp lặp lại y như vậy: không ghi thêm lịch sử
    assert.equal((await app.call('lead', 'POST', '/outages/import/commit', withRange([A, B, C, D]))).body.logged, 0);
  } finally { app.close(); }
});

test('nạp lại lịch: dời giờ / sửa chữ -> cập nhật tại chỗ (giữ id, không thành hoãn + phát sinh); hồ sơ đã gắn được cảnh báo', async () => {
  const app = await startApp();
  try {
    const A = ['05/10/2024 07h00', '05/10/2024 17h00', 'TBA 220kV Tháp Chàm', 'Thí nghiệm định kỳ ngăn 232, MC232, TI232', 'Cô lập MC232', 'Đ1', 'Đ1', 'Đã duyệt'];
    const E = ['06/10/2024 07h00', '06/10/2024 17h00', 'TBA 110kV Ninh Sơn', 'Thí nghiêm định kỳ MBA T1', 'Cô lập T1', 'Đ1', 'Đ1', 'Đã duyệt'];
    const F = ['07/10/2024 07h00', '07/10/2024 17h00', 'TBA 220kV Đa Nhim', 'Sửa chữa DCL 271-1', 'Cô lập 271', 'Đ1', 'Đ1', 'Đã duyệt'];
    await app.call('lead', 'POST', '/outages/import/commit', excelFrom([A, E, F]));
    const before = Object.fromEntries((await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items.map(o => [o.location, o]));
    // hồ sơ đã lập theo lịch: biên bản KSHT gắn A, phương án gắn F, giấy ĐKCT gắn E
    const survey = (await app.call('lead', 'POST', '/surveys', { ...SURVEY, outageId: before['TBA 220kV Tháp Chàm'].id })).body.survey;
    const plan = (await app.call('lead', 'POST', '/plans', { ...PLAN, outageId: before['TBA 220kV Đa Nhim'].id })).body.plan;
    const reg = (await app.call('lead', 'POST', '/registrations', { ...(await validInput(app.call)), outageId: before['TBA 110kV Ninh Sơn'].id })).body.registration;

    // lịch mới 05–10/10: A dời sang 09/10, E sửa chính tả, F không còn (hoãn), G phát sinh
    const G = ['08/10/2024 07h00', '08/10/2024 17h00', 'TBA 110kV Cam Ranh', 'Thay sứ MC171', 'Cô lập 171', 'Đ1', 'Đ1', 'Chờ duyệt'];
    const next = [['09/10/2024 07h00', '09/10/2024 17h00', ...A.slice(2)], [...E.slice(0, 3), 'Thí nghiệm định kỳ MBA T1', ...E.slice(4)], G];
    const form = () => { const f = excelFrom(next); f.append('compareFrom', '2024-10-05'); f.append('compareTo', '2024-10-10'); return f; };
    const pv = (await app.call('lead', 'POST', '/outages/import/preview', form())).body.compare;
    assert.deepEqual(pv.moved.map(r => [r.location, r.reason]), [['TBA 220kV Tháp Chàm', 'Dời lịch: 05/10 07:00–17:00 → 09/10 07:00–17:00']]);
    assert.deepEqual(pv.edited.map(r => [r.location, r.reason]), [['TBA 110kV Ninh Sơn', 'Sửa nội dung trong lịch']]);
    assert.deepEqual(pv.postponed.map(r => r.location), ['TBA 220kV Đa Nhim']);
    assert.deepEqual(pv.added.map(r => r.location), ['TBA 110kV Cam Ranh']);

    const res = (await app.call('lead', 'POST', '/outages/import/commit', form())).body;
    assert.deepEqual([res.inserted, res.updated], [1, 2], 'dời / sửa là cập nhật, chỉ G là dòng mới');
    const items = (await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items;
    assert.equal(items.length, 4, 'không sinh dòng trùng');
    const after = Object.fromEntries(items.map(o => [o.location, o]));
    const moved = after['TBA 220kV Tháp Chàm'];
    assert.equal(moved.id, before['TBA 220kV Tháp Chàm'].id, 'giữ id: hồ sơ đã gắn vẫn trỏ đúng');
    assert.deepEqual([moved.regStart, moved.changeKind, moved.prevStart, moved.prevEnd], ['2024-10-09T07:00', 'MOVED', '2024-10-05T07:00', '2024-10-05T17:00']);
    assert.equal(after['TBA 110kV Ninh Sơn'].content, 'Thí nghiệm định kỳ MBA T1');
    assert.equal(after['TBA 110kV Ninh Sơn'].changeKind, 'EDITED');
    assert.deepEqual([after['TBA 220kV Đa Nhim'].changeKind, after['TBA 220kV Đa Nhim'].changeNote], ['POSTPONED', 'Không còn trong lịch mới']);
    assert.equal(after['TBA 110kV Cam Ranh'].changeKind, 'NEW');

    // cảnh báo trên hồ sơ đã gắn: danh sách, chi tiết dòng lịch, luồng công việc
    const surveyRow = (await app.call('lead', 'GET', '/surveys')).body.items.find(r => r.id === survey.id);
    assert.deepEqual([surveyRow.outageChange.kind, surveyRow.outageChange.note], ['MOVED', 'Dời lịch: 05/10 07:00–17:00 → 09/10 07:00–17:00']);
    assert.equal((await app.call('lead', 'GET', '/plans')).body.items.find(r => r.id === plan.id).outageChange.kind, 'POSTPONED');
    assert.equal((await app.call('lead', 'GET', '/registrations')).body.items.find(r => r.id === reg.id).outageChange.kind, 'EDITED');
    assert.equal((await app.call('lead', 'GET', `/outages/${moved.id}`)).body.outage.changeNote, 'Dời lịch: 05/10 07:00–17:00 → 09/10 07:00–17:00');
    assert.equal((await app.call('lead', 'GET', `/workflow/plan/${plan.id}`)).body.outages[0].changeKind, 'POSTPONED');

    // nạp lại đúng lịch mới: dấu giữ nguyên (đến hết hạn), không ghi lịch sử lặp
    assert.equal((await app.call('lead', 'POST', '/outages/import/commit', form())).body.logged, 0);
    assert.equal((await app.call('lead', 'GET', '/surveys')).body.items.find(r => r.id === survey.id).outageChange.kind, 'MOVED');
    const hist = (await app.call('lead', 'GET', `/outages/${moved.id}/history`)).body.items;
    assert.deepEqual(hist.map(h => [h.kind, h.prevStart, h.newStart]), [['MOVED', '2024-10-05T07:00', '2024-10-09T07:00']]);
  } finally { app.close(); }
});

test('nạp lịch lần đầu cho một khoảng: không so sánh, không đánh dấu cả file là phát sinh', async () => {
  const app = await startApp();
  try {
    const f = excelFrom([['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', '', 'Đ1', 'Đ1', '']]);
    f.append('compareFrom', '2024-10-05'); f.append('compareTo', '2024-10-05');
    const res = (await app.call('lead', 'POST', '/outages/import/commit', f)).body;
    assert.equal(res.compare, null);
    assert.equal((await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items[0].changeKind ?? null, null);
  } finally { app.close(); }
});

test('tải lịch từ trang Công ty: đăng nhập Basic, gửi biểu mẫu ASP.NET với khoảng ngày dd/mm/yyyy, nạp và so sánh luôn', async () => {
  const rowsOf = (status) => [
    ['05/10/2024 07h00', '05/10/2024 17h00', 'Trạm A', 'Việc A', 'Cô lập A', 'Đ1', 'Đ1', 'Đã duyệt'],
    ['06/10/2024 07h00', '06/10/2024 17h00', 'Trạm B', 'Việc B', 'Cô lập B', 'Đ1', 'Đ1', status]
  ];
  let status = 'Đã duyệt';
  const seen = [];
  // trang giả: GET trả biểu mẫu có ô ẩn; POST đúng tài khoản + ô ngày -> file Excel
  const fakeFetch = async (url, init) => {
    seen.push({ method: init.method, auth: init.headers.Authorization, body: init.body ? String(init.body) : '' });
    if (init.headers.Authorization !== `Basic ${Buffer.from('tnld:bi-mat').toString('base64')}`) return new Response('no', { status: 401 });
    if (init.method === 'GET') {
      return new Response('<form><input type="hidden" name="__VIEWSTATE" value="vs&amp;1" /><input type="hidden" name="__EVENTVALIDATION" value="ev" />'
        + '<input name="txtTuNgay" type="text" /><input name="txtDenNgay" type="text" /></form>', { headers: { 'content-type': 'text/html', 'set-cookie': 'ASP.NET_SessionId=abc; path=/' } });
    }
    const ws = XLSX.utils.aoa_to_sheet([['LỊCH CẮT ĐIỆN'], [], ['Thời gian bắt đầu', 'Thời gian kết thúc', 'Địa điểm', 'Nội dung', 'Phạm vi', 'Đơn vị đăng ký', 'Đơn vị công tác', 'Tình trạng đăng ký'], ...rowsOf(status)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return new Response(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  };
  const app = await startApp({ outageSource: { url: 'https://lich.test/lcd.aspx', user: 'tnld', password: 'bi-mat', fetch: fakeFetch } });
  try {
    assert.equal((await app.call('member', 'GET', '/outages/source')).body.configured, true);
    assert.equal((await app.call('member', 'POST', '/outages/fetch', { from: '2024-10-05', to: '2024-10-06' })).status, 403, 'chỉ người được import');
    assert.equal((await app.call('lead', 'POST', '/outages/fetch', { from: '2024-10-06', to: '2024-10-05' })).status, 400);
    const first = (await app.call('lead', 'POST', '/outages/fetch', { from: '2024-10-05', to: '2024-10-06' })).body;
    assert.equal(first.inserted, 2);
    assert.equal(first.compare, null, 'lần đầu chưa có gì để so');
    const post = new URLSearchParams(seen.find(s => s.method === 'POST').body);
    assert.equal(post.get('txtTuNgay'), '05/10/2024');
    assert.equal(post.get('txtDenNgay'), '06/10/2024');
    assert.equal(post.get('__VIEWSTATE'), 'vs&1', 'gửi lại ô ẩn của trang');
    assert.equal(post.get('Submit'), 'Kết xuất file');
    // lần sau: trang báo hoãn -> đánh dấu đỏ
    status = 'Hoãn công tác (A2 đề nghị)';
    const again = (await app.call('lead', 'POST', '/outages/fetch', { from: '2024-10-05', to: '2024-10-06' })).body;
    assert.deepEqual(again.compare.postponed.map(r => r.location), ['Trạm B']);
    const items = (await app.call('lead', 'GET', '/outages?from=2024-10-01')).body.items;
    assert.equal(items.find(o => o.location === 'Trạm B').changeKind, 'POSTPONED');
    assert.match(items[0].sourceFile, /^Tải lịch 05\/10\/2024–06\/10\/2024/);
    // nhật ký tải: 2 lần bấm tay, thành công
    const src = (await app.call('lead', 'GET', '/outages/source')).body;
    assert.deepEqual(src.runs.map(r => [r.mode, r.ok, r.rowsCount]), [['MANUAL', true, 2], ['MANUAL', true, 2]]);
    assert.equal(src.runs[0].summary.postponed, 1);
  } finally { app.close(); }

  // sai mật khẩu / chưa cấu hình: báo rõ, không treo
  const wrong = await startApp({ outageSource: { url: 'https://lich.test/lcd.aspx', user: 'tnld', password: 'sai', fetch: fakeFetch } });
  try {
    const r = await wrong.call('lead', 'POST', '/outages/fetch', { from: '2024-10-05', to: '2024-10-06' });
    assert.equal(r.status, 424);
    assert.match(r.body.error, /từ chối tài khoản/);
  } finally { wrong.close(); }
  const none = await startApp({ outageSource: { user: '', password: '' } });
  try {
    assert.equal((await none.call('lead', 'GET', '/outages/source')).body.configured, false);
    assert.equal((await none.call('lead', 'POST', '/outages/fetch', { from: '2024-10-05', to: '2024-10-06' })).status, 424);
  } finally { none.close(); }
});
