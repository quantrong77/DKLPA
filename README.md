# dkct-module — Đăng ký công tác cho ChatLan

Module gồm phần server (Express router) và giao diện (React/Tailwind), gắn vào ChatLan. Chức năng:

- Import **lịch cắt điện** (Excel, mẫu 8 hoặc 10 cột) thành kế hoạch công tác. Có bước xem trước và chống nhập trùng.
- Lập **giấy đăng ký công tác** từ một dòng lịch hoặc tự ghi:
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
- Lập **Phương án thi công, biện pháp an toàn** (thí nghiệm), tự ghi hoặc từ lịch cắt điện / biên bản khảo sát:
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
    số bản vẽ, ngăn). Nhãn hàng kẹp/đầu CT trong mạch thường là nét vẽ nên nhập tay; "Điền theo mẫu" chỉ điền ô trống để kiểm tra lại.
  - Khoanh vùng từng core trên trang để xem lại khi lập phương án. Ô trống in "CHƯA ĐỦ DỮ LIỆU", không tự suy diễn.
  - Xác nhận khi đủ dữ liệu; sửa sau xác nhận thì về "cần kiểm tra". TI chưa xác nhận vẫn in được, ghi "BẢN NHÁP – chưa xác nhận".
  - Bản vẽ cập nhật: thêm trang với "phiên bản mới", trang cũ giữ lại. Phương án lưu bản chụp TI lúc chọn (thư viện sửa sau
    không đổi phương án đã lập); nút "Đối chiếu thư viện" liệt kê khác biệt và cập nhật khi đồng ý. Mọi thay đổi ghi nhật ký.
  - Ảnh trang tối đa 10 MB lưu trong CSDL: MySQL cần `max_allowed_packet` ≥ 16 MB (mặc định MySQL 8 là 64 MB).

## Cấu trúc

