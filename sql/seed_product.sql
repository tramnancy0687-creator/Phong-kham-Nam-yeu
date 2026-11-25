-- Chạy SAU seed_category.sql
INSERT INTO product (name, price, image, description, category_id)
SELECT v.name, v.price, v.image, v.description, c.id
FROM (VALUES
    ('Áo thun',      150000, 'https://example.com/ao.jpg',   'Áo thun cotton 100%',     'Áo'),
    ('Quần jean',    350000, 'https://example.com/quan.jpg', 'Quần jean ống đứng',      'Quần'),
    ('Giày sneaker', 890000, 'https://example.com/giay.jpg', 'Giày thể thao màu trắng', 'Giày')
) AS v(name, price, image, description, category)
JOIN category c ON c.name = v.category;
