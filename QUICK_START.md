# QUICK START GUIDE - Digital Notary Office

## ⚡ 1 Phút Khởi Động Nhanh

### Step 1: Khởi động Backend
```bash
cd backend
node server.js
```
✅ Backend chạy tại: http://localhost:4000

### Step 2: Khởi động Frontend
```bash
# Terminal khác
cd frontend
npm run dev
```
✅ Frontend chạy tại: http://localhost:5173

### Step 3: Truy cập ứng dụng
Mở trình duyệt: http://localhost:5173

---

## 🔐 Tài Khoản Test

Chọn một trong các tài khoản dưới đây để test:

| Username | Password | Role | Quyền |
|----------|----------|------|-------|
| admin | 123 | Admin | Toàn quyền |
| notary | 123 | Notary Officer | Duyệt & ký công chứng |
| staff | 123 | Staff | Tạo & cập nhật hồ sơ |
| viewer | 123 | Viewer | Xem dữ liệu |

---

## 📖 Hướng Dẫn Sử Dụng

### 1️⃣ QUẢN LÝ HỒ SƠ

**Tạo hồ sơ mới:**
1. Chọn tab "📁 Quản lý hồ sơ"
2. Điền form: Tên KH, SĐT, Loại giao dịch, Mô tả
3. (Tùy chọn) Chọn khách hàng từ danh sách
4. Click "Tạo hồ sơ"

**Xem chi tiết hồ sơ:**
1. Click vào hồ sơ trong danh sách
2. Modal mở ra hiển thị:
   - Thông tin cơ bản
   - Trạng thái hiện tại
   - Nút chuyển trạng thái (nếu có quyền)
   - Lịch sử xử lý
   - Upload/Download tài liệu

**Workflow 7 bước:**
```
RECEIVED (Tiếp nhận)
    ↓
LEGAL_CHECKING (Kiểm tra pháp lý)
    ↓
DRAFTING (Soạn thảo)
    ↓
REVIEWING (Đang duyệt)
    ↓
APPROVED (Đã duyệt)
    ↓
NOTARIZED (Đã công chứng)
    ↓
ARCHIVED (Đã lưu trữ)
```

---

### 2️⃣ QUẢN LÝ KHÁCH HÀNG

**Tạo khách hàng mới:**
1. Chọn tab "👥 Quản lý khách hàng"
2. Click "+ Thêm khách hàng"
3. Nhập: Họ tên, SĐT, Email, CCCD, Địa chỉ
4. Click "Tạo mới"

**Quản lý khách hàng:**
- Xem danh sách với số hồ sơ
- Sửa thông tin
- Xóa khách hàng

---

### 3️⃣ UPLOAD TÀI LIỆU

**Upload file vào hồ sơ:**
1. Mở hồ sơ (click vào danh sách)
2. Cuộn xuống "Upload tài liệu"
3. Chọn file từ máy
4. Chọn loại tài liệu: CCCD, Hợp đồng, Sổ đỏ, v.v.
5. Click "Upload"

**File Categories:**
- 📄 CCCD/CMT
- 📋 Hợp đồng
- 🏠 Sổ đỏ/Giấy chứng thực
- 💵 Hóa đơn
- 🧾 Biên nhận
- 📁 Tài liệu khác

**Quản lý file:**
- Click "Tải xuống" để download
- Click "Xóa" để xóa file
- Xem lịch sử upload

---

### 4️⃣ DASHBOARD & BÁNG CÁO

Chọn tab "📊 Dashboard" để xem:
- **KPI Overview:** Tổng hồ sơ, đang xử lý, hoàn tất, tổng KH
- **Thống kê theo trạng thái:** Progress bar, percentage
- **Loại giao dịch:** Breakdown by transaction type
- **Top khách hàng:** 5 KH có nhiều hồ sơ nhất
- **Hoạt động gần đây:** 10 hồ sơ vừa cập nhật

---

### 5️⃣ QUẢN LÝ USERS (Admin Only)

