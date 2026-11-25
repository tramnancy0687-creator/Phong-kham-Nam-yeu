'use client';

// UC15 Lập hóa đơn (chốt giá) · UC16 Áp dụng giảm giá (QĐ3) · UC17 Thu tiền · UC18 Thu theo đợt liệu trình
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Card, ConfirmButton, Empty, ErrorBox, Field, Loading, PageHeader, Stat, StatusBadge, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, INVOICE_STATUS, METHOD, money } from '@/lib/format';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: inv, error, reload } = useApi(`/invoices/${id}`);
  const isReceptionist = user.role === 'receptionist';
  const { data: services } = useApi(isReceptionist ? '/services' : null);
  const [run, busy] = useAction();
  const [discounts, setDiscounts] = useState({});

  if (error) return <ErrorBox error={error} />;
  if (!inv) return <Loading />;

  const editable = isReceptionist && inv.status === 'issued';
  const refresh = () => {
    setDiscounts({});
    reload();
  };

  function lineDiscount(line) {
    const value = discounts[line.id];
    if (value === undefined || Number(value) === line.discount_amount) return;
    run(async () => {
      await api(`/invoice-lines/${line.id}/discount`, { method: 'PUT', body: { discount_amount: Number(value || 0) } });
      refresh();
    }, 'Đã cập nhật giảm giá dòng');
  }

  function totalDiscount(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    run(async () => {
      await api(`/invoices/${id}/discount`, { method: 'POST', body: { total_discount: Number(fd.total_discount) } });
      form.reset();
      refresh();
    }, 'Đã phân bổ giảm giá xuống từng dòng');
  }

  function addLine(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    run(async () => {
      await api(`/invoices/${id}/lines`, { method: 'POST', body: fd });
      form.reset();
      reload();
    }, 'Đã thêm dòng, giá lấy theo bảng giá hiện hành');
  }

  function pay(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    run(async () => {
      await api(`/invoices/${id}/payments`, { method: 'POST', body: { ...fd, amount: Number(fd.amount) } });
      form.reset();
      reload();
    }, 'Đã thu tiền');
  }

  const removeLine = (lineId) => run(async () => {
    await api(`/invoice-lines/${lineId}`, { method: 'DELETE' });
    reload();
  }, 'Đã xóa dòng');

  const cancelInvoice = () => run(async () => {
    await api(`/invoices/${id}/cancel`, { method: 'POST', body: {} });
    reload();
  }, 'Đã hủy hóa đơn');

  // Đợt gợi ý: đợt đầu tiên chưa thu đủ
  const nextInstallment = inv.installments.find((i) => i.paid_amount < i.amount);
  const suggested = nextInstallment ? Math.min(nextInstallment.amount - nextInstallment.paid_amount, inv.debt_amount) : inv.debt_amount;

  return (
    <>
      <PageHeader
        title={`Hóa đơn #${inv.invoice_id}`}
        uc="UC15 – UC18"
        subtitle={<>
          <Link href={`/benh-nhan/${inv.patient_id}`}>{inv.patient_name}</Link> · {inv.phone} · lập {fmtDateTime(inv.created_at)} bởi {inv.created_by_name}
          {inv.treatment_record_id && <> · <Link href={`/phieu-dieu-tri/${inv.treatment_record_id}`}>phiếu điều trị #{inv.treatment_record_id}</Link></>}
          {inv.treatment_plan_id && <> · <Link href={`/lieu-trinh/${inv.treatment_plan_id}`}>{inv.plan_name}</Link></>}
        </>}
        actions={
          <>
            <StatusBadge map={INVOICE_STATUS} value={inv.status} />
            {editable && inv.payments.length === 0 && (
              <ConfirmButton className="btn btn-danger" message="Hủy hóa đơn này? Các việc điều trị sẽ quay về trạng thái chưa tính tiền." onConfirm={cancelInvoice}>Hủy hóa đơn</ConfirmButton>
            )}
          </>
        }
      />

      <div className="stack">
        <div className="grid-4">
          <Stat label="Tạm tính" value={money(inv.gross_amount)} />
          <Stat label="Giảm giá" value={money(inv.discount_amount)} />
          <Stat label="Đã thu" value={money(inv.paid_amount)} tone="good" />
          <Stat label="Còn nợ" value={money(inv.debt_amount)} tone={inv.debt_amount > 0 ? 'danger' : 'good'} hint={`Tổng phải trả ${money(inv.total_amount)}`} />
        </div>

        <Card title="Chi tiết dịch vụ" actions={<span className="muted small">Giảm giá lưu trên từng dòng để báo cáo doanh thu theo bác sĩ luôn đúng (QĐ3)</span>}>
          {inv.lines.length === 0 ? <Empty>Hóa đơn chưa có dòng nào</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Dịch vụ</th><th>Răng</th><th>Bác sĩ thực hiện</th><th className="num">SL</th><th className="num">Đơn giá (đã chốt)</th><th className="num">Giảm giá</th><th className="num">Thành tiền</th><th /></tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.service_name}{l.description && <div className="muted small">{l.description}</div>}</td>
                      <td>{l.tooth_number ?? '—'}</td>
                      <td>{l.doctor_name ?? '—'}</td>
                      <td className="num">{l.quantity}</td>
                      <td className="num">{money(l.unit_price)}</td>
                      <td className="num">
                        {editable ? (
                          <input
                            className="input num"
                            style={{ width: 120 }}
                            type="number"
                            min="0"
                            step="1000"
                            value={discounts[l.id] ?? l.discount_amount}
                            onChange={(e) => setDiscounts((d) => ({ ...d, [l.id]: e.target.value }))}
                            onBlur={() => lineDiscount(l)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            aria-label={`Giảm giá ${l.service_name}`}
                          />
                        ) : money(l.discount_amount)}
                      </td>
                      <td className="num"><strong>{money(l.line_total)}</strong></td>
                      <td>{editable && inv.payments.length === 0 && <ConfirmButton message="Xóa dòng này?" onConfirm={() => removeLine(l.id)}>Xóa</ConfirmButton>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={5}>Tổng</td><td className="num">{money(inv.discount_amount)}</td><td className="num">{money(inv.total_amount)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
          )}

          {editable && (
            <div className="grid-2" style={{ marginTop: 16 }}>
              <form onSubmit={totalDiscount} className="inline-form">
                <Field label="Giảm giá trên tổng (đ)" hint="Hệ thống tự chia xuống từng dòng theo tỷ lệ tiền">
                  <input className="input" name="total_discount" type="number" min="0" step="1000" max={inv.gross_amount} required />
                </Field>
                <button className="btn" disabled={busy}>Áp dụng</button>
              </form>
              {!inv.treatment_plan_id && (
                <form onSubmit={addLine} className="inline-form">
                  <Field label="Thêm dịch vụ">
                    <select className="input" name="service_id" required defaultValue="">
                      <option value="" disabled>— Chọn —</option>
                      {(services ?? []).filter((s) => s.is_active && s.current_price !== null).map((s) => (
                        <option key={s.id} value={s.id}>{s.name} — {money(s.current_price)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="SL"><input className="input" name="quantity" type="number" min="1" defaultValue="1" style={{ width: 70 }} /></Field>
                  <button className="btn" disabled={busy}>Thêm</button>
                </form>
              )}
            </div>
          )}
        </Card>

        <div className="grid-2">
          <Card title="Các lần thu tiền" actions={<span className="uc-tag">UC17</span>}>
            {inv.payments.length === 0 ? <Empty>Chưa thu lần nào</Empty> : (
              <table className="table">
                <thead><tr><th>Thời điểm</th><th>Hình thức</th>{inv.treatment_plan_id && <th>Đợt</th>}<th className="num">Số tiền</th><th>Người thu</th></tr></thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="nowrap">{fmtDateTime(p.paid_at)}</td>
                      <td>{METHOD[p.method]}</td>
                      {inv.treatment_plan_id && <td>{p.installment_no ? `Đợt ${p.installment_no}` : '—'}</td>}
                      <td className="num">{money(p.amount)}</td>
                      <td className="muted">{p.received_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {editable && inv.debt_amount > 0 && (
            <Card title="Thu tiền" actions={inv.treatment_plan_id && <span className="uc-tag">UC18 · theo đợt</span>}>
              <form onSubmit={pay} className="form-grid" key={`${inv.paid_amount}-${suggested}`}>
                {inv.installments.length > 0 && (
                  <Field label="Đợt liệu trình" className="full">
                    <select className="input" name="installment_id" defaultValue={nextInstallment?.id ?? ''}>
                      <option value="">— Không theo đợt —</option>
                      {inv.installments.map((i) => (
                        <option key={i.id} value={i.id}>
                          Đợt {i.installment_no}: {money(i.amount)} (đã thu {money(i.paid_amount)}){i.due_date ? ` · hạn ${fmtDate(i.due_date)}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Số tiền (đ)" required hint={`Còn nợ ${money(inv.debt_amount)}`}>
                  <input className="input" name="amount" type="number" min="1000" step="1000" max={inv.debt_amount} defaultValue={suggested} required />
                </Field>
                <Field label="Hình thức" required>
                  <select className="input" name="method" defaultValue="cash">
                    {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Ghi chú" className="full"><input className="input" name="note" /></Field>
                <div className="full"><button className="btn btn-primary" disabled={busy}>Thu tiền</button></div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
