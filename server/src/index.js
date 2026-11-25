// Chạy API như server thường (máy local, Render): listen cổng + job UC26 mỗi 24 giờ.
// Trên Vercel không dùng file này — xem api/index.js và vercel.json.
import app, { archiveExpiredPatients } from './app.js';
import { pool } from './db.js';

async function runArchiveJob() {
  try {
    await archiveExpiredPatients();
  } catch (err) {
    console.error('[UC26] Lỗi lưu trữ hồ sơ:', err.message);
  }
}

const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, () => {
  console.log(`API Phòng khám Nấm yêu chạy tại http://localhost:${port}/api`);
  runArchiveJob();
});
const timer = setInterval(runArchiveJob, 24 * 60 * 60 * 1000);

// SIGINT: Ctrl+C khi chạy local · SIGTERM: nền tảng hosting tắt / khởi động lại server
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
