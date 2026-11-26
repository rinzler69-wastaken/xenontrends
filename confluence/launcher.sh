#!/usr/bin/env bash
set -e

# Change to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=8080

echo "[1/2] Menjalankan server lokal (Node.js pada port $PORT)..."
if command -v node >/dev/null 2>&1; then
    node server.js &
    SERVER_PID=$!
elif command -v python3 >/dev/null 2>&1; then
    python3 -m http.server "$PORT" &
    SERVER_PID=$!
else
    echo "Error: Node.js atau Python3 tidak ditemukan!" >&2
    exit 1
fi

# Clean up server on exit
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM

# Beri jeda 2 detik agar server siap
sleep 2

echo "[2/2] Membuka browser ke http://localhost:$PORT ..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:$PORT" >/dev/null 2>&1 &
elif command -v sensible-browser >/dev/null 2>&1; then
    sensible-browser "http://localhost:$PORT" >/dev/null 2>&1 &
fi

# Tunggu server berjalan
wait "$SERVER_PID"
