-- Phòng khám Nấm yêu — hàm & trigger ép luật nghiệp vụ
-- Chạy sau 01_schema.sql

-- =====================================================================
-- Tiện ích chung
-- =====================================================================

-- Tự cập nhật updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'updated_at'
          AND table_name IN (SELECT table_name FROM information_schema.tables
                             WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
    LOOP
        EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I
                        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', t);
    END LOOP;
END $$;

-- Nhân viên đang thao tác (ứng dụng gán sau khi đăng nhập):
--   SET app.current_staff_id = '5';   hoặc   SELECT set_config('app.current_staff_id', '5', false);
CREATE OR REPLACE FUNCTION fn_current_staff_id() RETURNS bigint
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_staff_id', true), '')::bigint
$$;

-- Kiểm tra cột tham chiếu staff có đúng vai trò
-- Dùng: EXECUTE FUNCTION fn_assert_staff_role('<tên cột>', '<vai trò>')
CREATE OR REPLACE FUNCTION fn_assert_staff_role() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_id   bigint := (to_jsonb(NEW) ->> TG_ARGV[0])::bigint;
    v_role text;
BEGIN
    IF v_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT role INTO v_role FROM staff WHERE id = v_id;
    IF v_role IS DISTINCT FROM TG_ARGV[1] THEN
        RAISE EXCEPTION '%.%: nhân viên id=% có vai trò "%", yêu cầu "%"',
            TG_TABLE_NAME, TG_ARGV[0], v_id, COALESCE(v_role, 'không tồn tại'), TG_ARGV[1]
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_doctor_shift_role BEFORE INSERT OR UPDATE ON doctor_shift
    FOR EACH ROW EXECUTE FUNCTION fn_assert_staff_role('doctor_id', 'doctor');
CREATE TRIGGER trg_appointment_role BEFORE INSERT OR UPDATE ON appointment
    FOR EACH ROW EXECUTE FUNCTION fn_assert_staff_role('doctor_id', 'doctor');
CREATE TRIGGER trg_treatment_plan_role BEFORE INSERT OR UPDATE ON treatment_plan
    FOR EACH ROW EXECUTE FUNCTION fn_assert_staff_role('doctor_id', 'doctor');
CREATE TRIGGER trg_treatment_record_role BEFORE INSERT OR UPDATE ON treatment_record
    FOR EACH ROW EXECUTE FUNCTION fn_assert_staff_role('doctor_id', 'doctor');
CREATE TRIGGER trg_treatment_item_role BEFORE INSERT OR UPDATE ON treatment_item
    FOR EACH ROW EXECUTE FUNCTION fn_assert_staff_role('performing_doctor_id', 'doctor');
-- Tên bắt đầu "trg_invoice_line_2" để chạy SAU trigger tự điền bác sĩ (trg_invoice_line_1...)
CREATE TRIGGER trg_invoice_line_2_role BEFORE INSERT OR UPDATE ON invoice_line
    FOR EACH ROW EXECUTE FUNCTION fn_assert_staff_role('performing_doctor_id', 'doctor');

-- =====================================================================
-- A. Bệnh nhân
-- =====================================================================

-- UC02 / QĐ2: trẻ dưới 15 tuổi phải dùng SĐT người giám hộ
CREATE OR REPLACE FUNCTION fn_patient_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.date_of_birth > CURRENT_DATE THEN
        RAISE EXCEPTION 'Ngày sinh % ở tương lai', NEW.date_of_birth
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.relationship = 'self' AND NEW.date_of_birth > CURRENT_DATE - INTERVAL '15 years' THEN
        RAISE EXCEPTION 'Bệnh nhân "%" dưới 15 tuổi: phải dùng SĐT người giám hộ (relationship khác "self")', NEW.full_name
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_patient_check BEFORE INSERT OR UPDATE OF date_of_birth, relationship ON patient
    FOR EACH ROW EXECUTE FUNCTION fn_patient_check();

-- UC26: chỉ xóa được bệnh nhân đã lưu trữ
CREATE OR REPLACE FUNCTION fn_patient_protect_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.archived_at IS NULL THEN
        RAISE EXCEPTION 'Không được xóa bệnh nhân id=% khi hồ sơ chưa được lưu trữ (đủ 5 năm)', OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER trg_patient_protect_delete BEFORE DELETE ON patient
    FOR EACH ROW EXECUTE FUNCTION fn_patient_protect_delete();

-- UC26: Timer gọi hàm này mỗi ngày để lưu trữ hồ sơ quá 5 năm không khám
CREATE OR REPLACE FUNCTION fn_archive_expired_patients() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
    UPDATE patient p SET archived_at = now()
    WHERE p.archived_at IS NULL
      AND COALESCE(
            (SELECT max(r.visit_at) FROM treatment_record r WHERE r.patient_id = p.id),
            (p.created_at AT TIME ZONE current_setting('TimeZone'))
          ) < LOCALTIMESTAMP - INTERVAL '5 years';
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

-- =====================================================================
-- B. Lịch hẹn — UC05b: chỉ xếp vào ca bác sĩ trực, ghế đang dùng
-- (UC05a trùng ghế / bác sĩ đã ép bằng EXCLUDE trong 01_schema.sql)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_appointment_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_end timestamp := NEW.start_at + INTERVAL '30 minutes';
BEGIN
    IF NEW.status <> 'scheduled' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM doctor_shift s
        WHERE s.doctor_id = NEW.doctor_id
          AND s.shift_date + s.start_time <= NEW.start_at
          AND s.shift_date + s.end_time   >= v_end
    ) THEN
        RAISE EXCEPTION 'Bác sĩ id=% không có ca trực bao trùm khung % – %',
            NEW.doctor_id, NEW.start_at, v_end
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (SELECT is_active FROM dental_chair WHERE id = NEW.chair_id) THEN
        RAISE EXCEPTION 'Ghế id=% đang ngưng sử dụng', NEW.chair_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER trg_appointment_check
    BEFORE INSERT OR UPDATE OF start_at, doctor_id, chair_id, status ON appointment
    FOR EACH ROW EXECUTE FUNCTION fn_appointment_check();

