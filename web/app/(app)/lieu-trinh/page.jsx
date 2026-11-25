'use client';

// UC13 Lập liệu trình · UC14 Theo dõi tiến độ liệu trình
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PatientPicker from '@/components/PatientPicker';
import { Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Progress, StatusBadge, Tabs, toast, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, money, PLAN_STATUS, todayStr } from '@/lib/format';

export default function PlansPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState('in_progress');
  const { data, error, loading } = useApi(`/plans${status ? `?status=${status}` : ''}`);
  const [open, setOpen] = useState(false);
  const isDoctor = user.role === 'doctor';

  return (
    <>
      <PageHeader
        title="Liệu trình"
        uc="UC13 · UC14"
        subtitle="Niềng răng, implant… gom nhiều buổi, chia đợt thanh toán"
        actions={isDoctor && <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Lập liệu trình</button>}
      />
      <Card>
        <Tabs
          tabs={[
            { key: 'in_progress', label: 'Đang điều trị' },
            { key: 'completed', label: 'Hoàn thành' },
            { key: 'cancelled', label: 'Đã hủy' },
            { key: '', label: 'Tất cả' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <ErrorBox error={error} />
        {loading && !data && <Loading />}
        {data && data.length === 0 && <Empty>Không có liệu trình</Empty>}
        {data && data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Liệu trình</th><th>Bệnh nhân</th><th>Bác sĩ</th><th>Bắt đầu</th><th style={{ minWidth: 180 }}>Tiến độ</th><th className="num">Đã thu / Tổng</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.plan_id} className="clickable" onClick={() => router.push(`/lieu-trinh/${p.plan_id}`)}>
                    <td><Link href={`/lieu-trinh/${p.plan_id}`}>{p.plan_name}</Link></td>
                    <td>{p.patient_name}</td>
                    <td>{p.doctor_name}</td>
                    <td>{fmtDate(p.start_date)}</td>
                    <td>
                      <Progress value={p.done_sessions} max={p.total_sessions} />
                      <span className="small muted">{p.done_sessions}/{p.total_sessions} buổi · còn {p.remaining_sessions}</span>
                    </td>
                    <td className="num">{money(p.paid_amount)}<div className="muted small">/ {money(p.total_amount)}</div></td>
                    <td><StatusBadge map={PLAN_STATUS} value={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={open} title="Lập liệu trình" onClose={() => setOpen(false)} wide>
        <PlanForm onCreated={(id) => router.push(`/lieu-trinh/${id}`)} />
      </Modal>
    </>
  );
}

function PlanForm({ onCreated }) {
  const [patient, setPatient] = useState(null);
  const [total, setTotal] = useState('');
  const [installments, setInstallments] = useState([{ amount: '', due_date: todayStr() }]);
  const [run, busy] = useAction();
  const sum = installments.reduce((s, i) => s + Number(i.amount || 0), 0);
  const mismatch = Number(total) > 0 && sum !== Number(total);

  function update(i, key, value) {
    setInstallments((list) => list.map((x, idx) => (idx === i ? { ...x, [key]: value } : x)));
  }

  function splitEven(n) {
    const t = Number(total);
    if (!t || n < 1) return;
    const part = Math.floor(t / n / 1000) * 1000;
    setInstallments(Array.from({ length: n }, (_, i) => ({
      amount: i === n - 1 ? t - part * (n - 1) : part,
      due_date: '',
    })));
  }

  function submit(e) {
    e.preventDefault();
    if (!patient) {
      toast('Chọn bệnh nhân', 'error');
      return;
    }
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    run(async () => {
      const { id } = await api('/plans', {
        method: 'POST',
        body: { ...fd, patient_id: patient.id, total_amount: Number(total), installments },
      });
      onCreated(id);
    }, 'Đã lập liệu trình');
  }

  return (
    <form onSubmit={submit} className="form-grid">
      <Field label="Bệnh nhân" required className="full"><PatientPicker value={patient} onChange={setPatient} allowRegister={false} /></Field>
      <Field label="Tên liệu trình" required className="full"><input className="input" name="name" required placeholder="vd. Niềng răng mắc cài 24 tháng" /></Field>
      <Field label="Số buổi dự kiến" required><input className="input" name="total_sessions" type="number" min="1" required /></Field>
      <Field label="Ngày bắt đầu"><input className="input" name="start_date" type="date" defaultValue={todayStr()} /></Field>
      <Field label="Tổng tiền (đ)" required><input className="input" type="number" min="0" step="1000" value={total} onChange={(e) => setTotal(e.target.value)} required /></Field>
      <Field label="Chia đều thành">
        <div className="row">
          {[1, 2, 3, 4, 6].map((n) => <button key={n} type="button" className="btn btn-sm" onClick={() => splitEven(n)}>{n} đợt</button>)}
        </div>
      </Field>
      <div className="full">
        <div className="field-label" style={{ marginBottom: 6 }}>Các đợt thanh toán (UC18)</div>
        <table className="table">
          <thead><tr><th>Đợt</th><th>Số tiền</th><th>Hạn thanh toán</th><th /></tr></thead>
          <tbody>
            {installments.map((ins, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><input className="input" type="number" min="0" step="1000" value={ins.amount} onChange={(e) => update(i, 'amount', e.target.value)} /></td>
                <td><input className="input" type="date" value={ins.due_date} onChange={(e) => update(i, 'due_date', e.target.value)} /></td>
                <td>{installments.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInstallments((l) => l.filter((_, idx) => idx !== i))}>Xóa</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>Cộng</td><td style={{ color: mismatch ? 'var(--danger)' : undefined }}>{money(sum)}</td><td colSpan={2}>{mismatch && 'Chưa bằng tổng tiền'}</td></tr></tfoot>
        </table>
        <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setInstallments((l) => [...l, { amount: '', due_date: '' }])}>+ Thêm đợt</button>
      </div>
      <Field label="Ghi chú" className="full"><input className="input" name="note" /></Field>
      <div className="full"><button className="btn btn-primary" disabled={busy || mismatch || !patient}>Lập liệu trình</button></div>
    </form>
  );
}
