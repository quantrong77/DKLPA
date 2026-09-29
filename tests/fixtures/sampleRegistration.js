/** Giấy ĐKCT mẫu dùng chung cho test và scripts/render-sample.js */
const hoang = { personnelId: 'P1', name: 'Trần Văn Hoàng', safetyLevel: '5/5', safetyCard: '058' };
const quang = { personnelId: 'P4', name: 'Ngô Văn Quang', safetyLevel: '5/5', safetyCard: '057' };
const quynh = { personnelId: 'P2', name: 'Kim Văn Quỳnh', safetyLevel: '5/5', safetyCard: '066' };
const linh = { personnelId: null, name: 'Trần Phúc Linh', safetyLevel: '3/5', safetyCard: '' };

const REG = {
  docNumber: '215/ĐK-TNLĐ',
  data: {
    header: { unitName: 'Đội Sửa chữa, thí nghiệm điện 3', teamName: 'Tổ Thí nghiệm điện Lâm Đồng', place: 'Lâm Đồng', date: '2026-09-23', basis: '... (Biên bản khảo sát hiện trường/Đánh giá rủi ro) ...' },
    representative: { honorific: 'Ông', name: 'Nguyễn Hữu Kính', role: 'Tổ trưởng', contact: '0962524070 (kinhhuunguyen@gmail.com)' },
    recipient: { stationId: 'S1', name: 'Tổ thao tác lưu động Phan Thiết', email: 'a@b.c' },
    workContent: { text: '1.1/ Thay thế MC 174 & DCL <174-1>', source: 'manual' },
    workLocation: 'Các ngăn XT 174, MC 112',
    condition: { text: 'Cô lập MC174', source: 'outage' },
    time: { start: '2026-09-25T07:00', end: '2026-09-25T23:00' },
    workUnitCount: 2,
    workUnits: [
      { seq: 1, commander: hoang, members: [quynh, linh], memberCount: 2, location: '', start: null, end: null },
      { seq: 2, commander: quang, members: [quynh], memberCount: 1, location: 'Ngăn MC112', start: '2026-09-25T10:00', end: '2026-09-25T23:00' }
    ],
    leader: null,
    supervisors: [{ personnelId: null, name: 'Lê Giám Sát', safetyLevel: '4/5', safetyCard: '' }],
    watchmen: [],
    otherUnits: ['Tổ Vận hành TBA Phan Thiết'],
    nominees: [
      { person: hoang, card: '5/5 _ 058', duty: 'Chỉ huy trực tiếp đơn vị công tác 1' },
      { person: linh, card: '3/5', duty: 'Nhân viên đơn vị công tác 1' }
    ],
    permits: [{ permitNo: 1, isolation: 'Cô lập MC174 (25/09/2026 07:00 - 10:00)', workUnitSeq: 1, commander: hoang, content: '- Thí nghiệm nhất thứ\n- TNĐK 2027', workers: [quynh, linh], note: '' }],
    risks: [{ hazard: 'Phóng điện cảm ứng', measures: '- Tiếp đất\n- BHLĐ', performer: 'Đơn vị công tác.' }],
    signatoryName: 'Nguyễn Hữu Kính'
  }
};

module.exports = { REG, hoang, quang, quynh, linh };
