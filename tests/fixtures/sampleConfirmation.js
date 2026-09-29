// Giấy xác nhận đủ điều kiện đóng điện mẫu (dữ liệu nhập), theo ví dụ trong mẫu Word.
const CONFIRMATION = {
  header: { companyName: 'Công ty Truyền tải điện 3', unitName: 'Đội Sửa chữa, thí nghiệm điện 3', teamName: 'Tổ Thí nghiệm điện Lâm Đồng',
    teamShort: 'TNLĐ', place: 'Lâm Đồng', date: '2026-09-27' },
  station: { substationId: null, name: 'Trạm 220kV Hàm Tân' },
  bays: 'MC 212',
  workDate: '2026-09-27',
  workObject: 'MC 212',
  items: [{ text: 'Thí nghiệm định kỳ máy cắt MC 212, các hạng mục theo QĐ 1901', result: 'đạt' },
    { text: 'Thí nghiệm TI 212', result: '' }, { text: '  ', result: 'đạt' }],
  equipment: 'máy cắt MC 212, TI 212',
  note: 'Đã tháo tiếp địa di động.',
  signer: 'Hoàng Trần Quản Trọng'
};

module.exports = { CONFIRMATION };
