/**
 * Example Integration Script
 * 
 * This script demonstrates how to integrate the hook with various Cursor event sources.
 * Customize based on your specific Cursor setup.
 */

const { writeEvent, getWorkspaceRoot } = require('./cursor-chat-hook.js');
const fs = require('fs');
const path = require('path');

/**
 * Example 1: Capture from Cursor's internal API (if available)
 */
function captureFromCursorAPI() {
    // This is a placeholder - actual implementation depends on Cursor's API
    // You would need to check Cursor's extension API documentation
    
    console.log('📡 Cursor API integration not available');
    console.log('   Check Cursor documentation for extension API access');
}

/**
 * Example 2: Monitor clipboard for chat content
 */
function captureFromClipboard() {
    // Requires a clipboard library like 'clipboardy' or 'node-clipboard'
    // npm install clipboardy
    
    try {
        const clipboardy = require('clipboardy');
        const workspaceRoot = getWorkspaceRoot();
        
        let lastClipboard = '';
        
        setInterval(() => {
            const current = clipboardy.readSync();
            
            if (current !== lastClipboard && isChatContent(current)) {
                const event = parseChatFromClipboard(current);
                writeEvent(workspaceRoot, event);
                lastClipboard = current;
            }
        }, 2000);
        
        console.log('📋 Clipboard monitoring started');
    } catch (error) {
        console.error('❌ Clipboard monitoring requires clipboardy package');
        console.log('   Install: npm install clipboardy');
    }
}

/**
 * Example 3: Monitor Cursor's log files
 */
function captureFromLogFiles() {
    const workspaceRoot = getWorkspaceRoot();
    
    // Common Cursor log locations (adjust as needed)
    const possibleLogPaths = [
        path.join(process.env.HOME || process.env.USERPROFILE, '.cursor', 'logs', 'main.log'),
        path.join(process.env.APPDATA || process.env.HOME, 'Cursor', 'logs', 'main.log'),
        path.join(process.env.LOCALAPPDATA, 'Cursor', 'logs', 'main.log')
    ];
    
    for (const logPath of possibleLogPaths) {
        if (fs.existsSync(logPath)) {
            console.log(`👀 Monitoring log file: ${logPath}`);
            
            // Watch for changes
            fs.watchFile(logPath, { interval: 2000 }, (curr, prev) => {
                if (curr.mtime > prev.mtime) {
                    try {
                        const content = fs.readFileSync(logPath, 'utf8');
                        const events = extractChatEvents(content);
                        
                        events.forEach(event => {
                            writeEvent(workspaceRoot, event);
                        });
                    } catch (error) {
                        console.error(`Error reading log: ${error.message}`);
                    }
                }
            });
            
            return;
        }
    }
    
    console.log('⚠️  No Cursor log files found in common locations');
}

/**
 * Example 4: HTTP Server to receive events
 */
function createHTTPServer() {
    const http = require('http');
    const workspaceRoot = getWorkspaceRoot();
    
    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/hook') {
            let body = '';
            
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', () => {
                try {
                    const event = JSON.parse(body);
                    writeEvent(workspaceRoot, event);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    
    const port = 8765;
    server.listen(port, () => {
        console.log(`🌐 HTTP hook server listening on port ${port}`);
        console.log(`   Send POST requests to http://localhost:${port}/hook`);
    });
}

/**
 * Helper: Check if content looks like chat
 */
function isChatContent(text) {
    if (!text || text.length < 10) return false;
    
    // Look for chat indicators
    const chatIndicators = [
        /user[:\s]/i,
        /assistant[:\s]/i,
        /ai[:\s]/i,
        /prompt[:\s]/i,
        /response[:\s]/i,
        /^> /m,
        /```/
    ];
    
    return chatIndicators.some(pattern => pattern.test(text));
}

/**
 * Helper: Parse chat content from clipboard
 */
function parseChatFromClipboard(text) {
    // Simple parsing - customize based on your needs
    const lines = text.split('\n');
    let userPrompt = '';
    let aiResponse = '';
    let currentSection = null;
    
    for (const line of lines) {
        if (/^(user|prompt|you|i want|i need):/i.test(line)) {
            currentSection = 'user';
            userPrompt = line.replace(/^(user|prompt|you|i want|i need):\s*/i, '');
        } else if (/^(assistant|ai|response|cursor):/i.test(line)) {
            currentSection = 'ai';
            aiResponse = line.replace(/^(assistant|ai|response|cursor):\s*/i, '');
        } else if (currentSection === 'user') {
            userPrompt += '\n' + line;
        } else if (currentSection === 'ai') {
            aiResponse += '\n' + line;
        }
    }
    
    return {
        eventType: aiResponse ? 'afterAgentResponse' : 'beforeSubmitPrompt',
        userPrompt: userPrompt.trim(),
        aiResponse: aiResponse ? aiResponse.trim() : undefined,
        chatTitle: `Chat ${new Date().toISOString()}`,
        status: aiResponse ? 'completed' : 'in-progress',
        timestamp: new Date().toISOString()
    };
}

/**
 * Helper: Extract chat events from log content
 */
function extractChatEvents(logContent) {
    const events = [];
    const lines = logContent.split('\n');
    
    // Look for chat-related log entries
    // This is a simplified example - customize based on actual log format
    for (const line of lines) {
        if (line.includes('chat') || line.includes('prompt') || line.includes('response')) {
            try {
                // Try to parse as JSON
                const jsonMatch = line.match(/\{.*\}/);
                if (jsonMatch) {
                    const data = JSON.parse(jsonMatch[0]);
                    if (data.prompt || data.response) {
                        events.push({
                            eventType: data.response ? 'afterAgentResponse' : 'beforeSubmitPrompt',
                            userPrompt: data.prompt || '',
                            aiResponse: data.response,
                            chatTitle: data.title || `Chat ${new Date().toISOString()}`,
                            status: data.status || 'in-progress',
                            timestamp: data.timestamp || new Date().toISOString()
                        });
                    }
                }
            } catch (e) {
                // Not JSON, skip
            }
        }
    }
    
    return events;
}

// Main execution
if (require.main === module) {
    const method = process.argv[2] || 'http';
    
    console.log('🚀 Starting Cursor Chat Hook Integration');
    console.log(`   Method: ${method}\n`);
    
    switch (method) {
        case 'clipboard':
            captureFromClipboard();
            break;
        case 'logs':
            captureFromLogFiles();
            break;
        case 'http':
            createHTTPServer();
            break;
        case 'api':
            captureFromCursorAPI();
            break;
        default:
            console.log('Available methods:');
            console.log('  node example-integration.js http     - HTTP server');
            console.log('  node example-integration.js clipboard - Clipboard monitoring');
            console.log('  node example-integration.js logs     - Log file monitoring');
            console.log('  node example-integration.js api      - Cursor API (placeholder)');
    }
}

module.exports = {
    captureFromClipboard,
    captureFromLogFiles,
    createHTTPServer,
    captureFromCursorAPI
};

