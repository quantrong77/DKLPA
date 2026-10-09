const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const { normalizePlan } = require('../server/services/plan');
const { toPlanView, formatTimeRange, testRows, ctBlockView, companyLines } = require('../server/services/planView');
const { renderPlanDocx } = require('../server/services/planRender');
const { formatPlanNumber } = require('../server/services/numbering');
const { makePng } = require('./helpers/png');
const { PLAN } = require('./fixtures/samplePlan');

const ctx = { personnel: new Map(), substations: new Map() };
const docXml = (buf) => new PizZip(buf).file('word/document.xml').asText();
const plain = (xml) => xml.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '');
const paragraphs = (xml) => xml.split('</w:p>').map(plain).map(s => s.trim());

test('formatPlanNumber: "12/PA-TNLĐ.Nhatthu"', () => {
  assert.equal(formatPlanNumber(12, 'TNLĐ', 'Nhatthu'), '12/PA-TNLĐ.Nhatthu');
  assert.equal(formatPlanNumber(3, '', ''), '3/PA');
});

test('normalizePlan: giữ dữ liệu hợp lệ, bắt buộc loại công tác, thiết bị, ngăn lộ, trạm', () => {
  const { data, errors } = normalizePlan(PLAN, ctx);
  assert.deepEqual(errors, []);
  assert.equal(data.testGroups[0].items[4].checked, false);
  assert.equal(data.ctBlocks[0].cores, 2);
  const bad = normalizePlan({ header: {}, station: {} }, ctx).errors.map(e => e.field);
  for (const f of ['workType', 'equipmentText', 'bays', 'station']) assert.ok(bad.includes(f), f);
});

test('normalizePlan: chọn TBA trong danh mục thì lấy tên, đơn vị QLVH, tên viết tắt từ danh mục; chặn danh sách quá dài', () => {
  const substations = new Map([['TBA-1', { id: 'TBA-1', name: 'TBA 500kV Vĩnh Tân', stationId: 'ST-1', unitName: 'Tổ QLVH TBA 500kV Vĩnh Tân', unitShort: 'TBAVT' }]]);
  const { data } = normalizePlan({ ...PLAN, station: { substationId: 'TBA-1', name: 'sửa tay' } }, { ...ctx, substations });
  assert.deepEqual(data.station, { substationId: 'TBA-1', name: 'TBA 500kV Vĩnh Tân', qlvhUnitId: 'ST-1', qlvhUnitName: 'Tổ QLVH TBA 500kV Vĩnh Tân', qlvhShort: 'TBAVT' });
  const tooMany = normalizePlan({ ...PLAN, isolationSteps: Array(51).fill('x') }, ctx);
  assert.equal(tooMany.data, null);
});

test('planView: tiêu đề, thời gian, Bảng 1 đánh số nhóm/hạng mục/hạng mục con, bỏ nhóm không chọn gì', () => {
  assert.deepEqual(companyLines('Công ty Truyền tải điện 3'), ['CÔNG TY', 'TRUYỀN TẢI ĐIỆN 3']);
  assert.equal(formatTimeRange('2026-08-22T15:00', '2026-08-23T06:00'), 'từ 15h00 ngày 22/8/2026 – 06h00 ngày 23/8/2026');
  assert.equal(formatTimeRange(null, null), 'theo lịch cắt điện');
  const rows = testRows(PLAN.testGroups);
  assert.deepEqual(rows.map(r => `${r.stt} ${r.name}`), [
    'I MBA', '1 Kiểm tra bên ngoài', '2 Kiểm tra các biến dòng lắp sẵn (TI chân sứ)', '2.1 - Đo điện trở cách điện cuộn thứ cấp',
    '2.2 - Đặc tính từ hoá', 'II MÁY CẮT', '1 Đo thời gian'
  ]);
  const v = toPlanView({ docNumber: '12/PA-TNLĐ.Nhatthu', data: PLAN });
  assert.equal(v.workTitle, 'Thí nghiệm định kỳ năm 2027 các thiết bị nhất thứ ngăn 530, 532, MBA AT2, 232, 255, 342 Trạm biến áp 500kV Vĩnh Tân');
  assert.equal(v.registerTo, 'Tổ QLVH TBA 500kV Vĩnh Tân');
  assert.match(v.featureText, /chu kỳ theo kế hoạch đã phê duyệt số \[4187\]\.$/);
});

