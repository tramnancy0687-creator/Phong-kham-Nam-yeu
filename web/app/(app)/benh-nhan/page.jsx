'use client';

// UC01 Tìm bệnh nhân theo SĐT · UC02 Đăng ký bệnh nhân mới
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRole } from '@/components/AuthProvider';
import PatientForm from '@/components/PatientForm';
import { Badge, Card, Empty, ErrorBox, Loading, Modal, PageHeader, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { age, fmtDate, RELATIONSHIP } from '@/lib/format';

function PatientsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const canRegister = useRole('receptionist');
  const preset = params.get('dang-ky');
  const [term, setTerm] = useState(preset && /^\d+$/.test(preset) ? preset : '');
  const [query, setQuery] = useState(term);
  const [registerOpen, setRegisterOpen] = useState(Boolean(preset) && canRegister);
  const [run, busy] = useAction();
  const { data, error, loading } = useApi(`/patients?q=${encodeURIComponent(query)}`);

  useEffect(() => {
    const t = setTimeout(() => setQuery(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  // Nhóm theo SĐT để thấy rõ "một SĐT ra danh sách bệnh nhân" (QĐ2)
  const groups = (data ?? []).reduce((acc, p) => {
    (acc[p.phone] ??= { phone: p.phone, contact: p.contact_name, patients: [] }).patients.push(p);
    return acc;
  }, {});

  function register(values) {
    run(async () => {
      const { id } = await api('/patients', { method: 'POST', body: values });
      router.push(`/benh-nhan/${id}`);
    }, 'Đã đăng ký bệnh nhân');
  }

  return (
    <>
      <PageHeader
        title="Bệnh nhân"
        uc="UC01 · UC02"
        subtitle="Tìm theo số điện thoại (một SĐT có thể dùng chung cho cả gia đình) hoặc theo tên"
        actions={canRegister && <button className="btn btn-primary" onClick={() => setRegisterOpen(true)}>+ Đăng ký bệnh nhân</button>}
      />
      <Card>
        <input
          className="input"
          placeholder="Nhập SĐT hoặc họ tên…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
          style={{ maxWidth: 420, marginBottom: 16 }}
        />
        <ErrorBox error={error} />
        {loading && !data && <Loading />}
        {data && data.length === 0 && <Empty>Không tìm thấy bệnh nhân</Empty>}
        <div className="stack">
          {Object.values(groups).map((g) => (
            <div key={g.phone}>
              <div className="row" style={{ marginBottom: 6 }}>
                <strong>{g.phone}</strong>
                <span className="muted">· {g.contact}</span>
                {g.patients.length > 1 && <Badge color="blue">{g.patients.length} bệnh nhân</Badge>}
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Họ tên</th><th>Ngày sinh</th><th>SĐT của</th><th>Khám gần nhất</th><th /></tr></thead>
                  <tbody>
                    {g.patients.map((p) => (
                      <tr key={p.id} className="clickable" onClick={() => router.push(`/benh-nhan/${p.id}`)}>
                        <td><Link href={`/benh-nhan/${p.id}`}>{p.full_name}</Link></td>
                        <td className="nowrap">{fmtDate(p.date_of_birth)} <span className="muted">({age(p.date_of_birth)} tuổi)</span></td>
                        <td>{RELATIONSHIP[p.relationship]}</td>
                        <td>{p.last_visit_at ? fmtDate(p.last_visit_at) : <span className="muted">Chưa khám</span>}</td>
                        <td>{p.archived_at && <Badge>Đã lưu trữ</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={registerOpen} title="Đăng ký bệnh nhân mới" onClose={() => setRegisterOpen(false)} wide>
        <PatientForm initial={{ phone: term && /^\d+$/.test(term) ? term : '' }} onSubmit={register} busy={busy} submitLabel="Đăng ký" />
      </Modal>
    </>
  );
}

export default function PatientsPage() {
  return <Suspense fallback={<Loading />}><PatientsInner /></Suspense>;
}
