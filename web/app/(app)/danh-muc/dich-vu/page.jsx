'use client';

// UC20 Quản lý bảng giá dịch vụ — giá có hiệu lực theo khoảng thời gian
import { useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, formValues, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, money, todayStr } from '@/lib/format';

export default function ServicesPage() {
  const { data, error, reload } = useApi('/services');
  const [editing, setEditing] = useState(null); // null | 'new' | service
  const [pricing, setPricing] = useState(null);
  const prices = useApi(pricing ? `/services/${pricing.id}/prices` : null);
  const [run, busy] = useAction();

  function save(e) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    v.is_active = e.currentTarget.is_active ? e.currentTarget.is_active.checked : true;
    run(async () => {
      if (editing === 'new') await api('/services', { method: 'POST', body: v });
      else await api(`/services/${editing.id}`, { method: 'PUT', body: { name: v.name, description: v.description ?? '', is_active: v.is_active } });
      setEditing(null);
      reload();
    }, 'Đã lưu dịch vụ');
  }

  function addPrice(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    run(async () => {
      await api(`/services/${pricing.id}/prices`, { method: 'POST', body: { price: Number(v.price), valid_from: v.valid_from } });
      form.reset();
      prices.reload();
      reload();
    }, 'Đã thêm giá mới');
  }

  return (
    <>
      <PageHeader
        title="Dịch vụ & bảng giá"
        uc="UC20"
        subtitle="Đổi giá bằng cách thêm giá mới có hiệu lực từ một ngày; hóa đơn đã lập giữ nguyên giá cũ"
        actions={<button className="btn btn-primary" onClick={() => setEditing('new')}>+ Thêm dịch vụ</button>}
      />
      <Card>
        <ErrorBox error={error} />
        {!data ? <Loading /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Mã</th><th>Tên dịch vụ</th><th>Mô tả</th><th className="num">Giá hiện hành</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.id}>
                    <td><code>{s.code}</code></td>
                    <td>{s.name}</td>
                    <td className="muted">{s.description}</td>
                    <td className="num">{s.current_price === null ? <span className="muted">Chưa có giá</span> : money(s.current_price)}</td>
                    <td>{s.is_active ? <Badge color="green">Đang dùng</Badge> : <Badge>Ngưng</Badge>}</td>
                    <td className="nowrap">
                      <button className="btn btn-sm" onClick={() => setPricing(s)}>Bảng giá</button>{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Sửa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(editing)} title={editing === 'new' ? 'Thêm dịch vụ' : 'Sửa dịch vụ'} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="form-grid">
            <Field label="Mã" required><input className="input" name="code" defaultValue={editing.code} disabled={editing !== 'new'} required /></Field>
            <Field label="Tên dịch vụ" required><input className="input" name="name" defaultValue={editing.name} required /></Field>
            <Field label="Mô tả" className="full"><input className="input" name="description" defaultValue={editing.description ?? ''} /></Field>
            {editing === 'new' ? (
              <>
                <Field label="Giá ban đầu (đ)"><input className="input" name="price" type="number" min="0" step="1000" /></Field>
                <Field label="Hiệu lực từ"><input className="input" name="valid_from" type="date" defaultValue={todayStr()} /></Field>
              </>
            ) : (
              <label className="check full"><input type="checkbox" name="is_active" defaultChecked={editing.is_active} /> Đang sử dụng</label>
            )}
            <div className="full"><button className="btn btn-primary" disabled={busy}>Lưu</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(pricing)} title={`Bảng giá: ${pricing?.name ?? ''}`} onClose={() => setPricing(null)} wide>
        <form onSubmit={addPrice} className="inline-form">
          <Field label="Giá mới (đ)" required><input className="input" name="price" type="number" min="0" step="1000" required /></Field>
          <Field label="Áp dụng từ ngày" required hint="Giá đang hiệu lực sẽ tự kết thúc vào ngày này"><input className="input" name="valid_from" type="date" defaultValue={todayStr()} required /></Field>
          <button className="btn btn-primary" disabled={busy}>Thêm giá</button>
        </form>
        {!prices.data ? <Loading /> : prices.data.length === 0 ? <Empty>Chưa có giá</Empty> : (
          <table className="table">
            <thead><tr><th>Từ ngày</th><th>Đến trước ngày</th><th className="num">Giá</th><th>Người nhập</th><th /></tr></thead>
            <tbody>
              {prices.data.map((p) => {
                const today = todayStr();
                const current = p.valid_from <= today && (!p.valid_to || p.valid_to > today);
                return (
                  <tr key={p.id}>
                    <td>{fmtDate(p.valid_from)}</td>
                    <td>{p.valid_to ? fmtDate(p.valid_to) : <span className="muted">không thời hạn</span>}</td>
                    <td className="num">{money(p.price)}</td>
                    <td className="muted">{p.created_by_name ?? '—'} · {fmtDateTime(p.created_at)}</td>
                    <td>{current ? <Badge color="green">Đang áp dụng</Badge> : p.valid_from > today ? <Badge color="blue">Sắp áp dụng</Badge> : <Badge>Hết hiệu lực</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Modal>
    </>
  );
}
