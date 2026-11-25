# Kiến trúc dự án — Hệ thống quản lý Phòng khám Nấm yêu

Tài liệu liên quan: [use-case.md](../requirements/use-case.md) · [man-hinh-tong-quan.drawio](../ui-ux/man-hinh-tong-quan.drawio) (sơ đồ màn hình, wireframe — mở bằng extension Draw.io Integration) · [CLAUDE.md](../../../CLAUDE.md).

## 1. Tổng thể

```
Trình duyệt ──▶ Next.js 16 (web/, cổng 3000)
                 │  trang React (client components), App Router
                 │  rewrites: /api/*  ──▶  http://localhost:4000/api/*
                 ▼
               Node.js Express 5 (server/, cổng 4000)
                 │  JWT (Bearer, lưu localStorage "nam-yeu-token"), phân quyền allow(R, D, M)
                 │  pg Pool, transaction tx() gán app.current_staff_id
                 ▼
               PostgreSQL 17 portable (cổng 5432) — phong_kham_nam_yeu
                  ràng buộc + trigger + view báo cáo (luật nghiệp vụ nằm ở đây)
```

| Tầng | Công nghệ | Vai trò |
|---|---|---|
| Web | Next.js 16, React 19, CSS thuần | Giao diện tiếng Việt, menu lọc theo vai trò |
| API | Express 5, `pg`, `jsonwebtoken` (ES modules) | Đăng nhập, phân quyền, dịch lỗi ràng buộc DB sang tiếng Việt |
| Database | PostgreSQL 17, `btree_gist`, `pgcrypto` | Lưu dữ liệu, chặn sai nghiệp vụ (trùng lịch, ngoài ca, thu vượt nợ…) |
| Quản trị DB | pgAdmin 4 (cổng 5050) | Xem/sửa dữ liệu trên nền web |

## 2. Cấu trúc thư mục

```
bt_buoi4/
├─ database/            script SQL chạy theo thứ tự
│  ├─ 00_create_database.sql   role tramadmin + DB (chạy bằng superuser)
│  ├─ 01_schema.sql            23 bảng, EXCLUDE/CHECK/FK
│  ├─ 02_functions_triggers.sql
│  ├─ 03_views_reports.sql     view + hàm báo cáo UC27
│  └─ 04_seed_data.sql         dữ liệu mẫu (chạy 1 lần)
├─ server/              API Node.js
│  ├─ .env              PORT, DATABASE_URL, JWT_SECRET
│  └─ src/
│     ├─ index.js       gắn router, job UC26 mỗi 24 giờ
│     ├─ db.js          pool, query(), tx(), localDate()
│     ├─ auth.js        signToken, requireAuth, allow()
│     ├─ errors.js      HttpError, CONSTRAINT_MESSAGES, errorHandler
│     └─ routes/        mỗi file một nhóm use case
├─ web/                 giao diện Next.js
│  ├─ app/login/        đăng nhập
│  ├─ app/(app)/        các màn hình sau đăng nhập (layout có sidebar)
│  ├─ components/       AuthProvider, ui.jsx, PatientPicker, PatientForm
│  └─ lib/              api.js (fetch + useApi), format.js (nhãn, định dạng)
├─ sql/                 bài tập cũ product/category (DB appdb)
├─ .claude/docs/        use case, kiến trúc, sơ đồ màn hình
└─ start-app.bat, start-db.bat, stop-db.bat, start-pgadmin.bat, stop-pgadmin.bat
```

## 3. Module (backend route ↔ màn hình ↔ use case)

Vai trò: **R** = Lễ tân, **D** = Bác sĩ, **M** = Quản lý.

| Nhóm | Route backend (`server/src/routes/`) | Màn hình (`web/app/(app)/`) | Use case | Vai trò |
|---|---|---|---|---|
| Đăng nhập | `auth.js` — `/auth/login`, `/auth/me`, `/auth/change-password` | `login/`, `doi-mat-khau/` | UC00 | Tất cả |
| A. Bệnh nhân | `patients.js` — `/patients`, `/contacts/:phone`, `/admin/archive-expired` | `benh-nhan/`, `benh-nhan/[id]` | UC01–UC04, UC26 | R, D |
| B. Lịch hẹn | `appointments.js` — `/schedule`, `/appointments` (+ `cancel`, `no-show`, `record`) | `lich-hen/` | UC05–UC08 | R đặt/đổi/hủy, D bắt đầu khám |
| C. Điều trị | `treatments.js` — `/records`, items, prescriptions, supplies, `/plans` | `phieu-dieu-tri/[id]`, `lieu-trinh/`, `lieu-trinh/[id]` | UC09–UC14 | D ghi, R xem |
| D. Thanh toán | `billing.js` — `/invoices`, `/invoices/pending-records`, `/debts`, payments | `hoa-don/`, `hoa-don/[id]` | UC15–UC19 | R, M |
| E. Danh mục | `catalog.js` — chairs, services + giá, cancel-reasons, staff, doctors, shifts | `danh-muc/dich-vu`, `danh-muc/ca-truc`, `danh-muc/ghe`, `nhan-vien/` | UC20–UC23 | M |
| E. Kho | `inventory.js` — `/items`, `/alerts`, `/receipts` | `kho/` | UC24, UC25 | M |
| F. Báo cáo | `reports.js` — 8 báo cáo + `/dashboard` | `bao-cao/`, trang Tổng quan | UC27.1–27.8 | M (Tổng quan: tất cả) |

