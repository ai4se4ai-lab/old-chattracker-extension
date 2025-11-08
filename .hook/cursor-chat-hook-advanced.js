#!/usr/bin/env node

/**
 * Advanced Cursor Chat Hook
 * 
 * This hook attempts to integrate with VS Code/Cursor's chat API if available,
 * and provides multiple fallback methods for capturing chat events.
 */

const fs = require('fs');
const path = require('path');
const { writeEvent, getWorkspaceRoot } = require('./cursor-chat-hook.js');

/**
 * Try to access VS Code/Cursor chat API
 */
async function tryAccessChatAPI() {
    // This would require running in VS Code extension context
    // For standalone hook, we'll use file-based or HTTP methods instead
    console.log('📡 Direct API access requires extension context');
    console.log('   Using file-based or HTTP methods instead');
}

/**
 * Monitor VS Code chat panel via file system
 * Cursor may write chat content to temporary files
 */
function monitorChatFiles(workspaceRoot) {
    const possibleChatPaths = [
        path.join(workspaceRoot, '.cursor', 'chat'),
        path.join(workspaceRoot, '.vscode', 'chat'),
        path.join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'cursor-chat')
    ];
    
    for (const chatPath of possibleChatPaths) {
        if (fs.existsSync(chatPath)) {
            console.log(`👀 Monitoring chat directory: ${chatPath}`);
            
            // Watch for new files
            fs.watch(chatPath, { recursive: true }, (eventType, filename) => {
                if (eventType === 'rename' && filename.endsWith('.json')) {
                    const filePath = path.join(chatPath, filename);
                    
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(filePath)) {
                                const content = fs.readFileSync(filePath, 'utf8');
                                const data = JSON.parse(content);
                                
                                processChatData(workspaceRoot, data, filePath);
                            }
                        } catch (error) {
                            console.error(`Error processing chat file: ${error.message}`);
                        }
                    }, 100); // Small delay to ensure file is fully written
                }
            });
            
            return true;
        }
    }
    
    return false;
}

/**
 * Process chat data and create events
 */
function processChatData(workspaceRoot, data, sourceFile) {
    // Detect if this is a prompt or response
    const hasPrompt = data.prompt || data.userPrompt || data.user_input || data.message;
    const hasResponse = data.response || data.aiResponse || data.agentResponse || data.assistantResponse;
    
    if (hasPrompt && !hasResponse) {
        // This is a prompt event
        const event = {
            eventType: 'beforeSubmitPrompt',
            chatTitle: data.chatTitle || data.title || extractChatTitle(sourceFile),
            userPrompt: data.prompt || data.userPrompt || data.user_input || data.message || '',
            affectedFiles: data.affectedFiles || data.files || data.modifiedFiles || [],
            status: 'in-progress',
            timestamp: data.timestamp || new Date().toISOString(),
            metadata: { sourceFile, ...data }
        };
        
        writeEvent(workspaceRoot, event);
    } else if (hasResponse) {
        // This is a response event
        const event = {
            eventType: 'afterAgentResponse',
            chatTitle: data.chatTitle || data.title || extractChatTitle(sourceFile),
            userPrompt: data.prompt || data.userPrompt || data.user_input || '',
            aiResponse: data.response || data.aiResponse || data.agentResponse || data.assistantResponse,
            affectedFiles: data.affectedFiles || data.files || data.modifiedFiles || [],
            status: data.status || 'completed',
            timestamp: data.timestamp || new Date().toISOString(),
            metadata: { sourceFile, ...data }
        };
        
        writeEvent(workspaceRoot, event);
    }
}

/**
 * Extract chat title from filename or content
 */
