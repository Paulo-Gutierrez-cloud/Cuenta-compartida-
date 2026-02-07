import { test, expect, chromium } from '@playwright/test';

/**
 * STRESS TEST: 20 Simultaneous Clients
 * ------------------------------------
 * 1. Waiter adds 20 items to Mesa 5.
 * 2. 20 virtual customers join simultaneously.
 * 3. Each customer claims exactly one item.
 * 4. All customers pay at once.
 * 5. Verify system maintains state integrity.
 */

test('Stress Test: 20 Simultaneous Clients on one table', async () => {
    test.setTimeout(120000); // Increase timeout for the whole test
    const browser = await chromium.launch({ headless: true });
    const waiterContext = await browser.newContext();
    const waiter = await waiterContext.newPage();
    const BASE_URL = 'http://localhost:3000';

    console.log('--- STARTING STRESS TEST (20 USERS) ---');

    // STEP 1: WAITER - Setup Mesa 5
    await waiter.goto(`${BASE_URL}/dashboard`);

    // Clean Mesa 5
    try {
        console.log('Waiter: Rotating table 5...');
        const mesa5 = waiter.locator('div:has-text("Mesa 5")');
        const rotateBtn = mesa5.locator('button[title="Rotar Mesa"]');
        if (await rotateBtn.isVisible()) {
            await rotateBtn.click();
            await waiter.waitForTimeout(1000);
        }
    } catch (e) { console.log('Waiter: No need to rotate / rotate failed.'); }

    // Add 20 items
    console.log('Waiter: Adding 20 items to Mesa 5...');
    await waiter.locator('div:has-text("Mesa 5")').locator('button').first().click();

    for (let i = 1; i <= 20; i++) {
        try {
            await waiter.getByPlaceholder('Ej. Lomo Salteado').waitFor({ state: 'visible' });
            await waiter.getByPlaceholder('Ej. Lomo Salteado').fill(`Stress_${i}`);
            await waiter.getByPlaceholder('0 (Cortesía)').fill('1000');
            await waiter.getByText('ENVIAR A COCINA').click();
            await waiter.waitForTimeout(200); // Small gap between inserts
        } catch (e) {
            console.error(`Waiter: Failed to add item ${i}`, e);
        }
    }
    await waiter.keyboard.press('Escape');

    // STEP 2: 20 CUSTOMERS JOINING SIMULTANEOUSLY
    console.log('Simulation: Spawning 20 concurrent customer actions...');

    const customerActions = Array.from({ length: 20 }).map(async (_, index) => {
        const userId = index + 1;
        let context;
        try {
            context = await browser.newContext();
            const page = await context.newPage();

            // Join
            console.log(`[User ${userId}] Joining...`);
            await page.goto(`${BASE_URL}/?mesa=5`, { waitUntil: 'networkidle' });
            await page.getByPlaceholder(/Tu Nombre/i).fill(`Client_${userId}`);
            await page.getByText(/Ingresar/i).click();

            // Wait for list
            await page.waitForURL(/\/order/);

            // Select their specific item
            const itemText = `Stress_${userId}`;
            console.log(`[User ${userId}] Selecting ${itemText}...`);
            await page.getByText(itemText, { exact: false }).waitFor({ state: 'visible' });
            await page.getByText(itemText, { exact: false }).click();

            // Pay
            await page.waitForTimeout(1000 + (Math.random() * 2000)); // Random jitter
            console.log(`[User ${userId}] Clicking Pay...`);
            await page.getByText(/Pagar Parte/i).click();

            // Wait for success
            console.log(`[User ${userId}] Waiting for payment confirmation...`);
            await expect(page.getByText(/¡Todo Pagado!/i).or(page.getByText(/Pagado por Client_${userId}/i))).toBeVisible({ timeout: 20000 });
            console.log(`[User ${userId}] SUCCESS!`);

        } catch (err) {
            console.error(`[User ${userId}] FAILED:`, err.message);
            throw err; // Re-throw to fail the Promise.all
        } finally {
            if (context) await context.close();
        }
    });

    await Promise.all(customerActions);

    // STEP 3: FINAL VERIFICATION
    await waiter.bringToFront();
    await waiter.waitForTimeout(2000);
    const progressText = await waiter.locator('div:has-text("Mesa 5")').getByText('100%').isVisible();
    console.log(`Final Verification: Mesa 5 is at 100%? ${progressText}`);
    expect(progressText).toBe(true);

    console.log('--- STRESS TEST COMPLETED SUCCESSFULLY ---');
    await browser.close();
});
