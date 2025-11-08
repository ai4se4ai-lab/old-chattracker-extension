# Cursor Chat Hook

This directory contains hooks for capturing Cursor chat events and sending them to the TrackChat extension.

## Quick Installation

**Easiest way:** Use the TrackChat extension command:
1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run: `TrackChat: Install Hook Files to Project`
3. Follow the prompts

This will automatically copy all hook files to your project's `.hook/` directory.

## Manual Installation

If you prefer to install manually, see the [SETUP.md](./SETUP.md) guide.

## Files

- `cursor-chat-hook.js` - Main Node.js hook script
- `cursor-chat-hook-wrapper.sh` - Bash wrapper for the hook
- `README.md` - This file

## Setup

1. **Ensure the hook directory exists:**
   ```bash
   mkdir -p .hook
   ```

2. **Make scripts executable (Unix/Mac):**
   ```bash
   chmod +x .hook/cursor-chat-hook.js
   chmod +x .hook/cursor-chat-hook-wrapper.sh
   ```

3. **Ensure Node.js is installed:**
   ```bash
   node --version
   ```

## Usage

### Method 1: Command Line (Manual)

Capture a user prompt:
```bash
node .hook/cursor-chat-hook.js \
  --event-type beforeSubmitPrompt \
  --prompt "Create a login form" \
  --chatTitle "Authentication Feature" \
  --status in-progress
```

Capture an AI response:
```bash
node .hook/cursor-chat-hook.js \
  --event-type afterAgentResponse \
  --prompt "Create a login form" \
  --response "I'll create a login form with email and password fields..." \
  --chatTitle "Authentication Feature" \
  --status completed \
  --affectedFiles "src/components/Login.tsx,src/utils/auth.ts"
```

### Method 2: File Monitoring

Monitor a file that Cursor writes to:
```bash
node .hook/cursor-chat-hook.js --monitor-file /path/to/cursor/chat/log.json
```

### Method 3: Integration with Cursor

To integrate with Cursor, you can:

#### Option A: Use Cursor's Extension API (if available)

Create a Cursor extension that calls the hook:
```javascript
// In your Cursor extension
const { exec } = require('child_process');
const path = require('path');

function captureChatEvent(event) {
    const hookPath = path.join(workspaceRoot, '.hook', 'cursor-chat-hook.js');
    const args = [
        '--event-type', event.type,
        '--prompt', event.prompt,
        '--response', event.response || '',
        '--chatTitle', event.title || 'Chat',
        '--status', event.status || 'in-progress'
    ];
    
    exec(`node "${hookPath}" ${args.map(a => `"${a}"`).join(' ')}`, (error) => {
        if (error) console.error('Hook error:', error);
    });
}
```

#### Option B: File-based Integration

If Cursor writes chat events to a file, set up a file watcher:

1. Configure Cursor to write events to a known location (e.g., `.cursor/chat-events.json`)
2. Run the hook in monitor mode:
   ```bash
   node .hook/cursor-chat-hook.js --monitor-file .cursor/chat-events.json
   ```

#### Option C: Clipboard Integration

Monitor clipboard for chat content (requires additional setup):
```bash
node .hook/cursor-chat-hook.js --monitor-clipboard
```

## Event Format

Events are written as JSON files to `.cursor-hooks/` directory with the following structure:

```json
{
  "eventType": "beforeSubmitPrompt" | "afterAgentResponse" | "chat-summary",
  "chatTitle": "Chat Title",
  "userPrompt": "User's prompt text",
  "aiResponse": "AI's response (optional for beforeSubmitPrompt)",
  "affectedFiles": ["file1.ts", "file2.ts"],
  "status": "in-progress" | "completed" | "failed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "metadata": {
    // Additional metadata
  }
}
```

## Field Mapping

The hook automatically maps various field names:

**User Prompt:**
- `prompt` → `userPrompt`
- `user_input` → `userPrompt`
- `message` → `userPrompt`

**AI Response:**
- `response` → `aiResponse`
- `agentResponse` → `aiResponse`
- `assistantResponse` → `aiResponse`

**Chat Title:**
- `title` → `chatTitle`
- `chat_title` → `chatTitle`

**Files:**
- `files` → `affectedFiles`
- `modifiedFiles` → `affectedFiles`
- `changedFiles` → `affectedFiles`

## Debug Mode

Enable debug mode for verbose logging:

```bash
DEBUG=1 node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Test"
```

Or set environment variable:
```bash
export DEBUG=1
node .hook/cursor-chat-hook.js ...
```

## Integration Examples

### Example 1: Cursor Extension Hook

```javascript
// In Cursor extension
const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

vscode.workspace.onDidChangeTextDocument((e) => {
    // Detect chat document changes
    if (isChatDocument(e.document)) {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const hookPath = path.join(workspaceRoot, '.hook', 'cursor-chat-hook.js');
        
        const content = e.document.getText();
        const event = parseChatContent(content);
        
        exec(`node "${hookPath}" --event-type ${event.type} --prompt "${event.prompt}"`, (error) => {
            if (error) console.error('Hook error:', error);
        });
    }
});
```

### Example 2: File Watcher Script

```javascript
// watch-cursor-chat.js
const fs = require('fs');
const path = require('path');
const { writeEvent } = require('./.hook/cursor-chat-hook.js');

// Watch Cursor's chat log file (adjust path as needed)
const chatLogPath = path.join(process.env.HOME, '.cursor', 'chat.log');

fs.watchFile(chatLogPath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
        const content = fs.readFileSync(chatLogPath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1];
        
        try {
            const event = JSON.parse(lastLine);
            writeEvent(process.cwd(), event);
        } catch (e) {
            // Not JSON, try to parse as text
        }
    }
});
```

## Troubleshooting

**Hook not capturing events:**
- Check that `.cursor-hooks/` directory exists and is writable
- Verify Node.js is installed and in PATH
- Enable debug mode: `DEBUG=1 node .hook/cursor-chat-hook.js ...`

**Events not being processed:**
- Check that TrackChat extension is installed and active
- Verify file watcher is working (check extension logs)
- Ensure event JSON is valid

**Permission errors:**
- Make scripts executable: `chmod +x .hook/*.js .hook/*.sh`
- Check directory permissions on `.cursor-hooks/`

## Output Location

Events are written to: `.cursor-hooks/event_[timestamp]_[random].json`

The TrackChat extension automatically watches this directory and processes events as they are created.