```
server/   index.js (factory), schema.js (bảng dkct_* cho MySQL + SQLite), policy.js,
          routes/ (catalogs, outages, registrations, surveys),
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
| Lịch cắt điện | `POST /outages/import/preview`, `POST /outages/import/commit` (multipart `file`), `GET /outages?from&to&search`, `GET /outages/:id/draft`, `DELETE /outages/:id` |
| Giấy ĐKCT | `GET /meta`, `GET/PUT /numbering`, `GET/POST /registrations`, `GET/PUT/DELETE /registrations/:id`, `GET /registrations/:id/docx` |
| BBKSHT | `GET /survey-defaults`, `GET /outages/:id/survey-draft`, `GET/POST /surveys`, `GET/PUT/DELETE /surveys/:id`, `GET/PUT/DELETE /surveys/:id/diagram` (PUT multipart `file`), `GET /surveys/:id/docx` |
| Phương án | `GET /plan-defaults`, `GET /outages/:id/plan-draft`, `GET/PUT /plan-numbering`, `GET /tests1901`, `GET/POST /plans`, `GET/PUT/DELETE /plans/:id`, `GET /plans/:id/docx` |
| Giấy xác nhận | `GET /confirmation-defaults`, `GET /registrations/:id/confirmation-draft`, `GET/PUT /confirmation-numbering`, `GET/POST /confirmations`, `GET/PUT/DELETE /confirmations/:id`, `GET /confirmations/:id/docx` |
| Mạch dòng TI | `GET/POST /ct-library` (`?substationId=`), `GET/PUT/DELETE /ct-library/:id` (PUT gửi cả TI kèm `cores[].points[6]`), `POST /ct-library/:id/verify`, `GET /ct-library/:id/audit`, `POST /ct-library/:id/pages` (multipart `image` + `pageLabel`, `fileName`, `newRevision=1`), `GET /ct-pages/:id/image`, `DELETE /ct-pages/:id`; ghi: chỉ admin |
| Bản vẽ trạm | `GET /substation-drawings`, `GET/POST /substations/:id/drawings` (POST multipart `label` + `pdf` + `image` + `page`, `pageCount`), `PUT/DELETE /drawings/:id` (PUT: `label`, kèm file thì thay file), `GET /drawings/:id/image`, `GET /drawings/:id/pdf` |

Quan hệ bảng: `dkct_substations.stationId` → `dkct_stations.id` (TBA thuộc đơn vị QLVH; không xóa được đơn vị còn TBA),
`dkct_surveys.substationId` → `dkct_substations.id` (xóa TBA thì biên bản giữ lại, bỏ liên kết),
`dkct_drawings.substationId` → `dkct_substations.id` (nhiều sơ đồ/trạm, UNIQUE(substationId, label); xóa TBA thì xóa bản vẽ;
biên bản giữ bản sao ảnh đã dùng; bảng cũ `dkct_substation_drawings` được chuyển sang khi migrate, tên "Sơ đồ trạm"),
`dkct_plans.substationId / surveyId / outageId` → TBA / biên bản / lịch cắt điện (xóa thì phương án bỏ liên kết);
`dkct_confirmations.substationId / registrationId / planId` → TBA / giấy ĐKCT / phương án (xóa thì giấy xác nhận bỏ liên kết);
`dkct_ct_transformers.substationId` → TBA; `dkct_ct_pages / dkct_ct_cores.transformerId` → TI, `dkct_ct_points.coreId` → core
(xóa thì xóa theo; `transformerId` vì `ctid` trùng cột hệ thống của Postgres), `dkct_ct_cores.pageId` → trang (xóa trang thì bỏ liên kết);
sơ đồ in ở Phụ lục IV lưu trong `data.drawingIds` (null: phương án cũ, in mọi sơ đồ của trạm). Danh sách TBA – đơn vị QLVH –
người phụ trách ban đầu ở `server/seeds/substations.json`, nạp một lần khi migrate (dấu mốc trong `dkct_settings`).

Lỗi kiểm tra dữ liệu trả mã `422 { error, errors: [{ field, message }] }`. `field` có dạng `workUnits.0.commander`, `permits.1.workers`…

## Cập nhật mẫu Word

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

- Người mới **tự đăng ký**, nhưng chưa thuộc tổ nào nên chưa xem được gì; admin vào **Quản trị** để tạo tổ (tên + viết tắt dùng trong số giấy), xếp người vào tổ và cấp **Trưởng/phó tổ** (được lập, sửa hồ sơ và danh mục).
- Email trong `ADMIN_EMAILS` tự là admin.
- Mỗi người tự sửa hồ sơ (họ tên, chức danh, điện thoại) — dùng cho mục "người đại diện" trên giấy.

**1. Supabase** (supabase.com): New project, region Singapore.
- *Authentication → Sign In / Providers → Email*: **tắt "Confirm email"** (email xác nhận miễn phí của Supabase chỉ gửi được cho thành viên dự án). Quên mật khẩu: admin đặt lại ở *Authentication → Users*.
- Lấy: Project URL, khóa **anon public** (*Project Settings → API Keys*), chuỗi kết nối **Transaction pooler** (nút *Connect*, cổng 6543).

**2. Render** (render.com): *New → Blueprint* → repo DKLPA (đọc `render.yaml`), điền `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_EMAILS`. Bảng `dkct_*` được tạo khi server khởi động.

Gói miễn phí: Render ngủ sau 15 phút không dùng (lần mở đầu chờ ~1 phút); Supabase tạm dừng dự án sau 7 ngày không có truy cập (bấm *Restore* trên trang Supabase).

Chuyển dữ liệu đang dùng trong ChatLan sang Supabase (chạy ở máy có MySQL của ChatLan, sau khi đã có `standalone/.env`):
`node standalone/scripts/copy-from-chatlan.js <đường dẫn server/.env của ChatLan>` — chép mọi bảng `dkct_*` trong một giao dịch và tạo sẵn các tổ; Supabase đã có hồ sơ thì dừng (thêm `--force` để ghi đè).

Chạy ở máy: chép `standalone/.env.example` thành `standalone/.env`, rồi `npm ci && cd standalone && npm ci && npm run build && npm start` (http://localhost:3000). Test: `npm test` trong `standalone/`; toàn bộ test module trên Postgres: `npm run test:pg`.

## Phát triển

```bash
npm install
npm test          # 120 test, có đo độ phủ
```
