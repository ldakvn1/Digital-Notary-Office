# Session Checkpoint - 2026-04-29

## Transcript phiên trước

- Phiên làm việc chính: [Chuoi nang cap UI va workflow](8a307034-bdfe-4772-bb57-d3b085b34acc)
- Giai đoạn tập trung: bổ sung/chuẩn hóa nghiệp vụ quản lý hồ sơ, phân công batch, localization tiếng Việt, và tối ưu UX các màn chính.

## Hoàn tất gần nhất

- Đồng bộ hiển thị menu theo role giữa browser thường và browser trong Cursor (không còn lệch do cache role cũ).
- Chuẩn hóa thông báo tiếng Việt dùng "quản trị viên" thay cho "admin" ở các thông báo hiển thị cho người dùng.
- Cập nhật phân công trong `CaseDetailModal` theo đúng logic phân công batch:
  - Chỉ hiển thị người có role nhận xử lý (`admin`, `notary_officer`)
  - Loại trừ chính người đăng nhập
  - Ẩn khối phân công với role không có quyền
- Sửa label người nhận phân công để tránh trùng dạng `notary (notary)`:
  - Nếu `fullName` trùng `username` chỉ hiển thị 1 lần
  - Nếu khác thì hiển thị `Họ tên (username)`

## Trạng thái hệ thống

- Backend đã restart và chạy tại `http://localhost:4000`.
- Frontend đang dùng `http://localhost:5173`.

## Việc nên làm tiếp (ưu tiên)

1. Bổ sung mini-module quản lý thu phí và báo cáo (phase 1):
   - Trạng thái thu phí: `Chưa thu / Thu một phần / Đã thu đủ`
   - Filter theo trạng thái thu phí ở danh sách hồ sơ
   - KPI báo cáo phí ở tab báo cáo + export CSV
2. Chuẩn hóa thêm các text tiếng Việt còn rải rác (nếu phát sinh mới trong quá trình test).
3. Chạy regression nhanh theo 3 role (`admin`, `notary_officer`, `staff/viewer`) cho menu + quyền thao tác.

## Gợi ý câu lệnh để tiếp tục nhanh ngày mai

- "Tiếp tục theo file `Session-Checkpoint-2026-04-29.md`, triển khai phase 1 quản lý thu phí + báo cáo."
- "Đọc `Tasks.md` và làm mục checkpoint chưa hoàn tất."

---

## Checkpoint bổ sung trước khi restart Cursor (11:43)

### 1) Module thu phí / danh sách quản lý

- Đã hoàn thiện `Quản lý phiếu thu` theo style thống nhất:
  - bảng scroll + sticky header
  - pagination + max per view
  - menu thao tác `...` có icon
  - sort/filter đầy đủ + chip hiển thị điều kiện lọc
- Đã chuẩn hóa tương tự cho `Quản lý khách hàng`:
  - menu thao tác `...`, pagination, max per view, scroll
  - filter nhanh + chip lọc
  - đã sửa lỗi trùng 2 dòng hiển thị "Sắp xếp"
- `Quản lý người dùng`:
  - bổ sung chip filter cho audit/user list
  - bổ sung pagination + max per view + sticky header
- `Quản lý hồ sơ`:
  - đã chỉnh spacing block "Tạo hồ sơ và tải tài liệu"
  - đã tắt autocomplete ở dải ô filter bảng để tránh popup gợi ý key/raw string
  - đã map thêm loại `AUTH_CONTRACT` / `AUTH_LETTER` sang nhãn i18n

### 2) Login, email login, và localization lỗi

- Đăng nhập hỗ trợ cả `username` **hoặc** `email`.
- Đã bật lại autocomplete riêng cho luồng auth:
  - login id: `username`
  - password: `current-password`
  - reset/new password: `new-password`
  - các màn khác vẫn giữ off theo cấu hình global.
- Lỗi đăng nhập sai thông tin đã chuẩn hóa:
  - backend trả `code: INVALID_CREDENTIALS`
  - frontend map theo i18n:
    - VI: "Sai tài khoản/email hoặc mật khẩu."
    - EN: "Invalid username/email or password."
- Đã i18n hóa thêm các chuỗi còn hardcode trong `Login` + `ResetPassword`.

### 3) Ràng buộc email user và audit dữ liệu

- Đã chặn email trùng ở toàn bộ điểm cập nhật user:
  - `POST /users`
  - `PUT /users/:username`
  - `PUT /me`
