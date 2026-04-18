// Mocking the 'vscode' module for standalone usage of the Antigravity SDK
const Module = require('module');

const mockVSCode = {
    commands: {
        executeCommand: async (command: any, ...args: any[]) => {
            console.warn(`[MockVSCode] executeCommand called for ${command}. Standard VS Code commands are not available in headless mode.`);
            return null;
        },
        getCommands: async () => [],
        registerCommand: () => ({ dispose: () => {} }),
    },
    window: {
        createOutputChannel: () => ({ appendLine: console.log }),
    },
};

// Add to the require cache
Module._cache['vscode'] = {
    id: 'vscode',
    exports: mockVSCode,
    loaded: true,
};

module.exports = mockVSCode;
