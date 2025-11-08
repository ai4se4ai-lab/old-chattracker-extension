#!/bin/bash

# Cursor Chat Hook Wrapper (Bash)
# 
# This wrapper script can be used to integrate the hook with Cursor
# Place this in .hook/ directory and configure Cursor to execute it

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/cursor-chat-hook.js"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    exit 1
fi

# Execute the Node.js hook script
# Pass all arguments through
node "$NODE_SCRIPT" "$@"