- Khi trùng email trả:
  - HTTP `409`
  - `code: EMAIL_ALREADY_IN_USE`
  - message tiếng Việt rõ ràng.
- `UserManagement` đã bắt đúng lỗi `EMAIL_ALREADY_IN_USE` để hiển thị chuẩn.
- Đã audit nhanh DB user:
  - kết quả: `NO_DUPLICATE_EMAIL`.
- Thêm script audit:
  - `backend/scripts/audit-duplicate-emails.js`
  - `backend/scripts/check-login-identifiers.js`

### 4) Password policy mạnh cho tất cả luồng đổi mật khẩu

- Áp dụng policy thống nhất:
  - >= 8 ký tự
  - có chữ thường
  - có chữ HOA
  - có số
  - có ký tự đặc biệt
- Frontend:
  - thêm util `frontend/src/utils/passwordPolicy.js`
  - thêm strength meter + tooltip rule ở:
    - đổi mật khẩu lần đầu (Login)
    - ResetPassword
    - Profile change password
- Backend:
  - enforce cứng policy ở:
    - `/auth/initial-password-change`
    - `/auth/reset-password`
    - `/me/password`
  - trả `code: WEAK_PASSWORD` nếu không đạt.

### 5) Trạng thái runtime trước khi restart Cursor

- Đã **stop** server:
  - Backend PID `17456`: stopped
  - Frontend PID `10224`: stopped
- An toàn để bạn cập nhật/restart Cursor.

---

## Checkpoint cập nhật cuối ngày (2026-04-29 19:41 UTC+7)

### 1) Nâng cấp danh sách hồ sơ (Case List)

- Bổ sung 2 cột tài chính trong bảng hồ sơ ở `frontend/src/App.jsx`:
  - `Tổng chi phí` (`feeAmount`)
  - `Tổng tiền đã thu` (`feePaid`)
- Hai cột mới đã có:
  - hiển thị theo locale trên UI
  - sort theo cột
  - filter theo cột
- Quick export CSV danh sách hồ sơ đã đồng bộ thêm 2 cột này.

### 2) Chuẩn hóa wording theo yêu cầu

- Đã đổi nhãn hiển thị ngắn thành `Tổng tiền đã thu` qua i18n key `app.totalFeePaid` trong `frontend/src/i18n.jsx`.

### 3) Nâng cấp danh sách phiếu thu

- Bổ sung cột `Tổng chi phí` trong bảng `Quản lý phiếu thu` (`frontend/src/ReceiptManagement.jsx`).
- Cột mới có sort (`receiptSort.field = feeAmount`) và hiển thị trực tiếp trong list.
- Quick export CSV phiếu thu đã thêm cột `Tổng chi phí`.

### 4) Sửa gốc lỗi CSV tiền bị hiểu là text

- Đã chuẩn hóa engine export tại `frontend/src/utils/csvExport.js`:
  - nếu cell là `number` thì xuất raw number (không quote)
  - text vẫn escape/quote an toàn CSV.
- Đã cập nhật các export liên quan để cột tiền đưa ra `Number(...)` thay vì chuỗi format kiểu `3.000.000`.
- Mục tiêu đạt được: mở CSV trong Excel có thể `SUM/AVERAGE` trên cột tiền ổn định hơn.

### 5) Hard check toàn bộ CSV/Báo cáo

- Đã rà soát frontend quick exports: `App`, `ReceiptManagement`, `CustomerManagement`, `TemplateManagement`, `TranslatorManagement`, `UserManagement`.
- Đã rà soát backend exports trong `backend/server.js`:
  - enterprise finance report
  - receipts export
  - notary register export
- Kết luận: các cột tiền trong luồng export chính đang xuất dưới dạng số (không phải chuỗi tiền định dạng UI).

---

## Checkpoint bổ sung cuối phiên (2026-04-29 20:59 UTC+7)

### 1) Case workflow / timecard / role visibility

- Sửa hiển thị transition card trong `CaseDetailModal`:
  - `notary_officer` và `staff` chỉ thấy nhánh chuyển tiến (không thấy nhánh lùi gây nhiễu).
  - `viewer` không còn thấy khối chuyển trạng thái (không có quyền `update_case`).
- Sửa cập nhật trạng thái ở `App.jsx` để timecard cập nhật tức thì sau khi chuyển trạng thái:
  - cập nhật local state (`cases`, `selectedCase`) ngay từ response API
  - vẫn giữ `fetchCases()` để đồng bộ cuối.

### 2) Template workflow theo role (notary/admin)

