import pg from 'pg';

// timestamp / date: giữ nguyên chuỗi giờ địa phương của phòng khám, không đổi múi giờ
pg.types.setTypeParser(1114, (v) => v); // timestamp without time zone
pg.types.setTypeParser(1082, (v) => v); // date
// numeric (tiền, số lượng) và bigint (id) → number. Tiền VND nằm trong giới hạn an toàn của number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Ngày hôm nay theo giờ máy chủ (YYYY-MM-DD), không dùng toISOString vì đó là giờ UTC */
export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Truy vấn đơn, trả về mảng dòng */
export async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

/**
 * Chạy nhiều câu lệnh trong một transaction.
 * Gán app.current_staff_id để trigger ghi lịch sử biết ai đang thao tác (UC10).
 */
export async function tx(staffId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (staffId) {
      await client.query("SELECT set_config('app.current_staff_id', $1, true)", [String(staffId)]);
    }
    const q = async (text, params) => (await client.query(text, params)).rows;
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
