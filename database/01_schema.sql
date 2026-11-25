-- Phòng khám Nấm yêu — cấu trúc bảng
-- Dựa trên .claude/docs/requirements/use-case.md (UC01–UC27, QĐ1–QĐ3)
-- Chạy bằng tramadmin trên database phong_kham_nam_yeu

-- Cần cho ràng buộc EXCLUDE (chống trùng lịch / trùng ca / trùng khoảng giá)
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- Băm / kiểm tra mật khẩu nhân viên (crypt + gen_salt('bf'))
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- E. NHÂN VIÊN (UC00, UC23)
-- =====================================================================
CREATE TABLE staff (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name     VARCHAR(150) NOT NULL CHECK (btrim(full_name) <> ''),
    role          VARCHAR(20)  NOT NULL CHECK (role IN ('receptionist', 'doctor', 'manager')),
    username      VARCHAR(50)  NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.]{3,50}$'),
    password_hash TEXT         NOT NULL,
    phone         VARCHAR(15)  CHECK (phone ~ '^0[0-9]{9,10}$'),
    email         VARCHAR(150) UNIQUE,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE  staff      IS 'Nhân viên: lễ tân, bác sĩ, quản lý (UC23)';
COMMENT ON COLUMN staff.role IS 'receptionist = lễ tân, doctor = bác sĩ, manager = quản lý';

