'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Card, Empty, ErrorBox, Loading, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { useApi } from '@/lib/api';
import { APPT_STATUS, fmtDate, fmtTime, money, num, todayStr } from '@/lib/format';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, error, loading } = useApi('/dashboard');
  const isDoctor = user.role === 'doctor';

  return (
    <>
      <PageHeader
        title={`Xin chào, ${user.full_name}`}
        subtitle={`Hôm nay ${fmtDate(todayStr())}${isDoctor ? ' · lịch của bạn' : ''}`}
        actions={user.role !== 'manager' && <Link className="btn btn-primary" href="/lich-hen">Mở lịch hẹn</Link>}
      />
      <ErrorBox error={error} />
      {loading && <Loading />}
      {data && (
        <div className="stack">
          <div className="grid-4">
            <Stat label="Lịch hẹn hôm nay" value={data.appointments.total} hint={`${data.appointments.waiting} chờ · ${data.appointments.done} đã khám`} />
            <Stat label="Liệu trình đang điều trị" value={data.plans_in_progress} />
            {'revenue_today' in data ? (
              <>
                <Stat label="Đã thu hôm nay" value={money(data.revenue_today)} tone="good" hint={`Tháng này: ${money(data.revenue_month)}`} />
                <Stat label="Tổng công nợ" value={money(data.total_debt)} tone={data.total_debt > 0 ? 'danger' : ''} />
              </>
            ) : (
              <Stat label="Lịch đã hủy hôm nay" value={data.appointments.cancelled} />
            )}
          </div>

          <div className="grid-2">
            <Card title="Lịch hẹn hôm nay" actions={<Link href="/lich-hen">Xem lưới lịch →</Link>}>
              {data.today.length === 0 ? <Empty>Không có lịch hẹn hôm nay</Empty> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Giờ</th><th>Bệnh nhân</th><th>Dịch vụ</th><th>Bác sĩ · Ghế</th><th>Trạng thái</th></tr></thead>
                    <tbody>
                      {data.today.map((a) => (
                        <tr key={a.id}>
                          <td className="nowrap">{fmtTime(a.start_at)}</td>
                          <td>{a.patient_name}</td>
                          <td>{a.service_name}</td>
                          <td className="muted">{a.doctor_name} · {a.chair_code}</td>
                          <td>
                            {a.record_id
                              ? <Link href={`/phieu-dieu-tri/${a.record_id}`}><StatusBadge map={APPT_STATUS} value={a.status} /></Link>
                              : <StatusBadge map={APPT_STATUS} value={a.status} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Cảnh báo tồn kho" actions={user.role === 'manager' && <Link href="/kho">Quản lý kho →</Link>}>
              {data.alerts.length === 0 ? <Empty>Không có vật tư dưới ngưỡng</Empty> : (
                <table className="table">
                  <thead><tr><th>Thuốc / vật tư</th><th className="num">Tồn</th><th className="num">Ngưỡng</th></tr></thead>
                  <tbody>
                    {data.alerts.map((a) => (
                      <tr key={a.name}>
                        <td>{a.name}</td>
                        <td className="num" style={{ color: 'var(--danger)' }}>{num(a.stock_quantity)} {a.unit}</td>
                        <td className="num muted">{num(a.min_threshold)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
