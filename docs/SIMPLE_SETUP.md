# Simple Setup: Automatic Chat Capture

This is the simplest way to get automatic real-time chat capture working.

## Step 1: Install Hooks (One-Time)

**VS Code Command Palette:**
```
TrackChat: Install Hook Files to Project
```

This copies all hook files to your project's `.hook/` directory.

## Step 2: Install Dependencies (One-Time)

**Windows (PowerShell):**
```powershell
.\.hook\install-dependencies.ps1
```

Or manually:
```powershell
cd .hook
npm install clipboardy
```

## Step 3: Start Auto-Detector (One-Time Per Session)

**Windows (PowerShell):**
```powershell
.\.hook\start-auto-detector.ps1
```

**Windows (Command Prompt):**
```cmd
.hook\start-auto-detector.bat
```

**Linux/Mac/Git Bash:**
```bash
bash .hook/start-auto-detector.sh
```

**Or run directly:**
```bash
node .hook/cursor-chat-auto-detector.js
```

## Step 4: Use Cursor Chat Normally

1. **Open a chat tab in Cursor**
2. **Type your prompt**
3. **Before sending, copy it to clipboard** (Ctrl+C / Cmd+C)
4. **Send the prompt**
5. **When AI responds, copy the response to clipboard** (Ctrl+C / Cmd+C)

**That's it!** The hook automatically:
- ✅ Detects your prompt from clipboard
- ✅ Detects AI response from clipboard
- ✅ Writes events to `.cursor-hooks/`
- ✅ Extension processes them automatically
- ✅ Sends to backend API

## How It Works

```
You type prompt → Copy to clipboard → Hook detects → Writes event → Extension processes → Backend
AI responds → Copy to clipboard → Hook detects → Writes event → Extension pairs → Backend
```

## Optional: Install Clipboard Library

For better clipboard monitoring, install:
```bash
cd .hook
npm install clipboardy
```

## Stop the Detector

**Windows (PowerShell):**
```powershell
.\.hook\stop-auto-detector.ps1
```

**Windows (Command Prompt):**
```cmd
.hook\stop-auto-detector.bat
```

**Linux/Mac/Git Bash:**
```bash
bash .hook/stop-auto-detector.sh
```

## View What's Happening

**Check logs:**
```bash
tail -f .hook/auto-detector.log
```

**Check extension output:**
- View → Output → TrackChat

**Check hook status:**
- Command Palette → `TrackChat: Show Hook System Status`

## Troubleshooting

**Hook not detecting:**
- Make sure auto-detector is running: `ps aux | grep cursor-chat-auto-detector`
- Check logs: `tail -f .hook/auto-detector.log`
- Try copying again (hook checks every 2 seconds)

**Events not processing:**
- Check extension is active
- Check `.cursor-hooks/` directory has event files
- Check extension output for errors

**Want fully automatic (no clipboard):**
- Currently requires clipboard copy due to Cursor's webview limitations
- Future: If Cursor exposes chat API, we'll add direct integration

