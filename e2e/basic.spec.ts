import { test, expect } from '@playwright/test';

test('has title and dashboard link', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Tu Cuenta|Cargando/);
});

test('dashboard is accessible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('PC CENTRAL');
});

test('kitchen view is accessible', async ({ page }) => {
    await page.goto('/kitchen');
    await expect(page.locator('h1')).toContainText('KITCHEN');
});

test('qr generator is accessible', async ({ page }) => {
    await page.goto('/qr');
    await expect(page.locator('h2')).toContainText('Seleccionar Mesa');
});
