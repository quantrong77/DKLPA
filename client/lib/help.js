// Nội dung "Hướng dẫn" theo tab và "Giới thiệu" (thuần, không phụ thuộc React). Sửa nội dung ở đây.

export const ABOUT = {
  summary: 'Ứng dụng hỗ trợ tổ thí nghiệm, sửa chữa chuẩn bị công tác tại trạm biến áp theo đúng trình tự: từ lịch cắt điện, '
    + 'khảo sát hiện trường, lập phương án, đăng ký công tác đến giấy xác nhận đủ điều kiện đóng điện. Văn bản xuất ra Word '
    + 'theo mẫu của đơn vị, giữ nhãn ký số để ký trên ứng dụng ký số của Công ty.',
  features: [
    'Nạp lịch cắt điện từ Excel hoặc tự tải từ trang lịch của Công ty; so sánh khi nạp lại: hoãn, dời lịch, sửa nội dung, phát sinh.',
    'Theo dõi luồng công việc 5 bước cho từng hồ sơ, kể cả công việc không có lịch cắt điện; cảnh báo khi lịch cắt điện của hồ sơ thay đổi.',
    'Lập biên bản khảo sát, phương án, giấy đăng ký công tác, giấy xác nhận; xem trước Word, tải Word/PDF.',
    'Thư viện cô lập mạch dòng TI và tự đọc bản vẽ mạch dòng PDF (không dùng AI).',
    'Danh mục nhân sự, đơn vị, trạm, rủi ro; khu vực phụ trách của tổ; mẫu Word thay đổi được không cần sửa phần mềm.'
  ],
  developer: { name: 'Hoàng Trần Quản Trọng', email: 'quantrong77@gmail.com' }
};

