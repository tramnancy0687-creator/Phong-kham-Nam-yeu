// D. Thanh toán: UC15 lập hóa đơn (chốt giá), UC16 giảm giá (QĐ3), UC17 thu tiền,
// UC18 thu theo đợt liệu trình, UC19 xem công nợ
import { Router } from 'express';
import { query, tx } from '../db.js';
import { allow, ROLE } from '../auth.js';
import { HttpError, notFound, required } from '../errors.js';

const { R, M } = ROLE;
const r = Router();
export default r;

/** Khóa hóa đơn, kiểm tra còn hiệu lực; trả về dòng invoice */
async function lockIssuedInvoice(q, invoiceId) {
  const [inv] = await q('SELECT * FROM invoice WHERE id = $1 FOR UPDATE', [invoiceId]);
  notFound(inv, 'Hóa đơn');
  if (inv.status !== 'issued') throw new HttpError(409, 'Hóa đơn đã hủy');
  return inv;
}

/** Sau khi đổi giảm giá / xóa dòng: không được để số đã thu lớn hơn tổng tiền */
async function assertNotOverpaid(q, invoiceId) {
  const [b] = await q('SELECT debt_amount FROM v_invoice_balance WHERE invoice_id = $1', [invoiceId]);
  if (b.debt_amount < 0) {
    throw new HttpError(409, `Hóa đơn đã thu nhiều hơn tổng tiền mới (${(-b.debt_amount).toLocaleString('vi-VN')} đ)`);
  }
}

// UC19: danh sách hóa đơn + công nợ
r.get('/invoices', allow(R, M), async (req, res) => {
  res.json(await query(
    `SELECT b.*, c.phone,
            CASE WHEN i.treatment_plan_id IS NOT NULL THEN 'plan'
                 WHEN i.treatment_record_id IS NOT NULL THEN 'record' ELSE 'other' END AS kind
     FROM v_invoice_balance b
     JOIN invoice i ON i.id = b.invoice_id
     JOIN patient p ON p.id = b.patient_id
     JOIN contact c ON c.id = p.contact_id
     WHERE ($1::bigint IS NULL OR b.patient_id = $1)
       AND ($2::boolean IS NOT TRUE OR (b.status = 'issued' AND b.debt_amount > 0))
     ORDER BY b.created_at DESC
     LIMIT 300`,
    [req.query.patient_id || null, req.query.debt_only === 'true'],
  ));
});

// Phiếu điều trị còn việc chưa tính tiền (buổi trong liệu trình thu theo hóa đơn liệu trình)
r.get('/invoices/pending-records', allow(R, M), async (_req, res) => {
  res.json(await query(
    `SELECT r.id AS record_id, r.visit_at, p.id AS patient_id, p.full_name AS patient_name, c.phone,
            d.full_name AS doctor_name, count(ti.id)::int AS unbilled_items
     FROM treatment_record r
     JOIN patient p ON p.id = r.patient_id
     JOIN contact c ON c.id = p.contact_id
     JOIN staff d ON d.id = r.doctor_id
     JOIN treatment_item ti ON ti.record_id = r.id
     LEFT JOIN invoice_line il ON il.treatment_item_id = ti.id
     WHERE il.id IS NULL AND r.treatment_plan_id IS NULL
     GROUP BY r.id, p.id, c.phone, d.full_name
     ORDER BY r.visit_at DESC`,
  ));
});

r.get('/debts', allow(R, M), async (_req, res) => {
  res.json(await query('SELECT * FROM v_report_patient_debt ORDER BY total_debt DESC'));
});

