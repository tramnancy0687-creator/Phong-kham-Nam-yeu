// UC00 Đăng nhập, đổi mật khẩu
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { HttpError, required } from '../errors.js';

const r = Router();
export default r;

r.post('/login', async (req, res) => {
  required(req.body, ['username', 'password']);
  const [staff] = await query(
    `SELECT id, full_name, role, username FROM staff
     WHERE username = $1 AND is_active AND password_hash = crypt($2, password_hash)`,
    [req.body.username.trim().toLowerCase(), req.body.password],
  );
  if (!staff) throw new HttpError(400, 'Sai tên đăng nhập hoặc mật khẩu');
  res.json({ token: signToken(staff), user: staff });
});

r.get('/me', requireAuth, async (req, res) => {
  const [me] = await query(
    'SELECT id, full_name, role, username, phone, email FROM staff WHERE id = $1 AND is_active',
    [req.user.id],
  );
  if (!me) throw new HttpError(401, 'Tài khoản đã bị khóa');
  res.json(me);
});

r.post('/change-password', requireAuth, async (req, res) => {
  required(req.body, ['old_password', 'new_password']);
  if (req.body.new_password.length < 6) throw new HttpError(400, 'Mật khẩu mới tối thiểu 6 ký tự');
  const rows = await query(
    `UPDATE staff SET password_hash = crypt($3, gen_salt('bf'))
     WHERE id = $1 AND password_hash = crypt($2, password_hash) RETURNING id`,
    [req.user.id, req.body.old_password, req.body.new_password],
  );
  if (!rows.length) throw new HttpError(400, 'Mật khẩu cũ không đúng');
  res.json({ ok: true });
});
