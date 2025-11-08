import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';
import { ConfigManager } from './configManager';
import { ApiClient } from './apiClient';
import { CursorRawEvent, HookEventData, PairedChatEvent, CursorEventType, TaskStatus } from './types';

/**
 * Cursor Hook System
 * 
 * Captures Cursor chat events and pairs them together.
 * Features:
 * - Field mapping: maps various Cursor field names to consistent format
 * - Event pairing: handles beforeSubmitPrompt and afterAgentResponse events
 * - Debug mode: set DEBUG=1 for verbose logging
 */
export class CursorHookSystem {
    private configManager: ConfigManager;
    private apiClient: ApiClient;
    private context: vscode.ExtensionContext;
    private pendingPrompts: Map<string, HookEventData> = new Map();
    private pairedEvents: PairedChatEvent[] = [];
    private debugMode: boolean = false;
    private disposables: vscode.Disposable[] = [];
    private eventStoragePath: string;

    constructor(context: vscode.ExtensionContext, configManager: ConfigManager, apiClient: ApiClient) {
        this.context = context;
        this.configManager = configManager;
        this.apiClient = apiClient;
        this.debugMode = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
        
        // Create storage directory for events
        this.eventStoragePath = path.join(context.globalStorageUri.fsPath, 'cursor-events');
        this.ensureStorageDirectory();
        
        this.log('🔧 Cursor Hook System initialized');
        if (this.debugMode) {
            this.log('🐛 Debug mode enabled');
        }
    }

    /**
     * Ensure storage directory exists
     */
    private ensureStorageDirectory(): void {
        try {
            if (!fs.existsSync(this.eventStoragePath)) {
                fs.mkdirSync(this.eventStoragePath, { recursive: true });
            }
        } catch (error: any) {
            Logger.error(`Failed to create storage directory: ${error.message}`);
        }
    }

    /**
     * Log message (with debug prefix if in debug mode)
     */
    private log(message: string, level: 'log' | 'warn' | 'error' = 'log'): void {
        const prefix = this.debugMode ? '[HOOK] ' : '';
        const fullMessage = `${prefix}${message}`;
        
        if (level === 'error') {
            Logger.error(fullMessage);
        } else if (level === 'warn') {
            Logger.warn(fullMessage);
        } else {
            Logger.log(fullMessage);
        }
    }

    /**
     * Map raw Cursor event to normalized format
     */
    private mapFields(rawEvent: CursorRawEvent): HookEventData {
        // Extract event type
        const eventType = this.normalizeEventType(rawEvent.eventType || rawEvent.type || '');
        
        // Map user prompt fields
        const userPrompt = rawEvent.user_input || 
                          rawEvent.userPrompt || 
                          rawEvent.prompt || 
                          rawEvent.message ||
                          rawEvent.text ||
                          '';
        
        // Map chat title
        const chatTitle = rawEvent.chatTitle || 
                         rawEvent.title || 
                         rawEvent.chat_title ||
                         rawEvent.conversationTitle ||
                         `Chat ${new Date().toISOString()}`;
        
        // Map AI response fields
        const aiResponse = rawEvent.aiResponse || 
                          rawEvent.response || 
                          rawEvent.agentResponse ||
                          rawEvent.agent_response ||
                          rawEvent.assistantResponse ||
                          rawEvent.assistant_response ||
                          undefined;
        
        // Map affected files
        const affectedFiles = rawEvent.affectedFiles || 
                            rawEvent.files || 
                            rawEvent.modifiedFiles ||
                            rawEvent.modified_files ||
                            rawEvent.changedFiles ||
                            rawEvent.changed_files ||
                            [];
        
        // Normalize affected files to array of strings
        const filesArray = Array.isArray(affectedFiles) 
            ? affectedFiles.map(f => typeof f === 'string' ? f : (f.path || f.file || String(f)))
            : [];
        
        // Map status
        const status = this.normalizeStatus(rawEvent.status || rawEvent.taskStatus || 'in-progress');
        
        // Extract timestamp
        const timestamp = rawEvent.timestamp || 
                         rawEvent.time || 
                         rawEvent.created_at ||
                         new Date().toISOString();
        
        // Extract itinerary ID if present
        const itineraryId = rawEvent.itineraryId || 
                           rawEvent.itinerary_id || 
                           rawEvent.sessionId ||
                           rawEvent.session_id ||
                           undefined;

        return {
            eventType,
            chatTitle: String(chatTitle),
            userPrompt: String(userPrompt),
            aiResponse: aiResponse ? String(aiResponse) : undefined,
            affectedFiles: filesArray,
            status,
            timestamp: String(timestamp),
            metadata: rawEvent,
            itineraryId: itineraryId ? String(itineraryId) : undefined
        };
    }

