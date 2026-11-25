'use client';

// UC22 Quản lý ghế nha khoa
import { useState } from 'react';
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHeader, formValues, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';

export default function ChairsPage() {
  const { data, error, reload } = useApi('/chairs');
  const [editing, setEditing] = useState(null);
  const [run, busy] = useAction();

  function save(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    run(async () => {
      if (editing === 'new') await api('/chairs', { method: 'POST', body: v });
      else await api(`/chairs/${editing.id}`, { method: 'PUT', body: { code: v.code, name: v.name, note: v.note ?? '', is_active: form.is_active.checked } });
      setEditing(null);
      reload();
    }, 'Đã lưu ghế');
  }

  return (
    <>
      <PageHeader title="Ghế nha khoa" uc="UC22" subtitle="Ghế ngưng sử dụng sẽ không hiện trên lưới lịch hẹn"
        actions={<button className="btn btn-primary" onClick={() => setEditing('new')}>+ Thêm ghế</button>} />
      <Card>
        <ErrorBox error={error} />
        {!data ? <Loading /> : (
          <table className="table">
            <thead><tr><th>Mã</th><th>Tên</th><th>Ghi chú</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.code}</strong></td>
                  <td>{c.name}</td>
                  <td className="muted">{c.note}</td>
                  <td>{c.is_active ? <Badge color="green">Đang dùng</Badge> : <Badge>Ngưng</Badge>}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Sửa</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Modal open={Boolean(editing)} title={editing === 'new' ? 'Thêm ghế' : 'Sửa ghế'} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="form-grid">
            <Field label="Mã ghế" required><input className="input" name="code" defaultValue={editing.code} required /></Field>
            <Field label="Tên" required><input className="input" name="name" defaultValue={editing.name} required /></Field>
            <Field label="Ghi chú" className="full"><input className="input" name="note" defaultValue={editing.note ?? ''} /></Field>
            {editing !== 'new' && <label className="check full"><input type="checkbox" name="is_active" defaultChecked={editing.is_active} /> Đang sử dụng</label>}
            <div className="full"><button className="btn btn-primary" disabled={busy}>Lưu</button></div>
          </form>
        )}
      </Modal>
    </>
  );
}
