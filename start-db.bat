@echo off
set PGHOME=%USERPROFILE%\PostgreSQL17
"%PGHOME%\pgsql\bin\pg_ctl.exe" -D "%PGHOME%\data" -l "%PGHOME%\server.log" start -w
pause
