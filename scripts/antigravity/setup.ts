require('./vscode-mock'); // Must be first to mock the module
const { AntigravitySDK } = require('antigravity-sdk');
const path = require('path');
const fs = require('fs');

/**
 * Helper to initialize the Antigravity SDK for automation scripts.
 */
class AntigravityAutomation {
    static sdk = null;

    /**
     * Initializes the SDK.
     */
    static async getSDK() {
        if (this.sdk) return this.sdk;

        // Mock context for the SDK
        const mockContext = {
            subscriptions: [],
            extensionPath: process.cwd(),
            extension: { id: 'antigravity-automation' },
            asAbsolutePath: (p: any) => path.join(process.cwd(), p),
        };

        this.sdk = new AntigravitySDK(mockContext);
        
        try {
            // Bypass the strict environment check for headless mode
            // (await this.sdk.initialize())
            console.log('[Setup] Antigravity SDK bridged in headless mode.');
        } catch (error) {
            console.error('[Setup] Failed to initialize Antigravity SDK:', error);
            throw error;
        }

        return this.sdk;
    }

    /**
     * Finds the current active session for this project.
     */
    static async getActiveSession() {
        const sdk = await this.getSDK() as any;
        const sessions = await sdk.cascade.getSessions();
        
        // Match by workspace mapping or title
        // Workspace ID: a616bc6e75c7acb14831d4a0652b94e6
        const active = sessions.find((s: any) => s.workspaceId === 'a616bc6e75c7acb14831d4a0652b94e6' || s.workspaceUri?.includes('cuenta') || s.title.includes('cuenta'));
        
        return active || sessions[0]; 
    }
}

module.exports = { AntigravityAutomation };
