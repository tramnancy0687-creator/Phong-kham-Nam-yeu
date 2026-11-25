-- Phòng khám Nấm yêu — dữ liệu mẫu
-- Chạy sau 03_views_reports.sql, MỘT lần, trên database trống:
--   psql -U tramadmin -d phong_kham_nam_yeu -1 -v ON_ERROR_STOP=1 -f 04_seed_data.sql
-- Mật khẩu đăng nhập của mọi nhân viên mẫu: 123456 (lưu dạng bcrypt)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- Nhân viên
-- =====================================================================
INSERT INTO staff (full_name, role, username, password_hash, phone, email) VALUES
('Nguyễn Thị Lan', 'receptionist', 'letan.lan',  crypt('123456', gen_salt('bf')), '0911000001', 'lan@example.com'),
('Trần Văn Hùng',  'receptionist', 'letan.hung', crypt('123456', gen_salt('bf')), '0911000002', 'hung@example.com'),
('Lê Quang Minh',  'doctor',       'bs.minh',    crypt('123456', gen_salt('bf')), '0911000003', 'minh@example.com'),
('Phạm Thu Hoa',   'doctor',       'bs.hoa',     crypt('123456', gen_salt('bf')), '0911000004', 'hoa@example.com'),
('Võ Đăng Khoa',   'doctor',       'bs.khoa',    crypt('123456', gen_salt('bf')), '0911000005', 'khoa@example.com'),
('Đỗ Minh Tâm',    'manager',      'ql.tam',     crypt('123456', gen_salt('bf')), '0911000006', 'tam@example.com');

-- =====================================================================
-- Ghế, ca trực
-- =====================================================================
INSERT INTO dental_chair (code, name) VALUES
('G1', 'Ghế 1 — phòng điều trị chung'),
('G2', 'Ghế 2 — phòng điều trị chung'),
('G3', 'Ghế 3 — phòng tiểu phẫu');

-- Thứ 2–6: BS Minh, BS Hoa trực sáng + chiều; BS Khoa trực chiều tối
INSERT INTO doctor_shift (doctor_id, shift_date, start_time, end_time)
SELECT s.id, d::date, v.st, v.et
FROM generate_series(DATE '2026-09-01', DATE '2026-12-31', INTERVAL '1 day') d
CROSS JOIN (VALUES
    ('bs.minh', TIME '08:00', TIME '12:00'), ('bs.minh', '13:30', '17:30'),
    ('bs.hoa',  '08:00', '12:00'),           ('bs.hoa',  '13:30', '17:30'),
    ('bs.khoa', '13:30', '20:00')
) v(username, st, et)
JOIN staff s ON s.username = v.username
WHERE EXTRACT(ISODOW FROM d) <= 5;

INSERT INTO doctor_shift (doctor_id, shift_date, start_time, end_time)
SELECT id, DATE '2026-03-10', TIME '08:00', TIME '12:00' FROM staff WHERE username = 'bs.minh';

-- =====================================================================
-- Dịch vụ & bảng giá (giá trám răng tăng từ 01/11/2026)
-- =====================================================================
INSERT INTO service (code, name, description) VALUES
('KHAM',        'Khám tổng quát',              'Khám, tư vấn, chụp phim nếu cần'),
('CAOVOI',      'Cạo vôi răng',                'Cạo vôi, đánh bóng toàn hàm'),
('TRAM',        'Trám răng composite',         'Trám một răng'),
('NHORANG',     'Nhổ răng thường',             'Nhổ răng sữa hoặc răng thường'),
('NHORANGKHON', 'Nhổ răng khôn',               'Tiểu phẫu nhổ răng khôn'),
('DIEUTRITUY',  'Điều trị tủy',                'Lấy tủy, trám bít ống tủy một răng'),
('TAYTRANG',    'Tẩy trắng răng',              'Tẩy trắng tại phòng khám'),
('NIENG',       'Niềng răng mắc cài kim loại', 'Trọn gói liệu trình 24 buổi'),
('SIETNIENG',   'Siết niềng định kỳ',          'Buổi tái khám trong liệu trình niềng (đã gồm trong gói)');