test('ctBlockView: 7 dòng mỗi core như mẫu (XAk-1/-4, -2/-5, -3/-6; kS2/kS3)', () => {
  const b = ctBlockView({ title: 'TI 232', panel: 'D12+MK', prefix: 'XA', firstCore: 3, cores: 1, side: 'S1S4' });
  assert.equal(b.panel, 'Tại tủ =D12+MK');
  assert.deepEqual(b.cores[0], { no: '3', block: 'XA3', a1: 'XA3-1', b1: '3S1', a2: 'XA3-4', b2: '3S4', a3: 'XA3-2', b3: '3S1', a4: 'XA3-5', b4: '3S4', a5: 'XA3-3', b5: '3S1', a6: 'XA3-6', b6: '3S4' });
});

/** Khối Phụ lục II lấy từ thư viện mạch dòng (bản chụp lúc chọn; dữ liệu thử). */
const libCore = (no, ct2 = 'S2') => ({
  coreId: `C${no}`, coreNo: no, terminalBlock: `X4${no}`, drawingRef: `=D02+MK202/11${no}`, pageId: 'P1', region: { x: 0.1, y: 0.1, w: 0.3, h: 0.5 },
  points: [1, 4, 2, 5, 3, 6].map((t, i) => ({ terminal: `X4${no}-${t}`, ctTerminal: `${no}${i % 2 ? ct2 : 'S1'}` }))
});
const LIB_BLOCK = { ctId: 'TI-1', revision: 1, status: 'VERIFIED', name: 'TI 272', panel: '=D02+MK202', coresShown: 4, updatedAt: 't', cores: [1, 2, 3, 4, 5].map(n => libCore(n)) };

test('normalizePlan: khối mạch dòng từ thư viện giữ bản chụp, số core in trong khoảng hợp lệ; khối cũ vẫn dùng được', () => {
  const { data, errors } = normalizePlan({ ...PLAN, ctBlocks: [{ ...LIB_BLOCK, coresShown: 99, extra: 'x' }, PLAN.ctBlocks[0]] }, ctx);
  assert.deepEqual(errors, []);
  const [lib, legacy] = data.ctBlocks;
  assert.equal(lib.ctId, 'TI-1');
  assert.equal(lib.coresShown, 5);
  assert.equal(lib.extra, undefined);
  assert.equal(lib.cores[0].points.length, 6);
  assert.deepEqual(lib.cores[0].points[1], { terminal: 'X41-4', ctTerminal: '1S2' });
  assert.equal(legacy.cores, 2);
  const blank = normalizePlan({ ...PLAN, ctBlocks: [{ ...LIB_BLOCK, cores: [{ coreNo: 1, points: [] }] }] }, ctx).data.ctBlocks[0];
  assert.deepEqual(blank.cores[0].points[0], { terminal: '', ctTerminal: '' });
});

test('ctBlockView (thư viện): theo mẫu cô lập mạch dòng — tủ, khối kẹp kèm tham chiếu bản vẽ, in số core đã chọn', () => {
  const b = ctBlockView(LIB_BLOCK);
  assert.equal(b.title, 'TI 272 tại tủ =D02+MK202');
  assert.equal(b.panel, 'Tại tủ =D02+MK202');
  assert.equal(b.sideHeader, 'Đầu phía CT');
  assert.equal(b.cores.length, 4, 'mặc định 4 core');
  assert.deepEqual(b.cores[0], { no: '1', block: 'X41 (bản vẽ =D02+MK202/111)', a1: 'X41-1', b1: '1S1', a2: 'X41-4', b2: '1S2', a3: 'X41-2', b3: '1S1', a4: 'X41-5', b4: '1S2', a5: 'X41-3', b5: '1S1', a6: 'X41-6', b6: '1S2' });
  assert.equal(ctBlockView({ ...LIB_BLOCK, coresShown: 5 }).cores.length, 5);
});

