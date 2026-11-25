'use client';

import { Card, Field, PageHeader, formValues, toast, useAction } from '@/components/ui';
import { api } from '@/lib/api';

export default function ChangePasswordPage() {
  const [run, busy] = useAction();

  function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    if (v.new_password !== v.confirm) {
      toast('Mật khẩu nhập lại không khớp', 'error');
      return;
    }
    run(async () => {
      await api('/auth/change-password', { method: 'POST', body: { old_password: v.old_password, new_password: v.new_password } });
      form.reset();
    }, 'Đã đổi mật khẩu');
  }

  return (
    <>
      <PageHeader title="Đổi mật khẩu" uc="UC00" />
      <Card>
        <form onSubmit={submit} className="stack" style={{ maxWidth: 380 }}>
          <Field label="Mật khẩu hiện tại" required><input className="input" name="old_password" type="password" required autoComplete="current-password" /></Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 6 ký tự" required><input className="input" name="new_password" type="password" minLength={6} required autoComplete="new-password" /></Field>
          <Field label="Nhập lại mật khẩu mới" required><input className="input" name="confirm" type="password" minLength={6} required autoComplete="new-password" /></Field>
          <div><button className="btn btn-primary" disabled={busy}>Lưu mật khẩu</button></div>
        </form>
      </Card>
    </>
  );
}
