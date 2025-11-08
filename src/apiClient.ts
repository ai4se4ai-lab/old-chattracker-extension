import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from './configManager';
import { ChatSummary, ApiRequest } from './types';
import * as vscode from 'vscode';
import { Logger } from './logger';

export class ApiClient {
    private configManager: ConfigManager;
    private axiosInstance: AxiosInstance;

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
        this.axiosInstance = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    public async sendSummary(summary: ChatSummary): Promise<void> {
        const config = this.configManager.getConfig();

        if (!config.CURSOR_CONNECTION_CODE || !config.EASYITI_API_URL) {
            throw new Error('API configuration is missing. Please configure CURSOR_CONNECTION_CODE and EASYITI_API_URL in config.json');
        }

        const request: ApiRequest = {
            connectionCode: config.CURSOR_CONNECTION_CODE,
            eventType: 'chat-summary',
            status: summary.taskStatus,
            summary: summary
        };

        // Log detailed information about what's being sent
        Logger.log('\n========== TrackChat: Sending Summary to API ==========');
        Logger.log(`📍 API URL: ${config.EASYITI_API_URL}`);
        Logger.log(`🔑 Connection Code: ${config.CURSOR_CONNECTION_CODE}`);
        Logger.log(`📌 Event Type: ${request.eventType}`);
        Logger.log(`📊 Status: ${request.status}`);
        Logger.log(`📋 Chat ID: ${summary.id}`);
        Logger.log(`⏰ Timestamp: ${summary.timestamp}`);
        Logger.log(`📝 User Prompt: ${(summary.userPrompt || '').substring(0, 100)}${(summary.userPrompt || '').length > 100 ? '...' : ''}`);
        Logger.log(`🎯 User Objectives: ${summary.userObjectives.length} objectives`);
        summary.userObjectives.forEach((obj, i) => {
            const objStr = obj || '';
            Logger.log(`   ${i + 1}. ${objStr.substring(0, 80)}${objStr.length > 80 ? '...' : ''}`);
        });
        Logger.log(`🤖 AI Response Summary: ${(summary.aiResponseSummary || '').substring(0, 100)}${(summary.aiResponseSummary || '').length > 100 ? '...' : ''}`);
        Logger.log(`⚡ Main Actions: ${summary.mainActions.length} actions`);
        summary.mainActions.forEach((action, i) => {
            const actionStr = action || '';
            Logger.log(`   ${i + 1}. ${actionStr.substring(0, 80)}${actionStr.length > 80 ? '...' : ''}`);
        });
        Logger.log(`📁 Modified Files: ${summary.modifiedFiles.length} files`);
        summary.modifiedFiles.forEach((file, i) => {
            Logger.log(`   ${i + 1}. ${file}`);
        });
        Logger.log(`✅ Task Status: ${summary.taskStatus}`);
        Logger.log(`📦 Request Payload Size: ${JSON.stringify(request).length} bytes`);
        Logger.log('========================================================\n');

        // Validate the request data before sending
        this.validateRequest(request);

        // Log the full request payload for debugging
        try {
            const requestStr = JSON.stringify(request, null, 2);
            Logger.log('📤 Full Request Payload:');
            Logger.log(requestStr.substring(0, 1000) + (requestStr.length > 1000 ? '\n... (truncated)' : ''));
        } catch (e) {
            Logger.warn('Could not stringify request for logging');
        }

        try {
            const response = await this.axiosInstance.post(config.EASYITI_API_URL, request);
            Logger.log('✅ SUCCESS: Summary sent to API');
            Logger.log(`   Status Code: ${response.status}`);
            Logger.log(`   Status Text: ${response.statusText}`);
            if (response.data) {
                const responseStr = JSON.stringify(response.data);
                Logger.log(`   Response Data: ${responseStr.substring(0, 200)}${responseStr.length > 200 ? '...' : ''}`);
            }
            Logger.log('');
        } catch (error: any) {
            Logger.error('❌ FAILED: Summary could not be sent to API');
            Logger.error(`   URL: ${config.EASYITI_API_URL}`);
            
            if (error.response) {
                Logger.error(`   Status Code: ${error.response.status}`);
                Logger.error(`   Status Text: ${error.response.statusText}`);
                
                // Log full error response
                let errorDataStr = '';
                try {
                    errorDataStr = JSON.stringify(error.response.data, null, 2);
                } catch (e) {
                    errorDataStr = String(error.response.data);
                }
                
                Logger.error(`   Error Response:`);
                Logger.error(errorDataStr);
                
                // Extract error message
                const errorMessage = error.response.data?.message || 
                                   error.response.data?.error || 
                                   error.response.data?.detail ||
                                   error.response.statusText;
                
                throw new Error(`API Error: ${error.response.status} - ${errorMessage}`);
            } else if (error.request) {
                Logger.error('   Network Error: Could not reach the API server');
                Logger.error(`   Request was made but no response received`);
                throw new Error('Network Error: Could not reach the API server');
            } else {
                Logger.error(`   Error Message: ${error.message}`);
                throw new Error(`Request Error: ${error.message}`);
            }
        }
    }

