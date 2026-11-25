import { expect, test } from '@playwright/test';

test('opens the component lab and explores drawing tools and style templates', async ({ page }) => {
  await page.goto('/component-lab');

  await expect(page).toHaveTitle(/Component Lab/);
  await expect(page.getByRole('heading', { name: 'Component Lab' })).toBeVisible();
  await page.getByRole('link', { name: 'Buttons & Controls' }).first().click();

  await expect(page).toHaveURL(/buttons$/);
  await expect(page.getByRole('heading', { name: 'Buttons & Controls' })).toBeVisible();

  await page.goto('/component-lab');
  await page.getByRole('link', { name: 'Drawings · Tools & Styles' }).click();
  await expect(page).toHaveURL(/component-lab\/drawings$/);
  await expect(page.getByRole('heading', { name: 'Drawings' })).toBeVisible();
  await expect(page.getByTestId('drawings-playground')).toHaveAttribute('data-hydrated', 'true');

  await page.getByTestId('drawing-tool-catalog-toggle').click();
  const catalog = page.getByTestId('drawing-tool-catalog');
  await expect(catalog).toBeVisible();
  await page.getByTestId('drawing-tool-catalog-search').fill('retroceso');
  await expect(page.getByTestId('drawing-tool-catalog-item-fib-retracement')).toBeDisabled();

  await page.getByTestId('drawing-tool-catalog-search').fill('');
  await page.getByTestId('drawing-tool-group-lines').click();
  await page.getByTestId('drawing-tool-catalog-item-trend-line').click();
  await expect(page.getByTestId('drawing-active-tool')).toHaveText('trend-line');

  await expect(page.getByTestId('drawing-template-default')).toBeVisible();
  await expect(page.getByTestId('drawing-template-default')).toBeEnabled();
  await page.getByTestId('drawing-style-color').evaluate((element: HTMLInputElement) => {
    element.value = '#abcdef';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByTestId('drawing-style-width').selectOption('2');
  await page.getByTestId('drawing-style-line').selectOption('dashed');
  await page.getByTestId('drawing-template-name').fill('Support');
  await page.getByTestId('drawing-template-save').click();
  await expect(page.getByTestId('drawing-template-count')).toHaveText(
    '1 plantillas personalizadas de esta herramienta',
  );
  await expect(page.locator('[data-testid^="drawing-custom-template-custom-"]')).toHaveCount(1);
  await expect(page.getByTestId('drawing-template-delete')).toBeEnabled();
  await page.getByTestId('drawing-template-default').click();
  await expect(page.getByTestId('drawing-style-color')).toHaveValue('#60a5fa');
  await expect(page.getByTestId('drawing-style-width')).toHaveValue('1');
  await expect(page.getByTestId('drawing-style-line')).toHaveValue('solid');
  await expect(page.getByTestId('drawing-template-delete')).toBeDisabled();
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
  await expect(page.getByTestId('buttons-playground')).toHaveAttribute('data-hydrated', 'true');

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
  await expect(page.getByTestId('buttons-playground')).toHaveAttribute('data-hydrated', 'true');

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
  await expect(page.getByTestId('navigation-playground')).toHaveAttribute('data-hydrated', 'true');

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

test('opens modal dialogs with focus containment, Escape and focus restoration', async ({
  page,
}) => {
  await page.goto('/component-lab');

  await page.getByRole('link', { name: 'Dialogs · Modals' }).click();
  await expect(page).toHaveURL(/dialogs$/);
  await expect(page.getByRole('heading', { name: 'Dialogs & Modals' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const trigger = page.getByRole('button', { name: 'Abrir diálogo de configuración' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Configuración del gráfico' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  const layoutName = page.getByLabel('Nombre del diseño');
  await expect(layoutName).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cerrar diálogo' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole('button', { name: 'Cerrar diálogo' }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.mouse.click(12, 12);
  await expect(dialog).toBeHidden();
});

test('inspects the centralized Lucide icon catalog and its accessible variants', async ({
  page,
}) => {
  await page.goto('/component-lab/core/icons');

  await expect(page.getByRole('heading', { name: 'Icons' })).toBeVisible();
  await expect(page.getByTestId('icons-playground')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('icon-item')).toHaveCount(38);
  await expect(page.getByTestId('icons-current-size')).toHaveText('18px · stroke 1.8');

  await page.getByLabel('Tamaño del icono').selectOption('28');
  await expect(page.getByTestId('icons-current-size')).toHaveText('28px · stroke 1.8');

  await page.getByLabel('Grosor del trazo').selectOption('2.2');
  await expect(page.getByTestId('icons-current-size')).toHaveText('28px · stroke 2.2');

  await expect(page.getByRole('img', { name: 'Tendencia alcista' })).toBeVisible();
});

test('selects toolbar tools and supports horizontal and vertical keyboard navigation', async ({
  page,
}) => {
  await page.goto('/component-lab/core/toolbars');

  await expect(page.getByRole('heading', { name: 'Toolbars' })).toBeVisible();
  await expect(page.getByTestId('toolbar-playground')).toHaveAttribute('data-hydrated', 'true');

  const toolbar = page.getByRole('toolbar', { name: 'Herramientas de dibujo' });
  await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');

  const cursor = page.getByRole('button', { name: 'Cursor' });
  const trendLine = page.getByRole('button', { name: 'Línea de tendencia' });
  const horizontalLine = page.getByRole('button', { name: 'Línea horizontal' });
  const hide = page.getByRole('button', { name: 'Ocultar dibujos' });

  await expect(cursor).toHaveAttribute('aria-pressed', 'true');
  await trendLine.click();
  await expect(trendLine).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('toolbar-active-tool')).toHaveText('trend-line');

  await trendLine.focus();
  await page.keyboard.press('ArrowRight');
  await expect(horizontalLine).toBeFocused();
  await page.keyboard.press('Home');
  await expect(cursor).toBeFocused();
  await page.keyboard.press('End');
  await expect(hide).toBeFocused();

  await expect(page.getByRole('button', { name: 'Eliminar dibujos' })).toBeDisabled();
  await page.getByLabel('Orientación de la barra').selectOption('vertical');
  await expect(toolbar).toHaveAttribute('aria-orientation', 'vertical');

  await cursor.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Cruz' })).toBeFocused();
});

test('controls chart timeframe, chart type and price scale independently', async ({ page }) => {
  await page.goto('/component-lab/chart/controls');

  await expect(page.getByRole('heading', { name: 'Chart Controls' })).toBeVisible();
  await expect(page.getByTestId('chart-controls-playground')).toHaveAttribute(
    'data-hydrated',
    'true',
  );

  const timeframeToolbar = page.getByTestId('timeframe-selector');
  await expect(timeframeToolbar.getByRole('button', { name: '15m' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await timeframeToolbar.getByRole('button', { name: '1h' }).click();
  await expect(page.getByTestId('selected-timeframe')).toContainText('1h');

  await page.getByLabel('Todas las temporalidades').selectOption('1M');
  await expect(page.getByTestId('selected-timeframe')).toContainText('1M');

  await page.getByLabel('Tipo de gráfico').selectOption('line');
  await expect(page.getByTestId('selected-chart-type')).toHaveText('line');

  await page.getByRole('button', { name: '%' }).click();
  await expect(page.getByTestId('selected-price-scale')).toHaveText('percentage');

  await page.getByLabel('Deshabilitar controles').check();
  await expect(page.getByLabel('Todas las temporalidades')).toBeDisabled();
  await expect(page.getByLabel('Tipo de gráfico')).toBeDisabled();
  await expect(page.getByRole('button', { name: '%' })).toBeDisabled();
});
