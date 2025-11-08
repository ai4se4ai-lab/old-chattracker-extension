import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ChatCapture } from './chatCapture';

interface ConversationMessage {
    type: 'user_prompt' | 'assistant_response';
    content: string;
    timestamp: string;
}

interface Conversation {
    id: string;
    timestamp: string;
    messages: ConversationMessage[];
}

export class ConversationViewer {
    public static currentPanel: ConversationViewer | undefined;
    public static readonly viewType = 'trackchatConversations';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _chatCapture: ChatCapture;
    private _disposables: vscode.Disposable[] = [];
    private _conversations: Conversation[] = [];

    public static createOrShow(extensionUri: vscode.Uri, chatCapture: ChatCapture) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (ConversationViewer.currentPanel) {
            ConversationViewer.currentPanel._panel.reveal(column);
            ConversationViewer.currentPanel._update();
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ConversationViewer.viewType,
            'Captured Conversations',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
                retainContextWhenHidden: true
            }
        );

        ConversationViewer.currentPanel = new ConversationViewer(panel, extensionUri, chatCapture);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, chatCapture: ChatCapture) {
        this._disposables = [];
        this._conversations = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._chatCapture = chatCapture;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    this._update();
                    return;
                case 'export':
                    await this._exportConversations(message.format);
                    return;
                case 'search':
                    this._update(message.searchQuery, message.filterType);
                    return;
                case 'loadFromFile':
                    await this._loadFromFile();
                    return;
            }
        }, null, this._disposables);

        // Update content periodically
        const interval = setInterval(() => {
            if (this._panel.visible) {
                this._update();
            }
        }, 3000);
        this._disposables.push(new vscode.Disposable(() => clearInterval(interval)));
    }

    private async _loadFromFile() {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON files': ['json', 'jsonl'],
                'All files': ['*']
            }
        });

        if (!fileUri || fileUri.length === 0) {
            return;
        }

        try {
            const content = fs.readFileSync(fileUri[0].fsPath, 'utf-8');
            const conversations = this._parseConversationsFromFile(content, fileUri[0].fsPath);
            this._conversations = conversations;
            this._update();
            vscode.window.showInformationMessage(`Loaded ${conversations.length} conversation(s) from file`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to load file: ${error.message}`);
        }
    }

    private _parseConversationsFromFile(content: string, filePath: string): Conversation[] {
        const conversations: Conversation[] = [];
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.jsonl') {
            // Parse JSONL format (one JSON object per line)
            const lines = content.split('\n').filter(line => line.trim());
            const conversationMap = new Map<string, ConversationMessage[]>();

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    const convId = data.conversation_id || data.chatId || `chat_${Date.now()}`;
                    
                    if (!conversationMap.has(convId)) {
                        conversationMap.set(convId, []);
                    }

                    const messages = conversationMap.get(convId)!;
                    if (data.userPrompt || data.prompt) {
                        messages.push({
                            type: 'user_prompt',
                            content: data.userPrompt || data.prompt,
                            timestamp: data.timestamp || new Date().toISOString()
                        });
                    }
                    if (data.aiResponse || data.response) {
                        messages.push({
                            type: 'assistant_response',
                            content: data.aiResponse || data.response,
                            timestamp: data.timestamp || new Date().toISOString()
                        });
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }

            // Convert map to conversations array
            conversationMap.forEach((messages, id) => {
                if (messages.length > 0) {
                    conversations.push({
                        id,
                        timestamp: messages[0].timestamp,
                        messages
                    });
                }
            });
        } else {
            // Parse JSON format
            try {
                const data = JSON.parse(content);
                if (Array.isArray(data)) {
                    // Array of conversations
                    conversations.push(...data);
                } else if (data.messages && Array.isArray(data.messages)) {
                    // Single conversation object
                    conversations.push({
                        id: data.chatId || data.id || `chat_${Date.now()}`,
                        timestamp: data.timestamp || new Date().toISOString(),
                        messages: data.messages.map((msg: any) => ({
                            type: msg.type || (msg.prompt ? 'user_prompt' : 'assistant_response'),
                            content: msg.prompt || msg.response || msg.content,
                            timestamp: msg.timestamp || new Date().toISOString()
                        }))
                    });
                }
            } catch (e) {
                vscode.window.showErrorMessage('Failed to parse JSON file');
            }
        }

        return conversations;
    }

    private async _exportConversations(format: string) {
        if (this._conversations.length === 0) {
            vscode.window.showWarningMessage('No conversations to export');
            return;
        }

        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(
                path.join(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir(),
                    `conversations_${Date.now()}.${format === 'jsonl' ? 'jsonl' : format}`
                )
            ),
            filters: {
                'JSON': ['json'],
                'JSONL': ['jsonl'],
                'CSV': ['csv'],
                'Markdown': ['md']
            }
        });

        if (!saveUri) {
            return;
        }

        try {
            let content = '';
            switch (format) {
                case 'json':
                    content = JSON.stringify(this._conversations, null, 2);
                    break;
                case 'jsonl':
                    content = this._exportToJSONL();
                    break;
                case 'csv':
                    content = this._exportToCSV();
                    break;
                case 'markdown':
                    content = this._exportToMarkdown();
                    break;
                default:
                    vscode.window.showErrorMessage(`Unsupported format: ${format}`);
                    return;
            }

            fs.writeFileSync(saveUri.fsPath, content, 'utf-8');
            vscode.window.showInformationMessage(`Exported ${this._conversations.length} conversation(s) to ${path.basename(saveUri.fsPath)}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to export: ${error.message}`);
        }
    }

    private _exportToJSONL(): string {
        const lines: string[] = [];
        for (const conv of this._conversations) {
            for (const msg of conv.messages) {
                lines.push(JSON.stringify({
                    conversation_id: conv.id,
                    timestamp: msg.timestamp,
                    type: msg.type,
                    content: msg.content
                }));
            }
        }
        return lines.join('\n');
    }

    private _exportToCSV(): string {
        const rows = ['Conversation ID,Timestamp,Type,Content'];
        for (const conv of this._conversations) {
            for (const msg of conv.messages) {
                const content = msg.content.replace(/"/g, '""').replace(/\n/g, ' ');
                rows.push(`"${conv.id}","${msg.timestamp}","${msg.type}","${content}"`);
            }
        }
        return rows.join('\n');
    }

    private _exportToMarkdown(): string {
        let md = '# Captured Conversations\n\n';
        for (const conv of this._conversations) {
            md += `## Conversation ${conv.id}\n\n`;
            md += `**Timestamp:** ${new Date(conv.timestamp).toLocaleString()}\n\n`;
            for (const msg of conv.messages) {
                const role = msg.type === 'user_prompt' ? 'User' : 'Assistant';
                md += `### ${role}\n\n`;
                md += `${msg.content}\n\n`;
                md += `*${new Date(msg.timestamp).toLocaleString()}*\n\n`;
                md += '---\n\n';
            }
        }
        return md;
    }

    public dispose(): void {
        ConversationViewer.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(searchQuery?: string, filterType?: string): void {
        // Get conversations from chatCapture - FIXED: use getCapturedChats() instead of getCapturedChatData()
        const capturedChats = this._chatCapture.getCapturedChats();
        
        // Convert to conversation format
        const conversations: Conversation[] = [];
        
        // Convert each captured chat to conversation format
        for (let i = 0; i < capturedChats.length; i++) {
            const chat = capturedChats[i];
            const messages: ConversationMessage[] = [];
            
            // Add user prompt
            if (chat.userPrompt) {
                messages.push({
                    type: 'user_prompt',
                    content: chat.userPrompt,
                    timestamp: chat.timestamp
                });
            }
            
            // Add AI response if available
            if (chat.aiResponse) {
                messages.push({
                    type: 'assistant_response',
                    content: chat.aiResponse,
                    timestamp: chat.timestamp
                });
            }
            
            if (messages.length > 0) {
                conversations.push({
                    id: `chat_${i}_${Date.parse(chat.timestamp)}`,
                    timestamp: chat.timestamp,
                    messages
                });
            }
        }

        // Merge with loaded conversations
        this._conversations = this._mergeConversations(conversations, this._conversations);

        // Apply filters
        let filtered = this._conversations;
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.map(conv => ({
                ...conv,
                messages: conv.messages.filter(msg => msg.content.toLowerCase().includes(query))
            })).filter(conv => conv.messages.length > 0);
        }

        if (filterType && filterType !== 'all') {
            filtered = filtered.map(conv => ({
                ...conv,
                messages: conv.messages.filter(msg => msg.type === filterType)
            })).filter(conv => conv.messages.length > 0);
        }

        this._panel.webview.html = this._getWebviewContent(filtered, searchQuery || '', filterType || 'all');
    }

    private _mergeConversations(newConvs: Conversation[], existing: Conversation[]): Conversation[] {
        const merged = new Map<string, Conversation>();

        // Add existing conversations
        for (const conv of existing) {
            merged.set(conv.id, { ...conv });
        }

        // Add or update with new conversations
        for (const conv of newConvs) {
            if (merged.has(conv.id)) {
                // Merge messages
                const existing = merged.get(conv.id)!;
                const messageMap = new Map<string, ConversationMessage>();

                // Add existing messages
                for (const msg of existing.messages) {
                    messageMap.set(`${msg.timestamp}-${msg.type}`, msg);
                }

                // Add new messages
                for (const msg of conv.messages) {
                    messageMap.set(`${msg.timestamp}-${msg.type}`, msg);
                }

                existing.messages = Array.from(messageMap.values())
                    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            } else {
                merged.set(conv.id, conv);
            }
        }

        return Array.from(merged.values());
    }

    public update(): void {
        this._update();
    }

    private _getWebviewContent(conversations: Conversation[], searchQuery: string, filterType: string): string {
        const conversationsBySession = this._groupByConversation(conversations);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Captured Conversations</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
        }
        .header {
            padding: 16px 20px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .header h1 {
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
        }
        .controls {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            align-items: center;
        }
        .search-box {
            flex: 1;
            min-width: 200px;
            padding: 6px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 13px;
        }
        .search-box:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
        .filter-select {
            padding: 6px 12px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 2px;
            font-size: 13px;
            cursor: pointer;
        }
        .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .button-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .button-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .export-menu {
            position: relative;
            display: inline-block;
        }
        .export-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 4px;
            background-color: var(--vscode-dropdown-background);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 2px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 100;
            min-width: 150px;
        }
        .export-menu:hover .export-dropdown {
            display: block;
        }
        .export-dropdown button {
            display: block;
            width: 100%;
            text-align: left;
            padding: 8px 12px;
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 13px;
        }
        .export-dropdown button:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .content {
            padding: 20px;
            max-width: 1200px;
            margin: 0 auto;
        }
        .stats {
            margin-bottom: 20px;
            padding: 12px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .conversation {
            margin-bottom: 30px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
            background-color: var(--vscode-editor-background);
        }
        .conversation-header {
            padding: 12px 16px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .conversation-id {
            font-weight: 600;
            font-size: 13px;
            color: var(--vscode-textLink-foreground);
        }
        .conversation-timestamp {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .conversation-messages {
            padding: 16px;
        }
        .message {
            margin-bottom: 16px;
            padding: 12px;
            border-radius: 4px;
            border-left: 3px solid;
        }
        .message:last-child {
            margin-bottom: 0;
        }
        .message.user-prompt {
            background-color: var(--vscode-textBlockQuote-background);
            border-left-color: var(--vscode-textLink-foreground);
        }
        .message.assistant-response {
            background-color: var(--vscode-editor-background);
            border-left-color: var(--vscode-textLink-activeForeground);
        }
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .message-type {
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
        }
        .message-type.user-prompt {
            color: var(--vscode-textLink-foreground);
        }
        .message-type.assistant-response {
            color: var(--vscode-textLink-activeForeground);
        }
        .message-timestamp {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
            font-size: 13px;
        }
        .message-content code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 2px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state-icon {
            font-size: 64px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Captured Conversations</h1>
        <div class="controls">
            <input 
                type="text" 
                class="search-box" 
                placeholder="Search conversations..." 
                value="${this._escapeHtml(searchQuery)}"
                oninput="handleSearch()"
            />
            <select class="filter-select" onchange="handleFilter()" value="${filterType}">
                <option value="all" ${filterType === 'all' ? 'selected' : ''}>All Messages</option>
                <option value="user_prompt" ${filterType === 'user_prompt' ? 'selected' : ''}>User Prompts Only</option>
                <option value="assistant_response" ${filterType === 'assistant_response' ? 'selected' : ''}>AI Responses Only</option>
            </select>
            <div class="export-menu">
                <button class="button button-secondary">Export ▼</button>
                <div class="export-dropdown">
                    <button onclick="exportConversations('json')">Export as JSON</button>
                    <button onclick="exportConversations('jsonl')">Export as JSONL</button>
                    <button onclick="exportConversations('csv')">Export as CSV</button>
                    <button onclick="exportConversations('markdown')">Export as Markdown</button>
                </div>
            </div>
            <button class="button button-secondary" onclick="loadFromFile()">Load from File</button>
            <button class="button" onclick="refresh()">Refresh</button>
        </div>
    </div>
    <div class="content">
        ${conversationsBySession.length === 0
            ? this._getEmptyStateHtml()
            : `
            <div class="stats">
                Showing ${conversationsBySession.length} conversation(s) with ${conversationsBySession.reduce((sum, c) => sum + c.messages.length, 0)} total message(s)
            </div>
            ${conversationsBySession.map(conv => this._getConversationHtml(conv)).join('')}
            `}
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let searchTimeout;
        
        function handleSearch() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const query = document.querySelector('.search-box').value;
                const filter = document.querySelector('.filter-select').value;
                vscode.postMessage({ 
                    command: 'search', 
                    searchQuery: query,
                    filterType: filter
                });
            }, 300);
        }
        
        function handleFilter() {
            const query = document.querySelector('.search-box').value;
            const filter = document.querySelector('.filter-select').value;
            vscode.postMessage({ 
                command: 'search', 
                searchQuery: query,
                filterType: filter
            });
        }
        
        function exportConversations(format) {
            vscode.postMessage({ command: 'export', format });
        }
        
        function loadFromFile() {
            vscode.postMessage({ command: 'loadFromFile' });
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
    }

    private _getEmptyStateHtml(): string {
        return `
        <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h2>No Conversations Captured Yet</h2>
            <p>Start capturing conversations to see them here.</p>
            <p style="margin-top: 12px; font-size: 12px;">
                Use the "TrackChat: Capture Chat" command or enable automatic monitoring.
            </p>
        </div>
        `;
    }

    private _groupByConversation(conversations: Conversation[]): Conversation[] {
        // Already grouped, just return as-is
        return conversations;
    }

    private _getConversationHtml(conv: Conversation): string {
        return `
        <div class="conversation">
            <div class="conversation-header">
                <div class="conversation-id">Conversation: ${this._escapeHtml(conv.id)}</div>
                <div class="conversation-timestamp">${new Date(conv.timestamp).toLocaleString()}</div>
            </div>
            <div class="conversation-messages">
                ${conv.messages.map(msg => this._getMessageHtml(msg)).join('')}
            </div>
        </div>
        `;
    }

    private _getMessageHtml(msg: ConversationMessage): string {
        const role = msg.type === 'user_prompt' ? 'User' : 'Assistant';
        return `
        <div class="message ${msg.type}">
            <div class="message-header">
                <span class="message-type ${msg.type}">${role}</span>
                <span class="message-timestamp">${new Date(msg.timestamp).toLocaleString()}</span>
            </div>
            <div class="message-content">${this._escapeHtml(msg.content)}</div>
        </div>
        `;
    }

    private _escapeHtml(text: string): string {
        if (!text || typeof text !== 'string') {
            return '';
        }
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
