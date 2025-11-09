#!/bin/bash

# Start Cursor Chat Auto-Detector
# This script starts the auto-detector in the background

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DETECTOR_SCRIPT="$SCRIPT_DIR/cursor-chat-auto-detector.js"
LOG_FILE="$SCRIPT_DIR/auto-detector.log"
PID_FILE="$SCRIPT_DIR/auto-detector.pid"

# Check if Node.js is available
# Try multiple methods for cross-platform compatibility
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif which node &> /dev/null; then
    NODE_CMD="node"
elif [ -x "$(command -v node)" ]; then
    NODE_CMD="node"
else
    # Try to verify node exists by running it
    if node --version &> /dev/null; then
        NODE_CMD="node"
    else
        echo "❌ Node.js is not installed or not in PATH"
        echo "   Please install Node.js from https://nodejs.org/"
        echo "   Or try: node --version"
        exit 1
    fi
fi

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "⚠️  Auto-detector is already running (PID: $PID)"
        echo "   Stop it first: bash $SCRIPT_DIR/stop-auto-detector.sh"
        exit 1
    else
        # PID file exists but process is dead, remove it
        rm "$PID_FILE"
    fi
fi

# Start the detector
echo "🚀 Starting Cursor Chat Auto-Detector..."
echo "   Log file: $LOG_FILE"
echo "   PID file: $PID_FILE"

# Start in background
nohup $NODE_CMD "$DETECTOR_SCRIPT" > "$LOG_FILE" 2>&1 &
DETECTOR_PID=$!

# Save PID
echo $DETECTOR_PID > "$PID_FILE"

echo "✅ Auto-detector started (PID: $DETECTOR_PID)"
echo ""
echo "📋 Commands:"
echo "   View logs: tail -f $LOG_FILE"
echo "   Stop: bash $SCRIPT_DIR/stop-auto-detector.sh"
echo "   Status: ps -p $DETECTOR_PID"

