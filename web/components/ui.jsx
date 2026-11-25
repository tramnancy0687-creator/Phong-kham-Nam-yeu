'use client';

import { useCallback, useEffect, useState } from 'react';

// ---------- Thông báo nhanh (toast) ----------
export function toast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type, id: Math.random() } }));
}

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail;
      setItems((list) => [...list, t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.type === 'error' ? 6000 : 3500);
    };
    window.addEventListener('app-toast', onToast);
    return () => window.removeEventListener('app-toast', onToast);
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

/** Chạy một thao tác ghi: khóa nút khi đang chạy, báo lỗi bằng toast */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, successMessage) => {
    setBusy(true);
    try {
      const result = await fn();
      if (successMessage) toast(successMessage);
      return result;
    } catch (e) {
      toast(e.message, 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return [run, busy];
}

// ---------- Bố cục ----------
export function PageHeader({ title, subtitle, actions, uc }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}{uc && <span className="uc-tag">{uc}</span>}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = '', hint }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Badge({ color = 'gray', children }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

/** map: { value: [nhãn, màu] } */
export function StatusBadge({ map, value }) {
  const [label, color] = map[value] ?? [value, 'gray'];
  return <Badge color={color}>{label}</Badge>;
}

export function Loading({ text = 'Đang tải…' }) {
  return <div className="loading">{text}</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert alert-error">{error}</div>;
}

export function Empty({ children = 'Chưa có dữ liệu' }) {
  return <div className="empty">{children}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          className={`tab ${value === t.key ? 'active' : ''}`}
          onClick={() => onChange(t.key)}
          type="button"
        >
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, max }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" title={`${value}/${max}`}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------- Form ----------
export function Field({ label, hint, required, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Đọc FormData thành object, bỏ chuỗi rỗng */
export function formValues(form) {
  const values = {};
  for (const [k, v] of new FormData(form).entries()) {
    if (v !== '') values[k] = typeof v === 'string' ? v.trim() : v;
  }
  return values;
}

export function Modal({ open, title, onClose, children, footer, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Đóng" type="button">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmButton({ message, onConfirm, className = 'btn btn-ghost btn-sm', children, disabled }) {
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => window.confirm(message) && onConfirm()}
    >
      {children}
    </button>
  );
}