/** Mục hướng dẫn: id trùng tab của ứng dụng (outages, surveys, …) để mở đúng mục đang xem. */
export const HELP_SECTIONS = [
  {
    id: 'general', title: 'Bắt đầu',
    items: [
      ['Luồng công việc', 'Thanh "1. Lịch / Công việc → 2. Khảo sát → 3. Phương án → 4. Giấy ĐKCT → 5. Giấy xác nhận" là trình tự chuẩn bị một công tác. Bấm một bước để mở danh sách của bước đó. Việc không đăng ký cắt điện thì bắt đầu từ "Công việc không có lịch cắt điện" ở bước 1.'],
      ['Theo dõi một hồ sơ', 'Bấm biểu tượng luồng ở đầu một dòng (hoặc mở hồ sơ): thanh luồng tô màu bước đã có (xanh lá ✓), bước đang chọn (xanh dương), bước nên làm tiếp (vàng); các hồ sơ cùng luồng được viền xanh trong danh sách.'],
      ['Cảnh báo lịch', 'Hồ sơ gắn dòng lịch đã hoãn / dời / sửa có nhãn "Lịch: …" trong danh sách và dải cảnh báo khi mở — kiểm tra lại trước khi in, nộp.'],
      ['Tải lại', 'Nút vòng xoay ở góc phải đầu trang lấy dữ liệu mới nhất từ máy chủ: danh sách của tab đang mở, danh mục, quyền và luồng hồ sơ đang theo dõi (không mất hồ sơ đang soạn). Vòng xoay quay khi đang tải; dòng "Cập nhật hh:mm" bên cạnh cho biết lần tải gần nhất. Dùng khi người khác vừa lập, sửa hồ sơ hoặc danh mục.'],
      ['Phím tắt', 'Trong biểu mẫu: Ctrl+S lưu, Esc đóng (hỏi lại nếu chưa lưu); ảnh khảo sát, sơ đồ: Ctrl+V dán ảnh. Nhãn "● Chưa lưu" ở đầu biểu mẫu nhắc còn thay đổi chưa lưu; đóng tab trình duyệt khi chưa lưu thì trình duyệt hỏi lại.'],
      ['Nhớ chỗ đang xem', 'Tải lại trang vẫn mở đúng tab, đúng mục danh mục / cài đặt đang xem.'],
      ['Giao diện', 'Nút bảng màu ở đầu trang: chọn "Mặc định" hoặc "Chuyên nghiệp"; trình duyệt ghi nhớ lựa chọn.'],
      ['Quyền', 'Trưởng/phó tổ, trưởng phòng, admin lập và sửa hồ sơ của tổ; thành viên xem. Dọn lịch, sửa thư viện mạch dòng và tab "Cài đặt" (khu vực, trạm của tổ, tải lịch tự động, mẫu văn bản) chỉ admin.']
    ]
  },
  {
    id: 'outages', title: 'Lịch cắt điện · Công việc',
    items: [
      ['Công việc không có lịch cắt điện', 'Ở bước 1 chọn "Công việc không có lịch cắt điện" → "Thêm công việc": ghi nội dung, trạm, địa điểm/thiết bị, thời gian, điều kiện (mặc định "Không cắt điện."). Trên dòng công việc bấm Lập biên bản KSHT, Lập phương án, Tạo giấy ĐKCT — các mục tự điền và hồ sơ nối vào luồng như khi lập từ lịch. Công việc đã có hồ sơ thì không xóa được.'],
      ['Nạp lịch', '"Tải lịch cắt điện": máy chủ tự đăng nhập trang lịch Công ty, tải theo khoảng ngày rồi nạp luôn (cần cấu hình tài khoản). Hoặc "Chọn file lịch cắt điện (Excel)" → xem trước → "Cập nhật lịch".'],
      ['So sánh khi nạp lại', 'Chọn khoảng so sánh: dòng Hoãn (đỏ), Dời lịch (xanh), Sửa nội dung (tím), Phát sinh (vàng); không đổi để nguyên. Bấm một mục trong kết quả để tới dòng đó. Dời/sửa cập nhật tại chỗ nên hồ sơ đã gắn vẫn trỏ đúng.'],
      ['Tự tải và báo', 'Admin đặt tài khoản và giờ tải bằng nút "Cài đặt tải lịch" ở dòng trên cùng (hoặc Cài đặt → Tải lịch tự động); dòng trên cùng cho biết giờ tải và lần tải gần nhất; người lập hồ sơ liên quan và tổ trưởng nhận tin nhắn khi lịch thay đổi; có thể báo thêm qua Zalo (Cài đặt → Thông báo Zalo).'],
      ['Lọc, tìm', 'Chọn khoảng ngày, gõ từ khóa (trạm, thiết bị, đơn vị); bấm thẻ thống kê để lọc; "Chỉ tổ của tôi" giữ dòng thuộc khu vực tổ phụ trách hoặc tổ đã lập hồ sơ.'],
      ['Ẩn/hiện khung', 'Nút con mắt "Tải lịch" và "Thống kê" ở hàng lọc ẩn/hiện khung tải lịch và các thẻ thống kê cho gọn màn hình; trình duyệt ghi nhớ lựa chọn.'],
      ['Từ một dòng lịch', 'Lập biên bản KSHT, Lập phương án, Tạo giấy ĐKCT, Lập giấy xác nhận — nội dung, phạm vi, thời gian tự điền (giấy xác nhận theo giấy ĐKCT mới nhất của tổ cho dòng lịch, chưa có giấy thì theo chính dòng lịch). "Lịch sử thay đổi" xem các lần dòng lịch bị hoãn / dời / sửa.'],
      ['Dọn lịch cũ (admin)', 'Chọn khoảng ngày, xem số dòng sẽ xóa rồi xác nhận; dòng đã có hồ sơ gắn được giữ lại.']
    ]
  },
  {
    id: 'surveys', title: 'Khảo sát hiện trường',
    items: [
      ['Lập biên bản', 'Từ dòng lịch cắt điện hoặc nút "Lập biên bản". Ghi thời điểm, trạm, thành phần (đại diện đầu tiên mỗi bên ký cuối biên bản), địa điểm, nội dung, phạm vi, rủi ro và biện pháp.'],
      ['Sơ đồ', 'Tải ảnh, dán ảnh chụp màn hình, hoặc chọn bản vẽ của trạm trong danh mục; đánh dấu vùng làm việc trên sơ đồ.'],
      ['Hình ảnh khảo sát (nếu có)', 'Chọn nhiều ảnh, kéo thả hoặc dán (Ctrl+V); ghi chú thích, đổi thứ tự bằng mũi tên, xóa ảnh. Ảnh được thu nhỏ trước khi tải lên và in ở trang cuối biên bản (sau sơ đồ), 2 ảnh mỗi hàng, tối đa 30 ảnh.'],
      ['Xuất văn bản', '"Xem trước" xem bản Word ngay bên cạnh (tải PDF trong khung xem trước); "Lưu & tải Word"; sau khi tải bấm "Đăng QLTN" để mở trang QLTN và đăng biên bản.'],
      ['Bước tiếp theo', 'Từ biên bản lập phương án hoặc giấy ĐKCT: căn cứ, nội dung, địa điểm, rủi ro được chép sang.']
    ]
  },
  {
    id: 'plans', title: 'Phương án',
    items: [
      ['4 bước soạn', '1. Chung & pháp lý · 2. Thi công & an toàn · 3. Phụ lục I (hạng mục thí nghiệm theo QĐ 1901, thiết bị thí nghiệm) · 4. Phụ lục II, III, ký.'],
      ['Ngăn lộ cắt điện', 'Tự lấy từ "Phạm vi / điều kiện cắt điện" của dòng lịch; sửa được.'],
      ['Trạng thái cô lập (Phụ lục I.1)', '"Lấy từ trình tự cô lập" lập danh sách thiết bị; mặc định máy cắt, dao cách ly "Mở", dao tiếp địa (vd 565-65, 565-85) "Đóng" khi tiếp nhận và giao trả hiện trường; đổi bằng ô chọn Mở / Đóng. File Word đánh dấu "√" vào cột tương ứng.'],
      ['Bảng thiết bị cần thí nghiệm', 'Bước 2, mục E.3: bảng STT / Tên thiết bị / Ký hiệu, vị trí / Hạng mục, ghi chú, in ở phần "Thực hiện:" của mục 3 (dòng "Thiết bị cần thí nghiệm:" sau "Kiểm tra thí nghiệm các hạng mục…"). Cột Tên thiết bị chọn trong danh sách loại thiết bị QĐ 1901 (Máy biến áp, Máy cắt SF6, Biến dòng điện…) hoặc tự ghi; cột Hạng mục / Ghi chú có ô Chu kỳ chỉ liệt kê các chu kỳ có hạng mục của thiết bị đó theo QĐ 1901 (chọn thì ghi vào đầu ghi chú, vd "6 năm; …"). "Điền từ Phụ lục I" lập sẵn mỗi nhóm thiết bị một dòng (vd Máy cắt | MC 572 | 6 năm), rồi sửa, thêm, xóa tùy ý; để trống thì không in bảng.'],
      ['Chi tiết thực hiện: phụ lục đính kèm', 'Bước 2, mục E.3, dưới bảng thiết bị cần thí nghiệm: "Import phụ lục (.doc, .docx)" chọn file Word phụ lục. Phương án in thêm dòng "Chi tiết thực hiện: theo Phụ lục V đính kèm." (sửa được tên phụ lục; nhiều file: V, VI…) và ghép từng file vào cuối phương án, mỗi file từ trang mới, giữ khổ ngang/dọc. File .doc cũ: nếu máy chủ báo chưa đọc được thì mở bằng Word → Lưu thành .docx rồi import lại.'],
      ['Cô lập mạch dòng (Phụ lục II)', 'Chọn TI từ thư viện mạch dòng, hoặc nạp trang bản vẽ mạch dòng PDF: phần mềm tự đọc kẹp, đầu dây — ô tự điền tô vàng, phải kiểm tra rồi bấm xác nhận. Đầu phía TI chọn kS1-kS2 … kS1-kS5 hoặc "Khác…".'],
      ['Số và ký', 'Số phương án cấp khi lưu lần đầu, không đổi khi sửa. Các nhãn ((…)) trong mẫu là vị trí ký số, giữ nguyên.'],
      ['Xuất văn bản', 'Xem trước, Tải Word / PDF, "Đăng QLTN" sau khi tải.']
    ]
  },
  {
    id: 'registrations', title: 'Giấy đăng ký công tác',
    items: [
      ['Lập giấy', 'Từ dòng lịch cắt điện, công việc không có lịch, biên bản khảo sát, phương án (nút "Lập giấy ĐKCT" ở tab Phương án) hoặc "Lập giấy mới".'],
      ['Nơi nhận', 'Chọn từ danh mục (email tự điền); lập từ biên bản hoặc phương án thì tự chọn đơn vị QLVH của trạm.'],
      ['Đơn vị công tác', 'Có thể nhiều ĐVCT; mỗi ĐVCT bắt buộc có chỉ huy trực tiếp, có thời gian và địa điểm riêng; số nhân viên tự đếm. LĐCV, GSATĐ, người cảnh giới chọn từ danh mục hoặc tự ghi, bậc ATĐ tự hiện.'],
      ['Số giấy', 'Số theo tổ, theo năm (vd 215/ĐK-TNLĐ); trưởng/phó tổ đặt được số khởi đầu.'],
      ['Tiếp theo', 'Tải Word; từ giấy lập giấy xác nhận đủ điều kiện đóng điện (giấy lập từ phương án thì giấy xác nhận lấy luôn hạng mục của phương án đó).']
    ]
  },
  {
    id: 'confirmations', title: 'Giấy xác nhận',
    items: [
      ['Lập giấy', 'Từ giấy ĐKCT hoặc phương án (hạng mục lấy theo nhóm thiết bị), hoặc tự ghi.'],
      ['Nội dung', 'Mỗi hạng mục một dòng, kết quả "đạt"; ghi chú (nếu có) in thêm dòng "Ghi chú:".'],
      ['Số và xuất', 'Số GXN riêng theo tổ, theo năm; Xem trước, Tải Word / PDF.']
    ]
  },
  {
    id: 'catalogs', title: 'Danh mục',
    items: [
      ['Danh mục chung', 'Nhân sự ATĐ, Đơn vị QLVH (nơi nhận), Trạm biến áp (kèm bản vẽ sơ đồ trạm), Nhiệm vụ, Thư viện rủi ro — dùng để chọn khi lập hồ sơ.'],
      ['Mạch dòng TI (admin)', 'Thư viện cô lập mạch dòng theo trạm / TI, dùng cho Phụ lục II của phương án.'],
      ['Tìm nhanh', 'Danh mục dài có ô tìm (không cần gõ dấu); nút con mắt gạch chéo "Ẩn" bỏ dòng khỏi danh sách chọn, giấy đã lập giữ nguyên.']
    ]
  },
  {
    id: 'settings', title: 'Cài đặt (admin)',
    items: [
      ['Khu vực, trạm của tổ', 'Chọn khu vực TTĐ mỗi tổ phụ trách: dùng cho "Chỉ tổ của tôi" và để báo lịch thay đổi cho tổ trưởng. Bấm sửa một tổ để tích đúng các trạm tổ phụ trách (gom theo khu vực, tích cả khu vực một lần): đã tích trạm thì "Chỉ tổ của tôi" chỉ hiện lịch các trạm đó.'],
      ['Tải lịch tự động', 'Tên đăng nhập, mật khẩu trang lịch cắt điện của Công ty (mật khẩu lưu mã hóa, không hiện lại), giờ tự tải hằng ngày (vd 07:00, 15:00; để trống = tắt) và số ngày tới. "Thử kết nối" kiểm tra đăng nhập. Lưu là có hiệu lực ngay; ô để trống dùng giá trị trong .env của máy chủ.'],
      ['Thông báo Zalo', 'Bot Zalo gửi tin khi lịch cắt điện phát sinh, hoãn, dời, sửa sau lần tự tải theo giờ hẹn (tùy chọn cả khi bấm tải / chọn file). Tạo bot bằng Zalo Bot Creator, dán token (lưu mã hóa); người nhận nhắn một tin cho bot → "Tìm người vừa nhắn bot" → Thêm, chọn tổ (chỉ nhận thay đổi của tổ đó) → Lưu → Gửi thử. Dòng cuối cho biết lần báo gần nhất và lỗi (nếu có).'],
      ['Mẫu văn bản', 'Tải mẫu Word về sửa (giữ thẻ {…} và nhãn ((…))), tải lên: phần mềm kiểm tra, thử điền, cho xem thử; "Lưu & dùng ngay" hoặc quay về mẫu gốc bất cứ lúc nào.']
    ]
  },
  {
    id: 'legacy', title: 'Giấy cũ',
    items: [
      ['Giấy cũ', 'Danh sách giấy ĐKCT lập bằng chức năng cũ của ChatLan: chỉ xem và tải Word. Giấy mới lập ở tab Giấy ĐKCT; số giấy tiếp nối số cũ.']
    ]
  }
];

