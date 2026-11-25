# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong dự án này.

## Tổng quan dự án

Hệ thống web quản lý phòng khám nha khoa **Phòng khám Nấm yêu**, xây theo phân tích use case ở `.claude/docs/requirements/use-case.md` (UC00–UC27, quyết định QĐ1–QĐ3). Tác nhân: Lễ tân, Bác sĩ, Quản lý, Hệ thống (Timer). Bệnh nhân không đăng nhập.

## Công nghệ sử dụng

- **Database:** PostgreSQL 17 (bản portable ở `%USERPROFILE%\PostgreSQL17`), database `phong_kham_nam_yeu`, user `tramadmin`. Extension `btree_gist`, `pgcrypto`.
- **API:** Node.js + Express 5 + `pg` + `jsonwebtoken` (ES modules, không TypeScript) — `server/`, cổng 4000.
- **Web:** Next.js 16 (App Router) + React 19, JavaScript — `web/`, cổng 3000. CSS thuần trong `web/app/globals.css` (không Tailwind).

## Cấu trúc thư mục

- `database/` — script SQL chạy theo thứ tự `00_` → `04_` (tạo DB, bảng, trigger, view báo cáo, dữ liệu mẫu).
- `server/src/routes/` — mỗi file một nhóm use case: `patients` (A), `appointments` (B), `treatments` (C), `billing` (D), `catalog` + `inventory` (E), `reports` (F).
- `web/app/(app)/` — các màn hình sau đăng nhập; `web/app/login/`. Component dùng chung ở `web/components/`, tiện ích ở `web/lib/`.
- `.claude/docs/requirements/` — use case; `.claude/docs/ui-ux/man-hinh-tong-quan.drawio` — sơ đồ màn hình + wireframe.
- `sql/` — bài tập cũ (bảng product/category trong database `appdb`), không thuộc hệ thống phòng khám.

## Lệnh thường dùng

- Khởi động tất cả: `start-app.bat` (PostgreSQL → API → Web, mở trình duyệt).
- API: `cd server && npm run dev` (tự reload). Cấu hình ở `server/.env` (mẫu: `.env.example`).
- Web: `cd web && npm run dev`; kiểm tra biên dịch: `npx next build`.
- Database: `start-db.bat` / `stop-db.bat`; psql: `%USERPROFILE%\PostgreSQL17\pgsql\bin\psql.exe -h localhost -U tramadmin -d phong_kham_nam_yeu`.
- Tạo lại DB từ đầu: chạy `database/00_create_database.sql` bằng superuser `tramnguyen`, rồi `01`–`04` bằng `tramadmin` với `-1 -v ON_ERROR_STOP=1`.

## Quy ước code

- **Luật nghiệp vụ đặt trong database** (EXCLUDE, CHECK, FK, trigger) — API không kiểm tra lại, chỉ dịch lỗi qua `CONSTRAINT_MESSAGES` trong `server/src/errors.js`. Thêm ràng buộc mới thì thêm thông báo tiếng Việt tương ứng.
- Thao tác cần ghi “ai sửa” (phiếu điều trị, UC10) phải chạy qua `tx(req.user.id, …)` để gán `app.current_staff_id`.
- Phân quyền bằng `allow(R, D, M)` theo đúng tác nhân của use case; menu web lọc theo `role` trong `web/app/(app)/layout.jsx`.
- `timestamp` (giờ hẹn, giờ khám) là giờ địa phương, trả về dạng chuỗi — không chuyển múi giờ. Dùng `localDate()` (server) / `todayStr()` (web), không dùng `toISOString()` để lấy ngày.
- Tên bảng/cột tiếng Anh, chú thích và giao diện tiếng Việt. Mỗi màn hình ghi mã UC ở đầu file và trên tiêu đề trang.

## Lịch sử & tiến độ

- Đọc `CHANGELOG.md` khi bắt đầu phiên làm việc để biết đã làm gì và việc còn dở.
- Sau mỗi thay đổi đáng kể (thêm/sửa màn hình, API, bảng, ràng buộc): thêm một mục vào đầu `CHANGELOG.md` (ngày, việc đã làm, file chính, việc còn dở) và cập nhật `.claude/docs/architecture/overview.md` nếu kiến trúc, route hay màn hình thay đổi.

## Tài liệu tham khảo

- Kiến trúc: `.claude/docs/architecture/overview.md`.

- Use case: `.claude/docs/requirements/use-case.md`, `use-case.puml`.
- Sơ đồ màn hình: `.claude/docs/ui-ux/man-hinh-tong-quan.drawio` (mở bằng extension Draw.io Integration).

## Lưu ý quan trọng

- Tài khoản mẫu (mật khẩu `123456`): `letan.lan`, `letan.hung` (lễ tân), `bs.minh`, `bs.hoa`, `bs.khoa` (bác sĩ), `ql.tam` (quản lý). Mật khẩu yếu, chỉ dùng cho học tập; trang đăng nhập có nút điền nhanh tài khoản mẫu — bỏ đi trước khi dùng thật.
- `04_seed_data.sql` chỉ chạy được một lần trên DB trống.
- Không xóa được phiếu điều trị / bệnh nhân chưa đủ 5 năm (UC26) — muốn làm sạch dữ liệu thử thì sao lưu bằng `pg_dump` trước và khôi phục bằng `pg_restore --clean`.
