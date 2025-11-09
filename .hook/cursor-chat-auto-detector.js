#!/usr/bin/env node

/**
 * Cursor Chat Auto-Detector
 * 
 * Automatically detects active chat tabs and captures prompts/responses in real-time.
 * This hook runs continuously and monitors for chat activity.
 * 
 * Usage:
 *   node .hook/cursor-chat-auto-detector.js
 * 
 * Or run in background:
 *   nohup node .hook/cursor-chat-auto-detector.js > .hook/detector.log 2>&1 &
 */

const fs = require('fs');
const path = require('path');
const { writeEvent, getWorkspaceRoot } = require('./cursor-chat-hook.js');

// Configuration
const CHECK_INTERVAL = 2000; // Check every 2 seconds
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
const workspaceRoot = getWorkspaceRoot();

// State tracking
let lastClipboardContent = '';
let lastProcessedPrompt = '';
let lastProcessedResponse = '';
let pendingPrompts = new Map(); // chatTitle -> { prompt, timestamp }

/**
 * Log with timestamp
 */
function log(message, level = 'log') {
    const timestamp = new Date().toISOString();
    const prefix = DEBUG ? '[AUTO-DETECTOR] ' : '';
    const fullMessage = `[${timestamp}] ${prefix}${message}`;
    
    if (level === 'error') {
        console.error(fullMessage);
    } else if (level === 'warn') {
        console.warn(fullMessage);
    } else {
        console.log(fullMessage);
    }
}

/**
 * Check if text looks like a chat prompt
 */
