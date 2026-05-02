\# Hoàn thiện hệ thống Digital Notary Office



Dựa trên yêu cầu của bạn, hệ thống hiện tại đã có bộ khung cơ bản (backend Node.js/Express, frontend React/MUI), nhưng cần được nâng cấp và hoàn thiện để đáp ứng đầy đủ các tính năng đã nêu.



Dưới đây là kế hoạch chi tiết để hoàn thiện các module.



\## User Review Required

> \\\[!IMPORTANT]

> Vui lòng xem xét các đề xuất dưới đây và xác nhận xem bạn muốn bắt đầu triển khai từ module nào trước, hoặc nếu bạn muốn triển khai toàn bộ theo thứ tự. Do phạm vi công việc lớn, tôi đề xuất chia nhỏ thành các Phase.



\## Phản hồi về các câu hỏi (Q\&A)

> \\\[!NOTE]

> \\\*\\\*1. Về AI Features (Microsoft 365):\\\*\\\*

> Gói Microsoft 365 chủ yếu tập trung vào ứng dụng văn phòng (Word, Excel, OneDrive, Teams). Để tích hợp chức năng nhận diện chữ trong ảnh (OCR) hoặc đọc CCCD vào phần mềm lập trình riêng (Node.js/React), giải pháp thuộc hệ sinh thái Microsoft là \\\*\\\*Azure AI Document Intelligence\\\*\\\* (hoặc Azure Computer Vision). Nếu bạn có tài khoản Azure đi kèm hoặc có thể tạo dịch vụ này, chúng ta có thể gọi API của Microsoft để đọc dữ liệu từ CCCD. \\\*Trong lúc chờ bạn thiết lập Azure, tôi sẽ tạo một "Mock AI" (giả lập OCR) để hoàn thiện luồng UI trước.\\\*

>

> \\\*\\\*2. Về File Storage:\\\*\\\*

> Thống nhất chúng ta sẽ tiếp tục sử dụng Local Storage (thư mục `uploads/` trên server) cho giai đoạn này để tiết kiệm thời gian và chi phí.

> 

> \\\*\\\*3. Tư vấn về Database (Cơ sở dữ liệu):\\\*\\\*

> Hiện tại hệ thống đang lưu trên các file `.json`. Đối với phần mềm quản lý hồ sơ công chứng yêu cầu tính bảo mật, toàn vẹn dữ liệu và liên kết phức tạp (Hồ sơ liên kết với Khách hàng, liên kết với Nhân viên, kèm theo Lịch sử/Audit log), tôi tư vấn sử dụng cơ sở dữ liệu quan hệ (Relational Database).

> \\\* \\\*\\\*Đề xuất 1 (Tốt nhất cho Production): PostgreSQL\\\*\\\*. Rất mạnh mẽ, bảo mật cao, hỗ trợ JSON field linh hoạt.

> \\\* \\\*\\\*Đề xuất 2 (Nhanh, dễ cài đặt cho lúc phát triển): SQLite\\\*\\\*. Không cần cài đặt server phức tạp, lưu thẳng vào 1 file `.db` nhưng có đầy đủ tính năng SQL.

> \\\* \\\*\\\*Giải pháp:\\\*\\\* Tôi đề xuất chúng ta dùng thư viện \\\*\\\*Prisma ORM\\\*\\\* với \\\*\\\*SQLite\\\*\\\* trong giai đoạn này. Khi hệ thống hoàn thiện và muốn đưa lên server thật, chỉ cần đổi 1 dòng code là có thể chuyển sang PostgreSQL mà không phải viết lại code.



\---



\## Lộ trình triển khai (Phased Roadmap)



Vui lòng xác nhận để tôi bắt đầu thực hiện \*\*Phase 1\*\*.



\### Phase 1: Database \& Authentication (Bắt đầu từ đây)

\- \*\*Database:\*\* Chuyển đổi từ file JSON sang SQLite bằng Prisma ORM. Tạo các bảng: `User`, `Customer`, `Case`, `File`, `Notification`, `AuditLog`.

\- \*\*Authentication:\*\* Thay thế fake-login bằng thư viện JWT thực sự.

\- \*\*Authorization:\*\* Tạo middleware phân quyền chặt chẽ trên backend (Admin, Notary, Staff, Viewer).

\- \*\*Frontend:\*\* Cập nhật UI Navbar và Routing dựa trên Role đã đăng nhập.



\### Phase 2: Workflow \& Quản lý Hồ sơ

\- Cập nhật chức năng gán nhân viên (Assign To) và hạn chót (Deadline).

\- Nâng cấp API Upload để hỗ trợ nhiều file.

\- Ghi nhận Audit Log (lịch sử mọi thao tác) vào Database và hiển thị lên UI.



\### Phase 3: Hệ thống Thông báo \& Dashboard

\- Xây dựng API và UI Dashboard thống kê (Biểu đồ, tổng số liệu).

\- Tạo hệ thống Notification (thông báo quá hạn, thông báo có hồ sơ mới).



\### Phase 4: Tính năng AI \& Hoàn thiện

\- Tích hợp giao diện quét OCR (sử dụng logic mô phỏng trước, sau đó có thể cắm API Azure của Microsoft vào).

\- Auto-fill dữ liệu khách hàng từ file CCCD tải lên.

\- Cảnh báo thiếu tài liệu dựa trên loại hồ sơ.



\---



\## Verification Plan



\### Automated Tests

\- Test lại các API Backend (Login, Tạo hồ sơ, Chuyển trạng thái) đảm bảo phân quyền JWT hoạt động đúng.



\### Manual Verification

\- Đăng nhập bằng từng Role (Admin, Notary, Staff, Viewer) để kiểm tra xem UI có render đúng các tính năng được phép không.

\- Chạy thử luồng tạo hồ sơ -> Upload file -> Đặt deadline -> Duyệt hồ sơ -> Xem Audit Log.

\- Mở Dashboard xem số liệu có cập nhật theo thời gian thực không.