**Tạo user mới:**
1. Login với tài khoản admin
2. Chọn tab "👥 Quản lý users"
3. Nhập username, password, chọn role
4. Click "Tạo user"

**Roles:**
- **Admin:** Toàn quyền, quản lý users
- **Notary Officer:** Duyệt & ký công chứng
- **Staff:** Tạo & cập nhật hồ sơ
- **Viewer:** Chỉ xem dữ liệu

**Cập nhật user:**
1. Click "Sửa" trên user
2. Thay đổi role hoặc password
3. Click "Cập nhật"

---

## 🎯 TYPICAL WORKFLOW

### Scenario: Xử lý hồ sơ Mua bán đất

**Bước 1: Staff tạo hồ sơ**
```
Login: staff / 123
→ Tạo hồ sơ: Mua bán (Hoàng Văn A)
→ Upload: CCCD, Hợp đồng
```

**Bước 2: Notary Officer duyệt**
```
Login: notary / 123
→ Xem hồ sơ (RECEIVED)
→ Chuyển sang LEGAL_CHECKING
→ Ghi chú kiểm tra
→ Chuyển DRAFTING
```

**Bước 3: Notary Officer soạn thảo**
```
→ Chuyển REVIEWING
```

**Bước 4: Notary Officer duyệt cuối**
```
→ Chuyển APPROVED
```

**Bước 5: Ký công chứng**
```
→ Upload: Tệp công chứng
→ Chuyển NOTARIZED
```

**Bước 6: Lưu trữ**
```
→ Chuyển ARCHIVED
```

---

## 🐛 COMMON ISSUES & SOLUTIONS

### ❌ Lỗi: "Access token required"
**Giải pháp:** Đăng nhập lại, xóa localStorage
```javascript
// In browser console:
localStorage.clear();
location.reload();
```

### ❌ Lỗi: "Case not found"
**Giải pháp:** Tải lại trang hoặc refresh danh sách
```javascript
// In browser console:
location.reload();
```

### ❌ Không thấy file upload
**Giải pháp:** 
1. Kiểm tra backend đang chạy
2. Kiểm tra uploads/ folder tồn tại
3. Xem console log trong browser & terminal

### ❌ Không thể chuyển trạng thái
**Giải pháp:** 
1. Kiểm tra role của bạn (xem thông tin user)
2. Chỉ có thể chuyển sang trạng thái tiếp theo hợp lệ

---

## 📊 DATA PERSISTENCE

- **Users:** Lưu trong `backend/users.json`
- **Customers:** Lưu trong `backend/customers.json`
- **Cases:** Lưu trong memory (sẽ mất khi restart server)
- **Files:** Lưu trong `backend/uploads/` folder

⚠️ **Note:** Dữ liệu hồ sơ sẽ mất khi restart backend. Để persistent, cần database thực (Phase 2).

---

## 🔄 SHUTDOWN

**Dừng Backend:**
```bash
Press Ctrl+C in backend terminal
```

**Dừng Frontend:**
```bash
Press Ctrl+C in frontend terminal
```

---

## 💡 TIPS & TRICKS

✅ **Cách nhanh tạo hồ sơ:**
- Chọn khách hàng từ dropdown (auto-fill tên & SĐT)

✅ **Filter hồ sơ:**
- Dùng search box để tìm theo tên khách hàng

✅ **Xem lịch sử:**
- Mở hồ sơ → Scroll xuống "Lịch sử xử lý"

✅ **Export data:**
- Copy từ table hoặc quay về Dashboard để analyze

---

## 📞 SUPPORT

Nếu gặp vấn đề:
1. Kiểm tra console (F12 → Console tab)
2. Kiểm tra terminal backend
3. Đảm bảo backend & frontend đều chạy
4. Xóa cache & reload trang (Ctrl+Shift+R)

---

**Happy Testing! 🎉**

*For more details, see: IMPLEMENTATION_REPORT.md*
