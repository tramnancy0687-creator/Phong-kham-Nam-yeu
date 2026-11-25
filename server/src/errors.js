export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Báo lỗi 400 nếu thiếu trường bắt buộc */
export function required(obj, fields) {
  const missing = fields.filter((f) => obj?.[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) throw new HttpError(400, `Thiếu thông tin: ${missing.join(', ')}`);
}

export function notFound(row, what = 'Dữ liệu') {
  if (!row) throw new HttpError(404, `${what} không tồn tại`);
  return row;
}

// Thông báo dễ hiểu cho các ràng buộc trong database
const CONSTRAINT_MESSAGES = {
  ex_appointment_chair: 'Ghế này đã có lịch hẹn trong khung giờ đã chọn',
  ex_appointment_doctor: 'Bác sĩ đã có lịch hẹn khác trong khung giờ đã chọn',
  ex_shift_no_overlap: 'Ca trực bị chồng giờ với ca đã có của bác sĩ',
  ex_price_no_overlap: 'Khoảng hiệu lực của giá bị chồng với giá đã có',
  chk_appointment_slot: 'Giờ hẹn phải bắt đầu ở phút :00 hoặc :30',
  chk_appointment_cancel_info: 'Hủy lịch phải ghi lý do, người hủy và thời điểm hủy',
  chk_stock_not_negative: 'Không đủ tồn kho',
  chk_tooth_number_fdi: 'Số răng không hợp lệ (hệ FDI: 11–48 răng vĩnh viễn, 51–85 răng sữa)',
  chk_line_discount: 'Giảm giá không được âm hoặc vượt quá tiền của dòng',
  chk_shift_time: 'Giờ kết thúc ca phải sau giờ bắt đầu',
  chk_price_period: 'Ngày kết thúc hiệu lực phải sau ngày bắt đầu',
  contact_phone_check: 'Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0)',
  staff_phone_check: 'Số điện thoại không hợp lệ (10–11 số, bắt đầu bằng 0)',
  staff_username_check: 'Tên đăng nhập chỉ gồm chữ thường, số, dấu chấm, gạch dưới (3–50 ký tự)',
  contact_phone_key: 'Số điện thoại đã tồn tại',
  staff_username_key: 'Tên đăng nhập đã tồn tại',
  staff_email_key: 'Email đã được dùng',
  service_code_key: 'Mã dịch vụ đã tồn tại',
  dental_chair_code_key: 'Mã ghế đã tồn tại',
  medical_item_code_key: 'Mã thuốc / vật tư đã tồn tại',
  invoice_line_treatment_item_id_key: 'Việc điều trị này đã được tính tiền',
  invoice_line_treatment_item_id_fkey: 'Việc điều trị đã được tính tiền, không xóa được',
  treatment_record_appointment_id_key: 'Lịch hẹn này đã có phiếu điều trị',
  uq_installment_no: 'Số thứ tự đợt thanh toán bị trùng',
  fk_record_appointment: 'Lịch hẹn không thuộc bệnh nhân này',
  fk_record_plan: 'Liệu trình không thuộc bệnh nhân này',
  fk_invoice_record: 'Phiếu điều trị không thuộc bệnh nhân này',
  fk_invoice_plan: 'Liệu trình không thuộc bệnh nhân này',
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Dữ liệu gửi lên không phải JSON hợp lệ' });
  }
  // Lỗi từ PostgreSQL (mã SQLSTATE 5 ký tự)
  if (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)) {
    const message = CONSTRAINT_MESSAGES[err.constraint] ?? err.message;
    let status = 500;
    if (err.code === '23P01' || err.code === '23505') status = 409;
    else if (err.code.startsWith('23') || err.code.startsWith('22') || err.code === 'P0001') status = 400;
    if (status === 500) {
      console.error(err);
      return res.status(500).json({ error: 'Lỗi cơ sở dữ liệu' });
    }
    return res.status(status).json({ error: message });
  }
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
}
