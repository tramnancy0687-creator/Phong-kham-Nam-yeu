'use client';

// UC09 Ghi phiếu điều trị · UC10 Sửa phiếu (lịch sử sửa) · UC11 Kê đơn thuốc · UC12 Ghi vật tư (+UC25 cảnh báo)
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Badge, Card, ConfirmButton, Empty, ErrorBox, Field, Loading, PageHeader, toast, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { age, fmtDateTime, isValidTooth, num } from '@/lib/format';

const TABLE_LABEL = {
  treatment_record: 'Phiếu',
  treatment_item: 'Việc điều trị',
  prescription_item: 'Đơn thuốc',
  supply_usage: 'Vật tư',
};

/** Chỉ hiện các trường thay đổi giữa hai bản ghi */
function diff(oldData, newData) {
  const skip = new Set(['updated_at', 'created_at', 'updated_by']);
  if (!newData) return Object.entries(oldData).filter(([k]) => !skip.has(k)).map(([k, v]) => `${k}: ${v ?? '∅'}`).join('\n');
  return Object.keys(newData)
    .filter((k) => !skip.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => `${k}: ${oldData[k] ?? '∅'} → ${newData[k] ?? '∅'}`)
    .join('\n') || '(không đổi nội dung)';
}

export default function TreatmentRecordPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isDoctor = user.role === 'doctor';
  const isReceptionist = user.role === 'receptionist';
  const { data: rec, error, reload } = useApi(`/records/${id}`);
  const { data: services } = useApi('/services');
  const { data: doctors } = useApi('/doctors');
  const { data: items } = useApi('/items?active=true');
  const [run, busy] = useAction();
  const [tooth, setTooth] = useState('');

  if (error) return <ErrorBox error={error} />;
  if (!rec) return <Loading />;

  const medicines = (items ?? []).filter((i) => i.item_type === 'medicine');
  const supplies = (items ?? []).filter((i) => i.item_type === 'supply');

  function saveRecord(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    run(async () => {
      await api(`/records/${id}`, { method: 'PUT', body: fd });
      reload();
    }, 'Đã lưu phiếu — lịch sử sửa đã được ghi');
  }

  function addItem(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    if (!isValidTooth(fd.tooth_number)) {
      toast('Số răng không hợp lệ (FDI: 11–48 răng vĩnh viễn, 51–85 răng sữa)', 'error');
      return;
    }
    run(async () => {
      await api(`/records/${id}/items`, { method: 'POST', body: fd });
      form.reset();
      setTooth('');
      reload();
    }, 'Đã thêm việc điều trị');
  }

  function addPrescription(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    run(async () => {
      await api(`/records/${id}/prescriptions`, { method: 'POST', body: fd });
      form.reset();
      reload();
    }, 'Đã kê thuốc');
  }

  function addSupply(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = Object.fromEntries(new FormData(form));
    run(async () => {
      const res = await api(`/records/${id}/supplies`, { method: 'POST', body: fd });
      if (res.warning) toast(`Cảnh báo tồn kho: ${res.warning}`, 'warn');
      form.reset();
      reload();
    }, 'Đã ghi vật tư, đã trừ tồn kho');
  }

  const remove = (path, msg) => run(async () => {
    await api(path, { method: 'DELETE' });
    reload();
  }, msg);

  function createInvoice() {
    run(async () => {
      const { id: invoiceId } = await api('/invoices', { method: 'POST', body: { treatment_record_id: rec.id } });
      router.push(`/hoa-don/${invoiceId}`);
    }, 'Đã lập hóa đơn');
  }

  const unbilled = rec.items.filter((i) => !i.billed).length;

  return (
    <>
      <PageHeader
        title={`Phiếu điều trị #${rec.id}`}
        uc="UC09 – UC12"
        subtitle={`${fmtDateTime(rec.visit_at)} · BS chính ${rec.doctor_name}${rec.chair_code ? ` · ghế ${rec.chair_code}` : ''}`}
        actions={
          <>
            {rec.invoice_id && <Link className="btn" href={`/hoa-don/${rec.invoice_id}`}>Xem hóa đơn #{rec.invoice_id}</Link>}
            {isReceptionist && !rec.treatment_plan_id && unbilled > 0 && (
              <button className="btn btn-primary" onClick={createInvoice} disabled={busy}>Lập hóa đơn ({unbilled} việc)</button>
            )}
          </>
        }
      />

      <div className="stack">
        <Card>
          <div className="row">
            <Link href={`/benh-nhan/${rec.patient_id}`}><strong>{rec.patient_name}</strong></Link>
            <span className="muted">· {age(rec.date_of_birth)} tuổi · {rec.phone}</span>
            {rec.plan_name && <Badge color="blue">Liệu trình: {rec.plan_name}</Badge>}
          </div>
          {rec.medical_history && <div className="allergy" style={{ marginTop: 10 }}>⚠ Tiền sử / dị ứng: {rec.medical_history}</div>}
        </Card>

        <Card title="Chẩn đoán" actions={rec.updated_by_name && <span className="muted small">Sửa lần cuối: {rec.updated_by_name}</span>}>
          {isDoctor ? (
            <form onSubmit={saveRecord} className="form-grid" key={rec.updated_at}>
              <Field label="Chẩn đoán" className="full"><textarea className="input" name="diagnosis" defaultValue={rec.diagnosis ?? ''} /></Field>
              <Field label="Ghi chú"><input className="input" name="note" defaultValue={rec.note ?? ''} /></Field>
              <Field label="Thuộc liệu trình" hint="Buổi trong liệu trình được đếm vào tiến độ (UC14)">
                <select className="input" name="treatment_plan_id" defaultValue={rec.treatment_plan_id ?? ''}>
                  <option value="">— Không —</option>
                  {rec.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <div className="full"><button className="btn btn-primary" disabled={busy}>Lưu phiếu</button></div>
            </form>
          ) : (
            <dl className="kv">
              <dt>Chẩn đoán</dt><dd>{rec.diagnosis || '—'}</dd>
              <dt>Ghi chú</dt><dd>{rec.note || '—'}</dd>
            </dl>
          )}
        </Card>

        <Card title="Các việc đã làm" actions={<span className="muted small">Mỗi việc ghi số răng (FDI) và bác sĩ thực hiện</span>}>
          {rec.items.length === 0 ? <Empty>Chưa ghi việc nào</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Dịch vụ</th><th>Răng</th><th className="num">SL</th><th>Bác sĩ thực hiện</th><th>Ghi chú</th><th /></tr></thead>
                <tbody>
                  {rec.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.service_name}</td>
                      <td>{it.tooth_number ?? <span className="muted">cả hàm</span>}</td>
                      <td className="num">{it.quantity}</td>
                      <td>{it.doctor_name}</td>
                      <td className="muted">{it.note}</td>
                      <td className="nowrap">
                        {it.billed ? <span className="badge badge-green">Đã tính tiền</span> : isDoctor && (
                          <ConfirmButton message="Xóa việc này? Thao tác được ghi vào lịch sử sửa." onConfirm={() => remove(`/treatment-items/${it.id}`, 'Đã xóa')} className="btn btn-ghost btn-sm">Xóa</ConfirmButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isDoctor && (
            <form onSubmit={addItem} className="inline-form" style={{ marginTop: 12 }}>
              <Field label="Dịch vụ">
                <select className="input" name="service_id" required defaultValue="">
                  <option value="" disabled>— Chọn —</option>
                  {(services ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Số răng">
                <input className="input" name="tooth_number" value={tooth} onChange={(e) => setTooth(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="vd. 36" style={{ borderColor: isValidTooth(tooth) ? undefined : 'var(--danger)' }} />
              </Field>
              <Field label="SL"><input className="input" name="quantity" type="number" min="1" defaultValue="1" style={{ width: 70 }} /></Field>
              <Field label="Bác sĩ thực hiện">
                <select className="input" name="performing_doctor_id" defaultValue={user.id}>
                  {(doctors ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </Field>
              <Field label="Ghi chú"><input className="input" name="note" /></Field>
              <button className="btn btn-primary" disabled={busy}>Thêm</button>
            </form>
          )}
        </Card>

        <div className="grid-2">
          <Card title="Đơn thuốc" actions={<span className="uc-tag">UC11</span>}>
            {rec.prescriptions.length === 0 ? <Empty>Chưa kê thuốc</Empty> : (
              <table className="table">
                <thead><tr><th>Thuốc</th><th className="num">SL</th><th>Liều dùng</th><th /></tr></thead>
                <tbody>
                  {rec.prescriptions.map((p) => (
                    <tr key={p.id}>
                      <td>{p.item_name}</td>
                      <td className="num">{num(p.quantity)} {p.unit}</td>
                      <td>{p.dosage}</td>
                      <td>{isDoctor && <ConfirmButton message="Xóa thuốc này khỏi đơn?" onConfirm={() => remove(`/prescriptions/${p.id}`, 'Đã xóa')}>Xóa</ConfirmButton>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {isDoctor && (
              <form onSubmit={addPrescription} className="form-grid" style={{ marginTop: 12 }}>
                <Field label="Thuốc" required>
                  <select className="input" name="item_id" required defaultValue="">
                    <option value="" disabled>— Chọn —</option>
                    {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                  </select>
                </Field>
                <Field label="Số lượng" required><input className="input" name="quantity" type="number" min="1" step="1" required /></Field>
                <Field label="Liều dùng" required className="full"><input className="input" name="dosage" required placeholder="vd. Ngày 2 lần, mỗi lần 1 viên sau ăn" /></Field>
                <div className="full"><button className="btn" disabled={busy}>Kê thuốc</button></div>
              </form>
            )}
          </Card>

          <Card title="Vật tư sử dụng" actions={<span className="uc-tag">UC12 · tự trừ kho</span>}>
            {rec.supplies.length === 0 ? <Empty>Chưa ghi vật tư</Empty> : (
              <table className="table">
                <thead><tr><th>Vật tư</th><th className="num">SL dùng</th><th className="num">Tồn hiện tại</th><th /></tr></thead>
                <tbody>
                  {rec.supplies.map((s) => (
                    <tr key={s.id}>
                      <td>{s.item_name}</td>
                      <td className="num">{num(s.quantity)} {s.unit}</td>
                      <td className="num" style={{ color: s.stock_quantity < s.min_threshold ? 'var(--danger)' : undefined }}>{num(s.stock_quantity)}</td>
                      <td>{isDoctor && <ConfirmButton message="Xóa dòng vật tư? Tồn kho sẽ được cộng lại." onConfirm={() => remove(`/supplies/${s.id}`, 'Đã xóa, đã hoàn kho')}>Xóa</ConfirmButton>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {isDoctor && (
              <form onSubmit={addSupply} className="inline-form" style={{ marginTop: 12 }}>
                <Field label="Vật tư">
                  <select className="input" name="item_id" required defaultValue="">
                    <option value="" disabled>— Chọn —</option>
                    {supplies.map((m) => <option key={m.id} value={m.id}>{m.name} (còn {num(m.stock_quantity)} {m.unit})</option>)}
                  </select>
                </Field>
                <Field label="SL"><input className="input" name="quantity" type="number" min="0.01" step="0.01" required style={{ width: 90 }} /></Field>
                <button className="btn" disabled={busy}>Ghi</button>
              </form>
            )}
          </Card>
        </div>

        <Card title="Lịch sử sửa phiếu" actions={<span className="uc-tag">UC10 · ghi tự động</span>}>
          {rec.history.length === 0 ? <Empty>Phiếu chưa bị sửa lần nào</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Thời điểm</th><th>Người sửa</th><th>Phần</th><th>Thao tác</th><th>Thay đổi</th></tr></thead>
                <tbody>
                  {rec.history.map((h) => (
                    <tr key={h.id}>
                      <td className="nowrap">{fmtDateTime(h.edited_at)}</td>
                      <td>{h.edited_by_name}</td>
                      <td>{TABLE_LABEL[h.table_name] ?? h.table_name}</td>
                      <td><span className={`badge ${h.action === 'DELETE' ? 'badge-red' : 'badge-orange'}`}>{h.action === 'DELETE' ? 'Xóa' : 'Sửa'}</span></td>
                      <td><div className="json-diff">{diff(h.old_data, h.new_data)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
