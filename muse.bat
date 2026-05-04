@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$connections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($pidValue in $pids) { if ($pidValue -and $pidValue -ne $PID) { Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue } }"
timeout /t 2 /nobreak >nul
start "" wscript.exe "%~dp0Muse.vbs"
exit /b
