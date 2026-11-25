// Ứng dụng Express (không listen) — dùng chung cho server thường (src/index.js) và Vercel serverless (api/index.js)
import express from 'express';
import { query } from './db.js';
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

/** UC26 (tác nhân Hệ thống / Timer): lưu trữ hồ sơ quá 5 năm không khám */
export async function archiveExpiredPatients() {
  const [{ archived }] = await query('SELECT fn_archive_expired_patients() AS archived');
  if (archived) console.log(`[UC26] Đã lưu trữ ${archived} hồ sơ quá 5 năm`);
  return archived;
}

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true });
});

// Vercel Cron gọi mỗi ngày (vercel.json), kèm header Authorization: Bearer <CRON_SECRET>
app.get('/api/cron/archive-expired', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Không có quyền' });
  }
  res.json({ archived: await archiveExpiredPatients() });
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

export default app;
