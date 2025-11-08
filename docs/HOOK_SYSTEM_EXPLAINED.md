# How the Hook System Works with the Extension

This document explains the complete flow of how the hook system captures chat information from Cursor's chat tabs and processes it through the TrackChat extension.

## Overview

The hook system uses a **file-based communication pattern** to bridge between Cursor's chat interface and the TrackChat extension. Since Cursor's chat interface is typically a webview that extensions cannot directly access, the hook system provides an external mechanism to capture and forward chat events.

## Architecture

```
┌─────────────────┐
│  Cursor Chat    │  User types prompt, AI responds
│  Interface      │
└────────┬────────┘
         │
         │ (Hook captures events)
         ▼
┌─────────────────┐
│  Hook Scripts   │  .hook/cursor-chat-hook.js
│  (.hook/)       │  Writes events to .cursor-hooks/
└────────┬────────┘
         │
         │ (Writes JSON files)
         ▼
┌─────────────────┐
│ .cursor-hooks/  │  event_*.json files
│  Directory      │
└────────┬────────┘
         │
         │ (File watcher detects)
         ▼
┌─────────────────┐
│  Extension      │  CursorHookSystem processes events
│  File Watcher   │
└────────┬────────┘
         │
         │ (Normalizes & pairs)
         ▼
┌─────────────────┐
│  Hook System    │  Pairs prompts with responses
│  (Extension)    │
└────────┬────────┘
         │
         │ (Sends to API)
         ▼
┌─────────────────┐
│  Backend API    │  Stores chat sessions
└─────────────────┘
```

## Step-by-Step Flow

### Step 1: Hook Installation

**Command:** `TrackChat: Install Hook Files to Project`

1. User runs the install command from Command Palette
2. Extension copies all hook files from extension's `.hook/` directory to project's `.hook/` directory
3. Files installed include:
   - `cursor-chat-hook.js` - Main hook script
   - `cursor-chat-hook-advanced.js` - Advanced monitoring
   - `setup-hook.sh` - Setup script
   - Documentation files

**Code Location:** `src/hookInstaller.ts`

### Step 2: Hook Captures Chat Events

The hook script (`.hook/cursor-chat-hook.js`) can capture events in multiple ways:

#### Method A: Direct Execution (Manual/Programmatic)
```bash
node .hook/cursor-chat-hook.js \
  --event-type beforeSubmitPrompt \
  --prompt "Create a login form" \
  --chatTitle "Authentication Feature"
```

#### Method B: File Monitoring
The hook monitors files that Cursor might write chat data to:
```javascript
// Monitors .cursor/chat/ or .vscode/chat/ directories
fs.watch(chatDirectory, (eventType, filename) => {
    // Process chat files and create events
});
```

#### Method C: Clipboard Monitoring
Monitors clipboard for chat content:
```javascript
// Checks clipboard every 2 seconds
setInterval(() => {
    const clipboard = clipboardy.readSync();
    if (isChatContent(clipboard)) {
        // Parse and create event
    }
}, 2000);
```

#### Method D: HTTP Endpoint
Receives events via HTTP POST:
```bash
curl -X POST http://localhost:8765/hook \
  -d '{"eventType": "beforeSubmitPrompt", "prompt": "..."}'
```

**Code Location:** `.hook/cursor-chat-hook.js`, `.hook/cursor-chat-hook-advanced.js`

### Step 3: Hook Writes Event Files

When a chat event is captured, the hook writes it to `.cursor-hooks/` directory:

```javascript
// .hook/cursor-chat-hook.js
function writeEvent(workspaceRoot, event) {
    const outputDir = path.join(workspaceRoot, '.cursor-hooks');
    const filename = `event_${Date.now()}_${randomId}.json`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
}
```

**Event File Format:**
```json
{
  "eventType": "beforeSubmitPrompt",
  "chatTitle": "Authentication Feature",
  "userPrompt": "Create a login form",
  "affectedFiles": [],
  "status": "in-progress",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "metadata": { /* original event data */ }
}
```

**Code Location:** `.hook/cursor-chat-hook.js` (lines 66-95)

### Step 4: Extension File Watcher Detects Events

The extension sets up a file system watcher when it activates:

```typescript
// src/extension.ts
const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, '.cursor-hooks/**/*.json')
);

watcher.onDidCreate(async (uri) => {
    const content = fs.readFileSync(uri.fsPath, 'utf8');
    const event: CursorRawEvent = JSON.parse(content);
    await hookSystem.processEvent(event);
});
```

**What happens:**
1. Extension watches `.cursor-hooks/` directory for new `.json` files
2. When a new file is created, it immediately reads and parses it
3. Passes the raw event to `CursorHookSystem.processEvent()`

