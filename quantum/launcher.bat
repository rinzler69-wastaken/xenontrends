@echo off
title Crypto Scan Quantum Local Server Launcher

:: Masuk ke folder tempat file bat ini berada
cd /d "%~dp0"

echo [1/2] Menjalankan server lokal Python pada port 8080...
:: Menjalankan server HTTP bawaan Python di latar belakang
start cmd /k "python -m http.server 8080"

:: Beri jeda 2 detik agar server siap
timeout /t 2 /nobreak >nul

echo [2/2] Membuka browser ke http://localhost:8080 ...
start http://localhost:8080

exit