INSERT INTO service_price (service_id, price, valid_from, valid_to, created_by)
SELECT s.id, v.price, v.f, v.t, (SELECT id FROM staff WHERE username = 'ql.tam')
FROM (VALUES
    ('KHAM',          100000, DATE '2025-01-01', NULL::date),
    ('CAOVOI',        300000, '2025-01-01', NULL),
    ('TRAM',          400000, '2025-01-01', '2026-11-01'),
    ('TRAM',          450000, '2026-11-01', NULL),
    ('NHORANG',       500000, '2025-01-01', NULL),
    ('NHORANGKHON',  1500000, '2025-01-01', NULL),
    ('DIEUTRITUY',   1200000, '2025-01-01', NULL),
    ('TAYTRANG',     2500000, '2025-01-01', NULL),
    ('NIENG',       30000000, '2025-01-01', NULL),
    ('SIETNIENG',          0, '2025-01-01', NULL)
) v(code, price, f, t)
JOIN service s ON s.code = v.code;

-- =====================================================================
-- Người liên hệ & bệnh nhân (SĐT 0901234567 dùng chung cho mẹ và 2 con — QĐ2)
-- =====================================================================
INSERT INTO contact (full_name, phone) VALUES
('Nguyễn Thị Mai',  '0901234567'),
('Trần Quốc Bảo',   '0912345678'),
('Lê Thị Hạnh',     '0987654321'),
('Phạm Văn Đức',    '0934567890'),
('Hoàng Minh Châu', '0978123456'),
('Vũ Thị Thu',      '0965432187'),
('Đặng Gia Huy',    '0909888777');

INSERT INTO patient (contact_id, relationship, full_name, date_of_birth, gender, address, medical_history)
SELECT c.id, v.rel, v.name, v.dob, v.gender, v.addr, v.hist
FROM (VALUES
    ('0901234567', 'self',   'Nguyễn Thị Mai',  DATE '1988-04-12', 'female', '12 Lê Lợi, Q.1, TP.HCM',            NULL),
    ('0901234567', 'mother', 'Trần Bảo Na',     '2017-06-12',      'female', '12 Lê Lợi, Q.1, TP.HCM',            NULL),
    ('0901234567', 'mother', 'Trần Gia Bin',    '2019-09-03',      'male',   '12 Lê Lợi, Q.1, TP.HCM',            'Dị ứng penicillin'),
    ('0912345678', 'self',   'Trần Quốc Bảo',   '1995-11-20',      'male',   '45 Nguyễn Trãi, Q.5, TP.HCM',       NULL),
    ('0987654321', 'self',   'Lê Thị Hạnh',     '1979-02-28',      'female', '8 Hai Bà Trưng, Q.3, TP.HCM',       'Tiểu đường type 2'),
    ('0934567890', 'self',   'Phạm Văn Đức',    '1965-07-07',      'male',   '102 CMT8, Q.10, TP.HCM',            'Cao huyết áp'),
    ('0978123456', 'self',   'Hoàng Minh Châu', '2002-01-15',      'female', '23 Võ Văn Tần, Q.3, TP.HCM',        NULL),
    ('0965432187', 'self',   'Vũ Thị Thu',      '1990-10-10',      'female', '77 Điện Biên Phủ, Bình Thạnh',      NULL),
    ('0909888777', 'self',   'Đặng Gia Huy',    '1999-05-25',      'male',   '5 Phan Xích Long, Phú Nhuận',       NULL)
) v(phone, rel, name, dob, gender, addr, hist)
JOIN contact c ON c.phone = v.phone;

-- =====================================================================
-- Thuốc / vật tư & nhập kho đầu kỳ
-- =====================================================================
INSERT INTO medical_item (code, name, item_type, unit, min_threshold) VALUES
('VT-GANG',      'Găng tay y tế',          'supply',   'đôi',  100),
('VT-KHAUTRANG', 'Khẩu trang y tế',        'supply',   'cái',  100),
('VT-COMPOSITE', 'Composite trám răng',    'supply',   'tuýp', 3),
('VT-THUOCTE',   'Thuốc tê Lidocaine 2%',  'supply',   'ống',  20),
('VT-MACCAI',    'Bộ mắc cài kim loại',    'supply',   'bộ',   2),
('TH-AMOX',      'Amoxicillin 500mg',      'medicine', 'viên', 100),
('TH-PARA',      'Paracetamol 500mg',      'medicine', 'viên', 100),
('TH-IBU',       'Ibuprofen 400mg',        'medicine', 'viên', 50);