**Code Location:** `src/extension.ts` (lines 738-771)

### Step 5: Event Normalization (Field Mapping)

The hook system normalizes events by mapping various field name variations:

```typescript
// src/cursorHookSystem.ts
private mapFields(rawEvent: CursorRawEvent): HookEventData {
    // Maps: user_input, userPrompt, prompt → userPrompt
    const userPrompt = rawEvent.user_input || 
                      rawEvent.userPrompt || 
                      rawEvent.prompt || '';
    
    // Maps: aiResponse, response, agentResponse → aiResponse
    const aiResponse = rawEvent.aiResponse || 
                     rawEvent.response || 
                     rawEvent.agentResponse;
    
    // Maps: chatTitle, title, chat_title → chatTitle
    const chatTitle = rawEvent.chatTitle || 
                     rawEvent.title || 
                     `Chat ${new Date().toISOString()}`;
    
    // ... more mappings
}
```

**Why this is important:**
- Cursor may use different field names in different contexts
- External hooks may use different naming conventions
- Ensures consistent data structure regardless of source

**Code Location:** `src/cursorHookSystem.ts` (lines 76-140)

### Step 6: Event Pairing

The system pairs `beforeSubmitPrompt` and `afterAgentResponse` events:

#### When a Prompt is Received:
```typescript
// src/cursorHookSystem.ts
private async handleBeforeSubmitPrompt(event: HookEventData) {
    // Store as pending prompt
    const pairKey = `${event.chatTitle}_${event.timestamp}`;
    this.pendingPrompts.set(pairKey, event);
    
    // If auto-send enabled, send immediately with status 'in-progress'
    if (config.autoSend) {
        await this.sendPairedEvent(pairedEvent);
    }
}
```

#### When a Response is Received:
```typescript
// src/cursorHookSystem.ts
private async handleAfterAgentResponse(event: HookEventData) {
    // Try to find matching prompt by chatTitle
    let matchedPrompt = null;
    for (const [key, prompt] of this.pendingPrompts.entries()) {
        if (prompt.chatTitle === event.chatTitle) {
            matchedPrompt = prompt;
            break;
        }
    }
    
    // If no match, use most recent prompt (temporal proximity)
    if (!matchedPrompt && this.pendingPrompts.size > 0) {
        // Sort by timestamp, get most recent
        matchedPrompt = /* most recent prompt */;
    }
    
    // Create paired event
    const pairedEvent: PairedChatEvent = {
        chatTitle: matchedPrompt.chatTitle,
        userPrompt: matchedPrompt.userPrompt,
        aiResponse: event.aiResponse,
        affectedFiles: [...matchedPrompt.affectedFiles, ...event.affectedFiles],
        status: event.status,
        promptTimestamp: matchedPrompt.timestamp,
        responseTimestamp: event.timestamp,
        // ...
    };
    
    // Remove from pending and send
    this.pendingPrompts.delete(key);
    await this.sendPairedEvent(pairedEvent);
}
```

**Pairing Strategy:**
1. **Primary:** Match by `chatTitle` (most reliable)
2. **Fallback:** Match by temporal proximity (most recent prompt)
3. **Edge case:** If no match, create standalone event

**Code Location:** `src/cursorHookSystem.ts` (lines 224-339)

### Step 7: API Submission

Paired events are sent to the backend API:

```typescript
// src/cursorHookSystem.ts
private async sendPairedEvent(pairedEvent: PairedChatEvent) {
    const apiRequest = {
        connectionCode: config.CURSOR_CONNECTION_CODE,
        eventType: 'cursor-chat-event',
        itineraryId: pairedEvent.itineraryId,
        chatTitle: pairedEvent.chatTitle,
        userPrompt: pairedEvent.userPrompt,
        aiResponse: pairedEvent.aiResponse,
        affectedFiles: pairedEvent.affectedFiles,
        status: pairedEvent.status,
        promptTimestamp: pairedEvent.promptTimestamp,
        responseTimestamp: pairedEvent.responseTimestamp,
        metadata: pairedEvent.metadata
    };
    
    await this.apiClient.sendHookEvent(apiRequest);
}
```

**API Endpoint:** `POST /api/cursor-events`

**Code Location:** `src/cursorHookSystem.ts` (lines 370-406), `src/apiClient.ts` (lines 198-236)

## Complete Example Flow

Let's trace a complete chat interaction:

### 1. User Types Prompt in Cursor Chat

```
User: "Create a login form with email and password fields"
```

### 2. Hook Captures Event

