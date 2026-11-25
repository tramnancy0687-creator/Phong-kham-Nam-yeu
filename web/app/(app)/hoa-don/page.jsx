'use client';

// UC15 Lập hóa đơn · UC19 Xem công nợ hóa đơn / bệnh nhân
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge, Tabs, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, INVOICE_STATUS, money } from '@/lib/format';

const KIND = { record: 'Khám', plan: 'Liệu trình', other: 'Khác' };

export default function InvoicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isReceptionist = user.role === 'receptionist';
  const [tab, setTab] = useState(isReceptionist ? 'pending' : 'debts');
  const pending = useApi('/invoices/pending-records');
  const debts = useApi('/debts');
  const [debtOnly, setDebtOnly] = useState(false);
  const invoices = useApi(`/invoices?debt_only=${debtOnly}`);
  const [run, busy] = useAction();

  function createFromRecord(recordId) {
    run(async () => {
      const { id } = await api('/invoices', { method: 'POST', body: { treatment_record_id: recordId } });
      router.push(`/hoa-don/${id}`);
    }, 'Đã lập hóa đơn, giá đã được chốt');
  }

  const totalDebt = (debts.data ?? []).reduce((s, d) => s + d.total_debt, 0);

  return (
    <>
      <PageHeader title="Hóa đơn & công nợ" uc="UC15 · UC19" subtitle="Giá được chốt tại thời điểm lập hóa đơn; một hóa đơn thu được nhiều lần" />
      <Card>
        <Tabs
          tabs={[
            ...(isReceptionist ? [{ key: 'pending', label: 'Chờ lập hóa đơn', count: pending.data?.length }] : []),
            { key: 'invoices', label: 'Hóa đơn' },
            { key: 'debts', label: 'Công nợ theo bệnh nhân', count: debts.data?.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'pending' && (
          <>
            <ErrorBox error={pending.error} />
            {!pending.data ? <Loading /> : pending.data.length === 0 ? <Empty>Không có phiếu điều trị nào chờ lập hóa đơn</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Ngày khám</th><th>Bệnh nhân</th><th>SĐT</th><th>Bác sĩ</th><th className="num">Việc chưa tính tiền</th><th /></tr></thead>
                  <tbody>
                    {pending.data.map((r) => (
                      <tr key={r.record_id}>
                        <td className="nowrap"><Link href={`/phieu-dieu-tri/${r.record_id}`}>{fmtDateTime(r.visit_at)}</Link></td>
                        <td><Link href={`/benh-nhan/${r.patient_id}`}>{r.patient_name}</Link></td>
                        <td>{r.phone}</td>
                        <td>{r.doctor_name}</td>
                        <td className="num">{r.unbilled_items}</td>
                        <td><button className="btn btn-primary btn-sm" onClick={() => createFromRecord(r.record_id)} disabled={busy}>Lập hóa đơn</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'invoices' && (
          <>
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={debtOnly} onChange={(e) => setDebtOnly(e.target.checked)} /> Chỉ hóa đơn còn nợ
            </label>
            <ErrorBox error={invoices.error} />
            {!invoices.data ? <Loading /> : invoices.data.length === 0 ? <Empty /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Số</th><th>Ngày lập</th><th>Bệnh nhân</th><th>Loại</th><th className="num">Tổng</th><th className="num">Đã thu</th><th className="num">Còn nợ</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {invoices.data.map((i) => (
                      <tr key={i.invoice_id} className="clickable" onClick={() => router.push(`/hoa-don/${i.invoice_id}`)}>
                        <td><Link href={`/hoa-don/${i.invoice_id}`}>#{i.invoice_id}</Link></td>
                        <td className="nowrap">{fmtDate(i.created_at)}</td>
                        <td>{i.patient_name}<div className="muted small">{i.phone}</div></td>
                        <td>{KIND[i.kind]}</td>
                        <td className="num">{money(i.total_amount)}</td>
                        <td className="num">{money(i.paid_amount)}</td>
                        <td className="num" style={{ color: i.debt_amount > 0 && i.status === 'issued' ? 'var(--danger)' : undefined }}>{money(i.debt_amount)}</td>
                        <td><StatusBadge map={INVOICE_STATUS} value={i.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'debts' && (
          <>
            <ErrorBox error={debts.error} />
            {!debts.data ? <Loading /> : debts.data.length === 0 ? <Empty>Không có công nợ</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Bệnh nhân</th><th>SĐT</th><th className="num">Số hóa đơn nợ</th><th className="num">Tổng nợ</th></tr></thead>
                  <tbody>
                    {debts.data.map((d) => (
                      <tr key={d.patient_id}>
                        <td><Link href={`/benh-nhan/${d.patient_id}`}>{d.patient_name}</Link></td>
                        <td>{d.phone}</td>
                        <td className="num">{d.unpaid_invoices}</td>
                        <td className="num" style={{ color: 'var(--danger)' }}>{money(d.total_debt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={3}>Tổng công nợ</td><td className="num">{money(totalDebt)}</td></tr></tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
