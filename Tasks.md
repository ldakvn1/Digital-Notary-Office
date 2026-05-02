\# Task Tracker: Digital Notary Office Implementation



\## Phase 1: Database \& Authentication

\- \[x] Install Prisma ORM, SQLite, and `jsonwebtoken` in the backend.

\- \[x] Define Prisma Schema (`User`, `Customer`, `Case`, `File`, `Notification`, `AuditLog`).

\- \[x] Run initial migration and generate Prisma Client.

\- \[x] Refactor `backend/server.js` to use Prisma instead of JSON files.

\- \[x] Implement JWT Authentication in `/login`.

\- \[x] Implement JWT Verification middleware and Role-based access control.

\- \[x] Refactor Frontend (`App.jsx`, `Login.jsx`) to handle JWT and decode roles.

\- \[x] Update Frontend API calls (axios) to include Authorization header.



\## Phase 2: Workflow \& Quản lý Hồ sơ

\- \[x] Update `Case` model logic to handle `assignedTo` and `deadline`.

\- \[x] Implement Audit Log recording for all case state changes.

\- \[x] Update Frontend (`CaseDetailModal.jsx`) to allow assigning staff and setting deadlines.

\- \[x] Display Audit Log timeline on Frontend.

\- \[x] Refactor File upload logic to support multiple files and file type categorization.
- [x] **NEW: Thêm UI gán người xử lý với dropdown chọn users + phê duyệt + audit log**


\## Phase 3: Hệ thống Thông báo \& Dashboard

\- \[x] Build backend endpoints for Dashboard Statistics.

\- \[x] Build Frontend `Dashboard.jsx` with charts.

\- \[x] Build Notification API (get, mark as read).

\- \[x] Implement Notification Bell and Drawer on Frontend.

\- \[x] Add simple background task/cron to check overdue cases and generate notifications.



\## Phase 4: Tính năng AI \& Hoàn thiện

\- \[x] Implement Mock AI service for OCR (extract text from filename or simple logic).

\- \[x] Add Auto-fill capability when uploading CCCD.

\- \[x] Add risk warning logic (checking for missing required documents based on case type).

\- \[x] Final end-to-end testing and bug fixing.

\## Giai đoạn A: Nghiệp vụ công chứng cốt lõi

\- \[x] Sổ công chứng chuẩn + đánh số quyển/số công chứng tự động theo năm.

\- \[x] Checklist hồ sơ bắt buộc theo loại việc và chặn phát hành khi thiếu giấy tờ.

\- \[x] Quản lý phí/đã thu/số phiếu thu (tự sinh số phiếu thu khi phát sinh thu phí).

\- \[x] Khóa hồ sơ sau phát hành số công chứng; có quyền mở khóa quản trị.

\- \[x] Xuất sổ công chứng nghiệp vụ ra CSV để đối soát/lưu trữ.

\## Giai đoạn B: Biểu mẫu và sinh văn bản tự động

\- \[x] Xây dựng module quản lý biểu mẫu văn bản (CRUD) có phân loại nghiệp vụ.

\- \[x] Hỗ trợ version hóa biểu mẫu khi cập nhật nội dung.

\- \[x] Cho phép sinh văn bản từ hồ sơ bằng placeholder data (`{{case.*}}`, `{{customer.*}}`, `{{office.*}}`).

\- \[x] Lưu văn bản sinh tự động vào kho file hồ sơ để tải về và kiểm tra.

\- \[x] Thêm giao diện quản trị biểu mẫu và thao tác sinh văn bản tại màn chi tiết hồ sơ.

\## Giai đoạn C: Ký duyệt, đóng dấu, phát hành bản chính thức

\- \[x] Thiết lập luồng 3 bước: ký duyệt nội bộ -> đóng dấu nội bộ -> phát hành bản PDF chính thức.

\- \[x] Chỉ cho phát hành khi đã có số công chứng, đã ký duyệt và đã đóng dấu.

\- \[x] Sinh bản PDF phát hành từ nội dung văn bản (template hoặc bản sinh mới nhất) và lưu vào hồ sơ.

\- \[x] Ghi nhận metadata phát hành trên hồ sơ (`signedAt`, `sealedAt`, `releasedAt`, `releaseCode`) để truy vết.

\- \[x] Khóa hồ sơ tự động sau phát hành bản chính thức để đảm bảo toàn vẹn nghiệp vụ.

\## C+ Bước 1: Ký số thực tế (USB Token/CA) theo mô hình upload

\- \[x] Bổ sung luồng upload PDF đã ký số từ phần mềm CA ngoài hệ thống.

\- \[x] Kiểm tra chữ ký mức cơ bản trên PDF (`/ByteRange`, `/Contents`, `/Type /Sig`).

\- \[x] Lưu metadata ký số (người ký, CA provider, serial chứng thư, thời điểm kiểm tra).

\- \[x] Chặn phát hành bản chính thức nếu chưa có bản PDF ký số hợp lệ.

\## C+ Public: Tra cứu hồ sơ cho khách hàng

\- \[x] Tạo link public tra cứu theo mã ngẫu nhiên không thể đoán (`/track/{code}`).

\- \[x] Xác thực OTP đơn giản bằng 4 số cuối CCCD của khách hàng.

