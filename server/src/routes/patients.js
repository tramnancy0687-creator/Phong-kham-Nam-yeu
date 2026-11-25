// A. Bệnh nhân: UC01 tìm theo SĐT, UC02 đăng ký, UC03 cập nhật, UC04 lịch sử khám, UC26 lưu trữ
import { Router } from 'express';
import { query, tx } from '../db.js';
import { allow, ROLE } from '../auth.js';
import { HttpError, notFound, required } from '../errors.js';

const { R, D, M } = ROLE;
const r = Router();
export default r;

const PATIENT_FIELDS = ['full_name', 'relationship', 'date_of_birth', 'gender', 'address', 'medical_history'];

// UC01: tìm theo SĐT (đầu số) hoặc theo tên
r.get('/patients', allow(R, D, M), async (req, res) => {
  const term = String(req.query.q ?? '').trim();
  const isPhone = /^[0-9]{3,11}$/.test(term);
  const rows = await query(
    `SELECT p.id, p.full_name, p.date_of_birth, p.gender, p.relationship, p.archived_at,
            c.phone, c.full_name AS contact_name,
            (SELECT max(visit_at) FROM treatment_record r WHERE r.patient_id = p.id) AS last_visit_at
     FROM patient p JOIN contact c ON c.id = p.contact_id
     WHERE $1 = ''
        OR ($2 AND c.phone LIKE $1 || '%')
        OR (NOT $2 AND lower(p.full_name COLLATE pg_c_utf8) LIKE '%' || lower($1 COLLATE pg_c_utf8) || '%')
     ORDER BY c.phone, p.date_of_birth
     LIMIT 100`,
    [term, isPhone],
  );
  res.json(rows);
});

// UC02 «include» UC01: tra SĐT trước khi đăng ký
r.get('/contacts/:phone', allow(R, D, M), async (req, res) => {
  const [contact] = await query('SELECT id, full_name, phone FROM contact WHERE phone = $1', [req.params.phone]);
  if (!contact) return res.json(null);
  contact.patients = await query(
    'SELECT id, full_name, relationship, date_of_birth FROM patient WHERE contact_id = $1 ORDER BY date_of_birth',
    [contact.id],
  );
  res.json(contact);
});

/** Tìm hoặc tạo người liên hệ theo SĐT (QĐ2) */
async function findOrCreateContact(q, phone, contactName) {
  const [found] = await q('SELECT id FROM contact WHERE phone = $1', [phone]);
  if (found) return found.id;
  if (!contactName) throw new HttpError(400, 'SĐT mới: cần nhập tên người giữ SĐT');
  const [created] = await q('INSERT INTO contact (full_name, phone) VALUES ($1, $2) RETURNING id', [contactName, phone]);
  return created.id;
}