-- =====================================================================
-- A. BỆNH NHÂN (UC01–UC04, UC26) — QĐ2: SĐT thuộc người liên hệ
-- =====================================================================
CREATE TABLE contact (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name  VARCHAR(150) NOT NULL CHECK (btrim(full_name) <> ''),
    phone      VARCHAR(15)  NOT NULL UNIQUE CHECK (phone ~ '^0[0-9]{9,10}$'),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE contact IS 'Người liên hệ giữ SĐT. Một SĐT tra ra danh sách bệnh nhân (QĐ2, UC01)';

CREATE TABLE patient (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contact_id      BIGINT       NOT NULL REFERENCES contact(id),
    relationship    VARCHAR(20)  NOT NULL DEFAULT 'self'
                    CHECK (relationship IN ('self', 'mother', 'father', 'guardian', 'sibling', 'spouse', 'other')),
    full_name       VARCHAR(150) NOT NULL CHECK (btrim(full_name) <> ''),
    date_of_birth   DATE         NOT NULL CHECK (date_of_birth > DATE '1900-01-01'),
    gender          VARCHAR(10)  CHECK (gender IN ('male', 'female', 'other')),
    address         TEXT,
    medical_history TEXT,
    archived_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_contact ON patient(contact_id);
COMMENT ON TABLE  patient                 IS 'Bệnh nhân. Mỗi trẻ là một bệnh nhân riêng (QĐ2)';
COMMENT ON COLUMN patient.relationship    IS 'Quan hệ với người giữ SĐT. self = chính bệnh nhân (bắt buộc >= 15 tuổi)';
COMMENT ON COLUMN patient.medical_history IS 'Tiền sử bệnh, dị ứng';
COMMENT ON COLUMN patient.archived_at     IS 'Thời điểm hồ sơ được lưu trữ/khóa sau 5 năm (UC26)';

-- =====================================================================
-- E. DANH MỤC: GHẾ, CA TRỰC, DỊCH VỤ, BẢNG GIÁ (UC20–UC22)
-- =====================================================================
CREATE TABLE dental_chair (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       VARCHAR(20)  NOT NULL UNIQUE,
    name       VARCHAR(100) NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    note       TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE dental_chair IS 'Ghế nha khoa (UC22)';

CREATE TABLE doctor_shift (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doctor_id  BIGINT      NOT NULL REFERENCES staff(id),
    shift_date DATE        NOT NULL,
    start_time TIME        NOT NULL,
    end_time   TIME        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_shift_time CHECK (end_time > start_time),
    CONSTRAINT ex_shift_no_overlap EXCLUDE USING gist (
        doctor_id WITH =,
        tsrange(shift_date + start_time, shift_date + end_time) WITH &&
    )
);
COMMENT ON TABLE doctor_shift IS 'Ca trực bác sĩ theo ngày (UC21). Một bác sĩ không có hai ca chồng giờ';

CREATE TABLE service (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(30)  NOT NULL UNIQUE,
    name        VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''),
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE service IS 'Dịch vụ nha khoa';

CREATE TABLE service_price (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id BIGINT         NOT NULL REFERENCES service(id),
    price      NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    valid_from DATE           NOT NULL,
    valid_to   DATE,
    created_by BIGINT         REFERENCES staff(id),
    created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT chk_price_period CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT ex_price_no_overlap EXCLUDE USING gist (
        service_id WITH =,
        daterange(valid_from, valid_to, '[)') WITH &&
    )
);
COMMENT ON TABLE  service_price          IS 'Bảng giá có hiệu lực theo khoảng [valid_from, valid_to) (UC20). Không chồng khoảng';
COMMENT ON COLUMN service_price.valid_to IS 'NULL = còn hiệu lực đến khi có giá mới';

-- =====================================================================
-- B. LỊCH HẸN (UC05–UC08)
-- =====================================================================
CREATE TABLE cancel_reason (
    id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);
COMMENT ON TABLE cancel_reason IS 'Danh mục lý do hủy lịch, để thống kê được (UC07, UC27.4)';

INSERT INTO cancel_reason (name) VALUES
('Bệnh nhân bận việc riêng'),
('Bệnh nhân ốm'),
('Bác sĩ có việc đột xuất'),
('Phòng khám sự cố thiết bị'),
('Bệnh nhân không đến, không báo'),
('Lý do khác');

CREATE TABLE appointment (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id       BIGINT      NOT NULL REFERENCES patient(id),
    doctor_id        BIGINT      NOT NULL REFERENCES staff(id),
    chair_id         BIGINT      NOT NULL REFERENCES dental_chair(id),
    service_id       BIGINT      NOT NULL REFERENCES service(id),
    start_at         TIMESTAMP   NOT NULL,
    end_at           TIMESTAMP   GENERATED ALWAYS AS (start_at + INTERVAL '30 minutes') STORED,
    status           VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
    note             TEXT,
    cancel_reason_id SMALLINT    REFERENCES cancel_reason(id),
    cancel_note      TEXT,
    cancelled_by     BIGINT      REFERENCES staff(id),
    cancelled_at     TIMESTAMPTZ,
    created_by       BIGINT      NOT NULL REFERENCES staff(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_appointment_patient UNIQUE (id, patient_id),
    -- 1 lịch = 1 khung 30 phút, bắt đầu ở phút :00 hoặc :30
    CONSTRAINT chk_appointment_slot CHECK (
        EXTRACT(MINUTE FROM start_at) IN (0, 30) AND EXTRACT(SECOND FROM start_at) = 0
    ),
    -- Hủy thì bắt buộc đủ lý do, người hủy, thời điểm hủy; chưa hủy thì không được có
    CONSTRAINT chk_appointment_cancel_info CHECK (
        (status =  'cancelled' AND cancel_reason_id IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
     OR (status <> 'cancelled' AND cancel_reason_id IS NULL     AND cancelled_by IS NULL     AND cancelled_at IS NULL)
    ),
    -- UC05a: không trùng giờ trên cùng ghế / cùng bác sĩ (bỏ qua lịch đã hủy)
    CONSTRAINT ex_appointment_chair EXCLUDE USING gist (
        chair_id WITH =, tsrange(start_at, end_at) WITH &&
    ) WHERE (status <> 'cancelled'),
    CONSTRAINT ex_appointment_doctor EXCLUDE USING gist (
        doctor_id WITH =, tsrange(start_at, end_at) WITH &&
    ) WHERE (status <> 'cancelled')
);
CREATE INDEX idx_appointment_patient ON appointment(patient_id);
CREATE INDEX idx_appointment_start   ON appointment(start_at);
COMMENT ON TABLE  appointment          IS 'Lịch hẹn: 1 bác sĩ chính + 1 ghế + 1 khung 30 phút (UC05, QĐ1)';
COMMENT ON COLUMN appointment.start_at IS 'Giờ địa phương của phòng khám';
COMMENT ON COLUMN appointment.service_id IS 'Dịch vụ dự kiến, dùng cho báo cáo dịch vụ hay bị hủy (UC27.4)';

-- =====================================================================
-- C. KHÁM & ĐIỀU TRỊ (UC09–UC14)
-- =====================================================================
CREATE TABLE treatment_plan (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id     BIGINT         NOT NULL REFERENCES patient(id),
    doctor_id      BIGINT         NOT NULL REFERENCES staff(id),
    name           VARCHAR(200)   NOT NULL CHECK (btrim(name) <> ''),
    total_sessions INT            NOT NULL CHECK (total_sessions > 0),
    total_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    status         VARCHAR(20)    NOT NULL DEFAULT 'in_progress'
                   CHECK (status IN ('in_progress', 'completed', 'cancelled')),
    start_date     DATE           NOT NULL DEFAULT CURRENT_DATE,
    end_date       DATE,
    note           TEXT,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT uq_treatment_plan_patient UNIQUE (id, patient_id),
    CONSTRAINT chk_plan_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_treatment_plan_patient ON treatment_plan(patient_id);
COMMENT ON TABLE treatment_plan IS 'Liệu trình nhiều buổi: niềng, implant... (UC13, UC14)';

CREATE TABLE treatment_plan_installment (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id        BIGINT         NOT NULL REFERENCES treatment_plan(id) ON DELETE CASCADE,
    installment_no INT            NOT NULL CHECK (installment_no > 0),
    amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    due_date       DATE,
    note           TEXT,
    CONSTRAINT uq_installment_no UNIQUE (plan_id, installment_no)
);
COMMENT ON TABLE treatment_plan_installment IS 'Các đợt thanh toán của liệu trình (UC13, UC18)';

CREATE TABLE treatment_record (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id        BIGINT      NOT NULL REFERENCES patient(id),
    appointment_id    BIGINT      UNIQUE,
    treatment_plan_id BIGINT,
    doctor_id         BIGINT      NOT NULL REFERENCES staff(id),
    visit_at          TIMESTAMP   NOT NULL DEFAULT LOCALTIMESTAMP,
    diagnosis         TEXT,
    note              TEXT,
    updated_by        BIGINT      REFERENCES staff(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_treatment_record_patient UNIQUE (id, patient_id),
    -- Lịch hẹn / liệu trình gắn vào phiếu phải cùng bệnh nhân
    CONSTRAINT fk_record_appointment FOREIGN KEY (appointment_id, patient_id)
        REFERENCES appointment(id, patient_id),
    CONSTRAINT fk_record_plan FOREIGN KEY (treatment_plan_id, patient_id)
        REFERENCES treatment_plan(id, patient_id)
);
CREATE INDEX idx_treatment_record_patient ON treatment_record(patient_id, visit_at);
CREATE INDEX idx_treatment_record_plan    ON treatment_record(treatment_plan_id);
COMMENT ON TABLE  treatment_record           IS 'Phiếu điều trị của một lần khám (UC09). Giữ ít nhất 5 năm';
COMMENT ON COLUMN treatment_record.doctor_id IS 'Bác sĩ chính của buổi khám';
COMMENT ON COLUMN treatment_record.treatment_plan_id IS 'Buổi này thuộc liệu trình nào (để đếm số buổi đã làm)';

CREATE TABLE treatment_item (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_id            BIGINT   NOT NULL REFERENCES treatment_record(id) ON DELETE CASCADE,
    service_id           BIGINT   NOT NULL REFERENCES service(id),
    performing_doctor_id BIGINT   NOT NULL REFERENCES staff(id),
    tooth_number         SMALLINT,
    quantity             INT      NOT NULL DEFAULT 1 CHECK (quantity > 0),
    note                 TEXT,
    -- Số răng theo hệ FDI: răng vĩnh viễn 11–48, răng sữa 51–85
    CONSTRAINT chk_tooth_number_fdi CHECK (
        tooth_number IS NULL
     OR (tooth_number / 10 BETWEEN 1 AND 4 AND tooth_number % 10 BETWEEN 1 AND 8)
     OR (tooth_number / 10 BETWEEN 5 AND 8 AND tooth_number % 10 BETWEEN 1 AND 5)
    )
);
CREATE INDEX idx_treatment_item_record ON treatment_item(record_id);
COMMENT ON TABLE  treatment_item                      IS 'Từng việc làm trong buổi khám (UC09)';
COMMENT ON COLUMN treatment_item.performing_doctor_id IS 'Bác sĩ thực hiện dòng việc này (QĐ1, UC27.1)';
COMMENT ON COLUMN treatment_item.tooth_number         IS 'Số răng FDI; NULL nếu làm cả hàm (vd. cạo vôi)';

CREATE TABLE treatment_record_history (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_id  BIGINT      NOT NULL REFERENCES treatment_record(id) ON DELETE CASCADE,
    table_name VARCHAR(50) NOT NULL,
    action     VARCHAR(10) NOT NULL CHECK (action IN ('UPDATE', 'DELETE')),
    edited_by  BIGINT      NOT NULL REFERENCES staff(id),
    edited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_data   JSONB       NOT NULL,
    new_data   JSONB
);
CREATE INDEX idx_record_history_record ON treatment_record_history(record_id);
COMMENT ON TABLE treatment_record_history IS 'Lịch sử sửa phiếu điều trị: ai sửa, lúc nào, trước/sau (UC10). Ghi tự động bằng trigger';

-- =====================================================================
-- E. THUỐC / VẬT TƯ & KHO (UC11, UC12, UC24, UC25)
-- =====================================================================
CREATE TABLE medical_item (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code           VARCHAR(30)    NOT NULL UNIQUE,
    name           VARCHAR(200)   NOT NULL CHECK (btrim(name) <> ''),
    item_type      VARCHAR(10)    NOT NULL CHECK (item_type IN ('medicine', 'supply')),
    unit           VARCHAR(20)    NOT NULL,
    stock_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0,
    min_threshold  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_threshold >= 0),
    is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT chk_stock_not_negative CHECK (stock_quantity >= 0)
);
COMMENT ON TABLE  medical_item                IS 'Thuốc (medicine) và vật tư (supply) (UC24)';
COMMENT ON COLUMN medical_item.stock_quantity IS 'Tồn kho, tự cập nhật bằng trigger khi nhập kho / dùng vật tư';
COMMENT ON COLUMN medical_item.min_threshold  IS 'Ngưỡng tối thiểu; dưới ngưỡng thì sinh cảnh báo (UC25)';

CREATE TABLE stock_receipt (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    received_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    received_by BIGINT       NOT NULL REFERENCES staff(id),
    supplier    VARCHAR(200),
    note        TEXT
);
COMMENT ON TABLE stock_receipt IS 'Phiếu nhập kho (UC24)';

CREATE TABLE stock_receipt_item (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id  BIGINT         NOT NULL REFERENCES stock_receipt(id) ON DELETE CASCADE,
    item_id     BIGINT         NOT NULL REFERENCES medical_item(id),
    quantity    NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit_cost   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    expiry_date DATE
);
CREATE INDEX idx_receipt_item_receipt ON stock_receipt_item(receipt_id);

CREATE TABLE prescription_item (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_id BIGINT         NOT NULL REFERENCES treatment_record(id) ON DELETE CASCADE,
    item_id   BIGINT         NOT NULL REFERENCES medical_item(id),
    quantity  NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    dosage    TEXT           NOT NULL CHECK (btrim(dosage) <> ''),
    note      TEXT
);
CREATE INDEX idx_prescription_record ON prescription_item(record_id);
COMMENT ON TABLE  prescription_item        IS 'Đơn thuốc kê trong buổi khám (UC11). Chỉ nhận item_type = medicine';
COMMENT ON COLUMN prescription_item.dosage IS 'Liều dùng, vd. "Ngày 2 lần, mỗi lần 1 viên sau ăn"';

CREATE TABLE supply_usage (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_id BIGINT         NOT NULL REFERENCES treatment_record(id) ON DELETE CASCADE,
    item_id   BIGINT         NOT NULL REFERENCES medical_item(id),
    quantity  NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    note      TEXT
);
CREATE INDEX idx_supply_usage_record ON supply_usage(record_id);
COMMENT ON TABLE supply_usage IS 'Vật tư dùng trong buổi khám (UC12). Tự trừ tồn kho; không đủ tồn thì báo lỗi';

CREATE TABLE stock_alert (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    item_id        BIGINT         NOT NULL REFERENCES medical_item(id),
    stock_quantity NUMERIC(12, 2) NOT NULL,
    min_threshold  NUMERIC(12, 2) NOT NULL,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
    resolved_at    TIMESTAMPTZ
);
-- Mỗi vật tư chỉ có tối đa một cảnh báo đang mở
CREATE UNIQUE INDEX uq_stock_alert_open ON stock_alert(item_id) WHERE resolved_at IS NULL;
COMMENT ON TABLE stock_alert IS 'Cảnh báo tồn kho dưới ngưỡng, sinh tự động (UC25). Tự đóng khi nhập đủ';

-- =====================================================================
-- D. THANH TOÁN (UC15–UC19) — QĐ3: giảm giá lưu ở từng dòng
-- =====================================================================
CREATE TABLE invoice (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id          BIGINT      NOT NULL REFERENCES patient(id),
    treatment_record_id BIGINT,
    treatment_plan_id   BIGINT,
    status              VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
    note                TEXT,
    created_by          BIGINT      NOT NULL REFERENCES staff(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Phiếu điều trị / liệu trình của hóa đơn phải cùng bệnh nhân
    CONSTRAINT fk_invoice_record FOREIGN KEY (treatment_record_id, patient_id)
        REFERENCES treatment_record(id, patient_id),
    CONSTRAINT fk_invoice_plan FOREIGN KEY (treatment_plan_id, patient_id)
        REFERENCES treatment_plan(id, patient_id)
);
CREATE INDEX idx_invoice_patient ON invoice(patient_id);
COMMENT ON TABLE invoice IS 'Hóa đơn (UC15). Tổng tiền / đã thu / còn nợ xem ở view v_invoice_balance';

CREATE TABLE invoice_line (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id           BIGINT         NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
    service_id           BIGINT         NOT NULL REFERENCES service(id),
    treatment_item_id    BIGINT         UNIQUE REFERENCES treatment_item(id),
    performing_doctor_id BIGINT         REFERENCES staff(id),
    description          TEXT,
    quantity             INT            NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price           NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    line_total           NUMERIC(14, 2) GENERATED ALWAYS AS (quantity * unit_price - discount_amount) STORED,
    CONSTRAINT chk_line_discount CHECK (discount_amount >= 0 AND discount_amount <= quantity * unit_price)
);
CREATE INDEX idx_invoice_line_invoice ON invoice_line(invoice_id);
COMMENT ON TABLE  invoice_line                   IS 'Dòng hóa đơn (UC15, UC16)';
COMMENT ON COLUMN invoice_line.unit_price        IS 'Giá chốt lúc lập hóa đơn. Để trống thì tự lấy từ bảng giá; đã chốt thì không sửa được';
COMMENT ON COLUMN invoice_line.discount_amount   IS 'Giảm giá của dòng (QĐ3). Giảm ở tổng thì dùng fn_allocate_invoice_discount';
COMMENT ON COLUMN invoice_line.treatment_item_id IS 'Mỗi việc điều trị chỉ được tính tiền một lần';

CREATE TABLE payment (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id     BIGINT         NOT NULL REFERENCES invoice(id),
    installment_id BIGINT         REFERENCES treatment_plan_installment(id),
    amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    method         VARCHAR(20)    NOT NULL CHECK (method IN ('cash', 'transfer')),
    paid_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
    received_by    BIGINT         NOT NULL REFERENCES staff(id),
    note           TEXT
);
CREATE INDEX idx_payment_invoice ON payment(invoice_id);
CREATE INDEX idx_payment_paid_at ON payment(paid_at);
COMMENT ON TABLE  payment                IS 'Các lần thu tiền; một hóa đơn thu nhiều lần (UC17, UC18)';
COMMENT ON COLUMN payment.method         IS 'cash = tiền mặt, transfer = chuyển khoản';
COMMENT ON COLUMN payment.installment_id IS 'Đợt liệu trình được thu (UC18), phải thuộc liệu trình của hóa đơn';
