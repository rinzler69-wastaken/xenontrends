@echo off
title ArgonPulse Local Server Launcher

:: Masuk ke folder tempat file bat ini berada
cd /d "%~dp0"

echo [1/2] Menjalankan server lokal (Node.js pada port 8080)...
:: Menjalankan server.js menggunakan Node.js di latar belakang
start cmd /k "node server.js"

:: Beri jeda 2 detik agar server siap
timeout /t 2 /nobreak >nul

echo [2/2] Membuka browser ke http://localhost:8080 ...
start http://localhost:8080

exit