/** Mục hướng dẫn cho tab đang mở (không có thì "Bắt đầu"). */
export const helpFor = (tab) => HELP_SECTIONS.find(s => s.id === tab) || HELP_SECTIONS[0];

// danh sách của từng tab (hint nút Tải lại); tab Lịch có hai danh sách: lịch cắt điện / công việc
const LIST_NAMES = {
  outages: 'lịch cắt điện', works: 'công việc không có lịch cắt điện', surveys: 'biên bản khảo sát', plans: 'phương án',
  registrations: 'giấy đăng ký công tác', confirmations: 'giấy xác nhận', catalogs: 'danh mục', settings: 'cài đặt', legacy: 'giấy cũ'
};
const clock = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Hint của nút Tải lại: tải lại những gì, lần cập nhật gần nhất. */
export function reloadHint(tab, firstView = 'outages', refreshedAt = null) {
  const name = LIST_NAMES[tab === 'outages' && firstView === 'works' ? 'works' : tab];
  const what = `Tải lại dữ liệu mới nhất từ máy chủ: ${name ? `danh sách ${name}` : 'danh sách đang mở'}, danh mục, quyền và luồng hồ sơ đang theo dõi.`;
  const when = refreshedAt ? ` Cập nhật lần cuối lúc ${clock(refreshedAt)}.` : '';
  return `${what}${when} Dùng khi người khác vừa lập/sửa hồ sơ hoặc danh mục.`;
}
export const refreshedLabel = (d) => (d ? `Cập nhật ${clock(d)}` : '');
