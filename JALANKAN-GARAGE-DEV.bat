@echo off
REM ============================================================
REM  GARAGE OS - Peluncur DEV (LAN)
REM  Klik dua kali file ini untuk menjalankan server.
REM  Biarkan jendela ini TERBUKA selama jam operasional.
REM  Akses: http://localhost:3001  atau  http://<IP-LAN>:3001
REM ============================================================
cd /d "%~dp0"
set NODE_OPTIONS=--experimental-wasm-modules
echo.
echo   Menjalankan GARAGE OS (dev LAN) di port 3001 ...
echo   Jangan tutup jendela ini. Tekan Ctrl+C untuk berhenti.
echo.
call npm run dev:lan
echo.
echo   Server berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