test('ctBlockView (thư viện): ô trống in "CHƯA ĐỦ DỮ LIỆU"; TI chưa xác nhận in ghi chú bản nháp', () => {
  const core = libCore(1);
  core.points[3].ctTerminal = '';
  const b = ctBlockView({ ...LIB_BLOCK, status: 'DRAFT', cores: [core] });
  assert.equal(b.cores[0].b4, 'CHƯA ĐỦ DỮ LIỆU');
  assert.match(b.title, /^TI 272 tại tủ =D02\+MK202 \(BẢN NHÁP – chưa xác nhận\)$/);
});

test('renderPlanDocx: Phụ lục II in bảng từ thư viện mạch dòng', () => {
  const text = plain(docXml(renderPlanDocx({ docNumber: '1/PA', data: { ...PLAN, ctBlocks: [LIB_BLOCK] } })));
  assert.match(text, /Cô lập mạch dòng TI 272 tại tủ =D02\+MK202 như sau:/);
  assert.match(text, /Tại tủ =D02\+MK202/);
  assert.match(text, /Tách các link hàng kẹp mạch dòng X44 \(bản vẽ =D02\+MK202\/114\)/);
  assert.doesNotMatch(text, /X45/, 'core thứ 5 chưa chọn in');
});

test('renderPlanDocx: điền đủ nội dung, không còn chú thích <…> hay thẻ chưa điền', () => {
  const xml = docXml(renderPlanDocx({ docNumber: '12/PA-TNLĐ.Nhatthu', data: PLAN }));
  const text = plain(xml);
  const ps = paragraphs(xml);
  assert.match(text, /Số: 12\/PA-TNLĐ\.Nhatthu/);
  assert.match(text, /Lâm Đồng, ngày 21 tháng 8 năm 2026/);
  assert.match(text, /Công tác: Thí nghiệm định kỳ năm 2027 các thiết bị nhất thứ ngăn 530/);
  assert.ok(ps.includes('Cắt điện cô lập MBA AT2: mở các DCL 532-3, 232-3, 342-3; đóng các DTĐ 532-38, 232-38, 342-38.'));
  assert.ok(ps.includes('Cô lập mạch dòng TI 532, TI 530 (thực hiện theo phụ lục II).'));
  assert.match(text, /- DCL 532-2, 530-6: một má còn mang điện/);
  assert.match(text, /Gởi đăng ký công tác đến Tổ QLVH TBA 500kV Vĩnh Tân/);
  assert.match(text, /Thực hiện từ 15h00 ngày 22\/8\/2026 – 06h00 ngày 23\/8\/2026/);
  assert.match(text, /Hoàng Trần Quản Trọng/);
  // chỗ ký giữ nguyên nhãn của app ký số công ty (điền khi import phương án)
  for (const tag of ['nguoilap', 'ld_dtc', 'nv_pkt.dvkt', 'ld_pkt.dvkt', 'bgd.dvkt', 'tram.ttd', 'nv_pkt.ttd', 'ld_pkt.ttd', 'bgd.ttd', 'nv_pkt.ctyttd', 'ld_pkt.ctyttd', 'bgd.ctyttd']) {
    assert.ok(text.includes(`((${tag}))`), `giữ nhãn ký số ((${tag}))`);
  }
  assert.ok(ps.includes('- Lưu: VT, Tổ TNLĐ.'));
  assert.match(text, /Tách các link hàng kẹp mạch dòng XA2/);
  assert.match(text, /=B02\+SV1/);
  assert.match(text, /Hợp bộ thí nghiệm nhất thứ CPC 100/);
  assert.match(text, /Thiết bị nâng/);
  assert.match(text, /Trần Văn Hoàng/);
  assert.doesNotMatch(text, /Đo tổn hao ngắn mạch|Không chọn gì/, 'hạng mục bỏ tick không in');
  assert.doesNotMatch(text.replace(/\(\([\w.]+\)\)/g, ''), /[<>]|\(\(|nhập tay|tự động/);
  assert.doesNotMatch(xml, /\{[#/@^]?[\w.]+\}/);
  assert.match(text, /Chưa có bản vẽ sơ đồ của trạm/);
});

test('renderPlanDocx: không cô lập mạch dòng thì Phụ lục II ghi "Không."; có bản vẽ trạm thì chèn ảnh', () => {
  const buf = renderPlanDocx({ docNumber: '1/PA', data: { ...PLAN, ctIsolation: '', ctBlocks: [] } }, [{ label: 'Sơ đồ trạm', buffer: makePng(300, 200) }]);
  const xml = docXml(buf);
  const ps = paragraphs(xml);
  assert.ok(ps.includes('Không.'));
  assert.doesNotMatch(plain(xml), /Cô lập mạch dòng TI/);
  assert.ok(new PizZip(buf).file('word/media/dkct_station_drawing_1.png'));
  assert.match(xml, /r:embed="rIdDkctStationDrawing1"/);
  assert.ok(!ps.includes('Sơ đồ trạm'), 'tên mặc định không in thành tiêu đề');
});

test('renderPlanDocx: TBA 500kV in cả sơ đồ phía 500kV và phía 220kV, mỗi sơ đồ một trang có tên', () => {
  const buf = renderPlanDocx({ docNumber: '1/PA', data: PLAN },
    [{ label: 'Phía 500kV', buffer: makePng(300, 200) }, { label: 'Phía 220kV', buffer: makePng(200, 300) }]);
  const zip = new PizZip(buf);
  const xml = docXml(buf);
  assert.ok(zip.file('word/media/dkct_station_drawing_1.png') && zip.file('word/media/dkct_station_drawing_2.png'));
  const rels = zip.file('word/_rels/document.xml.rels').asText();
  assert.match(rels, /Id="rIdDkctStationDrawing1"[^>]*media\/dkct_station_drawing_1\.png/);
  assert.match(rels, /Id="rIdDkctStationDrawing2"[^>]*media\/dkct_station_drawing_2\.png/);
  const ps = paragraphs(xml);
  assert.ok(ps.indexOf('Phía 500kV') >= 0 && ps.indexOf('Phía 500kV') < ps.indexOf('Phía 220kV'));
  const a4 = xml.slice(xml.indexOf('Phía 500kV'));
  assert.match(a4.slice(0, a4.indexOf('Phía 220kV')), /w:type="page"/, 'sơ đồ thứ hai sang trang mới');
  assert.doesNotMatch(plain(xml), /Chưa có bản vẽ/);
});


test('Đầu phía TI (bảng theo quy ước XAk): chọn hoặc gõ cặp đầu cuộn; từng core chọn riêng được; dữ liệu cũ S2S3/S1S4 vẫn đọc được', () => {
  const { data } = normalizePlan({ ...PLAN, ctBlocks: [
    { title: 'TI 272', panel: 'D02+MK202', prefix: 'X4', firstCore: 1, cores: 3, side: 'kS1 - kS3', coreSides: { 2: 'S2-S5', 3: 'rác', 9: 'S1-S4' } },
    { title: 'TI cũ', panel: 'B02', prefix: 'XA', firstCore: 1, cores: 1, side: 'S1S4' },
    { title: 'TI lỗi', panel: 'B02', prefix: 'XA', firstCore: 1, cores: 1, side: 'không rõ' }
  ] }, ctx);
  const [b, old, bad] = data.ctBlocks;
  assert.equal(b.side, 'S1-S3');
  assert.deepEqual(b.coreSides, { 2: 'S2-S5' }, 'chỉ giữ core trong bảng và cặp đầu hợp lệ');
  assert.equal(old.side, 'S1-S4');
  assert.equal(bad.side, 'S2-S3', 'không đọc được thì về mặc định như trước');
  const v = ctBlockView(b);
  assert.deepEqual([v.cores[0].b1, v.cores[0].b2], ['1S1', '1S3']);
  assert.deepEqual([v.cores[1].b1, v.cores[1].b2, v.cores[1].b6], ['2S2', '2S5', '2S5']);
  assert.deepEqual([v.cores[2].b1, v.cores[2].b2], ['3S1', '3S3']);
  assert.deepEqual([ctBlockView(old).cores[0].b1, ctBlockView(old).cores[0].b2], ['1S1', '1S4']);
});

test('bảng thiết bị cần thí nghiệm: chuẩn hóa (bỏ dòng trống, cắt độ dài), giới hạn 100 dòng', () => {
  const { data } = normalizePlan({ ...PLAN, testEquipment: [
    { name: ' Máy cắt ', position: 'MC 272', note: 'Định kỳ 3 năm' }, { name: '', position: '', note: '' }, { name: 'x'.repeat(300), position: '', note: '' }
  ] }, ctx);
  assert.deepEqual(data.testEquipment[0], { name: 'Máy cắt', position: 'MC 272', note: 'Định kỳ 3 năm' });
  assert.equal(data.testEquipment.length, 2);
  assert.equal(data.testEquipment[1].name.length, 200);
  assert.deepEqual(normalizePlan({ ...PLAN }, ctx).data.testEquipment, [], 'phương án cũ chưa có bảng');
  const over = normalizePlan({ ...PLAN, testEquipment: Array.from({ length: 101 }, () => ({ name: 'a' })) }, ctx);
  assert.equal(over.errors[0].field, 'testEquipment');
});

test('renderPlanDocx: bảng thiết bị cần thí nghiệm ở phần "Thực hiện:", sau "Kiểm tra thí nghiệm các hạng mục…" kèm dòng dẫn; trống thì không in', () => {
  const rows = [{ name: 'Máy cắt', position: 'MC 272', note: 'Định kỳ 3 năm' }, { name: 'Biến dòng điện', position: 'TI 272 & 3 pha', note: 'Đo tỷ số\nĐo cách điện' }];
  const xml = docXml(renderPlanDocx({ docNumber: '12/PA-TNLĐ', data: { ...PLAN, testEquipment: rows } }, []));
  const text = plain(xml);
  const doing = text.indexOf('Thực hiện:');
  const testLine = text.indexOf('Kiểm tra thí nghiệm các hạng mục', doing);
  const intro = text.indexOf('Thiết bị cần thí nghiệm:');
  const table = text.indexOf('STTTên thiết bịKý hiệu / vị tríHạng mục / Ghi chú');
  assert.ok(doing > text.indexOf('Phương án thực hiện') && testLine > doing && intro > testLine && table > intro, 'Thực hiện → Kiểm tra thí nghiệm… → dòng dẫn → bảng');
  assert.ok(table < text.indexOf('Lưu ý'), 'trước "Lưu ý"');
  // dòng dẫn cùng kiểu đầu dòng với đoạn "Kiểm tra thí nghiệm…", giữ liền với bảng
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
  const testPara = paras.find(p => plain(p).startsWith('Kiểm tra thí nghiệm các hạng mục'));
  const introPara = paras.find(p => plain(p) === 'Thiết bị cần thí nghiệm:');
  const numPr = (p) => (p.match(/<w:numPr>[\s\S]*?<\/w:numPr>/) || [''])[0];
  assert.equal(numPr(introPara), numPr(testPara));
  assert.match(introPara, /<w:keepNext\/>/);
  assert.ok(text.indexOf('1Máy cắtMC 272Định kỳ 3 năm') > table);
  assert.ok(text.includes('2Biến dòng điệnTI 272 &amp; 3 phaĐo tỷ sốĐo cách điện'));
  assert.match(xml, /TI 272 &amp; 3 pha/, 'thoát ký tự XML');
  assert.match(xml, /Đo tỷ số<\/w:t><w:br\/><w:t xml:space="preserve">Đo cách điện/, 'xuống dòng trong ô');
  assert.match(xml, /<w:tblHeader\/>/, 'lặp dòng tiêu đề khi sang trang');
  const none = plain(docXml(renderPlanDocx({ docNumber: '12/PA-TNLĐ', data: { ...PLAN, testEquipment: [] } }, [])));
  assert.ok(!none.includes('Ký hiệu / vị trí'));
});

test('insertAfterCheckLine / thẻ {@testEquipmentXml}: mẫu có thẻ thì in tại thẻ; không thấy dòng "Kiểm tra:" thì giữ nguyên', () => {
  const { insertAfterCheckLine, testEquipmentXml } = require('../server/services/planRender');
  const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const table = testEquipmentXml([{ name: 'A', position: 'B', note: 'C' }]);
  const doc = p('Kiểm tra: đầu văn bản') + p('3. Phương án thực hiện:') + p('Trình tự…') + `<w:p><w:r><w:t>- Kiểm </w:t></w:r><w:r><w:t>tra: </w:t></w:r></w:p>` + p('bước 1');
  const out = insertAfterCheckLine(doc, table);
  assert.ok(out.indexOf('<w:tbl>') > out.indexOf('tra: ') && out.indexOf('<w:tbl>') < out.indexOf('bước 1'), 'chữ "Kiểm tra:" tách nhiều run');
  assert.equal(insertAfterCheckLine(p('Không có mục'), table), p('Không có mục'));
  assert.equal(testEquipmentXml([]), '');
  // mẫu có thẻ riêng: in tại thẻ, không chèn lần hai
  const tpl = new PizZip(require('node:fs').readFileSync(require('../server/services/planRender').TEMPLATE_PATH));
  const body = tpl.file('word/document.xml').asText();
  tpl.file('word/document.xml', body.replace('<w:body>', '<w:body><w:p><w:r><w:t>{@testEquipmentXml}</w:t></w:r></w:p>'));
  const buf = tpl.generate({ type: 'nodebuffer' });
  const xml = docXml(renderPlanDocx({ docNumber: '1', data: { ...PLAN, testEquipment: [{ name: 'Máy cắt', position: '', note: '' }] } }, [], buf));
  assert.equal((xml.match(/Ký hiệu \/ vị trí/g) || []).length, 1);
  assert.ok(xml.indexOf('Ký hiệu / vị trí') < xml.indexOf('Phương án thực hiện'), 'in tại thẻ ở đầu văn bản');
});

test('Phụ lục I.1 trạng thái cô lập: mặc định máy cắt / DCL "Mở", dao tiếp địa "Đóng"; phương án cũ (chuỗi) đọc được; giữ lựa chọn', () => {
  const { data } = normalizePlan({ ...PLAN, isolationDevices: [
    'MC530', '530-6', '530-65', '532-38', 'DTĐ C51', { name: '565-85', receive: 'open', handover: 'closed' }, { name: 'MC571', receive: 'sai' }, ''
  ] }, ctx);
  assert.deepEqual(data.isolationDevices.map(d => [d.name, d.receive, d.handover]), [
    ['MC530', 'open', 'open'], ['530-6', 'open', 'open'], ['530-65', 'closed', 'closed'], ['532-38', 'closed', 'closed'],
    ['DTĐ C51', 'closed', 'closed'], ['565-85', 'open', 'closed'], ['MC571', 'open', 'open']
  ]);
});

test('renderPlanDocx: bảng trạng thái cô lập đánh dấu "√" đúng cột Mở / Đóng khi tiếp nhận và giao trả', () => {
  const xml = docXml(renderPlanDocx({ docNumber: '1', data: { ...PLAN, isolationDevices: [
    'MC530', '530-65', { name: '565-85', receive: 'open', handover: 'closed' }
  ] } }, []));
  const at = xml.indexOf('Khi tiếp nhận hiện trường');
  const table = xml.slice(xml.lastIndexOf('<w:tbl>', at), xml.indexOf('</w:tbl>', at));
  const rows = [...table.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(r => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c => plain(c[0]).trim()));
  const data = rows.filter(r => ['MC530', '530-65', '565-85'].includes(r[1]));
  assert.deepEqual(data, [
    ['', 'MC530', '√', '', '√', ''],
    ['', '530-65', '', '√', '', '√'],
    ['', '565-85', '√', '', '', '√']
  ]);
  // không có thiết bị: bảng giữ nguyên, không lỗi
  const { markIsolationTable } = require('../server/services/planRender');
  assert.equal(markIsolationTable('<w:p/>', [{ receive: 'open' }]), '<w:p/>');
});
