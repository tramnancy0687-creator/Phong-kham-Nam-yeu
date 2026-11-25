'use client';

import { useEffect, useState } from 'react';
import { Field } from '@/components/ui';
import { api } from '@/lib/api';
import { age, GENDER, RELATIONSHIP } from '@/lib/format';

/**
 * Form hồ sơ bệnh nhân (UC02 đăng ký, UC03 cập nhật).
 * QĐ2: SĐT thuộc người liên hệ; trẻ < 15 tuổi phải dùng SĐT người giám hộ.
 */
export default function PatientForm({ initial = {}, onSubmit, busy, submitLabel = 'Lưu' }) {
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [contact, setContact] = useState(undefined); // undefined = chưa tra, null = SĐT mới
  const [dob, setDob] = useState(initial.date_of_birth ?? '');
  const [relationship, setRelationship] = useState(initial.relationship ?? 'self');

  // UC02 «include» UC01: tra SĐT để biết đã có người liên hệ / bệnh nhân nào
  useEffect(() => {
    if (!/^0[0-9]{9,10}$/.test(phone) || phone === initial.phone) {
      setContact(undefined);
      return undefined;
    }
    const timer = setTimeout(() => api(`/contacts/${phone}`).then(setContact).catch(() => setContact(undefined)), 300);
    return () => clearTimeout(timer);
  }, [phone, initial.phone]);

  const years = age(dob);
  const childSelf = relationship === 'self' && years !== null && years < 15;
  const needContactName = contact === null && relationship !== 'self';

  function submit(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const values = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    onSubmit(values);
  }

  return (
    <form id="patient-form" onSubmit={submit} className="form-grid">
      <Field label="Số điện thoại" required hint="10–11 số, bắt đầu bằng 0">
        <input className="input" name="phone" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} inputMode="tel" required />
      </Field>
      <Field label="SĐT này của ai?" required>
        <select className="input" name="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
          {Object.entries(RELATIONSHIP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>

      {contact && (
        <div className="alert alert-info full">
          SĐT đã có của <strong>{contact.full_name}</strong>, đang dùng cho: {contact.patients.map((p) => p.full_name).join(', ')}.
          Bệnh nhân mới sẽ dùng chung SĐT này (mỗi người vẫn có hồ sơ riêng).
        </div>
      )}
      {needContactName && (
        <Field label="Tên người giữ SĐT" required className="full">
          <input className="input" name="contact_name" required placeholder="vd. Nguyễn Thị Mai (mẹ)" />
        </Field>
      )}

      <Field label="Họ tên bệnh nhân" required className="full">
        <input className="input" name="full_name" defaultValue={initial.full_name} required />
      </Field>
      <Field label="Ngày sinh" required hint={years !== null ? `${years} tuổi` : undefined}>
        <input className="input" type="date" name="date_of_birth" value={dob} onChange={(e) => setDob(e.target.value)} required />
      </Field>
      <Field label="Giới tính">
        <select className="input" name="gender" defaultValue={initial.gender ?? ''}>
          <option value="">—</option>
          {Object.entries(GENDER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      {childSelf && (
        <div className="alert alert-warn full">Bệnh nhân dưới 15 tuổi phải dùng SĐT của người giám hộ (chọn Mẹ / Bố / Người giám hộ).</div>
      )}
      <Field label="Địa chỉ" className="full">
        <input className="input" name="address" defaultValue={initial.address ?? ''} />
      </Field>
      <Field label="Tiền sử bệnh, dị ứng" className="full" hint="Bác sĩ sẽ thấy cảnh báo này khi khám">
        <textarea className="input" name="medical_history" defaultValue={initial.medical_history ?? ''} />
      </Field>
      <div className="full row">
        <button className="btn btn-primary" disabled={busy || childSelf}>{submitLabel}</button>
      </div>
    </form>
  );
}
