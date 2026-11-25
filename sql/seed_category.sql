INSERT INTO category (name, description) VALUES
('Áo',       'Áo thun, áo sơ mi, áo khoác, áo polo'),
('Quần',     'Quần jean, quần kaki, quần short'),
('Giày',     'Giày, dép các loại'),
('Phụ kiện', 'Túi xách, mũ, thắt lưng')
ON CONFLICT (name) DO NOTHING;
