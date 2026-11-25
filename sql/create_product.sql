-- Tạo bảng product (chạy SAU create_category.sql)
CREATE TABLE IF NOT EXISTS product (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(255)   NOT NULL,
    price       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    image       TEXT,
    description TEXT,
    category_id BIGINT         NOT NULL,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
    CONSTRAINT fk_product_category
        FOREIGN KEY (category_id) REFERENCES category(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_product_category_id ON product(category_id);

COMMENT ON TABLE  product             IS 'Danh sách sản phẩm';
COMMENT ON COLUMN product.id          IS 'Mã sản phẩm (tự tăng)';
COMMENT ON COLUMN product.name        IS 'Tên sản phẩm';
COMMENT ON COLUMN product.price       IS 'Giá sản phẩm';
COMMENT ON COLUMN product.image       IS 'Đường dẫn/URL hình ảnh';
COMMENT ON COLUMN product.description IS 'Mô tả sản phẩm';
COMMENT ON COLUMN product.category_id IS 'Mã danh mục (khóa ngoại tới category.id)';