-- =====================================================================
-- C. Phiếu điều trị
-- =====================================================================

-- UC10: ghi lịch sử sửa (ai sửa, lúc nào, dữ liệu trước/sau)
CREATE OR REPLACE FUNCTION fn_treatment_record_log() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_record bigint;
    v_editor bigint;
BEGIN
    -- Bỏ qua khi bị xóa dây chuyền từ phiếu cha (phiếu quá 5 năm bị xóa)
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    IF TG_TABLE_NAME = 'treatment_record' THEN
        v_record := OLD.id;
        v_editor := COALESCE(fn_current_staff_id(), NEW.updated_by);
    ELSE
        v_record := OLD.record_id;
        v_editor := fn_current_staff_id();
    END IF;

    IF v_editor IS NULL THEN
        RAISE EXCEPTION 'Sửa phiếu điều trị phải cho biết ai sửa: SET app.current_staff_id = ''<id>'' (hoặc gán updated_by)'
            USING ERRCODE = 'not_null_violation';
    END IF;

    INSERT INTO treatment_record_history (record_id, table_name, action, edited_by, old_data, new_data)
    VALUES (v_record, TG_TABLE_NAME, TG_OP, v_editor, to_jsonb(OLD),
            CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(NEW) END);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_treatment_record_log AFTER UPDATE ON treatment_record
    FOR EACH ROW EXECUTE FUNCTION fn_treatment_record_log();
CREATE TRIGGER trg_treatment_item_log AFTER UPDATE OR DELETE ON treatment_item
    FOR EACH ROW EXECUTE FUNCTION fn_treatment_record_log();
CREATE TRIGGER trg_prescription_item_log AFTER UPDATE OR DELETE ON prescription_item
    FOR EACH ROW EXECUTE FUNCTION fn_treatment_record_log();
CREATE TRIGGER trg_supply_usage_log AFTER UPDATE OR DELETE ON supply_usage
    FOR EACH ROW EXECUTE FUNCTION fn_treatment_record_log();

-- UC26: không xóa phiếu điều trị chưa đủ 5 năm
CREATE OR REPLACE FUNCTION fn_treatment_record_protect_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.visit_at > LOCALTIMESTAMP - INTERVAL '5 years' THEN
        RAISE EXCEPTION 'Không được xóa phiếu điều trị id=% (khám ngày %): chưa đủ 5 năm lưu trữ',
            OLD.id, OLD.visit_at::date
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER trg_treatment_record_protect_delete BEFORE DELETE ON treatment_record
    FOR EACH ROW EXECUTE FUNCTION fn_treatment_record_protect_delete();

