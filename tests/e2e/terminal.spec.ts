import { expect, test, type Page } from '@playwright/test';

const BINANCE_KLINES_URL = 'https://data-api.binance.vision/api/v3/klines**';

const getIntervalDuration = (interval: string): number => (interval === '5m' ? 300_000 : 60_000);

const createKlines = (interval: string, startTime: number, endTime: number): unknown[][] => {
  const duration = getIntervalDuration(interval);
  const firstTimestamp = Math.ceil(startTime / duration) * duration;
  const lastTimestamp = Math.floor(endTime / duration) * duration;
  const candleCount = Math.max(
    0,
    Math.min(500, Math.floor((lastTimestamp - firstTimestamp) / duration) + 1),
  );

  return Array.from({ length: candleCount }, (_, index) => {
    const timestamp = firstTimestamp + index * duration;
    const close = 65_000 + index * 0.7 + Math.sin(index / 12) * 90;
    const open = close - 5;
    const high = close + 20;
    const low = open - 20;

    return [
      timestamp,
      String(open),
      String(high),
      String(low),
      String(close),
      '12.5',
      timestamp + duration - 1,
      '600',
      20,
      '6',
      '300',
      '0',
    ];
  });
};

const createBybitRows = (interval: string, startTime: number, endTime: number): unknown[][] =>
  createKlines(interval, startTime, endTime)
    .map((row) => [...row.slice(0, 6), 'turnover'])
    .reverse();

const createOkxRows = (interval: string, startTime: number, endTime: number): unknown[][] =>
  createKlines(interval, startTime, endTime).map((row) => [
    row[0],
    row[1],
    row[2],
    row[3],
    row[4],
    row[5],
    'quote-volume',
    'quote-volume',
    '1',
  ]);

const installBinanceMock = async (page: Page): Promise<void> => {
  await page.route(BINANCE_KLINES_URL, async (route) => {
    const url = new URL(route.request().url());
    const interval = url.searchParams.get('interval') ?? '1m';
    const startTime = Number(url.searchParams.get('startTime') ?? 0);
    const endTime = Number(url.searchParams.get('endTime') ?? Date.now());
    const candles = createKlines(interval, startTime, endTime);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(candles),
    });
  });
};

test.beforeEach(async ({ page }) => {
  await installBinanceMock(page);
});

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

test('loads Binance Spot history and changes candle interval', async ({ page }) => {
  const requestedIntervals: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());

    if (url.pathname === '/api/v3/klines') {
      requestedIntervals.push(url.searchParams.get('interval') ?? '');
    }
  });

  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  await expect(page.getByTestId('provider-select')).toHaveValue('binance-spot');
  await expect(page.getByTestId('interval-select')).toHaveValue('1m');

  await page.getByTestId('interval-select').selectOption('5m');

  await expect(canvas).toHaveAttribute('data-interval', '5m');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  expect(requestedIntervals).toContain('1m');
  expect(requestedIntervals).toContain('5m');
});

test('loads older historical candles when panning to the left boundary', async ({ page }) => {
  let historyRequestCount = 0;

  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v3/klines') {
      historyRequestCount += 1;
    }
  });

  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  await expect.poll(async () => Number(await canvas.getAttribute('data-candles-count'))).toBe(500);

  const bounds = await canvas.boundingBox();

  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await page.mouse.wheel(-2600, 0);

  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(500);
  expect(historyRequestCount).toBeGreaterThan(1);
});

test('switches historical data between Binance, Bybit and OKX Spot', async ({ page }) => {
  await page.route('https://api.bybit.com/v5/market/kline**', async (route) => {
    const url = new URL(route.request().url());
    const interval = url.searchParams.get('interval') === '5' ? '5m' : '1m';
    const startTime = Number(url.searchParams.get('start') ?? 0);
    const endTime = Number(url.searchParams.get('end') ?? Date.now()) + 1;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        retCode: 0,
        retMsg: 'OK',
        result: {
          category: 'spot',
          symbol: 'BTCUSDT',
          list: createBybitRows(interval, startTime, endTime),
        },
      }),
    });
  });

  await page.route('https://www.okx.com/api/v5/market/history-candles**', async (route) => {
    const url = new URL(route.request().url());
    const interval = url.searchParams.get('bar') ?? '1m';
    const after = Number(url.searchParams.get('after') ?? Date.now());
    const limit = Number(url.searchParams.get('limit') ?? 100);
    const duration = getIntervalDuration(interval);
    const startTime = after - duration * 501;
    const rows = createOkxRows(interval, startTime, after)
      .filter((row) => Number(row[0]) < after)
      .sort((left, right) => Number(right[0]) - Number(left[0]))
      .slice(0, limit);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: '0', msg: '', data: rows }),
    });
  });

  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  const providerSelect = page.getByTestId('provider-select');

  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  await providerSelect.selectOption('bybit-spot');
  await expect(providerSelect).toHaveValue('bybit-spot');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  await providerSelect.selectOption('okx-spot');
  await expect(providerSelect).toHaveValue('okx-spot');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
});