    /**
     * Validate the request data before sending
     */
    private validateRequest(request: ApiRequest): void {
        const errors: string[] = [];

        if (!request.connectionCode || request.connectionCode.trim().length === 0) {
            errors.push('connectionCode is missing or empty');
        }

        if (!request.eventType || request.eventType.trim().length === 0) {
            errors.push('eventType is missing or empty');
        }

        if (!request.status || !['completed', 'in-progress', 'failed'].includes(request.status)) {
            errors.push(`status must be one of: 'completed', 'in-progress', 'failed'`);
        }

        if (!request.summary) {
            errors.push('summary is missing');
        } else {
            const summary = request.summary;
            
            if (!summary.id || summary.id.trim().length === 0) {
                errors.push('summary.id is missing or empty');
            }
            
            if (!summary.timestamp || summary.timestamp.trim().length === 0) {
                errors.push('summary.timestamp is missing or empty');
            }
            
            if (!summary.userPrompt || summary.userPrompt.trim().length === 0) {
                errors.push('summary.userPrompt is missing or empty');
            }
            
            if (!Array.isArray(summary.userObjectives)) {
                errors.push('summary.userObjectives must be an array');
            }
            
            if (!Array.isArray(summary.mainActions)) {
                errors.push('summary.mainActions must be an array');
            }
            
            if (!Array.isArray(summary.modifiedFiles)) {
                errors.push('summary.modifiedFiles must be an array');
            }
            
            if (!summary.taskStatus || !['completed', 'in-progress', 'failed'].includes(summary.taskStatus)) {
                errors.push(`summary.taskStatus must be one of: 'completed', 'in-progress', 'failed'`);
            }
        }

        if (errors.length > 0) {
            const errorMsg = `Request validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`;
            Logger.error(errorMsg);
            throw new Error(errorMsg);
        }
    }

    public async testConnection(): Promise<boolean> {
        const config = this.configManager.getConfig();

        if (!config.CURSOR_CONNECTION_CODE || !config.EASYITI_API_URL) {
            return false;
        }

        try {
            // Try a simple GET request to check if the endpoint is reachable
            await this.axiosInstance.get(config.EASYITI_API_URL, { timeout: 5000 });
            return true;
        } catch (error: any) {
            // Even if it fails, if we got a response, the endpoint exists
            return error.response !== undefined;
        }
    }

    /**
     * Send a hook event to the API
     */
    public async sendHookEvent(eventData: any): Promise<void> {
        const config = this.configManager.getConfig();

        if (!config.CURSOR_CONNECTION_CODE || !config.EASYITI_API_URL) {
            throw new Error('API configuration is missing');
        }

        // Extract base URL (remove /api/chat-summary if present)
        let baseUrl = config.EASYITI_API_URL;
        if (baseUrl.includes('/api/chat-summary')) {
            baseUrl = baseUrl.replace('/api/chat-summary', '');
        }
        // Ensure base URL doesn't end with /
        baseUrl = baseUrl.replace(/\/$/, '');
        
        const eventUrl = `${baseUrl}/api/cursor-events`;

        const request = {
            connectionCode: config.CURSOR_CONNECTION_CODE,
            ...eventData
        };

        Logger.log(`📤 Sending hook event to: ${eventUrl}`);
        
        try {
            const response = await this.axiosInstance.post(eventUrl, request);
            Logger.log(`✅ Hook event sent successfully (Status: ${response.status})`);
        } catch (error: any) {
            Logger.error(`❌ Failed to send hook event: ${error.message}`);
            if (error.response) {
                Logger.error(`   Status: ${error.response.status}`);
                Logger.error(`   Response: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Retrieve chat sessions for an itinerary
     */
    public async getChatSessions(itineraryId: string): Promise<any[]> {
        const config = this.configManager.getConfig();

        if (!config.CURSOR_CONNECTION_CODE || !config.EASYITI_API_URL) {
            throw new Error('API configuration is missing');
        }

        // Extract base URL (remove /api/chat-summary if present)
        let baseUrl = config.EASYITI_API_URL;
        if (baseUrl.includes('/api/chat-summary')) {
            baseUrl = baseUrl.replace('/api/chat-summary', '');
        }
        // Ensure base URL doesn't end with /
        baseUrl = baseUrl.replace(/\/$/, '');
        
        const sessionsUrl = `${baseUrl}/api/cursor-chats/${itineraryId}`;

        Logger.log(`📥 Fetching chat sessions from: ${sessionsUrl}`);

        try {
            const response = await this.axiosInstance.get(sessionsUrl, {
                params: {
                    connectionCode: config.CURSOR_CONNECTION_CODE
                },
                timeout: 10000
            });

            Logger.log(`✅ Retrieved ${Array.isArray(response.data) ? response.data.length : 0} chat session(s)`);
            return Array.isArray(response.data) ? response.data : [];
        } catch (error: any) {
            Logger.error(`❌ Failed to retrieve chat sessions: ${error.message}`);
            if (error.response) {
                Logger.error(`   Status: ${error.response.status}`);
                Logger.error(`   Response: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }
}

