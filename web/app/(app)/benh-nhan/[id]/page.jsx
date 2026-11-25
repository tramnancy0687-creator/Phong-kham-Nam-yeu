'use client';

// UC03 Cập nhật hồ sơ · UC04 Xem lịch sử khám
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PatientForm from '@/components/PatientForm';
import { Badge, Card, Empty, ErrorBox, Loading, Modal, PageHeader, Progress, StatusBadge, Tabs, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import {
  age, APPT_STATUS, fmtDate, fmtDateTime, GENDER, INVOICE_STATUS, money, PLAN_STATUS, RELATIONSHIP,
} from '@/lib/format';

export default function PatientDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const patient = useApi(`/patients/${id}`);
  const history = useApi(`/patients/${id}/history`);
  const [tab, setTab] = useState('records');
  const [editing, setEditing] = useState(false);
  const [run, busy] = useAction();
  const p = patient.data;
  const h = history.data;
  const isReceptionist = user.role === 'receptionist';

  function save(values) {
    run(async () => {
      await api(`/patients/${id}`, { method: 'PUT', body: values });
      setEditing(false);
      patient.reload();
    }, 'Đã cập nhật hồ sơ');
  }

  if (patient.error) return <ErrorBox error={patient.error} />;
  if (!p) return <Loading />;

  const tabs = [
    { key: 'records', label: 'Lịch sử khám', count: h?.records.length },
    { key: 'appointments', label: 'Lịch hẹn', count: h?.appointments.length },
    { key: 'plans', label: 'Liệu trình', count: h?.plans.length },
    ...(user.role !== 'doctor' ? [{ key: 'invoices', label: 'Hóa đơn', count: h?.invoices.length }] : []),
  ];
  const debt = (h?.invoices ?? []).filter((i) => i.status === 'issued').reduce((s, i) => s + i.debt_amount, 0);

  return (
    <>
      <PageHeader
        title={p.full_name}
        uc="UC03 · UC04"
        subtitle={`${age(p.date_of_birth)} tuổi · ${GENDER[p.gender] ?? ''} · SĐT ${p.phone} (${RELATIONSHIP[p.relationship]}: ${p.contact_name})`}
        actions={
          <>
            {p.archived_at && <Badge>Đã lưu trữ {fmtDate(p.archived_at)}</Badge>}
            {isReceptionist && !p.archived_at && (
              <>
                <Link className="btn" href={`/lich-hen?benh-nhan=${p.id}`}>Đặt lịch hẹn</Link>
                <button className="btn btn-primary" onClick={() => setEditing(true)}>Sửa hồ sơ</button>
              </>
            )}
          </>
        }
      />

      <div className="stack">
        {p.medical_history && <div className="allergy">⚠ Tiền sử / dị ứng: {p.medical_history}</div>}

        <div className="grid-3">
          <Card title="Thông tin">
            <dl className="kv">
              <dt>Ngày sinh</dt><dd>{fmtDate(p.date_of_birth)}</dd>
              <dt>Địa chỉ</dt><dd>{p.address || '—'}</dd>
              <dt>Khám gần nhất</dt><dd>{p.last_visit_at ? fmtDateTime(p.last_visit_at) : 'Chưa khám'}</dd>
              {user.role !== 'doctor' && <><dt>Còn nợ</dt><dd style={{ color: debt > 0 ? 'var(--danger)' : undefined }}>{money(debt)}</dd></>}
            </dl>
          </Card>
          <Card title={`Dùng chung SĐT ${p.phone}`} className="span-2">
            {p.same_phone.length === 0 ? <Empty>Không có bệnh nhân khác dùng SĐT này</Empty> : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {p.same_phone.map((s) => (
                  <li key={s.id}><Link href={`/benh-nhan/${s.id}`}>{s.full_name}</Link> <span className="muted">· {fmtDate(s.date_of_birth)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {!h ? <Loading /> : (
            <>
              {tab === 'records' && (h.records.length === 0 ? <Empty>Chưa có lần khám nào</Empty> : (
                <div className="stack">
                  {h.records.map((r) => (
                    <div key={r.id} className="card" style={{ boxShadow: 'none' }}>
                      <div className="row">
                        <strong>{fmtDateTime(r.visit_at)}</strong>
                        <span className="muted">· BS {r.doctor_name}</span>
                        {r.plan_name && <Badge color="blue">{r.plan_name}</Badge>}
                        <span className="spacer" />
                        <Link href={`/phieu-dieu-tri/${r.id}`}>Mở phiếu →</Link>
                      </div>
                      {r.diagnosis && <div style={{ marginTop: 4 }}>Chẩn đoán: {r.diagnosis}</div>}
                      {r.items.length > 0 && (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                          {r.items.map((it, i) => (
                            <li key={i}>{it.service}{it.tooth ? ` — răng ${it.tooth}` : ''} <span className="muted">(BS {it.doctor})</span></li>
                          ))}
                        </ul>
                      )}
                      {r.prescriptions.length > 0 && (
                        <div className="muted small" style={{ marginTop: 4 }}>
                          Đơn thuốc: {r.prescriptions.map((x) => `${x.name} × ${x.quantity} ${x.unit}`).join('; ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {tab === 'appointments' && (h.appointments.length === 0 ? <Empty /> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Thời gian</th><th>Dịch vụ</th><th>Bác sĩ</th><th>Ghế</th><th>Trạng thái</th></tr></thead>
                    <tbody>
                      {h.appointments.map((a) => (
                        <tr key={a.id}>
                          <td className="nowrap">{fmtDateTime(a.start_at)}</td>
                          <td>{a.service_name}</td>
                          <td>{a.doctor_name}</td>
                          <td>{a.chair_code}</td>
                          <td><StatusBadge map={APPT_STATUS} value={a.status} />{a.cancel_reason && <div className="muted small">{a.cancel_reason}</div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              {tab === 'plans' && (h.plans.length === 0 ? <Empty>Chưa có liệu trình</Empty> : (
                <table className="table">
                  <thead><tr><th>Liệu trình</th><th>Bác sĩ</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead>
                  <tbody>
                    {h.plans.map((pl) => (
                      <tr key={pl.plan_id}>
                        <td><Link href={`/lieu-trinh/${pl.plan_id}`}>{pl.plan_name}</Link></td>
                        <td>{pl.doctor_name}</td>
                        <td style={{ minWidth: 160 }}><Progress value={pl.done_sessions} max={pl.total_sessions} /><span className="small muted">{pl.done_sessions}/{pl.total_sessions} buổi</span></td>
                        <td><StatusBadge map={PLAN_STATUS} value={pl.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}

              {tab === 'invoices' && (h.invoices.length === 0 ? <Empty>Chưa có hóa đơn</Empty> : (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Số</th><th>Ngày</th><th className="num">Tổng</th><th className="num">Đã thu</th><th className="num">Còn nợ</th><th>Trạng thái</th></tr></thead>
                    <tbody>
                      {h.invoices.map((i) => (
                        <tr key={i.invoice_id}>
                          <td><Link href={`/hoa-don/${i.invoice_id}`}>#{i.invoice_id}</Link></td>
                          <td>{fmtDate(i.created_at)}</td>
                          <td className="num">{money(i.total_amount)}</td>
                          <td className="num">{money(i.paid_amount)}</td>
                          <td className="num" style={{ color: i.debt_amount > 0 && i.status === 'issued' ? 'var(--danger)' : undefined }}>{money(i.debt_amount)}</td>
                          <td><StatusBadge map={INVOICE_STATUS} value={i.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      <Modal open={editing} title="Sửa hồ sơ bệnh nhân" onClose={() => setEditing(false)} wide>
        <PatientForm initial={p} onSubmit={save} busy={busy} submitLabel="Lưu thay đổi" />
      </Modal>
    </>
  );
}
