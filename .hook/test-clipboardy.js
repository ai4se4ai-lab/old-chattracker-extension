#!/usr/bin/env node

/**
 * Test clipboardy installation and API
 */

console.log('🧪 Testing clipboardy...\n');

try {
    let clipboardy = require('clipboardy');
    
    console.log('✅ clipboardy module loaded');
    console.log(`   Type: ${typeof clipboardy}`);
    console.log(`   Keys: ${Object.keys(clipboardy).join(', ')}`);
    console.log('');
    
    // Handle ES module default export
    if (clipboardy.default) {
        console.log('📦 Found default export, checking...');
        console.log(`   default type: ${typeof clipboardy.default}`);
        console.log(`   default keys: ${Object.keys(clipboardy.default).join(', ')}`);
        clipboardy = clipboardy.default;
        console.log('');
    }
    
    // Check for readSync
    if (typeof clipboardy.readSync === 'function') {
        console.log('✅ clipboardy.readSync is available');
        try {
            const content = clipboardy.readSync();
            console.log(`✅ Clipboard read successful (${content.length} chars)`);
            console.log(`   Preview: ${content.substring(0, 50)}...`);
        } catch (error) {
            console.log(`⚠️  Error reading clipboard: ${error.message}`);
        }
    } else {
        console.log('❌ clipboardy.readSync is not a function');
        console.log(`   Available methods: ${Object.keys(clipboardy).join(', ')}`);
    }
    
    // Check for read (async)
    if (typeof clipboardy.read === 'function') {
        console.log('✅ clipboardy.read (async) is available');
        try {
            clipboardy.read().then(content => {
                console.log(`✅ Async clipboard read successful (${content.length} chars)`);
            }).catch(err => {
                console.log(`⚠️  Async read error: ${err.message}`);
            });
        } catch (error) {
            console.log(`⚠️  Error with async read: ${error.message}`);
        }
    }
    
} catch (error) {
    console.log('❌ Failed to load clipboardy');
    console.log(`   Error: ${error.message}`);
    console.log('');
    console.log('💡 Install it:');
    console.log('   cd .hook');
    console.log('   npm install clipboardy');
}