- Chuẩn hóa luồng review biểu mẫu:
  - thêm trạng thái template `PENDING_APPROVAL` (chờ phê duyệt) sau bước notary rà soát.
  - `POST /templates/:id/review` chuyển sang `PENDING_APPROVAL`.
- Sửa quyền UI `TemplateManagement`:
  - map role alias `notary` -> `notary_officer` (tránh hụt quyền do lệch key role).
  - notary được mở/chỉnh khi template đang `UNDER_REVIEW`.
  - admin duyệt/từ chối vẫn giữ quyền riêng.
- Đổi hành vi action workflow:
  - bấm `Rà soát`/`Phê duyệt`/`Từ chối` từ menu sẽ mở dialog trước,
  - xác nhận hành động bên trong dialog (không đổi trạng thái ngay từ menu).
- Chuẩn hóa label:
  - menu/action: `Rà soát`
  - nút xác nhận trong dialog: `Xác nhận rà soát`
  - admin action: `Phê duyệt` (thay `Duyệt áp dụng`).

### 3) Template create fail (root cause + fix)

- Truy ra nguyên nhân `Lỗi tạo biểu mẫu` (500) không phải do role notary:
  - Prisma client lệch schema runtime (thiếu mapping model `DocumentTemplateVersion`).
- Đã xử lý:
  - dọn các tiến trình backend nodemon trùng,
  - regenerate Prisma client bằng `npx prisma generate`,
  - restart backend.
- Kết quả kiểm thử API:
  - `POST /templates` với user `notary` trả `201` thành công.

### 4) Document generation / download / preview

- Sửa download file ở tab `Tài liệu`:
  - thay `window.open(url)` bằng tải qua `axios` blob có auth token,
  - tránh lỗi `Access token required`.
- Cải thiện UX sinh văn bản:
  - sinh thành công tự chuyển tab `Tài liệu`,
  - toast hiển thị tên file sinh ra.
- Đã thử nhiều vòng fix cho luồng Word gốc:
  - auto neo `{{template.content}}`,
  - fallback khi Docxtemplater parse lỗi,
  - XML-level placeholder replace để giữ layout.

### 5) Trạng thái hiện tại (chưa chốt được)

- User đã xác nhận: dữ liệu đã thay nhưng **format gốc vẫn chưa giữ được như mong muốn** (ví dụ dòng tiêu đề mất căn giữa/in đậm).
- Đã có sample đối chiếu rõ:
  - file gốc: `C:\Users\ldakv\OneDrive\CVs\2025\CV(KhoaLe_IT).docx`
  - file render: `C:\Users\ldakv\Downloads\TMPL_005-HS-20260429-0001 (1).docx`
- Kết luận: cần debug sâu run/paragraph style trong `word/document.xml` và cơ chế thay placeholder qua nhiều text runs để bảo toàn định dạng.

### 6) Gợi ý mở phiên tiếp theo

- Ưu tiên P1: fix dứt điểm preserve-format cho Word gốc (đặc biệt heading center/bold).
- Checklist test lại sau fix:
  1. Sinh văn bản từ template `TMPL_005` với case `HS-20260429-0001`
  2. So sánh trực tiếp heading đầu với file gốc (center, bold, spacing)
  3. Kiểm tra các placeholder còn lại thay đúng mà không phá style.

---

## Checkpoint bổ sung cuối phiên (2026-04-29 22:38 UTC+7)

### 1) Chuỗi debug/render Word (đã chốt hướng Word-first)

- Đã rà soát và điều chỉnh nhiều vòng cho luồng preview + generate DOCX:
  - thêm resolver token mở rộng (`dot.path`, `UPPER_SNAKE_CASE`, alias như `CUSTOMER_NAME`)
  - thử docxtemplater cho preview/generate
  - chuẩn hóa cảnh báo khi source DOCX không có placeholder hợp lệ
- Kết luận triển khai: ưu tiên tuyệt đối `Word-first`, không chỉnh layout Word phức tạp trong web editor.

### 2) Nâng cấp UX quản lý biểu mẫu theo Word-first

- Đã đơn giản hóa màn `TemplateManagement`:
  - bỏ phần toolbar chỉnh sửa rich-text và slash insert trong editor
  - giữ workflow chính: upload `.docx` -> xem token -> chỉnh ngoài Word -> upload lại
- Bổ sung danh sách token chuẩn kèm diễn giải ngay trong UI để copy/chèn vào Word gốc.
- Khôi phục tính năng xem trước file render trong màn biểu mẫu, đổi nhãn nút thành `Xem trước biểu mẫu`.
- Loại bỏ option `Ưu tiên dùng tập tin Word gốc` khỏi UI vì không còn cần trong mô hình Word-first.

