'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Loading } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/format';

const R = 'receptionist';
const D = 'doctor';
const M = 'manager';

// Menu theo tác nhân trong sơ đồ use case
const NAV = [
  { group: null, items: [{ href: '/', label: 'Tổng quan', icon: '⌂', roles: [R, D, M] }] },
  {
    group: 'Tiếp đón & khám',
    items: [
      { href: '/lich-hen', label: 'Lịch hẹn', icon: '▦', roles: [R, D] },
      { href: '/benh-nhan', label: 'Bệnh nhân', icon: '☺', roles: [R, D] },
      { href: '/lieu-trinh', label: 'Liệu trình', icon: '↻', roles: [R, D] },
    ],
  },
  {
    group: 'Thanh toán',
    items: [{ href: '/hoa-don', label: 'Hóa đơn & công nợ', icon: '₫', roles: [R, M] }],
  },
  {
    group: 'Quản lý',
    items: [
      { href: '/danh-muc/dich-vu', label: 'Dịch vụ & bảng giá', icon: '☰', roles: [M] },
      { href: '/danh-muc/ca-truc', label: 'Ca trực bác sĩ', icon: '◷', roles: [M] },
      { href: '/danh-muc/ghe', label: 'Ghế nha khoa', icon: '⊞', roles: [M] },
      { href: '/nhan-vien', label: 'Nhân viên', icon: '♟', roles: [M] },
      { href: '/kho', label: 'Thuốc & vật tư', icon: '⬚', roles: [M] },
      { href: '/bao-cao', label: 'Báo cáo', icon: '▤', roles: [M] },
    ],
  },
];

export default function AppLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <Loading />;

  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label="Menu chính">
        <div className="brand">
          <div className="brand-logo">N</div>
          <div>
            <div className="brand-name">Nấm yêu</div>
            <div className="muted small">Phòng khám nha khoa</div>
          </div>
        </div>
        {NAV.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(user.role));
          if (!items.length) return null;
          return (
            <div key={g.group ?? 'home'} style={{ display: 'contents' }}>
              {g.group && <div className="nav-group">{g.group}</div>}
              {items.map((i) => (
                <Link key={i.href} href={i.href} className={`nav-link ${isActive(i.href) ? 'active' : ''}`}>
                  <span className="nav-icon" aria-hidden>{i.icon}</span>
                  {i.label}
                </Link>
              ))}
            </div>
          );
        })}
        <div className="user-box">
          <div>
            <strong>{user.full_name}</strong>
            <div className="muted small">{ROLE_LABEL[user.role]}</div>
          </div>
          <div className="row">
            <Link href="/doi-mat-khau" className="btn btn-ghost btn-sm">Đổi mật khẩu</Link>
            <button className="btn btn-ghost btn-sm" onClick={logout} type="button">Đăng xuất</button>
          </div>
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
