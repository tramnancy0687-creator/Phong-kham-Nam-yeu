'use client';

// UC14 Theo dõi tiến độ liệu trình · lập hóa đơn liệu trình để thu theo đợt (UC18)
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Card, ConfirmButton, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Progress, Stat, StatusBadge, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, INVOICE_STATUS, money, PLAN_STATUS } from '@/lib/format';

export default function PlanDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { data: plan, error, reload } = useApi(`/plans/${id}`);
  const { data: services } = useApi(user.role === 'receptionist' ? '/services' : null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [run, busy] = useAction();

  if (error) return <ErrorBox error={error} />;
  if (!plan) return <Loading />;

  const isDoctor = user.role === 'doctor';
  const isReceptionist = user.role === 'receptionist';
  const activeInvoice = plan.invoices.find((i) => i.status === 'issued');

  const setStatus = (status, msg) => run(async () => {
    await api(`/plans/${id}`, { method: 'PUT', body: { status } });
    reload();
  }, msg);

  function newSession() {
    run(async () => {
      const { id: recordId } = await api('/records', { method: 'POST', body: { patient_id: plan.patient_id, treatment_plan_id: plan.plan_id } });
      router.push(`/phieu-dieu-tri/${recordId}`);
    });
  }

  function createInvoice(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    run(async () => {
      const { id: invoiceId } = await api('/invoices', { method: 'POST', body: { treatment_plan_id: plan.plan_id, service_id: fd.service_id } });
      router.push(`/hoa-don/${invoiceId}`);
    }, 'Đã lập hóa đơn liệu trình');
  }

  return (
    <>
      <PageHeader
        title={plan.plan_name}
        uc="UC14"
        subtitle={<>Bệnh nhân <Link href={`/benh-nhan/${plan.patient_id}`}>{plan.patient_name}</Link> · BS {plan.doctor_name} · bắt đầu {fmtDate(plan.start_date)}</>}
        actions={
          <>
            <StatusBadge map={PLAN_STATUS} value={plan.status} />
            {isDoctor && plan.status === 'in_progress' && (
              <>
                <button className="btn btn-primary" onClick={newSession} disabled={busy}>+ Ghi buổi điều trị</button>
                <ConfirmButton className="btn" message="Đánh dấu liệu trình đã hoàn thành?" onConfirm={() => setStatus('completed', 'Đã hoàn thành liệu trình')}>Hoàn thành</ConfirmButton>
                <ConfirmButton className="btn btn-danger" message="Hủy liệu trình này?" onConfirm={() => setStatus('cancelled', 'Đã hủy liệu trình')}>Hủy</ConfirmButton>
              </>
            )}
            {isReceptionist && !activeInvoice && plan.status !== 'cancelled' && (
              <button className="btn btn-primary" onClick={() => setInvoiceOpen(true)}>Lập hóa đơn liệu trình</button>
            )}
            {activeInvoice && <Link className="btn" href={`/hoa-don/${activeInvoice.invoice_id}`}>Hóa đơn #{activeInvoice.invoice_id}</Link>}
          </>
        }
      />

      <div className="stack">
        <div className="grid-4">
          <Stat label="Đã làm" value={`${plan.done_sessions}/${plan.total_sessions} buổi`} hint={<Progress value={plan.done_sessions} max={plan.total_sessions} />} />
          <Stat label="Còn lại" value={`${plan.remaining_sessions} buổi`} />
          <Stat label="Tổng tiền" value={money(plan.total_amount)} />
          <Stat label="Đã thu" value={money(plan.paid_amount)} tone={plan.paid_amount < plan.total_amount ? 'warn' : 'good'} hint={`Còn ${money(plan.total_amount - plan.paid_amount)}`} />
        </div>

        <div className="grid-2">
          <Card title="Các đợt thanh toán">
            {plan.installments.length === 0 ? <Empty>Không chia đợt</Empty> : (
              <table className="table">
                <thead><tr><th>Đợt</th><th>Hạn</th><th className="num">Số tiền</th><th className="num">Đã thu</th><th /></tr></thead>
                <tbody>
                  {plan.installments.map((i) => (
                    <tr key={i.id}>
                      <td>Đợt {i.installment_no}</td>
                      <td>{fmtDate(i.due_date)}</td>
                      <td className="num">{money(i.amount)}</td>
                      <td className="num">{money(i.paid_amount)}</td>
                      <td>{i.paid_amount >= i.amount ? <span className="badge badge-green">Đủ</span> : <span className="badge badge-orange">Chưa đủ</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {plan.note && <p className="muted">{plan.note}</p>}
          </Card>

          <Card title={`Các buổi đã làm (${plan.sessions.length})`}>
            {plan.sessions.length === 0 ? <Empty>Chưa có buổi nào</Empty> : (
              <table className="table">
                <thead><tr><th>#</th><th>Ngày</th><th>Nội dung</th><th>Bác sĩ</th></tr></thead>
                <tbody>
                  {plan.sessions.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td className="nowrap"><Link href={`/phieu-dieu-tri/${s.id}`}>{fmtDateTime(s.visit_at)}</Link></td>
                      <td>{s.diagnosis || '—'}</td>
                      <td>{s.doctor_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {plan.invoices.length > 0 && (
          <Card title="Hóa đơn">
            <table className="table">
              <thead><tr><th>Số</th><th>Ngày</th><th className="num">Tổng</th><th className="num">Đã thu</th><th className="num">Còn nợ</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {plan.invoices.map((i) => (
                  <tr key={i.invoice_id}>
                    <td>{user.role === 'doctor' ? `#${i.invoice_id}` : <Link href={`/hoa-don/${i.invoice_id}`}>#{i.invoice_id}</Link>}</td>
                    <td>{fmtDate(i.created_at)}</td>
                    <td className="num">{money(i.total_amount)}</td>
                    <td className="num">{money(i.paid_amount)}</td>
                    <td className="num">{money(i.debt_amount)}</td>
                    <td><StatusBadge map={INVOICE_STATUS} value={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Modal open={invoiceOpen} title="Lập hóa đơn liệu trình" onClose={() => setInvoiceOpen(false)}>
        <form onSubmit={createInvoice} className="stack">
          <p className="muted" style={{ margin: 0 }}>Hóa đơn ghi trọn gói {money(plan.total_amount)}. Lễ tân thu theo từng đợt ở màn hình hóa đơn.</p>
          <Field label="Dịch vụ của liệu trình" required>
            <select className="input" name="service_id" required defaultValue="">
              <option value="" disabled>— Chọn dịch vụ —</option>
              {(services ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <div><button className="btn btn-primary" disabled={busy}>Lập hóa đơn</button></div>
        </form>
      </Modal>
    </>
  );
}
