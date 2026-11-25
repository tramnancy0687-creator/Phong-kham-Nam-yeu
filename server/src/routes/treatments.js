// C. Khám & điều trị: UC09 phiếu điều trị, UC10 sửa (ghi lịch sử), UC11 kê đơn,
// UC12 vật tư (trừ kho, «extend» UC25 cảnh báo), UC13 lập liệu trình, UC14 theo dõi liệu trình
import { Router } from 'express';
import { query, tx } from '../db.js';
import { allow, ROLE } from '../auth.js';
import { HttpError, notFound, required } from '../errors.js';

const { R, D, M } = ROLE;
const r = Router();
export default r;

// ---------- Phiếu điều trị ----------

// Khám không qua lịch hẹn (vd. buổi trong liệu trình, cấp cứu)
r.post('/records', allow(D), async (req, res) => {
  required(req.body, ['patient_id']);
  const [rec] = await query(
    `INSERT INTO treatment_record (patient_id, treatment_plan_id, doctor_id, diagnosis)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [req.body.patient_id, req.body.treatment_plan_id || null, req.user.id, req.body.diagnosis || null],
  );
  res.status(201).json(rec);
});

r.get('/records/:id', allow(R, D, M), async (req, res) => {
  const id = req.params.id;
  const [rec] = await query(
    `SELECT r.*, p.full_name AS patient_name, p.date_of_birth, p.gender, p.medical_history, p.archived_at,
            c.phone, d.full_name AS doctor_name, tp.name AS plan_name,
            a.start_at AS appointment_at, ch.code AS chair_code, ub.full_name AS updated_by_name,
            (SELECT i.id FROM invoice i WHERE i.treatment_record_id = r.id AND i.status = 'issued'
             ORDER BY i.id LIMIT 1) AS invoice_id
     FROM treatment_record r
     JOIN patient p ON p.id = r.patient_id
     JOIN contact c ON c.id = p.contact_id
     JOIN staff d ON d.id = r.doctor_id
     LEFT JOIN treatment_plan tp ON tp.id = r.treatment_plan_id
     LEFT JOIN appointment a ON a.id = r.appointment_id
     LEFT JOIN dental_chair ch ON ch.id = a.chair_id
     LEFT JOIN staff ub ON ub.id = r.updated_by
     WHERE r.id = $1`,
    [id],
  );
  notFound(rec, 'Phiếu điều trị');
  const [items, prescriptions, supplies, history, plans] = await Promise.all([
    query(
      `SELECT ti.*, sv.code AS service_code, sv.name AS service_name, d.full_name AS doctor_name,
              (il.id IS NOT NULL) AS billed
       FROM treatment_item ti
       JOIN service sv ON sv.id = ti.service_id
       JOIN staff d ON d.id = ti.performing_doctor_id
       LEFT JOIN invoice_line il ON il.treatment_item_id = ti.id
       WHERE ti.record_id = $1 ORDER BY ti.id`,
      [id],
    ),
    query(
      `SELECT pi.*, m.name AS item_name, m.unit FROM prescription_item pi
       JOIN medical_item m ON m.id = pi.item_id WHERE pi.record_id = $1 ORDER BY pi.id`,
      [id],
    ),
    query(
      `SELECT su.*, m.name AS item_name, m.unit, m.stock_quantity, m.min_threshold FROM supply_usage su
       JOIN medical_item m ON m.id = su.item_id WHERE su.record_id = $1 ORDER BY su.id`,
      [id],
    ),
    query(
      `SELECT h.id, h.table_name, h.action, h.edited_at, s.full_name AS edited_by_name, h.old_data, h.new_data
       FROM treatment_record_history h JOIN staff s ON s.id = h.edited_by
       WHERE h.record_id = $1 ORDER BY h.edited_at DESC, h.id DESC`,
      [id],
    ),
    query(
      `SELECT id, name FROM treatment_plan WHERE patient_id = $1 AND (status = 'in_progress' OR id = $2)
       ORDER BY start_date DESC`,
      [rec.patient_id, rec.treatment_plan_id],
    ),
  ]);
  res.json({ ...rec, items, prescriptions, supplies, history, plans });
});

// UC10: sửa phiếu — trigger tự ghi lịch sử (ai sửa lấy từ app.current_staff_id)
r.put('/records/:id', allow(D), async (req, res) => {
  const b = req.body;
  await tx(req.user.id, async (q) => {
    const rows = await q(
      `UPDATE treatment_record
       SET diagnosis = $2, note = $3, treatment_plan_id = $4, updated_by = $5
       WHERE id = $1 RETURNING id`,
      [req.params.id, b.diagnosis || null, b.note || null, b.treatment_plan_id || null, req.user.id],
    );
    notFound(rows[0], 'Phiếu điều trị');
  });
  res.json({ ok: true });
});

// UC09: các việc làm trong buổi (mỗi việc ghi số răng và bác sĩ thực hiện — QĐ1)
r.post('/records/:id/items', allow(D), async (req, res) => {
  const b = req.body;
  required(b, ['service_id']);
  const [row] = await query(
    `INSERT INTO treatment_item (record_id, service_id, performing_doctor_id, tooth_number, quantity, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.params.id, b.service_id, b.performing_doctor_id || req.user.id, b.tooth_number || null, b.quantity || 1, b.note || null],
  );
  res.status(201).json(row);
});

