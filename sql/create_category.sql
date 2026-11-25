-- Tạo bảng category (chạy TRƯỚC create_product.sql)
CREATE TABLE IF NOT EXISTS category (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE
                CONSTRAINT chk_category_name_not_blank CHECK (btrim(name) <> ''),
    description TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Không cho trùng tên khi khác hoa/thường ("Áo" và "áo").
-- pg_c_utf8: để lower() xử lý đúng chữ có dấu, vì database dùng locale C
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_name_lower ON category (lower(name COLLATE pg_c_utf8));

COMMENT ON TABLE  category             IS 'Danh mục sản phẩm';
COMMENT ON COLUMN category.id          IS 'Mã danh mục (tự tăng)';
COMMENT ON COLUMN category.name        IS 'Tên danh mục (không trùng)';
COMMENT ON COLUMN category.description IS 'Mô tả danh mục';
