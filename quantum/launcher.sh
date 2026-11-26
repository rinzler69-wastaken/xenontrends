#!/usr/bin/env bash
set -e

# Change to the directory containing this script
cd -- "$(dirname -- "$(readlink -f -- "$0")")"

echo "[1/2] Starting the local Python server on port 8080..."

# Run the built-in Python HTTP server in the background
python3 -m http.server 8080 >/dev/null 2>&1 &
SERVER_PID=$!

# Give the server a moment to start
sleep 2

echo "[2/2] Opening http://localhost:8080 in your browser..."
xdg-open "http://localhost:8080" >/dev/null 2>&1 &

echo "Server PID: $SERVER_PID"
echo "Stop the server with: kill $SERVER_PID"

