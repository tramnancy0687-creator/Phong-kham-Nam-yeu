@echo off
rem Khoi dong toan bo he thong Phong kham Nam yeu: PostgreSQL -> API Node.js -> Web Next.js
set ROOT=%~dp0
set PGHOME=%USERPROFILE%\PostgreSQL17

"%PGHOME%\pgsql\bin\pg_ctl.exe" status -D "%PGHOME%\data" >nul 2>&1
if errorlevel 1 "%PGHOME%\pgsql\bin\pg_ctl.exe" -D "%PGHOME%\data" -l "%PGHOME%\server.log" start -w

start "API - Phong kham Nam yeu (cong 4000)" cmd /k "cd /d %ROOT%server && npm run dev"
start "Web - Phong kham Nam yeu (cong 3000)" cmd /k "cd /d %ROOT%web && npm run dev"

echo Dang khoi dong... trinh duyet se mo sau khoang 10 giay.
timeout /t 10 /nobreak >nul
start "" http://localhost:3000
