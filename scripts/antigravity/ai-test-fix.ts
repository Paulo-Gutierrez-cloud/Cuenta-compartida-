const { execSync } = require('child_process');
const { AntigravityAutomation } = require('./setup');

async function runTestFix() {
    console.log('[AI-Test] Running Playwright tests...');
    
    let testOutput = '';
    try {
        execSync('npx playwright test', { stdio: 'pipe' });
        console.log('[AI-Test] All tests passed! ✅');
        return;
    } catch (error) {
        testOutput = error.stdout.toString() || error.stderr.toString();
        console.log('[AI-Test] Tests failed. Analyzing failures with Antigravity...');
    }

    const sdk = await AntigravityAutomation.getSDK();
    const session = await AntigravityAutomation.getActiveSession();

    if (!session) {
        console.error('[AI-Test] Error: No active Antigravity session found.');
        return;
    }

    const prompt = `
The Playwright tests failed. Please analyze the failures and fix the code or the tests as needed.

FAILURE SUMMARY:
${testOutput.substring(0, 5000)}

I will automatically accept your suggested fixes.
`;

    console.log('[AI-Test] Prompting agent...');
    await sdk.cascade.sendPrompt(prompt);

    console.log('[AI-Test] Monitoring for fixes...');
    
    let acceptedCount = 0;
    const maxWait = 15;
    for (let i = 0; i < maxWait; i++) {
        await new Promise(r => setTimeout(r, 8000));
        
        try {
            await sdk.cascade.acceptStep();
            acceptedCount++;
            console.log(`[AI-Test] Accepted fix #${acceptedCount}`);
            i = 0;
        } catch (e) {
            if (acceptedCount > 0 && i > 4) break;
        }
    }

    console.log(`[AI-Test] Finished. Accepted ${acceptedCount} changes.`);
    if (acceptedCount > 0) execSync('git add .');
}

runTestFix().catch(console.error);