WITH r AS (
    INSERT INTO stock_receipt (received_at, received_by, supplier, note)
    VALUES ('2026-01-05 10:00+07', (SELECT id FROM staff WHERE username = 'ql.tam'),
            'Nhà cung cấp vật tư nha khoa (mẫu)', 'Nhập đầu kỳ')
    RETURNING id
)
INSERT INTO stock_receipt_item (receipt_id, item_id, quantity, unit_cost, expiry_date)
SELECT r.id, m.id, v.qty, v.cost, v.exp
FROM r
CROSS JOIN (VALUES
    ('VT-GANG',      500,   3000, DATE '2028-01-01'),
    ('VT-KHAUTRANG', 300,   1000, '2028-01-01'),
    ('VT-COMPOSITE',   5, 350000, '2027-06-01'),
    ('VT-THUOCTE',    25,  15000, '2027-03-01'),
    ('VT-MACCAI',      3, 2500000, NULL),
    ('TH-AMOX',      300,   1500, '2027-12-01'),
    ('TH-PARA',       80,    500, '2027-12-01'),
    ('TH-IBU',       200,   1200, '2027-12-01')
) v(code, qty, cost, exp)
JOIN medical_item m ON m.code = v.code;

-- =====================================================================
-- Liệu trình niềng răng của Hoàng Minh Châu (24 buổi, 3 đợt thanh toán)
-- =====================================================================
DO $$
DECLARE
    v_pat  bigint := (SELECT id FROM patient WHERE full_name = 'Hoàng Minh Châu');
    v_doc  bigint := (SELECT id FROM staff   WHERE username  = 'bs.hoa');
    v_lt   bigint := (SELECT id FROM staff   WHERE username  = 'letan.lan');
    v_plan bigint;
    v_inv  bigint;
BEGIN
    INSERT INTO treatment_plan (patient_id, doctor_id, name, total_sessions, total_amount, start_date, note)
    VALUES (v_pat, v_doc, 'Niềng răng mắc cài kim loại 24 tháng', 24, 30000000, '2026-10-05', 'Chia 3 đợt thanh toán')
    RETURNING id INTO v_plan;

    INSERT INTO treatment_plan_installment (plan_id, installment_no, amount, due_date) VALUES
    (v_plan, 1, 10000000, '2026-10-05'),
    (v_plan, 2, 10000000, '2027-01-05'),
    (v_plan, 3, 10000000, '2027-04-05');

    INSERT INTO invoice (patient_id, treatment_plan_id, created_by, created_at, note)
    VALUES (v_pat, v_plan, v_lt, '2026-10-05 09:30+07', 'Hóa đơn trọn gói niềng răng')
    RETURNING id INTO v_inv;

    INSERT INTO invoice_line (invoice_id, service_id, performing_doctor_id)
    VALUES (v_inv, (SELECT id FROM service WHERE code = 'NIENG'), v_doc);

    INSERT INTO payment (invoice_id, installment_id, amount, method, received_by, paid_at)
    VALUES (v_inv, (SELECT id FROM treatment_plan_installment WHERE plan_id = v_plan AND installment_no = 1),
            10000000, 'transfer', v_lt, '2026-10-05 09:35+07');
END $$;

