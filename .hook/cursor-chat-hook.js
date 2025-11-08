#!/usr/bin/env node

/**
 * Cursor Chat Hook
 * 
 * This hook captures user prompts and AI responses from Cursor's chat interface
 * and writes them to .cursor-hooks/ directory for the TrackChat extension to process.
 * 
 * Usage:
 *   1. Place this file in .hook/ directory in your project root
 *   2. Make it executable: chmod +x .hook/cursor-chat-hook.js
 *   3. Configure Cursor to run this hook (see README.md)
 * 
 * Or run manually:
 *   node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Your prompt"
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const HOOKS_OUTPUT_DIR = '.cursor-hooks';
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

/**
 * Get workspace root directory
 */
function getWorkspaceRoot() {
    // Try to find workspace root by looking for common markers
    let currentDir = process.cwd();
    
    // Look for .git, package.json, or .vscode
    const markers = ['.git', 'package.json', '.vscode', 'tsconfig.json', 'pyproject.toml'];
    
    for (let i = 0; i < 10; i++) { // Max 10 levels up
        for (const marker of markers) {
            if (fs.existsSync(path.join(currentDir, marker))) {
                return currentDir;
            }
        }
        const parent = path.dirname(currentDir);
        if (parent === currentDir) break; // Reached root
        currentDir = parent;
    }
    
    // Fallback to current directory
    return process.cwd();
}

/**
 * Ensure output directory exists
 */
function ensureOutputDirectory(workspaceRoot) {
    const outputPath = path.join(workspaceRoot, HOOKS_OUTPUT_DIR);
    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
        if (DEBUG) console.log(`Created output directory: ${outputPath}`);
    }
    return outputPath;
}

/**
 * Write event to file
 */
function writeEvent(workspaceRoot, event) {
    const outputDir = ensureOutputDirectory(workspaceRoot);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const eventId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const filename = `event_${eventId}.json`;
    const filepath = path.join(outputDir, filename);
    
    // Ensure event has required fields
    const normalizedEvent = {
        eventType: event.eventType || 'beforeSubmitPrompt',
        timestamp: event.timestamp || new Date().toISOString(),
        ...event
    };
    
    fs.writeFileSync(filepath, JSON.stringify(normalizedEvent, null, 2), 'utf8');
    
    if (DEBUG) {
        console.log(`✅ Event written: ${filepath}`);
        console.log(`   Event Type: ${normalizedEvent.eventType}`);
        console.log(`   Chat Title: ${normalizedEvent.chatTitle || 'N/A'}`);
        console.log(`   User Prompt: ${(normalizedEvent.userPrompt || normalizedEvent.prompt || '').substring(0, 50)}...`);
    } else {
        console.log(`✅ Event captured: ${normalizedEvent.eventType}`);
    }
    
    return filepath;
}

/**
 * Capture event from command line arguments
 */
function captureFromArgs() {
    const args = process.argv.slice(2);
    const workspaceRoot = getWorkspaceRoot();
    
    // Parse arguments
    const event = {};
    let currentKey = null;
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg.startsWith('--')) {
            currentKey = arg.substring(2);
            // Handle boolean flags
            if (['debug', 'verbose'].includes(currentKey)) {
                event[currentKey] = true;
                currentKey = null;
            }
        } else if (currentKey) {
            // Handle key-value pairs
            if (currentKey === 'affectedFiles' || currentKey === 'files') {
                event[currentKey] = arg.split(',').map(f => f.trim());
            } else {
                event[currentKey] = arg;
            }
            currentKey = null;
        }
    }
    
    // Map common field names
    if (event.prompt && !event.userPrompt) {
        event.userPrompt = event.prompt;
    }
    if (event.response && !event.aiResponse) {
        event.aiResponse = event.response;
    }
    if (event.title && !event.chatTitle) {
        event.chatTitle = event.title;
    }
    
    if (!event.eventType) {
        event.eventType = event.aiResponse ? 'afterAgentResponse' : 'beforeSubmitPrompt';
    }
    
    if (Object.keys(event).length === 0) {
        console.error('❌ No event data provided');
        console.log('\nUsage:');
        console.log('  node .hook/cursor-chat-hook.js --event-type beforeSubmitPrompt --prompt "Your prompt"');
        console.log('  node .hook/cursor-chat-hook.js --event-type afterAgentResponse --response "AI response" --prompt "Original prompt"');
        process.exit(1);
    }
    
    writeEvent(workspaceRoot, event);
}

/**
 * Monitor clipboard for chat content (fallback method)
 */
function monitorClipboard(workspaceRoot) {
    // This is a simplified version - in production, you'd use a clipboard library
    console.log('📋 Clipboard monitoring not implemented in this version');
    console.log('   Use command-line arguments or file-based input instead');
}

/**
 * Monitor file for events (if Cursor writes to a file)
 */
function monitorFile(workspaceRoot, filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }
    
    console.log(`👀 Monitoring file: ${filePath}`);
    
    // Watch for changes
    fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(content);
                
                // Determine event type based on content
                let eventType = 'beforeSubmitPrompt';
                if (data.response || data.aiResponse || data.agentResponse) {
                    eventType = 'afterAgentResponse';
                }
                
                const event = {
                    eventType: data.eventType || eventType,
                    chatTitle: data.chatTitle || data.title || `Chat ${new Date().toISOString()}`,
                    userPrompt: data.userPrompt || data.prompt || data.user_input || '',
                    aiResponse: data.aiResponse || data.response || data.agentResponse,
                    affectedFiles: data.affectedFiles || data.files || data.modifiedFiles || [],
                    status: data.status || 'in-progress',
                    timestamp: data.timestamp || new Date().toISOString(),
                    metadata: data
                };
                
                writeEvent(workspaceRoot, event);
            } catch (error) {
                console.error(`❌ Error processing file: ${error.message}`);
            }
        }
    });
}

/**
 * Main entry point
 */
function main() {
    const args = process.argv.slice(2);
    const workspaceRoot = getWorkspaceRoot();
    
    if (DEBUG) {
        console.log(`🔧 Debug mode enabled`);
        console.log(`📁 Workspace root: ${workspaceRoot}`);
    }
    
    // Check for file monitoring mode
    if (args[0] === '--monitor-file' && args[1]) {
        monitorFile(workspaceRoot, args[1]);
        return;
    }
    
    // Check for clipboard monitoring mode
    if (args[0] === '--monitor-clipboard') {
        monitorClipboard(workspaceRoot);
        return;
    }
    
    // Default: capture from command line arguments
    captureFromArgs();
}

// Run if executed directly
if (require.main === module) {
    main();
}

module.exports = { writeEvent, getWorkspaceRoot, ensureOutputDirectory };

