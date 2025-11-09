#!/bin/bash

# Stop Cursor Chat Auto-Detector

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/auto-detector.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "⚠️  Auto-detector is not running (no PID file found)"
    exit 1
fi

PID=$(cat "$PID_FILE")

if ! ps -p "$PID" > /dev/null 2>&1; then
    echo "⚠️  Auto-detector process not found (PID: $PID)"
    rm "$PID_FILE"
    exit 1
fi

echo "🛑 Stopping auto-detector (PID: $PID)..."
kill "$PID"

# Wait a bit for graceful shutdown
sleep 2

if ps -p "$PID" > /dev/null 2>&1; then
    echo "⚠️  Process still running, forcing kill..."
    kill -9 "$PID"
fi

rm "$PID_FILE"
echo "✅ Auto-detector stopped"