    /**
     * Normalize event type
     */
    private normalizeEventType(eventType: string): CursorEventType {
        const normalized = eventType.toLowerCase().trim();
        
        if (normalized.includes('beforesubmit') || normalized.includes('before_submit') || normalized === 'prompt') {
            return 'beforeSubmitPrompt';
        }
        if (normalized.includes('afteragent') || normalized.includes('after_agent') || normalized.includes('response')) {
            return 'afterAgentResponse';
        }
        if (normalized.includes('summary') || normalized.includes('chat-summary')) {
            return 'chat-summary';
        }
        
        // Default to beforeSubmitPrompt if unknown
        return 'beforeSubmitPrompt';
    }

    /**
     * Normalize status
     */
    private normalizeStatus(status: string): TaskStatus {
        const normalized = status.toLowerCase().trim();
        
        if (normalized === 'completed' || normalized === 'complete' || normalized === 'done') {
            return 'completed';
        }
        if (normalized === 'failed' || normalized === 'error' || normalized === 'failure') {
            return 'failed';
        }
        
        return 'in-progress';
    }

    /**
     * Process a raw Cursor event
     */
    public async processEvent(rawEvent: CursorRawEvent): Promise<void> {
        try {
            this.log(`📥 Received event: ${rawEvent.eventType || 'unknown'}`);
            
            if (this.debugMode) {
                this.log(`🐛 Raw event data: ${JSON.stringify(rawEvent, null, 2)}`);
            }
            
            // Map fields to normalized format
            const normalizedEvent = this.mapFields(rawEvent);
            
            if (this.debugMode) {
                this.log(`🐛 Normalized event: ${JSON.stringify(normalizedEvent, null, 2)}`);
            }
            
            // Process based on event type
            if (normalizedEvent.eventType === 'beforeSubmitPrompt') {
                await this.handleBeforeSubmitPrompt(normalizedEvent);
            } else if (normalizedEvent.eventType === 'afterAgentResponse') {
                await this.handleAfterAgentResponse(normalizedEvent);
            } else if (normalizedEvent.eventType === 'chat-summary') {
                await this.handleChatSummary(normalizedEvent);
            }
            
            // Store event for debugging
            await this.storeEvent(normalizedEvent);
            
        } catch (error: any) {
            this.log(`❌ Error processing event: ${error.message}`, 'error');
            if (this.debugMode) {
                this.log(`🐛 Error stack: ${error.stack}`, 'error');
            }
        }
    }

    /**
     * Handle beforeSubmitPrompt event
     */
    private async handleBeforeSubmitPrompt(event: HookEventData): Promise<void> {
        this.log(`💬 Before Submit Prompt: ${event.userPrompt.substring(0, 100)}${event.userPrompt.length > 100 ? '...' : ''}`);
        
        // Create a key for pairing (use chatTitle + timestamp)
        const pairKey = `${event.chatTitle}_${event.timestamp}`;
        
        // Store as pending prompt
        this.pendingPrompts.set(pairKey, event);
        
        this.log(`📌 Stored pending prompt (key: ${pairKey})`);
        
        // Auto-send if configured
        const config = this.configManager.getConfig();
        if (config.autoSend) {
            // Create a paired event with just the prompt
            const pairedEvent: PairedChatEvent = {
                chatTitle: event.chatTitle,
                userPrompt: event.userPrompt,
                aiResponse: undefined,
                affectedFiles: event.affectedFiles,
                status: 'in-progress',
                promptTimestamp: event.timestamp,
                responseTimestamp: undefined,
                itineraryId: event.itineraryId,
                metadata: {
                    promptEvent: event.metadata,
                    responseEvent: undefined
                }
            };
            
            await this.sendPairedEvent(pairedEvent);
        }
    }

