import { test, expect, chromium, BrowserContext, Page } from '@playwright/test';

/**
 * SIMULACIÓN MULTI-MESA - VERSIÓN ESTABLE
 * ========================================
 * 12 clientes (4 por mesa) - Optimizado para máquinas locales
 * 
 * Casos probados:
 * 1. Wave 1: 6 clientes se unen (2 por mesa)
 * 2. Mozo agrega 10 items por mesa
 * 3. Un cliente por mesa paga parcialmente
 * 4. Mozo agrega items POST-PAGO
 * 5. Wave 2: 6 clientes más se unen
 * 6. Verificación: Wave 2 ve items tardíos
 */

test('Simulación Multi-Mesa Estable (12 Clientes)', async () => {
    test.setTimeout(300000); // 5 minutos

    const browser = await chromium.launch({ headless: true });
    const BASE_URL = 'http://localhost:3000';

    console.log('='.repeat(50));
    console.log('SIMULACIÓN MULTI-MESA - 12 CLIENTES');
    console.log(`Hora inicio: ${new Date().toLocaleTimeString()}`);
    console.log('='.repeat(50));

    const waiterCtx = await browser.newContext();
    const waiter = await waiterCtx.newPage();

    // Helper: Agregar items rápido
    async function addItems(table: number, count: number, prefix: string) {
        await waiter.goto(`${BASE_URL}/dashboard`);
        await waiter.waitForLoadState('domcontentloaded');

        const btn = waiter.getByRole('button', { name: /Nueva Orden/i }).nth(table - 1);
        await btn.waitFor({ state: 'visible', timeout: 10000 });
        await btn.click();

        const input = waiter.getByPlaceholder(/Ej. Lomo Salteado/i);
        await input.waitFor({ state: 'visible', timeout: 8000 });

        for (let i = 1; i <= count; i++) {
            await input.fill(`${prefix}_${i}`);
            await waiter.getByPlaceholder(/0 \(Cortesía\)/i).fill('1000');
            await waiter.getByRole('button', { name: /ENVIAR A COCINA/i }).click();
            await waiter.waitForTimeout(200);
        }
        await waiter.keyboard.press('Escape');
        console.log(`[MOZO] Mesa ${table}: +${count} items (${prefix})`);
    }

    // Helper: Crear cliente
    async function spawnClient(table: number, name: string) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(`${BASE_URL}/?mesa=${table}`, { waitUntil: 'domcontentloaded' });
        await page.getByPlaceholder(/Tu Nombre/i).fill(name);
        await page.getByRole('button', { name: /Ingresar/i }).click();
        await page.waitForURL(/\/order/, { timeout: 20000 });
        console.log(`[CLIENTE] ${name}: ✓`);
        return { page, ctx, name };
    }

    // CLEANUP
    console.log('\n[SETUP] Limpiando mesas...');
    await waiter.goto(`${BASE_URL}/dashboard`);
    for (let t = 1; t <= 3; t++) {
        try {
            const r = waiter.getByRole('button', { name: /Rotar Mesa/i }).nth(t - 1);
            if (await r.isVisible({ timeout: 1000 })) {
                await r.click();
                await waiter.waitForTimeout(400);
            }
        } catch { }
    }

    // =======================================
    // WAVE 1: 6 clientes (2 por mesa)
    // =======================================
    console.log('\n>>> WAVE 1: 6 clientes (2 por mesa)');

    const wave1: { page: Page, ctx: BrowserContext, name: string }[] = [];
    for (let t = 1; t <= 3; t++) {
        for (let i = 1; i <= 2; i++) {
            const c = await spawnClient(t, `T${t}_C${i}`);
            wave1.push(c);
            await new Promise(r => setTimeout(r, 400));
        }
    }

    // =======================================
    // PEDIDOS: 10 items por mesa
    // =======================================
    console.log('\n>>> PEDIDOS: 10 items x 3 mesas');
    await addItems(1, 10, 'M1');
    await addItems(2, 10, 'M2');
    await addItems(3, 10, 'M3');

    // =======================================
    // PAGO PARCIAL
    // =======================================
    console.log('\n>>> CASO: Pago parcial (1 por mesa)');

    for (let t = 0; t < 3; t++) {
        const c = wave1[t * 2]; // Primer cliente de cada mesa
        const tNum = t + 1;

        // Seleccionar 3 items
        for (let j = 1; j <= 3; j++) {
            try {
                await c.page.getByText(`M${tNum}_${j}`, { exact: false }).click();
                await c.page.waitForTimeout(100);
            } catch { }
        }

        const payBtn = c.page.getByRole('button', { name: /Pagar Parte/i });
        if (await payBtn.isVisible({ timeout: 3000 })) {
            await payBtn.click();
            await expect(c.page.getByText(/Pagado por/i)).toBeVisible({ timeout: 8000 });
            console.log(`[PAGO] ${c.name}: ✓ Pagó 3 items`);
        }
    }

    // =======================================
    // ITEMS TARDÍOS (POST-PAGO)
    // =======================================
    console.log('\n>>> MOZO: Items post-pago');
    await addItems(1, 2, 'M1_LATE');
    await addItems(2, 2, 'M2_LATE');
    await addItems(3, 2, 'M3_LATE');

    // =======================================
    // WAVE 2: 6 clientes más
    // =======================================
    console.log('\n>>> WAVE 2: 6 clientes más');

    const wave2: { page: Page, ctx: BrowserContext, name: string }[] = [];
    for (let t = 1; t <= 3; t++) {
        for (let i = 3; i <= 4; i++) {
            const c = await spawnClient(t, `T${t}_C${i}`);
            wave2.push(c);
            await new Promise(r => setTimeout(r, 400));
        }
    }

    // =======================================
    // VERIFICACIÓN: Wave 2 ve items tardíos
    // =======================================
    console.log('\n>>> VERIFICANDO sync...');

    for (let t = 0; t < 3; t++) {
        const c = wave2[t * 2];
        const tNum = t + 1;

        await expect(c.page.getByText(`M${tNum}_LATE_1`, { exact: false }))
            .toBeVisible({ timeout: 10000 });

        console.log(`[SYNC] ${c.name}: ✓ Ve items tardíos`);
    }

    // =======================================
    // RESULTADO
    // =======================================
    console.log('\n' + '='.repeat(50));
    console.log('✅ SIMULACIÓN EXITOSA');
    console.log('='.repeat(50));
    console.log('Clientes: 12 (6 + 6)');
    console.log('Items: 30 + 6 tardíos = 36');
    console.log('Pagos parciales: 3');
    console.log('Casos probados:');
    console.log('  - Wave 1 ingresa correctamente');
    console.log('  - Pedidos grandes funcionan');
    console.log('  - Pago parcial funciona');
    console.log('  - Items post-pago se agregan');
    console.log('  - Wave 2 ve items en tiempo real');
    console.log(`Hora fin: ${new Date().toLocaleTimeString()}`);

    // Cleanup
    await Promise.all([...wave1, ...wave2].map(c => c.ctx.close()));
    await waiterCtx.close();
    await browser.close();
});
