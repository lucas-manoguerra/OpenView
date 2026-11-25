import { expect, test } from '@playwright/test';

test('opens the isolated component lab and navigates to the core controls', async ({ page }) => {
  await page.goto('/component-lab');

  await expect(page).toHaveTitle(/Component Lab/);
  await expect(page.getByRole('heading', { name: 'Component Lab' })).toBeVisible();
  await page.getByRole('link', { name: 'Buttons & Controls' }).first().click();

  await expect(page).toHaveURL(/buttons$/);
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

test('inspects form controls in isolation and updates their values', async ({ page }) => {
  await page.goto('/component-lab');

  await page.getByRole('link', { name: 'Forms · Inputs & Selects' }).click();
  await expect(page).toHaveURL(/forms$/);
  await expect(page.getByRole('heading', { name: 'Inputs & Selects' })).toBeVisible();

  const symbolInput = page.getByTestId('forms-symbol-input');
  await expect(symbolInput).toHaveValue('BTCUSDT');
  await symbolInput.fill('ethusdt');
  await expect(symbolInput).toHaveValue('ETHUSDT');
  await expect(page.getByTestId('forms-symbol-value')).toHaveText('ETHUSDT');

  const timeframeSelect = page.getByTestId('forms-timeframe-select');
  await timeframeSelect.selectOption('60');
  await expect(page.getByTestId('forms-timeframe-value')).toHaveText('60');

  const queryInput = page.getByTestId('forms-query-input');
  await queryInput.fill('volume');
  await expect(page.getByTestId('forms-query-length')).toHaveText('6');

  await expect(page.getByLabel('Con error')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Formato de símbolo no válido.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Deshabilitado' })).toBeDisabled();
});

test('navigates TradingView tabs and dropdown menus with keyboard and pointer', async ({
  page,
}) => {
  await page.goto('/component-lab');

  await page.getByRole('link', { name: 'Navigation · Tabs & Menus' }).click();
  await expect(page).toHaveURL(/navigation$/);
  await expect(page.getByRole('heading', { name: 'Tabs & Menus' })).toBeVisible();

  const chartTab = page.getByRole('tab', { name: 'Gráfico' });
  const detailsTab = page.getByRole('tab', { name: 'Detalles' });
  await expect(chartTab).toHaveAttribute('aria-selected', 'true');
  await chartTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(detailsTab).toHaveAttribute('aria-selected', 'true');
  await expect(detailsTab).toBeFocused();
  await expect(page.getByRole('tabpanel')).toContainText('Información resumida');

  const menuTrigger = page.getByRole('button', { name: 'Diseño' });
  await menuTrigger.click();
  const menu = page.getByRole('menu', { name: 'Diseño' });
  await expect(menu).toBeVisible();
  const saveItem = page.getByRole('menuitem', { name: 'Guardar diseño' });
  await expect(saveItem).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Duplicar diseño' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(menuTrigger).toBeFocused();

  await menuTrigger.click();
  await page.getByRole('menuitem', { name: 'Guardar diseño' }).click();
  await expect(page.getByTestId('navigation-menu-action')).toHaveText('save-layout');
  await expect(menu).toBeHidden();
});
