import express from 'express';
import { pool, query } from './db.js';
import { requireAuth } from './auth.js';
import { errorHandler } from './errors.js';
import authRoutes from './routes/auth.js';
import patientRoutes from './routes/patients.js';
import catalogRoutes from './routes/catalog.js';
import appointmentRoutes from './routes/appointments.js';
import treatmentRoutes from './routes/treatments.js';
import billingRoutes from './routes/billing.js';
import inventoryRoutes from './routes/inventory.js';
import reportRoutes from './routes/reports.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);

// Mọi API còn lại cần đăng nhập
app.use('/api', requireAuth);
app.use('/api', patientRoutes);
app.use('/api', catalogRoutes);
app.use('/api', appointmentRoutes);
app.use('/api', treatmentRoutes);
app.use('/api', billingRoutes);
app.use('/api', inventoryRoutes);
app.use('/api', reportRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy API' }));
app.use(errorHandler);

// UC26 (tác nhân Hệ thống / Timer): mỗi ngày lưu trữ hồ sơ quá 5 năm không khám
async function archiveExpiredPatients() {
  try {
    const [{ archived }] = await query('SELECT fn_archive_expired_patients() AS archived');
    if (archived) console.log(`[UC26] Đã lưu trữ ${archived} hồ sơ quá 5 năm`);
  } catch (err) {
    console.error('[UC26] Lỗi lưu trữ hồ sơ:', err.message);
  }
}

const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, () => {
  console.log(`API Phòng khám Nấm yêu chạy tại http://localhost:${port}/api`);
  archiveExpiredPatients();
});
const timer = setInterval(archiveExpiredPatients, 24 * 60 * 60 * 1000);

process.on('SIGINT', () => {
  clearInterval(timer);
  server.close(() => pool.end().then(() => process.exit(0)));
});
