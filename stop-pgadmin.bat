@echo off
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe'\" | Where-Object { $_.CommandLine -like '*pgAdmin4.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; 'Da tat pgAdmin (PID ' + $_.ProcessId + ')' }"
pause
