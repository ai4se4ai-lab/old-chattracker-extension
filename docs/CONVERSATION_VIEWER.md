# Conversation Viewer Feature

## Overview

The Conversation Viewer is a comprehensive webview panel that displays all captured conversations with advanced filtering, search, and export capabilities.

## Features

### 1. **Conversation Display**
- Groups conversations by session/chat ID
- Shows user prompts and AI responses in a clean, readable format
- Displays timestamps for each message
- Color-coded message types (user prompts vs AI responses)

### 2. **Search Functionality**
- Real-time search across all conversation content
- Searches both user prompts and AI responses
- Debounced input for better performance

### 3. **Filtering**
- Filter by message type:
  - All Messages
  - User Prompts Only
  - AI Responses Only
- Can be combined with search for precise filtering

### 4. **Export Options**
Export conversations in multiple formats:
- **JSON**: Structured JSON format with all conversation data
- **JSONL**: JSON Lines format (one conversation per line)
- **CSV**: Spreadsheet-compatible format
- **Markdown**: Human-readable markdown format

### 5. **File Import**
- Load conversations from JSON or JSONL files
- Automatically parses and displays imported conversations
- Merges with existing conversations

## Usage

### Opening the Viewer

1. **Command Palette**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type: `TrackChat: View Captured Conversations`
3. The viewer panel will open

### Searching Conversations

1. Type your search query in the search box
2. Results update automatically as you type
3. Search works across all message content

### Filtering Messages

1. Use the dropdown to select a filter type
2. Choose from:
   - All Messages
   - User Prompts Only
   - AI Responses Only

### Exporting Conversations

1. Click the "Export" button
2. Select your desired format:
   - JSON
   - JSONL
   - CSV
   - Markdown
3. Choose a save location
4. Conversations will be exported to the selected file

### Loading from File

1. Click "Load from File"
2. Select a JSON or JSONL file
3. Conversations will be loaded and displayed

## Technical Details

### Data Structure

Conversations are stored with the following structure:

```typescript
interface Conversation {
    id: string;
    timestamp: string;
    messages: ConversationMessage[];
}

interface ConversationMessage {
    type: 'user_prompt' | 'assistant_response';
    content: string;
    timestamp: string;
}
```

### Export Formats

#### JSON
```json
[
  {
    "id": "chat_1234567890",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "messages": [
      {
        "type": "user_prompt",
        "content": "User message",
        "timestamp": "2024-01-01T12:00:00.000Z"
      }
    ]
  }
]
```

#### JSONL
```
{"conversation_id":"chat_123","timestamp":"2024-01-01T12:00:00.000Z","type":"user_prompt","content":"User message"}
{"conversation_id":"chat_123","timestamp":"2024-01-01T12:00:01.000Z","type":"assistant_response","content":"AI response"}
```

#### CSV
```csv
Conversation ID,Timestamp,Type,Content
"chat_123","2024-01-01T12:00:00.000Z","user_prompt","User message"
```

#### Markdown
```markdown
# Captured Conversations

## Conversation chat_123

**Timestamp:** 1/1/2024, 12:00:00 PM

### User

User message

*1/1/2024, 12:00:00 PM*

---
```

## Integration

The Conversation Viewer integrates with:
- **ChatCapture**: Automatically displays captured conversations
- **ChatTracker**: Shows real-time conversation updates
- **File System**: Can import/export conversation data

## Auto-Refresh

The viewer automatically refreshes every 3 seconds when visible to show new conversations.


