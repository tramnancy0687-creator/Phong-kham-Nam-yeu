-- Chạy SAU seed_category.sql
INSERT INTO product (name, price, image, description, category_id)
SELECT v.name, v.price, v.image, v.description, c.id
FROM (VALUES
    ('Áo sơ mi trắng',    280000, 'https://example.com/ao-so-mi.jpg',   'Áo sơ mi công sở, vải kate chống nhăn', 'Áo'),
    ('Áo khoác gió',      450000, 'https://example.com/ao-khoac.jpg',   'Áo khoác chống nước, có mũ',            'Áo'),
    ('Áo polo',           220000, 'https://example.com/ao-polo.jpg',    'Áo polo cổ bẻ, vải cá sấu',             'Áo'),
    ('Quần kaki',         320000, 'https://example.com/quan-kaki.jpg',  'Quần kaki dáng slim fit',               'Quần'),
    ('Quần short',        180000, 'https://example.com/quan-short.jpg', 'Quần short thể thao, co giãn 4 chiều',  'Quần'),
    ('Giày da công sở',  1200000, 'https://example.com/giay-da.jpg',    'Giày da bò thật, đế cao su',            'Giày'),
    ('Dép quai ngang',    120000, 'https://example.com/dep.jpg',        'Dép cao su êm chân, chống trơn',        'Giày'),
    ('Túi xách da',       750000, 'https://example.com/tui-xach.jpg',   'Túi xách nữ da PU, nhiều ngăn',         'Phụ kiện'),
    ('Mũ lưỡi trai',       95000, 'https://example.com/mu.jpg',         'Mũ lưỡi trai thêu logo, có khóa chỉnh', 'Phụ kiện'),
    ('Thắt lưng da',      250000, 'https://example.com/that-lung.jpg',  'Thắt lưng da nam, khóa kim loại',       'Phụ kiện')
) AS v(name, price, image, description, category)
JOIN category c ON c.name = v.category;
