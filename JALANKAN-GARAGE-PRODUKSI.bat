@echo off
REM ============================================================
REM  GARAGE OS - Peluncur PRODUKSI (build + start)
REM  Syarat: sudah pernah "npm run build" sukses (ada .next\BUILD_ID).
REM  Kalau belum di-build, hapus REM di baris "call npm run build" bawah.
REM  Biarkan jendela ini TERBUKA selama jam operasional.
REM ============================================================
cd /d "%~dp0"
set NODE_OPTIONS=--experimental-wasm-modules

REM call npm run build

if not exist ".next\BUILD_ID" (
  echo.
  echo   [!] Belum ada hasil build (.next\BUILD_ID tidak ada).
  echo       Jalankan "npm run build" dulu di terminal, atau hapus REM
  echo       pada baris "call npm run build" di file .bat ini.
  echo.
  pause
  exit /b 1
)

echo.
echo   Menjalankan GARAGE OS (PRODUKSI) di port 3001 ...
echo   Jangan tutup jendela ini. Tekan Ctrl+C untuk berhenti.
echo.
call npm run start
echo.
echo   Server berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