function isChatPrompt(text) {
    if (!text || text.length < 10) return false;
    
    const trimmed = text.trim();
    const firstLine = trimmed.split('\n')[0].trim();
    const lowerFirstLine = firstLine.toLowerCase();
    
    // Look for prompt indicators - be more lenient
    const promptPatterns = [
        // Action verbs
        /^(create|build|implement|add|fix|update|make|write|generate|develop|design|improve|enhance|refactor|optimize|remove|delete|change|modify|replace|set up|configure|install|test|run|deploy|help|show|explain|tell)/i,
        // Questions
        /\?$/,
        /^(how|what|why|when|where|can you|could you|would you|should i|is there|are there)/i,
        // Requests
        /^(please|i want|i need|i'd like|i would like|i'm trying|i'm looking)/i,
        // Quote markers
        /^> /m,
        // Direct address
        /^(you|your|cursor|ai|assistant)[:\s,]/i
    ];
    
    // Check first line (most reliable)
    const matchesFirstLine = promptPatterns.some(pattern => pattern.test(firstLine));
    
    // Also check if it's a question (ends with ?)
    const isQuestion = /\?$/.test(trimmed);
    
    // Check if it's NOT obviously a response (doesn't start with response patterns)
    const notResponse = !/^(i'll|i will|i've|i have|here's|here is|to implement|let me|sure|yes|okay|alright)/i.test(firstLine);
    
    // More lenient: if it's a reasonable length and doesn't look like code/response, treat as prompt
    if (trimmed.length > 20 && trimmed.length < 5000 && notResponse && !trimmed.includes('```')) {
        // If it matches any prompt pattern, or is a question, treat as prompt
        if (matchesFirstLine || isQuestion) {
            return true;
        }
    }
    
    return matchesFirstLine || isQuestion;
}

/**
 * Check if text looks like an AI response
 */
function isAIResponse(text) {
    if (!text || text.length < 20) return false;
    
    const trimmed = text.trim();
    const firstLine = trimmed.split('\n')[0].trim();
    const lowerFirstLine = firstLine.toLowerCase();
    
    // Look for AI response indicators - be more lenient
    const responsePatterns = [
        // AI action phrases
        /^(i'll|i will|i've|i have|here's|here is|to implement|to create|to add|to fix|to update|i can|i'll help|i'll create|i'll add|i'll fix)/i,
        // Code blocks (strong indicator)
        /^```/,
        /```[\s\S]*```/,
        // Agreement phrases
        /^(sure|yes|okay|alright|absolutely|certainly|of course)/i,
        // Explanatory phrases
        /^(to do this|here's how|the way|you can|you'll need|this will)/i,
        // Technical explanations
        /^(the issue|the problem|this happens|this occurs)/i
    ];
    
    // Check first line
    const matchesFirstLine = responsePatterns.some(pattern => pattern.test(firstLine));
    
    // Check for code blocks (strong indicator of AI response)
    const hasCodeBlocks = /```/.test(trimmed);
    
    // Check if it's longer (responses are usually longer than prompts)
    const isLonger = trimmed.length > 100;
    
    // Check if it contains technical explanations
    const hasTechnicalTerms = /(function|class|import|export|const|let|var|def|return|async|await)/i.test(trimmed);
    
    // More lenient: if it has code blocks, or matches patterns, or is long with technical terms
    return matchesFirstLine || hasCodeBlocks || (isLonger && hasTechnicalTerms);
}

/**
 * Extract chat title from text or use default
 */
function extractChatTitle(text) {
    // Try to find title patterns
    const titleMatch = text.match(/^(?:title|chat|conversation)[:\s]+(.+)$/im);
    if (titleMatch) {
        return titleMatch[1].trim();
    }
    
    // Use timestamp-based title
    return `Chat ${new Date().toISOString().split('T')[0]}`;
}

// Track if clipboardy is available
let clipboardyAvailable = null;
let clipboardyModule = null;

/**
 * Initialize clipboard access
 */
function initClipboard() {
    if (clipboardyAvailable !== null) {
        return clipboardyAvailable; // Already checked
    }
    
    try {
        let clipboardy = require('clipboardy');
        
        // Handle ES module default export
        if (clipboardy.default) {
            clipboardy = clipboardy.default;
        }
        
        // clipboardy exports readSync directly
        // Check for both sync and async versions
        if (typeof clipboardy.readSync === 'function') {
            // Use sync version
            clipboardyModule = clipboardy;
            clipboardyAvailable = true;
            log('✅ Clipboard monitoring enabled (clipboardy.readSync available)');
            return true;
        } else if (typeof clipboardy.read === 'function') {
            // Use async version as fallback
            clipboardyModule = clipboardy;
            clipboardyModule.useAsync = true;
            clipboardyAvailable = true;
            log('✅ Clipboard monitoring enabled (clipboardy.read async available)');
            return true;
        } else {
            // Debug: show what we got
            const availableKeys = Object.keys(clipboardy).join(', ');
            if (DEBUG) {
                log(`clipboardy module keys: ${availableKeys}`, 'warn');
                log(`clipboardy type: ${typeof clipboardy}`, 'warn');
                if (clipboardy.default) {
                    log(`clipboardy.default keys: ${Object.keys(clipboardy.default).join(', ')}`, 'warn');
                }
            }
            throw new Error(`clipboardy.readSync/read not found. Available: ${availableKeys}`);
        }
    } catch (e) {
        clipboardyAvailable = false;
        log('⚠️  Clipboard monitoring requires clipboardy package', 'warn');
        log(`   Error: ${e.message}`, 'warn');
        log('   Install it: cd .hook && npm install clipboardy', 'warn');
        log('   Or use manual capture: node .hook/cursor-chat-hook.js --event-type ...', 'warn');
        return false;
    }
}

/**
 * Monitor clipboard for chat content
 */
async function monitorClipboard() {
    // Initialize clipboard access
    if (!initClipboard()) {
        return; // Clipboard not available
    }
    
    try {
        // Use clipboardy - support both sync and async
        let currentClipboard;
        if (clipboardyModule.useAsync) {
            // Use async version
            try {
                currentClipboard = await clipboardyModule.read();
            } catch (asyncError) {
                if (DEBUG) log(`Async read error: ${asyncError.message}`, 'error');
                return;
            }
        } else {
            // Use sync version
            currentClipboard = clipboardyModule.readSync();
        }
        
        if (!currentClipboard) {
            if (DEBUG) log('Clipboard is empty');
            return;
        }
        
        if (currentClipboard === lastClipboardContent) {
            if (DEBUG) log('Clipboard unchanged');
            return; // No change
        }
        
        // Check if it's new content
        if (currentClipboard.length < 10) {
            if (DEBUG) log(`Clipboard too short: ${currentClipboard.length} chars`);
            return; // Too short
        }
        
        // Avoid processing the same content twice
        if (currentClipboard === lastProcessedPrompt || currentClipboard === lastProcessedResponse) {
            if (DEBUG) log('Clipboard content already processed');
            return;
        }
        
        if (DEBUG) {
            log(`📋 Clipboard changed (${currentClipboard.length} chars): ${currentClipboard.substring(0, 50)}...`);
        }
        
        lastClipboardContent = currentClipboard;
        
        // Determine if it's a prompt or response
        const isPrompt = isChatPrompt(currentClipboard);
        const isResponse = isAIResponse(currentClipboard);
        
        if (DEBUG) {
            log(`   Detected as: ${isPrompt ? 'PROMPT' : isResponse ? 'RESPONSE' : 'UNKNOWN'}`);
        }
        
        if (isPrompt) {
            const chatTitle = extractChatTitle(currentClipboard);
            const promptText = currentClipboard.trim();
            
            // Avoid duplicate prompts
            if (promptText !== lastProcessedPrompt) {
                log(`📝 Detected prompt: ${promptText.substring(0, 50)}...`);
                
                const event = {
                    eventType: 'beforeSubmitPrompt',
                    chatTitle: chatTitle,
                    userPrompt: promptText,
                    affectedFiles: [],
                    status: 'in-progress',
                    timestamp: new Date().toISOString()
                };
                
                writeEvent(workspaceRoot, event);
                lastProcessedPrompt = promptText;
                
                // Store as pending
                pendingPrompts.set(chatTitle, {
                    prompt: promptText,
                    timestamp: event.timestamp
                });
                
                log(`✅ Prompt event written to .cursor-hooks/`);
            }
        } else if (isResponse) {
            const chatTitle = extractChatTitle(currentClipboard);
            const responseText = currentClipboard.trim();
            
            // Avoid duplicate responses
            if (responseText !== lastProcessedResponse) {
                log(`🤖 Detected response: ${responseText.substring(0, 50)}...`);
                
                // Try to find matching prompt
                const pendingPrompt = pendingPrompts.get(chatTitle);
                
                const event = {
                    eventType: 'afterAgentResponse',
                    chatTitle: chatTitle,
                    userPrompt: pendingPrompt ? pendingPrompt.prompt : '',
                    aiResponse: responseText,
                    affectedFiles: extractFilesFromResponse(responseText),
                    status: 'completed',
                    timestamp: new Date().toISOString()
                };
                
                writeEvent(workspaceRoot, event);
                lastProcessedResponse = responseText;
                
                // Remove from pending
                if (pendingPrompt) {
                    pendingPrompts.delete(chatTitle);
                }
                
                log(`✅ Response event written to .cursor-hooks/`);
            }
        } else if (DEBUG) {
            log(`   Content doesn't match prompt or response patterns`);
        }
    } catch (error) {
        log(`❌ Error monitoring clipboard: ${error.message}`, 'error');
        if (DEBUG) {
            log(`   Stack: ${error.stack}`, 'error');
        }
    }
}

/**
 * Extract file paths from response text
 */
function extractFilesFromResponse(text) {
    const files = [];
    
    // Look for file patterns
    const filePatterns = [
        /(?:created|modified|updated|added|changed)\s+(?:file|files)?[:\s]+([^\s\n]+\.(ts|tsx|js|jsx|py|java|cpp|c|h|css|html|json|md|yml|yaml))/gi,
        /`([^\s`]+\.(ts|tsx|js|jsx|py|java|cpp|c|h|css|html|json|md|yml|yaml))`/g,
        /([a-zA-Z0-9_\-/]+\.(ts|tsx|js|jsx|py|java|cpp|c|h|css|html|json|md|yml|yaml))/g
    ];
    
    for (const pattern of filePatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const filePath = match[1] || match[0];
            if (filePath && !files.includes(filePath)) {
                files.push(filePath);
            }
        }
    }
    
    return files.slice(0, 10); // Limit to 10 files
}

/**
 * Monitor Cursor chat files (if they exist)
 */
function monitorChatFiles() {
    const possibleChatPaths = [
        path.join(workspaceRoot, '.cursor', 'chat'),
        path.join(workspaceRoot, '.vscode', 'chat'),
        path.join(process.env.HOME || process.env.USERPROFILE, '.cursor', 'chat'),
        path.join(process.env.APPDATA || process.env.HOME, 'Cursor', 'chat')
    ];
    
    for (const chatPath of possibleChatPaths) {
        if (fs.existsSync(chatPath)) {
            log(`👀 Monitoring chat directory: ${chatPath}`);
            
            // Watch for new files
            try {
                fs.watch(chatPath, { recursive: true }, (eventType, filename) => {
                    if (filename && filename.endsWith('.json')) {
                        setTimeout(() => {
                            try {
                                const filePath = path.join(chatPath, filename);
                                if (fs.existsSync(filePath)) {
                                    const content = fs.readFileSync(filePath, 'utf8');
                                    const data = JSON.parse(content);
                                    
                                    processChatFile(data, filePath);
                                }
                            } catch (error) {
                                if (DEBUG) {
                                    log(`Error processing chat file: ${error.message}`, 'error');
                                }
                            }
                        }, 100);
                    }
                });
                
                return true; // Successfully started monitoring
            } catch (error) {
                if (DEBUG) {
                    log(`Error watching chat directory: ${error.message}`, 'warn');
                }
            }
        }
    }
    
    return false;
}

/**
 * Process chat file data
 */
function processChatFile(data, sourceFile) {
    const hasPrompt = data.prompt || data.userPrompt || data.user_input || data.message;
    const hasResponse = data.response || data.aiResponse || data.agentResponse;
    
    if (hasPrompt && !hasResponse) {
        const event = {
            eventType: 'beforeSubmitPrompt',
            chatTitle: data.chatTitle || data.title || extractChatTitle(sourceFile),
            userPrompt: data.prompt || data.userPrompt || data.user_input || data.message || '',
            affectedFiles: data.affectedFiles || data.files || [],
            status: 'in-progress',
            timestamp: data.timestamp || new Date().toISOString(),
            metadata: { sourceFile, ...data }
        };
        
        writeEvent(workspaceRoot, event);
    } else if (hasResponse) {
        const event = {
            eventType: 'afterAgentResponse',
            chatTitle: data.chatTitle || data.title || extractChatTitle(sourceFile),
            userPrompt: data.prompt || data.userPrompt || data.user_input || '',
            aiResponse: data.response || data.aiResponse || data.agentResponse,
            affectedFiles: data.affectedFiles || data.files || extractFilesFromResponse(data.response || ''),
            status: data.status || 'completed',
            timestamp: data.timestamp || new Date().toISOString(),
            metadata: { sourceFile, ...data }
        };
        
        writeEvent(workspaceRoot, event);
    }
}

/**
 * Main monitoring loop
 */
function startMonitoring() {
    log('🚀 Starting Cursor Chat Auto-Detector...');
    log(`📁 Workspace: ${workspaceRoot}`);
    log(`⏱️  Check interval: ${CHECK_INTERVAL}ms`);
    log('');
    
    // Try to monitor chat files first
    const fileMonitoringActive = monitorChatFiles();
    
    // Initialize clipboard
    const clipboardAvailable = initClipboard();
    
    if (!fileMonitoringActive && !clipboardAvailable) {
        log('❌ No monitoring methods available!', 'error');
        log('');
        log('📋 To enable clipboard monitoring:');
        log('   1. cd .hook');
        log('   2. npm install clipboardy');
        log('   3. Restart the auto-detector');
        log('');
        log('💡 Alternative: Use manual capture:');
        log('   node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "..."');
        log('');
        return;
    }
    
    if (!fileMonitoringActive) {
        log('⚠️  Chat file monitoring not available, using clipboard monitoring');
    }
    
    // Start clipboard monitoring
    if (clipboardAvailable) {
        log('✅ Clipboard monitoring active');
        log('   Waiting for clipboard changes...');
        log('');
        log('💡 Usage:');
        log('   1. Type your prompt in Cursor chat');
        log('   2. Select and copy it (Ctrl+C / Cmd+C)');
        log('   3. Send the prompt');
        log('   4. When AI responds, copy the response');
        log('   5. Hook will automatically detect and capture both!');
        log('');
        
        setInterval(() => {
            monitorClipboard();
        }, CHECK_INTERVAL);
    }
    
    log('✅ Auto-detector is running. Press Ctrl+C to stop.');
    log('');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('\n👋 Stopping auto-detector...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('\n👋 Stopping auto-detector...');
    process.exit(0);
});

// Start monitoring
if (require.main === module) {
    startMonitoring();
}

module.exports = { startMonitoring, monitorClipboard, monitorChatFiles };