-- =====================================================================
-- E. Kho
-- =====================================================================

-- Đơn thuốc chỉ nhận thuốc, vật tư dùng chỉ nhận vật tư
CREATE OR REPLACE FUNCTION fn_assert_item_type() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_type text;
BEGIN
    SELECT item_type INTO v_type FROM medical_item WHERE id = NEW.item_id;
    IF v_type IS DISTINCT FROM TG_ARGV[0] THEN
        RAISE EXCEPTION '%: mục id=% là "%", yêu cầu "%"',
            TG_TABLE_NAME, NEW.item_id, COALESCE(v_type, 'không tồn tại'), TG_ARGV[0]
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_prescription_item_type BEFORE INSERT OR UPDATE OF item_id ON prescription_item
    FOR EACH ROW EXECUTE FUNCTION fn_assert_item_type('medicine');
CREATE TRIGGER trg_supply_usage_type BEFORE INSERT OR UPDATE OF item_id ON supply_usage
    FOR EACH ROW EXECUTE FUNCTION fn_assert_item_type('supply');

-- Cập nhật tồn kho: nhập kho (+1), dùng vật tư (-1). Âm kho => lỗi chk_stock_not_negative
CREATE OR REPLACE FUNCTION fn_apply_stock_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_sign int := TG_ARGV[0]::int;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE medical_item SET stock_quantity = stock_quantity - v_sign * OLD.quantity
        WHERE id = OLD.item_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        UPDATE medical_item SET stock_quantity = stock_quantity + v_sign * NEW.quantity
        WHERE id = NEW.item_id;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_stock_receipt_item_stock AFTER INSERT OR UPDATE OR DELETE ON stock_receipt_item
    FOR EACH ROW EXECUTE FUNCTION fn_apply_stock_change('1');
CREATE TRIGGER trg_supply_usage_stock AFTER INSERT OR UPDATE OR DELETE ON supply_usage
    FOR EACH ROW EXECUTE FUNCTION fn_apply_stock_change('-1');

-- UC25: cảnh báo dưới ngưỡng, tự đóng khi tồn kho đủ lại
CREATE OR REPLACE FUNCTION fn_stock_alert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.stock_quantity < NEW.min_threshold THEN
        INSERT INTO stock_alert (item_id, stock_quantity, min_threshold)
        VALUES (NEW.id, NEW.stock_quantity, NEW.min_threshold)
        ON CONFLICT (item_id) WHERE resolved_at IS NULL DO UPDATE
            SET stock_quantity = EXCLUDED.stock_quantity,
                min_threshold  = EXCLUDED.min_threshold;
    ELSE
        UPDATE stock_alert SET resolved_at = now()
        WHERE item_id = NEW.id AND resolved_at IS NULL;
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_medical_item_alert
    AFTER INSERT OR UPDATE OF stock_quantity, min_threshold ON medical_item
    FOR EACH ROW EXECUTE FUNCTION fn_stock_alert();

-- =====================================================================
-- D. Thanh toán
-- =====================================================================

