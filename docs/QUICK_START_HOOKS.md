# Quick Start: Hook System Setup

This guide shows you exactly what commands to run when you first start using the hook system.

## Initial Setup (One-Time)

### Step 1: Install Hook Files to Your Project

**Command:** `TrackChat: Install Hook Files to Project`

**How to run:**
1. Open Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type: `TrackChat: Install Hook Files to Project`
3. Press Enter
4. If files already exist, choose "Overwrite" or "Cancel"

**What it does:**
- Copies all hook files from extension to your project's `.hook/` directory
- Creates `.cursor-hooks/` directory for event storage
- Sets up executable permissions

**Expected output:**
```
✅ Hook installation complete! 8 file(s) installed to .hook/ directory.
```

### Step 2: Verify Installation

**Check files were created:**
```bash
# In your project root
ls .hook/
ls .cursor-hooks/
```

**You should see:**
- `.hook/cursor-chat-hook.js`
- `.hook/cursor-chat-hook-advanced.js`
- `.hook/README.md`
- `.hook/SETUP.md`
- And other hook files

## Automatic Real-Time Capture (Recommended)

### Start Auto-Detector

**One command to start automatic capture:**
```bash
bash .hook/start-auto-detector.sh
```

**What it does:**
- Monitors clipboard for chat prompts and responses
- Monitors Cursor chat files (if available)
- Automatically captures and sends events to extension
- Runs in background

**Usage:**
1. Start the detector: `bash .hook/start-auto-detector.sh`
2. Open a chat in Cursor
3. Type your prompt
4. **Copy prompt to clipboard** (Ctrl+C / Cmd+C) before sending
5. When AI responds, **copy response to clipboard**
6. Hook automatically detects and processes both!

**Stop the detector:**
```bash
bash .hook/stop-auto-detector.sh
```

**View logs:**
```bash
tail -f .hook/auto-detector.log
```

## Daily Usage Commands

### Option A: Automatic Detection (Recommended)

See "Automatic Real-Time Capture" above.

### Option B: Manual Event Capture (Testing)

**Capture a user prompt:**
```bash
node .hook/cursor-chat-hook.js \
  --event-type beforeSubmitPrompt \
  --prompt "Your prompt text here" \
  --chatTitle "Chat Title"
```

**Capture an AI response:**
```bash
node .hook/cursor-chat-hook.js \
  --event-type afterAgentResponse \
  --prompt "Original prompt" \
  --response "AI response text" \
  --chatTitle "Chat Title" \
  --status completed \
  --affectedFiles "file1.ts,file2.ts"
```

### Option B: Start Monitoring (Automatic)

**Start advanced monitoring:**
```bash
node .hook/cursor-chat-hook-advanced.js monitor
```

**Or start polling:**
```bash
node .hook/cursor-chat-hook-advanced.js poll
```

**Or start HTTP server:**
```bash
node .hook/example-integration.js http
```

## Extension Commands (VS Code Command Palette)

### Essential Commands

1. **`TrackChat: Install Hook Files to Project`**
   - Run once to set up hooks
   - Run again to update hook files

2. **`TrackChat: Show Hook System Status`**
   - Check how many events are paired
   - See pending prompts
   - View recent events

3. **`TrackChat: Toggle Hook Debug Mode`**
   - Enable/disable verbose logging
   - Useful for troubleshooting

### Monitoring Commands

4. **`TrackChat: Start Automatic Chat Monitoring`**
   - Starts ChatMonitor (alternative to hooks)
   - Monitors documents, clipboard, etc.

5. **`TrackChat: Show Active Chat Tab Info`**
   - Shows information about detected chat tabs
   - Useful for debugging detection issues

### Event Processing Commands

6. **`TrackChat: Process Hook Event`**
   - Manually process a hook event
   - Paste JSON event data

7. **`TrackChat: Get Chat Sessions`**
   - Retrieve chat sessions from API
   - Requires itinerary ID

## Complete Setup Script

If you prefer a single command setup:

```bash
# 1. Install hooks via extension command (see above)
# OR manually:
mkdir -p .hook .cursor-hooks
# Copy hook files to .hook/ (or use extension command)

# 2. Make scripts executable (Unix/Mac)
chmod +x .hook/*.js .hook/*.sh

# 3. Test the hook
node .hook/cursor-chat-hook.js \
  --event-type beforeSubmitPrompt \
  --prompt "Test prompt" \
  --chatTitle "Test Chat"

# 4. Verify event was created
ls .cursor-hooks/

# 5. Check extension processed it
# Open: View → Output → TrackChat
```

## Verification Checklist

After setup, verify everything works:

- [ ] `.hook/` directory exists with hook files
- [ ] `.cursor-hooks/` directory exists
- [ ] Can run hook script manually
- [ ] Extension shows "Hook file watcher initialized" in logs
- [ ] Test event is processed (check extension output)

## Quick Test Sequence

```bash
# 1. Test prompt event
node .hook/cursor-chat-hook.js \
  --event-type beforeSubmitPrompt \
  --prompt "Test: Create a button component" \
  --chatTitle "Component Test"

# 2. Wait a moment, then check extension output
# View → Output → TrackChat
# Should see: "💬 Before Submit Prompt: Test: Create..."

# 3. Test response event
node .hook/cursor-chat-hook.js \
  --event-type afterAgentResponse \
  --prompt "Test: Create a button component" \
  --response "I'll create a button component for you..." \
  --chatTitle "Component Test" \
  --status completed

# 4. Check extension output
# Should see: "✅ Matched response with prompt"
# Should see: "✅ Paired event sent successfully"
```

## Troubleshooting Commands

**Check hook status:**
```bash
# Command Palette
TrackChat: Show Hook System Status
```

**Enable debug mode:**
```bash
# Command Palette
TrackChat: Toggle Hook Debug Mode

# Or in terminal
export DEBUG=1
node .hook/cursor-chat-hook.js ...
```

**Check extension logs:**
```
View → Output → Select "TrackChat" channel
```

**Verify file watcher:**
- Look for: "📁 Hook file watcher initialized (watching .cursor-hooks/)"
- In extension output logs

## Common Workflows

### Workflow 1: Manual Capture (Testing)
```bash
# Capture prompt
node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "..." --chatTitle "..."

# Capture response
node .hook/cursor-chat-hook.js --event-type afterAgentResponse --response "..." --chatTitle "..."
```

### Workflow 2: Automatic Monitoring
```bash
# Start monitoring in background
node .hook/cursor-chat-hook-advanced.js monitor &

# Or start HTTP server
node .hook/example-integration.js http
```

### Workflow 3: Integration with Cursor
```bash
# Set up file watcher to monitor Cursor's chat files
# (See .hook/SETUP.md for integration methods)
```

## Next Steps

After initial setup:

1. **Choose your capture method:**
   - Manual (testing)
   - File monitoring (if Cursor writes to files)
   - Clipboard monitoring
   - HTTP endpoint
   - Custom integration

2. **Configure auto-send** (optional):
   - Edit `config.json`
   - Set `"autoSend": true`

3. **Read documentation:**
   - `.hook/README.md` - Hook usage
   - `.hook/SETUP.md` - Integration methods
   - `docs/HOOK_SYSTEM_EXPLAINED.md` - How it works

## Summary: First-Time Setup

**Minimum commands to get started:**

1. **Install hooks:**
   ```
   Command Palette → TrackChat: Install Hook Files to Project
   ```

2. **Test it:**
   ```bash
   node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Test"
   ```

3. **Verify:**
   - Check `.cursor-hooks/` for event file
   - Check extension output for processing message

That's it! The hook system is now ready to capture chat events.

