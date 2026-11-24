import { expect, test } from '@playwright/test';

test('loads the OpenView terminal foundation', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/OpenView/);
  await expect(page.getByRole('heading', { name: 'Espacio de gráficos' })).toBeVisible();
  await expect(page.getByText('Motor independiente de la interfaz')).toBeVisible();
});

test('switches between workspace sections after hydration', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByRole('button', { name: /Mercados/ }).click();

  await expect(page.getByRole('heading', { name: 'Mercados' })).toBeVisible();
});
