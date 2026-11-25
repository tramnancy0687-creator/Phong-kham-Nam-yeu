# Nhật ký thay đổi

Ghi mới nhất lên trên. Mỗi lần sửa web app: thêm một mục ngắn — **ngày, đã làm gì, file chính, việc còn dở**.

## 2026-11-25 — chuẩn bị deploy DB online (Neon)

- `server/src/db.js`: pool cấu hình cho DB online (`DB_POOL_MAX`, timeout, bắt lỗi kết nối rảnh), báo lỗi rõ khi thiếu `DATABASE_URL`.
- `server/package.json`: `start` không bắt buộc có file `.env` (hosting dùng biến môi trường); thêm `start:prod` đọc `.env.production`.
- `server/src/index.js`: tắt êm khi nhận SIGTERM từ hosting.
- `server/.env.production.example`: mẫu cấu hình production. `.gitignore` chặn mọi `.env.*` trừ file mẫu.
- `database/deploy-online.ps1`: sao lưu DB local → khôi phục lên Neon, đặt timezone Asia/Bangkok. Đã thử trên DB local giả lập (user không phải superuser): đạt.
- **Đã deploy DB lên Neon:** project `phong-kham-nam-yeu` (id `quiet-tooth-62878279`), PostgreSQL 18, region Singapore (aws-ap-southeast-1), database `phong_kham_nam_yeu`, role `tramadmin` (mật khẩu do Neon sinh, chỉ lưu trong `server/.env.production`). Dữ liệu: 6 nhân viên, 9 bệnh nhân, 23 lịch hẹn, 12 hóa đơn. Đã thử API qua DB online: đăng nhập, tìm kiếm có dấu, báo cáo doanh thu — đạt.
- `DATABASE_URL` dùng `sslmode=verify-full` (Node `pg` kiểm tra chứng chỉ); script deploy tự đổi sang `require` cho psql.
- Quản lý DB online: https://console.neon.tech hoặc `npx neonctl` (đã đăng nhập trên máy này).
- `render.yaml`: Blueprint deploy backend lên Render (free, Singapore, rootDir `server`, health check `/api/health`).
- Backend đã chạy trên Render: https://phong-kham-nam-yeu-api.onrender.com (đã thử đăng nhập, dữ liệu qua Neon: đạt).
- Vercel bị mạng công ty chặn → web cũng deploy lên Render: service `phong-kham-nam-yeu-web` trong `render.yaml` (`API_URL` trỏ backend, đọc lúc build vì `rewrites`).
- `start-app.bat` vẫn dùng DB local.

## 2026-11-25

- Thêm tài liệu kiến trúc `.claude/docs/architecture/overview.md` (xem bằng Markdown Preview Enhanced).
- Thêm `CHANGELOG.md` này và mục “Lịch sử & tiến độ” trong `CLAUDE.md`.
- Khởi tạo Git (nhánh `main`), `.gitignore` chặn `.env`, `node_modules/`, `.next/`.

## Trước 2026-11-25 (tóm tắt)

- Cài PostgreSQL 17 portable (Docker không cài được: không có quyền admin/WSL). Superuser `tramnguyen`.
- Bài tập `appdb`: bảng `product`, `category` tách riêng có khóa ngoại (`sql/`).
- Cài pgAdmin 4 chạy trên web (cổng 5050), đăng ký sẵn 2 database.
- Tạo database `phong_kham_nam_yeu` theo use case (`database/00`–`04`), user `tramadmin`, có dữ liệu mẫu.
- Xây API Express (`server/`) và web Next.js (`web/`) cho UC00–UC27; file sơ đồ màn hình `.claude/docs/ui-ux/man-hinh-tong-quan.drawio`.
- Đã kiểm thử: API 82/82, `next build` thành công.

## Việc còn dở / ý tưởng

- Chưa bấm thử toàn bộ giao diện trên trình duyệt (luồng đặt lịch → khám → hóa đơn → thu tiền).
- Hóa đơn liệu trình: lễ tân phải tự chọn dịch vụ (bảng `treatment_plan` không lưu dịch vụ).
- Bỏ nút điền nhanh tài khoản mẫu ở trang đăng nhập trước khi dùng thật.
