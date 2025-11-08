# Hook Setup Guide

This guide explains how to set up the Cursor chat hook to capture all user prompts and AI responses.

## Quick Start

1. **Ensure the hook directory exists:**
   ```bash
   mkdir -p .hook
   ```

2. **Make scripts executable (Unix/Mac):**
   ```bash
   chmod +x .hook/cursor-chat-hook.js
   chmod +x .hook/cursor-chat-hook-wrapper.sh
   ```

3. **Test the hook:**
   ```bash
   node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Test prompt"
   ```

4. **Verify events are created:**
   Check that `.cursor-hooks/event_*.json` files are created.

## Integration Methods

### Method 1: Manual Trigger (Testing)

Use the hook manually to test:
```bash
# Capture a prompt
node .hook/cursor-chat-hook.js \
  --event-type beforeSubmitPrompt \
  --prompt "Create a login form" \
  --chatTitle "Authentication"

# Capture a response
node .hook/cursor-chat-hook.js \
  --event-type afterAgentResponse \
  --prompt "Create a login form" \
  --response "I'll create a login form..." \
  --chatTitle "Authentication" \
  --status completed
```

### Method 2: File-Based Integration

If Cursor writes chat events to files:

1. **Identify where Cursor writes chat data:**
   - Check `.cursor/` directory
   - Check `.vscode/` directory
   - Check Cursor's log files

2. **Set up file monitoring:**
   ```bash
   node .hook/cursor-chat-hook.js --monitor-file /path/to/cursor/chat/log.json
   ```

3. **Or use the advanced hook:**
   ```bash
   node .hook/cursor-chat-hook-advanced.js monitor
   ```

### Method 3: Clipboard Monitoring

Monitor clipboard for chat content:

1. **Install clipboard library:**
   ```bash
   npm install clipboardy
   ```

2. **Run clipboard monitor:**
   ```bash
   node .hook/example-integration.js clipboard
   ```

3. **Copy chat content to clipboard** - the hook will detect it automatically.

### Method 4: HTTP Server

Create an HTTP endpoint to receive events:

1. **Start the HTTP server:**
   ```bash
   node .hook/example-integration.js http
   ```

2. **Send events via HTTP:**
   ```bash
   curl -X POST http://localhost:8765/hook \
     -H "Content-Type: application/json" \
     -d '{
       "eventType": "beforeSubmitPrompt",
       "prompt": "Create a login form",
       "chatTitle": "Authentication"
     }'
   ```

### Method 5: Cursor Extension Integration

If you have access to Cursor's extension API:

1. **Create a Cursor extension** that hooks into chat events
2. **Call the hook script** when events occur:

```javascript
// In your Cursor extension
const { exec } = require('child_process');
const path = require('path');

function onChatPrompt(prompt, chatTitle) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const hookPath = path.join(workspaceRoot, '.hook', 'cursor-chat-hook.js');
    
    exec(`node "${hookPath}" --event-type beforeSubmitPrompt --prompt "${prompt}" --chatTitle "${chatTitle}"`, (error) => {
        if (error) console.error('Hook error:', error);
    });
}

function onChatResponse(response, chatTitle) {
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const hookPath = path.join(workspaceRoot, '.hook', 'cursor-chat-hook.js');
    
    exec(`node "${hookPath}" --event-type afterAgentResponse --response "${response}" --chatTitle "${chatTitle}"`, (error) => {
        if (error) console.error('Hook error:', error);
    });
}
```

## Automatic Setup Script

Create a setup script to automate hook installation:

```bash
#!/bin/bash
# setup-hook.sh

# Create directories
mkdir -p .hook
mkdir -p .cursor-hooks

# Make scripts executable
chmod +x .hook/*.js .hook/*.sh 2>/dev/null

# Install dependencies (if needed)
cd .hook
npm install clipboardy 2>/dev/null || echo "Optional: npm install clipboardy for clipboard monitoring"

echo "✅ Hook setup complete!"
echo ""
echo "Next steps:"
echo "1. Test the hook: node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt 'Test'"
echo "2. Choose an integration method from SETUP.md"
echo "3. Verify events in .cursor-hooks/ directory"
```

## Verification

After setup, verify the hook is working:

1. **Check that `.cursor-hooks/` directory exists:**
   ```bash
   ls -la .cursor-hooks/
   ```

2. **Test event creation:**
   ```bash
   node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Test"
   ```

3. **Check for event file:**
   ```bash
   ls -la .cursor-hooks/event_*.json
   ```

4. **Verify TrackChat extension processes it:**
   - Open VS Code Output panel
   - Select "TrackChat" channel
   - Look for "Hook event processed" messages

## Troubleshooting

### Hook not creating events

1. **Check Node.js:**
   ```bash
   node --version
   ```

2. **Check permissions:**
   ```bash
   ls -la .hook/
   chmod +x .hook/*.js
   ```

3. **Check directory exists:**
   ```bash
   mkdir -p .cursor-hooks
   ```

4. **Enable debug mode:**
   ```bash
   DEBUG=1 node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Test"
   ```

### Events not being processed by extension

1. **Check extension is active:**
   - Open Command Palette
   - Run "TrackChat: Show Hook System Status"

2. **Check file watcher:**
   - Look for "Hook file watcher initialized" in extension logs

3. **Check event JSON format:**
   ```bash
   cat .cursor-hooks/event_*.json | jq .
   ```

4. **Check extension logs:**
   - View → Output → TrackChat

### Integration not working

1. **Verify hook path:**
   ```bash
   which node
   node .hook/cursor-chat-hook.js --help
   ```

2. **Check file paths:**
   - Ensure workspace root is correct
   - Check `.cursor-hooks/` is in workspace root

3. **Test manually first:**
   - Use Method 1 (Manual Trigger) to verify basic functionality
   - Then try your chosen integration method

## Best Practices

1. **Use absolute paths** in integration scripts
2. **Handle errors gracefully** - don't let hook failures break Cursor
3. **Log hook activity** for debugging
4. **Clean up old event files** periodically (optional)
5. **Use environment variables** for configuration

## Example: Complete Integration

Here's a complete example that combines multiple methods:

```javascript
// complete-integration.js
const { writeEvent, getWorkspaceRoot } = require('./cursor-chat-hook.js');
const fs = require('fs');
const path = require('path');

const workspaceRoot = getWorkspaceRoot();

// Method 1: Monitor clipboard
try {
    const clipboardy = require('clipboardy');
    let lastClipboard = '';
    
    setInterval(() => {
        const current = clipboardy.readSync();
        if (current !== lastClipboard && isChatContent(current)) {
            const event = parseChatFromClipboard(current);
            writeEvent(workspaceRoot, event);
            lastClipboard = current;
        }
    }, 2000);
} catch (e) {
    console.log('Clipboard monitoring not available');
}

// Method 2: Monitor chat files
const chatDir = path.join(workspaceRoot, '.cursor', 'chat');
if (fs.existsSync(chatDir)) {
    fs.watch(chatDir, { recursive: true }, (eventType, filename) => {
        if (filename.endsWith('.json')) {
            const filePath = path.join(chatDir, filename);
            setTimeout(() => {
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    writeEvent(workspaceRoot, data);
                } catch (e) {
                    // Ignore errors
                }
            }, 100);
        }
    });
}

console.log('✅ Complete integration running');
```

Run it:
```bash
node .hook/complete-integration.js
```