r.put('/treatment-items/:id', allow(D), async (req, res) => {
  const b = req.body;
  await tx(req.user.id, async (q) => {
    const rows = await q(
      `UPDATE treatment_item SET service_id = $2, performing_doctor_id = $3, tooth_number = $4, quantity = $5, note = $6
       WHERE id = $1 RETURNING id`,
      [req.params.id, b.service_id, b.performing_doctor_id, b.tooth_number || null, b.quantity || 1, b.note || null],
    );
    notFound(rows[0], 'Việc điều trị');
  });
  res.json({ ok: true });
});

r.delete('/treatment-items/:id', allow(D), async (req, res) => {
  await tx(req.user.id, (q) => q('DELETE FROM treatment_item WHERE id = $1', [req.params.id]));
  res.status(204).end();
});

// UC11: kê đơn thuốc
r.post('/records/:id/prescriptions', allow(D), async (req, res) => {
  const b = req.body;
  required(b, ['item_id', 'quantity', 'dosage']);
  const [row] = await query(
    'INSERT INTO prescription_item (record_id, item_id, quantity, dosage, note) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.params.id, b.item_id, b.quantity, b.dosage, b.note || null],
  );
  res.status(201).json(row);
});

r.delete('/prescriptions/:id', allow(D), async (req, res) => {
  await tx(req.user.id, (q) => q('DELETE FROM prescription_item WHERE id = $1', [req.params.id]));
  res.status(204).end();
});

// UC12: ghi vật tư dùng «include» trừ tồn kho; «extend» UC25 cảnh báo dưới ngưỡng
r.post('/records/:id/supplies', allow(D), async (req, res) => {
  const b = req.body;
  required(b, ['item_id', 'quantity']);
  const result = await tx(req.user.id, async (q) => {
    const [row] = await q(
      'INSERT INTO supply_usage (record_id, item_id, quantity, note) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.params.id, b.item_id, b.quantity, b.note || null],
    );
    const [item] = await q('SELECT name, unit, stock_quantity, min_threshold FROM medical_item WHERE id = $1', [b.item_id]);
    const warning = item.stock_quantity < item.min_threshold
      ? `${item.name} chỉ còn ${item.stock_quantity} ${item.unit}, dưới ngưỡng ${item.min_threshold}`
      : null;
    return { id: row.id, warning };
  });
  res.status(201).json(result);
});

r.delete('/supplies/:id', allow(D), async (req, res) => {
  await tx(req.user.id, (q) => q('DELETE FROM supply_usage WHERE id = $1', [req.params.id]));
  res.status(204).end();
});

// ---------- Liệu trình ----------
const PLAN_PAID = `(SELECT COALESCE(sum(pm.amount), 0) FROM payment pm JOIN invoice i ON i.id = pm.invoice_id
                    WHERE i.treatment_plan_id = v.plan_id AND i.status = 'issued')`;

