# Các Tính Năng Còn Lại & Hướng Phát Triển

## 📋 PHASE 2 RECOMMENDATIONS

### ✋ CÓ THỂ IMPLEMENT NGAY

#### 1. **Workflow Enhancements - Gán Nhân Sự & Deadline**

**Backend Changes:**
```javascript
// Add to cases model:
{
  assignedTo: "username",
  deadline: "2026-05-15",
  priority: "high|normal|low",
  processLogs: [
    {
      status: "DRAFTING",
      startDate: "2026-04-28",
      endDate: "2026-04-30",
      handledBy: "notary",
      duration: 2
    }
  ]
}

// Endpoints needed:
PUT /cases/:id/assign        - Gán nhân sự
PUT /cases/:id/deadline      - Set deadline
PUT /cases/:id/priority      - Đặt mức độ ưu tiên
GET /cases/overdue          - Lấy hồ sơ quá hạn
```

**Frontend UI:**
- Thêm dropdown Assign To (list users)
- Thêm datepicker cho Deadline
- Thêm priority radio buttons
- Alert color-coded cho overdue cases (red)

**Logic:**
```javascript
// Check overdue
const isOverdue = new Date(caseData.deadline) < new Date();
const daysOverdue = Math.floor((new Date() - new Date(caseData.deadline)) / (1000 * 60 * 60 * 24));

// Show warning
if (isOverdue) {
  <Alert severity="error">⚠️ Quá hạn {daysOverdue} ngày!</Alert>
}
```

---

#### 2. **Notification System - Thông Báo Tự Động**

**Backend Structure:**
```javascript
const notificationsFile = path.join(__dirname, "notifications.json");

// Notification model
{
  id: Date.now(),
  userId: "username",
  caseId: "CASE-xxx",
  message: "string",
  type: "info|warning|error|success",
  status: "unread|read",
  createdAt: "datetime",
  actionUrl: "/case/xxx"
}

// Endpoints:
GET    /notifications           - Lấy notifications của user
POST   /notifications/:id/read  - Mark as read
DELETE /notifications/:id       - Xóa notification
```

**Notification Events:**
```javascript
// Auto-create notifications:

// 1. Case assigned to user
→ "{userName} gán hồ sơ {caseId} cho bạn"

// 2. Case approaching deadline
→ "Hồ sơ {caseId} sắp quá hạn (còn 3 ngày)"

// 3. Case overdue
→ "⚠️ Hồ sơ {caseId} đã quá hạn 5 ngày!"

// 4. Case status changed
→ "Hồ sơ {caseId} chuyển sang REVIEWING"

// 5. File uploaded to case
→ "Tệp mới được upload vào {caseId}"
```

**Frontend Components:**
```jsx
// Notification Bell
<Badge badgeContent={unreadCount}>
  <NotificationsIcon onClick={openNotificationPanel} />
</Badge>

// Notification Panel
<Drawer position="right">
  {notifications.map(n => (
    <NotificationItem
      message={n.message}
      type={n.type}
      onRead={() => markAsRead(n.id)}
      onClick={() => navigate(n.actionUrl)}
    />
  ))}
</Drawer>
```

---

#### 3. **AI Features (Optional) - OCR & Auto-Fill**

**Simple Implementation (Without ML):**

```javascript
// Simulate OCR with file name parsing
// If user uploads file named "CCCD_123456789.pdf"
// Extract ID number: 123456789

function parseDocumentMetadata(filename) {
  const patterns = {
    cccdId: /CCCD[_-]?(\d{9,12})/i,
    contractDate: /(\d{4})-(\d{2})-(\d{2})/,
    contractValue: /\D+(\d+)\s*(triệu|tỷ|vnd)?/i
  };
  
  return {
    idNumber: filename.match(patterns.cccdId)?.[1],
    date: filename.match(patterns.contractDate)?.[0],
    value: filename.match(patterns.contractValue)?.[1]
  };
}

// Use in: CaseDetailModal.jsx
const uploadFile = async () => {
  // ... upload logic ...
  
  // Parse metadata
  const metadata = parseDocumentMetadata(file.name);
  
  // Pre-fill form if CCCD
  if (fileType === "CCCD" && metadata.idNumber) {
    setIdNumber(metadata.idNumber);
    alert("✅ Tự động nhận diện số CCCD!");
  }
};
```

**Future (With Real ML):**
- Integrate Google Vision API / Tesseract OCR
- Train model on Vietnamese ID cards
- Auto-extract: Name, ID, DOB, Address
- Accuracy: ~95%+

---

### 🔧 TECHNICAL IMPROVEMENTS

#### 1. **Database Migration**
```bash
# Current: JSON files
# Phase 2: PostgreSQL / MongoDB

npm install mongoose  # or pg
# Create connection pool
# Migrate data scripts
# Add indexes for performance
```