Hook script (via file monitoring, clipboard, or direct call) creates:
```json
{
  "eventType": "beforeSubmitPrompt",
  "userPrompt": "Create a login form with email and password fields",
  "chatTitle": "Authentication Feature",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 3. Hook Writes to File

File created: `.cursor-hooks/event_1705315800000_abc123.json`

### 4. Extension Detects File

File watcher triggers → reads file → parses JSON

### 5. Extension Normalizes Event

```typescript
HookEventData {
    eventType: 'beforeSubmitPrompt',
    chatTitle: 'Authentication Feature',
    userPrompt: 'Create a login form with email and password fields',
    aiResponse: undefined,
    affectedFiles: [],
    status: 'in-progress',
    timestamp: '2024-01-15T10:30:00.000Z'
}
```

### 6. Extension Stores as Pending

```typescript
pendingPrompts.set('Authentication Feature_1705315800000', event);
```

### 7. AI Responds

```
AI: "I'll create a login form component with email and password fields..."
```

### 8. Hook Captures Response

```json
{
  "eventType": "afterAgentResponse",
  "aiResponse": "I'll create a login form component...",
  "chatTitle": "Authentication Feature",
  "affectedFiles": ["src/components/Login.tsx"],
  "status": "completed",
  "timestamp": "2024-01-15T10:30:15.000Z"
}
```

### 9. Extension Pairs Events

Matches by `chatTitle: "Authentication Feature"` → Creates paired event:

```typescript
PairedChatEvent {
    chatTitle: 'Authentication Feature',
    userPrompt: 'Create a login form with email and password fields',
    aiResponse: "I'll create a login form component...",
    affectedFiles: ['src/components/Login.tsx'],
    status: 'completed',
    promptTimestamp: '2024-01-15T10:30:00.000Z',
    responseTimestamp: '2024-01-15T10:30:15.000Z'
}
```

### 10. Extension Sends to API

```http
POST /api/cursor-events
{
  "connectionCode": "user-connection-code",
  "eventType": "cursor-chat-event",
  "chatTitle": "Authentication Feature",
  "userPrompt": "Create a login form...",
  "aiResponse": "I'll create a login form component...",
  "affectedFiles": ["src/components/Login.tsx"],
  "status": "completed",
  ...
}
```

## Key Components

### 1. Hook Scripts (`.hook/` directory)
- **Purpose:** Capture chat events from Cursor
- **Output:** JSON files in `.cursor-hooks/`
- **Location:** Project root `.hook/` directory

### 2. Event Storage (`.cursor-hooks/` directory)
- **Purpose:** Bridge between hooks and extension
- **Format:** JSON files with event data
- **Location:** Project root `.cursor-hooks/` directory

### 3. File Watcher (Extension)
- **Purpose:** Detect new event files
- **Mechanism:** VS Code file system watcher
- **Location:** `src/extension.ts`

### 4. Hook System (Extension)
- **Purpose:** Process, normalize, and pair events
- **Components:**
  - Field mapping
  - Event pairing
  - API submission
- **Location:** `src/cursorHookSystem.ts`

### 5. API Client (Extension)
- **Purpose:** Send events to backend
- **Endpoints:**
  - `POST /api/cursor-events` - Send hook events
  - `GET /api/cursor-chats/[itineraryId]` - Retrieve sessions
- **Location:** `src/apiClient.ts`

## Data Flow Summary

```
Chat Tab → Hook Script → JSON File → File Watcher → Hook System → API
   ↓           ↓            ↓            ↓              ↓          ↓
User/AI    Captures    .cursor-hooks/  Detects    Normalizes  Backend
Interaction  Event      event_*.json    New File   & Pairs     Storage
```

## Benefits of This Architecture

1. **Decoupled:** Hooks can work independently of extension
2. **Flexible:** Multiple capture methods (file, clipboard, HTTP, etc.)
3. **Reliable:** File-based communication is robust
4. **Debuggable:** Event files can be inspected manually
5. **Extensible:** Easy to add new capture methods

## Debugging

Enable debug mode to see the complete flow:

```bash
# In hook script
DEBUG=1 node .hook/cursor-chat-hook.js ...

# In extension
TrackChat: Toggle Hook Debug Mode
```

Debug output shows:
- Raw events received
- Normalized events
- Pairing logic
- API requests/responses
- Error details

## Troubleshooting

**Events not being captured:**
- Check hook script is running
- Verify `.cursor-hooks/` directory exists
- Check file permissions

**Events not being processed:**
- Check extension is active
- Verify file watcher is initialized (check logs)
- Ensure JSON files are valid

**Events not pairing:**
- Check `chatTitle` matches between prompt and response
- Verify timestamps are valid
- Enable debug mode to see pairing logic

## Conclusion

The hook system provides a robust, file-based mechanism to capture chat events from Cursor's interface and process them through the TrackChat extension. The architecture is designed to be flexible, reliable, and easy to debug, making it suitable for capturing all chat interactions across multiple chat tabs.

