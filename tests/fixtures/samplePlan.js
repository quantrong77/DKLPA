// Phương án mẫu (dữ liệu đã chuẩn hóa), theo ví dụ trong mẫu Word PA TNĐK.
const PLAN = {
  header: {
    companyName: 'Công ty Truyền tải điện 3', unitName: 'Đội Sửa chữa, thí nghiệm điện 3', teamName: 'Tổ Thí nghiệm điện Lâm Đồng',
    teamShort: 'TNLĐ', transmissionName: 'Truyền tải điện Lâm Đồng', place: 'Lâm Đồng', date: '2026-08-21', numberSuffix: 'Nhatthu'
  },
  workType: 'Thí nghiệm định kỳ',
  year: 2027,
  equipmentText: 'các thiết bị nhất thứ ngăn 530, 532, MBA AT2, 232, 255, 342',
  bays: '530, 532, MBA AT2, 232, 255, 342',
  station: { substationId: null, name: 'Trạm biến áp 500kV Vĩnh Tân', qlvhUnitId: null, qlvhUnitName: 'Tổ QLVH TBA 500kV Vĩnh Tân', qlvhShort: 'TBAVT' },
  time: { start: '2026-08-22T15:00', end: '2026-08-23T06:00' },
  approvalRef: '[4187]',
  legalBases: ['Căn cứ Quy trình an toàn điện của Tổng Công ty Truyền tải điện Quốc gia ban hành theo quyết định số 726/QĐ-EVNNPT, ngày 22 tháng 5 năm 2026;',
    'Căn cứ tài liệu hướng dẫn của nhà chế tạo.'],
  workloads: ['Kiểm tra thí nghiệm định kỳ các thiết bị nhất thứ thuộc ngăn lộ 530, 532, 232, 342, MBA AT2.',
    'Kiểm tra thí nghiệm định kỳ hạng mục 01 năm các thiết bị nhất thứ thuộc ngăn lộ 255.'],
  isolationSteps: ['Cắt điện cô lập ngăn MC 530, 532: mở MC 530, MC 532; đóng các DTĐ 530-65, 530-85.',
    'Cắt điện cô lập MBA AT2: mở các DCL 532-3, 232-3, 342-3; đóng các DTĐ 532-38, 232-38, 342-38.'],
  ctIsolation: 'TI 532, TI 530',
  liveDisconnectors: '532-2, 530-6',
  risks: [{ hazard: 'Ngã cao khi làm việc trên cao từ 2m trở lên.', measures: 'Trang bị đủ bảo hộ lao động.', performer: 'Đơn vị công tác' }],
  people: [
    { person: { personnelId: null, name: 'Trần Văn Hoàng', safetyLevel: '5/5', safetyCard: '058' }, duty: 'CHTT' },
    { person: { personnelId: null, name: 'Lê Hữu Anh', safetyLevel: '4/5', safetyCard: '' }, duty: 'NVĐVCT' }
  ],
  reserve: 'Không.',
  teamLeader: 'Nguyễn Hữu Kính',
  preparedBy: 'Hoàng Trần Quản Trọng',
  recipients: ['TTĐ LĐ;', 'TBAVT;', 'Lưu: VT, TNLĐ.'],
  isolationDevices: ['MC530', '530-6', '530-65'],
  testGroups: [
    { deviceKey: 'MBA', cycle: 'y3', label: 'MBA', items: [
      { name: 'Kiểm tra bên ngoài', note: '', level: 0, checked: true },
      { name: 'Kiểm tra các biến dòng lắp sẵn (TI chân sứ)', note: '', level: 0, checked: true },
      { name: '- Đo điện trở cách điện cuộn thứ cấp', note: '', level: 1, checked: true },
      { name: '- Đặc tính từ hoá', note: '', level: 1, checked: true },
      { name: 'Đo tổn hao ngắn mạch', note: '', level: 0, checked: false }
    ] },
    { deviceKey: 'MC_SF6', cycle: 'y6', label: 'MÁY CẮT', items: [{ name: 'Đo thời gian', note: 'Đối với MC có U ≥ 35kV', level: 0, checked: true }] },
    { deviceKey: 'DCL', cycle: 'y3', label: 'DAO CÁCH LY', items: [{ name: 'Không chọn gì', note: '', level: 0, checked: false }] }
  ],
  instruments: [
    { group: 'Nhất thứ', name: 'Hợp bộ thí nghiệm nhất thứ CPC 100', unit: 'Bộ', qty: '01', note: '' },
    { group: 'Thiết bị nâng', name: 'Xe chở người 16C', unit: 'Xe', qty: '01', note: '' }
  ],
  ctBlocks: [{ title: 'TI 532 tại tủ =B02+SV1', panel: 'B02+SV1', prefix: 'XA', firstCore: 1, cores: 2, side: 'S2S3' }],
  surveyId: null,
  outageId: null
};

module.exports = { PLAN };
