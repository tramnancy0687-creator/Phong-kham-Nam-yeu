'use client';

// UC24 Quản lý thuốc / vật tư, nhập kho · UC25 Cảnh báo vật tư dưới ngưỡng
import { useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Tabs, formValues, useAction } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { fmtDate, fmtDateTime, ITEM_TYPE, money, num } from '@/lib/format';

export default function InventoryPage() {
  const [tab, setTab] = useState('items');
  const items = useApi('/items');
  const alerts = useApi('/alerts');
  const receipts = useApi('/receipts');
  const [editing, setEditing] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null);
  const receiptDetail = useApi(viewReceipt ? `/receipts/${viewReceipt}` : null);
  const [run, busy] = useAction();

  const reloadAll = () => {
    items.reload();
    alerts.reload();
    receipts.reload();
  };

  function saveItem(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const v = formValues(form);
    run(async () => {
      if (editing === 'new') await api('/items', { method: 'POST', body: v });
      else await api(`/items/${editing.id}`, { method: 'PUT', body: { name: v.name, unit: v.unit, min_threshold: Number(v.min_threshold ?? 0), is_active: form.is_active.checked } });
      setEditing(null);
      reloadAll();
    }, 'Đã lưu');
  }

  return (
    <>
      <PageHeader
        title="Thuốc & vật tư"
        uc="UC24 · UC25"
        subtitle="Tồn kho tự tăng khi nhập kho, tự giảm khi bác sĩ ghi vật tư dùng; dưới ngưỡng sẽ tự cảnh báo"
        actions={
          <>
            <button className="btn" onClick={() => setEditing('new')}>+ Thêm thuốc / vật tư</button>
            <button className="btn btn-primary" onClick={() => setReceiptOpen(true)}>+ Nhập kho</button>
          </>
        }
      />
      {alerts.data?.length > 0 && (
        <div className="alert alert-warn">
          ⚠ {alerts.data.length} mục dưới ngưỡng tối thiểu: {alerts.data.map((a) => `${a.name} (còn ${num(a.current_stock)} ${a.unit})`).join(', ')}
        </div>
      )}
      <Card>
        <Tabs
          tabs={[
            { key: 'items', label: 'Danh mục & tồn kho', count: items.data?.length },
            { key: 'alerts', label: 'Cảnh báo', count: alerts.data?.length },
            { key: 'receipts', label: 'Phiếu nhập kho', count: receipts.data?.length },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'items' && (
          <>
            <ErrorBox error={items.error} />
            {!items.data ? <Loading /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Mã</th><th>Tên</th><th>Loại</th><th className="num">Tồn kho</th><th className="num">Ngưỡng tối thiểu</th><th>Tình trạng</th><th /></tr></thead>
                  <tbody>
                    {items.data.map((m) => (
                      <tr key={m.id}>
                        <td><code>{m.code}</code></td>
                        <td>{m.name}</td>
                        <td>{ITEM_TYPE[m.item_type]}</td>
                        <td className="num" style={{ color: m.stock_quantity < m.min_threshold ? 'var(--danger)' : undefined }}>{num(m.stock_quantity)} {m.unit}</td>
                        <td className="num muted">{num(m.min_threshold)}</td>
                        <td>
                          {!m.is_active ? <Badge>Ngưng</Badge>
                            : m.stock_quantity < m.min_threshold ? <Badge color="red">Dưới ngưỡng</Badge>
                              : m.is_low ? <Badge color="orange">Sắp hết</Badge> : <Badge color="green">Đủ</Badge>}
                        </td>
                        <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(m)}>Sửa</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'alerts' && (
          !alerts.data ? <Loading /> : alerts.data.length === 0 ? <Empty>Không có cảnh báo</Empty> : (
            <table className="table">
              <thead><tr><th>Thuốc / vật tư</th><th className="num">Tồn lúc cảnh báo</th><th className="num">Tồn hiện tại</th><th className="num">Ngưỡng</th><th>Phát sinh lúc</th></tr></thead>
              <tbody>
                {alerts.data.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name} <span className="muted">({a.code})</span></td>
                    <td className="num">{num(a.stock_quantity)}</td>
                    <td className="num" style={{ color: 'var(--danger)' }}>{num(a.current_stock)} {a.unit}</td>
                    <td className="num">{num(a.min_threshold)}</td>
                    <td>{fmtDateTime(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}

        {tab === 'receipts' && (
          !receipts.data ? <Loading /> : receipts.data.length === 0 ? <Empty>Chưa có phiếu nhập</Empty> : (
            <table className="table">
              <thead><tr><th>Số</th><th>Ngày nhập</th><th>Nhà cung cấp</th><th>Người nhập</th><th className="num">Số dòng</th><th className="num">Giá trị</th></tr></thead>
              <tbody>
                {receipts.data.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => setViewReceipt(r.id)}>
                    <td>#{r.id}</td>
                    <td>{fmtDateTime(r.received_at)}</td>
                    <td>{r.supplier ?? '—'}</td>
                    <td>{r.received_by_name}</td>
                    <td className="num">{r.line_count}</td>
                    <td className="num">{money(r.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>

      <Modal open={Boolean(editing)} title={editing === 'new' ? 'Thêm thuốc / vật tư' : 'Sửa thuốc / vật tư'} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={saveItem} className="form-grid">
            <Field label="Mã" required><input className="input" name="code" defaultValue={editing.code} disabled={editing !== 'new'} required /></Field>
            <Field label="Loại" required>
              <select className="input" name="item_type" defaultValue={editing.item_type ?? 'supply'} disabled={editing !== 'new'}>
                {Object.entries(ITEM_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Tên" required className="full"><input className="input" name="name" defaultValue={editing.name} required /></Field>
            <Field label="Đơn vị tính" required><input className="input" name="unit" defaultValue={editing.unit} required placeholder="viên, ống, đôi…" /></Field>
            <Field label="Ngưỡng tối thiểu" hint="Tồn dưới mức này sẽ sinh cảnh báo"><input className="input" name="min_threshold" type="number" min="0" step="0.01" defaultValue={editing.min_threshold ?? 0} /></Field>
            {editing !== 'new' && <label className="check full"><input type="checkbox" name="is_active" defaultChecked={editing.is_active} /> Đang sử dụng</label>}
            {editing === 'new' && <div className="full muted small">Tồn kho ban đầu = 0. Dùng “Nhập kho” để thêm số lượng.</div>}
            <div className="full"><button className="btn btn-primary" disabled={busy}>Lưu</button></div>
          </form>
        )}
      </Modal>

      <Modal open={receiptOpen} title="Phiếu nhập kho" onClose={() => setReceiptOpen(false)} wide>
        <ReceiptForm
          items={(items.data ?? []).filter((i) => i.is_active)}
          busy={busy}
          onSubmit={(body) => run(async () => {
            await api('/receipts', { method: 'POST', body });
            setReceiptOpen(false);
            reloadAll();
          }, 'Đã nhập kho, tồn kho đã được cộng')}
        />
      </Modal>

      <Modal open={Boolean(viewReceipt)} title={`Phiếu nhập #${viewReceipt}`} onClose={() => setViewReceipt(null)} wide>
        {!receiptDetail.data ? <Loading /> : (
          <>
            <div className="muted">{fmtDateTime(receiptDetail.data.received_at)} · {receiptDetail.data.received_by_name} · {receiptDetail.data.supplier ?? '—'}</div>
            <table className="table">
              <thead><tr><th>Mã</th><th>Tên</th><th className="num">Số lượng</th><th className="num">Đơn giá</th><th>Hạn dùng</th></tr></thead>
              <tbody>
                {receiptDetail.data.lines.map((l) => (
                  <tr key={l.id}><td>{l.code}</td><td>{l.name}</td><td className="num">{num(l.quantity)} {l.unit}</td><td className="num">{money(l.unit_cost)}</td><td>{fmtDate(l.expiry_date)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>
    </>
  );
}

function ReceiptForm({ items, onSubmit, busy }) {
  const [lines, setLines] = useState([{ item_id: '', quantity: '', unit_cost: '', expiry_date: '' }]);
  const update = (i, key, value) => setLines((l) => l.map((x, idx) => (idx === i ? { ...x, [key]: value } : x)));
  const total = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0);

  function submit(e) {
    e.preventDefault();
    const v = formValues(e.currentTarget);
    onSubmit({ supplier: v.supplier, note: v.note, lines });
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="form-grid">
        <Field label="Nhà cung cấp"><input className="input" name="supplier" /></Field>
        <Field label="Ghi chú"><input className="input" name="note" /></Field>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Thuốc / vật tư</th><th>Số lượng</th><th>Đơn giá</th><th>Hạn dùng</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const item = items.find((x) => String(x.id) === String(l.item_id));
              return (
                <tr key={i}>
                  <td style={{ minWidth: 220 }}>
                    <select className="input" value={l.item_id} onChange={(e) => update(i, 'item_id', e.target.value)} required>
                      <option value="" disabled>— Chọn —</option>
                      {items.map((m) => <option key={m.id} value={m.id}>{m.name} (tồn {num(m.stock_quantity)} {m.unit})</option>)}
                    </select>
                  </td>
                  <td><input className="input" type="number" min="0.01" step="0.01" value={l.quantity} onChange={(e) => update(i, 'quantity', e.target.value)} required placeholder={item?.unit} /></td>
                  <td><input className="input" type="number" min="0" step="100" value={l.unit_cost} onChange={(e) => update(i, 'unit_cost', e.target.value)} /></td>
                  <td><input className="input" type="date" value={l.expiry_date} onChange={(e) => update(i, 'expiry_date', e.target.value)} /></td>
                  <td>{lines.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((x) => x.filter((_, idx) => idx !== i))}>Xóa</button>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td colSpan={2}>Tổng giá trị</td><td colSpan={3}>{money(total)}</td></tr></tfoot>
        </table>
      </div>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => setLines((x) => [...x, { item_id: '', quantity: '', unit_cost: '', expiry_date: '' }])}>+ Thêm dòng</button>
        <span className="spacer" />
        <button className="btn btn-primary" disabled={busy}>Lưu phiếu nhập</button>
      </div>
    </form>
  );
}
