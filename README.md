# dkct-module — Chuẩn bị công tác cho ChatLan

Module gồm phần server (Express router) và giao diện (React/Tailwind), gắn vào ChatLan. Giao diện là một luồng công việc 5 bước:
**Lịch cắt điện (hoặc Công việc không có lịch cắt điện) → Khảo sát → Phương án → Giấy ĐKCT → Giấy xác nhận**. Bấm biểu tượng luồng ở một hồ sơ (hoặc mở hồ sơ) để theo dõi:
thanh luồng cho biết bước nào đã có hồ sơ, bước nào là bước tiếp theo, và tô các hồ sơ cùng luồng trong từng danh sách.
Tên kỹ thuật vẫn là `dkct` (bảng `dkct_*`, đường dẫn `/api/dkct`). Chức năng:

- Import **lịch cắt điện** (Excel, mẫu 8 hoặc 10 cột) thành kế hoạch công tác. Có bước xem trước và chống nhập trùng.
  Nút "Tải lịch cắt điện": máy chủ có tài khoản trang lịch Công ty thì tự đăng nhập, kết xuất Excel theo khoảng ngày chọn
  (trang `https://home.ptc3.npt.evn.vn/tsvh/lcd.aspx`) và nạp luôn; chưa có tài khoản thì chỉ mở trang lịch
  (https://home.ptc3.npt.evn.vn/lichcatdien_new2/) để tải tay. Tài khoản do admin đặt ở Cài đặt → Tải lịch tự động, hoặc
  trong `.env` của máy chủ (không commit): `OUTAGE_SOURCE_USER`, `OUTAGE_SOURCE_PASSWORD` (tuỳ chọn `OUTAGE_SOURCE_URL`, chỉ đặt trong .env). Chỉ chạy khi máy chủ vào được mạng nội bộ.
  Nạp lại lịch: so với lịch đã nạp trong khoảng ngày chọn (mặc định theo khoảng của file) — **hoãn** (dòng không còn trong
  file mới, hoặc tình trạng "Hoãn") tô đỏ, **dời lịch** (cùng trạm, cùng việc, khác giờ) xanh, **sửa nội dung** (cùng giờ,
  khác chữ) tím, **phát sinh** (dòng mới) vàng, **có lại** (dòng đang hoãn xuất hiện lại) bỏ dấu hoãn; dời/sửa cập nhật
  dòng cũ tại chỗ nên hồ sơ đã gắn vẫn trỏ đúng. Xem trước có số dự kiến, sau khi cập nhật liệt kê chi tiết, bấm để tới dòng.
  Khoảng chưa nạp lịch nào thì không so sánh. Dấu phát sinh/dời/sửa giữ 7 ngày; dấu hoãn giữ đến khi có lại.
  Biên bản KSHT, phương án, giấy ĐKCT gắn dòng lịch đã hoãn/dời/sửa có nhãn cảnh báo ở danh sách, dải cảnh báo khi mở
  và trên thanh luồng. Mỗi dòng lịch có **lịch sử thay đổi** (chỉ ghi khi trạng thái đổi thật, nạp lặp không ghi trùng).
  **Tự tải theo giờ hẹn**: admin đặt ở **Cài đặt → Tải lịch tự động** (tài khoản, mật khẩu, giờ tải, số ngày; có hiệu lực
  ngay, không cần khởi động lại). Mật khẩu lưu mã hóa AES-256-GCM với khóa `DKCT_SECRET_KEY` trong .env (không có thì dùng
  `JWT_SECRET`; không có khóa nào thì chỉ đặt mật khẩu được trong .env). Ô để trống dùng .env:
  `OUTAGE_AUTO_FETCH=07:00,15:00` (giờ VN, bỏ trống = tắt), `OUTAGE_AUTO_DAYS=14`; mỗi giờ hẹn
  chỉ tải một lần (kể cả nhiều tiến trình), nhật ký lần tải hiện ở đầu tab. Có thay đổi thì báo (ChatLan: tin nhắn riêng từ
  "Chuẩn bị công tác") cho người lập và tổ trưởng/tổ phó của tổ có hồ sơ gắn dòng lịch, và tổ trưởng/tổ phó của tổ phụ trách
  khu vực. **Chỉ tổ của tôi**: dòng thuộc khu vực TTĐ tổ phụ trách (admin chọn ở Cài đặt → Khu vực, trạm của tổ; khớp theo ô
  đơn vị "TTĐ …" hoặc TBA trong danh mục) hoặc tổ đã lập hồ sơ. Admin còn tích đúng các trạm tổ
  phụ trách (Khu vực của tổ → sửa tổ, bảng `dkct_team_stations`; trạm nhận từ địa điểm ghi tự do "Trạm 220kV Phan Thiết,
  ĐZ …", kể cả trạm chưa có trong danh mục): tổ đã tích trạm thì lọc và báo thay đổi chỉ gồm các trạm đó; dòng lịch không
  ghi rõ trạm vẫn theo khu vực.
  **Thông báo đẩy** (nút chuông ở đầu trang, `services/webPush.js`, `routes/push.js`): mỗi người tự bật trên từng máy tính /
  điện thoại (Web Push, thư viện `web-push`), chọn nhận thay đổi của tổ mình hoặc tất cả; gửi cùng lúc với Zalo sau mỗi lần nạp
  lịch có thay đổi (cả tự tải, bấm tải, chọn file), mỗi thay đổi một lần do tiến trình nạp lịch gửi. Khóa VAPID sinh một lần,
  lưu trong `dkct_settings` (`push.vapid`) nên bản độc lập và ChatLan-cloud dùng chung; thiết bị ở bảng
  `dkct_push_subscriptions` (404/410 từ dịch vụ đẩy thì xóa). Service worker `server/static/dkct-sw.js`: ứng dụng chủ phục vụ
  **công khai** (trước bước đăng nhập) tại `/dkct-sw.js` — `app.get('/dkct-sw.js', dkct.serviceWorker)`; trang đăng ký với
  scope `/dkct-push/` để không đụng service worker khác. iPhone/iPad (iOS 16.4+) chỉ nhận khi đã "Thêm vào MH chính" và mở
  từ biểu tượng (bản độc lập có `manifest.webmanifest`). Tùy chọn `DKCT_PUSH_SUBJECT` (mặc định https://dkct.onrender.com).
  Bấm thông báo: tin mang các dòng lịch (`outages`: `id~YYYY-MM-DD,…`, tối đa 15); trang đang mở thì service worker gửi
  `{ type: 'dkct:open-outages', outages }` (không tải lại trang), chưa mở thì mở trang kèm `?dkct-outages=…`. Giao diện
  (`client/lib/push.js`: `receiveOpenRequests`, `takeOpenRequest`) giữ yêu cầu ở `sessionStorage['dkct.openOutages']`, phát
  sự kiện `dkct:open-outages`; DkctApp mở tab Lịch cắt điện, tới dòng đầu, mở lịch sử thay đổi. Ứng dụng chủ chưa mở module
  (ChatLan) làm như trên rồi chuyển sang tab module.

  **Thông báo Zalo** (Cài đặt → Thông báo Zalo, `services/zaloBot.js`): bot của Zalo Bot Platform
  (https://bot.zapps.me/docs, gửi bằng `bot-api.zaloplatforms.com/bot<token>/sendMessage`) báo các dòng phát sinh / hoãn /
  dời / sửa / có lại sau mỗi lần **tự tải theo giờ hẹn** (tùy chọn cả khi bấm tải, chọn file). Token bot lưu mã hóa như mật
  khẩu trang lịch (mặc định `ZALO_BOT_TOKEN` trong .env), không trả về trình duyệt. Người nhận: chat ID của người / nhóm đã
  nhắn bot (nút "Tìm người vừa nhắn bot" đọc `getUpdates`; bot đang dùng webhook thì nhập tay); mỗi người nhận chọn một tổ để
  chỉ nhận thay đổi của tổ đó (cùng cách xác định tổ như "Chỉ tổ của tôi") hoặc để trống nhận mọi thay đổi. Tin ≤ 2000 ký tự,
  dài thì chia (tối đa 4 tin mỗi người mỗi lần); Zalo lỗi không làm hỏng việc nạp lịch, lỗi ghi ở cuối trang cài đặt.
- **Công việc không có lịch cắt điện** (bước 1, cạnh Lịch cắt điện): việc không đăng ký cắt điện (làm việc không cắt điện,
  kiểm tra, xử lý tồn tại…) làm gốc của luồng thay cho dòng lịch.
  - Ghi nội dung, trạm (chọn danh mục TBA hoặc tự ghi), địa điểm/thiết bị, thời gian (tùy chọn), điều kiện (mặc định
    "Không cắt điện."), ghi chú. Thuộc tổ lập (lịch cắt điện thì dùng chung); quyền như giấy ĐKCT.
  - Trên dòng công việc: **Lập biên bản KSHT / Lập phương án / Tạo giấy ĐKCT**, tự điền trạm + đơn vị QLVH, nội dung,
    địa điểm, thời gian, điều kiện; hồ sơ gắn `workId` và nối vào thanh luồng. Công việc đã có hồ sơ thì không xóa được.
  - Nối luồng khi không có lịch: giấy ĐKCT lập từ biên bản KSHT lưu `surveyId`, lập từ phương án (nút "Lập giấy ĐKCT" ở tab
    Phương án) lưu `planId`; giấy xác nhận lập từ giấy ĐKCT có `planId` thì lấy luôn hạng mục của phương án đó.
- Lập **giấy đăng ký công tác** từ một dòng lịch, công việc, biên bản KSHT, phương án hoặc tự ghi:
  - Nơi nhận chọn từ danh mục, email tự điền.
  - LĐCV, GSATĐ, người cảnh giới: chọn từ danh mục hoặc tự ghi, có thể để trống. Bậc ATĐ tự hiển thị.
  - Nhiều ĐVCT. Mỗi ĐVCT bắt buộc có CHTT, có thời gian và địa điểm riêng. Số nhân viên tự đếm, không tính CHTT.
  - Phụ lục 11.a (người được cử, số thẻ tự theo, nhiệm vụ lấy từ danh mục).
  - Phụ lục 11.b (cấp phiếu: CHTT theo ĐVCT, nhân viên chỉ được chọn trong danh sách đã đăng ký).
  - Mục 13 (tick chọn từ thư viện rủi ro).
- **Số giấy** `<n>/ĐK-<tên viết tắt tổ>` theo tổ và năm, đặt được số khởi đầu, tiếp nối số đã cấp ở module ĐKCT cũ.
- **Xuất Word** theo mẫu `templates/template_dkct.docx` (docxtemplater).
- Lập **Biên bản khảo sát hiện trường** (BBKSHT), tự ghi hoặc từ một dòng lịch cắt điện:
  - Người lập, thời điểm hiện tại, tổ tự điền; trạm chọn từ danh mục, chức vụ đại diện QLVH gợi ý theo trạm.
  - Mục 8 đánh giá rủi ro: mục tự ghi (chuẩn bị biện pháp kỹ thuật) đứng đầu, tick thêm từ thư viện rủi ro.
  - Sơ đồ một sợi in ở trang cuối khổ ngang: tự lấy **bản vẽ PDF của trạm** (danh mục Trạm biến áp), hoặc chọn/dán ảnh
    (PNG/JPG ≤ 10 MB). Khoanh "Khu vực công tác" bằng chuột: khi xuất Word thành khung đỏ + nhãn nổi trên ảnh (sửa tiếp được trong Word).
  - **Hình ảnh khảo sát hiện trường (nếu có)**: chọn nhiều ảnh / kéo thả / dán, chú thích, thứ tự; ảnh thu nhỏ ở trình duyệt
    (cạnh dài ≤ 1600 điểm ảnh, JPEG), tối đa 30 ảnh (bảng `dkct_survey_photos`). In ở trang "HÌNH ẢNH KHẢO SÁT HIỆN TRƯỜNG"
    sau sơ đồ, 2 ảnh mỗi hàng (4 ảnh mỗi trang ngang), chú thích "Ảnh n: …"; mẫu Word có thẻ `{@photosXml}` thì in tại đó.
- Lập **Phương án thi công, biện pháp an toàn** (thí nghiệm), tự ghi hoặc từ lịch cắt điện / biên bản khảo sát:
  - Phụ lục I.1 **trạng thái cô lập** khi tiếp nhận / giao trả hiện trường: mỗi thiết bị chọn Mở / Đóng (mặc định máy cắt, DCL
    "Mở"; dao tiếp địa — số hiệu 2 chữ số sau gạch như 565-65, 532-38, hoặc ghi "DTĐ" — "Đóng"); Word đánh dấu "√" vào bảng của mẫu.
  - Mục 3, phần "Thực hiện:": **bảng thiết bị cần thí nghiệm** (STT, tên thiết bị, ký hiệu / vị trí, hạng mục / ghi chú),
    người lập nhập (tên thiết bị chọn từ danh sách loại thiết bị QĐ 1901 hoặc tự ghi; ô Chu kỳ chỉ liệt kê chu kỳ có hạng mục
    của thiết bị đó) hoặc "Điền từ Phụ lục I" (vd Máy cắt | MC 572 | 6 năm) rồi sửa; chèn sau đoạn "Kiểm tra thí nghiệm các hạng
    mục…" kèm đoạn dẫn "Thiết bị cần thí nghiệm:" cùng kiểu đầu dòng (mẫu có thẻ `{@testEquipmentXml}` thì in tại đó).
  - **Chi tiết thực hiện — phụ lục đính kèm**: nút "Import phụ lục (.doc, .docx)" (tối đa 10 file, 15 MB/file, bảng
    `dkct_plan_attachments`); sau bảng thiết bị in "Chi tiết thực hiện: theo Phụ lục V đính kèm." (tên phụ lục sửa được,
    mặc định V, VI…). Khi xuất / xem trước, từng file ghép vào cuối phương án từ trang mới (`server/services/docxAppend.js`):
    giữ khổ / hướng giấy, chép ảnh, kiểu, đánh số; phụ lục không có đầu / chân trang riêng dùng chân trang của phương án,
    số trang đánh tiếp; bỏ chú thích cuối trang, bình luận. File `.doc` (Word 97-2003) đổi sang `.docx` bằng LibreOffice
    nếu máy chủ có (`DKCT_SOFFICE` hoặc `soffice` trong PATH); không có thì báo người dùng lưu thành .docx. File tải lên
    gắn vào phương án khi lưu; bỏ khỏi phương án / xóa phương án thì xóa file; file không lưu vào phương án nào xóa sau 2 ngày.
  - Số `<n>/PA-<tổ>.<hậu tố>` (vd `12/PA-TNLĐ.Nhatthu`) đếm riêng theo tổ, năm; đặt được số khởi đầu.
  - Bảng 1 "Hạng mục thí nghiệm" tự lập khi chọn loại thiết bị + chu kỳ, theo bảng khối lượng của **QĐ 1901/QĐ-EVNNPT**
    (`server/seeds/tests1901.json`, trích từ PDF gốc bằng `scripts/extract_1901.py`, giữ đúng cột chu kỳ);
    định kỳ 3 năm gồm hạng mục 1 năm, 6 năm gồm 3 năm (Điều 3). Bỏ tick / thêm hạng mục riêng được.
  - Nhận diện rủi ro lấy từ BBKSHT; Phụ lục II cô lập mạch dòng (chọn biến dòng trong thư viện mạch dòng, mặc định in 4 core,
    bấm core để xem lại mạch trên bản vẽ; hoặc bảng theo quy ước XAk); Phụ lục III lực lượng thi công;
    Phụ lục IV chèn các sơ đồ trạm được chọn, mỗi sơ đồ một trang (TBA 500kV: phía 500kV, phía 220kV hoặc cả hai;
    chưa chọn thì gợi ý theo ngăn lộ 5xx/2xx, MBA AT chọn cả hai). Xuất Word theo `templates/template_pa.docx`.
- Lập **Giấy xác nhận đủ điều kiện đóng điện**, tự ghi hoặc từ một giấy ĐKCT (nút "Giấy xác nhận" ở tab Giấy ĐKCT):
  - Số `<n>/GXN-<tổ>` (vd `5/GXN-TNKH`) đếm riêng theo tổ, năm; đặt được số khởi đầu.
  - Từ giấy ĐKCT: trạm (theo lịch cắt điện / địa điểm, khớp danh mục TBA), ngăn lộ và thiết bị (mã MC 212, MBA AT1…
    trong nội dung), mục kết quả = nội dung công tác (TNĐK → Thí nghiệm định kỳ), ngày = ngày kết thúc công tác, tổ, người ký.
  - Lấy hạng mục từ phương án: mỗi nhóm thiết bị của Bảng 1 thành một mục "đạt". Xuất Word theo `templates/template_gxn.docx`.
- **Bản vẽ trạm biến áp** (PDF ≤ 20 MB): tải lên ở Danh mục → Trạm biến áp, chọn trang có sơ đồ. Mỗi trạm có thể có nhiều
  sơ đồ đặt tên riêng (tối đa 10; vd "Phía 500kV", "Phía 220kV"), cấp điện áp cao xếp trước. Trình duyệt dựng trang đó
  thành ảnh (pdf.js, ~200 dpi); CSDL lưu cả PDF gốc và ảnh. ChatLan cần gói `pdfjs-dist` (peer dependency).
  - Xuất Word theo mẫu `templates/template_bbksht.docx`; lập giấy ĐKCT từ biên bản (căn cứ, nội dung, địa điểm, rủi ro).
- **Thư viện cô lập mạch dòng** (Danh mục → Mạch dòng TI; tạm thời chỉ admin sửa): mỗi biến dòng (TI) của trạm có các core,
  mỗi core 6 dòng theo `templates/template_co_lap_mach_dong.docx`: L1 kẹp 1, 4; L2 kẹp 2, 5; L3 kẹp 3, 6 tại tủ trung gian,
  kèm đầu phía CT đúng nhãn trên bản vẽ (điểm N không in).
  - Tải trang mạch dòng (PDF: chọn trang, chỉ lưu ảnh trang; hoặc ảnh chụp). Khung tên đọc từ lớp chữ PDF (tủ, số trang,
    số bản vẽ, ngăn). "Điền theo mẫu" chỉ điền ô trống để kiểm tra lại.
  - **Tự đọc trang PDF vector** (không AI, không OCR, chạy trong trình duyệt): nhãn trong mạch là nét vẽ font CAD, được nhận
    dạng bằng so hình học với bộ mẫu `client/lib/ctFont.js` (`ctGlyphs.js`); dây (kể cả nét gấp khúc) được dò để biết đầu
    cuộn nào nối vào hàng kẹp nào (`ctReader.js`). Kết quả điền vào ô còn trống, tô vàng để đối chiếu; sửa tay thì hết tô.
    Ảnh chụp/trang quét chưa tự đọc. Mẫu bản vẽ khác font có thể chưa đọc được: thêm mẫu ký tự vào `ctFont.js`.
    Test với bản vẽ thật (`tests/ctReaderSamples.test.js`) chỉ chạy khi có thư mục mẫu (`DKCT_CT_SAMPLES`), bản vẽ không đưa vào repo.
  - Khoanh vùng từng core trên trang để xem lại khi lập phương án. Ô trống in "CHƯA ĐỦ DỮ LIỆU", không tự suy diễn.
  - Xác nhận khi đủ dữ liệu; sửa sau xác nhận thì về "cần kiểm tra". TI chưa xác nhận vẫn in được, ghi "BẢN NHÁP – chưa xác nhận".
  - Bản vẽ cập nhật: thêm trang với "phiên bản mới", trang cũ giữ lại. Phương án lưu bản chụp TI lúc chọn (thư viện sửa sau
    không đổi phương án đã lập); nút "Đối chiếu thư viện" liệt kê khác biệt và cập nhật khi đồng ý. Mọi thay đổi ghi nhật ký.
  - Ảnh trang tối đa 10 MB lưu trong CSDL: MySQL cần `max_allowed_packet` ≥ 16 MB (mặc định MySQL 8 là 64 MB).

## Tên đơn vị, đổi tên tổ

- **Tên công ty, tên đội** in ở đầu văn bản lập mới: admin đặt ở Cài đặt → Tên đơn vị (`services/orgNames.js`,
  `GET/PUT /org-names`, lưu `dkct_settings` `org.names`). Thứ tự: tên admin đặt → văn bản gần nhất của tổ → mặc định
  (`Công ty Truyền tải điện 3`, `Đội Sửa chữa, thí nghiệm điện 3` hoặc `deps.defaultUnitName`). Văn bản đã lập giữ tên lúc lập.
- **Đổi tên tổ** (bản độc lập: Quản trị → Tổ → Sửa, `PUT /api/app/departments/:name { name }`):
  `services/departmentRename.js` đổi tên tổ ở mọi chỗ dùng làm khóa — người dùng, nhân sự, công việc, biên bản, phương án,
  giấy ĐKCT, giấy xác nhận (`department`, `docDepartment`), phụ lục đính kèm, khu vực / trạm của tổ, thiết bị nhận thông báo
  đẩy, bộ đếm số văn bản (`<tiền tố><tên tổ>`: số đánh tiếp), người nhận Zalo — rồi danh sách tổ. Dữ liệu văn bản (tên tổ đã
  in) giữ nguyên. Không gộp vào tên đang là tổ khác hoặc còn dữ liệu cũ (409). Không có giao dịch CSDL: dấu
  `department.rename` trong `dkct_settings`; lỗi giữa chừng thì đổi lại cùng tên cũ → tên mới để làm nốt.

## Kế hoạch thí nghiệm năm (Google Sheet)

- Cài đặt → Kế hoạch thí nghiệm (`services/testPlan.js`, `routes/testPlan.js`, bảng `dkct_test_plan_items`): **mỗi năm một
  kế hoạch** (`dkct_settings` `testplan.plans`; thêm năm mới chép cột của năm gần nhất; đổi năm chuyển dòng đã đồng bộ;
  xóa năm xóa dòng của năm đó; phương án lấy kế hoạch theo năm phương án, không có thì năm gần nhất): link Google
  Sheet, trang tính, năm, cột (mặc định theo "Cập nhật 2027": C trạm, D ngăn lộ, F mã TB, G thiết bị, X = 1 có TNĐK;
  chu kỳ H sau 1 năm lắp đặt (1VH), L 3 năm, O 6 năm, P tăng cường; Q kiểm định AT; S ghi chú, T ngày TN). Lấy dòng có TNĐK và có đánh dấu chu kỳ
  hoặc kiểm định AT (ô ghi số — dòng tổng — không tính).
- Đồng bộ: link (máy chủ tải `…/export?format=xlsx`; sheet phải chia sẻ "Bất kỳ ai có đường liên kết" — Người xem) hoặc
  tải file .xlsx lên; thay toàn bộ dòng của năm, ghi theo lô. Tên trạm so không dấu ("Đắk" = "Đăk", "220KV" = "220kV").
  Loại thiết bị QĐ 1901 theo mã TB + cấp điện áp của ngăn (MC ≤ 35kV chân không, TI ≤ 35kV xuyến, TU ≥ 110kV kiểu tụ…).
- Phương án → Phụ lục I: `TestPlanPicker` liệt kê thiết bị của trạm theo ngăn lộ (ngăn của phương án chọn sẵn, "572" khớp
  "XT572", "FL NXT 572"); "Thêm vào phương án" (`client/lib/testPlan.js` `fromTestPlan`): Bảng 1 một nhóm mỗi thiết bị
  có bảng QĐ 1901 (hạng mục theo chu kỳ dài nhất), bảng thiết bị cần thí nghiệm mọi thiết bị (chu kỳ, kiểm định AT, ghi
  chú); `testPlanItemIds` lưu các dòng kế hoạch phương án đã dùng (để theo dõi tiến độ).

## Cấu trúc

```
server/   index.js (factory), schema.js (bảng dkct_* cho MySQL + SQLite), policy.js,
          routes/ (catalogs, outages, works, registrations, surveys),
          services/ (outageExcel, registration, docxView, docxRender, numbering, survey, surveyView, surveyRender), seeds/
client/   index.jsx (<DkctModule services>), DkctApp.jsx, components/, lib/ (form.js, survey.js thuần; api.js)
templates/ template_dkct.source.docx (mẫu gốc) -> template_dkct.docx (có thẻ, sinh bằng scripts/tag_template.py)
          template_bbksht.source.docx -> template_bbksht.docx (sinh bằng scripts/tag_bbksht.py)
tests/    node:test — npm test
```

## Gắn vào ChatLan

Việc gắn đã được làm sẵn trên nhánh `feat/dkct-module` của ChatLan, gồm:
- `server/src/dkct.js`
- 1 dòng trong `server/src/index.js`
- `client/src/components/Dkct/DkctScreen.jsx`
- tab `dkct` trong `App.jsx`, `NavigationSidebar.jsx`, `MobileBottomNav.jsx`
- alias `@dkct` trong `vite.config.js`, glob trong `tailwind.config.js`

Module được đặt vào `ChatLan/modules/dkct` (thư mục này nằm trong `.gitignore`):

```bash
node scripts/dkct-module.js link "E:/…/Source/dkct-module"   # khi phát triển: liên kết, sửa module thấy ngay
node scripts/dkct-module.js copy "E:/…/Source/dkct-module"   # trước khi build Docker: tạo bản sao thật
```

Server nhận các tham số sau (ChatLan truyền trong `server/src/dkct.js`):

| Tham số | Ý nghĩa |
|---|---|
| `db` | `{ query, queryOne, execute, isMySQL }` của ChatLan |
| `getActor(userId)` / `getProfile(userId)` | `{id, role, department}` / `{fullName, position, phone, email}` |
| `isAdmin`, `isDepartmentHead`, `isUnitLead` | quyền: trưởng/phó tổ, trưởng phòng, admin được lập giấy và sửa danh mục |
| `getUnit(userId)` | `{department, shortName}` dùng cho số giấy |
| `legacyLastIssued(department, year)` | số lớn nhất module cũ đã cấp (tùy chọn) |
| `listDepartments()` | `[{name, shortName}]` cho dropdown "Tổ đăng ký" (tùy chọn; thiếu thì ô này nhập tay) |
| `defaultUnitName` | đơn vị cấp trên mặc định, mặc định "Đội Sửa chữa, thí nghiệm điện 3" (tùy chọn) |

## API (`/api/dkct`, cần đăng nhập)

| Nhóm | Endpoint |
|---|---|
| Danh mục | `GET/POST /personnel`, `PUT/DELETE /personnel/:id` (tương tự cho `/stations`, `/substations`, `/duties`, `/risks`); DELETE là ẩn |
| Công việc (không có lịch) | `GET /work-defaults`, `GET/POST /works` (`?search&year`), `GET/PUT/DELETE /works/:id` (DELETE: 409 khi đã có hồ sơ), `GET /works/:id/draft` (giấy ĐKCT), `GET /works/:id/survey-draft`, `GET /works/:id/plan-draft` |
| Lịch cắt điện | `POST /outages/import/preview`, `POST /outages/import/commit` (multipart `file`), `GET /outages?from&to&search`, `GET /outages/:id/draft`, `DELETE /outages/:id` |
| Giấy ĐKCT | `GET /meta`, `GET/PUT /numbering`, `GET/POST /registrations`, `GET/PUT/DELETE /registrations/:id`, `GET /registrations/:id/docx` |
| BBKSHT | `GET /survey-defaults`, `GET /outages/:id/survey-draft`, `GET/POST /surveys`, `GET/PUT/DELETE /surveys/:id`, `GET/PUT/DELETE /surveys/:id/diagram` (PUT multipart `file`), `GET/POST/PUT /surveys/:id/photos` (POST multipart `file` + `caption`; PUT `{ items: [{ id, caption }] }` = chú thích + thứ tự), `GET/DELETE /surveys/:id/photos/:photoId`, `GET /surveys/:id/docx` |
| Phương án | `GET /plan-defaults`, `GET /outages/:id/plan-draft`, `GET/PUT /plan-numbering`, `GET /tests1901`, `GET/POST /plans`, `GET/PUT/DELETE /plans/:id`, `GET /plans/:id/docx` |
| Giấy xác nhận | `GET /confirmation-defaults`, `GET /registrations/:id/confirmation-draft`, `GET/PUT /confirmation-numbering`, `GET/POST /confirmations`, `GET/PUT/DELETE /confirmations/:id`, `GET /confirmations/:id/docx` |
| Mạch dòng TI | `GET/POST /ct-library` (`?substationId=`), `GET/PUT/DELETE /ct-library/:id` (PUT gửi cả TI kèm `cores[].points[6]`), `POST /ct-library/:id/verify`, `GET /ct-library/:id/audit`, `POST /ct-library/:id/pages` (multipart `image` + `pageLabel`, `fileName`, `newRevision=1`), `GET /ct-pages/:id/image`, `DELETE /ct-pages/:id`; ghi: chỉ admin |
| Luồng công việc | `GET /workflow/:type/:id` (`type`: `outage`, `work`, `survey`, `plan`, `registration`, `confirmation`): các hồ sơ cùng luồng theo liên kết lịch/công việc/KSHT/phương án/giấy ĐKCT/giấy xác nhận (`outages`, `works`, `surveys`, …); chỉ trả hồ sơ người xem được phép xem |
| Bản vẽ trạm | `GET /substation-drawings`, `GET/POST /substations/:id/drawings` (POST multipart `label` + `pdf` + `image` + `page`, `pageCount`), `PUT/DELETE /drawings/:id` (PUT: `label`, kèm file thì thay file), `GET /drawings/:id/image`, `GET /drawings/:id/pdf` |

Quan hệ bảng: `dkct_substations.stationId` → `dkct_stations.id` (TBA thuộc đơn vị QLVH; không xóa được đơn vị còn TBA),
`dkct_surveys.substationId` → `dkct_substations.id` (xóa TBA thì biên bản giữ lại, bỏ liên kết),
`dkct_drawings.substationId` → `dkct_substations.id` (nhiều sơ đồ/trạm, UNIQUE(substationId, label); xóa TBA thì xóa bản vẽ;
biên bản giữ bản sao ảnh đã dùng; bảng cũ `dkct_substation_drawings` được chuyển sang khi migrate, tên "Sơ đồ trạm"),
`dkct_plans.substationId / surveyId / outageId` → TBA / biên bản / lịch cắt điện (xóa thì phương án bỏ liên kết);
`dkct_confirmations.substationId / registrationId / planId` → TBA / giấy ĐKCT / phương án (xóa thì giấy xác nhận bỏ liên kết);
`dkct_works.substationId` → TBA; `dkct_surveys / dkct_plans / dkct_registrations.workId` → công việc không có lịch,
`dkct_registrations.surveyId / planId` → biên bản / phương án đã dùng để lập giấy (xóa thì bỏ liên kết);
`dkct_ct_transformers.substationId` → TBA; `dkct_ct_pages / dkct_ct_cores.transformerId` → TI, `dkct_ct_points.coreId` → core
(xóa thì xóa theo; `transformerId` vì `ctid` trùng cột hệ thống của Postgres), `dkct_ct_cores.pageId` → trang (xóa trang thì bỏ liên kết);
sơ đồ in ở Phụ lục IV lưu trong `data.drawingIds` (null: phương án cũ, in mọi sơ đồ của trạm). Danh sách TBA – đơn vị QLVH –
người phụ trách ban đầu ở `server/seeds/substations.json`, nạp một lần khi migrate (dấu mốc trong `dkct_settings`).

Lỗi kiểm tra dữ liệu trả mã `422 { error, errors: [{ field, message }] }`. `field` có dạng `workUnits.0.commander`, `permits.1.workers`…

## Cập nhật mẫu Word

**Không cần sửa mã (khuyên dùng):** Cài đặt → **Mẫu văn bản**. Mỗi loại (biên bản KSHT, phương án, giấy ĐKCT, giấy
xác nhận) có mẫu gốc (file trong `templates/`, luôn còn) và các mẫu admin tải lên (bảng `dkct_doc_templates`).
Tải mẫu về sửa trong Word (giữ thẻ `{…}` và nhãn ký số `((…))`), tải lên: phần mềm kiểm tra cú pháp thẻ (báo lỗi tiếng
Việt), so thẻ với mẫu gốc (thẻ lạ / thẻ thiếu / thiếu nhãn ký số), thử điền bằng văn bản gần nhất, cho **Xem thử**; rồi
"Lưu & dùng ngay" hoặc "Dùng mẫu này". Sửa tên/ghi chú, thay file, xóa, quay về mẫu gốc bất cứ lúc nào. Mỗi loại tối đa
một mẫu đang dùng; xóa mẫu đang dùng thì quay về mẫu gốc. Mẫu đang dùng mà lỗi khi điền: xuất Word trả 409 kèm tên mẫu
và hướng dẫn quay về mẫu gốc. Mọi người xem/tải mẫu; chỉ admin thay đổi.

**Đổi mẫu gốc trong mã nguồn** (khi bố cục đổi nhiều, cần sinh lại thẻ):

1. Thay `templates/template_dkct.source.docx` bằng mẫu mới, giữ bố cục các mục 1–13 và 3 bảng phụ lục.
2. Chạy `python scripts/tag_template.py` (cần `python-docx`). Nếu bố cục đổi, script dừng và báo đoạn không khớp.
3. Chạy `npm test`, và `node scripts/render-sample.js` để xuất `tests/.tmp/sample.docx` rồi mở ra xem.

Mẫu BBKSHT làm tương tự: thay `templates/template_bbksht.source.docx`, chạy `python scripts/tag_bbksht.py`, xem thử bằng
`node scripts/render-survey-sample.js [ảnh_sơ_đồ.png]`. Các chú thích `<…>` của mẫu gốc được thay bằng thẻ; ảnh sơ đồ ví dụ
và hai hình "Khu vực công tác" được bỏ, thay bằng ảnh người dùng tải lên.

Mẫu Phương án: thay `templates/template_pa.source.docx`, chạy `python scripts/tag_pa.py`, xem thử bằng
`node scripts/render-plan-sample.js [ảnh_1.png,ảnh_2.png]` (nhiều ảnh = nhiều sơ đồ). Khi QĐ 1901 được sửa đổi: chạy lại
`python scripts/extract_1901.py "<PDF QĐ mới>"` (cần `pymupdf`), kiểm tra `server/seeds/tests1901.json` rồi `npm test`.

Mẫu Giấy xác nhận: thay `templates/template_gxn.source.docx`, chạy `python scripts/tag_gxn.py`, xem thử bằng
`node scripts/render-confirmation-sample.js`. Script bỏ các dòng trống dưới tên người ký (mẫu gốc tràn sang trang 2)
và nới ô chữ ký để dòng "địa danh, ngày … tháng … năm …" nằm trên một dòng.

## Chạy độc lập trên Supabase + Render (`standalone/`)

Không cần ChatLan: Postgres và đăng nhập (email + mật khẩu) của Supabase, server Express chạy trên Render (gói miễn phí).

- Người mới **tự đăng ký**, nhưng chưa thuộc tổ nào nên chưa xem được gì (máy chủ trả 403 cho mọi `/api/dkct`); admin vào **Quản trị** để tạo tổ (tên + viết tắt dùng trong số giấy), xếp người vào tổ và cấp **Trưởng/phó tổ** (được lập, sửa hồ sơ và danh mục).
- Email trong `ADMIN_EMAILS` tự là admin (khi email đã xác nhận). Chỉ ghi email **đã đăng ký** vào `ADMIN_EMAILS`: đang tắt
  "Confirm email" nên ai đăng ký trước một email còn trống trong danh sách sẽ thành admin.
- Mỗi người tự sửa hồ sơ (họ tên, chức danh, điện thoại) — dùng cho mục "người đại diện" trên giấy.

**1. Supabase** (supabase.com): New project, region Singapore.
- *Authentication → Sign In / Providers → Email*: **tắt "Confirm email"** (email xác nhận miễn phí của Supabase chỉ gửi được cho thành viên dự án). Quên mật khẩu: admin đặt lại ở *Authentication → Users*.
- Lấy: Project URL, khóa **anon public** (*Project Settings → API Keys*), chuỗi kết nối **Transaction pooler** (nút *Connect*, cổng 6543).

**2. Render** (render.com): *New → Blueprint* → repo DKLPA (đọc `render.yaml`), điền `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS`. Bảng `dkct_*` được tạo khi server khởi động.

**Bảo mật khi chạy thật (production):**
- **Bắt buộc**: khóa REST của Supabase cho các bảng `dkct_*`. Supabase mở mọi bảng trong schema `public` qua
  `https://<dự án>.supabase.co/rest/v1/...` cho khóa *anon* (khóa này công khai, trình duyệt nào cũng lấy được), nên
  không khóa thì người ngoài đọc / sửa thẳng CSDL, bỏ qua mọi kiểm tra quyền của máy chủ. Supabase → *SQL Editor* chạy:
  ```sql
  DO $$ DECLARE t text; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'dkct%' LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
  END $$;
  ```
  Máy chủ kết nối bằng chủ bảng (`postgres`) nên không bị ảnh hưởng. Chạy lại khi bản mới thêm bảng; kiểm tra ở
  *Advisors → Security Advisor* (không còn "RLS disabled in public").
- Máy chủ: giới hạn 600 request/phút mỗi IP (xem trước, xuất Word / PDF: 40/phút), token không đúng dạng bị từ chối
  ngay, HSTS, `assets/` lưu đệm 1 năm (tên file có mã băm), `index.html` luôn tải mới; tắt máy (SIGTERM khi deploy) thì
  chờ request đang chạy xong; kết nối CSDL treo quá 15 giây thì báo lỗi.

Gói miễn phí: Render ngủ sau 15 phút không dùng (lần mở đầu chờ ~1 phút); Supabase tạm dừng dự án sau 7 ngày không có truy cập (bấm *Restore* trên trang Supabase).

**Tự tải lịch cắt điện trên Render** (không cần ChatLan, không cần máy ở cơ quan bật):
1. Render → service → *Environment*: có `DKCT_SECRET_KEY` (blueprint tự tạo; service tạo trước đó thì thêm tay một chuỗi ngẫu
   nhiên dài) để admin lưu được mật khẩu trang lịch trên giao diện.
2. Mở ứng dụng bằng tài khoản admin → tab Lịch cắt điện → **Cài đặt tải lịch**: tên đăng nhập, mật khẩu, giờ tải
   (vd `09:00, 15:00`) → Lưu → **Thử kết nối** (máy chủ Render phải vào được trang lịch của Công ty).
3. Render ngủ thì bộ hẹn giờ không chạy: tạo lịch gọi đánh thức miễn phí ở https://cron-job.org — mỗi giờ tải một lịch
   gọi `https://dkct.onrender.com/healthz` đúng giờ đó (vd 09:00 và 15:00, múi giờ Asia/Ho_Chi_Minh). Máy chủ thức dậy
   (~1 phút) thấy lỡ giờ hẹn thì **tải bù** ngay (trong vòng 2 giờ sau giờ hẹn); mỗi giờ hẹn mỗi ngày chỉ tải một lần,
   kể cả khi bản chạy ở máy dùng chung CSDL Supabase.

Chuyển dữ liệu đang dùng trong ChatLan sang Supabase (chạy ở máy có MySQL của ChatLan, sau khi đã có `standalone/.env`):
`node standalone/scripts/copy-from-chatlan.js <đường dẫn server/.env của ChatLan>` — chép mọi bảng `dkct_*` trong một giao dịch và tạo sẵn các tổ; Supabase đã có hồ sơ thì dừng (thêm `--force` để ghi đè).

Chạy ở máy: chép `standalone/.env.example` thành `standalone/.env`, rồi `npm ci && cd standalone && npm ci && npm run build && npm start` (http://localhost:3000). Test: `npm test` trong `standalone/`; toàn bộ test module trên Postgres: `npm run test:pg`.

**Chạy ở máy thay Render** (Render tạm dừng / hết giờ miễn phí): nhấp đúp `Chay-local.cmd` ở thư mục gốc, hoặc `npm run local --prefix standalone`.
Dùng đúng CSDL Supabase, đăng nhập và tự tải lịch như trên Render (cùng `standalone/.env`); tự cài thư viện nếu thiếu, build lại giao diện
khi mã nguồn mới hơn bản build (`-- --build` để ép build), chạy với `NODE_ENV=production`, máy chủ dừng bất thường thì tự chạy lại.
Cổng: `PORT` trong `.env` (mặc định 3000). Đóng cửa sổ là dừng; đừng chạy cùng lúc với bản Render (hai nơi cùng tự tải lịch).

- Điện thoại / máy khác trong mạng LAN: `http://<IP máy>:3000` (in ra khi chạy) — dùng được, nhưng không có thông báo đẩy, không cài lên màn hình chính (trình duyệt chỉ cho phép trên HTTPS).
- HTTPS qua Tailscale: một lần `tailscale serve --bg 3000` → `https://<tên máy>.<tailnet>.ts.net` (chỉ máy trong tailnet vào được);
  người ngoài tailnet: `tailscale funnel --bg 3000` (công khai ra Internet). Supabase → *Authentication → URL Configuration*: đặt *Site URL* là địa chỉ này để thư xác nhận đăng ký mở đúng chỗ.

## Gắn vào ChatLan-cloud, dùng chung dữ liệu với bản độc lập (`server/shared.js`)

ChatLan-cloud gắn module (submodule `modules/dkct`) nhưng không dùng CSDL TiDB của mình: `createSharedDkct({ pool, emailOf,
notifyByEmail })` nối tới **CSDL Postgres của bản độc lập** (`DKCT_DATABASE_URL`) và dùng chung tài khoản, tổ, vai trò
(`server/accounts.js`, bảng `dkct_app_users`, `dkct_app_departments`; admin quản lý ở trang Quản trị của bản độc lập).
- Người dùng ứng dụng chủ được nhận ra **theo email**; chưa có tài khoản / chưa xếp tổ thì `GET /link-status` cho biết và
  mọi API trả 403 kèm `code` (`DKCT_NOT_LINKED`, `DKCT_NO_TEAM`).
- Báo lịch thay đổi qua ứng dụng chủ: đọc `dkct_outage_changes` mỗi phút (mốc trong `dkct_settings` `notify.host.cursor`),
  nên báo cả thay đổi do bản độc lập tải; người nhận như bản ChatLan, gửi theo email; không báo lại thay đổi quá 2 ngày.
- `DKCT_SECRET_KEY` phải giống bản độc lập (mật khẩu trang lịch, token Zalo đã lưu); `secretKey: ''` không dùng JWT_SECRET
  của ứng dụng chủ. Hai bên nên chạy cùng commit module. Hướng dẫn bên ChatLan-cloud: `docs/DKCT.md` của repo đó.

## Phát triển

```bash
npm install
npm test          # 120 test, có đo độ phủ
```