#### 2. **Real JWT Authentication**
```javascript
// Replace fake token with real JWT
const jwt = require('jsonwebtoken');

app.post('/login', (req, res) => {
  const user = validateCredentials(req.body);
  
  const token = jwt.sign(
    { username: user.username, role: user.role },
    'SECRET_KEY',
    { expiresIn: '24h' }
  );
  
  res.json({ token, user });
});

// Verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const decoded = jwt.verify(token, 'SECRET_KEY');
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).send('Invalid token');
  }
};
```

#### 3. **Email Integration (SendGrid / Nodemailer)**
```javascript
const nodemailer = require('nodemailer');

const sendNotificationEmail = async (email, subject, message) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL, pass: process.env.PASSWORD }
  });
  
  await transporter.sendMail({
    from: 'notary@example.com',
    to: email,
    subject,
    html: message
  });
};

// Use when case assigned
→ sendNotificationEmail(user.email, 'Hồ sơ mới được gán', `...`);
```

#### 4. **API Rate Limiting & Validation**
```javascript
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);

// Input validation
app.post('/cases', [
  body('customerName').trim().notEmpty(),
  body('phone').matches(/^\+?[\d\s-]{10,}$/),
  body('type').isIn(['Mua bán', 'Ủy quyền', 'Thừa kế', 'Khác']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // ... process ...
});
```

---

### 📱 ADDITIONAL FEATURES (PHASE 3+)

- [ ] **Cloud Storage (AWS S3)**
- [ ] **Mobile App (React Native)**
- [ ] **Multi-language Support (i18n)**
- [ ] **Advanced Search (Elasticsearch)**
- [ ] **Data Export (PDF, Excel)**
- [ ] **Case Templates**
- [ ] **Smart Reminders (Cron jobs)**
- [ ] **Payment Integration (Stripe)**
- [ ] **Video Conference (WebRTC)**
- [ ] **Digital Signatures**

---

### 🚀 PERFORMANCE OPTIMIZATION

#### 1. **Caching**
```javascript
// Use Redis for caching
const redis = require('redis');
const client = redis.createClient();

app.get('/cases', (req, res) => {
  const cachedData = client.get('all_cases');
  if (cachedData) return res.json(JSON.parse(cachedData));
  
  const cases = loadCases();
  client.setex('all_cases', 3600, JSON.stringify(cases));
  res.json(cases);
});
```

#### 2. **Database Indexing**
```sql
CREATE INDEX idx_case_status ON cases(status);
CREATE INDEX idx_case_customer ON cases(customerId);
CREATE INDEX idx_case_created ON cases(createdAt DESC);
CREATE UNIQUE INDEX idx_customer_phone ON customers(phone);
```

#### 3. **Frontend Optimization**
```javascript
// Code splitting
const CaseDetailModal = React.lazy(() => import('./CaseDetailModal'));

// Image optimization
import { Image } from 'next-image-export-optimizer';

// Memoization
const CaseList = React.memo(({ cases }) => {
  // ... render
});
```

---

## 📈 SUCCESS METRICS

| Metric | Current | Target (Phase 2) |
|--------|---------|------------------|
| Page Load Time | ~500ms | <200ms |
| API Response | ~100ms | <50ms |
| User Session Duration | - | >30 min |
| Cases Processed/Day | - | >100 |
| System Uptime | ~99% | >99.9% |

---

## 📅 DEVELOPMENT ROADMAP

**Week 1-2:** Database migration, JWT auth, email integration
**Week 3-4:** Notification system, deadline management
**Week 5-6:** OCR integration, advanced reports
**Week 7-8:** Performance optimization, testing
**Week 9-10:** Deployment, monitoring, documentation

---

## 💰 ESTIMATED EFFORT

| Feature | Backend | Frontend | Testing | Total |
|---------|---------|----------|---------|-------|
| Notifications | 4h | 3h | 2h | 9h |
| Deadline/Priority | 2h | 2h | 1h | 5h |
| DB Migration | 6h | 2h | 3h | 11h |
| JWT Auth | 3h | 1h | 1h | 5h |
| Email Integration | 2h | - | 1h | 3h |
| OCR (Simple) | 1h | 2h | 1h | 4h |
| **TOTAL** | **18h** | **10h** | **9h** | **37h** |

---

## 🎯 NEXT STEPS

1. ✅ **Current Phase:** Core features complete
2. 🔜 **Phase 2:** Implement notifications + deadline system
3. 📊 **Phase 3:** Advanced reporting + ML features
4. 🌐 **Phase 4:** Scale to production

---

*Ready to proceed with Phase 2? Contact development team!*
