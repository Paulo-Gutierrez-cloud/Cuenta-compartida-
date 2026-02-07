import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';

/**
 * SIMULATION: A Regular Day at the Jazz Club
 * -----------------------------------------
 * This script simulates a complete table lifecycle:
 * 1. Waiter opens a table and adds items (some shared).
 * 2. Chef receives orders and prepares them with realistic delays.
 * 3. Two customers (Juan & Maria) join, select their shares, and pay.
 * 4. System handles concurrency and real-time updates.
 */

test('Simulation: Multi-user Table lifecycle', async () => {
    const browser = await chromium.launch({ headless: false }); // Watch the magic happen

    // 1. CONTEXTS Setup
    const waiterContext = await browser.newContext();
    const chefContext = await browser.newContext();
    const customerAContext = await browser.newContext();
    const customerBContext = await browser.newContext();

    const waiter = await waiterContext.newPage();
    const chef = await chefContext.newPage();
    const customerA = await customerAContext.newPage();
    const customerB = await customerBContext.newPage();

    const BASE_URL = 'http://localhost:3000';

    console.log('--- STARTING SIMULATION ---');

    // STEP 1: WAITER - Open Dashboard and prepare Mesa 1
    console.log('Waiter: Opening Dashboard...');
    await waiter.goto(`${BASE_URL}/dashboard`);
    await expect(waiter.getByText(/Mesa 1/i)).toBeVisible();

    // Ensure table is rotated/clean first (manual release if needed)
    try {
        const releaseBtn = waiter.locator('button[title="Rotar Mesa"]').first();
        if (await releaseBtn.isVisible()) {
            await releaseBtn.click();
            await waiter.waitForTimeout(1000);
        }
    } catch (e) { }

    // STEP 2: WAITER - Add Orders
    console.log('Waiter: Adding items to Mesa 1...');
    await waiter.locator('div:has-text("Mesa 1")').locator('button').first().click(); // Open Add Modal

    // Add a Shared Promo (Pizza + Beer for 2)
    await waiter.getByPlaceholder('Pizza Margarita').fill('PROMO PAREJA');
    await waiter.getByPlaceholder('0 (Cortesía)').fill('12000');
    await waiter.locator('select').selectOption('2'); // Shared in 2
    await waiter.getByText('Agregar Orden').click();
    await waiter.waitForTimeout(500);

    // Add a Courtesy Item
    await waiter.getByPlaceholder('PROMO PAREJA').fill('Trago de Bienvenida');
    await waiter.getByPlaceholder('0 (Cortesía)').fill('0');
    await waiter.locator('select').selectOption('1');
    await waiter.getByText('Agregar Orden').click();
    await waiter.waitForTimeout(500);

    // Close modal
    await waiter.keyboard.press('Escape');

    // STEP 3: KITCHEN - Chef starts preparing
    console.log('Chef: Checking KDS...');
    await chef.goto(`${BASE_URL}/kitchen`);
    await expect(chef.getByText(/Mesa 1/i)).toBeVisible();
    await chef.getByText(/Cocinar/i).first().click(); // Mark Promo as preparing
    console.log('Chef: Preparing items...');

    // STEP 4: CUSTOMERS - Scan & Join
    console.log('Customer A: Joining Table 1...');
    await customerAContext.addInitScript(() => {
        window.localStorage.setItem('user_name', 'Juan');
    });
    await customerA.goto(`${BASE_URL}/?mesa=1`);
    await customerA.getByPlaceholder(/Tu Nombre/i).fill('Juan');
    await customerA.getByText(/Ingresar/i).click();

    console.log('Customer B: Joining Table 1...');
    await customerBContext.addInitScript(() => {
        window.localStorage.setItem('user_name', 'Maria');
    });
    await customerB.goto(`${BASE_URL}/?mesa=1`);
    await customerB.getByPlaceholder(/Tu Nombre/i).fill('Maria');
    await customerB.getByText(/Ingresar/i).click();

    // STEP 5: CHEF - Finish Cooking
    await chef.waitForTimeout(2000); // Simulate cooking time
    console.log('Chef: Order is ready!');
    await chef.getByText(/Listo/i).first().click();

    // STEP 6: CUSTOMERS - Selection & Dynamic Updates
    console.log('Customer A: Selecting items...');
    await customerA.waitForTimeout(1000);
    await customerA.getByText(/PROMO PAREJA \(1\/2\)/i).click();

    console.log('Customer B: Selecting items...');
    await customerB.waitForTimeout(1000);
    await customerB.getByText(/PROMO PAREJA \(2\/2\)/i).click();

    // STEP 7: ERROR SIMULATION (Customer A tries to access Tableau 2 - will be redirected)
    console.log('Security Test: Customer A tries to jump to Table 2...');
    await customerA.goto(`${BASE_URL}/order?table_id=fake-id`);
    await customerA.waitForTimeout(1000);
    await expect(customerA).toHaveURL(`${BASE_URL}/`); // Verify redirect
    await customerA.goto(`${BASE_URL}/order?table_id=${await customerB.evaluate(() => localStorage.getItem('current_session_id'))}`); // Go back

    // STEP 8: PAYMENTS
    console.log('Customer A: Paying...');
    await customerA.getByText(/Pagar Parte/i).click();
    await waiter.waitForTimeout(2000); // Simulate processing

    console.log('Customer B: Paying...');
    await customerB.getByText(/Pagar Parte/i).click();
    await waiter.waitForTimeout(2000);

    // STEP 9: WAITER - Final Verification
    console.log('Waiter: Verifying mesa 1 is clean...');
    await waiter.bringToFront();
    await expect(waiter.getByText(/PAGO COMPLETO/i)).toBeVisible();

    console.log('Waiter: Rotating table for next customers...');
    await waiter.locator('button[title="Rotar Mesa"]').first().click();

    console.log('--- SIMULATION COMPLETED SUCCESSFULLY ---');
    await browser.close();
});
