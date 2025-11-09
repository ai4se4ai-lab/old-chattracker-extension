import * as vscode from 'vscode';
import { ChatTracker } from './chatTracker';
import { ConfigManager } from './configManager';
import { ApiClient } from './apiClient';
import { SummaryPanel } from './summaryPanel';
import { ChatCapture } from './chatCapture';
import { ChatMonitor } from './chatMonitor';
import { CursorHookSystem } from './cursorHookSystem';
import { HookInstaller } from './hookInstaller';
import { Logger } from './logger';
import { testExtraction } from './testExtraction';
import { testUserPromptCapture } from './testUserPromptCapture';
import { CursorRawEvent } from './types';
import * as fs from 'fs';
import * as path from 'path';

let chatTracker: ChatTracker;
let configManager: ConfigManager;
let apiClient: ApiClient;
let chatCapture: ChatCapture;
let chatMonitor: ChatMonitor;
let hookSystem: CursorHookSystem;
let hookInstaller: HookInstaller;

export function activate(context: vscode.ExtensionContext) {
    // Initialize logger first
    Logger.initialize();
    Logger.log('🚀 TrackChat extension is now active!');
    Logger.show(); // Show the output channel automatically

    // Initialize managers
    configManager = new ConfigManager(context);
    apiClient = new ApiClient(configManager);
    chatTracker = new ChatTracker(context, apiClient);
    chatCapture = new ChatCapture(chatTracker, configManager);
    const autoSend = configManager.getConfig().autoSend || false;
    chatMonitor = new ChatMonitor(chatTracker, apiClient, autoSend, chatCapture);
    hookSystem = new CursorHookSystem(context, configManager, apiClient);
    hookInstaller = new HookInstaller(context);

    // Register commands
    const showSummaryCommand = vscode.commands.registerCommand('trackchat.showSummary', () => {
        SummaryPanel.createOrShow(context.extensionUri, chatTracker);
    });

    const sendSummaryCommand = vscode.commands.registerCommand('trackchat.sendSummary', async () => {
        const summary = await chatTracker.getCurrentSummary();
        if (summary) {
            try {
                await apiClient.sendSummary(summary);
                vscode.window.showInformationMessage('Summary sent to API successfully!');
                // Refresh the summary panel if it's open
                SummaryPanel.currentPanel?.update();
            } catch (error: any) {
                const errorMessage = error?.message || String(error);
                vscode.window.showErrorMessage(`Failed to send summary: ${errorMessage}`);
                Logger.error('Failed to send summary', error);
                // Don't update the summary panel with error - just show notification
            }
        } else {
            vscode.window.showWarningMessage('No chat summary available yet.');
        }
    });

    const openConfigCommand = vscode.commands.registerCommand('trackchat.openConfig', () => {
        configManager.openConfigFile();
    });

    const captureChatCommand = vscode.commands.registerCommand('trackchat.captureChat', async () => {
        const userPrompt = await vscode.window.showInputBox({
            prompt: 'Enter the user prompt',
            placeHolder: 'User prompt...'
        });
        if (userPrompt) {
            const aiResponse = await vscode.window.showInputBox({
                prompt: 'Enter the AI response (optional)',
                placeHolder: 'AI response...'
            });
            chatCapture.captureChat(userPrompt, aiResponse);
            vscode.window.showInformationMessage('Chat captured!');
        }
    });

    const saveToJsonCommand = vscode.commands.registerCommand('trackchat.saveToJson', async () => {
        try {
            const filePath = await chatCapture.saveToJsonFile();
            vscode.window.showInformationMessage(`Chat data saved to: ${filePath}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save: ${error.message}`);
        }
    });

    // Helper function to check if text is a command name or UI text
    const isCommandNameOrUIText = (text: string): boolean => {
        if (!text || typeof text !== 'string') {
            return false;
        }
        
        const trimmed = text.trim();
        const lowerText = trimmed.toLowerCase();
        
        // If text is very long (> 200 chars), it's likely actual content, not just a command/UI text
        // But still check if it's ONLY command/UI text with no actual content
        if (trimmed.length > 200) {
            // For longer text, only reject if it's clearly a summary panel dump with no actual user prompt
            // Check if it contains multiple UI elements but no substantial user content
            const uiElementCount = (lowerText.match(/chat summary|in-progress|user prompt|user objectives|main actions|modified files|trackchat:/g) || []).length;
            const hasSubstantialContent = trimmed.length > 300 || 
                                         /[a-z]{20,}/i.test(trimmed) || // Has substantial text
                                         trimmed.split('\n').length > 5; // Has multiple lines
            
            // If it has many UI elements but no substantial content, reject it
            if (uiElementCount >= 3 && !hasSubstantialContent) {
                return true;
            }
            // Otherwise, allow it - it might be a summary panel that contains actual chat
            return false;
        }
        
        // For shorter text, check for command patterns (must be at start or whole text)
        const commandPatterns = [
            /^trackchat:\s*(capture|send|show|start|stop|save|open|finalize|test)/i,
            /^command:\s*/i,
            /^cmd:\s*/i,
            /^extension:\s*/i,
            /^vscode:\s*/i,
            /^cursor:\s*/i,
            /^trackchat: start monitoring$/i,  // Exact match for common commands
            /^trackchat: stop monitoring$/i,
            /^trackchat: capture chat$/i,
            /^trackchat: send summary$/i,
            /^trackchat: show summary$/i,
        ];
        
        for (const pattern of commandPatterns) {
            if (pattern.test(trimmed)) {
                return true;
            }
        }
        
        // Check for UI text patterns - only reject if text is short and mostly UI text
        const uiTextPatterns = [
            'chat summary',
            'in-progress',
            'waiting for response',
            'not yet captured',
            'no actions detected',
            'no files modified',
            'ai response not yet',
        ];
        
        for (const pattern of uiTextPatterns) {
            if (lowerText.includes(pattern)) {
                // Only reject if it's a short text that's mostly UI text
                if (trimmed.length < 100) {
                    // Check if it's mostly UI text (more than 50% of the text)
                    const uiTextRatio = (lowerText.match(new RegExp(pattern, 'g')) || []).length * pattern.length / trimmed.length;
                    if (uiTextRatio > 0.3) {
                        return true;
                    }
                }
            }
        }
        
        // Check if text looks like a menu item or command (starts with common command prefixes)
        // Only if it's short and matches the pattern exactly
        if (trimmed.length < 100 && /^(trackchat|command|cmd|extension|vscode|cursor):\s*[a-z\s]+$/i.test(trimmed)) {
            return true;
        }
        
        return false;
    };

    const captureFromCursorChatCommand = vscode.commands.registerCommand('trackchat.captureFromCursorChat', async () => {
        try {
            const clipboardText = await vscode.env.clipboard.readText();
            
            if (!clipboardText || clipboardText.trim().length === 0) {
                vscode.window.showWarningMessage('Clipboard is empty. Please copy chat content from Cursor first.');
                return;
            }

            // Validate that clipboard doesn't contain command names or UI text
            const trimmedClipboard = clipboardText.trim();
            if (isCommandNameOrUIText(trimmedClipboard)) {
                const moreInfo = await vscode.window.showWarningMessage(
                    'Clipboard contains a command name or UI text, not chat content.',
                    'Show Help',
                    'Use Manual Capture Instead'
                );
                
                if (moreInfo === 'Show Help') {
                    vscode.window.showInformationMessage(
                        'Copy the actual conversation text from Cursor (your question and AI response), not command names or UI elements. ' +
                        'You can also use "TrackChat: Capture Chat" to manually enter the content.'
                    );
                } else if (moreInfo === 'Use Manual Capture Instead') {
                    vscode.commands.executeCommand('trackchat.captureChat');
                }
                
                Logger.warn(`⚠️  Rejected clipboard content (command/UI text): "${trimmedClipboard.substring(0, 100)}${trimmedClipboard.length > 100 ? '...' : ''}"`);
                return;
            }

            // Try to parse the clipboard content as chat
            const lines = clipboardText.split('\n');
            let userPrompt = '';
            let aiResponse = '';
            let currentSection: 'user' | 'ai' | null = null;

            // Simple parsing: look for user/AI markers or patterns
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Detect user prompts
                if (/^(you|user|prompt|question|request|i want|i need|create|build|implement|add|fix|update|how|what|why|when|where|can you|could you|please):/i.test(trimmed) || 
                    /^> /.test(trimmed) ||
                    (currentSection === null && !/^(ai|assistant|response|cursor|bot|i'll|i will|i've|i have|here's|here is):/i.test(trimmed))) {
                    if (currentSection !== 'user') {
                        if (userPrompt) userPrompt += '\n';
                        userPrompt += trimmed.replace(/^(you|user|prompt|question|request|i want|i need|create|build|implement|add|fix|update|how|what|why|when|where|can you|could you|please):\s*/i, '').replace(/^> /, '');
                        currentSection = 'user';
                    } else {
                        userPrompt += '\n' + trimmed;
                    }
                }
                // Detect AI responses
                else if (/^(ai|assistant|response|cursor|bot):/i.test(trimmed) ||
                         /^```/.test(trimmed) ||
                         /^(i'll|i will|i've|i have|here's|here is|to implement|to create|to add|to fix|to update)/i.test(trimmed)) {
                    if (currentSection !== 'ai') {
                        if (aiResponse) aiResponse += '\n';
                        aiResponse += trimmed.replace(/^(ai|assistant|response|cursor|bot):\s*/i, '');
                        currentSection = 'ai';
                    } else {
                        aiResponse += '\n' + trimmed;
                    }
                }
                // Continue current section
                else if (currentSection === 'user') {
                    userPrompt += '\n' + trimmed;
                } else if (currentSection === 'ai') {
                    aiResponse += '\n' + trimmed;
                }
            }

            // Clean up
            userPrompt = userPrompt.trim();
            aiResponse = aiResponse.trim();

            // Validate parsed user prompt is not a command name or UI text
            if (userPrompt && isCommandNameOrUIText(userPrompt)) {
                vscode.window.showWarningMessage('Parsed content appears to be a command name or UI text, not chat content. Please copy the actual chat conversation.');
                Logger.warn(`⚠️  Rejected parsed user prompt (command/UI text): "${userPrompt.substring(0, 100)}${userPrompt.length > 100 ? '...' : ''}"`);
                return;
            }

            if (userPrompt) {
                chatCapture.captureChat(userPrompt, aiResponse || undefined);
                vscode.window.showInformationMessage('Chat captured from clipboard!');
            } else {
                // If we couldn't parse, validate the raw clipboard text first
                if (isCommandNameOrUIText(trimmedClipboard)) {
                    vscode.window.showWarningMessage('Clipboard content appears to be a command name or UI text, not chat content. Please copy the actual chat conversation.');
                    return;
                }
                
                // If we couldn't parse, ask user
                const choice = await vscode.window.showQuickPick(
                    ['Use as User Prompt', 'Use as AI Response', 'Cancel'],
                    { placeHolder: 'Could not auto-detect format. How should we use this?' }
                );
                
                if (choice === 'Use as User Prompt') {
                    // Validate before capturing
                    if (isCommandNameOrUIText(trimmedClipboard)) {
                        vscode.window.showWarningMessage('Content appears to be a command name or UI text, not chat content.');
                        return;
                    }
                    chatCapture.captureChat(clipboardText);
                    vscode.window.showInformationMessage('Chat captured!');
                } else if (choice === 'Use as AI Response') {
                    const prompt = await vscode.window.showInputBox({
                        prompt: 'Enter the user prompt for this response',
                        placeHolder: 'User prompt...'
                    });
                    if (prompt) {
                        // Validate prompt is not a command name
                        if (isCommandNameOrUIText(prompt)) {
                            vscode.window.showWarningMessage('User prompt appears to be a command name or UI text.');
                            return;
                        }
                        chatCapture.captureChat(prompt, clipboardText);
                        vscode.window.showInformationMessage('Chat captured!');
                    }
                }
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to capture from clipboard: ${error.message}`);
            Logger.error('Failed to capture from clipboard', error);
        }
    });

    const captureFromSelectionCommand = vscode.commands.registerCommand('trackchat.captureFromSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.document.getText(editor.selection);
        if (!selection) {
            vscode.window.showWarningMessage('No text selected');
            return;
        }

        // Validate that selection is not a command name or UI text
        const trimmedSelection = selection.trim();
        if (isCommandNameOrUIText(trimmedSelection)) {
            vscode.window.showWarningMessage('Selected text appears to be a command name or UI text, not chat content.');
            Logger.warn(`⚠️  Rejected selection (command/UI text): "${trimmedSelection.substring(0, 100)}${trimmedSelection.length > 100 ? '...' : ''}"`);
            return;
        }

        // Try to detect if this is a user prompt or AI response
        const isUserPrompt = /^(user|prompt|question|request):/i.test(trimmedSelection);
        
        if (isUserPrompt) {
            chatCapture.captureChat(selection);
            vscode.window.showInformationMessage('Chat captured from selection');
        } else {
            // Ask user what type of content this is
            const choice = await vscode.window.showQuickPick(
                ['User Prompt', 'AI Response', 'Cancel'],
                { placeHolder: 'What type of content is this?' }
            );

            if (choice === 'User Prompt') {
                // Validate again before capturing
                if (isCommandNameOrUIText(trimmedSelection)) {
                    vscode.window.showWarningMessage('Selected text appears to be a command name or UI text.');
                    return;
                }
                chatCapture.captureChat(selection);
                vscode.window.showInformationMessage('User prompt captured');
            } else if (choice === 'AI Response') {
                const prompt = await vscode.window.showInputBox({
                    prompt: 'Enter the user prompt for this response',
                    placeHolder: 'User prompt...'
                });
                if (prompt) {
                    // Validate prompt is not a command name
                    if (isCommandNameOrUIText(prompt)) {
                        vscode.window.showWarningMessage('User prompt appears to be a command name or UI text.');
                        return;
                    }
                    chatCapture.captureChat(prompt, selection);
                    vscode.window.showInformationMessage('Chat captured');
                }
            }
        }
    });

    const captureFromFileCommand = vscode.commands.registerCommand('trackchat.captureFromFile', async () => {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Text files': ['txt', 'md', 'json'],
                'All files': ['*']
            }
        });

        if (!fileUri || fileUri.length === 0) {
            return;
        }

        try {
            const document = await vscode.workspace.openTextDocument(fileUri[0]);
            const content = document.getText();
            
            // Try to parse as JSON first
            try {
                const json = JSON.parse(content);
                if (json.userPrompt && json.aiResponse) {
                    chatCapture.captureChat(json.userPrompt, json.aiResponse);
                    vscode.window.showInformationMessage('Chat imported from file');
                    return;
                }
            } catch {
                // Not JSON, treat as plain text
            }

            // Parse plain text format
            const lines = content.split('\n');
            let userPrompt = '';
            let aiResponse = '';
            let currentSection = '';

            for (const line of lines) {
                if (/^(user|prompt|question):/i.test(line)) {
                    currentSection = 'user';
                    userPrompt = line.replace(/^(user|prompt|question):\s*/i, '');
                } else if (/^(ai|assistant|response):/i.test(line)) {
                    currentSection = 'ai';
                    aiResponse = line.replace(/^(ai|assistant|response):\s*/i, '');
                } else if (currentSection === 'user') {
                    userPrompt += '\n' + line;
                } else if (currentSection === 'ai') {
                    aiResponse += '\n' + line;
                }
            }

            if (userPrompt || aiResponse) {
                chatCapture.captureChat(userPrompt || content, aiResponse);
                vscode.window.showInformationMessage('Chat imported from file');
            } else {
                vscode.window.showWarningMessage('Could not parse chat content from file');
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to read file: ${error.message}`);
            Logger.error('Failed to read file', error);
        }
    });

    const finalizeChatCommand = vscode.commands.registerCommand('trackchat.finalizeChat', async () => {
        await chatTracker.finalizeChat();
        vscode.window.showInformationMessage('Chat finalized. Summary ready to send.');
    });

    const startMonitoringCommand = vscode.commands.registerCommand('trackchat.startMonitoring', () => {
        chatMonitor.startMonitoring();
    });

    const stopMonitoringCommand = vscode.commands.registerCommand('trackchat.stopMonitoring', () => {
        chatMonitor.stopMonitoring();
    });

    const testExtractionCommand = vscode.commands.registerCommand('trackchat.testExtraction', async () => {
        await testExtraction(context, apiClient);
    });

    const testUserPromptCaptureCommand = vscode.commands.registerCommand('trackchat.testUserPromptCapture', async () => {
        await testUserPromptCapture(context, apiClient);
    });

    const showActiveChatInfoCommand = vscode.commands.registerCommand('trackchat.showActiveChatInfo', () => {
        const chatInfo = chatMonitor.getActiveChatInfo();
        
        if (!chatInfo.hasActiveChat) {
            const monitoringStatus = chatInfo.isMonitoring ? 'Active' : 'Inactive';
            Logger.log('\n📄 Active Chat Tab Information:');
            Logger.log('   Status: No active chat tab detected');
            Logger.log(`   Monitoring: ${monitoringStatus}`);
            
            // Show diagnostic information about open documents
            const openDocs = vscode.workspace.textDocuments;
            Logger.log(`\n📋 Diagnostic: Found ${openDocs.length} open document(s):`);
            openDocs.forEach((doc, index) => {
                Logger.log(`   ${index + 1}. ${doc.fileName || 'Untitled'}`);
                Logger.log(`      URI: ${doc.uri.toString()}`);
                Logger.log(`      Scheme: ${doc.uri.scheme}`);
                Logger.log(`      Language: ${doc.languageId}`);
                Logger.log(`      Lines: ${doc.lineCount}, Size: ${doc.getText().length} chars`);
            });
            
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                Logger.log(`\n📝 Currently Active Editor:`);
                Logger.log(`   ${activeEditor.document.fileName || 'Untitled'}`);
                Logger.log(`   URI: ${activeEditor.document.uri.toString()}`);
                Logger.log(`   Scheme: ${activeEditor.document.uri.scheme}`);
            } else {
                Logger.log(`\n📝 No active editor found`);
            }
            
            Logger.log(`\n💡 Note: Cursor's chat interface may be a webview panel, not a regular text document.`);
            Logger.log(`   If you have a chat open, it might not be accessible as a text document.\n`);
            
            const message = `No active chat tab detected. Monitoring: ${monitoringStatus}\n\n` +
                `Found ${openDocs.length} open document(s). Check the output channel for details.`;
            
            vscode.window.showInformationMessage(
                message,
                'View Details',
                'Start Monitoring'
            ).then(selection => {
                if (selection === 'View Details') {
                    Logger.show();
                } else if (selection === 'Start Monitoring') {
                    chatMonitor.startMonitoring();
                }
            });
            return;
        }

        const infoMessage = [
            '📄 Active Chat Tab Information',
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            `URI: ${chatInfo.uri}`,
            `Scheme: ${chatInfo.scheme}`,
            `Language: ${chatInfo.languageId || 'Unknown'}`,
            `File Name: ${chatInfo.fileName || 'N/A'}`,
            `Line Count: ${chatInfo.lineCount?.toLocaleString() || 'N/A'}`,
            `Content Length: ${chatInfo.contentLength?.toLocaleString() || 'N/A'} characters`,
            `Monitoring: ${chatInfo.isMonitoring ? 'Active' : 'Inactive'}`,
            '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
        ].join('\n');

        // Show in an information message (truncated) and also log full details
        Logger.log('\n📄 Active Chat Tab Information:');
        Logger.log(`   URI: ${chatInfo.uri}`);
        Logger.log(`   Scheme: ${chatInfo.scheme}`);
        Logger.log(`   Language: ${chatInfo.languageId || 'Unknown'}`);
        Logger.log(`   File Name: ${chatInfo.fileName || 'N/A'}`);
        Logger.log(`   Line Count: ${chatInfo.lineCount?.toLocaleString() || 'N/A'}`);
        Logger.log(`   Content Length: ${chatInfo.contentLength?.toLocaleString() || 'N/A'} characters`);
        Logger.log(`   Monitoring: ${chatInfo.isMonitoring ? 'Active' : 'Inactive'}`);
        if (chatInfo.detectionMethod) {
            Logger.log(`   Detection Method: ${chatInfo.detectionMethod}`);
        }
        Logger.log('');

        // Show a shorter message in the notification
        const shortMessage = `Active Chat Tab: ${chatInfo.fileName || 'Unknown'}\n` +
            `URI: ${chatInfo.uri}\n` +
            `Lines: ${chatInfo.lineCount?.toLocaleString() || 'N/A'}, ` +
            `Size: ${chatInfo.contentLength?.toLocaleString() || 'N/A'} chars\n` +
            `Monitoring: ${chatInfo.isMonitoring ? 'Active' : 'Inactive'}`;

        vscode.window.showInformationMessage(shortMessage, 'View Full Details').then(selection => {
            if (selection === 'View Full Details') {
                // Show full details in output channel
                Logger.show();
            }
        });
    });

    // Hook System Commands
    const processHookEventCommand = vscode.commands.registerCommand('trackchat.processHookEvent', async () => {
        const eventJson = await vscode.window.showInputBox({
            prompt: 'Enter Cursor event JSON',
            placeHolder: '{"eventType": "beforeSubmitPrompt", "userPrompt": "...", ...}',
            validateInput: (value) => {
                try {
                    JSON.parse(value);
                    return null;
                } catch {
                    return 'Invalid JSON';
                }
            }
        });

        if (eventJson) {
            try {
                const event: CursorRawEvent = JSON.parse(eventJson);
                await hookSystem.processEvent(event);
                vscode.window.showInformationMessage('Hook event processed successfully!');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to process event: ${error.message}`);
            }
        }
    });

    const getChatSessionsCommand = vscode.commands.registerCommand('trackchat.getChatSessions', async () => {
        const itineraryId = await vscode.window.showInputBox({
            prompt: 'Enter Itinerary ID',
            placeHolder: 'itinerary-id-here'
        });

        if (itineraryId) {
            try {
                const sessions = await apiClient.getChatSessions(itineraryId);
                Logger.log(`\n📋 Chat Sessions for Itinerary: ${itineraryId}`);
                Logger.log(`   Found ${sessions.length} session(s)\n`);
                
                sessions.forEach((session, index) => {
                    Logger.log(`Session ${index + 1}:`);
                    Logger.log(`   Title: ${session.chatTitle || 'N/A'}`);
                    Logger.log(`   Status: ${session.status || 'N/A'}`);
                    Logger.log(`   Prompt: ${(session.userPrompt || '').substring(0, 100)}${(session.userPrompt || '').length > 100 ? '...' : ''}`);
                    Logger.log(`   Response: ${session.aiResponse ? 'Yes' : 'No'}`);
                    Logger.log(`   Files: ${Array.isArray(session.affectedFiles) ? session.affectedFiles.length : 0}`);
                    Logger.log(`   Timestamp: ${session.latestTimestamp || session.promptTimestamp || 'N/A'}`);
                    Logger.log('');
                });

                Logger.show();
                vscode.window.showInformationMessage(`Retrieved ${sessions.length} chat session(s). Check output channel for details.`);
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to retrieve sessions: ${error.message}`);
                Logger.error(`Failed to retrieve chat sessions: ${error.message}`);
            }
        }
    });

    const showHookStatusCommand = vscode.commands.registerCommand('trackchat.showHookStatus', () => {
        const pairedEvents = hookSystem.getPairedEvents();
        const pendingPrompts = hookSystem.getPendingPrompts();

        Logger.log('\n📊 Hook System Status:');
        Logger.log(`   Paired Events: ${pairedEvents.length}`);
        Logger.log(`   Pending Prompts: ${pendingPrompts.length}`);
        Logger.log('');

        if (pendingPrompts.length > 0) {
            Logger.log('⏳ Pending Prompts:');
            pendingPrompts.forEach((prompt, index) => {
                Logger.log(`   ${index + 1}. ${prompt.chatTitle}`);
                Logger.log(`      Prompt: ${prompt.userPrompt.substring(0, 80)}${prompt.userPrompt.length > 80 ? '...' : ''}`);
                Logger.log(`      Timestamp: ${prompt.timestamp}`);
                Logger.log('');
            });
        }

        if (pairedEvents.length > 0) {
            Logger.log('✅ Paired Events:');
            pairedEvents.slice(-5).forEach((event, index) => {
                Logger.log(`   ${index + 1}. ${event.chatTitle}`);
                Logger.log(`      Status: ${event.status}`);
                Logger.log(`      Has Response: ${event.aiResponse ? 'Yes' : 'No'}`);
                Logger.log(`      Files: ${event.affectedFiles.length}`);
                Logger.log('');
            });
        }

        Logger.show();
        vscode.window.showInformationMessage(
            `Hook System: ${pairedEvents.length} paired, ${pendingPrompts.length} pending`
        );
    });

    const toggleHookDebugCommand = vscode.commands.registerCommand('trackchat.toggleHookDebug', () => {
        const currentDebug = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
        hookSystem.setDebugMode(!currentDebug);
        vscode.window.showInformationMessage(
            `Hook debug mode ${!currentDebug ? 'enabled' : 'disabled'}`
        );
    });

    const installHooksCommand = vscode.commands.registerCommand('trackchat.installHooks', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a workspace first.');
            return;
        }

        // Check if hooks are already installed
        const areInstalled = hookInstaller.areHooksInstalled();
        let overwrite = false;

        if (areInstalled) {
            const installedFiles = hookInstaller.getInstalledHooks();
            const choice = await vscode.window.showWarningMessage(
                `Hooks are already installed in .hook/ directory (${installedFiles.length} file(s)).\n\n` +
                `Files: ${installedFiles.slice(0, 5).join(', ')}${installedFiles.length > 5 ? '...' : ''}\n\n` +
                `Do you want to overwrite existing files?`,
                { modal: true },
                'Overwrite',
                'Cancel'
            );

            if (choice !== 'Overwrite') {
                Logger.log('Hook installation cancelled by user');
                return;
            }

            overwrite = true;
        }

        try {
            Logger.log('\n🚀 Starting hook installation...');
            Logger.show();

            const result = await hookInstaller.installHooks(overwrite);

            if (result.success) {
                const message = `✅ Hook installation complete! ${result.filesInstalled} file(s) installed to .hook/ directory.`;
                Logger.log(`\n${message}`);
                
                const action = await vscode.window.showInformationMessage(
                    message,
                    'Start Auto-Detector',
                    'View .hook Directory',
                    'View Documentation'
                );

                if (action === 'Start Auto-Detector') {
                    // Choose script based on platform
                    let startScript: string;
                    let command: string;
                    
                    if (process.platform === 'win32') {
                        // Windows - try PowerShell first, then batch
                        const psScript = path.join(workspaceRoot, '.hook', 'start-auto-detector.ps1');
                        const batScript = path.join(workspaceRoot, '.hook', 'start-auto-detector.bat');
                        
                        if (fs.existsSync(psScript)) {
                            startScript = psScript;
                            command = `powershell -ExecutionPolicy Bypass -File "${startScript}"`;
                        } else if (fs.existsSync(batScript)) {
                            startScript = batScript;
                            command = `"${startScript}"`;
                        } else {
                            // Fallback to bash script if available
                            startScript = path.join(workspaceRoot, '.hook', 'start-auto-detector.sh');
                            command = `bash "${startScript}"`;
                        }
                    } else {
                        // Unix-like systems
                        startScript = path.join(workspaceRoot, '.hook', 'start-auto-detector.sh');
                        command = `bash "${startScript}"`;
                    }
                    
                    if (fs.existsSync(startScript)) {
                        const terminal = vscode.window.createTerminal('Hook Auto-Detector');
                        terminal.sendText(command);
                        terminal.show();
                        
                        vscode.window.showInformationMessage(
                            'Auto-detector starting! Copy your prompts/responses to clipboard to capture them automatically.',
                            'View Instructions'
                        ).then(selection => {
                            if (selection === 'View Instructions') {
                                const instructions = hookInstaller.getAutoDetectorInstructions();
                                Logger.log('\n' + instructions);
                                Logger.show();
                            }
                        });
                    } else {
                        vscode.window.showWarningMessage(
                            'Start script not found. Run manually: bash .hook/start-auto-detector.sh'
                        );
                    }
                } else if (action === 'View .hook Directory') {
                    const hookDir = vscode.Uri.file(path.join(workspaceRoot, '.hook'));
                    await vscode.commands.executeCommand('revealFileInOS', hookDir);
                } else if (action === 'View Documentation') {
                    const readmePath = path.join(workspaceRoot, '.hook', 'README.md');
                    if (fs.existsSync(readmePath)) {
                        const doc = await vscode.workspace.openTextDocument(readmePath);
                        await vscode.window.showTextDocument(doc);
                    } else {
                        vscode.window.showWarningMessage('README.md not found in .hook directory.');
                    }
                }
            } else {
                const errorMessage = `Hook installation completed with errors. ${result.filesInstalled} file(s) installed, ${result.errors.length} error(s).`;
                Logger.error(`\n${errorMessage}`);
                Logger.error(`Errors:\n${result.errors.join('\n')}`);
                
                vscode.window.showWarningMessage(
                    errorMessage + ' Check the output channel for details.',
                    'View Output'
                ).then(selection => {
                    if (selection === 'View Output') {
                        Logger.show();
                    }
                });
            }
        } catch (error: any) {
            const errorMessage = `Failed to install hooks: ${error.message}`;
            Logger.error(errorMessage);
            vscode.window.showErrorMessage(errorMessage, 'View Output').then(selection => {
                if (selection === 'View Output') {
                    Logger.show();
                }
            });
        }
    });

    // Setup file watcher for hook events (if events are written to a file)
    const setupHookFileWatcher = () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        const hookEventsPath = path.join(workspaceRoot, '.cursor-hooks');
        if (!fs.existsSync(hookEventsPath)) {
            try {
                fs.mkdirSync(hookEventsPath, { recursive: true });
            } catch (error: any) {
                Logger.warn(`Could not create hook events directory: ${error.message}`);
                return;
            }
        }

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceRoot, '.cursor-hooks/**/*.json')
        );

        watcher.onDidCreate(async (uri) => {
            try {
                const content = fs.readFileSync(uri.fsPath, 'utf8');
                const event: CursorRawEvent = JSON.parse(content);
                await hookSystem.processEvent(event);
                
                // Optionally delete the file after processing
                // fs.unlinkSync(uri.fsPath);
            } catch (error: any) {
                Logger.error(`Failed to process hook event file ${uri.fsPath}: ${error.message}`);
            }
        });

        context.subscriptions.push(watcher);
        Logger.log('📁 Hook file watcher initialized (watching .cursor-hooks/)');
    };

    setupHookFileWatcher();

    context.subscriptions.push(
        showSummaryCommand,
        sendSummaryCommand,
        openConfigCommand,
        captureChatCommand,
        captureFromCursorChatCommand,
        captureFromSelectionCommand,
        captureFromFileCommand,
        saveToJsonCommand,
        finalizeChatCommand,
        startMonitoringCommand,
        stopMonitoringCommand,
        testExtractionCommand,
        testUserPromptCaptureCommand,
        showActiveChatInfoCommand,
        processHookEventCommand,
        getChatSessionsCommand,
        showHookStatusCommand,
        toggleHookDebugCommand,
        installHooksCommand
    );

    // Start tracking chat content
    chatTracker.startTracking();

    // Create status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'trackchat.showSummary';
    statusBarItem.text = '$(comment-discussion) TrackChat';
    statusBarItem.tooltip = 'Show Chat Summary';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update status bar based on chat state
    const updateStatusBar = async () => {
        const summary = await chatTracker.getCurrentSummary();
        if (summary) {
            const statusIcon = {
                'completed': '$(check)',
                'in-progress': '$(sync~spin)',
                'failed': '$(error)'
            }[summary.taskStatus] || '$(circle-outline)';
            statusBarItem.text = `${statusIcon} TrackChat`;
            statusBarItem.tooltip = `Chat Summary - ${summary.taskStatus}`;
        } else {
            statusBarItem.text = '$(comment-discussion) TrackChat';
            statusBarItem.tooltip = 'Show Chat Summary';
        }
    };

    // Update status bar periodically
    const statusBarInterval = setInterval(updateStatusBar, 1000);
    context.subscriptions.push(new vscode.Disposable(() => clearInterval(statusBarInterval)));

    // Auto-start monitoring if configured
    const autoTrack = configManager.getConfig().autoTrack || false;
    if (autoTrack) {
        // Start monitoring automatically after a short delay
        setTimeout(() => {
            chatMonitor.startMonitoring();
        }, 2000);
    }

    // Auto-send summary when chat ends (optional - can be configured)
    if (autoSend) {
        chatTracker.onChatEnd((summary) => {
            apiClient.sendSummary(summary).catch(err => {
                console.error('Auto-send failed:', err);
            });
        });
    }
}

export function deactivate() {
    if (hookSystem) {
        hookSystem.dispose();
    }
    if (chatMonitor) {
        chatMonitor.dispose();
    }
    if (chatTracker) {
        chatTracker.dispose();
    }
    if (chatCapture) {
        chatCapture.dispose();
    }
    Logger.dispose();
}

