# Digital Notary Office - Hệ thống Quản lý Văn phòng Công chứng

## Tổng quan

Hệ thống Digital Notary Office là phần mềm toàn diện để số hóa quy trình công chứng, từ tiếp nhận hồ sơ đến lưu trữ tài liệu.

## Tính năng chính

### 🔐 Authentication & Authorization
- Đăng nhập với username/password
- Phân quyền theo role: Admin, Notary Officer, Staff, Viewer
- JWT token authentication

### 📋 Quản lý hồ sơ
- Tạo hồ sơ mới với thông tin khách hàng
- Workflow chuẩn 7 bước: RECEIVED → LEGAL_CHECKING → DRAFTING → REVIEWING → APPROVED → NOTARIZED → ARCHIVED
- Theo dõi trạng thái real-time
- Audit log đầy đủ

### 👥 Quản lý người dùng
- CRUD users (chỉ Admin)
- Phân quyền chi tiết
- Lưu trữ persistent

### 📁 Quản lý tài liệu
- Upload nhiều file
- Phân loại tài liệu (CCCD, Hợp đồng, Sổ đỏ)
- Preview và download
- Lưu trữ local/cloud

### 📊 Dashboard & Báo cáo
- Thống kê tổng quan
- Báo cáo theo trạng thái
- KPI nhân viên
- Xuất báo cáo

## Cài đặt và Chạy

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Quy trình nghiệp vụ

1. **Tiếp nhận hồ sơ** (RECEIVED)
   - Nhập thông tin khách hàng
   - Chọn loại giao dịch
   - Tạo mã hồ sơ tự động

2. **Kiểm tra pháp lý** (LEGAL_CHECKING)
   - Upload và kiểm tra CCCD
   - Xác minh quyền sở hữu
   - Kiểm tra giấy tờ liên quan

3. **Soạn thảo hợp đồng** (DRAFTING)
   - Tạo hợp đồng theo mẫu
   - Điền thông tin tự động
   - Chuẩn bị bản nháp

4. **Duyệt hợp đồng** (REVIEWING)
   - Kiểm tra nội dung pháp lý
   - Sửa lỗi và chỉnh sửa
   - Phê duyệt hợp đồng

5. **Công chứng** (APPROVED)
   - Khách hàng ký
   - Công chứng viên ký
   - Đóng dấu xác nhận

6. **Lưu trữ** (NOTARIZED)
   - Scan tài liệu gốc
   - Lưu file PDF
   - Lưu metadata

7. **Hoàn tất** (ARCHIVED)
   - Bàn giao cho khách
   - Lưu trữ lâu dài

## Phân quyền

### Admin
- ✅ Quản lý toàn hệ thống
- ✅ Quản lý users
- ✅ Xem tất cả báo cáo
- ✅ Thực hiện mọi thao tác

### Notary Officer
- ✅ Duyệt và ký công chứng
- ✅ Xem hồ sơ được gán
- ✅ Upload tài liệu
- ✅ Cập nhật trạng thái

### Staff
- ✅ Tạo và nhập hồ sơ
- ✅ Upload tài liệu
- ✅ Cập nhật thông tin cơ bản
- ✅ Xem hồ sơ được gán

### Viewer
- ✅ Chỉ xem dữ liệu
- ✅ Không thể chỉnh sửa

## API Endpoints

### Authentication
- `POST /login` - Đăng nhập
- `GET /users` - Lấy danh sách users
- `POST /users` - Tạo user mới
- `PUT /users/:username` - Cập nhật user
- `DELETE /users/:username` - Xóa user

### Cases
- `GET /cases` - Lấy danh sách hồ sơ
- `POST /cases` - Tạo hồ sơ mới
- `PUT /cases/:id/status` - Cập nhật trạng thái
- `PUT /cases/:id/assign` - Gán người xử lý

### Files
- `POST /upload/:caseId` - Upload file
- `GET /uploads/:filename` - Download file

## Roadmap phát triển

### Phase 1 ✅ (Hoàn thành)
- [x] CRUD hồ sơ cơ bản
- [x] Login authentication
- [x] Upload file
- [x] User management

### Phase 2 ✅ (Hoàn thành)
- [x] Workflow engine chuẩn
- [x] UI CRM hoàn chỉnh
- [x] Audit log
- [x] Dashboard cơ bản

### Phase 3 (Sắp tới)
- [ ] AI OCR CCCD
- [ ] Email/SMS notifications
- [ ] Advanced reporting
- [ ] Mobile app

### Phase 4 (Tương lai)
- [ ] Cloud deployment
- [ ] Multi-office support
- [ ] Integration với cơ quan nhà nước
- [ ] Blockchain verification

## Công nghệ sử dụng

- **Backend**: Node.js, Express.js
- **Frontend**: React, Material-UI
- **Database**: JSON files (sẽ nâng cấp lên PostgreSQL/MySQL)
- **File Storage**: Local server (sẽ nâng cấp lên AWS S3)
- **Authentication**: JWT

## Tài khoản mặc định

- **Admin**: username: `admin`, password: `123`
- **Staff**: username: `staff`, password: `123`

## Lưu ý

- Hệ thống hiện lưu dữ liệu trong memory và file JSON
- Cần backup thường xuyên
- Khuyến nghị nâng cấp lên database thực cho production

---

*Digital Notary Office - Số hóa quy trình công chứng*</content>
<parameter name="filePath">c:\Users\ldakv\OneDrive\Business\Coding\Digital Notary Office\README.md