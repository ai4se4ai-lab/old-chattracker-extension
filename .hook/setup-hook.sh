#!/bin/bash

# Cursor Chat Hook Setup Script
# This script sets up the hook system in your project

set -e

echo "🚀 Setting up Cursor Chat Hook..."

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p "$PROJECT_ROOT/.hook"
mkdir -p "$PROJECT_ROOT/.cursor-hooks"

# Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x "$SCRIPT_DIR"/*.js 2>/dev/null || true
chmod +x "$SCRIPT_DIR"/*.sh 2>/dev/null || true

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    echo "   Please install Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Test the hook
echo ""
echo "🧪 Testing hook..."
node "$SCRIPT_DIR/cursor-chat-hook.js" --event-type beforeSubmitPrompt --prompt "Setup test" --chatTitle "Setup" > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Hook test successful!"
    
    # Check if event was created
    if [ -f "$PROJECT_ROOT/.cursor-hooks"/event_*.json ]; then
        echo "✅ Event file created successfully"
        rm "$PROJECT_ROOT/.cursor-hooks"/event_*.json 2>/dev/null || true
    fi
else
    echo "⚠️  Hook test had issues (this may be normal)"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "   1. Read .hook/README.md for usage instructions"
echo "   2. Read .hook/SETUP.md for integration methods"
echo "   3. Test: node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt 'Test'"
echo ""
echo "💡 The TrackChat extension will automatically process events from .cursor-hooks/"

