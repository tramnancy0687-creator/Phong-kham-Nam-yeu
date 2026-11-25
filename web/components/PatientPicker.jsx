'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { age, fmtDate, RELATIONSHIP } from '@/lib/format';

/** UC01: tìm bệnh nhân theo SĐT hoặc tên rồi chọn một người */
export default function PatientPicker({ value, onChange, allowRegister = true }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await api(`/patients?q=${encodeURIComponent(q)}`));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [term]);

  if (value) {
    return (
      <div className="picked">
        <div>
          <strong>{value.full_name}</strong>
          <span className="muted"> · {value.phone} · {age(value.date_of_birth)} tuổi</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Đổi</button>
      </div>
    );
  }

  return (
    <div className="picker">
      <input
        className="input"
        placeholder="Nhập SĐT hoặc tên bệnh nhân…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        autoFocus
      />
      {searching && <div className="muted small">Đang tìm…</div>}
      {results.length > 0 && (
        <ul className="picker-list">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onChange(p)} disabled={Boolean(p.archived_at)}>
                <strong>{p.full_name}</strong>
                <span className="muted">
                  {p.phone} ({RELATIONSHIP[p.relationship] ?? p.relationship}) · {fmtDate(p.date_of_birth)}
                  {p.archived_at && ' · đã lưu trữ'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {term.trim().length >= 2 && !searching && results.length === 0 && (
        <div className="muted small">
          Không tìm thấy.
          {allowRegister && (
            <> <Link href={`/benh-nhan?dang-ky=${encodeURIComponent(term.trim())}`}>Đăng ký bệnh nhân mới</Link></>
          )}
        </div>
      )}
    </div>
  );
}
