-- Siết ràng buộc toàn vẹn giữa product và category
BEGIN;

-- 1. Tên danh mục không được rỗng và không trùng (không phân biệt hoa/thường)
ALTER TABLE category
    ADD CONSTRAINT chk_category_name_not_blank CHECK (btrim(name) <> '');
-- pg_c_utf8: để lower() xử lý đúng chữ có dấu (Á -> á), vì database dùng locale C
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_name_lower ON category (lower(name COLLATE pg_c_utf8));

-- 2. Mỗi sản phẩm bắt buộc thuộc một danh mục
ALTER TABLE product ALTER COLUMN category_id SET NOT NULL;

-- 3. Bỏ cột chữ category cũ (dữ liệu đã chuyển sang category_id)
ALTER TABLE product DROP COLUMN IF EXISTS category;

COMMIT;
