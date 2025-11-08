import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * MCP Server Integration
 * 
 * Note: MCP (Model Context Protocol) Extension API may not be available in all VS Code versions.
 * This module provides optional integration with MCP servers for advanced conversation capture.
 */
export class MCPIntegration {
    private static isAvailable: boolean | null = null;
    private static registeredServers: Set<string> = new Set();

    /**
     * Check if MCP Extension API is available
     */
    public static async checkAvailability(): Promise<boolean> {
        if (this.isAvailable !== null) {
            return this.isAvailable;
        }

        try {
            // Check if cursor.mcp API is available
            // Note: This API might not exist in standard VS Code
            if ((vscode as any).cursor?.mcp) {
                this.isAvailable = true;
                Logger.log('✅ MCP Extension API is available');
                return true;
            }
            
            this.isAvailable = false;
            Logger.log('ℹ️  MCP Extension API is not available (this is normal in standard VS Code)');
            return false;
        } catch (error) {
            this.isAvailable = false;
            Logger.log('ℹ️  MCP Extension API check failed (this is normal in standard VS Code)');
            return false;
        }
    }

    /**
     * Register an MCP server for conversation capture
     * 
     * @param name Unique name for the server
     * @param serverConfig Server configuration
     */
    public static async registerServer(
        name: string,
        serverConfig: {
            url?: string;
            headers?: { [key: string]: string };
            command?: string;
            args?: string[];
        }
    ): Promise<boolean> {
        if (this.registeredServers.has(name)) {
            Logger.warn(`⚠️  MCP server "${name}" is already registered`);
            return false;
        }

        const isAvailable = await this.checkAvailability();
        if (!isAvailable) {
            Logger.warn('⚠️  MCP Extension API is not available. Server registration skipped.');
            return false;
        }

        try {
            const mcpApi = (vscode as any).cursor?.mcp;
            if (!mcpApi) {
                Logger.warn('⚠️  MCP API not found');
                return false;
            }

            // Register the server
            if (mcpApi.registerServer) {
                await mcpApi.registerServer({
                    name,
                    ...serverConfig
                });
                
                this.registeredServers.add(name);
                Logger.log(`✅ MCP server "${name}" registered successfully`);
                return true;
            } else {
                Logger.warn('⚠️  MCP registerServer method not found');
                return false;
            }
        } catch (error: any) {
            Logger.error(`❌ Failed to register MCP server "${name}": ${error.message}`);
            return false;
        }
    }

    /**
     * Unregister an MCP server
     */
    public static async unregisterServer(name: string): Promise<boolean> {
        if (!this.registeredServers.has(name)) {
            Logger.warn(`⚠️  MCP server "${name}" is not registered`);
            return false;
        }

        const isAvailable = await this.checkAvailability();
        if (!isAvailable) {
            return false;
        }

        try {
            const mcpApi = (vscode as any).cursor?.mcp;
            if (mcpApi?.unregisterServer) {
                await mcpApi.unregisterServer(name);
                this.registeredServers.delete(name);
                Logger.log(`✅ MCP server "${name}" unregistered successfully`);
                return true;
            }
        } catch (error: any) {
            Logger.error(`❌ Failed to unregister MCP server "${name}": ${error.message}`);
        }

        return false;
    }

    /**
     * Get list of registered MCP servers
     */
    public static getRegisteredServers(): string[] {
        return Array.from(this.registeredServers);
    }

    /**
     * Register a default conversation capture MCP server (if configured)
     */
    public static async registerDefaultServer(config: {
        mcpServerUrl?: string;
        mcpServerToken?: string;
    }): Promise<boolean> {
        if (!config.mcpServerUrl) {
            // MCP server is optional, so this is fine
            return false;
        }

        return await this.registerServer('conversation-capture', {
            url: config.mcpServerUrl,
            headers: config.mcpServerToken
                ? {
                    Authorization: `Bearer ${config.mcpServerToken}`
                }
                : undefined
        });
    }
}


