# MCP (Model Context Protocol) Integration

## Overview

The TrackChat extension includes optional support for MCP (Model Context Protocol) server integration. This allows for advanced conversation capture and integration with external MCP servers.

## What is MCP?

MCP (Model Context Protocol) is a protocol for connecting AI assistants with external data sources and tools. In the context of Cursor, MCP servers can provide additional context and capabilities.

## Features

### 1. **MCP Server Registration**
- Register custom MCP servers for conversation capture
- Support for HTTP-based MCP servers
- Configurable authentication headers

### 2. **Automatic Server Detection**
- Checks if MCP Extension API is available
- Gracefully handles when API is not available (e.g., in standard VS Code)
- Logs availability status

### 3. **Configuration-Based Setup**
- Configure MCP servers via `config.json`
- Optional server URL and authentication token

## Configuration

Add MCP server configuration to your `config.json`:

```json
{
  "CURSOR_CONNECTION_CODE": "your-connection-code",
  "EASYITI_API_URL": "https://your-api-endpoint.com/api/chat-summary",
  "autoSend": false,
  "autoTrack": true,
  "mcpServerUrl": "http://localhost:3000/mcp",
  "mcpServerToken": "your-mcp-server-token"
}
```

### Configuration Options

- **mcpServerUrl** (optional): URL of your MCP server endpoint
- **mcpServerToken** (optional): Bearer token for MCP server authentication

## Usage

### Automatic Registration

If `mcpServerUrl` is configured in `config.json`, the extension will automatically attempt to register the MCP server on activation.

### Manual Registration (Programmatic)

You can also register MCP servers programmatically:

```typescript
import { MCPIntegration } from './mcpIntegration';

// Register a server
await MCPIntegration.registerServer('my-server', {
    url: 'http://localhost:3000/mcp',
    headers: {
        Authorization: 'Bearer your-token'
    }
});

// Or use command-based server
await MCPIntegration.registerServer('my-server', {
    command: 'node',
    args: ['path/to/mcp-server.js']
});
```

### Checking Availability

```typescript
const isAvailable = await MCPIntegration.checkAvailability();
if (isAvailable) {
    // MCP API is available
}
```

### Unregistering Servers

```typescript
await MCPIntegration.unregisterServer('my-server');
```

## API Reference

### `MCPIntegration.checkAvailability()`

Checks if the MCP Extension API is available in the current environment.

**Returns**: `Promise<boolean>`

### `MCPIntegration.registerServer(name, config)`

Registers an MCP server.

**Parameters**:
- `name` (string): Unique name for the server
- `config` (object): Server configuration
  - `url?` (string): HTTP URL for the server
  - `headers?` (object): HTTP headers (e.g., Authorization)
  - `command?` (string): Command to run the server
  - `args?` (string[]): Command arguments

**Returns**: `Promise<boolean>`

### `MCPIntegration.unregisterServer(name)`

Unregisters an MCP server.

**Parameters**:
- `name` (string): Name of the server to unregister

**Returns**: `Promise<boolean>`

### `MCPIntegration.getRegisteredServers()`

Gets a list of all registered server names.

**Returns**: `string[]`

### `MCPIntegration.registerDefaultServer(config)`

Registers the default conversation capture server from configuration.

**Parameters**:
- `config` (object): Configuration object
  - `mcpServerUrl?` (string): Server URL
  - `mcpServerToken?` (string): Authentication token

**Returns**: `Promise<boolean>`

## Limitations

1. **VS Code Compatibility**: MCP Extension API is primarily available in Cursor. Standard VS Code may not have this API.

2. **Optional Feature**: MCP integration is completely optional. The extension works fine without it.

3. **Error Handling**: The extension gracefully handles cases where MCP API is not available.

## Troubleshooting

### MCP API Not Available

If you see a message that MCP Extension API is not available:
- This is normal in standard VS Code
- MCP integration is primarily for Cursor
- The extension will continue to work without MCP

### Server Registration Fails

1. Check that `mcpServerUrl` is correctly configured
2. Verify the server is accessible
3. Check authentication token if required
4. Review extension logs for detailed error messages

### Server Not Responding

1. Verify the MCP server is running
2. Check network connectivity
3. Verify URL and authentication credentials
4. Check server logs for errors

## Example MCP Server

Here's a simple example of an MCP server that could be used with this extension:

```javascript
// mcp-server.js
const express = require('express');
const app = express();

app.use(express.json());

app.post('/mcp', (req, res) => {
    const { conversation_id, user_prompt, ai_response, timestamp } = req.body;
    
    // Process conversation data
    console.log('Received conversation:', {
        conversation_id,
        user_prompt,
        ai_response,
        timestamp
    });
    
    res.json({ success: true });
});

app.listen(3000, () => {
    console.log('MCP server running on port 3000');
});
```

## Best Practices

1. **Use HTTPS**: For production, use HTTPS for MCP server URLs
2. **Secure Tokens**: Store MCP server tokens securely
3. **Error Handling**: Implement proper error handling in your MCP server
4. **Logging**: Log MCP server interactions for debugging
5. **Testing**: Test MCP integration in development before production use


