// B. Lịch hẹn: UC05 đặt lịch, UC06 đổi lịch, UC07 hủy lịch, UC08 xem lịch làm việc
// UC05a (trùng ghế / bác sĩ) và UC05b (ca trực) do database chặn
import { Router } from 'express';
import { localDate, query, tx } from '../db.js';
import { allow, ROLE } from '../auth.js';
import { HttpError, notFound, required } from '../errors.js';

const { R, D, M } = ROLE;
const r = Router();
export default r;

const APPOINTMENT_SELECT = `
  SELECT a.id, a.start_at, a.end_at, a.status, a.note, a.created_at,
         a.patient_id, p.full_name AS patient_name, p.date_of_birth, p.medical_history, c.phone,
         a.doctor_id, d.full_name AS doctor_name,
         a.chair_id, ch.code AS chair_code, ch.name AS chair_name,
         a.service_id, sv.name AS service_name,
         cr.name AS cancel_reason, a.cancel_note, cb.full_name AS cancelled_by_name, a.cancelled_at,
         cbby.full_name AS created_by_name,
         r.id AS record_id
  FROM appointment a
  JOIN patient p        ON p.id = a.patient_id
  JOIN contact c        ON c.id = p.contact_id
  JOIN staff d          ON d.id = a.doctor_id
  JOIN dental_chair ch  ON ch.id = a.chair_id
  JOIN service sv       ON sv.id = a.service_id
  JOIN staff cbby       ON cbby.id = a.created_by
  LEFT JOIN cancel_reason cr ON cr.id = a.cancel_reason_id
  LEFT JOIN staff cb         ON cb.id = a.cancelled_by
  LEFT JOIN treatment_record r ON r.appointment_id = a.id`;

// UC08: lịch một ngày — ghế, ca trực, lịch hẹn (dùng cho màn hình lưới lịch)
r.get('/schedule', allow(R, D, M), async (req, res) => {
  const date = req.query.date || localDate();
  const doctorId = req.query.doctor_id || null;
  const [chairs, shifts, appointments] = await Promise.all([
    query('SELECT id, code, name, is_active FROM dental_chair WHERE is_active ORDER BY code'),
    query(
      `SELECT sh.id, sh.doctor_id, s.full_name AS doctor_name, sh.start_time, sh.end_time
       FROM doctor_shift sh JOIN staff s ON s.id = sh.doctor_id
       WHERE sh.shift_date = $1 ORDER BY sh.start_time, s.full_name`,
      [date],
    ),
    query(
      `${APPOINTMENT_SELECT}
       WHERE a.start_at >= $1::date AND a.start_at < $1::date + 1
         AND ($2::bigint IS NULL OR a.doctor_id = $2)
       ORDER BY a.start_at, ch.code`,
      [date, doctorId],
    ),
  ]);
  res.json({ date, chairs, shifts, appointments });
});

r.get('/appointments/:id', allow(R, D, M), async (req, res) => {
  const [a] = await query(`${APPOINTMENT_SELECT} WHERE a.id = $1`, [req.params.id]);
  res.json(notFound(a, 'Lịch hẹn'));
});

// UC05: đặt lịch
r.post('/appointments', allow(R), async (req, res) => {
  const b = req.body;
  required(b, ['patient_id', 'doctor_id', 'chair_id', 'service_id', 'start_at']);
  const [archived] = await query('SELECT archived_at FROM patient WHERE id = $1', [b.patient_id]);
  if (archived?.archived_at) throw new HttpError(409, 'Hồ sơ bệnh nhân đã lưu trữ');
  const [row] = await query(
    `INSERT INTO appointment (patient_id, doctor_id, chair_id, service_id, start_at, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [b.patient_id, b.doctor_id, b.chair_id, b.service_id, b.start_at, b.note || null, req.user.id],
  );
  res.status(201).json(row);
});

// UC06: đổi lịch (kiểm tra lại trùng ghế / bác sĩ / ca trực)
r.put('/appointments/:id', allow(R), async (req, res) => {
  const b = req.body;
  required(b, ['start_at', 'doctor_id', 'chair_id']);
  const rows = await query(
    `UPDATE appointment
     SET start_at = $2, doctor_id = $3, chair_id = $4,
         service_id = COALESCE($5, service_id), note = COALESCE($6, note)
     WHERE id = $1 AND status = 'scheduled' RETURNING id`,
    [req.params.id, b.start_at, b.doctor_id, b.chair_id, b.service_id || null, b.note ?? null],
  );
  if (!rows.length) throw new HttpError(409, 'Chỉ đổi được lịch đang chờ khám');
  res.json(rows[0]);
});

// UC07: hủy lịch «include» ghi lý do, người hủy, thời điểm
r.post('/appointments/:id/cancel', allow(R), async (req, res) => {
  required(req.body, ['cancel_reason_id']);
  const rows = await query(
    `UPDATE appointment
     SET status = 'cancelled', cancel_reason_id = $2, cancel_note = $3, cancelled_by = $4, cancelled_at = now()
     WHERE id = $1 AND status = 'scheduled' RETURNING id`,
    [req.params.id, req.body.cancel_reason_id, req.body.cancel_note || null, req.user.id],
  );
  if (!rows.length) throw new HttpError(409, 'Chỉ hủy được lịch đang chờ khám');
  res.json(rows[0]);
});

// Đánh dấu bệnh nhân không đến
r.post('/appointments/:id/no-show', allow(R), async (req, res) => {
  const rows = await query(
    `UPDATE appointment SET status = 'no_show'
     WHERE id = $1 AND status = 'scheduled' AND start_at < LOCALTIMESTAMP RETURNING id`,
    [req.params.id],
  );
  if (!rows.length) throw new HttpError(409, 'Chỉ đánh dấu được lịch đang chờ và đã qua giờ hẹn');
  res.json(rows[0]);
});

// Bác sĩ bắt đầu khám: tạo phiếu điều trị từ lịch hẹn (UC09)
r.post('/appointments/:id/record', allow(D), async (req, res) => {
  const recordId = await tx(req.user.id, async (q) => {
    const [a] = await q('SELECT * FROM appointment WHERE id = $1 FOR UPDATE', [req.params.id]);
    notFound(a, 'Lịch hẹn');
    const [existing] = await q('SELECT id FROM treatment_record WHERE appointment_id = $1', [a.id]);
    if (existing) return existing.id;
    if (a.status === 'cancelled') throw new HttpError(409, 'Lịch đã hủy, không ghi phiếu được');
    const [rec] = await q(
      `INSERT INTO treatment_record (patient_id, appointment_id, treatment_plan_id, doctor_id, visit_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [a.patient_id, a.id, req.body?.treatment_plan_id || null, a.doctor_id, a.start_at],
    );
    await q("UPDATE appointment SET status = 'completed' WHERE id = $1", [a.id]);
    return rec.id;
  });
  res.status(201).json({ id: recordId });
});
