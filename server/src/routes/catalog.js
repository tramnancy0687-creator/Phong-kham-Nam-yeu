// E. Danh mục: UC20 bảng giá, UC21 ca trực, UC22 ghế, UC23 nhân viên & phân quyền
import { Router } from 'express';
import { localDate, query, tx } from '../db.js';
import { allow, ROLE } from '../auth.js';
import { HttpError, notFound, required } from '../errors.js';

const { R, D, M } = ROLE;
const all = allow(R, D, M);
const r = Router();
export default r;

/** Tạo câu UPDATE từ các trường được phép */
function buildUpdate(table, id, body, fields) {
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (f in body) {
      params.push(body[f] === '' ? null : body[f]);
      sets.push(`${f} = $${params.length}`);
    }
  }
  if (!sets.length) throw new HttpError(400, 'Không có gì để cập nhật');
  params.push(id);
  return [`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params];
}

// ---------- UC22 Ghế ----------
r.get('/chairs', all, async (_req, res) => {
  res.json(await query('SELECT * FROM dental_chair ORDER BY code'));
});

r.post('/chairs', allow(M), async (req, res) => {
  required(req.body, ['code', 'name']);
  const [row] = await query('INSERT INTO dental_chair (code, name, note) VALUES ($1, $2, $3) RETURNING *', [
    req.body.code.trim(), req.body.name.trim(), req.body.note || null,
  ]);
  res.status(201).json(row);
});

r.put('/chairs/:id', allow(M), async (req, res) => {
  const [row] = await query(...buildUpdate('dental_chair', req.params.id, req.body, ['code', 'name', 'note', 'is_active']));
  res.json(notFound(row, 'Ghế'));
});

// ---------- UC20 Dịch vụ & bảng giá ----------
r.get('/services', all, async (_req, res) => {
  res.json(await query(
    `SELECT s.*,
            (SELECT sp.price FROM service_price sp
             WHERE sp.service_id = s.id AND sp.valid_from <= CURRENT_DATE
               AND (sp.valid_to IS NULL OR sp.valid_to > CURRENT_DATE)) AS current_price
     FROM service s ORDER BY s.code`,
  ));
});

r.post('/services', allow(M), async (req, res) => {
  required(req.body, ['code', 'name']);
  const b = req.body;
  const row = await tx(req.user.id, async (q) => {
    const [s] = await q('INSERT INTO service (code, name, description) VALUES ($1, $2, $3) RETURNING *', [
      b.code.trim().toUpperCase(), b.name.trim(), b.description || null,
    ]);
    if (b.price !== undefined && b.price !== '') {
      await q(
        'INSERT INTO service_price (service_id, price, valid_from, created_by) VALUES ($1, $2, $3, $4)',
        [s.id, b.price, b.valid_from || localDate(), req.user.id],
      );
    }
    return s;
  });
  res.status(201).json(row);
});

r.put('/services/:id', allow(M), async (req, res) => {
  const [row] = await query(...buildUpdate('service', req.params.id, req.body, ['name', 'description', 'is_active']));
  res.json(notFound(row, 'Dịch vụ'));
});

r.get('/services/:id/prices', all, async (req, res) => {
  res.json(await query(
    `SELECT sp.*, s.full_name AS created_by_name FROM service_price sp
     LEFT JOIN staff s ON s.id = sp.created_by
     WHERE sp.service_id = $1 ORDER BY sp.valid_from DESC`,
    [req.params.id],
  ));
});

// Giá mới từ ngày X: tự đóng giá đang mở (valid_to = X). Hóa đơn cũ giữ giá đã chốt
r.post('/services/:id/prices', allow(M), async (req, res) => {
  required(req.body, ['price', 'valid_from']);
  const row = await tx(req.user.id, async (q) => {
    await q(
      `UPDATE service_price SET valid_to = $2
       WHERE service_id = $1 AND valid_to IS NULL AND valid_from < $2`,
      [req.params.id, req.body.valid_from],
    );
    const [p] = await q(
      'INSERT INTO service_price (service_id, price, valid_from, valid_to, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, req.body.price, req.body.valid_from, req.body.valid_to || null, req.user.id],
    );
    return p;
  });
  res.status(201).json(row);
});

r.get('/cancel-reasons', all, async (_req, res) => {
  res.json(await query('SELECT * FROM cancel_reason ORDER BY id'));
});

// ---------- UC23 Nhân viên ----------
const STAFF_COLUMNS = 'id, full_name, role, username, phone, email, is_active, created_at';

r.get('/staff', allow(M), async (_req, res) => {
  res.json(await query(`SELECT ${STAFF_COLUMNS} FROM staff ORDER BY role, full_name`));
});

r.get('/doctors', all, async (_req, res) => {
  res.json(await query("SELECT id, full_name FROM staff WHERE role = 'doctor' AND is_active ORDER BY full_name"));
});

r.post('/staff', allow(M), async (req, res) => {
  const b = req.body;
  required(b, ['full_name', 'role', 'username', 'password']);
  if (b.password.length < 6) throw new HttpError(400, 'Mật khẩu tối thiểu 6 ký tự');
  const [row] = await query(
    `INSERT INTO staff (full_name, role, username, password_hash, phone, email)
     VALUES ($1, $2, $3, crypt($4, gen_salt('bf')), $5, $6) RETURNING ${STAFF_COLUMNS}`,
    [b.full_name, b.role, b.username.trim().toLowerCase(), b.password, b.phone || null, b.email || null],
  );
  res.status(201).json(row);
});

r.put('/staff/:id', allow(M), async (req, res) => {
  const b = req.body;
  if (Number(req.params.id) === req.user.id && (b.is_active === false || (b.role && b.role !== 'manager'))) {
    throw new HttpError(400, 'Không thể tự khóa hoặc tự bỏ quyền quản lý của chính mình');
  }
  const row = await tx(req.user.id, async (q) => {
    const fields = ['full_name', 'role', 'phone', 'email', 'is_active'].filter((f) => f in b);
    let updated;
    if (fields.length) {
      [updated] = await q(...buildUpdate('staff', req.params.id, b, fields));
      notFound(updated, 'Nhân viên');
    }
    if (b.password) {
      if (b.password.length < 6) throw new HttpError(400, 'Mật khẩu tối thiểu 6 ký tự');
      await q("UPDATE staff SET password_hash = crypt($2, gen_salt('bf')) WHERE id = $1", [req.params.id, b.password]);
    }
    const [s] = await q(`SELECT ${STAFF_COLUMNS} FROM staff WHERE id = $1`, [req.params.id]);
    return notFound(s, 'Nhân viên');
  });
  res.json(row);
});

// ---------- UC21 Ca trực ----------
r.get('/shifts', all, async (req, res) => {
  const { from, to, doctor_id: doctorId } = req.query;
  required({ from, to }, ['from', 'to']);
  res.json(await query(
    `SELECT sh.*, s.full_name AS doctor_name FROM doctor_shift sh JOIN staff s ON s.id = sh.doctor_id
     WHERE sh.shift_date BETWEEN $1 AND $2 AND ($3::bigint IS NULL OR sh.doctor_id = $3)
     ORDER BY sh.shift_date, sh.start_time, s.full_name`,
    [from, to, doctorId || null],
  ));
});

// Tạo hàng loạt: từ ngày – đến ngày, các thứ trong tuần (1 = Thứ 2 … 7 = Chủ nhật)
r.post('/shifts', allow(M), async (req, res) => {
  const b = req.body;
  required(b, ['doctor_id', 'from', 'to', 'start_time', 'end_time']);
  const weekdays = Array.isArray(b.weekdays) && b.weekdays.length ? b.weekdays.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  const rows = await query(
    `INSERT INTO doctor_shift (doctor_id, shift_date, start_time, end_time)
     SELECT $1, d::date, $4, $5
     FROM generate_series($2::date, $3::date, INTERVAL '1 day') d
     WHERE EXTRACT(ISODOW FROM d) = ANY($6::int[])
     RETURNING id`,
    [b.doctor_id, b.from, b.to, b.start_time, b.end_time, weekdays],
  );
  res.status(201).json({ created: rows.length });
});

r.delete('/shifts/:id', allow(M), async (req, res) => {
  await tx(req.user.id, async (q) => {
    const [sh] = await q('SELECT * FROM doctor_shift WHERE id = $1 FOR UPDATE', [req.params.id]);
    notFound(sh, 'Ca trực');
    const [busy] = await q(
      `SELECT count(*)::int AS n FROM appointment
       WHERE doctor_id = $1 AND status = 'scheduled'
         AND start_at >= $2::date + $3::time AND start_at < $2::date + $4::time`,
      [sh.doctor_id, sh.shift_date, sh.start_time, sh.end_time],
    );
    if (busy.n) throw new HttpError(409, `Ca này còn ${busy.n} lịch hẹn, hãy đổi / hủy lịch trước khi xóa ca`);
    await q('DELETE FROM doctor_shift WHERE id = $1', [req.params.id]);
  });
  res.status(204).end();
});
