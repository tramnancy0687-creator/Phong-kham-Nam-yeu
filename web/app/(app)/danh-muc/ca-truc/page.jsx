'use client';

// UC21 Quản lý ca trực bác sĩ (theo ngày)
import { useMemo, useState } from 'react';
import { ConfirmButton, ErrorBox, Field, Loading, Modal, PageHeader, formValues, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { addDays, fmtDate, todayStr, WEEKDAYS } from '@/lib/format';

/** Thứ 2 của tuần chứa ngày d */
function mondayOf(d) {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(y, m - 1, day);
  const diff = (dt.getDay() + 6) % 7;
  return addDays(d, -diff);
}

export default function ShiftsPage() {
  const [monday, setMonday] = useState(mondayOf(todayStr()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const shifts = useApi(`/shifts?from=${days[0]}&to=${days[6]}`);
  const { data: doctors } = useApi('/doctors');
  const [open, setOpen] = useState(false);
  const [run, busy] = useAction();

  function create(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    const weekdays = [...form.querySelectorAll('input[name="wd"]:checked')].map((x) => Number(x.value));
    run(async () => {
      const { created } = await api('/shifts', { method: 'POST', body: { ...v, weekdays } });
      setOpen(false);
      shifts.reload();
      return created;
    }, 'Đã tạo ca trực');
  }

  const remove = (id) => run(async () => {
    await api(`/shifts/${id}`, { method: 'DELETE' });
    shifts.reload();
  }, 'Đã xóa ca');

  return (
    <>
      <PageHeader
        title="Ca trực bác sĩ"
        uc="UC21"
        subtitle={`Tuần ${fmtDate(days[0])} – ${fmtDate(days[6])}. Lễ tân chỉ đặt được lịch trong ca bác sĩ trực.`}
        actions={
          <>
            <button className="btn" onClick={() => setMonday(addDays(monday, -7))}>‹ Tuần trước</button>
            <button className="btn" onClick={() => setMonday(mondayOf(todayStr()))}>Tuần này</button>
            <button className="btn" onClick={() => setMonday(addDays(monday, 7))}>Tuần sau ›</button>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Tạo ca trực</button>
          </>
        }
      />
      <ErrorBox error={shifts.error} />
      {!shifts.data || !doctors ? <Loading /> : (
        <div className="schedule-wrap">
          <div className="schedule" style={{ gridTemplateColumns: `160px repeat(7, minmax(120px, 1fr))` }}>
            <div className="sch-head">Bác sĩ</div>
            {days.map((d, i) => <div key={d} className="sch-head">{WEEKDAYS[i]}<div className="muted small">{fmtDate(d)}</div></div>)}
            {doctors.map((doc) => (
              <div key={doc.id} style={{ display: 'contents' }}>
                <div className="sch-time" style={{ fontSize: 13, color: 'var(--text)' }}>{doc.full_name}</div>
                {days.map((d) => (
                  <div key={d} className="sch-cell">
                    {shifts.data.filter((s) => s.doctor_id === doc.id && s.shift_date === d).map((s) => (
                      <div key={s.id} className="appt completed row" style={{ justifyContent: 'space-between', cursor: 'default' }}>
                        <span style={{ color: 'inherit' }}>{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</span>
                        <ConfirmButton message="Xóa ca trực này?" onConfirm={() => remove(s.id)} className="btn btn-ghost btn-icon">✕</ConfirmButton>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={open} title="Tạo ca trực hàng loạt" onClose={() => setOpen(false)}>
        <form onSubmit={create} className="form-grid">
          <Field label="Bác sĩ" required className="full">
            <select className="input" name="doctor_id" required defaultValue="">
              <option value="" disabled>— Chọn —</option>
              {(doctors ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </Field>
          <Field label="Từ ngày" required><input className="input" type="date" name="from" defaultValue={days[0]} required /></Field>
          <Field label="Đến ngày" required><input className="input" type="date" name="to" defaultValue={days[6]} required /></Field>
          <Field label="Giờ bắt đầu" required><input className="input" type="time" name="start_time" defaultValue="08:00" step="1800" required /></Field>
          <Field label="Giờ kết thúc" required><input className="input" type="time" name="end_time" defaultValue="12:00" step="1800" required /></Field>
          <div className="full">
            <div className="field-label" style={{ marginBottom: 6 }}>Các thứ trong tuần</div>
            <div className="row">
              {WEEKDAYS.map((w, i) => (
                <label key={w} className="check"><input type="checkbox" name="wd" value={i + 1} defaultChecked={i < 5} /> {w}</label>
              ))}
            </div>
          </div>
          <div className="full"><button className="btn btn-primary" disabled={busy}>Tạo ca</button> <span className="muted small">Ca chồng giờ với ca đã có sẽ bị từ chối</span></div>
        </form>
      </Modal>
    </>
  );
}
