// Biên bản khảo sát hiện trường mẫu (dữ liệu đã chuẩn hóa), theo ví dụ trong mẫu Word.
const SURVEY = {
  header: { unitName: 'Đội Sửa chữa, thí nghiệm điện 3', teamName: 'Tổ Thí nghiệm điện Lâm Đồng', teamShort: 'TNLĐ' },
  surveyTime: '2026-07-21T09:30',
  station: { substationId: null, name: 'Trạm biến áp 220kV Tháp Chàm', qlvhUnitId: null, qlvhUnitName: '' },
  workUnitReps: [
    { honorific: 'Ông', name: 'Hoàng Trần Quản Trọng', role: 'Tổ phó - Tổ TNLĐ' },
    { honorific: 'Ông', name: 'Nguyễn Hữu Kính', role: 'Tổ trưởng - Tổ TNLĐ' }
  ],
  qlvhReps: [{ honorific: 'Ông', name: 'Nguyễn Yên', role: 'Tổ trưởng Tổ TTLĐ Tháp Chàm' }],
  relatedUnits: 'không',
  equipment: 'Ngăn 275: TU275, TI275',
  workContent: 'Thí nghiệm kiểm chứng hạng mục điện trở cách điện cuộn hạ TU275, TI275.',
  scopeItems: ['TU 275 - 3 pha', 'TI 275 - 3 pha'],
  timeText: 'theo lịch cắt điện được duyệt.',
  risks: [
    {
      hazard: 'Chuẩn bị biện pháp kỹ thuật an toàn để làm việc khi công tác tại ngăn xuất tuyến 275',
      measures: 'Cắt điện, cô lập MC 275, TI275, TU275 TBA 220kV Tháp Chàm.\nCắt áp tô mát hạ thế TU275.',
      performer: 'Đơn vị QLVH'
    },
    { hazard: 'Ngã cao khi làm việc trên cao từ 2m trở lên.', measures: 'Trang bị, giám sát BHLĐ.', performer: 'Đơn vị công tác' }
  ],
  diagramDate: '2026-07-21',
  diagramMarks: [{ x: 0.43, y: 0.1, w: 0.08, h: 0.17, label: 'Khu vực công tác' }],
  outageId: null
};

module.exports = { SURVEY };