### 3) Trạng thái runtime trước khi tắt phiên

- Backend và Frontend đã chạy xuyên suốt quá trình chỉnh sửa để test nhanh.
- Đã sẵn sàng dừng server để kết thúc phiên làm việc.

---

## Ghi chú quy chuẩn form (2026-05-01)

- Đã thêm checklist chuẩn hóa trường bắt buộc tại `FORM_REQUIRED_FIELDS_CHECKLIST.md`.
- Mục tiêu: đồng bộ giữa rule validation bắt buộc và hiển thị dấu `*` trên UI.
- Lưu ý nghiệp vụ hiện tại:
  - `Quản lý người dùng` -> `Email` bắt buộc khi tạo mới user (`required={!editingUser}`).

## Lệnh mở nhanh phiên sau

- "Đọc `Session-Checkpoint.md`, mở `FORM_REQUIRED_FIELDS_CHECKLIST.md`, rồi tiếp tục chuẩn hóa các form theo checklist."

---

## Checkpoint chat/group UI (2026-05-02 04:22 UTC+7)

### 1) Group Settings Dialog - UX nâng cấp

- Đổi tiêu đề quản trị nhóm sang `Quản trị nhóm trao đổi`.
- Refactor khu vực thêm thành viên sang `Autocomplete` multi-select:
  - chọn nhiều user cùng lúc
  - có checkbox trong từng option
  - tìm theo cả `fullName` + `username`
  - không tự xổ full list khi chưa gõ
  - hiển thị `fullName` (ẩn `@username` trên option list)
- Ô tìm thêm thành viên:
  - placeholder đổi thành `Tìm kiếm`
  - thêm icon tìm kiếm + nút `X` clear
  - fix crash runtime liên quan `params.InputProps` trong `renderInput`
  - fix trạng thái controlled input để gõ ổn định (bỏ reset không mong muốn)
- Trường hợp user đã là thành viên:
  - hiển thị trạng thái `Đã là thành viên`
  - disable chọn lại.

### 2) Member list trong dialog - giao diện Teams-like hơn

- Thêm khung danh sách thành viên có `max-height` + scroll dọc nội bộ.
- Header `Thành viên` hiển thị count dạng badge riêng (không dính chữ).
- Thêm ô tìm nhanh thành viên trong danh sách (icon search + nút `X`).
- Sắp xếp thành viên theo vai trò:
  1. Chủ sở hữu
  2. Quản trị
  3. Thành viên
- Đổi badge vai trò từ text sang icon trước tên.
- Hover action chuyển sang icon + tooltip để tránh chồng chữ.
- Nút cuối dialog đổi `Hủy` -> `Đóng`.
- Đặt `Xóa` ở cuối cụm thao tác thành viên.

### 3) Tooltip và icon - ổn định hiển thị

- Bổ sung tooltip cho icon action và role badge.
- Chuẩn hóa tooltip role badge theo wording:
  - `Sở hữu nhóm`
  - `Quản trị nhóm`
- Sửa lỗi import icon không tương thích (`DeleteOutline`) bằng icon ổn định.

### 4) Sửa lỗi nghiêm trọng đã gặp trong phiên

- Fix lỗi trắng UI khi mở quản trị nhóm (runtime crash trong `Autocomplete` render).
- Fix lỗi tìm `notary2` không thấy do logic filter/refresh danh bạ.
- Fix hiện tượng không gõ được trong ô tìm thành viên.
- Fix lỗi hiển thị layer/popup trong dialog để dropdown render đúng.

### 5) Fix quyền quản trị nhóm theo session hiện tại (security/consistency)

- Test case đã xác nhận: sau khi owner chuyển quyền sở hữu cho người khác, cùng session cũ vẫn thao tác quản trị được.
- Đã fix cả frontend + backend:
  - Frontend: bỏ bypass quyền theo `currentUser.role === admin` trong quyền quản trị nhóm.
  - Backend:
    - `canManageGroup` chỉ còn `owner` hoặc `group admin`.
    - `canTransferGroupOwnership` chỉ còn `owner` hiện tại.
- Kết quả: sau chuyển owner, quyền UI/API cập nhật đúng, không còn giữ quyền cũ trong cùng session.

### 6) Trạng thái cuối phiên

- Các chỉnh sửa chat/group đã qua kiểm tra lint: không lỗi.
- Frontend build đã pass lại sau các fix icon/runtime.
