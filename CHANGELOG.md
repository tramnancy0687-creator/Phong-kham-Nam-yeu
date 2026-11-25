# Nhật ký thay đổi

Ghi mới nhất lên trên. Mỗi lần sửa web app: thêm một mục ngắn — **ngày, đã làm gì, file chính, việc còn dở**.

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
