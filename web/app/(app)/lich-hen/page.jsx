'use client';

// UC05 Đặt lịch · UC06 Đổi lịch · UC07 Hủy lịch · UC08 Xem lịch làm việc
// Lưới: cột = ghế, hàng = khung 30 phút. Trùng ghế / bác sĩ / ngoài ca do database chặn (UC05a, UC05b)
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import PatientPicker from '@/components/PatientPicker';
import { Card, ErrorBox, Field, Loading, Modal, PageHeader, StatusBadge, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { addDays, age, APPT_STATUS, fmtDate, fmtDateTime, fmtTime, timeSlots, todayStr } from '@/lib/format';

const SLOTS = timeSlots('08:00', '20:00');
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

/** Bác sĩ có ca bao trùm khung [time, time+30') */
function doctorsOnDuty(shifts, time) {
  const end = SLOTS[SLOTS.indexOf(time) + 1] ?? '20:00';
  return shifts.filter((s) => s.start_time.slice(0, 5) <= time && s.end_time.slice(0, 5) >= end);
}

function ScheduleInner() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const isReceptionist = user.role === 'receptionist';
  const isDoctor = user.role === 'doctor';
  const [date, setDate] = useState(params.get('ngay') || todayStr());
  const [onlyMine, setOnlyMine] = useState(isDoctor);
  const schedule = useApi(`/schedule?date=${date}${onlyMine ? `&doctor_id=${user.id}` : ''}`);
  const { data: services } = useApi('/services');
  const { data: doctors } = useApi('/doctors');
  const { data: reasons } = useApi('/cancel-reasons');
  const [booking, setBooking] = useState(null); // { chair_id, time, patient }
  const [selected, setSelected] = useState(null); // lịch hẹn đang xem
  const [mode, setMode] = useState('view'); // view | reschedule | cancel
  const [run, busy] = useAction();

  // Đến từ hồ sơ bệnh nhân: mở sẵn form đặt lịch cho bệnh nhân đó
  const presetPatientId = params.get('benh-nhan');
  useEffect(() => {
    if (!presetPatientId || !isReceptionist) return;
    api(`/patients/${presetPatientId}`).then((p) => setBooking({ chair_id: '', time: '', patient: p })).catch(() => {});
  }, [presetPatientId, isReceptionist]);

  const data = schedule.data;
  const active = useMemo(() => (data?.appointments ?? []).filter((a) => a.status !== 'cancelled'), [data]);
  const cancelled = (data?.appointments ?? []).filter((a) => a.status === 'cancelled');
  const nowStr = `${todayStr()} ${new Date().toTimeString().slice(0, 5)}`;
  const isPast = (time) => `${date} ${time}` < nowStr;

  function cellAppointments(chairId, time) {
    return active.filter((a) => a.chair_id === chairId && fmtTime(a.start_at) === time);
  }

  function openAppointment(a) {
    setSelected(a);
    setMode('view');
  }

  function closeAppointment() {
    setSelected(null);
    setMode('view');
  }

  function book(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    if (!booking.patient) return;
    run(async () => {
      await api('/appointments', {
        method: 'POST',
        body: {
          patient_id: booking.patient.id,
          doctor_id: fd.doctor_id,
          chair_id: fd.chair_id,
          service_id: fd.service_id,
          start_at: `${fd.date} ${fd.time}`,
          note: fd.note,
        },
      });
      setBooking(null);
      if (fd.date !== date) setDate(fd.date);
      else schedule.reload();
    }, 'Đã đặt lịch hẹn');
  }

  function reschedule(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    run(async () => {
      await api(`/appointments/${selected.id}`, {
        method: 'PUT',
        body: { start_at: `${fd.date} ${fd.time}`, doctor_id: fd.doctor_id, chair_id: fd.chair_id, note: fd.note },
      });
      closeAppointment();
      if (fd.date !== date) setDate(fd.date);
      else schedule.reload();
    }, 'Đã đổi lịch hẹn');
  }

  function cancel(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget));
    run(async () => {
      await api(`/appointments/${selected.id}/cancel`, { method: 'POST', body: fd });
      closeAppointment();
      schedule.reload();
    }, 'Đã hủy lịch hẹn');
  }

  function noShow() {
    run(async () => {
      await api(`/appointments/${selected.id}/no-show`, { method: 'POST' });
      closeAppointment();
      schedule.reload();
    }, 'Đã đánh dấu không đến');
  }

  function startTreatment() {
    run(async () => {
      const { id } = await api(`/appointments/${selected.id}/record`, { method: 'POST', body: {} });
      router.push(`/phieu-dieu-tri/${id}`);
    });
  }

  const chairs = data?.chairs ?? [];
  const shifts = data?.shifts ?? [];

  return (
    <>
      <PageHeader
        title="Lịch hẹn"
        uc="UC05 – UC08"
        subtitle={`${weekdayOf(date)}, ${fmtDate(date)}`}
        actions={
          <>
            <button className="btn" onClick={() => setDate(addDays(date, -1))} aria-label="Ngày trước">‹</button>
            <button className="btn" onClick={() => setDate(todayStr())}>Hôm nay</button>
            <button className="btn" onClick={() => setDate(addDays(date, 1))} aria-label="Ngày sau">›</button>
            <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 160 }} />
            {isDoctor && (
              <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Chỉ lịch của tôi</label>
            )}
            {isReceptionist && <button className="btn btn-primary" onClick={() => setBooking({ chair_id: '', time: '', patient: null })}>+ Đặt lịch</button>}
          </>
        }
      />

      <ErrorBox error={schedule.error} />

      <Card className="" title="Bác sĩ trực trong ngày">
        {shifts.length === 0 ? <span className="muted">Không có bác sĩ trực — không đặt lịch được ngày này.</span> : (
          <div className="row">
            {shifts.map((s) => (
              <span key={s.id} className="badge badge-green">{s.doctor_name}: {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />
      <div className="legend" style={{ marginBottom: 8 }}>
        <span><i style={{ background: 'var(--blue)' }} />Chờ khám</span>
        <span><i style={{ background: 'var(--success)' }} />Đã khám</span>
        <span><i style={{ background: 'var(--warn)' }} />Không đến</span>
        {isReceptionist && <span>Bấm vào ô trống để đặt lịch</span>}
      </div>

      {!data ? <Loading /> : (
        <div className="schedule-wrap">
          <div className="schedule" style={{ gridTemplateColumns: `64px repeat(${chairs.length}, minmax(170px, 1fr))` }}>
            <div className="sch-head">Giờ</div>
            {chairs.map((c) => <div key={c.id} className="sch-head">{c.code} <span className="muted small">{c.name}</span></div>)}
            {SLOTS.map((time) => (
              <div key={time} style={{ display: 'contents' }}>
                <div className="sch-time">{time}</div>
                {chairs.map((c) => {
                  const list = cellAppointments(c.id, time);
                  const free = list.length === 0 && isReceptionist && !isPast(time);
                  return (
                    <div
                      key={c.id}
                      className={`sch-cell ${free ? 'free' : ''} ${isPast(time) && list.length === 0 ? 'past' : ''}`}
                      onClick={free ? () => setBooking({ chair_id: c.id, time, patient: null }) : undefined}
                      title={free ? `Đặt lịch ${c.code} lúc ${time}` : undefined}
                    >
                      {list.map((a) => (
                        <button key={a.id} type="button" className={`appt ${a.status}`} onClick={() => openAppointment(a)}>
                          <strong>{a.patient_name}</strong>
                          <span>{a.service_name} · BS {a.doctor_name.split(' ').pop()}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {cancelled.length > 0 && (
        <>
          <div style={{ height: 16 }} />
          <Card title={`Lịch đã hủy trong ngày (${cancelled.length})`}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Giờ</th><th>Bệnh nhân</th><th>Dịch vụ</th><th>Lý do</th><th>Người hủy · lúc</th></tr></thead>
                <tbody>
                  {cancelled.map((a) => (
                    <tr key={a.id}>
                      <td>{fmtTime(a.start_at)}</td>
                      <td>{a.patient_name}</td>
                      <td>{a.service_name}</td>
                      <td>{a.cancel_reason}{a.cancel_note && <div className="muted small">{a.cancel_note}</div>}</td>
                      <td className="muted">{a.cancelled_by_name} · {fmtDateTime(a.cancelled_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ---------- UC05 Đặt lịch ---------- */}
      <Modal open={Boolean(booking)} title="Đặt lịch hẹn" onClose={() => setBooking(null)} wide>
        {booking && (
          <BookingForm
            key={`${booking.chair_id}-${booking.time}-${booking.patient?.id}`}
            booking={booking}
            setPatient={(p) => setBooking((b) => ({ ...b, patient: p }))}
            date={date}
            chairs={chairs}
            shifts={shifts}
            doctors={doctors ?? []}
            services={(services ?? []).filter((s) => s.is_active)}
            onSubmit={book}
            busy={busy}
          />
        )}
      </Modal>

      {/* ---------- Chi tiết / đổi / hủy ---------- */}
      <Modal open={Boolean(selected)} title={mode === 'reschedule' ? 'Đổi lịch hẹn' : mode === 'cancel' ? 'Hủy lịch hẹn' : 'Chi tiết lịch hẹn'} onClose={closeAppointment} wide={mode === 'reschedule'}>
        {selected && mode === 'view' && (
          <>
            <dl className="kv">
              <dt>Bệnh nhân</dt>
              <dd><Link href={`/benh-nhan/${selected.patient_id}`}>{selected.patient_name}</Link> · {age(selected.date_of_birth)} tuổi · {selected.phone}</dd>
              <dt>Thời gian</dt><dd>{fmtDateTime(selected.start_at)} – {fmtTime(selected.end_at)}</dd>
              <dt>Dịch vụ</dt><dd>{selected.service_name}</dd>
              <dt>Bác sĩ · Ghế</dt><dd>{selected.doctor_name} · {selected.chair_code}</dd>
              <dt>Trạng thái</dt><dd><StatusBadge map={APPT_STATUS} value={selected.status} /></dd>
              {selected.note && <><dt>Ghi chú</dt><dd>{selected.note}</dd></>}
              <dt>Người đặt</dt><dd className="muted">{selected.created_by_name}</dd>
            </dl>
            {selected.medical_history && <div className="allergy">⚠ {selected.medical_history}</div>}
            <div className="row">
              {selected.record_id && <Link className="btn btn-primary" href={`/phieu-dieu-tri/${selected.record_id}`}>Mở phiếu điều trị</Link>}
              {isDoctor && !selected.record_id && selected.status === 'scheduled' && (
                <button className="btn btn-primary" onClick={startTreatment} disabled={busy}>Bắt đầu khám · ghi phiếu</button>
              )}
              {isReceptionist && selected.status === 'scheduled' && (
                <>
                  <button className="btn" onClick={() => setMode('reschedule')}>Đổi lịch</button>
                  <button className="btn btn-danger" onClick={() => setMode('cancel')}>Hủy lịch</button>
                  {isPast(fmtTime(selected.start_at)) && <button className="btn" onClick={noShow} disabled={busy}>Không đến</button>}
                </>
              )}
            </div>
          </>
        )}

        {/* UC06 */}
        {selected && mode === 'reschedule' && (
          <form onSubmit={reschedule} className="form-grid">
            <div className="full muted">{selected.patient_name} · {selected.service_name} · hiện tại {fmtDateTime(selected.start_at)}, ghế {selected.chair_code}</div>
            <Field label="Ngày" required><input className="input" type="date" name="date" defaultValue={selected.start_at.slice(0, 10)} min={todayStr()} required /></Field>
            <Field label="Giờ" required>
              <select className="input" name="time" defaultValue={fmtTime(selected.start_at)}>{SLOTS.map((t) => <option key={t}>{t}</option>)}</select>
            </Field>
            <Field label="Bác sĩ" required>
              <select className="input" name="doctor_id" defaultValue={selected.doctor_id}>{(doctors ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>
            </Field>
            <Field label="Ghế" required>
              <select className="input" name="chair_id" defaultValue={selected.chair_id}>{chairs.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select>
            </Field>
            <Field label="Ghi chú" className="full"><input className="input" name="note" defaultValue={selected.note ?? ''} /></Field>
            <div className="full row">
              <button className="btn btn-primary" disabled={busy}>Lưu lịch mới</button>
              <button className="btn" type="button" onClick={() => setMode('view')}>Quay lại</button>
              <span className="muted small">Hệ thống tự kiểm tra trùng ghế, trùng bác sĩ và ca trực</span>
            </div>
          </form>
        )}

        {/* UC07 «include» ghi lý do */}
        {selected && mode === 'cancel' && (
          <form onSubmit={cancel} className="stack">
            <div className="muted">{selected.patient_name} · {fmtDateTime(selected.start_at)} · {selected.service_name}</div>
            <Field label="Lý do hủy" required>
              <select className="input" name="cancel_reason_id" required defaultValue="">
                <option value="" disabled>— Chọn lý do —</option>
                {(reasons ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Ghi chú thêm"><input className="input" name="cancel_note" /></Field>
            <div className="row">
              <button className="btn btn-danger" disabled={busy}>Xác nhận hủy</button>
              <button className="btn" type="button" onClick={() => setMode('view')}>Quay lại</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

function BookingForm({ booking, setPatient, date, chairs, shifts, doctors, services, onSubmit, busy }) {
  const [time, setTime] = useState(booking.time || '');
  const [bookDate, setBookDate] = useState(date);
  const onDuty = bookDate === date && time ? doctorsOnDuty(shifts, time) : [];
  const defaultDoctor = onDuty[0]?.doctor_id ?? '';

  return (
    <form onSubmit={onSubmit} className="form-grid">
      <Field label="Bệnh nhân" required className="full">
        <PatientPicker value={booking.patient} onChange={setPatient} />
      </Field>
      {booking.patient?.medical_history && <div className="allergy full">⚠ {booking.patient.medical_history}</div>}
      <Field label="Ngày" required>
        <input className="input" type="date" name="date" value={bookDate} min={todayStr()} onChange={(e) => setBookDate(e.target.value)} required />
      </Field>
      <Field label="Giờ (khung 30 phút)" required>
        <select className="input" name="time" value={time} onChange={(e) => setTime(e.target.value)} required>
          <option value="" disabled>— Chọn giờ —</option>
          {SLOTS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Bác sĩ" required hint={bookDate === date && time ? (onDuty.length ? `Đang trực: ${onDuty.map((s) => s.doctor_name).join(', ')}` : 'Không có bác sĩ trực khung này') : undefined}>
        <select className="input" name="doctor_id" required defaultValue={defaultDoctor} key={defaultDoctor}>
          <option value="" disabled>— Chọn bác sĩ —</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.full_name}{onDuty.some((s) => s.doctor_id === d.id) ? ' ✓ trực' : ''}</option>
          ))}
        </select>
      </Field>
      <Field label="Ghế" required>
        <select className="input" name="chair_id" required defaultValue={booking.chair_id}>
          <option value="" disabled>— Chọn ghế —</option>
          {chairs.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
      </Field>
      <Field label="Dịch vụ dự kiến" required className="full">
        <select className="input" name="service_id" required defaultValue="">
          <option value="" disabled>— Chọn dịch vụ —</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Ghi chú" className="full"><input className="input" name="note" /></Field>
      <div className="full row">
        <button className="btn btn-primary" disabled={busy || !booking.patient}>Đặt lịch</button>
        <span className="muted small">Hệ thống tự kiểm tra trùng ghế, trùng bác sĩ và ca trực (UC05a, UC05b)</span>
      </div>
    </form>
  );
}

export default function SchedulePage() {
  return <Suspense fallback={<Loading />}><ScheduleInner /></Suspense>;
}
