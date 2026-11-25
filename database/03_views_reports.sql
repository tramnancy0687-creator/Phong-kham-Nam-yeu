-- Phòng khám Nấm yêu — view tra cứu & 8 báo cáo của quản lý (UC19, UC27.1–UC27.8)
-- Chạy sau 02_functions_triggers.sql

-- UC01: tìm bệnh nhân theo SĐT (một SĐT ra nhiều bệnh nhân)
CREATE VIEW v_patient_lookup AS
SELECT c.phone, c.full_name AS contact_name, p.id AS patient_id, p.full_name AS patient_name,
       p.relationship, p.date_of_birth, p.gender, p.archived_at
FROM patient p
JOIN contact c ON c.id = p.contact_id;
COMMENT ON VIEW v_patient_lookup IS 'UC01: SELECT * FROM v_patient_lookup WHERE phone = ''0901234567''';

-- UC19: công nợ từng hóa đơn
CREATE VIEW v_invoice_balance AS
SELECT i.id AS invoice_id, i.patient_id, p.full_name AS patient_name, i.status, i.created_at,
       COALESCE(l.gross, 0)                       AS gross_amount,
       COALESCE(l.discount, 0)                    AS discount_amount,
       COALESCE(l.total, 0)                       AS total_amount,
       COALESCE(pm.paid, 0)                       AS paid_amount,
       COALESCE(l.total, 0) - COALESCE(pm.paid, 0) AS debt_amount
FROM invoice i
JOIN patient p ON p.id = i.patient_id
LEFT JOIN (SELECT invoice_id, sum(quantity * unit_price) AS gross,
                  sum(discount_amount) AS discount, sum(line_total) AS total
           FROM invoice_line GROUP BY invoice_id) l ON l.invoice_id = i.id
LEFT JOIN (SELECT invoice_id, sum(amount) AS paid
           FROM payment GROUP BY invoice_id) pm ON pm.invoice_id = i.id;
COMMENT ON VIEW v_invoice_balance IS 'UC19: tổng tiền, đã thu, còn nợ của từng hóa đơn';

-- UC27.1: doanh thu từng bác sĩ theo tháng (theo bác sĩ thực hiện từng dòng — QĐ1)
CREATE VIEW v_report_doctor_revenue_monthly AS
SELECT date_trunc('month', i.created_at)::date AS month,
       s.id AS doctor_id, s.full_name AS doctor_name,
       sum(l.line_total) AS revenue
FROM invoice_line l
JOIN invoice i ON i.id = l.invoice_id AND i.status = 'issued'
JOIN staff s   ON s.id = l.performing_doctor_id
GROUP BY 1, s.id, s.full_name;
COMMENT ON VIEW v_report_doctor_revenue_monthly IS 'UC27.1: doanh thu từng bác sĩ trong tháng';

-- UC27.2: ghế trống theo khung giờ trong khoảng ngày
CREATE OR REPLACE FUNCTION fn_report_chair_free_slots(
    p_from  date,
    p_to    date,
    p_open  time DEFAULT '08:00',
    p_close time DEFAULT '20:00'
)
RETURNS TABLE (chair_id bigint, chair_code varchar, slot_start time,
               total_slots bigint, booked_slots bigint, free_slots bigint)
LANGUAGE sql STABLE AS $$
    WITH slots AS (
        SELECT g::time AS slot
        FROM generate_series(TIMESTAMP '2000-01-01' + p_open,
                             TIMESTAMP '2000-01-01' + p_close - INTERVAL '30 minutes',
                             INTERVAL '30 minutes') g
    ), days AS (
        SELECT g::date AS day FROM generate_series(p_from, p_to, INTERVAL '1 day') g
    )
    SELECT c.id, c.code, s.slot,
           count(*), count(a.id), count(*) - count(a.id)
    FROM dental_chair c
    CROSS JOIN slots s
    CROSS JOIN days d
    LEFT JOIN appointment a
           ON a.chair_id = c.id AND a.status <> 'cancelled' AND a.start_at = d.day + s.slot
    WHERE c.is_active
    GROUP BY c.id, c.code, s.slot
    ORDER BY 6 DESC, 2, 3
$$;
COMMENT ON FUNCTION fn_report_chair_free_slots IS
    'UC27.2: SELECT * FROM fn_report_chair_free_slots(''2026-11-01'', ''2026-11-30'')';

