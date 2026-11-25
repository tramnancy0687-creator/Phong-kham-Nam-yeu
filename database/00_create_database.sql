-- Chạy bằng superuser (tramnguyen) trên database "postgres"
-- psql -U tramnguyen -d postgres -f 00_create_database.sql

CREATE ROLE tramadmin LOGIN PASSWORD '123456';

CREATE DATABASE phong_kham_nam_yeu
    OWNER    tramadmin
    ENCODING 'UTF8'
    TEMPLATE template0;

COMMENT ON DATABASE phong_kham_nam_yeu IS 'Phòng khám Nấm yêu';

-- Chỉ tramadmin (chủ database) được kết nối
REVOKE ALL ON DATABASE phong_kham_nam_yeu FROM PUBLIC;
GRANT  ALL ON DATABASE phong_kham_nam_yeu TO tramadmin;