-- =====================================================================
-- Hàm tạm: tạo một lần khám hoàn chỉnh
-- (lịch hẹn → phiếu điều trị → việc làm → vật tư → đơn thuốc → hóa đơn → thu tiền)
-- =====================================================================
CREATE FUNCTION pg_temp.make_visit(
    p_patient   text,
    p_doctor    text,
    p_chair     text,
    p_start     timestamp,
    p_diagnosis text,
    p_items     jsonb,                     -- [{"svc":"TRAM","tooth":36,"doctor":"bs.hoa"}]
    p_supplies  jsonb   DEFAULT '[]',      -- [{"item":"VT-GANG","qty":1}]
    p_rx        jsonb   DEFAULT '[]',      -- [{"item":"TH-AMOX","qty":15,"dosage":"..."}]
    p_pay       numeric DEFAULT NULL,      -- NULL = trả đủ, 0 = chưa trả
    p_method    text    DEFAULT 'cash',
    p_discount  numeric DEFAULT 0,         -- giảm ở tổng, phân bổ theo QĐ3
    p_plan      text    DEFAULT NULL       -- tên liệu trình (buổi trong liệu trình không lập hóa đơn riêng)
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_pat    bigint := (SELECT id FROM patient WHERE full_name = p_patient);
    v_doc    bigint := (SELECT id FROM staff   WHERE username  = p_doctor);
    v_lt     bigint := (SELECT id FROM staff   WHERE username  = 'letan.lan');
    v_plan   bigint := (SELECT id FROM treatment_plan WHERE name = p_plan AND patient_id = v_pat);
    v_billed timestamptz := (p_start + INTERVAL '45 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_appt   bigint;
    v_rec    bigint;
    v_inv    bigint;
    v_item   bigint;
    v_total  numeric;
    it       jsonb;
BEGIN
    INSERT INTO appointment (patient_id, doctor_id, chair_id, service_id, start_at, status, created_by, created_at)
    VALUES (v_pat, v_doc, (SELECT id FROM dental_chair WHERE code = p_chair),
            (SELECT id FROM service WHERE code = p_items -> 0 ->> 'svc'),
            p_start, 'completed', v_lt, (p_start - INTERVAL '3 days') AT TIME ZONE 'Asia/Ho_Chi_Minh')
    RETURNING id INTO v_appt;

    INSERT INTO treatment_record (patient_id, appointment_id, treatment_plan_id, doctor_id, visit_at, diagnosis)
    VALUES (v_pat, v_appt, v_plan, v_doc, p_start, p_diagnosis)
    RETURNING id INTO v_rec;

    IF v_plan IS NULL THEN
        INSERT INTO invoice (patient_id, treatment_record_id, created_by, created_at)
        VALUES (v_pat, v_rec, v_lt, v_billed)
        RETURNING id INTO v_inv;
    END IF;

    FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO treatment_item (record_id, service_id, performing_doctor_id, tooth_number)
        VALUES (v_rec, (SELECT id FROM service WHERE code = it ->> 'svc'),
                (SELECT id FROM staff WHERE username = COALESCE(it ->> 'doctor', p_doctor)),
                (it ->> 'tooth')::smallint)
        RETURNING id INTO v_item;

        IF v_inv IS NOT NULL THEN
            INSERT INTO invoice_line (invoice_id, service_id, treatment_item_id)
            VALUES (v_inv, (SELECT id FROM service WHERE code = it ->> 'svc'), v_item);
        END IF;
    END LOOP;

    INSERT INTO supply_usage (record_id, item_id, quantity)
    SELECT v_rec, m.id, (s ->> 'qty')::numeric
    FROM jsonb_array_elements(p_supplies) s JOIN medical_item m ON m.code = s ->> 'item';

    INSERT INTO prescription_item (record_id, item_id, quantity, dosage)
    SELECT v_rec, m.id, (r ->> 'qty')::numeric, r ->> 'dosage'
    FROM jsonb_array_elements(p_rx) r JOIN medical_item m ON m.code = r ->> 'item';

    IF v_inv IS NULL THEN
        RETURN;
    END IF;
    IF p_discount > 0 THEN
        PERFORM fn_allocate_invoice_discount(v_inv, p_discount);
    END IF;

    SELECT total_amount INTO v_total FROM v_invoice_balance WHERE invoice_id = v_inv;
    IF COALESCE(p_pay, v_total) > 0 THEN
        INSERT INTO payment (invoice_id, amount, method, received_by, paid_at)
        VALUES (v_inv, COALESCE(p_pay, v_total), p_method, v_lt, v_billed + INTERVAL '5 minutes');
    END IF;
END $$;

-- =====================================================================
-- Các lần khám đã hoàn thành
-- =====================================================================

-- Tháng 3: Phạm Văn Đức — sau đó không quay lại (báo cáo UC27.3)
SELECT pg_temp.make_visit('Phạm Văn Đức', 'bs.minh', 'G1', '2026-03-10 09:00', 'Vôi răng nhiều, viêm nướu nhẹ',
    '[{"svc":"KHAM"},{"svc":"CAOVOI"}]',
    '[{"item":"VT-GANG","qty":1},{"item":"VT-KHAUTRANG","qty":1}]');

-- Tháng 10
SELECT pg_temp.make_visit('Nguyễn Thị Mai', 'bs.minh', 'G1', '2026-10-02 09:00', 'Khám định kỳ, vôi răng',
    '[{"svc":"KHAM"},{"svc":"CAOVOI"}]',
    '[{"item":"VT-GANG","qty":1},{"item":"VT-KHAUTRANG","qty":1}]');

SELECT pg_temp.make_visit('Trần Bảo Na', 'bs.hoa', 'G2', '2026-10-02 09:00', 'Sâu răng sữa 74',
    '[{"svc":"KHAM"},{"svc":"TRAM","tooth":74}]',
    '[{"item":"VT-GANG","qty":1},{"item":"VT-COMPOSITE","qty":0.5}]',
    p_method => 'transfer');

SELECT pg_temp.make_visit('Hoàng Minh Châu', 'bs.hoa', 'G1', '2026-10-05 08:30', 'Răng khấp khểnh, khớp cắn sâu — gắn mắc cài',
    '[{"svc":"NIENG"}]',
    '[{"item":"VT-MACCAI","qty":1},{"item":"VT-GANG","qty":2}]',
    p_plan => 'Niềng răng mắc cài kim loại 24 tháng');

SELECT pg_temp.make_visit('Trần Quốc Bảo', 'bs.khoa', 'G3', '2026-10-09 14:00', 'Răng khôn 38 mọc lệch',
    '[{"svc":"KHAM"},{"svc":"NHORANGKHON","tooth":38}]',
    '[{"item":"VT-GANG","qty":2},{"item":"VT-THUOCTE","qty":2}]',
    '[{"item":"TH-AMOX","qty":15,"dosage":"Ngày 3 lần, mỗi lần 1 viên sau ăn, trong 5 ngày"},
      {"item":"TH-PARA","qty":10,"dosage":"Uống 1 viên khi đau, cách nhau ít nhất 6 giờ"}]');

-- Hai bác sĩ cùng làm một buổi: BS Minh điều trị tủy, BS Hoa trám (QĐ1)
SELECT pg_temp.make_visit('Lê Thị Hạnh', 'bs.minh', 'G2', '2026-10-15 10:00', 'Viêm tủy răng 26, sâu mặt bên răng 25',
    '[{"svc":"DIEUTRITUY","tooth":26},{"svc":"TRAM","tooth":25,"doctor":"bs.hoa"}]',
    '[{"item":"VT-GANG","qty":2},{"item":"VT-THUOCTE","qty":2},{"item":"VT-COMPOSITE","qty":0.5}]',
    '[{"item":"TH-IBU","qty":10,"dosage":"Ngày 2 lần, mỗi lần 1 viên sau ăn"}]',
    p_pay => 500000);

SELECT pg_temp.make_visit('Đặng Gia Huy', 'bs.khoa', 'G3', '2026-10-20 15:00', 'Khám định kỳ',
    '[{"svc":"KHAM"},{"svc":"CAOVOI"}]',
    '[{"item":"VT-GANG","qty":1}]',
    p_method => 'transfer');

-- Tháng 11 (giá trám răng mới 450.000)
SELECT pg_temp.make_visit('Nguyễn Thị Mai', 'bs.minh', 'G1', '2026-11-03 09:30', 'Sâu răng 16',
    '[{"svc":"TRAM","tooth":16}]',
    '[{"item":"VT-GANG","qty":1},{"item":"VT-COMPOSITE","qty":0.5}]');

SELECT pg_temp.make_visit('Hoàng Minh Châu', 'bs.hoa', 'G1', '2026-11-05 08:30', 'Siết niềng lần 1, răng dịch chuyển tốt',
    '[{"svc":"SIETNIENG"}]',
    '[{"item":"VT-GANG","qty":1}]',
    p_plan => 'Niềng răng mắc cài kim loại 24 tháng');

SELECT pg_temp.make_visit('Trần Gia Bin', 'bs.khoa', 'G3', '2026-11-10 14:30', 'Răng sữa 61 lung lay, răng vĩnh viễn đang mọc',
    '[{"svc":"KHAM"},{"svc":"NHORANG","tooth":61}]',
    '[{"item":"VT-GANG","qty":1},{"item":"VT-THUOCTE","qty":1}]',
    '[{"item":"TH-PARA","qty":5,"dosage":"Uống nửa viên khi đau"}]');

-- Giảm 280.000 ở tổng hóa đơn → phân bổ xuống từng dòng (QĐ3)
SELECT pg_temp.make_visit('Vũ Thị Thu', 'bs.hoa', 'G2', '2026-11-12 09:00', 'Răng ố vàng, vôi răng',
    '[{"svc":"CAOVOI"},{"svc":"TAYTRANG"}]',
    '[{"item":"VT-GANG","qty":2}]',
    p_method => 'transfer', p_discount => 280000);

SELECT pg_temp.make_visit('Trần Quốc Bảo', 'bs.khoa', 'G3', '2026-11-18 16:00', 'Tái khám sau nhổ răng khôn, lành tốt',
    '[{"svc":"KHAM"}]',
    '[{"item":"VT-GANG","qty":1}]');

SELECT pg_temp.make_visit('Lê Thị Hạnh', 'bs.minh', 'G2', '2026-11-20 10:30', 'Phục hồi thân răng 26 sau điều trị tủy',
    '[{"svc":"TRAM","tooth":26}]',
    '[{"item":"VT-GANG","qty":1},{"item":"VT-COMPOSITE","qty":0.5},{"item":"VT-THUOCTE","qty":1}]',
    p_pay => 0);

-- =====================================================================
-- Lịch hẹn đã hủy (báo cáo UC27.4)
-- =====================================================================
INSERT INTO appointment (patient_id, doctor_id, chair_id, service_id, start_at, status,
                         cancel_reason_id, cancelled_by, cancelled_at, created_by, created_at)
SELECT p.id, d.id, c.id, s.id, v.at, 'cancelled', r.id, lt.id, v.cancelled_at, lt.id, v.at - INTERVAL '5 days'
FROM (VALUES
    ('Vũ Thị Thu',    'bs.hoa',  'G2', 'TAYTRANG',    TIMESTAMP '2026-10-22 09:00', 'Bệnh nhân bận việc riêng',       TIMESTAMPTZ '2026-10-21 17:00+07'),
    ('Vũ Thị Thu',    'bs.hoa',  'G2', 'TAYTRANG',    '2026-11-04 10:00',           'Bệnh nhân ốm',                   '2026-11-04 07:30+07'),
    ('Đặng Gia Huy',  'bs.khoa', 'G3', 'NHORANGKHON', '2026-11-13 14:00',           'Bác sĩ có việc đột xuất',        '2026-11-12 09:00+07'),
    ('Phạm Văn Đức',  'bs.minh', 'G1', 'CAOVOI',      '2026-09-15 09:00',           'Bệnh nhân không đến, không báo', '2026-09-15 09:30+07'),
    ('Trần Quốc Bảo', 'bs.khoa', 'G3', 'KHAM',        '2026-11-16 15:00',           'Bệnh nhân bận việc riêng',       '2026-11-16 08:00+07')
) v(pat, doc, chair, svc, at, reason, cancelled_at)
JOIN patient p       ON p.full_name = v.pat
JOIN staff d         ON d.username  = v.doc
JOIN dental_chair c  ON c.code      = v.chair
JOIN service s       ON s.code      = v.svc
JOIN cancel_reason r ON r.name      = v.reason
JOIN staff lt        ON lt.username = 'letan.hung';

-- =====================================================================
-- Lịch hẹn sắp tới (đi qua đủ kiểm tra trùng ghế / bác sĩ / ca trực)
-- =====================================================================
INSERT INTO appointment (patient_id, doctor_id, chair_id, service_id, start_at, note, created_by)
SELECT p.id, d.id, c.id, s.id, v.at, v.note, lt.id
FROM (VALUES
    ('Lê Thị Hạnh',     'bs.minh', 'G2', 'KHAM',        TIMESTAMP '2026-11-25 09:00', 'Tái khám răng 26'),
    ('Nguyễn Thị Mai',  'bs.khoa', 'G3', 'KHAM',        '2026-11-26 14:00',           NULL),
    ('Trần Bảo Na',     'bs.khoa', 'G3', 'KHAM',        '2026-11-27 15:00',           'Kiểm tra răng 74 sau trám'),
    ('Đặng Gia Huy',    'bs.khoa', 'G3', 'NHORANGKHON', '2026-11-27 16:00',           'Đặt lại lịch bị hủy 13/11'),
    ('Hoàng Minh Châu', 'bs.hoa',  'G1', 'SIETNIENG',   '2026-12-04 08:30',           'Siết niềng lần 2')
) v(pat, doc, chair, svc, at, note)
JOIN patient p      ON p.full_name = v.pat
JOIN staff d        ON d.username  = v.doc
JOIN dental_chair c ON c.code      = v.chair
JOIN service s      ON s.code      = v.svc
JOIN staff lt       ON lt.username = 'letan.lan';
