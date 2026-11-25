'use client';

// UC23 Quản lý nhân viên & phân quyền
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, formValues, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';

const ROLE_RIGHTS = {
  receptionist: 'Tiếp nhận bệnh nhân, đặt / đổi / hủy lịch, lập hóa đơn, thu tiền',
  doctor: 'Xem lịch, ghi phiếu điều trị, kê đơn, ghi vật tư, lập liệu trình',
  manager: 'Danh mục, bảng giá, ca trực, nhân viên, kho, báo cáo',
};

export default function StaffPage() {
  const { user } = useAuth();
  const { data, error, reload } = useApi('/staff');
  const [editing, setEditing] = useState(null);
  const [run, busy] = useAction();

  function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    run(async () => {
      if (editing === 'new') {
        await api('/staff', { method: 'POST', body: v });
      } else {
        await api(`/staff/${editing.id}`, {
          method: 'PUT',
          body: { full_name: v.full_name, role: v.role, phone: v.phone ?? '', email: v.email ?? '', is_active: form.is_active.checked, password: v.password },
        });
      }
      setEditing(null);
      reload();
    }, 'Đã lưu nhân viên');
  }

  return (
    <>
      <PageHeader title="Nhân viên & phân quyền" uc="UC23" actions={<button className="btn btn-primary" onClick={() => setEditing('new')}>+ Thêm nhân viên</button>} />
      <div className="grid-3" style={{ marginBottom: 16 }}>
        {Object.entries(ROLE_RIGHTS).map(([role, rights]) => (
          <div key={role} className="stat"><div className="stat-label">{ROLE_LABEL[role]}</div><div className="small">{rights}</div></div>
        ))}
      </div>
      <Card>
        <ErrorBox error={error} />
        {!data ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Họ tên</th><th>Vai trò</th><th>Tên đăng nhập</th><th>SĐT</th><th>Email</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td>{s.full_name}{s.id === user.id && <span className="muted"> (bạn)</span>}</td>
                    <td>{ROLE_LABEL[s.role]}</td>
                    <td><code>{s.username}</code></td>
                    <td>{s.phone}</td>
                    <td>{s.email}</td>
                    <td>{s.is_active ? <Badge color="green">Đang làm</Badge> : <Badge>Đã khóa</Badge>}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Sửa</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={Boolean(editing)} title={editing === 'new' ? 'Thêm nhân viên' : 'Sửa nhân viên'} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="form-grid">
            <Field label="Họ tên" required className="full"><input className="input" name="full_name" defaultValue={editing.full_name} required /></Field>
            <Field label="Vai trò" required>
              <select className="input" name="role" defaultValue={editing.role ?? 'receptionist'}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Tên đăng nhập" required hint="Chữ thường, số, dấu chấm"><input className="input" name="username" defaultValue={editing.username} disabled={editing !== 'new'} required pattern="[a-z0-9_.]{3,50}" /></Field>
            <Field label="SĐT"><input className="input" name="phone" defaultValue={editing.phone ?? ''} inputMode="tel" /></Field>
            <Field label="Email"><input className="input" name="email" type="email" defaultValue={editing.email ?? ''} /></Field>
            <Field label={editing === 'new' ? 'Mật khẩu' : 'Đặt lại mật khẩu'} required={editing === 'new'} hint={editing === 'new' ? 'Tối thiểu 6 ký tự' : 'Để trống nếu không đổi'} className="full">
              <input className="input" name="password" type="password" minLength={6} required={editing === 'new'} autoComplete="new-password" />
            </Field>
            {editing !== 'new' && <label className="check full"><input type="checkbox" name="is_active" defaultChecked={editing.is_active} /> Đang làm việc (bỏ chọn để khóa tài khoản)</label>}
            <div className="full"><button className="btn btn-primary" disabled={busy}>Lưu</button></div>
          </form>
        )}
      </Modal>
    </>
  );
}
