import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ChatTracker } from './chatTracker';
import { ApiClient } from './apiClient';
import { ChatCapture } from './chatCapture';
import { Logger } from './logger';

/**
 * ChatMonitor automatically captures chat content from Cursor
 * by monitoring various sources and detecting chat interactions
 */
export class ChatMonitor {
    private chatTracker: ChatTracker;
    private apiClient: ApiClient;
    private chatCapture: ChatCapture | null = null;
    private disposables: vscode.Disposable[] = [];
    private isMonitoring: boolean = false;
    private lastClipboardContent: string = '';
    private clipboardCheckInterval: NodeJS.Timeout | null = null;
    private activeChatDocument: vscode.TextDocument | null = null;
    private documentChangeListener: vscode.Disposable | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastSentTime: number = 0;
    private autoSendEnabled: boolean = false;
    private readonly DEBOUNCE_MS = 2000; // Send updates every 2 seconds max
    private readonly MIN_SEND_INTERVAL = 3000; // Minimum 3 seconds between sends (reduced for real-time)

    constructor(chatTracker: ChatTracker, apiClient: ApiClient, autoSend: boolean = false, chatCapture?: ChatCapture) {
        this.chatTracker = chatTracker;
        this.apiClient = apiClient;
        this.autoSendEnabled = autoSend;
        this.chatCapture = chatCapture || null;
    }

    /**
     * Enable or disable auto-send
     */
    public setAutoSend(enabled: boolean): void {
        this.autoSendEnabled = enabled;
    }

