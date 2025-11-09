import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

/**
 * Hook Installer
 * 
 * Installs hook files from extension to user's project .hook directory
 */
export class HookInstaller {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Install hook files to project
     */
    public async installHooks(overwrite: boolean = false): Promise<{ success: boolean; filesInstalled: number; errors: string[] }> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        if (!workspaceRoot) {
            throw new Error('No workspace folder found. Please open a workspace first.');
        }

        const extensionPath = this.context.extensionPath;
        const sourceHookDir = path.join(extensionPath, '.hook');
        const targetHookDir = path.join(workspaceRoot, '.hook');

        // Check if source directory exists
        if (!fs.existsSync(sourceHookDir)) {
            throw new Error(`Hook files not found in extension. Expected: ${sourceHookDir}`);
        }

        const result = {
            success: true,
            filesInstalled: 0,
            errors: [] as string[]
        };

        try {
            // Create target directory
            if (!fs.existsSync(targetHookDir)) {
                fs.mkdirSync(targetHookDir, { recursive: true });
                Logger.log(`📁 Created directory: ${targetHookDir}`);
            }

            // Get list of files to copy
            const filesToCopy = this.getHookFiles(sourceHookDir);

            Logger.log(`\n📦 Installing ${filesToCopy.length} hook file(s) to: ${targetHookDir}`);

            // Copy each file
            for (const file of filesToCopy) {
                try {
                    const sourcePath = path.join(sourceHookDir, file);
                    const targetPath = path.join(targetHookDir, file);

                    // Check if file already exists
                    if (fs.existsSync(targetPath) && !overwrite) {
                        Logger.log(`⏭️  Skipping (already exists): ${file}`);
                        continue;
                    }

                    // Read source file
                    const content = fs.readFileSync(sourcePath, 'utf8');

                    // Write to target
                    fs.writeFileSync(targetPath, content, 'utf8');

                    // Make executable on Unix systems (for .js and .sh files)
                    if (process.platform !== 'win32' && (file.endsWith('.js') || file.endsWith('.sh'))) {
                        try {
                            fs.chmodSync(targetPath, 0o755);
                        } catch (chmodError) {
                            // chmod might fail on some systems, but that's okay
                            Logger.warn(`Could not set executable permission for ${file}`);
                        }
                    }

                    result.filesInstalled++;
                    Logger.log(`✅ Installed: ${file}`);
                } catch (error: any) {
                    const errorMsg = `Failed to install ${file}: ${error.message}`;
                    Logger.error(errorMsg);
                    result.errors.push(errorMsg);
                    result.success = false;
                }
            }

            // Also ensure .cursor-hooks directory exists
            const cursorHooksDir = path.join(workspaceRoot, '.cursor-hooks');
            if (!fs.existsSync(cursorHooksDir)) {
                fs.mkdirSync(cursorHooksDir, { recursive: true });
                Logger.log(`📁 Created directory: ${cursorHooksDir}`);
            }

            Logger.log(`\n✅ Hook installation complete! ${result.filesInstalled} file(s) installed.`);

            if (result.errors.length > 0) {
                Logger.warn(`⚠️  ${result.errors.length} error(s) occurred during installation.`);
            }

        } catch (error: any) {
            const errorMsg = `Installation failed: ${error.message}`;
            Logger.error(errorMsg);
            result.success = false;
            result.errors.push(errorMsg);
        }

        return result;
    }

    /**
     * Get instructions for starting auto-detector
     */
    public getAutoDetectorInstructions(): string {
        return `To start automatic chat capture:

1. Start the auto-detector:
   bash .hook/start-auto-detector.sh

2. Use Cursor chat normally:
   - Type your prompt
   - Copy to clipboard (Ctrl+C) before sending
   - When AI responds, copy response to clipboard
   - Hook automatically detects and captures both!

3. Stop when done:
   bash .hook/stop-auto-detector.sh

View logs: tail -f .hook/auto-detector.log`;
    }

    /**
     * Get list of hook files to copy
     */
    private getHookFiles(hookDir: string): string[] {
        const files: string[] = [];
        
        try {
            const entries = fs.readdirSync(hookDir, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile()) {
                    // Include all files except node_modules and .git
                    if (!entry.name.startsWith('.') && 
                        entry.name !== 'node_modules' &&
                        !entry.name.endsWith('.log')) {
                        files.push(entry.name);
                    }
                }
            }
        } catch (error: any) {
            Logger.error(`Failed to read hook directory: ${error.message}`);
        }

        return files;
    }

    /**
     * Check if hooks are already installed
     */
    public areHooksInstalled(): boolean {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return false;

        const targetHookDir = path.join(workspaceRoot, '.hook');
        if (!fs.existsSync(targetHookDir)) return false;

        // Check if at least one hook file exists
        try {
            const files = fs.readdirSync(targetHookDir);
            return files.some(f => f.endsWith('.js') || f.endsWith('.sh') || f.endsWith('.md'));
        } catch {
            return false;
        }
    }

    /**
     * Get list of installed hook files
     */
    public getInstalledHooks(): string[] {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return [];

        const targetHookDir = path.join(workspaceRoot, '.hook');
        if (!fs.existsSync(targetHookDir)) return [];

        try {
            return fs.readdirSync(targetHookDir).filter(f => {
                const stat = fs.statSync(path.join(targetHookDir, f));
                return stat.isFile();
            });
        } catch {
            return [];
        }
    }
}