// UC14: theo dõi tiến độ
r.get('/plans', allow(R, D, M), async (req, res) => {
  res.json(await query(
    `SELECT v.*, tp.total_amount, tp.doctor_id, ${PLAN_PAID} AS paid_amount
     FROM v_report_treatment_plan_progress v JOIN treatment_plan tp ON tp.id = v.plan_id
     WHERE ($1::text IS NULL OR v.status = $1) AND ($2::bigint IS NULL OR v.patient_id = $2)
     ORDER BY v.start_date DESC`,
    [req.query.status || null, req.query.patient_id || null],
  ));
});

r.get('/plans/:id', allow(R, D, M), async (req, res) => {
  const id = req.params.id;
  const [plan] = await query(
    `SELECT v.*, tp.total_amount, tp.doctor_id, tp.end_date, tp.note, c.phone, ${PLAN_PAID} AS paid_amount
     FROM v_report_treatment_plan_progress v
     JOIN treatment_plan tp ON tp.id = v.plan_id
     JOIN patient p ON p.id = v.patient_id
     JOIN contact c ON c.id = p.contact_id
     WHERE v.plan_id = $1`,
    [id],
  );
  notFound(plan, 'Liệu trình');
  const [installments, sessions, invoices] = await Promise.all([
    query(
      `SELECT ins.*, COALESCE((SELECT sum(amount) FROM payment WHERE installment_id = ins.id), 0) AS paid_amount
       FROM treatment_plan_installment ins WHERE ins.plan_id = $1 ORDER BY ins.installment_no`,
      [id],
    ),
    query(
      `SELECT r.id, r.visit_at, r.diagnosis, s.full_name AS doctor_name
       FROM treatment_record r JOIN staff s ON s.id = r.doctor_id
       WHERE r.treatment_plan_id = $1 ORDER BY r.visit_at`,
      [id],
    ),
    query(
      `SELECT b.* FROM v_invoice_balance b JOIN invoice i ON i.id = b.invoice_id
       WHERE i.treatment_plan_id = $1 ORDER BY b.created_at`,
      [id],
    ),
  ]);
  res.json({ ...plan, installments, sessions, invoices });
});

// UC13: lập liệu trình, chia đợt thanh toán
r.post('/plans', allow(D), async (req, res) => {
  const b = req.body;
  required(b, ['patient_id', 'name', 'total_sessions', 'total_amount']);
  const installments = Array.isArray(b.installments) ? b.installments.filter((i) => Number(i.amount) > 0) : [];
  if (installments.length) {
    const sum = installments.reduce((s, i) => s + Number(i.amount), 0);
    if (sum !== Number(b.total_amount)) {
      throw new HttpError(400, `Tổng các đợt (${sum.toLocaleString('vi-VN')}) phải bằng tổng tiền liệu trình`);
    }
  }
  const id = await tx(req.user.id, async (q) => {
    const [plan] = await q(
      `INSERT INTO treatment_plan (patient_id, doctor_id, name, total_sessions, total_amount, start_date, note)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7) RETURNING id`,
      [b.patient_id, req.user.id, b.name, b.total_sessions, b.total_amount, b.start_date || null, b.note || null],
    );
    for (const [i, ins] of installments.entries()) {
      await q(
        'INSERT INTO treatment_plan_installment (plan_id, installment_no, amount, due_date) VALUES ($1, $2, $3, $4)',
        [plan.id, i + 1, ins.amount, ins.due_date || null],
      );
    }
    return plan.id;
  });
  res.status(201).json({ id });
});

r.put('/plans/:id', allow(D), async (req, res) => {
  const b = req.body;
  const rows = await query(
    `UPDATE treatment_plan
     SET status = COALESCE($2, status), total_sessions = COALESCE($3, total_sessions),
         note = COALESCE($4, note),
         end_date = CASE WHEN $2 IN ('completed', 'cancelled') THEN COALESCE(end_date, CURRENT_DATE) ELSE end_date END
     WHERE id = $1 RETURNING id`,
    [req.params.id, b.status || null, b.total_sessions || null, b.note ?? null],
  );
  notFound(rows[0], 'Liệu trình');
  res.json({ ok: true });
});
