const { execSync } = require('child_process');
const { AntigravityAutomation } = require('./setup');

async function runAutoFix() {
    console.log('[AI-Fix] Starting automated linting check...');
    
    let lintOutput = '';
    try {
        execSync('npm run lint', { stdio: 'pipe' });
        console.log('[AI-Fix] No lint errors found! ✨');
        return;
    } catch (error) {
        lintOutput = error.stdout.toString() || error.stderr.toString();
        console.log('[AI-Fix] Issues detected. Sending to Antigravity Agent...');
    }

    const sdk = await AntigravityAutomation.getSDK();
    const session = await AntigravityAutomation.getActiveSession();

    if (!session) {
        console.error('[AI-Fix] Error: No active Antigravity session found.');
        return;
    }

    const prompt = `
I found some linting errors in the project. Please fix them following the project's coding standards.
If there are multiple files, prioritize fixing them all.

ERRORS:
${lintOutput}

NOTE: Please provide the fixes directly. I will automatically accept your changes.
`;

    console.log('[AI-Fix] Prompting agent in session:', session.title);
    await sdk.cascade.sendPrompt(prompt);

    console.log('[AI-Fix] Waiting for Agent to propose fixes...');

    let acceptedCount = 0;
    const maxWait = 10;
    for (let i = 0; i < maxWait; i++) {
        await new Promise(r => setTimeout(r, 5000));
        
        try {
            await sdk.cascade.acceptStep(); 
            acceptedCount++;
            console.log(`[AI-Fix] Accepted fix #${acceptedCount}`);
            i = 0; 
        } catch (e) {
            if (acceptedCount > 0 && i > 3) {
                console.log('[AI-Fix] Process complete. All detected steps accepted.');
                execSync('git add .');
                break;
            }
        }
    }

    if (acceptedCount === 0) {
        console.log('[AI-Fix] No changes were proposed by the agent (or poll timeout).');
    }
}

runAutoFix().catch(console.error);