    /**
     * Start monitoring for chat content automatically
     */
    public startMonitoring(): void {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        Logger.log('\n🚀 ChatMonitor: Starting automatic chat monitoring...');
        Logger.log(`   Auto-send enabled: ${this.autoSendEnabled}`);
        Logger.log('   Monitoring methods: Document changes, Clipboard, Editor changes\n');

        // Method 1: Monitor active editor changes (for chat panels)
        const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                this.checkIfChatDocument(editor.document);
            }
        });

        // Method 2: Monitor all document changes
        const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
            if (this.isChatDocument(e.document)) {
                this.handleChatDocumentChange(e.document);
            }
        });

        // Method 3: Monitor clipboard for chat content (fallback)
        this.startClipboardMonitoring();

        // Method 4: Monitor for new documents that might be chat
        const documentOpenDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
            this.checkIfChatDocument(doc);
        });

        // Method 5: Try to access VS Code chat API if available
        this.tryAccessChatAPI();

        this.disposables.push(
            editorChangeDisposable,
            documentChangeDisposable,
            documentOpenDisposable
        );

        vscode.window.showInformationMessage('TrackChat: Automatic monitoring started!');
    }

    /**
     * Stop monitoring
     */
    public stopMonitoring(): void {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        console.log('ChatMonitor: Stopping automatic chat monitoring...');

        if (this.clipboardCheckInterval) {
            clearInterval(this.clipboardCheckInterval);
            this.clipboardCheckInterval = null;
        }

        if (this.documentChangeListener) {
            this.documentChangeListener.dispose();
            this.documentChangeListener = null;
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        vscode.window.showInformationMessage('TrackChat: Monitoring stopped.');
    }

    /**
     * Check if a document is a chat document
     */
    private isChatDocument(document: vscode.TextDocument): boolean {
        const uri = document.uri.toString();
        const scheme = document.uri.scheme;
        const fileName = path.basename(uri.toLowerCase());

        // Exclude output channels, untitled files, and other non-file schemes
        if (scheme === 'output' || 
            scheme === 'vscode' || 
            scheme === 'extension-output' ||
            uri.includes('extension-output') ||
            uri.includes('output:') ||
            scheme === 'git' ||
            scheme === 'vscode-remote') {
            return false;
        }

        // Only check file:// scheme documents
        if (scheme !== 'file' && scheme !== 'untitled') {
            return false;
        }

        // Check for common chat indicators in file paths
        const hasChatIndicator = (
            uri.includes('/chat/') ||
            uri.includes('/conversation/') ||
            uri.includes('/cursor-chat/') ||
            fileName.includes('chat') ||
            fileName.includes('conversation')
        );

        // Get document content for content-based detection
        const content = document.getText();
        
        // If path has chat indicators, verify with content check
        if (hasChatIndicator) {
            // For markdown files, always check content
            if (document.languageId === 'markdown') {
                return this.looksLikeChat(content);
            }
            // For other files with chat indicators, check content if available
            if (content.length > 50) {
                return this.looksLikeChat(content);
            }
            // If content is too short but path matches, assume it's a chat document
            return true;
        }

        // If no path indicators, check content for chat-like patterns
        // This helps catch chat documents that don't follow naming conventions
        // Only do this for text-based files with substantial content
        if (content.length > 100) {
            // Check if it looks like chat content regardless of file type
            if (this.looksLikeChat(content)) {
                return true;
            }
        }

        // Default: require path indicators
        return false;
    }

    /**
     * Check if text content looks like a chat conversation
     */
    private looksLikeChat(text: string): boolean {
        const lines = text.split('\n').slice(0, 20); // Check first 20 lines
        let hasUserPrompt = false;
        let hasAIResponse = false;

        for (const line of lines) {
            const lower = line.toLowerCase().trim();
            if (/^(you|user|prompt|question|i want|i need|create|build|implement):/i.test(lower) ||
                /^> /.test(lower)) {
                hasUserPrompt = true;
            }
            if (/^(ai|assistant|cursor|bot|response):/i.test(lower) ||
                /^```/.test(lower) ||
                (lower.includes('i\'ll') || lower.includes('i will'))) {
                hasAIResponse = true;
            }
        }

        return hasUserPrompt || hasAIResponse;
    }

    /**
     * Check if a document is a chat and start monitoring it
     */
    private checkIfChatDocument(document: vscode.TextDocument): void {
        // Skip output channels and other non-file documents
        if (document.uri.scheme === 'output' || 
            document.uri.scheme === 'extension-output' ||
            document.uri.toString().includes('extension-output')) {
            return;
        }

        if (this.isChatDocument(document)) {
            this.activeChatDocument = document;
            this.handleChatDocumentChange(document);
            Logger.log('📄 ChatMonitor: Detected chat document');
            Logger.log(`   URI: ${document.uri.toString()}`);
            Logger.log(`   Language: ${document.languageId}`);
            Logger.log(`   Scheme: ${document.uri.scheme}`);
        }
    }

    /**
     * Handle changes in a chat document
     */
    private handleChatDocumentChange(document: vscode.TextDocument): void {
        if (!this.isMonitoring) {
            return;
        }

        // Double-check it's actually a chat document
        if (!this.isChatDocument(document)) {
            return;
        }

        const content = document.getText();
        if (content && content.length > 20) { // Only process if there's meaningful content
            this.parseAndCaptureChat(content);
        }
    }

    /**
     * Parse chat content and capture it
     */
    private async parseAndCaptureChat(content: string): Promise<void> {
        const lines = content.split('\n');
        let userPrompt = '';
        let aiResponse = '';
        let currentSection: 'user' | 'ai' | null = null;

        // If content looks like a summary panel dump, try to extract the actual user prompt
        // Look for patterns like "User Prompt\n<actual prompt>" or "User Objectives\n<objectives>"
        if (content.toLowerCase().includes('user prompt') || content.toLowerCase().includes('user objectives')) {
            // Try to extract user prompt from summary panel format
            const userPromptMatch = content.match(/user prompt\s*\n\s*(.+?)(?:\n\s*(?:user objectives|ai response|main actions|modified files|chat summary|status|task status)|$)/is);
            if (userPromptMatch && userPromptMatch[1]) {
                const extractedPrompt = userPromptMatch[1].trim();
                // Only use if it's not a command name or UI text
                if (extractedPrompt.length > 10 && 
                    !extractedPrompt.toLowerCase().startsWith('trackchat:') &&
                    !extractedPrompt.toLowerCase().startsWith('chat summary') &&
                    extractedPrompt.length < 500) {
                    userPrompt = extractedPrompt;
                    currentSection = 'user';
                    Logger.log('📋 ChatMonitor: Extracted user prompt from summary panel format');
                }
            }
            
            // Try to extract AI response from summary panel format
            const aiResponseMatch = content.match(/ai response summary\s*\n\s*(.+?)(?:\n\s*(?:main actions|modified files|chat summary|status|task status)|$)/is);
            if (aiResponseMatch && aiResponseMatch[1]) {
                const extractedResponse = aiResponseMatch[1].trim();
                if (extractedResponse.length > 10 && 
                    !extractedResponse.toLowerCase().includes('not yet captured') &&
                    !extractedResponse.toLowerCase().includes('waiting for response')) {
                    aiResponse = extractedResponse;
                    if (!currentSection) currentSection = 'ai';
                    Logger.log('📋 ChatMonitor: Extracted AI response from summary panel format');
                }
            }
        }

        // If we already extracted from summary panel, skip line-by-line parsing
        if (userPrompt && currentSection === 'user') {
            // Continue to look for AI response if not already found
            if (!aiResponse) {
                // Try to detect if content starts with user or AI
                // Common patterns: User prompts often start with questions, imperatives, or requests
                // AI responses often start with "I'll", "I've", "Here's", "To", etc.
                const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
                if (firstNonEmptyLine) {
                    const trimmed = firstNonEmptyLine.trim();
                    // If first line looks like AI response, assume we're in AI section
                    if (/^(i'll|i will|i've|i have|here's|here is|to |the |this |that )/i.test(trimmed) ||
                        /^```/.test(trimmed)) {
                        currentSection = 'ai';
                    }
                }
            }
        } else {
            // Try to detect if content starts with user or AI
            // Common patterns: User prompts often start with questions, imperatives, or requests
            // AI responses often start with "I'll", "I've", "Here's", "To", etc.
            const firstNonEmptyLine = lines.find(line => line.trim().length > 0);
            if (firstNonEmptyLine) {
                const trimmed = firstNonEmptyLine.trim();
                // If first line looks like AI response, assume we're in AI section
                if (/^(i'll|i will|i've|i have|here's|here is|to |the |this |that )/i.test(trimmed) ||
                    /^```/.test(trimmed)) {
                    currentSection = 'ai';
                } else if (!/^(ai|assistant|response|cursor|bot):/i.test(trimmed)) {
                    // If not explicitly marked as AI, assume it's user prompt
                    currentSection = 'user';
                }
            }
        }

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                // Empty lines can separate sections, but continue current section
                continue;
            }

            // Detect explicit user prompts
            if (/^(you|user|prompt|question|request|i want|i need|create|build|implement|add|fix|update|how|what|why|when|where|can you|could you|please):/i.test(trimmed) ||
                /^> /.test(trimmed) ||
                /^\?/.test(trimmed)) {
                currentSection = 'user';
                const cleanLine = trimmed.replace(/^(you|user|prompt|question|request|i want|i need|create|build|implement|add|fix|update|how|what|why|when|where|can you|could you|please):\s*/i, '').replace(/^> /, '').replace(/^\?/, '');
                if (cleanLine.length > 0) {
                    userPrompt = userPrompt ? `${userPrompt}\n${cleanLine}` : cleanLine;
                }
            }
            // Detect AI responses
            else if (/^(ai|assistant|response|cursor|bot):/i.test(trimmed) ||
                     /^```/.test(trimmed) ||
                     /^(i'll|i will|i've|i have|here's|here is|to implement|to create|to add|to fix|to update)/i.test(trimmed)) {
                currentSection = 'ai';
                const cleanLine = trimmed.replace(/^(ai|assistant|response|cursor|bot):\s*/i, '');
                if (cleanLine.length > 0) {
                    aiResponse = aiResponse ? `${aiResponse}\n${cleanLine}` : cleanLine;
                }
            }
            // Continue current section
            else if (currentSection === 'user') {
                userPrompt = userPrompt ? `${userPrompt}\n${trimmed}` : trimmed;
            } else if (currentSection === 'ai') {
                aiResponse = aiResponse ? `${aiResponse}\n${trimmed}` : trimmed;
            } else {
                // If no section detected yet, check if line looks like a question or request (user)
                if (/\?$/.test(trimmed) || /^(create|build|implement|add|fix|update|make|write|generate|develop|design|improve|enhance|refactor|optimize|remove|delete|change|modify|replace|set up|configure|install|test|run|deploy)/i.test(trimmed)) {
                    currentSection = 'user';
                    userPrompt = trimmed;
                } else {
                    // Default to AI if it looks like a response
                    currentSection = 'ai';
                    aiResponse = trimmed;
                }
            }
        }

        const trimmedPrompt = userPrompt ? userPrompt.trim() : '';
        const trimmedResponse = aiResponse ? aiResponse.trim() : '';
        
        // Filter out error messages
        if (trimmedPrompt && this.isErrorMessage(trimmedPrompt)) {
            Logger.log('⚠️  ChatMonitor: Rejected error message as user prompt');
            Logger.log(`   Rejected: ${trimmedPrompt.substring(0, 100)}${trimmedPrompt.length > 100 ? '...' : ''}`);
            return;
        }
        
        if (trimmedPrompt && trimmedPrompt.length > 0) {
            // Only update if we have new content
            const currentSummary = await this.chatTracker.getCurrentSummary();
            if (!currentSummary || currentSummary.userPrompt !== trimmedPrompt) {
                Logger.log('💬 ChatMonitor: New chat content detected');
                Logger.log(`   User Prompt: ${trimmedPrompt.substring(0, 100)}${trimmedPrompt.length > 100 ? '...' : ''}`);
                
                // Capture using ChatCapture if available
                if (this.chatCapture) {
                    this.chatCapture.captureChat(trimmedPrompt, trimmedResponse || undefined);
                }
                
                await this.chatTracker.startNewChat(trimmedPrompt);
                if (trimmedResponse && trimmedResponse.length > 0 && !this.isErrorMessage(trimmedResponse)) {
                    Logger.log(`   AI Response Length: ${trimmedResponse.length} characters`);
                    Logger.log(`   AI Response Preview: ${trimmedResponse.substring(0, 100)}${trimmedResponse.length > 100 ? '...' : ''}`);
                    await this.chatTracker.updateAIResponse(trimmedResponse);
                } else if (trimmedResponse && this.isErrorMessage(trimmedResponse)) {
                    Logger.log('⚠️  ChatMonitor: Rejected error message as AI response');
                } else {
                    Logger.log('⚠️  ChatMonitor: No AI response detected');
                }
                this.scheduleAutoSend();
            } else if (trimmedResponse && trimmedResponse.length > 0 && !this.isErrorMessage(trimmedResponse) && currentSummary) {
                // Check if response has actually changed (not just a summary comparison)
                const currentResponseSummary = currentSummary.aiResponseSummary || '';
                // Update if the raw response is different or if we don't have a summary yet
                if (currentResponseSummary.length === 0 || currentResponseSummary === 'No response available' || 
                    currentResponseSummary.includes('not yet captured') || 
                    trimmedResponse.length > currentResponseSummary.length * 2) {
                    Logger.log('💬 ChatMonitor: AI response updated');
                    Logger.log(`   AI Response Length: ${trimmedResponse.length} characters`);
                    Logger.log(`   AI Response Preview: ${trimmedResponse.substring(0, 100)}${trimmedResponse.length > 100 ? '...' : ''}`);
                    
                    // Update ChatCapture if available
                    if (this.chatCapture) {
                        this.chatCapture.captureChat(trimmedPrompt, trimmedResponse);
                    }
                    
                    await this.chatTracker.updateAIResponse(trimmedResponse);
                    this.scheduleAutoSend();
                }
            }
        } else {
            Logger.log('⚠️  ChatMonitor: Parsed chat content but no user prompt found');
            Logger.log(`   Content preview: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
        }
    }

    /**
     * Check if a string is an error message or system message
     */
    private isErrorMessage(text: string): boolean {
        const lowerText = text.toLowerCase();
        
        // Check for error patterns
        const errorPatterns = [
            'error:',
            'api error',
            'failed to',
            'network error',
            'request error',
            'bad request',
            'send summary:',
            'failed to send',
            'could not',
            'unable to',
            'exception:',
            'warning:',
            '⚠️',
            '❌',
            'status code:',
            'http error',
            '400',
            '401',
            '403',
            '404',
            '500',
            '502',
            '503'
        ];
        
        // Check if text starts with or contains error patterns
        for (const pattern of errorPatterns) {
            if (lowerText.includes(pattern)) {
                // Additional check: if it's a short message that's mostly error-related, reject it
                if (text.length < 200 && (
                    lowerText.startsWith(pattern) || 
                    lowerText.includes(`: ${pattern}`) ||
                    lowerText.includes(`${pattern} `)
                )) {
                    return true;
                }
            }
        }
        
        // Check for common error message structures
        if (/^(send|sending|failed|error|warning|api|network|request)/i.test(lowerText.trim())) {
            // If it's a short message starting with these words, it's likely an error
            if (text.length < 150) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Start monitoring clipboard for chat content
     */
    private startClipboardMonitoring(): void {
        // Check clipboard every 2 seconds
        this.clipboardCheckInterval = setInterval(async () => {
            if (!this.isMonitoring) {
                return;
            }

            try {
                const clipboardText = await vscode.env.clipboard.readText();
                if (clipboardText && clipboardText !== this.lastClipboardContent && clipboardText.length > 50) {
                    // Only process if it looks like chat content
                    if (this.looksLikeChat(clipboardText)) {
                        this.lastClipboardContent = clipboardText;
                        this.parseAndCaptureChat(clipboardText);
                    }
                }
            } catch (error) {
                // Clipboard access might fail, ignore
            }
        }, 2000);
    }

    /**
     * Try to access VS Code chat API if available
     */
    private tryAccessChatAPI(): void {
        // VS Code 1.74+ has chat API, but Cursor might use different API
        // Try to access it if available
        try {
            // This is a placeholder - actual implementation depends on Cursor's API
            // We'll monitor documents and clipboard as fallback
        } catch (error) {
            console.log('ChatMonitor: Chat API not available, using fallback methods');
        }
    }

    /**
     * Schedule automatic send with debouncing
     */
    private scheduleAutoSend(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.sendSummaryIfReady();
        }, this.DEBOUNCE_MS);
    }

    /**
     * Send summary if ready (respects minimum interval)
     */
    private async sendSummaryIfReady(): Promise<void> {
        if (!this.autoSendEnabled) {
            return; // Auto-send disabled
        }

        const now = Date.now();
        if (now - this.lastSentTime < this.MIN_SEND_INTERVAL) {
            return; // Too soon, skip
        }

        const summary = await this.chatTracker.getCurrentSummary();
        if (!summary) {
            return;
        }

        // Only send if we have meaningful content
        if (summary.userPrompt && summary.userPrompt.length > 10) {
            try {
                // Don't finalize here - send current state for real-time updates
                // Finalize will happen when chat actually ends
                Logger.log('🔄 ChatMonitor: Sending real-time update to API...');
                await this.apiClient.sendSummary(summary);
                this.lastSentTime = now;
                Logger.log('✅ ChatMonitor: Real-time update sent successfully');
            } catch (error) {
                Logger.error('ChatMonitor: Auto-send failed', error);
            }
        }
    }

    /**
     * Get information about the active chat document
     */
    public getActiveChatInfo(): {
        hasActiveChat: boolean;
        uri?: string;
        scheme?: string;
        languageId?: string;
        fileName?: string;
        lineCount?: number;
        contentLength?: number;
        isMonitoring?: boolean;
        detectionMethod?: string;
    } {
        // First, check if we have a stored active chat document
        let doc: vscode.TextDocument | null = this.activeChatDocument;
        let detectionMethod = 'stored';

        // If no stored document, check the currently active editor
        if (!doc) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                const activeDoc = activeEditor.document;
                Logger.log(`🔍 Checking active editor:`);
                Logger.log(`   URI: ${activeDoc.uri.toString()}`);
                Logger.log(`   Scheme: ${activeDoc.uri.scheme}`);
                Logger.log(`   Language: ${activeDoc.languageId}`);
                Logger.log(`   File Name: ${activeDoc.fileName || 'N/A'}`);
                
                if (this.isChatDocument(activeDoc)) {
                    doc = activeDoc;
                    detectionMethod = 'active-editor';
                    // Also update the stored active chat document
                    this.activeChatDocument = doc;
                    Logger.log(`✅ Active editor detected as chat document`);
                } else {
                    Logger.log(`❌ Active editor does not match chat document criteria`);
                    Logger.log(`   (URI doesn't contain chat indicators and content check failed)`);
                }
            } else {
                Logger.log(`❌ No active editor found`);
            }
        }

        // If still no document, check all open documents
        if (!doc) {
            Logger.log(`🔍 Checking ${vscode.workspace.textDocuments.length} open documents...`);
            for (const openDoc of vscode.workspace.textDocuments) {
                if (this.isChatDocument(openDoc)) {
                    doc = openDoc;
                    detectionMethod = 'open-documents';
                    // Also update the stored active chat document
                    this.activeChatDocument = doc;
                    Logger.log(`✅ Found chat document in open documents: ${openDoc.uri.toString()}`);
                    break;
                }
            }
            if (!doc) {
                Logger.log(`❌ No chat documents found in open documents`);
            }
        }

        if (!doc) {
            return {
                hasActiveChat: false,
                isMonitoring: this.isMonitoring,
                detectionMethod: 'none'
            };
        }

        return {
            hasActiveChat: true,
            uri: doc.uri.toString(),
            scheme: doc.uri.scheme,
            languageId: doc.languageId,
            fileName: doc.fileName || path.basename(doc.uri.toString()),
            lineCount: doc.lineCount,
            contentLength: doc.getText().length,
            isMonitoring: this.isMonitoring,
            detectionMethod: detectionMethod
        };
    }

    public dispose(): void {
        this.stopMonitoring();
    }
}

