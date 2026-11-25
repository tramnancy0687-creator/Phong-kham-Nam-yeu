@echo off
set PGHOME=%USERPROFILE%\PostgreSQL17
set PGADMIN=%PGHOME%\pgsql\pgAdmin 4
set PATH=%PGADMIN%\runtime;%PGHOME%\pgsql\bin;%PATH%

rem Bat PostgreSQL neu chua chay
"%PGHOME%\pgsql\bin\pg_ctl.exe" status -D "%PGHOME%\data" >nul 2>&1
if errorlevel 1 "%PGHOME%\pgsql\bin\pg_ctl.exe" -D "%PGHOME%\data" -l "%PGHOME%\server.log" start -w

rem Bat pgAdmin web (chay nen) va mo trinh duyet
cd /d "%PGADMIN%\web"
start "" "%PGADMIN%\python\pythonw.exe" pgAdmin4.py
echo Dang khoi dong pgAdmin, doi khoang 10 giay...
timeout /t 10 /nobreak >nul
start "" http://127.0.0.1:5050
