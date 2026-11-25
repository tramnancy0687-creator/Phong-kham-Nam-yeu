'use client';

// UC27 Xem báo cáo — 8 câu hỏi của quản lý (UC27.1 – UC27.8)
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Empty, ErrorBox, Field, Loading, PageHeader, Progress, Stat, Tabs, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { addDays, fmtDate, fmtMonth, ITEM_TYPE, money, num, todayStr } from '@/lib/format';

const REPORTS = [
  { key: 'revenue', label: '1. Doanh thu bác sĩ' },
  { key: 'chairs', label: '2. Ghế trống' },
  { key: 'inactive', label: '3. Lâu không quay lại' },
  { key: 'cancel', label: '4. Hủy lịch' },
  { key: 'debts', label: '5. Công nợ' },
  { key: 'plans', label: '6. Liệu trình đang dở' },
  { key: 'stock', label: '7. Sắp hết hàng' },
  { key: 'growth', label: '8. Tăng / giảm doanh thu' },
];

function Bar({ value, max }) {
  return <div className="bar" style={{ width: `${max ? Math.max(1, (value / max) * 100) : 0}%` }} />;
}

export default function ReportsPage() {
  const [tab, setTab] = useState('revenue');
  const [run, busy] = useAction();

  function archive() {
    run(async () => {
      const { archived } = await api('/admin/archive-expired', { method: 'POST' });
      return archived;
    }, 'Đã chạy lưu trữ hồ sơ quá 5 năm');
  }

  return (
    <>
      <PageHeader
        title="Báo cáo"
        uc="UC27"
        subtitle="8 câu hỏi của quản lý"
        actions={<button className="btn btn-ghost btn-sm" onClick={archive} disabled={busy} title="UC26 — bình thường hệ thống tự chạy mỗi ngày">Chạy lưu trữ hồ sơ 5 năm</button>}
      />
      <Card>
        <Tabs tabs={REPORTS} value={tab} onChange={setTab} />
        {tab === 'revenue' && <DoctorRevenue />}
        {tab === 'chairs' && <ChairFree />}
        {tab === 'inactive' && <Inactive />}
        {tab === 'cancel' && <Cancellations />}
        {tab === 'debts' && <Debts />}
        {tab === 'plans' && <Plans />}
        {tab === 'stock' && <LowStock />}
        {tab === 'growth' && <Growth />}
      </Card>
    </>
  );
}

