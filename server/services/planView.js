/**
 * Dữ liệu Phương án -> giá trị điền vào thẻ của templates/template_pa.docx.
 */
const { splitHeaderLine } = require('./docxView');
const { formatPlanNumber } = require('./numbering');
const { parseSide } = require('./ctLibrary');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const roman = (i) => ROMAN[i] || String(i + 1);
const lowerFirst = (s) => (s ? s.charAt(0).toLocaleLowerCase('vi') + s.slice(1) : '');

/** "Công ty Truyền tải điện 3" -> ["CÔNG TY", "TRUYỀN TẢI ĐIỆN 3"] như mẫu; tên khác tách như đầu giấy ĐKCT. */
function companyLines(name) {
  const upper = String(name || '').trim().toLocaleUpperCase('vi');
  const m = /^(CÔNG TY)\s+(.+)$/.exec(upper);
  return m ? [m[1], m[2]] : splitHeaderLine(name);
}

function timeParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso || '');
  return m ? { hm: `${m[4]}h${m[5]}`, date: `${Number(m[3])}/${Number(m[2])}/${m[1]}` } : null;
}

/** "từ 15h00 ngày 22/8/2026 – 06h00 ngày 23/8/2026"; thiếu giờ thì theo lịch cắt điện. */
function formatTimeRange(start, end) {
  const a = timeParts(start);
  const b = timeParts(end);
  if (!a) return 'theo lịch cắt điện';
  return b ? `từ ${a.hm} ngày ${a.date} – ${b.hm} ngày ${b.date}` : `từ ${a.hm} ngày ${a.date}`;
}

/** Bảng 1: dòng nhóm (I, II…) + hạng mục đã chọn, đánh số 1, 2… và 1.1, 1.2… cho hạng mục con. */
function testRows(groups) {
  const rows = [];
  (groups || []).forEach((g, gi) => {
    const items = (g.items || []).filter(it => it.checked !== false);
    if (!items.length) return;
    rows.push({ isGroup: true, stt: roman(gi), name: g.label, note: '' });
    let n = 0;
    let k = 0;
    for (const it of items) {
      if (it.level === 1 && n > 0) {
        k += 1;
        rows.push({ isGroup: false, stt: `${n}.${k}`, name: it.name, note: it.note || '' });
      } else {
        n += 1;
        k = 0;
        rows.push({ isGroup: false, stt: String(n), name: it.name, note: it.note || '' });
      }
    }
  });
  // đánh lại số La Mã liên tục khi có nhóm bị bỏ trống
  rows.filter(r => r.isGroup).forEach((r, i) => { r.stt = roman(i); });
  return rows;
}

/** Bảng 2: nhóm thiết bị thí nghiệm (theo thứ tự xuất hiện) + các thiết bị. */
function instrumentRows(instruments) {
  const groups = [];
  for (const x of instruments || []) {
    let g = groups.find(y => y.name === (x.group || ''));
    if (!g) { g = { name: x.group || '', items: [] }; groups.push(g); }
    g.items.push(x);
  }
  const rows = [];
  groups.forEach((g, i) => {
    if (g.name) rows.push({ isGroup: true, stt: roman(i), name: g.name });
    g.items.forEach(x => rows.push({ isGroup: false, name: x.name, unit: x.unit, qty: x.qty, note: x.note }));
  });
  return rows;
}

const INSUFFICIENT = 'CHƯA ĐỦ DỮ LIỆU';
const panelEq = (p) => (p ? `=${String(p).replace(/^=/, '')}` : '');

/**
 * Phụ lục II, khối từ thư viện mạch dòng (theo templates/template_co_lap_mach_dong.docx): in coresShown core đầu,
 * mỗi core "Tách các link hàng kẹp mạch dòng X41 (bản vẽ =D02+MK202/115)" + 6 dòng L1/L2/L3; ô trống in "CHƯA ĐỦ DỮ LIỆU".
 */
function libraryBlockView(b) {
  const panel = panelEq(b.panel);
  const draft = b.status === 'VERIFIED' ? '' : ' (BẢN NHÁP – chưa xác nhận)';
  const cores = (b.cores || []).slice(0, b.coresShown || 4).map(c => {
    const core = {
      no: c.coreNo ? String(c.coreNo) : INSUFFICIENT,
      block: `${c.terminalBlock || INSUFFICIENT}${c.drawingRef ? ` (bản vẽ ${c.drawingRef})` : ''}`
    };
    for (let k = 0; k < 6; k++) {
      core[`a${k + 1}`] = c.points?.[k]?.terminal || INSUFFICIENT;
      core[`b${k + 1}`] = c.points?.[k]?.ctTerminal || INSUFFICIENT;
    }
    return core;
  });
  return {
    title: `${[b.name, panel && `tại tủ ${panel}`].filter(Boolean).join(' ')}${draft}`,
    panel: panel ? `Tại tủ ${panel}` : 'Tại tủ',
    coreHeader: 'Core', sideHeader: 'Đầu phía CT', cores
  };
}