test('shows a provider error and retries the historical request', async ({ page }) => {
  let requestCount = 0;

  await page.route(BINANCE_KLINES_URL, async (route) => {
    requestCount += 1;

    if (requestCount === 1) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ code: -1003, msg: 'Too many requests' }),
      });
      return;
    }

    const url = new URL(route.request().url());
    const interval = url.searchParams.get('interval') ?? '1m';
    const startTime = Number(url.searchParams.get('startTime') ?? 0);
    const endTime = Number(url.searchParams.get('endTime') ?? Date.now());

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createKlines(interval, startTime, endTime)),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('alert')).toContainText('HTTP 429');
  await page.getByRole('button', { name: 'Reintentar' }).click();

  const canvas = page.locator('canvas[data-candles-count]');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  expect(requestCount).toBe(2);
});

test('renders an interactive canvas chart and responds to pointer and wheel input', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });

  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await expect(canvas).toHaveAttribute('data-candles-count', /[1-9]\d*/);

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
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await expect(canvas).toHaveAttribute('data-candles-count', /[1-9]\d*/);

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
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await expect(canvas).toHaveAttribute('data-candles-count', /[1-9]\d*/);

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

test('changes price scale modes and restores the full chart viewport', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const logarithmicScale = page.getByTestId('price-scale-logarithmic');
  const initialImage = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

  await logarithmicScale.click();

  await expect(logarithmicScale).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(initialImage);

  const percentageScale = page.getByTestId('price-scale-percentage');
  await percentageScale.click();
  await expect(percentageScale).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('chart-fit-prices').click();
  await page.getByTestId('chart-fit-content').click();

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await expect(canvas).toHaveAttribute('data-candles-count', '500');
});

test('navigates historical time, zooms the time scale and returns to realtime', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  await expect.poll(async () => Number(await canvas.getAttribute('data-candles-count'))).toBe(500);

  const initialImage = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

  await page.getByTestId('chart-pan-older').click();
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(initialImage);

  const historicalImage = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  await page.getByTestId('chart-pan-newer').click();
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(historicalImage);

  const imageBeforeZoom = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  await page.getByTestId('chart-time-zoom-in').click();
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(imageBeforeZoom);

  const imageBeforeRealtime = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  await page.getByTestId('chart-pan-older').click();
  await page.getByTestId('chart-go-realtime').click();
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(imageBeforeRealtime);
});

test('exposes auto, lock and inverted price scale controls', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  await expect.poll(async () => Number(await canvas.getAttribute('data-candles-count'))).toBe(500);

  const autoScale = page.getByTestId('chart-auto-scale');
  const lockScale = page.getByTestId('chart-lock-price-scale');
  const invertScale = page.getByTestId('chart-invert-price-scale');

  await expect(autoScale).toHaveAttribute('aria-pressed', 'true');

  await lockScale.click();
  await expect(lockScale).toHaveAttribute('aria-pressed', 'true');
  await expect(lockScale).toHaveAccessibleName('Desbloquear escala de precios');

  await invertScale.click();
  await expect(invertScale).toHaveAttribute('aria-pressed', 'true');

  await autoScale.click();
  await expect(autoScale).toHaveAttribute('aria-pressed', 'false');
  await autoScale.click();
  await expect(autoScale).toHaveAttribute('aria-pressed', 'true');

  await lockScale.click();
  await expect(lockScale).toHaveAttribute('aria-pressed', 'false');
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
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await expect(canvas).toHaveAttribute('data-candles-count', /[1-9]\d*/);

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