\- \[x] Cung cấp API public tra cứu trạng thái và timeline xử lý đã ẩn dữ liệu nhạy cảm.

\- \[x] Thêm giao diện tra cứu công khai và nút tạo link trực tiếp trong màn chi tiết hồ sơ.

\## Security/UX bổ sung: Quên mật khẩu qua email

\- \[x] Thêm API yêu cầu reset mật khẩu qua email đã đăng ký.

\- \[x] Thêm API đặt lại mật khẩu bằng token có hạn, tự thu hồi session cũ.

\- \[x] Bổ sung giao diện "Quên mật khẩu" ở màn đăng nhập và trang đặt lại mật khẩu.

\## Security/Workflow bổ sung: Xóa hồ sơ theo role (an toàn)

\- \[x] Bổ sung xóa mềm hồ sơ theo quyền `admin` (không hard delete).

\- \[x] Ghi nhận `deletedAt`, `deletedBy`, `deleteReason` và chuyển trạng thái `CANCELLED`.

\- \[x] Chặn xóa với hồ sơ đã phát hành/đã ký số để đảm bảo toàn vẹn nghiệp vụ.

\- \[x] Bổ sung thao tác hủy/xóa mềm hồ sơ tại màn chi tiết hồ sơ cho admin.

\- \[x] Thêm tab nhỏ cho admin để lọc hồ sơ `CANCELLED` và hỗ trợ khôi phục hồ sơ.

\## Security lớp 2: Anti brute-force nâng cao

\- \[x] Chuyển theo dõi login attempts sang DB (bền vững sau restart).

\- \[x] Áp dụng khóa theo cả `username` và `IP`, tăng dần thời gian khóa theo mức tái phạm.

\- \[x] Bổ sung captcha challenge khi phát hiện hành vi đăng nhập bất thường.

\- \[x] Cho admin quyền mở khóa đăng nhập user từ màn quản lý người dùng.

\- \[x] Tạo user mới bằng mật khẩu tạm tự sinh và gửi email thông tin đăng nhập.

\- \[x] Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên (`mustChangePassword`).

\- \[x] Hạn dùng mật khẩu khởi tạo, quá hạn thì tự vô hiệu hóa user.

\- \[x] Admin có thể cấp lại mật khẩu khởi tạo và kích hoạt/vô hiệu hóa user.

\- \[x] Bổ sung security audit logs cho vòng đời tài khoản (create/update/reissue/unlock/disable/first-password-change).

\- \[x] Thêm API và UI admin để tra cứu lịch sử security audit logs.

\- \[x] Hợp nhất audit logs cho cả hồ sơ và user management (lọc theo phạm vi).

\- \[x] Hỗ trợ export audit logs CSV/PDF phục vụ hậu kiểm.

\- \[x] Hậu kiểm nâng cao: lọc audit log theo khoảng thời gian và tìm kiếm full-text.

\- \[x] Thêm bộ báo cáo enterprise (operations/staff/finance) với export CSV.

\- \[x] Thêm SHA-256 hash cho file export audit/report để kiểm tra toàn vẹn hậu kiểm.

\- \[x] Tự sinh file `manifest.json` đi kèm mỗi lượt export (hash, thời gian, bộ lọc, nguồn dữ liệu).

## UX bổ sung: Ghi chú hồ sơ \& hiển thị hồ sơ hoàn thành

\- \[x] Bổ sung trường thông tin `Ghi chú` khi tạo hồ sơ và gửi dữ liệu `notes` lên backend.

\- \[x] Hiển thị `Mô tả \& Ghi chú` tại danh sách hồ sơ khi lọc trạng thái `Đã hoàn tất` (kèm tooltip và rút gọn nội dung dài).

\- \[x] Tách cột hiển thị danh sách hồ sơ thành 2 cột riêng `Mô tả` và `Ghi chú`.

\- \[x] Bổ sung điều phối phân công hồ sơ theo batch (chọn nhiều hồ sơ chưa phân công và gán hàng loạt cho người phụ trách).

## Checkpoint bàn giao (2026-04-29)

\- \[x] Đồng bộ hiển thị menu theo role giữa browser ngoài và browser trong Cursor (tránh lệch do cache role/user cũ).

\- \[x] Chuẩn hóa thông báo tiếng Việt: dùng "quản trị viên" cho message hiển thị thay cho "admin" theo ngữ cảnh.

\- \[x] Đồng bộ logic phân công ở `CaseDetailModal` theo quy tắc phân công batch:

  - chỉ role nhận xử lý (`admin`, `notary_officer`)
  - loại trừ chính user đăng nhập
  - chỉ hiển thị khối phân công cho role có quyền

\- \[x] Sửa format label người nhận phân công để tránh trùng kiểu `notary (notary)`.

### TODO phiên kế tiếp

\- \[ ] Triển khai phase 1 quản lý thu phí và báo cáo:

  - trạng thái thu phí (`Chưa thu / Thu một phần / Đã thu đủ`)
  - filter theo trạng thái thu phí ở danh sách hồ sơ
  - KPI phí + export CSV trong tab báo cáo

\- \[ ] Regression test nhanh theo role (`admin`, `notary_officer`, `staff/viewer`) cho menu + quyền thao tác.

