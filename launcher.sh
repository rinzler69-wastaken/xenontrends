#!/usr/bin/env bash
set -e

# Change to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-8080}"

echo "=================================================="
echo " ARGON TERMINAL — UNIFIED ECOSYSTEM LAUNCHER"
echo "=================================================="
echo "[1/2] Menjalankan server web lokal di port $PORT..."

if command -v python3 >/dev/null 2>&1; then
    python3 -m http.server "$PORT" &
    SERVER_PID=$!
elif command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
    npx serve -l "$PORT" &
    SERVER_PID=$!
else
    echo "Error: Python3 atau Node.js tidak ditemukan!" >&2
    exit 1
fi

trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM

sleep 1.5

echo "[2/2] Membuka browser ke http://localhost:$PORT ..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:$PORT" >/dev/null 2>&1 &
elif command -v sensible-browser >/dev/null 2>&1; then
    sensible-browser "http://localhost:$PORT" >/dev/null 2>&1 &
fi

echo "Portal aktif di http://localhost:$PORT"
echo "Tekan Ctrl+C untuk menghentikan server."

wait "$SERVER_PID"
