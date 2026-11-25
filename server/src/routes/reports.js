// F. Báo cáo (UC27.1 – UC27.8) và số liệu trang tổng quan
import { Router } from 'express';
import { localDate, query } from '../db.js';
import { allow, ROLE } from '../auth.js';

const { R, D, M } = ROLE;
const r = Router();
export default r;
const manager = allow(M);

// UC27.1
r.get('/reports/doctor-revenue', manager, async (_req, res) => {
  res.json(await query('SELECT * FROM v_report_doctor_revenue_monthly ORDER BY month DESC, revenue DESC'));
});

// UC27.2
r.get('/reports/chair-free', manager, async (req, res) => {
  const today = localDate();
  const { from = today, to = today, open = '08:00', close = '20:00' } = req.query;
  res.json(await query('SELECT * FROM fn_report_chair_free_slots($1, $2, $3, $4)', [from, to, open, close]));
});

// UC27.3
r.get('/reports/inactive-patients', manager, async (_req, res) => {
  res.json(await query('SELECT * FROM v_report_inactive_patients ORDER BY last_visit_at'));
});

// UC27.4
r.get('/reports/cancellations', manager, async (_req, res) => {
  res.json(await query('SELECT * FROM v_report_cancellations ORDER BY cancelled_count DESC, service_name'));
});

// UC27.5
r.get('/reports/debts', manager, async (_req, res) => {
  res.json(await query('SELECT * FROM v_report_patient_debt ORDER BY total_debt DESC'));
});

// UC27.6
r.get('/reports/plans-in-progress', manager, async (_req, res) => {
  res.json(await query(
    "SELECT * FROM v_report_treatment_plan_progress WHERE status = 'in_progress' ORDER BY remaining_sessions DESC",
  ));
});

// UC27.7
r.get('/reports/low-stock', manager, async (_req, res) => {
  res.json(await query('SELECT * FROM v_report_low_stock ORDER BY shortage DESC'));
});

// UC27.8
r.get('/reports/monthly-revenue', manager, async (_req, res) => {
  res.json(await query('SELECT * FROM v_report_monthly_revenue ORDER BY month DESC'));
});

// Trang tổng quan: số liệu theo vai trò
r.get('/dashboard', allow(R, D, M), async (req, res) => {
  const doctorId = req.user.role === D ? req.user.id : null;
  const canSeeMoney = req.user.role !== D;
  const [[counts], alerts, [plans], today] = await Promise.all([
    query(
      `SELECT count(*) FILTER (WHERE status <> 'cancelled')::int AS total,
              count(*) FILTER (WHERE status = 'scheduled')::int AS waiting,
              count(*) FILTER (WHERE status = 'completed')::int AS done,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
       FROM appointment
       WHERE start_at >= CURRENT_DATE AND start_at < CURRENT_DATE + 1 AND ($1::bigint IS NULL OR doctor_id = $1)`,
      [doctorId],
    ),
    query(
      `SELECT m.name, m.unit, m.stock_quantity, m.min_threshold FROM stock_alert a
       JOIN medical_item m ON m.id = a.item_id WHERE a.resolved_at IS NULL ORDER BY m.name`,
    ),
    query(
      `SELECT count(*)::int AS n FROM treatment_plan
       WHERE status = 'in_progress' AND ($1::bigint IS NULL OR doctor_id = $1)`,
      [doctorId],
    ),
    query(
      `SELECT a.id, a.start_at, a.status, p.full_name AS patient_name, d.full_name AS doctor_name,
              ch.code AS chair_code, sv.name AS service_name, r.id AS record_id
       FROM appointment a
       JOIN patient p ON p.id = a.patient_id
       JOIN staff d ON d.id = a.doctor_id
       JOIN dental_chair ch ON ch.id = a.chair_id
       JOIN service sv ON sv.id = a.service_id
       LEFT JOIN treatment_record r ON r.appointment_id = a.id
       WHERE a.start_at >= CURRENT_DATE AND a.start_at < CURRENT_DATE + 1
         AND a.status <> 'cancelled' AND ($1::bigint IS NULL OR a.doctor_id = $1)
       ORDER BY a.start_at, ch.code`,
      [doctorId],
    ),
  ]);
  const result = { appointments: counts, alerts, plans_in_progress: plans.n, today };
  if (canSeeMoney) {
    const [[money]] = await Promise.all([
      query(
        `SELECT
           (SELECT COALESCE(sum(amount), 0) FROM payment WHERE paid_at >= CURRENT_DATE AND paid_at < CURRENT_DATE + 1) AS revenue_today,
           (SELECT COALESCE(sum(amount), 0) FROM payment WHERE paid_at >= date_trunc('month', now())) AS revenue_month,
           (SELECT COALESCE(sum(total_debt), 0) FROM v_report_patient_debt) AS total_debt`,
      ),
    ]);
    Object.assign(result, money);
  }
  res.json(result);
});