/** Phụ lục II: mỗi core 7 dòng như mẫu — XAk-1/-4 (L1), -2/-5 (L2), -3/-6 (L3), đầu phía TI theo cặp đã chọn (kS1-kS4…). */
function ctBlockView(b) {
  if (b.ctId) return libraryBlockView(b);
  const cores = [];
  for (let i = 0; i < b.cores; i++) {
    const no = b.firstCore + i;
    // đầu riêng của core (nếu có), không thì đầu chung của bảng
    const [s1, s2] = parseSide(b.coreSides?.[no]) || parseSide(b.side) || ['S2', 'S3'];
    const block = `${b.prefix}${no}`;
    const core = { no: String(no), block };
    [1, 4, 2, 5, 3, 6].forEach((t, k) => {
      core[`a${k + 1}`] = `${block}-${t}`;
      core[`b${k + 1}`] = `${no}${k % 2 === 0 ? s1 : s2}`;
    });
    cores.push(core);
  }
  return { title: b.title, panel: b.panel ? `Tại tủ ${panelEq(b.panel)}` : '', coreHeader: 'Core', sideHeader: 'Đầu phía TI', cores };
}

function toPlanView({ docNumber, data }) {
  const h = data.header || {};
  const [companyLine1, companyLine2] = companyLines(h.companyName);
  const [unitLine1, unitLine2] = splitHeaderLine(h.unitName);
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(h.date || '');
  const stationName = data.station?.name || '';
  const year = data.year || '';
  const range = formatTimeRange(data.time?.start, data.time?.end);
  return {
    companyLine1, companyLine2, unitLine1, unitLine2,
    docNumber: docNumber || '.....',
    place: h.place || '.....',
    day: date ? String(Number(date[3])) : '.....',
    month: date ? String(Number(date[2])) : '.....',
    year: date ? date[1] : '.....',
    workTitle: [`${data.workType} năm ${year}`.trim(), data.equipmentText, stationName].filter(Boolean).join(' '),
    purposeText: `Phương án thi công và biện pháp an toàn này được thiết lập để đơn vị công tác ${[h.teamName, h.unitName].filter(Boolean).join(' - ')}`
      + ` thực hiện công tác ${lowerFirst(data.workType)} năm ${year} ${data.equipmentText} ${lowerFirst(stationName)}.`.replace(/\s+/g, ' '),
    timeText: range,
    timeRange: range,
    legalBases: data.legalBases || [],
    featureText: `Căn cứ kế hoạch thí nghiệm định kỳ và kiểm định an toàn kỹ thuật các thiết bị ${lowerFirst(stationName)} năm ${year}: `
      + `${data.workType} ${data.equipmentText}, hạng mục thực hiện theo Quyết định số [1901]`
      + `${data.approvalRef ? `, chu kỳ theo kế hoạch đã phê duyệt số ${data.approvalRef}` : ''}.`,
    bays: data.bays || '',
    stationName,
    registerTo: data.station?.qlvhUnitName || stationName,
    workloads: data.workloads || [],
    isolationSteps: data.isolationSteps || [],
    ctLines: data.ctIsolation ? [`Cô lập mạch dòng ${data.ctIsolation} (thực hiện theo phụ lục II).`] : [],
    liveDisconnectorLines: data.liveDisconnectors
      ? [`- DCL ${data.liveDisconnectors}: một má còn mang điện, chỉ kiểm tra bằng mắt ở khoảng cách an toàn, không được làm việc tại các DCL này.`]
      : [],
    risks: (data.risks || []).map(r => ({ hazard: r.hazard, measures: r.measures, performer: r.performer })),
    reserve: data.reserve || 'Không.',
    teamName: h.teamName || '',
    unitName: h.unitName || '',
    companyName: h.companyName || '',
    transmissionName: h.transmissionName || '',
    preparedBy: data.preparedBy || '',
    teamLeader: data.teamLeader || '',
    recipients: data.recipients || [],
    isolationDevices: data.isolationDevices || [],
    testRows: testRows(data.testGroups),
    instrumentRows: instrumentRows(data.instruments),
    ctBlocks: (data.ctBlocks || []).map(ctBlockView),
    people: (data.people || []).map((p, i) => ({ stt: String(i + 1), name: p.person.name, level: p.person.safetyLevel || '', duty: p.duty }))
  };
}

module.exports = { toPlanView, formatTimeRange, testRows, instrumentRows, ctBlockView, companyLines, formatPlanNumber };
