import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Thiếu JWT_SECRET trong file .env');

export const ROLE = { R: 'receptionist', D: 'doctor', M: 'manager' };

export function signToken(staff) {
  return jwt.sign({ id: staff.id, role: staff.role, name: staff.full_name }, SECRET, { expiresIn: '12h' });
}

/** Bắt buộc đăng nhập (UC00) */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Chưa đăng nhập'));
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    next(new HttpError(401, 'Phiên đăng nhập đã hết hạn'));
  }
}

/** Chỉ cho phép các vai trò được liệt kê (theo tác nhân trong use case) */
export const allow = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new HttpError(403, 'Bạn không có quyền dùng chức năng này'));