-- UC15: chốt giá lúc lập hóa đơn; tự điền bác sĩ thực hiện từ phiếu điều trị
CREATE OR REPLACE FUNCTION fn_invoice_line_fill() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_invoice_date date;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
            RAISE EXCEPTION 'Giá dòng hóa đơn id=% đã chốt (%), không được sửa', OLD.id, OLD.unit_price
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.unit_price IS NULL THEN
        SELECT created_at::date INTO v_invoice_date FROM invoice WHERE id = NEW.invoice_id;
        SELECT sp.price INTO NEW.unit_price
        FROM service_price sp
        WHERE sp.service_id = NEW.service_id
          AND sp.valid_from <= v_invoice_date
          AND (sp.valid_to IS NULL OR sp.valid_to > v_invoice_date);
        IF NEW.unit_price IS NULL THEN
            RAISE EXCEPTION 'Dịch vụ id=% chưa có giá hiệu lực ngày %', NEW.service_id, v_invoice_date
                USING ERRCODE = 'not_null_violation';
        END IF;
    END IF;

    IF NEW.treatment_item_id IS NOT NULL THEN
        IF NEW.performing_doctor_id IS NULL THEN
            SELECT performing_doctor_id INTO NEW.performing_doctor_id
            FROM treatment_item WHERE id = NEW.treatment_item_id;
        END IF;
        -- Dòng hóa đơn phải cùng bệnh nhân với việc điều trị
        IF NOT EXISTS (
            SELECT 1 FROM treatment_item ti
            JOIN treatment_record r ON r.id = ti.record_id
            JOIN invoice i          ON i.patient_id = r.patient_id
            WHERE ti.id = NEW.treatment_item_id AND i.id = NEW.invoice_id
        ) THEN
            RAISE EXCEPTION 'Việc điều trị id=% không thuộc bệnh nhân của hóa đơn id=%',
                NEW.treatment_item_id, NEW.invoice_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_invoice_line_1_fill BEFORE INSERT OR UPDATE ON invoice_line
    FOR EACH ROW EXECUTE FUNCTION fn_invoice_line_fill();

-- QĐ3: giảm giá ở tổng => phân bổ vào từng dòng theo tỷ lệ tiền (làm tròn đồng, dòng cuối nhận phần dư)
CREATE OR REPLACE FUNCTION fn_allocate_invoice_discount(p_invoice_id bigint, p_total_discount numeric)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_gross     numeric;
    v_last_id   bigint;
    v_allocated numeric := 0;
    v_share     numeric;
    r           record;
BEGIN
    SELECT sum(quantity * unit_price), max(id) INTO v_gross, v_last_id
    FROM invoice_line WHERE invoice_id = p_invoice_id;

    IF COALESCE(v_gross, 0) = 0 THEN
        RAISE EXCEPTION 'Hóa đơn id=% chưa có dòng nào có tiền', p_invoice_id;
    END IF;
    IF p_total_discount < 0 OR p_total_discount > v_gross THEN
        RAISE EXCEPTION 'Giảm giá phải từ 0 đến %', v_gross;
    END IF;

    FOR r IN SELECT id, quantity * unit_price AS gross
             FROM invoice_line WHERE invoice_id = p_invoice_id ORDER BY id LOOP
        IF r.id = v_last_id THEN
            v_share := p_total_discount - v_allocated;
        ELSE
            v_share := round(p_total_discount * r.gross / v_gross, 0);
        END IF;
        UPDATE invoice_line SET discount_amount = v_share WHERE id = r.id;
        v_allocated := v_allocated + v_share;
    END LOOP;
END $$;

-- UC17/UC18: không thu vào hóa đơn đã hủy, không thu vượt số còn nợ, đợt phải đúng liệu trình
CREATE OR REPLACE FUNCTION fn_payment_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status text;
    v_plan   bigint;
    v_total  numeric;
    v_paid   numeric;
BEGIN
    SELECT status, treatment_plan_id INTO v_status, v_plan
    FROM invoice WHERE id = NEW.invoice_id FOR UPDATE;

    IF v_status = 'cancelled' THEN
        RAISE EXCEPTION 'Hóa đơn id=% đã hủy, không thu tiền được', NEW.invoice_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.installment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM treatment_plan_installment
        WHERE id = NEW.installment_id AND plan_id = v_plan
    ) THEN
        RAISE EXCEPTION 'Đợt thanh toán id=% không thuộc liệu trình của hóa đơn id=%',
            NEW.installment_id, NEW.invoice_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT COALESCE(sum(line_total), 0) INTO v_total FROM invoice_line WHERE invoice_id = NEW.invoice_id;
    SELECT COALESCE(sum(amount), 0)     INTO v_paid  FROM payment
    WHERE invoice_id = NEW.invoice_id AND id IS DISTINCT FROM NEW.id;

    IF v_paid + NEW.amount > v_total THEN
        RAISE EXCEPTION 'Thu % vượt số còn nợ % của hóa đơn id=%', NEW.amount, v_total - v_paid, NEW.invoice_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_payment_check BEFORE INSERT OR UPDATE ON payment
    FOR EACH ROW EXECUTE FUNCTION fn_payment_check();
