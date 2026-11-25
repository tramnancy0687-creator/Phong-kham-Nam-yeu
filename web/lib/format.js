export const ROLE_LABEL = { receptionist: 'Lễ tân', doctor: 'Bác sĩ', manager: 'Quản lý' };

export const APPT_STATUS = {
  scheduled: ['Chờ khám', 'blue'],
  completed: ['Đã khám', 'green'],
  cancelled: ['Đã hủy', 'gray'],
  no_show: ['Không đến', 'orange'],
};

export const PLAN_STATUS = {
  in_progress: ['Đang điều trị', 'blue'],
  completed: ['Hoàn thành', 'green'],
  cancelled: ['Đã hủy', 'gray'],
};

export const INVOICE_STATUS = { issued: ['Hiệu lực', 'blue'], cancelled: ['Đã hủy', 'gray'] };

// Quan hệ của người giữ SĐT với bệnh nhân (QĐ2)
export const RELATIONSHIP = {
  self: 'Chính bệnh nhân',
  mother: 'Mẹ',
  father: 'Bố',
  guardian: 'Người giám hộ',
  sibling: 'Anh / chị / em',
  spouse: 'Vợ / chồng',
  other: 'Khác',
};

export const GENDER = { male: 'Nam', female: 'Nữ', other: 'Khác' };
export const METHOD = { cash: 'Tiền mặt', transfer: 'Chuyển khoản' };
export const ITEM_TYPE = { medicine: 'Thuốc', supply: 'Vật tư' };
export const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

const pad = (n) => String(n).padStart(2, '0');

export function money(n) {
  if (n === null || n === undefined || n === '') return '—';
  return `${Number(n).toLocaleString('vi-VN')} đ`;
}

export function num(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('vi-VN');
}

/** YYYY-MM-DD theo giờ máy người dùng */
export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + days));
}

// timestamp không múi giờ từ server: "2026-11-24 09:00:00"
const LOCAL_TS = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

function parts(value) {
  if (!value) return null;
  if (typeof value === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    const m = LOCAL_TS.exec(value);
    if (m) return { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5] };
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return {
    y: dt.getFullYear(), mo: pad(dt.getMonth() + 1), d: pad(dt.getDate()),
    h: pad(dt.getHours()), mi: pad(dt.getMinutes()),
  };
}

export function fmtDate(value) {
  const p = parts(value);
  return p ? `${p.d}/${p.mo}/${p.y}` : '—';
}

export function fmtDateTime(value) {
  const p = parts(value);
  if (!p) return '—';
  return p.h ? `${p.d}/${p.mo}/${p.y} ${p.h}:${p.mi}` : `${p.d}/${p.mo}/${p.y}`;
}

export function fmtTime(value) {
  const p = parts(value);
  return p?.h ? `${p.h}:${p.mi}` : '—';
}

export function fmtMonth(value) {
  const p = parts(value);
  return p ? `${p.mo}/${p.y}` : '—';
}

export function age(dob) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a -= 1;
  return a;
}

/** Các khung 30 phút trong ngày, vd. ['08:00', '08:30', …] */
export function timeSlots(open = '08:00', close = '20:00') {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const slots = [];
  for (let m = toMin(open); m < toMin(close); m += 30) slots.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return slots;
}

/** Số răng FDI hợp lệ: vĩnh viễn 11–48, răng sữa 51–85 */
export function isValidTooth(n) {
  if (n === '' || n === null || n === undefined) return true;
  const t = Number(n);
  const q = Math.floor(t / 10);
  const i = t % 10;
  return Number.isInteger(t) && ((q >= 1 && q <= 4 && i >= 1 && i <= 8) || (q >= 5 && q <= 8 && i >= 1 && i <= 5));
}