Luồng chính: **Đặt lịch** (lễ tân) → **Bắt đầu khám** tạo phiếu điều trị (bác sĩ) → **Lập hóa đơn** từ phiếu (lễ tân) → **Thu tiền** → còn nợ hiện ở công nợ / báo cáo.

## 4. Quy ước

- **Luật nghiệp vụ ở database**, API không kiểm tra lại. Lỗi ràng buộc được dịch qua `CONSTRAINT_MESSAGES` (`errors.js`): `23P01`/`23505` → 409, các lỗi `23xxx`/`22xxx`/`P0001` → 400. Thêm ràng buộc mới thì thêm thông báo tiếng Việt.
- **Ghi “ai sửa”** (lịch sử phiếu điều trị, UC10): chạy qua `tx(req.user.id, fn)` để trigger đọc `app.current_staff_id`.
- **Phân quyền** bằng `allow(R, D, M)` đúng tác nhân của use case; menu web lọc theo `role` trong `web/app/(app)/layout.jsx`.
- **Thời gian**: `timestamp`/`date` là giờ địa phương, trả về dạng chuỗi, không đổi múi giờ. Lấy ngày bằng `localDate()` (server) / `todayStr()` (web), không dùng `toISOString()`.
- **Số**: `numeric` và `bigint` được chuyển sang `Number` trong `db.js`.
- **Đặt tên**: bảng/cột tiếng Anh; giao diện, chú thích tiếng Việt; URL màn hình tiếng Việt không dấu. Mỗi màn hình ghi mã UC ở đầu file và trên tiêu đề trang.

## 5. Chạy dự án

| Việc | Cách làm |
|---|---|
| Bật tất cả | Nhấp đúp `start-app.bat` (PostgreSQL → API → Web, mở trình duyệt) |
| Chỉ database | `start-db.bat` / `stop-db.bat` |
| API | `cd server && npm run dev` (tự reload) |
| Web | `cd web && npm run dev` → http://localhost:3000 |
| pgAdmin | `start-pgadmin.bat` → http://127.0.0.1:5050 |
| Tạo lại DB | `00_create_database.sql` bằng `tramnguyen`, rồi `01`–`04` bằng `tramadmin` với `-1 -v ON_ERROR_STOP=1` |

Kết nối database: host `localhost`, port `5432`, DB `phong_kham_nam_yeu`, user `tramadmin` / `123456`.

Tài khoản mẫu (mật khẩu `123456`): `letan.lan`, `letan.hung` (lễ tân) · `bs.minh`, `bs.hoa`, `bs.khoa` (bác sĩ) · `ql.tam` (quản lý).

## 6. Kiểm thử

- **Ràng buộc DB**: chạy kịch bản thử trong transaction rồi `ROLLBACK` — trùng ghế/bác sĩ, ngoài ca trực, số răng FDI sai, tồn kho âm, thu vượt nợ, xóa hồ sơ chưa đủ 5 năm.
- **API**: kịch bản smoke test 82 phép thử (phân quyền, đặt trùng lịch, lịch sử sửa phiếu, giảm giá, thu tiền…). Trước khi thử sao lưu bằng `pg_dump`, sau đó khôi phục bằng `pg_restore --clean --if-exists --single-transaction`.
- **Web**: `cd web && npx next build` phải biên dịch thành công (18 route).

## 7. Phiên bản & ghi chú kỹ thuật

| Thành phần | Phiên bản |
|---|---|
| PostgreSQL | 17.6 (portable, `%USERPROFILE%\PostgreSQL17`, locale C, UTF8) |
| Node.js / Express | Express ^5.3, pg ^8.23, jsonwebtoken ^9.0 |
| Next.js / React | Next ^16.4, React ^19.3 |

- Locale C không hạ chữ hoa có dấu (`lower('Á')`), nên tìm kiếm tên dùng `lower(x COLLATE pg_c_utf8)`.
- Giờ kết thúc lịch hẹn là cột generated `start_at + 30 phút`; chống trùng bằng `EXCLUDE USING gist` (bỏ qua lịch đã hủy).
- Giá dịch vụ lưu theo khoảng ngày (`service_price`), dòng hóa đơn chốt giá lúc tạo.
- PostgreSQL portable không tự chạy khi bật máy — chạy `start-db.bat` trước khi kết nối.
- Docker không dùng được trên máy (không có quyền admin/WSL); `docker-compose.yml` để tham khảo.
- Mật khẩu mẫu và nút điền nhanh tài khoản ở trang đăng nhập chỉ dùng cho học tập.
