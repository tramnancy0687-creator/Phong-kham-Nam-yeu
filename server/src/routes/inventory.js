// E. Kho: UC24 quản lý thuốc / vật tư, nhập kho; UC25 cảnh báo dưới ngưỡng
import { Router } from 'express';
import { query, tx } from '../db.js';
import { allow, ROLE } from '../auth.js';
import { HttpError, notFound, required } from '../errors.js';

const { R, D, M } = ROLE;
const r = Router();
export default r;

r.get('/items', allow(R, D, M), async (req, res) => {
  res.json(await query(
    `SELECT m.*, (m.stock_quantity <= m.min_threshold) AS is_low
     FROM medical_item m
     WHERE ($1::text IS NULL OR m.item_type = $1) AND ($2::boolean IS NOT TRUE OR m.is_active)
     ORDER BY m.item_type, m.code`,
    [req.query.type || null, req.query.active === 'true'],
  ));
});

r.post('/items', allow(M), async (req, res) => {
  const b = req.body;
  required(b, ['code', 'name', 'item_type', 'unit']);
  const [row] = await query(
    `INSERT INTO medical_item (code, name, item_type, unit, min_threshold)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [b.code.trim().toUpperCase(), b.name.trim(), b.item_type, b.unit.trim(), b.min_threshold || 0],
  );
  res.status(201).json(row);
});

// Tồn kho chỉ thay đổi qua phiếu nhập / vật tư dùng, không sửa trực tiếp
r.put('/items/:id', allow(M), async (req, res) => {
  const b = req.body;
  const [row] = await query(
    `UPDATE medical_item
     SET name = COALESCE($2, name), unit = COALESCE($3, unit),
         min_threshold = COALESCE($4, min_threshold), is_active = COALESCE($5, is_active)
     WHERE id = $1 RETURNING *`,
    [req.params.id, b.name || null, b.unit || null, b.min_threshold ?? null, b.is_active ?? null],
  );
  res.json(notFound(row, 'Thuốc / vật tư'));
});

// UC25: cảnh báo đang mở (trigger tự tạo / tự đóng)
r.get('/alerts', allow(R, D, M), async (_req, res) => {
  res.json(await query(
    `SELECT a.*, m.code, m.name, m.unit, m.item_type, m.stock_quantity AS current_stock
     FROM stock_alert a JOIN medical_item m ON m.id = a.item_id
     WHERE a.resolved_at IS NULL ORDER BY a.created_at DESC`,
  ));
});

r.get('/receipts', allow(M), async (_req, res) => {
  res.json(await query(
    `SELECT sr.*, s.full_name AS received_by_name,
            count(ri.id)::int AS line_count, COALESCE(sum(ri.quantity * ri.unit_cost), 0) AS total_cost
     FROM stock_receipt sr
     JOIN staff s ON s.id = sr.received_by
     LEFT JOIN stock_receipt_item ri ON ri.receipt_id = sr.id
     GROUP BY sr.id, s.full_name ORDER BY sr.received_at DESC`,
  ));
});

r.get('/receipts/:id', allow(M), async (req, res) => {
  const [receipt] = await query(
    `SELECT sr.*, s.full_name AS received_by_name FROM stock_receipt sr
     JOIN staff s ON s.id = sr.received_by WHERE sr.id = $1`,
    [req.params.id],
  );
  notFound(receipt, 'Phiếu nhập');
  receipt.lines = await query(
    `SELECT ri.*, m.code, m.name, m.unit FROM stock_receipt_item ri
     JOIN medical_item m ON m.id = ri.item_id WHERE ri.receipt_id = $1 ORDER BY ri.id`,
    [req.params.id],
  );
  res.json(receipt);
});

// UC24: nhập kho — trigger tự cộng tồn và đóng cảnh báo nếu đủ ngưỡng
r.post('/receipts', allow(M), async (req, res) => {
  const b = req.body;
  const lines = (b.lines ?? []).filter((l) => l.item_id && Number(l.quantity) > 0);
  if (!lines.length) throw new HttpError(400, 'Phiếu nhập cần ít nhất một dòng có số lượng');
  const id = await tx(req.user.id, async (q) => {
    const [receipt] = await q(
      'INSERT INTO stock_receipt (received_by, supplier, note) VALUES ($1, $2, $3) RETURNING id',
      [req.user.id, b.supplier || null, b.note || null],
    );
    for (const l of lines) {
      await q(
        `INSERT INTO stock_receipt_item (receipt_id, item_id, quantity, unit_cost, expiry_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [receipt.id, l.item_id, l.quantity, l.unit_cost || 0, l.expiry_date || null],
      );
    }
    return receipt.id;
  });
  res.status(201).json({ id });
});