function extractChatTitle(filePath) {
    const basename = path.basename(filePath, path.extname(filePath));
    
    // Try to extract meaningful title from filename
    if (basename.includes('chat')) {
        return basename.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    return `Chat ${new Date().toISOString()}`;
}

/**
 * Create a polling mechanism to check for chat content
 */
function pollForChatContent(workspaceRoot, intervalMs = 2000) {
    console.log(`🔄 Starting polling mechanism (interval: ${intervalMs}ms)`);
    
    // This would check various sources for chat content
    // Customize based on your Cursor setup
    
    setInterval(() => {
        // Check clipboard (if clipboardy is available)
        try {
            const clipboardy = require('clipboardy');
            const clipboard = clipboardy.readSync();
            
            if (isNewChatContent(clipboard)) {
                const event = parseChatFromText(clipboard);
                if (event) {
                    writeEvent(workspaceRoot, event);
                }
            }
        } catch (e) {
            // Clipboard monitoring not available
        }
        
        // Check for chat files in common locations
        checkCommonChatLocations(workspaceRoot);
        
    }, intervalMs);
}

/**
 * Check if clipboard content is new chat content
 */
let lastClipboardHash = '';
function isNewChatContent(text) {
    if (!text || text.length < 10) return false;
    
    const hash = require('crypto').createHash('md5').update(text).digest('hex');
    if (hash === lastClipboardHash) return false;
    
    lastClipboardHash = hash;
    
    // Check if it looks like chat content
    return /(user|prompt|assistant|ai|response|cursor)[:\s]/i.test(text) ||
           /^> /m.test(text) ||
           /```/.test(text);
}

/**
 * Parse chat content from text
 */
function parseChatFromText(text) {
    const lines = text.split('\n');
    let userPrompt = '';
    let aiResponse = '';
    let currentSection = null;
    let chatTitle = `Chat ${new Date().toISOString()}`;
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Detect user prompt
        if (/^(user|prompt|you|i want|i need|question|request):/i.test(trimmed)) {
            currentSection = 'user';
            userPrompt = trimmed.replace(/^(user|prompt|you|i want|i need|question|request):\s*/i, '');
        }
        // Detect AI response
        else if (/^(assistant|ai|response|cursor|bot):/i.test(trimmed)) {
            currentSection = 'ai';
            aiResponse = trimmed.replace(/^(assistant|ai|response|cursor|bot):\s*/i, '');
        }
        // Detect chat title
        else if (/^title[:\s]/i.test(trimmed)) {
            chatTitle = trimmed.replace(/^title[:\s]+/i, '');
        }
        // Continue current section
        else if (currentSection === 'user' && trimmed) {
            userPrompt += '\n' + trimmed;
        } else if (currentSection === 'ai' && trimmed) {
            aiResponse += '\n' + trimmed;
        }
    }
    
    if (!userPrompt && !aiResponse) return null;
    
    return {
        eventType: aiResponse ? 'afterAgentResponse' : 'beforeSubmitPrompt',
        chatTitle,
        userPrompt: userPrompt.trim(),
        aiResponse: aiResponse ? aiResponse.trim() : undefined,
        status: aiResponse ? 'completed' : 'in-progress',
        timestamp: new Date().toISOString()
    };
}

/**
 * Check common chat file locations
 */
function checkCommonChatLocations(workspaceRoot) {
    const locations = [
        path.join(workspaceRoot, '.cursor', 'chat', '*.json'),
        path.join(workspaceRoot, '.vscode', 'chat', '*.json'),
        path.join(process.env.HOME || process.env.USERPROFILE, '.cursor', 'chat', '*.json')
    ];
    
    // This would use glob pattern matching in production
    // For now, just check if directories exist
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);
    const workspaceRoot = getWorkspaceRoot();
    const mode = args[0] || 'monitor';
    
    console.log('🚀 Advanced Cursor Chat Hook');
    console.log(`📁 Workspace: ${workspaceRoot}`);
    console.log(`🔧 Mode: ${mode}\n`);
    
    switch (mode) {
        case 'monitor':
            // Try multiple monitoring methods
            if (!monitorChatFiles(workspaceRoot)) {
                console.log('⚠️  Chat file monitoring not available');
                console.log('   Starting polling mechanism instead...\n');
                pollForChatContent(workspaceRoot);
            }
            break;
            
        case 'poll':
            pollForChatContent(workspaceRoot, parseInt(args[1]) || 2000);
            break;
            
        case 'api':
            tryAccessChatAPI();
            break;
            
        default:
            console.log('Available modes:');
            console.log('  node cursor-chat-hook-advanced.js monitor  - Monitor chat files');
            console.log('  node cursor-chat-hook-advanced.js poll     - Poll for chat content');
            console.log('  node cursor-chat-hook-advanced.js api      - Try API access');
    }
    
    // Keep process running
    if (mode !== 'api') {
        console.log('\n✅ Hook is running. Press Ctrl+C to stop.');
        process.on('SIGINT', () => {
            console.log('\n👋 Stopping hook...');
            process.exit(0);
        });
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    monitorChatFiles,
    pollForChatContent,
    tryAccessChatAPI,
    processChatData
};