    /**
     * Handle afterAgentResponse event
     */
    private async handleAfterAgentResponse(event: HookEventData): Promise<void> {
        this.log(`🤖 After Agent Response: ${event.aiResponse ? event.aiResponse.substring(0, 100) + '...' : 'No response'}`);
        
        // Try to find matching prompt
        // Match by chatTitle (most reliable) or by proximity in time
        let matchedPrompt: HookEventData | null = null;
        let matchedKey: string | null = null;
        
        // First, try exact match by chatTitle
        for (const [key, prompt] of this.pendingPrompts.entries()) {
            if (prompt.chatTitle === event.chatTitle) {
                matchedPrompt = prompt;
                matchedKey = key;
                break;
            }
        }
        
        // If no exact match, try to find the most recent pending prompt
        if (!matchedPrompt && this.pendingPrompts.size > 0) {
            const entries = Array.from(this.pendingPrompts.entries());
            // Sort by timestamp (most recent first)
            entries.sort((a, b) => {
                const timeA = new Date(a[1].timestamp).getTime();
                const timeB = new Date(b[1].timestamp).getTime();
                return timeB - timeA;
            });
            matchedPrompt = entries[0][1];
            matchedKey = entries[0][0];
        }
        
        if (matchedPrompt) {
            this.log(`✅ Matched response with prompt: ${matchedKey}`);
            
            // Create paired event
            const pairedEvent: PairedChatEvent = {
                chatTitle: matchedPrompt.chatTitle,
                userPrompt: matchedPrompt.userPrompt,
                aiResponse: event.aiResponse,
                affectedFiles: [...new Set([...matchedPrompt.affectedFiles, ...event.affectedFiles])], // Merge and deduplicate
                status: event.status,
                promptTimestamp: matchedPrompt.timestamp,
                responseTimestamp: event.timestamp,
                itineraryId: event.itineraryId || matchedPrompt.itineraryId,
                metadata: {
                    promptEvent: matchedPrompt.metadata,
                    responseEvent: event.metadata
                }
            };
            
            // Remove from pending
            this.pendingPrompts.delete(matchedKey!);
            
            // Store paired event
            this.pairedEvents.push(pairedEvent);
            
            // Send to API
            await this.sendPairedEvent(pairedEvent);
        } else {
            this.log(`⚠️  No matching prompt found for response. Creating standalone event.`, 'warn');
            
            // Create standalone event (response without prompt)
            const pairedEvent: PairedChatEvent = {
                chatTitle: event.chatTitle,
                userPrompt: '', // No prompt available
                aiResponse: event.aiResponse,
                affectedFiles: event.affectedFiles,
                status: event.status,
                promptTimestamp: event.timestamp,
                responseTimestamp: event.timestamp,
                itineraryId: event.itineraryId,
                metadata: {
                    promptEvent: undefined,
                    responseEvent: event.metadata
                }
            };
            
            await this.sendPairedEvent(pairedEvent);
        }
    }

    /**
     * Handle chat-summary event (already paired)
     */
    private async handleChatSummary(event: HookEventData): Promise<void> {
        this.log(`📋 Chat Summary event received`);
        
        const pairedEvent: PairedChatEvent = {
            chatTitle: event.chatTitle,
            userPrompt: event.userPrompt,
            aiResponse: event.aiResponse,
            affectedFiles: event.affectedFiles,
            status: event.status,
            promptTimestamp: event.timestamp,
            responseTimestamp: event.timestamp,
            itineraryId: event.itineraryId,
            metadata: {
                promptEvent: event.metadata,
                responseEvent: undefined
            }
        };
        
        await this.sendPairedEvent(pairedEvent);
    }

    /**
     * Send paired event to API
     */
    private async sendPairedEvent(pairedEvent: PairedChatEvent): Promise<void> {
        try {
            const config = this.configManager.getConfig();
            
            if (!config.CURSOR_CONNECTION_CODE || !config.EASYITI_API_URL) {
                this.log('⚠️  API not configured. Event stored locally only.', 'warn');
                return;
            }
            
            // Convert to API format
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
            
            this.log(`📤 Sending paired event to API...`);
            
            if (this.debugMode) {
                this.log(`🐛 API request: ${JSON.stringify(apiRequest, null, 2)}`);
            }
            
            // Use apiClient to send the hook event
            await this.apiClient.sendHookEvent(apiRequest);
            
            this.log(`✅ Paired event sent successfully`);
            
        } catch (error: any) {
            this.log(`❌ Failed to send paired event: ${error.message}`, 'error');
            if (this.debugMode) {
                this.log(`🐛 Error details: ${JSON.stringify(error.response?.data || error.message)}`, 'error');
            }
        }
    }

    /**
     * Store event locally for debugging
     */
    private async storeEvent(event: HookEventData): Promise<void> {
        try {
            const eventFile = path.join(this.eventStoragePath, `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`);
            fs.writeFileSync(eventFile, JSON.stringify(event, null, 2), 'utf8');
            
            if (this.debugMode) {
                this.log(`💾 Event stored: ${eventFile}`);
            }
        } catch (error: any) {
            this.log(`❌ Failed to store event: ${error.message}`, 'error');
        }
    }

    /**
     * Get all paired events
     */
    public getPairedEvents(): PairedChatEvent[] {
        return [...this.pairedEvents];
    }

    /**
     * Get pending prompts
     */
    public getPendingPrompts(): HookEventData[] {
        return Array.from(this.pendingPrompts.values());
    }

    /**
     * Clear all events (for testing/debugging)
     */
    public clearEvents(): void {
        this.pendingPrompts.clear();
        this.pairedEvents = [];
        this.log('🗑️  All events cleared');
    }

    /**
     * Enable/disable debug mode
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.log(`🐛 Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