// UC27.1
function DoctorRevenue() {
  const { data, error } = useApi('/reports/doctor-revenue');
  const months = useMemo(() => [...new Set((data ?? []).map((r) => r.month))], [data]);
  const [month, setMonth] = useState(null);
  const current = month ?? months[0];
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty />;
  const rows = data.filter((r) => r.month === current);
  const max = Math.max(...rows.map((r) => r.revenue));
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  return (
    <div className="stack">
      <div className="row">
        <span className="muted">Tháng</span>
        <select className="input" style={{ width: 140 }} value={current} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <span className="muted small">Tính theo bác sĩ thực hiện từng dòng dịch vụ (QĐ1), sau giảm giá</span>
      </div>
      <table className="table">
        <thead><tr><th>Bác sĩ</th><th style={{ width: '45%' }} /><th className="num">Doanh thu</th><th className="num">Tỷ trọng</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.doctor_id}>
              <td>{r.doctor_name}</td>
              <td><Bar value={r.revenue} max={max} /></td>
              <td className="num">{money(r.revenue)}</td>
              <td className="num">{Math.round((r.revenue / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={2}>Tổng</td><td className="num">{money(total)}</td><td /></tr></tfoot>
      </table>
    </div>
  );
}

// UC27.2
function ChairFree() {
  const [from, setFrom] = useState(addDays(todayStr(), -29));
  const [to, setTo] = useState(todayStr());
  const { data, error } = useApi(`/reports/chair-free?from=${from}&to=${to}&open=08:00&close=20:00`);
  const chairs = useMemo(() => [...new Set((data ?? []).map((r) => r.chair_code))].sort(), [data]);
  const slots = useMemo(() => [...new Set((data ?? []).map((r) => r.slot_start))].sort(), [data]);
  const cell = (c, s) => data.find((r) => r.chair_code === c && r.slot_start === s);
  return (
    <div className="stack">
      <div className="inline-form">
        <Field label="Từ ngày"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Đến ngày"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <span className="muted small">Ô càng đậm = khung giờ càng kín lịch. Số = số buổi còn trống.</span>
      </div>
      <ErrorBox error={error} />
      {!data ? <Loading /> : (
        <>
          <div className="muted">Trống nhiều nhất: {data.slice(0, 3).map((r) => `${r.chair_code} lúc ${r.slot_start.slice(0, 5)} (${r.free_slots}/${r.total_slots} buổi trống)`).join(' · ')}</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Khung giờ</th>{chairs.map((c) => <th key={c} className="num">{c}</th>)}</tr></thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s}>
                    <td className="nowrap">{s.slice(0, 5)}</td>
                    {chairs.map((c) => {
                      const r = cell(c, s);
                      const used = r ? r.booked_slots / r.total_slots : 0;
                      return (
                        <td key={c} className="num" style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(used * 70)}%, transparent)` }}>
                          {r?.free_slots}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// UC27.3
function Inactive() {
  const { data, error } = useApi('/reports/inactive-patients');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty>Không có bệnh nhân nào quá 6 tháng chưa quay lại</Empty>;
  return (
    <table className="table">
      <thead><tr><th>Bệnh nhân</th><th>SĐT</th><th>Khám gần nhất</th><th className="num">Số tháng</th></tr></thead>
      <tbody>
        {data.map((p) => {
          const months = Math.floor((Date.now() - new Date(p.last_visit_at.replace(' ', 'T')).getTime()) / (30.44 * 86400000));
          return (
            <tr key={p.patient_id}>
              <td><Link href={`/benh-nhan/${p.patient_id}`}>{p.patient_name}</Link></td>
              <td>{p.phone}</td>
              <td>{fmtDate(p.last_visit_at)}</td>
              <td className="num">{months}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// UC27.4
function Cancellations() {
  const { data, error } = useApi('/reports/cancellations');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty>Chưa có lịch bị hủy</Empty>;
  const byService = Object.values(data.reduce((acc, r) => {
    (acc[r.service_id] ??= { name: r.service_name, total: 0, reasons: [] }).total += r.cancelled_count;
    acc[r.service_id].reasons.push(r);
    return acc;
  }, {})).sort((a, b) => b.total - a.total);
  const max = byService[0].total;
  return (
    <table className="table">
      <thead><tr><th>Dịch vụ</th><th style={{ width: '30%' }} /><th className="num">Số lịch hủy</th><th>Lý do</th></tr></thead>
      <tbody>
        {byService.map((s) => (
          <tr key={s.name}>
            <td>{s.name}</td>
            <td><Bar value={s.total} max={max} /></td>
            <td className="num">{s.total}</td>
            <td>{s.reasons.map((r) => `${r.reason} (${r.cancelled_count})`).join('; ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// UC27.5
function Debts() {
  const { data, error } = useApi('/reports/debts');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty>Không có công nợ</Empty>;
  const total = data.reduce((s, d) => s + d.total_debt, 0);
  return (
    <table className="table">
      <thead><tr><th>Bệnh nhân</th><th>SĐT</th><th className="num">Số hóa đơn nợ</th><th className="num">Còn nợ</th></tr></thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.patient_id}>
            <td><Link href={`/benh-nhan/${d.patient_id}`}>{d.patient_name}</Link></td>
            <td>{d.phone}</td>
            <td className="num">{d.unpaid_invoices}</td>
            <td className="num" style={{ color: 'var(--danger)' }}>{money(d.total_debt)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={3}>Tổng tiền khách còn nợ</td><td className="num">{money(total)}</td></tr></tfoot>
    </table>
  );
}

// UC27.6
function Plans() {
  const { data, error } = useApi('/reports/plans-in-progress');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty>Không có liệu trình đang dở</Empty>;
  return (
    <table className="table">
      <thead><tr><th>Liệu trình</th><th>Bệnh nhân</th><th>Bác sĩ</th><th style={{ minWidth: 160 }}>Tiến độ</th><th className="num">Còn lại</th></tr></thead>
      <tbody>
        {data.map((p) => (
          <tr key={p.plan_id}>
            <td><Link href={`/lieu-trinh/${p.plan_id}`}>{p.plan_name}</Link></td>
            <td>{p.patient_name}</td>
            <td>{p.doctor_name}</td>
            <td><Progress value={p.done_sessions} max={p.total_sessions} /><span className="small muted">{p.done_sessions}/{p.total_sessions}</span></td>
            <td className="num"><strong>{p.remaining_sessions}</strong> buổi</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// UC27.7
function LowStock() {
  const { data, error } = useApi('/reports/low-stock');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty>Không có thuốc / vật tư sắp hết</Empty>;
  return (
    <table className="table">
      <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th className="num">Tồn</th><th className="num">Ngưỡng</th><th className="num">Cần nhập thêm</th></tr></thead>
      <tbody>
        {data.map((m) => (
          <tr key={m.item_id}>
            <td><code>{m.code}</code></td>
            <td>{m.name}</td>
            <td>{ITEM_TYPE[m.item_type]}</td>
            <td className="num" style={{ color: m.stock_quantity < m.min_threshold ? 'var(--danger)' : 'var(--warn)' }}>{num(m.stock_quantity)} {m.unit}</td>
            <td className="num">{num(m.min_threshold)}</td>
            <td className="num">{m.shortage > 0 ? num(m.shortage) : 'chạm ngưỡng'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// UC27.8
function Growth() {
  const { data, error } = useApi('/reports/monthly-revenue');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  if (!data.length) return <Empty />;
  const latest = data[0];
  const max = Math.max(...data.map((m) => m.revenue));
  return (
    <div className="stack">
      <div className="grid-3">
        <Stat label={`Doanh thu ${fmtMonth(latest.month)}`} value={money(latest.revenue)} />
        <Stat label="Tháng trước" value={money(latest.prev_month_revenue)} />
        <Stat
          label="Thay đổi"
          value={latest.change_percent === null ? '—' : `${latest.change_percent > 0 ? '+' : ''}${num(latest.change_percent)}%`}
          tone={latest.change_percent === null ? '' : latest.change_percent >= 0 ? 'good' : 'danger'}
        />
      </div>
      <table className="table">
        <thead><tr><th>Tháng</th><th style={{ width: '40%' }} /><th className="num">Doanh thu (tiền thực thu)</th><th className="num">So với tháng trước</th></tr></thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.month}>
              <td>{fmtMonth(m.month)}</td>
              <td><Bar value={m.revenue} max={max} /></td>
              <td className="num">{money(m.revenue)}</td>
              <td className="num" style={{ color: m.change_percent === null ? undefined : m.change_percent >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {m.change_percent === null ? '—' : `${m.change_percent > 0 ? '▲ +' : '▼ '}${num(m.change_percent)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
