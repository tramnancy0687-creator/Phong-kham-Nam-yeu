# Đưa database phong_kham_nam_yeu (cấu trúc + dữ liệu hiện tại) từ máy local lên PostgreSQL online (Neon).
# Chuỗi kết nối đích lấy từ DATABASE_URL trong server/.env.production.
#
# Chạy:  powershell -ExecutionPolicy Bypass -File database\deploy-online.ps1
#        thêm -Overwrite để XÓA dữ liệu online hiện có và ghi đè bằng dữ liệu local.
param([switch]$Overwrite)

$ErrorActionPreference = 'Stop'
$root   = Split-Path $PSScriptRoot -Parent
$pgBin  = Join-Path $env:USERPROFILE 'PostgreSQL17\pgsql\bin'
$envFile = Join-Path $root 'server\.env.production'
$dump   = Join-Path $env:TEMP 'phong_kham_nam_yeu.dump'

if (-not (Test-Path $envFile)) { throw "Chưa có $envFile — copy từ server\.env.production.example và điền DATABASE_URL" }
$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw 'Không thấy DATABASE_URL trong server\.env.production' }
$url = ($line -split '=', 2)[1].Trim().Trim('"')
# Sao lưu / khôi phục nên đi thẳng vào DB, không qua pooler (pgbouncer)
# psql (libpq) cần file chứng chỉ gốc cho verify-full → dùng require (vẫn mã hóa); Node pg tự kiểm tra chứng chỉ
$directUrl = $url -replace '-pooler\.', '.' -replace 'sslmode=verify-full', 'sslmode=require'

function Invoke-Remote([string]$sql) { & "$pgBin\psql.exe" $directUrl -X -v ON_ERROR_STOP=1 -Atc $sql }

Write-Host '1/4 Kiểm tra kết nối tới DB online...'
$version = Invoke-Remote 'show server_version'
if ($LASTEXITCODE) { throw 'Không kết nối được DB online — kiểm tra lại DATABASE_URL' }
if ([int]($version -split '\.')[0] -lt 17) { throw "DB online là PostgreSQL $version — cần bản 17 trở lên (collation pg_c_utf8)" }
$hasData = Invoke-Remote "select to_regclass('public.staff') is not null"
if ($hasData -eq 't' -and -not $Overwrite) {
  throw 'DB online đã có dữ liệu. Chạy lại với -Overwrite nếu muốn ghi đè bằng dữ liệu local.'
}

Write-Host '2/4 Sao lưu DB local...'
$env:PGPASSWORD = '123456'
& "$pgBin\pg_dump.exe" -h localhost -U tramadmin -d phong_kham_nam_yeu -Fc --no-owner --no-acl -f $dump
Remove-Item Env:PGPASSWORD
if ($LASTEXITCODE) { throw 'pg_dump lỗi — PostgreSQL local đã bật chưa (start-db.bat)?' }

Write-Host '3/4 Khôi phục lên DB online...'
# Bỏ "COMMENT ON EXTENSION": trên DB online tài khoản của mình không sở hữu extension nên lệnh này bị từ chối
$toc = "$dump.list"
& "$pgBin\pg_restore.exe" -l $dump | Where-Object { $_ -notmatch 'COMMENT - EXTENSION' } | Set-Content $toc -Encoding ascii
$restoreArgs = @('-d', $directUrl, '-L', $toc, '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error')
if ($Overwrite) { $restoreArgs += @('--clean', '--if-exists') }
& "$pgBin\pg_restore.exe" @restoreArgs $dump
if ($LASTEXITCODE) { throw 'pg_restore lỗi — DB online không bị thay đổi (đã rollback)' }

Write-Host '4/4 Đặt múi giờ và kiểm tra...'
# Hàm/giá trị mặc định dùng now(), current_date → phải theo giờ Việt Nam như DB local
Invoke-Remote "DO `$`$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone = %L', current_database(), 'Asia/Bangkok'); END `$`$" | Out-Null
if ($LASTEXITCODE) { throw 'Không đặt được múi giờ cho DB online' }
# Câu SQL chỉ dùng ASCII: PowerShell 5.1 làm hỏng chữ có dấu khi truyền tham số cho psql
$c = (Invoke-Remote 'select (select count(*) from staff), (select count(*) from patient), (select count(*) from appointment), (select count(*) from invoice)') -split '\|'
Write-Host "Dữ liệu online: $($c[0]) nhân viên, $($c[1]) bệnh nhân, $($c[2]) lịch hẹn, $($c[3]) hóa đơn"
Remove-Item $dump, $toc
Write-Host 'Xong. Chạy thử backend với DB online: cd server ; npm run start:prod'