-- UC27.3: bệnh nhân quá 6 tháng chưa quay lại
CREATE VIEW v_report_inactive_patients AS
SELECT p.id AS patient_id, p.full_name AS patient_name, c.phone,
       max(r.visit_at) AS last_visit_at
FROM patient p
JOIN contact c          ON c.id = p.contact_id
JOIN treatment_record r ON r.patient_id = p.id
WHERE p.archived_at IS NULL
GROUP BY p.id, p.full_name, c.phone
HAVING max(r.visit_at) < LOCALTIMESTAMP - INTERVAL '6 months';
COMMENT ON VIEW v_report_inactive_patients IS 'UC27.3: bệnh nhân quá 6 tháng chưa quay lại';

-- UC27.4: dịch vụ hay bị hủy lịch nhất, vì lý do gì
CREATE VIEW v_report_cancellations AS
SELECT sv.id AS service_id, sv.name AS service_name, cr.name AS reason,
       count(*) AS cancelled_count
FROM appointment a
JOIN service sv       ON sv.id = a.service_id
JOIN cancel_reason cr ON cr.id = a.cancel_reason_id
WHERE a.status = 'cancelled'
GROUP BY sv.id, sv.name, cr.name;
COMMENT ON VIEW v_report_cancellations IS 'UC27.4: số lịch hủy theo dịch vụ và lý do';

-- UC27.5: tổng tiền khách còn nợ, theo từng người
CREATE VIEW v_report_patient_debt AS
SELECT b.patient_id, b.patient_name, c.phone,
       count(*)           AS unpaid_invoices,
       sum(b.debt_amount) AS total_debt
FROM v_invoice_balance b
JOIN patient p ON p.id = b.patient_id
JOIN contact c ON c.id = p.contact_id
WHERE b.status = 'issued' AND b.debt_amount > 0
GROUP BY b.patient_id, b.patient_name, c.phone;
COMMENT ON VIEW v_report_patient_debt IS 'UC27.5: công nợ theo bệnh nhân';

-- UC14 / UC27.6: tiến độ liệu trình
CREATE VIEW v_report_treatment_plan_progress AS
SELECT tp.id AS plan_id, tp.name AS plan_name, tp.status,
       p.id AS patient_id, p.full_name AS patient_name,
       s.full_name AS doctor_name,
       tp.total_sessions,
       count(r.id)                                  AS done_sessions,
       GREATEST(tp.total_sessions - count(r.id), 0) AS remaining_sessions,
       tp.start_date
FROM treatment_plan tp
JOIN patient p ON p.id = tp.patient_id
JOIN staff s   ON s.id = tp.doctor_id
LEFT JOIN treatment_record r ON r.treatment_plan_id = tp.id
GROUP BY tp.id, p.id, s.full_name;
COMMENT ON VIEW v_report_treatment_plan_progress IS
    'UC14, UC27.6: liệu trình còn mấy buổi. Liệu trình đang dở: WHERE status = ''in_progress''';

-- UC27.7: thuốc / vật tư sắp hết
CREATE VIEW v_report_low_stock AS
SELECT id AS item_id, code, name, item_type, unit, stock_quantity, min_threshold,
       min_threshold - stock_quantity AS shortage
FROM medical_item
WHERE is_active AND stock_quantity <= min_threshold;
COMMENT ON VIEW v_report_low_stock IS 'UC27.7: thuốc / vật tư tồn kho <= ngưỡng';

-- UC27.8: doanh thu (tiền thực thu) theo tháng, % so với tháng trước
CREATE VIEW v_report_monthly_revenue AS
WITH m AS (
    SELECT date_trunc('month', paid_at)::date AS month, sum(amount) AS revenue
    FROM payment GROUP BY 1
)
SELECT cur.month, cur.revenue,
       prev.revenue AS prev_month_revenue,
       round((cur.revenue - prev.revenue) * 100 / NULLIF(prev.revenue, 0), 2) AS change_percent
FROM m cur
LEFT JOIN m prev ON prev.month = (cur.month - INTERVAL '1 month')::date;
COMMENT ON VIEW v_report_monthly_revenue IS 'UC27.8: doanh thu tháng và % tăng/giảm so với tháng trước';
