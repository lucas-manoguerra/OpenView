import { expect, test } from '@playwright/test';

test('opens the isolated component lab and navigates to the core controls', async ({ page }) => {
  await page.goto('/component-lab');

  await expect(page).toHaveTitle(/Component Lab/);
  await expect(page.getByRole('heading', { name: 'Component Lab' })).toBeVisible();
  await page.getByRole('link', { name: 'Buttons & Controls' }).first().click();

  await expect(page).toHaveURL(/\/component-lab\/core\/buttons$/);
  await expect(page.getByRole('heading', { name: 'Buttons & Controls' })).toBeVisible();
});

test('exposes button variants and sizes in the playground', async ({ page }) => {
  await page.goto('/component-lab/core/buttons');

  await expect(page.getByRole('button', { name: 'Comprar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eliminar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pequeño' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mediano' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grande' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deshabilitado' })).toBeDisabled();
});

test('updates interactive button state and accessible counter feedback', async ({ page }) => {
  await page.goto('/component-lab/core/buttons');

  const counter = page.getByText('Clicks: 0');
  await expect(counter).toBeVisible();
  await page.getByRole('button', { name: 'Incrementar contador' }).click();
  await expect(page.getByText('Clicks: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Incrementar contador' }).click();
  await expect(page.getByText('Clicks: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar' }).click();
  await expect(page.getByText('Clicks: 0')).toBeVisible();
});

test('toggles icon button active state and loading state', async ({ page }) => {
  await page.goto('/component-lab/core/buttons');

  const addButton = page.getByRole('button', { name: 'Añadir al gráfico' });
  await expect(addButton).toHaveAttribute('aria-pressed', 'false');
  await addButton.click();
  await expect(addButton).toHaveAttribute('aria-pressed', 'true');

  const loadingButton = page.getByRole('button', { name: 'Simular carga' });
  await loadingButton.click();
  await expect(page.getByRole('button', { name: 'Cargando' })).toBeDisabled();
});
