# Cursor Hook System

The Cursor Hook System captures Cursor chat events and pairs them together for tracking and analysis.

## Quick Start

### Method 1: Automatic Installation (Recommended)

1. **Open Command Palette** (Ctrl+Shift+P / Cmd+Shift+P)
2. **Run:** `TrackChat: Install Hook Files to Project`
3. **Follow the prompts** - the extension will copy all hook files to your project

### Method 2: Manual Installation

1. **Set up the hook in your project:**
   ```bash
   cd your-project
   mkdir -p .hook
   # Copy hook files to .hook/ directory
   chmod +x .hook/*.js
   ```

2. **Run the setup script:**
   ```bash
   bash .hook/setup-hook.sh
   ```

3. **Test the hook:**
   ```bash
   node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Test prompt"
   ```

4. **Verify events are processed:**
   - Check `.cursor-hooks/` directory for event files
   - Check TrackChat extension logs for processing messages

For detailed setup instructions, see [.hook/SETUP.md](../.hook/SETUP.md)

## Features

### 1. Field Mapping
Maps various Cursor field names to a consistent format:

**User Prompt Fields:**
- `user_input`, `userPrompt`, `prompt`, `message`, `text`

**AI Response Fields:**
- `aiResponse`, `response`, `agentResponse`, `agent_response`, `assistantResponse`, `assistant_response`

**Chat Title Fields:**
- `chatTitle`, `title`, `chat_title`, `conversationTitle`

**Affected Files Fields:**
- `affectedFiles`, `files`, `modifiedFiles`, `modified_files`, `changedFiles`, `changed_files`

**Status Fields:**
- `status`, `taskStatus` → Normalized to: `completed`, `in-progress`, `failed`

### 2. Event Pairing
Handles two main event types:
- **beforeSubmitPrompt**: User submits a prompt
- **afterAgentResponse**: AI responds to the prompt

The system automatically pairs these events by matching:
- Chat title (primary method)
- Temporal proximity (fallback)

### 3. Debug Mode
Enable debug mode by setting environment variable:
```bash
DEBUG=1
```

Or use the command: `TrackChat: Toggle Hook Debug Mode`

Debug mode provides:
- Verbose logging of all events
- Raw event data logging
- Normalized event data logging
- Error stack traces

## Event Fields Stored

Each event stores:

```typescript
{
    eventType: 'beforeSubmitPrompt' | 'afterAgentResponse' | 'chat-summary',
    chatTitle: string,
    userPrompt: string,
    aiResponse?: string,
    affectedFiles: string[],
    status: 'in-progress' | 'completed' | 'failed',
    timestamp: string,
    metadata: any,  // Original event data for debugging
    itineraryId?: string
}
```

## Usage

### Method 1: File Watcher (Automatic)
The system watches for JSON files in `.cursor-hooks/` directory:

1. Create `.cursor-hooks/` directory in your workspace root
2. Write event JSON files to this directory
3. The system automatically processes them

Example event file:
```json
{
    "eventType": "beforeSubmitPrompt",
    "userPrompt": "Create a login form",
    "chatTitle": "Authentication Feature",
    "affectedFiles": [],
    "status": "in-progress",
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### Method 2: Command Palette
Use `TrackChat: Process Hook Event` command:
1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Select "TrackChat: Process Hook Event"
3. Paste event JSON

### Method 3: Programmatic API
```typescript
import { CursorHookSystem } from './cursorHookSystem';

const event = {
    eventType: 'beforeSubmitPrompt',
    userPrompt: 'Create a login form',
    chatTitle: 'Authentication Feature',
    // ... other fields
};

