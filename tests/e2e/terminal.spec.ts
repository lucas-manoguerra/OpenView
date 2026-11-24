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

test('renders an interactive canvas chart and responds to pointer and wheel input', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC USDT/,
  });

  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');

  const bounds = await canvas.boundingBox();

  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const initialImage = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);

  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(initialImage);

  const imageBeforeZoom = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  await page.mouse.wheel(0, -120);

  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(imageBeforeZoom);
});

test('updates the canvas backing store when the terminal layout changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC USDT/,
  });

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');

  const initialWidth = await canvas.evaluate((element: HTMLCanvasElement) => element.width);

  await page.setViewportSize({ width: 900, height: 900 });

  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width))
    .not.toBe(initialWidth);

  const dimensions = await canvas.evaluate((element: HTMLCanvasElement) => ({
    width: element.width,
    height: element.height,
    clientWidth: element.getBoundingClientRect().width,
    clientHeight: element.getBoundingClientRect().height,
    devicePixelRatio: window.devicePixelRatio,
  }));

  expect(dimensions.width).toBe(Math.round(dimensions.clientWidth * dimensions.devicePixelRatio));
  expect(dimensions.height).toBe(Math.round(dimensions.clientHeight * dimensions.devicePixelRatio));
});

test('supports price axis drag, anchored zoom and double-click auto fit', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC USDT/,
  });

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');

  const bounds = await canvas.boundingBox();

  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const axisX = bounds.x + bounds.width - 36;
  const axisY = bounds.y + bounds.height * 0.38;
  const initialImage = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

  await page.mouse.move(axisX, axisY);
  await page.mouse.down();
  await page.mouse.move(axisX, axisY + 42);
  await page.mouse.up();

  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(initialImage);

  const imageBeforeAxisZoom = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );

  await page.mouse.move(axisX, axisY);
  await page.mouse.wheel(0, -120);

  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(imageBeforeAxisZoom);

  const imageBeforeAutoFit = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );

  await page.mouse.dblclick(axisX, axisY);

  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(imageBeforeAutoFit);
});

test('renders timestamp based time labels instead of logical bar indices', async ({ page }) => {
  await page.addInitScript(() => {
    const labels: string[] = [];
    Object.defineProperty(window, '__openViewCanvasLabels', { value: labels });
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;

    CanvasRenderingContext2D.prototype.fillText = function (
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ): void {
      labels.push(String(text));
      if (maxWidth === undefined) {
        originalFillText.call(this, text, x, y);
      } else {
        originalFillText.call(this, text, x, y, maxWidth);
      }
    };
  });

  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC USDT/,
  });

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __openViewCanvasLabels?: string[] }).__openViewCanvasLabels
            ?.length ?? 0,
      ),
    )
    .toBeGreaterThan(0);

  const labels = await page.evaluate(
    () => (window as Window & { __openViewCanvasLabels?: string[] }).__openViewCanvasLabels ?? [],
  );

  expect(labels.some((label) => /\d{2}:\d{2}/.test(label))).toBe(true);
  expect(labels).not.toContain('0');
  expect(labels).not.toContain('1');
  expect(labels).not.toContain('2');
});
