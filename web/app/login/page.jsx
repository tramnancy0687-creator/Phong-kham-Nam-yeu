'use client';

// UC00 Đăng nhập
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Field } from '@/components/ui';

const DEMO = [
  ['letan.lan', 'Lễ tân'],
  ['bs.minh', 'Bác sĩ'],
  ['ql.tam', 'Quản lý'],
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
      router.replace('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo">N</div>
          <div>
            <div className="brand-name">Phòng khám Nấm yêu</div>
            <div className="muted small">Hệ thống quản lý nha khoa</div>
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Tên đăng nhập">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
        </Field>
        <Field label="Mật khẩu">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <div className="demo-accounts">
          Tài khoản mẫu (mật khẩu 123456):{' '}
          {DEMO.map(([u, label], i) => (
            <span key={u}>
              {i > 0 && ' · '}
              <button type="button" onClick={() => { setUsername(u); setPassword('123456'); }}>{label}</button>
            </span>
          ))}
        </div>
      </form>
    </main>
  );
}