await hookSystem.processEvent(event);
```

## API Endpoints

### POST /api/cursor-events
Sends a paired chat event to the backend.

**Request Body:**
```json
{
    "connectionCode": "your-connection-code",
    "eventType": "cursor-chat-event",
    "itineraryId": "optional-itinerary-id",
    "chatTitle": "Chat Title",
    "userPrompt": "User's prompt",
    "aiResponse": "AI's response",
    "affectedFiles": ["file1.ts", "file2.ts"],
    "status": "completed",
    "promptTimestamp": "2024-01-15T10:30:00Z",
    "responseTimestamp": "2024-01-15T10:31:00Z",
    "metadata": {
        "promptEvent": {...},
        "responseEvent": {...}
    }
}
```

### GET /api/cursor-chats/[itineraryId]
Retrieves and formats chat sessions for display.

**Query Parameters:**
- `connectionCode`: Your connection code

**Response:**
Array of chat sessions, each containing:
- `chatTitle`: Title of the chat
- `userPrompt`: User's prompt
- `aiResponse`: AI's response (if available)
- `affectedFiles`: Array of modified files
- `status`: Current status
- `promptTimestamp`: When prompt was submitted
- `responseTimestamp`: When response was received
- `latestTimestamp`: Most recent timestamp
- `itineraryId`: Associated itinerary ID

## Commands

### TrackChat: Process Hook Event
Manually process a hook event by entering JSON.

### TrackChat: Get Chat Sessions
Retrieve chat sessions for a specific itinerary ID.

### TrackChat: Show Hook System Status
Display current hook system status:
- Number of paired events
- Number of pending prompts
- Recent events

### TrackChat: Toggle Hook Debug Mode
Enable/disable verbose debug logging.

## Event Processing Flow

1. **Event Received** → Raw event data
2. **Field Mapping** → Normalize field names
3. **Event Type Detection** → Determine event type
4. **Pairing Logic**:
   - `beforeSubmitPrompt` → Store as pending
   - `afterAgentResponse` → Match with pending prompt
   - `chat-summary` → Process directly
5. **API Submission** → Send paired event to backend
6. **Local Storage** → Store for debugging

## Example Event Pairing

**Event 1 (beforeSubmitPrompt):**
```json
{
    "eventType": "beforeSubmitPrompt",
    "userPrompt": "Add user authentication",
    "chatTitle": "Auth Feature",
    "timestamp": "2024-01-15T10:30:00Z"
}
```

**Event 2 (afterAgentResponse):**
```json
{
    "eventType": "afterAgentResponse",
    "aiResponse": "I'll create a login form...",
    "chatTitle": "Auth Feature",
    "affectedFiles": ["auth.ts", "login.tsx"],
    "status": "completed",
    "timestamp": "2024-01-15T10:31:00Z"
}
```

**Result (Paired Event):**
```json
{
    "chatTitle": "Auth Feature",
    "userPrompt": "Add user authentication",
    "aiResponse": "I'll create a login form...",
    "affectedFiles": ["auth.ts", "login.tsx"],
    "status": "completed",
    "promptTimestamp": "2024-01-15T10:30:00Z",
    "responseTimestamp": "2024-01-15T10:31:00Z"
}
```

## Configuration

The hook system uses the same configuration as the main extension:
- `CURSOR_CONNECTION_CODE`: Your connection code
- `EASYITI_API_URL`: Base API URL
- `autoSend`: Automatically send events when received

## Debugging

1. Enable debug mode: `DEBUG=1` or use toggle command
2. Check output channel: View → Output → TrackChat
3. Review stored events: Check `.cursor-hooks/` directory
4. Use "Show Hook System Status" command

## Integration with Cursor

To integrate with Cursor's event system, you can:

1. **Use Cursor's Extension API** (if available)
2. **File-based Integration**: Write events to `.cursor-hooks/` directory
3. **HTTP Endpoint**: Send events to a local endpoint that forwards to the hook system
4. **Custom Extension**: Create a Cursor extension that emits events

## Troubleshooting

**Events not pairing:**
- Check that `chatTitle` matches between events
- Verify timestamps are valid ISO strings
- Enable debug mode to see pairing logic

**Events not sending:**
- Verify API configuration (connection code and URL)
- Check network connectivity
- Review error logs in output channel

**File watcher not working:**
- Ensure `.cursor-hooks/` directory exists in workspace root
- Check file permissions
- Verify JSON files are valid