// UC15: lập hóa đơn — từ phiếu điều trị, từ liệu trình, hoặc hóa đơn trống
r.post('/invoices', allow(R), async (req, res) => {
  const b = req.body;
  const id = await tx(req.user.id, async (q) => {
    if (b.treatment_record_id) {
      const [rec] = await q('SELECT patient_id, treatment_plan_id FROM treatment_record WHERE id = $1', [b.treatment_record_id]);
      notFound(rec, 'Phiếu điều trị');
      if (rec.treatment_plan_id) throw new HttpError(409, 'Buổi này thuộc liệu trình, thu tiền theo hóa đơn liệu trình');
      const [inv] = await q(
        'INSERT INTO invoice (patient_id, treatment_record_id, created_by, note) VALUES ($1, $2, $3, $4) RETURNING id',
        [rec.patient_id, b.treatment_record_id, req.user.id, b.note || null],
      );
      // Giá để trống → trigger tự lấy giá hiệu lực hôm nay và chốt lại
      const lines = await q(
        `INSERT INTO invoice_line (invoice_id, service_id, treatment_item_id, quantity)
         SELECT $1, ti.service_id, ti.id, ti.quantity
         FROM treatment_item ti LEFT JOIN invoice_line il ON il.treatment_item_id = ti.id
         WHERE ti.record_id = $2 AND il.id IS NULL ORDER BY ti.id
         RETURNING id`,
        [inv.id, b.treatment_record_id],
      );
      if (!lines.length) throw new HttpError(409, 'Phiếu này không còn việc nào chưa tính tiền');
      return inv.id;
    }

    if (b.treatment_plan_id) {
      required(b, ['service_id']);
      const [plan] = await q('SELECT * FROM treatment_plan WHERE id = $1', [b.treatment_plan_id]);
      notFound(plan, 'Liệu trình');
      const [dup] = await q("SELECT id FROM invoice WHERE treatment_plan_id = $1 AND status = 'issued'", [plan.id]);
      if (dup) throw new HttpError(409, `Liệu trình đã có hóa đơn #${dup.id}`);
      const [inv] = await q(
        'INSERT INTO invoice (patient_id, treatment_plan_id, created_by, note) VALUES ($1, $2, $3, $4) RETURNING id',
        [plan.patient_id, plan.id, req.user.id, b.note || null],
      );
      await q(
        `INSERT INTO invoice_line (invoice_id, service_id, performing_doctor_id, description, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [inv.id, b.service_id, plan.doctor_id, plan.name, plan.total_amount],
      );
      return inv.id;
    }

    required(b, ['patient_id']);
    const [inv] = await q('INSERT INTO invoice (patient_id, created_by, note) VALUES ($1, $2, $3) RETURNING id', [
      b.patient_id, req.user.id, b.note || null,
    ]);
    return inv.id;
  });
  res.status(201).json({ id });
});

r.get('/invoices/:id', allow(R, M), async (req, res) => {
  const id = req.params.id;
  const [inv] = await query(
    `SELECT b.*, i.treatment_record_id, i.treatment_plan_id, i.note, c.phone,
            cb.full_name AS created_by_name, tp.name AS plan_name
     FROM v_invoice_balance b
     JOIN invoice i ON i.id = b.invoice_id
     JOIN patient p ON p.id = b.patient_id
     JOIN contact c ON c.id = p.contact_id
     JOIN staff cb ON cb.id = i.created_by
     LEFT JOIN treatment_plan tp ON tp.id = i.treatment_plan_id
     WHERE b.invoice_id = $1`,
    [id],
  );
  notFound(inv, 'Hóa đơn');
  const [lines, payments, installments] = await Promise.all([
    query(
      `SELECT l.*, sv.code AS service_code, sv.name AS service_name, d.full_name AS doctor_name, ti.tooth_number
       FROM invoice_line l
       JOIN service sv ON sv.id = l.service_id
       LEFT JOIN staff d ON d.id = l.performing_doctor_id
       LEFT JOIN treatment_item ti ON ti.id = l.treatment_item_id
       WHERE l.invoice_id = $1 ORDER BY l.id`,
      [id],
    ),
    query(
      `SELECT pm.*, s.full_name AS received_by_name, ins.installment_no
       FROM payment pm JOIN staff s ON s.id = pm.received_by
       LEFT JOIN treatment_plan_installment ins ON ins.id = pm.installment_id
       WHERE pm.invoice_id = $1 ORDER BY pm.paid_at`,
      [id],
    ),
    inv.treatment_plan_id
      ? query(
        `SELECT ins.*, COALESCE((SELECT sum(amount) FROM payment WHERE installment_id = ins.id), 0) AS paid_amount
         FROM treatment_plan_installment ins WHERE ins.plan_id = $1 ORDER BY ins.installment_no`,
        [inv.treatment_plan_id],
      )
      : [],
  ]);
  res.json({ ...inv, lines, payments, installments });
});

r.post('/invoices/:id/lines', allow(R), async (req, res) => {
  const b = req.body;
  required(b, ['service_id']);
  const row = await tx(req.user.id, async (q) => {
    await lockIssuedInvoice(q, req.params.id);
    const [line] = await q(
      `INSERT INTO invoice_line (invoice_id, service_id, quantity, performing_doctor_id, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.params.id, b.service_id, b.quantity || 1, b.performing_doctor_id || null, b.description || null],
    );
    return line;
  });
  res.status(201).json(row);
});

r.delete('/invoice-lines/:id', allow(R), async (req, res) => {
  await tx(req.user.id, async (q) => {
    const [line] = await q('SELECT invoice_id FROM invoice_line WHERE id = $1', [req.params.id]);
    notFound(line, 'Dòng hóa đơn');
    await lockIssuedInvoice(q, line.invoice_id);
    await q('DELETE FROM invoice_line WHERE id = $1', [req.params.id]);
    await assertNotOverpaid(q, line.invoice_id);
  });
  res.status(204).end();
});

// UC16: giảm giá trên từng dòng (QĐ3)
r.put('/invoice-lines/:id/discount', allow(R), async (req, res) => {
  required(req.body, ['discount_amount']);
  await tx(req.user.id, async (q) => {
    const [line] = await q('SELECT invoice_id FROM invoice_line WHERE id = $1', [req.params.id]);
    notFound(line, 'Dòng hóa đơn');
    await lockIssuedInvoice(q, line.invoice_id);
    await q('UPDATE invoice_line SET discount_amount = $2 WHERE id = $1', [req.params.id, req.body.discount_amount]);
    await assertNotOverpaid(q, line.invoice_id);
  });
  res.json({ ok: true });
});

// UC16: giảm giá trên tổng → phân bổ theo tỷ lệ tiền các dòng (QĐ3)
r.post('/invoices/:id/discount', allow(R), async (req, res) => {
  required(req.body, ['total_discount']);
  await tx(req.user.id, async (q) => {
    await lockIssuedInvoice(q, req.params.id);
    await q('SELECT fn_allocate_invoice_discount($1, $2)', [req.params.id, req.body.total_discount]);
    await assertNotOverpaid(q, req.params.id);
  });
  res.json({ ok: true });
});

// UC17 / UC18: thu tiền (nhiều lần; tiền mặt / chuyển khoản; theo đợt liệu trình)
r.post('/invoices/:id/payments', allow(R), async (req, res) => {
  const b = req.body;
  required(b, ['amount', 'method']);
  const [row] = await query(
    `INSERT INTO payment (invoice_id, installment_id, amount, method, received_by, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.params.id, b.installment_id || null, b.amount, b.method, req.user.id, b.note || null],
  );
  res.status(201).json(row);
});

// Hủy hóa đơn chưa thu tiền: trả các việc điều trị về trạng thái chưa tính tiền
r.post('/invoices/:id/cancel', allow(R, M), async (req, res) => {
  await tx(req.user.id, async (q) => {
    await lockIssuedInvoice(q, req.params.id);
    const [paid] = await q('SELECT count(*)::int AS n FROM payment WHERE invoice_id = $1', [req.params.id]);
    if (paid.n) throw new HttpError(409, 'Hóa đơn đã có lần thu tiền, không hủy được');
    await q("UPDATE invoice SET status = 'cancelled', note = concat_ws(' | ', note, $2::text) WHERE id = $1", [
      req.params.id, req.body?.reason ? `Hủy: ${req.body.reason}` : null,
    ]);
    await q('UPDATE invoice_line SET treatment_item_id = NULL WHERE invoice_id = $1', [req.params.id]);
  });
  res.json({ ok: true });
});