// UC02: đăng ký bệnh nhân mới
r.post('/patients', allow(R), async (req, res) => {
  const b = req.body;
  required(b, ['phone', 'full_name', 'date_of_birth']);
  const id = await tx(req.user.id, async (q) => {
    const relationship = b.relationship || 'self';
    const contactId = await findOrCreateContact(q, b.phone, relationship === 'self' ? b.full_name : b.contact_name);
    const [p] = await q(
      `INSERT INTO patient (contact_id, relationship, full_name, date_of_birth, gender, address, medical_history)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [contactId, relationship, b.full_name, b.date_of_birth, b.gender || null, b.address || null, b.medical_history || null],
    );
    return p.id;
  });
  res.status(201).json({ id });
});

r.get('/patients/:id', allow(R, D, M), async (req, res) => {
  const [p] = await query(
    `SELECT p.*, c.phone, c.full_name AS contact_name,
            (SELECT max(visit_at) FROM treatment_record r WHERE r.patient_id = p.id) AS last_visit_at
     FROM patient p JOIN contact c ON c.id = p.contact_id WHERE p.id = $1`,
    [req.params.id],
  );
  notFound(p, 'Bệnh nhân');
  p.same_phone = await query(
    'SELECT id, full_name, relationship, date_of_birth FROM patient WHERE contact_id = $1 AND id <> $2 ORDER BY date_of_birth',
    [p.contact_id, p.id],
  );
  res.json(p);
});

// UC03: cập nhật hồ sơ (đổi SĐT = chuyển sang người liên hệ khác)
r.put('/patients/:id', allow(R), async (req, res) => {
  const b = req.body;
  await tx(req.user.id, async (q) => {
    const [p] = await q('SELECT p.archived_at, c.phone FROM patient p JOIN contact c ON c.id = p.contact_id WHERE p.id = $1 FOR UPDATE OF p', [req.params.id]);
    notFound(p, 'Bệnh nhân');
    if (p.archived_at) throw new HttpError(409, 'Hồ sơ đã lưu trữ (quá 5 năm), không sửa được');

    const sets = [];
    const params = [];
    for (const f of PATIENT_FIELDS) {
      if (f in b) {
        params.push(b[f] === '' ? null : b[f]);
        sets.push(`${f} = $${params.length}`);
      }
    }
    if (b.phone && b.phone !== p.phone) {
      const selfName = (b.relationship ?? 'self') === 'self' ? b.full_name : null;
      params.push(await findOrCreateContact(q, b.phone, b.contact_name || selfName));
      sets.push(`contact_id = $${params.length}`);
    }
    if (!sets.length) return;
    params.push(req.params.id);
    await q(`UPDATE patient SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  });
  res.json({ ok: true });
});

// UC04: lịch sử khám, lịch hẹn, liệu trình, hóa đơn
r.get('/patients/:id/history', allow(R, D, M), async (req, res) => {
  const id = req.params.id;
  const [records, appointments, plans, invoices] = await Promise.all([
    query(
      `SELECT r.id, r.visit_at, r.diagnosis, r.note, s.full_name AS doctor_name, tp.name AS plan_name,
              COALESCE((SELECT json_agg(json_build_object('service', sv.name, 'tooth', ti.tooth_number,
                                 'doctor', d.full_name, 'quantity', ti.quantity) ORDER BY ti.id)
                        FROM treatment_item ti
                        JOIN service sv ON sv.id = ti.service_id
                        JOIN staff d ON d.id = ti.performing_doctor_id
                        WHERE ti.record_id = r.id), '[]') AS items,
              COALESCE((SELECT json_agg(json_build_object('name', m.name, 'quantity', pi.quantity,
                                 'unit', m.unit, 'dosage', pi.dosage) ORDER BY pi.id)
                        FROM prescription_item pi JOIN medical_item m ON m.id = pi.item_id
                        WHERE pi.record_id = r.id), '[]') AS prescriptions
       FROM treatment_record r
       JOIN staff s ON s.id = r.doctor_id
       LEFT JOIN treatment_plan tp ON tp.id = r.treatment_plan_id
       WHERE r.patient_id = $1 ORDER BY r.visit_at DESC`,
      [id],
    ),
    query(
      `SELECT a.id, a.start_at, a.status, sv.name AS service_name, s.full_name AS doctor_name,
              ch.code AS chair_code, cr.name AS cancel_reason
       FROM appointment a
       JOIN service sv ON sv.id = a.service_id
       JOIN staff s ON s.id = a.doctor_id
       JOIN dental_chair ch ON ch.id = a.chair_id
       LEFT JOIN cancel_reason cr ON cr.id = a.cancel_reason_id
       WHERE a.patient_id = $1 ORDER BY a.start_at DESC`,
      [id],
    ),
    query('SELECT * FROM v_report_treatment_plan_progress WHERE patient_id = $1 ORDER BY start_date DESC', [id]),
    query('SELECT * FROM v_invoice_balance WHERE patient_id = $1 ORDER BY created_at DESC', [id]),
  ]);
  res.json({ records, appointments, plans, invoices });
});

// UC26: quản lý chạy tay việc lưu trữ (bình thường do job hằng ngày chạy)
r.post('/admin/archive-expired', allow(M), async (_req, res) => {
  const [row] = await query('SELECT fn_archive_expired_patients() AS archived');
  res.json(row);
});
