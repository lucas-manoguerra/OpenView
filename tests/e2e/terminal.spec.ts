import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

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

const latestHistoricalCandleTimestamps = new WeakMap<Page, number>();

const getLatestHistoricalCandleTimestamp = (page: Page): number => {
  const timestamp = latestHistoricalCandleTimestamps.get(page);

  if (timestamp === undefined) {
    throw new Error('The mocked historical response must contain a candle timestamp.');
  }

  return timestamp;
};

const updateLatestHistoricalCandleTimestamp = (page: Page, timestamp: number): void => {
  const previousTimestamp = latestHistoricalCandleTimestamps.get(page);

  if (previousTimestamp === undefined || timestamp > previousTimestamp) {
    latestHistoricalCandleTimestamps.set(page, timestamp);
  }
};

const installBinanceMock = async (page: Page): Promise<void> => {
  await page.route(BINANCE_KLINES_URL, async (route) => {
    const url = new URL(route.request().url());
    const interval = url.searchParams.get('interval') ?? '1m';
    const startTime = Number(url.searchParams.get('startTime') ?? 0);
    const endTime = Number(url.searchParams.get('endTime') ?? Date.now());
    const candles = createKlines(interval, startTime, endTime);
    const latestCandle = candles.at(-1);

    if (latestCandle !== undefined) {
      updateLatestHistoricalCandleTimestamp(page, Number(latestCandle[0]));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(candles),
    });
  });

  await page.route('https://data-api.binance.vision/api/v3/exchangeInfo**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbols: [
          {
            status: 'TRADING',
            isSpotTradingAllowed: true,
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            filters: [{ filterType: 'PRICE_FILTER', tickSize: '0.01' }],
          },
          { status: 'TRADING', isSpotTradingAllowed: true, baseAsset: 'ETH', quoteAsset: 'USDT' },
          { status: 'TRADING', isSpotTradingAllowed: true, baseAsset: 'SOL', quoteAsset: 'USDT' },
          { status: 'TRADING', isSpotTradingAllowed: true, baseAsset: 'XRP', quoteAsset: 'USDT' },
          { status: 'TRADING', isSpotTradingAllowed: true, baseAsset: 'ETH', quoteAsset: 'BTC' },
          { status: 'TRADING', isSpotTradingAllowed: true, baseAsset: 'ADA', quoteAsset: 'USDT' },
          {
            status: 'TRADING',
            isSpotTradingAllowed: true,
            baseAsset: 'OLD/TOKEN',
            quoteAsset: 'USDT',
          },
          { status: 'TRADING', isSpotTradingAllowed: true, baseAsset: 'AVAX', quoteAsset: 'USDT' },
        ],
      }),
    });
  });
};

type WebSocketRoutes = Readonly<{
  binance: WebSocketRoute | null;
  binanceQuotes: WebSocketRoute | null;
  bybit: WebSocketRoute | null;
  bybitQuotes: WebSocketRoute | null;
  okx: WebSocketRoute | null;
  okxQuotes: WebSocketRoute | null;
}>;

type MutableWebSocketRoutes = {
  binance: WebSocketRoute | null;
  binanceQuotes: WebSocketRoute | null;
  bybit: WebSocketRoute | null;
  bybitQuotes: WebSocketRoute | null;
  okx: WebSocketRoute | null;
  okxQuotes: WebSocketRoute | null;
};

const webSocketRoutes = new WeakMap<Page, MutableWebSocketRoutes>();

const installWebSocketMock = async (page: Page): Promise<void> => {
  const routes: MutableWebSocketRoutes = {
    binance: null,
    binanceQuotes: null,
    bybit: null,
    bybitQuotes: null,
    okx: null,
    okxQuotes: null,
  };
  webSocketRoutes.set(page, routes);

  await page.routeWebSocket(/^wss:\/\/stream\.binance\.com:9443\/ws\//, (route) => {
    routes.binance = route;
  });

  await page.routeWebSocket(/^wss:\/\/stream\.binance\.com:9443\/stream\?/, (route) => {
    routes.binanceQuotes = route;
  });

  await page.routeWebSocket('wss://stream.bybit.com/v5/public/spot', (route) => {
    route.onMessage((message) => {
      if (typeof message !== 'string') {
        return;
      }

      const payload: unknown = JSON.parse(message);

      if (typeof payload !== 'object' || payload === null) {
        return;
      }

      const args = Reflect.get(payload, 'args');

      if (!Array.isArray(args)) {
        return;
      }

      if (args.some((argument) => typeof argument === 'string' && argument.startsWith('kline.'))) {
        routes.bybit = route;
      }

      if (
        args.some(
          (argument) =>
            typeof argument === 'string' &&
            (argument.startsWith('tickers.') || argument.startsWith('orderbook.1.')),
        )
      ) {
        routes.bybitQuotes = route;
      }
    });
  });

  await page.routeWebSocket('wss://ws.okx.com/ws/v5/business', (route) => {
    routes.okx = route;
  });

  await page.routeWebSocket('wss://ws.okx.com/ws/v5/public', (route) => {
    routes.okxQuotes = route;
  });

  await page.route('https://api.bybit.com/v5/market/instruments-info**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        retCode: 0,
        retMsg: 'OK',
        result: {
          category: 'spot',
          list: [
            { status: 'Trading', baseCoin: 'BTC', quoteCoin: 'USDT' },
            { status: 'Trading', baseCoin: 'ETH', quoteCoin: 'USDT' },
            { status: 'Trading', baseCoin: 'ADA', quoteCoin: 'USDT' },
            { status: 'Trading', baseCoin: 'SOL', quoteCoin: 'USDT' },
            { status: 'Trading', baseCoin: 'ETH', quoteCoin: 'BTC' },
          ],
        },
      }),
    });
  });

  await page.route('https://www.okx.com/api/v5/public/instruments**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: '0',
        msg: '',
        data: [
          { state: 'live', baseCcy: 'BTC', quoteCcy: 'USDT' },
          { state: 'live', baseCcy: 'ETH', quoteCcy: 'USDT' },
          { state: 'live', baseCcy: 'ADA', quoteCcy: 'USDT' },
          { state: 'live', baseCcy: 'SOL', quoteCcy: 'USDT' },
          { state: 'live', baseCcy: 'ETH', quoteCcy: 'BTC' },
        ],
      }),
    });
  });
};

const getWebSocketRoute = (page: Page, provider: keyof WebSocketRoutes): WebSocketRoute => {
  const route = webSocketRoutes.get(page)?.[provider];

  if (route === null || route === undefined) {
    throw new Error('The ' + provider + ' WebSocket route must be established first.');
  }

  return route;
};

test.beforeEach(async ({ page }) => {
  await installBinanceMock(page);
  await installWebSocketMock(page);
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

test('uses the compact chart toolbar to open symbol search and change timeframe', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const symbolSearch = page.getByTestId('toolbar-symbol-search');
  await expect(symbolSearch).toContainText('BTC / USDT');
  await symbolSearch.click();
  await expect(page.getByTestId('symbol-search-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('symbol-search-modal')).toHaveCount(0);

  const fiveMinute = page.getByTestId('chart-timeframe-5m');
  await expect(fiveMinute).toBeVisible();
  await fiveMinute.click();
  await expect(fiveMinute).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-interval', '5m');
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

  await canvas.scrollIntoViewIfNeeded();

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

test('streams Binance live candles and updates the current bar without duplicates', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  const streamStatus = page.getByTestId('market-stream-status');
  await expect.poll(async () => Number(await canvas.getAttribute('data-candles-count'))).toBe(500);
  await expect(streamStatus).toHaveAttribute('data-stream-status', 'connected');
  await expect(streamStatus).toHaveText('En vivo');

  const timestamp = getLatestHistoricalCandleTimestamp(page) + 60_000;
  const createStreamEvent = (close: string) => ({
    e: 'kline',
    s: 'BTCUSDT',
    k: {
      t: timestamp,
      T: timestamp + 59_999,
      s: 'BTCUSDT',
      i: '1m',
      o: '65000',
      h: '65100',
      l: '64900',
      c: close,
      v: '25',
      x: false,
    },
  });

  const sendEvent = async (close: string): Promise<void> => {
    getWebSocketRoute(page, 'binance').send(JSON.stringify(createStreamEvent(close)));
  };

  await sendEvent('65050');
  await expect(page.getByTestId('market-stream-error')).toHaveCount(0);
  await expect(streamStatus).toHaveAttribute('data-stream-candle-count', '1');
  await expect(canvas).toHaveAttribute('data-candles-count', '501');

  await sendEvent('65075');
  await expect(page.getByTestId('market-stream-error')).toHaveCount(0);
  await expect(streamStatus).toHaveAttribute('data-stream-candle-count', '2');
  await expect(canvas).toHaveAttribute('data-candles-count', '501');
  await expect(streamStatus).toHaveText('En vivo');
});

test('tracks multiple instruments and changes the selected chart market', async ({ page }) => {
  const requestedSymbols: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());

    if (url.pathname === '/api/v3/klines') {
      requestedSymbols.push(url.searchParams.get('symbol') ?? '');
    }
  });

  await page.goto('/');

  await expect(page.getByTestId('market-watchlist')).toBeVisible();
  await expect(page.getByTestId('watchlist-instrument')).toHaveCount(3);
  await expect(page.getByTestId('market-quote-panel')).toHaveAttribute(
    'data-quote-status',
    'connected',
  );

  const quotesRoute = getWebSocketRoute(page, 'binanceQuotes');
  const sendTicker = (symbol: string, last: string, bid: string, ask: string, change: string) => {
    quotesRoute.send(
      JSON.stringify({
        stream: `${symbol.toLowerCase()}@ticker`,
        data: {
          e: '24hrTicker',
          E: Date.now(),
          s: symbol,
          c: last,
          b: bid,
          a: ask,
          v: '25',
          P: change,
        },
      }),
    );
  };

  sendTicker('BTCUSDT', '65000', '64999', '65001', '1.5');
  sendTicker('ETHUSDT', '3500', '3499', '3501', '2.5');

  await expect(page.getByTestId('watchlist-last-BTC-USDT')).toHaveText('65.000');
  await expect(page.getByTestId('watchlist-last-ETH-USDT')).toHaveText('3.500');
  await expect(page.getByTestId('watchlist-change-ETH-USDT')).toHaveText('+2,5%');

  await page.getByRole('button', { name: 'Ethereum ETH / USDT' }).click();

  await expect(page.getByRole('button', { name: 'Ethereum ETH / USDT' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('quote-last')).toHaveText('3.500');
  await expect(page.getByRole('img', { name: /para ETH \/ USDT/ })).toBeVisible();
  await expect.poll(() => requestedSymbols.includes('ETHUSDT')).toBe(true);

  sendTicker('BTCUSDT', '65100', '65099', '65101', '1.7');
  await expect(page.getByTestId('watchlist-last-BTC-USDT')).toHaveText('65.100');
  await expect(page.getByTestId('quote-last')).toHaveText('3.500');
});

test('adds, removes and restores watchlist preferences after reload', async ({ page }) => {
  await page.goto('/');

  const watchlist = page.getByTestId('market-watchlist');

  await expect(watchlist).toHaveAttribute('data-catalog-status', 'ready');
  await expect(page.getByTestId('watchlist-instrument')).toHaveCount(3);
  await page.getByTestId('watchlist-open-search').click();
  await expect(page.getByTestId('symbol-search-modal')).toBeVisible();

  const search = page.getByTestId('watchlist-search');
  await search.fill('XRP');
  const searchResult = page.getByTestId('watchlist-search-result').first();
  await expect(searchResult).toContainText('XRPUSDT');
  await searchResult.click();

  await expect(page.getByTestId('watchlist-instrument')).toHaveCount(4);
  await expect(page.getByTestId('watchlist-remove-XRP-USDT')).toBeVisible();

  await page.getByRole('button', { name: 'Ethereum ETH / USDT' }).click();
  await page.getByTestId('watchlist-remove-ETH-USDT').click();
  await expect(page.getByTestId('watchlist-instrument')).toHaveCount(3);
  await expect(page.getByTestId('watchlist-remove-ETH-USDT')).toHaveCount(0);

  await page.getByRole('button', { name: 'Solana SOL / USDT' }).click();
  await expect(page.getByRole('button', { name: 'Solana SOL / USDT' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.reload();

  await expect(watchlist).toBeVisible();
  await expect(page.getByTestId('watchlist-instrument')).toHaveCount(3);
  await expect(page.getByTestId('watchlist-remove-XRP-USDT')).toBeVisible();
  await expect(page.getByTestId('watchlist-remove-ETH-USDT')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Solana SOL / USDT' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('img', { name: /para SOL \/ USDT/ })).toBeVisible();
});

test('searches continuous symbols across all Spot providers and filters by exchange', async ({
  page,
}) => {
  await page.route('https://api.bybit.com/v5/market/kline**', async (route) => {
    const url = new URL(route.request().url());
    const interval = url.searchParams.get('interval') === '5' ? '5m' : '1m';
    const startTime = Number(url.searchParams.get('start') ?? 0);
    const endTime = Number(url.searchParams.get('end') ?? Date.now());
    const candles = createBybitRows(interval, startTime, endTime);
    const latestCandle = candles.at(-1);

    if (latestCandle !== undefined) {
      updateLatestHistoricalCandleTimestamp(page, Number(latestCandle[0]));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        retCode: 0,
        retMsg: 'OK',
        result: { category: 'spot', symbol: 'ADAUSDT', list: candles },
      }),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('market-watchlist')).toHaveAttribute(
    'data-catalog-status',
    'ready',
  );
  await page.keyboard.press('/');

  const modal = page.getByTestId('symbol-search-modal');
  const search = page.getByTestId('watchlist-search');
  const results = page.getByTestId('watchlist-search-result');

  await expect(modal).toBeVisible();
  await search.fill('adausdt');
  await expect(results).toHaveCount(3);

  await search.fill('ADA / USDT');
  await expect(results).toHaveCount(3);
  await search.fill('adausdt');

  await expect(results.nth(0)).toHaveAttribute('data-provider-id', 'binance-spot');
  await expect(results.nth(1)).toHaveAttribute('data-provider-id', 'bybit-spot');
  await expect(results.nth(2)).toHaveAttribute('data-provider-id', 'okx-spot');

  await page.getByRole('button', { name: 'Bybit Spot' }).click();
  await expect(results).toHaveCount(1);
  await expect(results.first()).toHaveAttribute('data-provider-id', 'bybit-spot');

  await search.press('Enter');
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId('provider-select')).toHaveValue('bybit-spot');
  await expect(page.getByTestId('watchlist-remove-ADA-USDT')).toBeVisible();
  await expect(
    page.getByTestId('watchlist-instrument').filter({ hasText: 'ADA / USDT' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /para ADA \/ USDT/ })).toBeVisible();
});

test('searches valid instruments when the provider catalog contains unsupported asset codes', async ({
  page,
}) => {
  await page.goto('/');

  const watchlist = page.getByTestId('market-watchlist');
  await expect(watchlist).toHaveAttribute('data-catalog-status', 'ready');

  await page.getByTestId('watchlist-open-search').click();
  const search = page.getByTestId('watchlist-search');
  await search.fill('avaxusdt');

  const result = page.getByTestId('watchlist-search-result');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('AVAXUSDT');
  await result.click();

  await expect(page.getByTestId('watchlist-remove-AVAX-USDT')).toBeVisible();
  await expect(
    page.getByTestId('watchlist-instrument').filter({ hasText: 'AVAX / USDT' }),
  ).toBeVisible();
});

test('keeps watchlist entries visible when switching to a provider without that market', async ({
  page,
}) => {
  await page.goto('/');

  const watchlist = page.getByTestId('market-watchlist');
  const providerSelect = page.getByTestId('provider-select');

  await expect(watchlist).toHaveAttribute('data-catalog-status', 'ready');
  await page.getByTestId('watchlist-open-search').click();
  await page.getByTestId('watchlist-search').fill('XRP');
  await expect(page.getByTestId('watchlist-search-result')).toHaveCount(1);
  await page.getByTestId('watchlist-search-result').click();
  await expect(page.getByTestId('watchlist-remove-XRP-USDT')).toBeVisible();

  await providerSelect.selectOption('bybit-spot');
  await expect(watchlist).toHaveAttribute('data-catalog-status', 'ready');

  const unavailableInstrument = page.getByTestId('watchlist-instrument').filter({
    hasText: 'XRP / USDT',
  });

  await expect(unavailableInstrument).toBeDisabled();
  await expect(unavailableInstrument).toHaveAttribute('aria-disabled', 'true');

  await page.getByTestId('watchlist-open-search').click();
  await page.getByTestId('watchlist-search').fill('XRPUSDT');
  await expect(page.getByTestId('watchlist-search-result')).toHaveCount(1);
  await expect(page.getByTestId('watchlist-search-result')).toHaveAttribute(
    'data-provider-id',
    'binance-spot',
  );
  await page.keyboard.press('Escape');

  await page.getByTestId('watchlist-remove-XRP-USDT').click();
  await expect(page.getByTestId('watchlist-remove-XRP-USDT')).toHaveCount(0);
  await expect(page.getByTestId('watchlist-instrument')).toHaveCount(3);
});

test('displays normalized live quotes and refreshes them across Spot providers', async ({
  page,
}) => {
  await page.route('https://api.bybit.com/v5/market/kline**', async (route) => {
    const url = new URL(route.request().url());
    const interval = url.searchParams.get('interval') === '5' ? '5m' : '1m';
    const startTime = Number(url.searchParams.get('start') ?? 0);
    const endTime = Number(url.searchParams.get('end') ?? Date.now());
    const candles = createBybitRows(interval, startTime, endTime);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        retCode: 0,
        retMsg: 'OK',
        result: {
          category: 'spot',
          symbol: 'BTCUSDT',
          list: candles,
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

  const providerSelect = page.getByTestId('provider-select');
  const quotePanel = page.getByTestId('market-quote-panel');
  const quoteStatus = page.getByTestId('quote-stream-status');
  const lastPrice = page.getByTestId('quote-last');
  const change = page.getByTestId('quote-change-24h');
  const bid = page.getByTestId('quote-bid');
  const ask = page.getByTestId('quote-ask');
  const volume = page.getByTestId('quote-volume-24h');

  await expect(quotePanel).toHaveAttribute('data-quote-status', 'connected');

  getWebSocketRoute(page, 'binanceQuotes').send(
    JSON.stringify({
      stream: 'btcusdt@ticker',
      data: {
        e: '24hrTicker',
        E: Date.now(),
        s: 'BTCUSDT',
        c: '65000',
        b: '64999',
        a: '65001',
        v: '125.5',
        P: '1.5',
      },
    }),
  );

  await expect(lastPrice).toHaveText('65.000');
  await expect(change).toHaveText('+1,5%');
  await expect(bid).toHaveText('64.999');
  await expect(ask).toHaveText('65.001');
  await expect(volume).toHaveText('125,5');
  await expect(quoteStatus).toHaveText('En vivo');
  await expect(page.getByTestId('quote-received-at')).toBeVisible();
  await expect(page.getByTestId('quote-latency')).toBeVisible();

  await providerSelect.selectOption('bybit-spot');
  await expect(providerSelect).toHaveValue('bybit-spot');
  await expect(quotePanel).toHaveAttribute('data-quote-status', 'connected');

  const bybitQuotes = getWebSocketRoute(page, 'bybitQuotes');
  const bybitTimestamp = Date.now();
  bybitQuotes.send(
    JSON.stringify({
      topic: 'tickers.BTCUSDT',
      ts: bybitTimestamp,
      data: {
        symbol: 'BTCUSDT',
        lastPrice: '65100',
        volume24h: '130',
        price24hPcnt: '0.025',
      },
    }),
  );
  await expect(lastPrice).toHaveText('65.100');
  await expect(change).toHaveText('+2,5%');
  await expect(volume).toHaveText('130');

  bybitQuotes.send(
    JSON.stringify({
      topic: 'orderbook.1.BTCUSDT',
      ts: bybitTimestamp + 1,
      data: {
        s: 'BTCUSDT',
        b: [['65099', '2']],
        a: [['65101', '3']],
      },
    }),
  );
  await expect(bid).toHaveText('65.099');
  await expect(ask).toHaveText('65.101');

  await providerSelect.selectOption('okx-spot');
  await expect(providerSelect).toHaveValue('okx-spot');
  await expect(quotePanel).toHaveAttribute('data-quote-status', 'connected');

  getWebSocketRoute(page, 'okxQuotes').send(
    JSON.stringify({
      arg: { channel: 'tickers', instId: 'BTC-USDT' },
      data: [
        {
          instId: 'BTC-USDT',
          last: '65200',
          bidPx: '65199',
          askPx: '65201',
          open24h: '64000',
          vol24h: '140',
          ts: String(Date.now()),
        },
      ],
    }),
  );

  await expect(lastPrice).toHaveText('65.200');
  await expect(change).toHaveText('+1,88%');
  await expect(bid).toHaveText('65.199');
  await expect(ask).toHaveText('65.201');
  await expect(volume).toHaveText('140');
  await expect(quoteStatus).toHaveText('En vivo');
});

test('switches providers, streams Bybit and OKX candles and recovers history after reconnect', async ({
  page,
}) => {
  let bybitHistoryRequestCount = 0;

  await page.route('https://api.bybit.com/v5/market/kline**', async (route) => {
    bybitHistoryRequestCount += 1;

    if (bybitHistoryRequestCount > 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const url = new URL(route.request().url());
    const interval = url.searchParams.get('interval') === '5' ? '5m' : '1m';
    const startTime = Number(url.searchParams.get('start') ?? 0);
    const endTime = Number(url.searchParams.get('end') ?? Date.now());
    const candles = createBybitRows(interval, startTime, endTime);
    const latestCandle = candles.reduce<number | null>(
      (latest, row) => (latest === null ? Number(row[0]) : Math.max(latest, Number(row[0]))),
      null,
    );

    if (latestCandle !== null) {
      updateLatestHistoricalCandleTimestamp(page, latestCandle);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        retCode: 0,
        retMsg: 'OK',
        result: {
          category: 'spot',
          symbol: 'BTCUSDT',
          list: candles,
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
    const latestCandle = rows.reduce<number | null>(
      (latest, row) => (latest === null ? Number(row[0]) : Math.max(latest, Number(row[0]))),
      null,
    );

    if (latestCandle !== null) {
      updateLatestHistoricalCandleTimestamp(page, latestCandle);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: '0', msg: '', data: rows }),
    });
  });

  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  const providerSelect = page.getByTestId('provider-select');
  const streamStatus = page.getByTestId('market-stream-status');

  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  await providerSelect.selectOption('bybit-spot');
  await expect(providerSelect).toHaveValue('bybit-spot');
  await expect(streamStatus).toHaveAttribute('data-stream-status', 'connected');
  await expect(streamStatus).toHaveText('En vivo');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  expect(bybitHistoryRequestCount).toBe(1);

  await getWebSocketRoute(page, 'bybit').close();
  await expect(streamStatus).toHaveText('Reconectando');
  await expect.poll(() => bybitHistoryRequestCount).toBeGreaterThan(1);
  await expect(streamStatus).toHaveText('En vivo');
  await expect
    .poll(async () => Number(await streamStatus.getAttribute('data-history-recovery-count')))
    .toBe(1);
  await page.waitForTimeout(100);
  const baselineCandleCount = Number(await canvas.getAttribute('data-candles-count'));

  const timestamp = getLatestHistoricalCandleTimestamp(page) + 60_000;
  const sendBybitCandle = (close: string, candleTimestamp = timestamp): void => {
    getWebSocketRoute(page, 'bybit').send(
      JSON.stringify({
        topic: 'kline.1.BTCUSDT',
        type: 'snapshot',
        data: [
          {
            start: candleTimestamp,
            end: candleTimestamp + 59_999,
            interval: '1',
            open: '65000',
            high: '65100',
            low: '64900',
            close,
            volume: '25',
            confirm: false,
          },
        ],
      }),
    );
  };

  sendBybitCandle('65050');
  await expect(canvas).toHaveAttribute('data-candles-count', String(baselineCandleCount + 1));
  sendBybitCandle('65075');
  await expect(canvas).toHaveAttribute('data-candles-count', String(baselineCandleCount + 1));

  sendBybitCandle('65100', timestamp + 2 * 60_000);
  await expect.poll(() => bybitHistoryRequestCount).toBeGreaterThan(2);
  await expect
    .poll(async () => Number(await streamStatus.getAttribute('data-history-recovery-count')))
    .toBe(2);
  await page.waitForTimeout(100);
  await expect(canvas).toHaveAttribute('data-candles-count', String(baselineCandleCount + 3));

  await providerSelect.selectOption('okx-spot');
  await expect(providerSelect).toHaveValue('okx-spot');
  await expect(streamStatus).toHaveAttribute('data-stream-status', 'connected');
  await expect(streamStatus).toHaveText('En vivo');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const okxTimestamp = getLatestHistoricalCandleTimestamp(page) + 60_000;
  const sendOkxCandle = (close: string): void => {
    getWebSocketRoute(page, 'okx').send(
      JSON.stringify({
        arg: { channel: 'candle1m', instId: 'BTC-USDT' },
        data: [[String(okxTimestamp), '65000', '65100', '64900', close, '25', '25', '25', '0']],
      }),
    );
  };

  await expect(streamStatus).toHaveAttribute('data-stream-candle-count', '0');
  const okxCandleCount = Number(await canvas.getAttribute('data-candles-count'));
  sendOkxCandle('65050');
  await expect(streamStatus).toHaveAttribute('data-stream-candle-count', '1');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(okxCandleCount);
  await page.waitForTimeout(100);
  const candleCountAfterFirstUpdate = Number(await canvas.getAttribute('data-candles-count'));

  sendOkxCandle('65075');
  await expect(streamStatus).toHaveAttribute('data-stream-candle-count', '2');
  await page.waitForTimeout(100);
  await expect(canvas).toHaveAttribute('data-candles-count', String(candleCountAfterFirstUpdate));
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
  await canvas.scrollIntoViewIfNeeded();

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

test('changes chart rendering style between candles, bars, line and area', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  const chartType = page.getByTestId('chart-type-select');

  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  await expect(canvas).toHaveAttribute('data-chart-type', 'candles');

  const initialImage = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

  await chartType.selectOption('line');
  await expect(canvas).toHaveAttribute('data-chart-type', 'line');
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(initialImage);

  await chartType.selectOption('area');
  await expect(canvas).toHaveAttribute('data-chart-type', 'area');

  await chartType.selectOption('bars');
  await expect(canvas).toHaveAttribute('data-chart-type', 'bars');

  await chartType.selectOption('candles');
  await expect(canvas).toHaveAttribute('data-chart-type', 'candles');
});

test('adds and removes SMA and EMA overlays from the chart', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  await expect(canvas).toHaveAttribute('data-indicator-count', '0');

  const indicatorMenu = page.getByTestId('chart-indicators-menu');
  await indicatorMenu.locator('summary').click();

  const sma20 = page.getByTestId('chart-indicator-sma-20');
  const ema20 = page.getByTestId('chart-indicator-ema-20');
  const initialImage = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

  await sma20.check();
  await expect(canvas).toHaveAttribute('data-indicator-count', '1');
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(initialImage);

  await ema20.check();
  await expect(canvas).toHaveAttribute('data-indicator-count', '2');
  await sma20.uncheck();
  await expect(canvas).toHaveAttribute('data-indicator-count', '1');
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

  await canvas.scrollIntoViewIfNeeded();

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
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThanOrEqual(500);
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

test('controls future chart margin and returns to the realtime edge', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  const rightOffset = page.getByTestId('chart-right-offset');

  await expect(canvas).toHaveAttribute('data-chart-ready', 'true');
  await rightOffset.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect(canvas).toHaveAttribute('data-right-offset', '12');
  await expect(rightOffset).toHaveValue('12');

  await page.getByTestId('chart-go-realtime').click();

  await expect(canvas).toHaveAttribute('data-right-offset', '0');
  await expect(rightOffset).toHaveValue('0');
});

test('preserves the temporal offset when older history is prepended', async ({ page }) => {
  await page.goto('/');

  const canvas = page.locator('canvas[data-candles-count]');
  await expect.poll(async () => Number(await canvas.getAttribute('data-candles-count'))).toBe(500);
  await expect(canvas).toHaveAttribute('data-navigation-mode', 'realtime');

  await canvas.scrollIntoViewIfNeeded();

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await page.mouse.wheel(-2600, 0);
  await expect(canvas).toHaveAttribute('data-navigation-mode', 'historical');

  const offsetBeforeHistory = await canvas.getAttribute('data-right-offset');
  expect(offsetBeforeHistory).not.toBeNull();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(500);
  await expect(canvas).toHaveAttribute('data-right-offset', offsetBeforeHistory ?? '');

  await page.getByTestId('chart-go-realtime').click();
  await expect(canvas).toHaveAttribute('data-navigation-mode', 'realtime');
  await expect(canvas).toHaveAttribute('data-follow-latest', 'true');
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

test('draws geometric annotations and supports undo, redo and clearing', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const drawDrag = async (
    toolId: string,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ) => {
    await page.getByTestId(toolId).click();
    await page.mouse.move(fromX, fromY);
    await page.mouse.down();
    await page.mouse.move(toX, toY);
    await page.mouse.up();
  };

  const startX = bounds.x + bounds.width * 0.28;
  const startY = bounds.y + bounds.height * 0.32;
  const endX = bounds.x + bounds.width * 0.52;
  const endY = bounds.y + bounds.height * 0.54;

  await drawDrag('drawing-tool-trend-line', startX, startY, endX, endY);
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');

  await drawDrag('drawing-tool-ray', startX + 12, startY + 20, endX + 30, endY - 15);
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');

  await page.getByTestId('drawing-tool-horizontal-line').click();
  await page.mouse.click(bounds.x + bounds.width * 0.64, bounds.y + bounds.height * 0.62);
  await expect(canvas).toHaveAttribute('data-drawing-count', '3');

  await page.getByTestId('drawing-tool-vertical-line').click();
  await page.mouse.click(bounds.x + bounds.width * 0.72, bounds.y + bounds.height * 0.42);
  await expect(canvas).toHaveAttribute('data-drawing-count', '4');

  await drawDrag(
    'drawing-tool-rectangle',
    bounds.x + bounds.width * 0.36,
    bounds.y + bounds.height * 0.24,
    bounds.x + bounds.width * 0.58,
    bounds.y + bounds.height * 0.68,
  );
  await expect(canvas).toHaveAttribute('data-drawing-count', '5');
  await expect(canvas).toHaveAttribute('data-drawing-undo-count', '5');

  const undo = page.getByTestId('drawing-undo');
  const redo = page.getByTestId('drawing-redo');

  await undo.click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '4');
  await expect(canvas).toHaveAttribute('data-drawing-redo-count', '1');
  await redo.click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '5');
  await expect(canvas).toHaveAttribute('data-drawing-redo-count', '0');

  await page.getByTestId('drawing-clear-all').click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '0');
  await undo.click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '5');
  await redo.click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '0');
});

test('persists the TradingView drawing magnet preference', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  await page.getByTestId('drawing-magnet-toggle').click();
  const menu = page.getByTestId('drawing-magnet-menu');
  await expect(menu).toBeVisible();
  await page.getByTestId('drawing-magnet-weak').click();
  await expect(canvas).toHaveAttribute('data-drawing-magnet-mode', 'weak');

  await page.getByTestId('drawing-magnet-toggle').click();
  await expect(menu).toBeVisible();
  await page.getByTestId('drawing-magnet-indicators').click();
  await expect(canvas).toHaveAttribute('data-drawing-snap-to-indicators', 'true');

  const savedPreferences = await page.evaluate(() => {
    const serialized = window.localStorage.getItem(
      'openview.chart.drawing-interaction-preferences',
    );

    return serialized === null ? null : JSON.parse(serialized);
  });

  expect(savedPreferences).toEqual({
    version: 1,
    magnetMode: 'weak',
    snapToIndicators: true,
    keepDrawing: false,
  });

  await page.reload();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  await page.getByTestId('drawing-tool-trend-line').click();
  await expect(canvas).toHaveAttribute('data-drawing-magnet-mode', 'weak');
  await expect(canvas).toHaveAttribute('data-drawing-snap-to-indicators', 'true');

  await page.getByTestId('drawing-magnet-toggle').click();
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('drawing-magnet-weak')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('drawing-magnet-indicators')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('returns to the cursor by default and keeps the tool active when requested', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const drawTrendLine = async (offset: number): Promise<void> => {
    const bounds = await canvas.boundingBox();

    if (bounds === null) {
      throw new Error('The chart canvas must have a visible bounding box.');
    }

    const startX = bounds.x + bounds.width * 0.3 + offset;
    const startY = bounds.y + bounds.height * 0.34;
    const endX = bounds.x + bounds.width * 0.56 + offset;
    const endY = bounds.y + bounds.height * 0.6;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();
  };

  const trendLineTool = page.getByTestId('drawing-tool-trend-line');

  await trendLineTool.click();
  await expect(trendLineTool).toHaveAttribute('aria-pressed', 'true');
  await drawTrendLine(0);
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');
  await expect(trendLineTool).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('keep-drawing-toggle').click();
  await expect(canvas).toHaveAttribute('data-keep-drawing', 'true');
  const savedPreferences = await page.evaluate(() => {
    const serialized = window.localStorage.getItem(
      'openview.chart.drawing-interaction-preferences',
    );

    return serialized === null ? null : JSON.parse(serialized);
  });
  expect(savedPreferences).toEqual({
    version: 1,
    magnetMode: 'off',
    snapToIndicators: false,
    keepDrawing: true,
  });

  await trendLineTool.click();
  await drawTrendLine(90);
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');
  await expect(trendLineTool).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  await trendLineTool.click();
  await expect(canvas).toHaveAttribute('data-keep-drawing', 'true');
  await expect(trendLineTool).toHaveAttribute('aria-pressed', 'true');
  const drawingCountAfterReload = Number(await canvas.getAttribute('data-drawing-count'));
  await drawTrendLine(160);
  await expect(canvas).toHaveAttribute('data-drawing-count', String(drawingCountAfterReload + 1));
  await expect(trendLineTool).toHaveAttribute('aria-pressed', 'true');
});

test('locks all drawings and prevents selection until they are unlocked', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const startX = bounds.x + bounds.width * 0.3;
  const startY = bounds.y + bounds.height * 0.34;
  const endX = bounds.x + bounds.width * 0.58;
  const endY = bounds.y + bounds.height * 0.56;

  await page.getByTestId('drawing-tool-trend-line').click();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');

  const lockButton = page.getByTestId('drawings-lock-toggle');
  await expect(lockButton).toBeEnabled();
  await lockButton.click();
  await expect(lockButton).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-drawings-locked', 'true');

  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click((startX + endX) / 2, (startY + endY) / 2);
  await expect(canvas).toHaveAttribute('data-selected-drawing-id', '');

  await lockButton.click();
  await expect(lockButton).toHaveAttribute('aria-pressed', 'false');
  await expect(canvas).toHaveAttribute('data-drawings-locked', 'false');
  await page.mouse.click((startX + endX) / 2, (startY + endY) / 2);
  await expect(canvas).toHaveAttribute('data-selected-drawing-id', 'drawing-1');
});

test('hides drawings without deleting them and restores their selection', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const startX = bounds.x + bounds.width * 0.3;
  const startY = bounds.y + bounds.height * 0.34;
  const endX = bounds.x + bounds.width * 0.58;
  const endY = bounds.y + bounds.height * 0.56;
  const middleX = (startX + endX) / 2;
  const middleY = (startY + endY) / 2;

  await page.getByTestId('drawing-tool-trend-line').click();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');

  const visibilityButton = page.getByTestId('drawings-visibility-toggle');
  await visibilityButton.click();
  await expect(visibilityButton).toHaveAttribute('aria-pressed', 'true');
  await expect(visibilityButton).toHaveAttribute('aria-label', 'Mostrar dibujos');
  await expect(canvas).toHaveAttribute('data-drawings-visible', 'false');
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');
  await expect(canvas).toHaveAttribute('data-renderable-drawing-count', '0');

  await expect(canvas).toHaveAttribute('data-selected-drawing-id', '');

  await visibilityButton.click();
  await expect(visibilityButton).toHaveAttribute('aria-pressed', 'false');
  await expect(visibilityButton).toHaveAttribute('aria-label', 'Ocultar dibujos');
  await expect(canvas).toHaveAttribute('data-drawings-visible', 'true');
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');
  await expect(canvas).toHaveAttribute('data-renderable-drawing-count', '1');

  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click(middleX, middleY - 12);
  await expect(canvas).toHaveAttribute('data-selected-drawing-id', 'drawing-1');
});

test('selects multiple drawings with Ctrl click and marquee, then moves them together', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const firstStart = { x: bounds.x + bounds.width * 0.3, y: bounds.y + bounds.height * 0.29 };
  const firstEnd = { x: bounds.x + bounds.width * 0.54, y: bounds.y + bounds.height * 0.44 };
  const secondStart = { x: bounds.x + bounds.width * 0.3, y: bounds.y + bounds.height * 0.53 };
  const secondEnd = { x: bounds.x + bounds.width * 0.54, y: bounds.y + bounds.height * 0.68 };
  const midpoint = (start: { x: number; y: number }, end: { x: number; y: number }) => ({
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  });
  const firstBody = midpoint(firstStart, firstEnd);
  const secondBody = midpoint(secondStart, secondEnd);
  const drawLine = async (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): Promise<void> => {
    await page.getByTestId('drawing-tool-trend-line').click();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
  };

  await drawLine(firstStart, firstEnd);
  await drawLine(secondStart, secondEnd);
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');

  const selectTool = page.getByTestId('drawing-tool-select');
  await selectTool.click();
  await page.keyboard.down('Control');
  await page.mouse.click(firstBody.x, firstBody.y);
  await page.mouse.click(secondBody.x, secondBody.y);
  await page.keyboard.up('Control');

  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');
  await expect(canvas).toHaveAttribute('data-selected-drawing-ids', 'drawing-1,drawing-2');
  const selectedStartPrice = Number(await canvas.getAttribute('data-selected-drawing-start-price'));

  await page.mouse.move(firstBody.x, firstBody.y);
  await page.mouse.down();
  await page.mouse.move(firstBody.x + 24, firstBody.y + 16);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');
  await expect(canvas).toHaveAttribute('data-selected-drawing-ids', 'drawing-1,drawing-2');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-selected-drawing-start-price')))
    .not.toBe(selectedStartPrice);

  await page.mouse.click(bounds.x + bounds.width * 0.84, bounds.y + bounds.height * 0.48);
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '0');

  await page.keyboard.down('Control');
  await page.mouse.move(bounds.x + bounds.width * 0.22, bounds.y + bounds.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.64, bounds.y + bounds.height * 0.74);
  await expect(page.getByTestId('drawing-selection-marquee')).toBeVisible();
  await page.mouse.up();
  await page.keyboard.up('Control');

  await expect(page.getByTestId('drawing-selection-marquee')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');
  await expect(canvas).toHaveAttribute('data-selected-drawing-ids', 'drawing-1,drawing-2');

  const colorPicker = page.getByTestId('drawing-style-color');
  await colorPicker.evaluate((element: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(element, '#ef4444');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(canvas).toHaveAttribute('data-selected-drawing-colors', '#ef4444,#ef4444');

  await page.getByTestId('drawing-style-width').selectOption('4');
  await expect(canvas).toHaveAttribute('data-selected-drawing-widths', '4,4');
});

test('moves all selected drawings by one bar and one market tick with arrow keys', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-price-increment')))
    .toBeGreaterThan(0);

  const bounds = await canvas.boundingBox();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const firstStart = { x: bounds.x + bounds.width * 0.29, y: bounds.y + bounds.height * 0.28 };
  const firstEnd = { x: bounds.x + bounds.width * 0.52, y: bounds.y + bounds.height * 0.43 };
  const secondStart = { x: bounds.x + bounds.width * 0.29, y: bounds.y + bounds.height * 0.55 };
  const secondEnd = { x: bounds.x + bounds.width * 0.52, y: bounds.y + bounds.height * 0.7 };
  const midpoint = (start: { x: number; y: number }, end: { x: number; y: number }) => ({
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  });
  const firstBody = midpoint(firstStart, firstEnd);
  const secondBody = midpoint(secondStart, secondEnd);
  const drawLine = async (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): Promise<void> => {
    await page.getByTestId('drawing-tool-trend-line').click();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
  };
  const readSelectedPrices = async (): Promise<number[]> =>
    JSON.parse(
      (await canvas.getAttribute('data-selected-drawing-start-prices')) ?? '[]',
    ) as number[];
  const readSelectedTimestamps = async (): Promise<number[]> =>
    JSON.parse(
      (await canvas.getAttribute('data-selected-drawing-start-timestamps')) ?? '[]',
    ) as number[];

  await drawLine(firstStart, firstEnd);
  await drawLine(secondStart, secondEnd);
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');

  await page.getByTestId('drawing-tool-select').click();
  await page.keyboard.down('Control');
  await page.mouse.click(firstBody.x, firstBody.y);
  await page.mouse.click(secondBody.x, secondBody.y);
  await page.keyboard.up('Control');
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');

  const tickSize = Number(await canvas.getAttribute('data-price-increment'));
  const pricesBefore = await readSelectedPrices();
  const timestampsBefore = await readSelectedTimestamps();
  expect(pricesBefore).toHaveLength(2);
  expect(timestampsBefore).toHaveLength(2);

  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(readSelectedTimestamps)
    .toEqual(timestampsBefore.map((value) => value + 60_000));
  await expect.poll(readSelectedPrices).toEqual(pricesBefore);

  const timestampsAfterRight = await readSelectedTimestamps();
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(readSelectedPrices)
    .toEqual(pricesBefore.map((value) => value + tickSize));
  await expect.poll(readSelectedTimestamps).toEqual(timestampsAfterRight);
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');
  await expect(canvas).toHaveAttribute('data-drawing-undo-count', '4');
});

test('nudges every selected drawing by one bar and one provider tick', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-price-increment')))
    .toBeGreaterThan(0);

  const bounds = await canvas.boundingBox();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const firstStart = { x: bounds.x + bounds.width * 0.29, y: bounds.y + bounds.height * 0.28 };
  const firstEnd = { x: bounds.x + bounds.width * 0.52, y: bounds.y + bounds.height * 0.43 };
  const secondStart = { x: bounds.x + bounds.width * 0.29, y: bounds.y + bounds.height * 0.55 };
  const secondEnd = { x: bounds.x + bounds.width * 0.52, y: bounds.y + bounds.height * 0.7 };
  const midpoint = (start: { x: number; y: number }, end: { x: number; y: number }) => ({
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  });
  const drawLine = async (
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): Promise<void> => {
    await page.getByTestId('drawing-tool-trend-line').click();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();
  };
  const readSelectedPrices = async (): Promise<number[]> =>
    JSON.parse(
      (await canvas.getAttribute('data-selected-drawing-start-prices')) ?? '[]',
    ) as number[];
  const readSelectedTimestamps = async (): Promise<number[]> =>
    JSON.parse(
      (await canvas.getAttribute('data-selected-drawing-start-timestamps')) ?? '[]',
    ) as number[];

  await drawLine(firstStart, firstEnd);
  await drawLine(secondStart, secondEnd);
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');

  await page.getByTestId('drawing-tool-select').click();
  await page.keyboard.down('Control');
  await page.mouse.click(midpoint(firstStart, firstEnd).x, midpoint(firstStart, firstEnd).y);
  await page.mouse.click(midpoint(secondStart, secondEnd).x, midpoint(secondStart, secondEnd).y);
  await page.keyboard.up('Control');
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');

  const priceIncrement = Number(await canvas.getAttribute('data-price-increment'));
  const pricesBefore = await readSelectedPrices();
  const timestampsBefore = await readSelectedTimestamps();
  expect(pricesBefore).toHaveLength(2);
  expect(timestampsBefore).toHaveLength(2);

  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(readSelectedTimestamps)
    .toEqual(timestampsBefore.map((timestamp) => timestamp + 60_000));
  await expect.poll(readSelectedPrices).toEqual(pricesBefore);

  const timestampsAfterRight = await readSelectedTimestamps();
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(readSelectedPrices)
    .toEqual(pricesBefore.map((price) => price + priceIncrement));
  await expect.poll(readSelectedTimestamps).toEqual(timestampsAfterRight);
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');
  await expect(canvas).toHaveAttribute('data-drawing-undo-count', '4');
});

test('selects, moves, edits and deletes a drawing individually', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const startX = bounds.x + bounds.width * 0.3;
  const startY = bounds.y + bounds.height * 0.34;
  const endX = bounds.x + bounds.width * 0.58;
  const endY = bounds.y + bounds.height * 0.56;

  await page.getByTestId('drawing-tool-trend-line').click();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');

  const selectTool = page.getByTestId('drawing-tool-select');
  await selectTool.click();
  const middleX = (startX + endX) / 2;
  const middleY = (startY + endY) / 2;
  await page.mouse.click(middleX, middleY);

  await expect(canvas).toHaveAttribute('data-selected-drawing-id', 'drawing-1');
  const propertiesPanel = page.getByTestId('drawing-properties-panel');
  await expect(propertiesPanel).toBeVisible();

  const colorPicker = page.getByTestId('drawing-style-color');
  await colorPicker.evaluate((element: HTMLInputElement) => {
    element.value = '#ef4444';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(canvas).toHaveAttribute('data-selected-drawing-color', '#ef4444');

  await page.getByTestId('drawing-style-width').selectOption('4');
  await expect(canvas).toHaveAttribute('data-selected-drawing-width', '4');
  await page.getByTestId('drawing-style-line').selectOption('dashed');
  await expect(canvas).toHaveAttribute('data-selected-drawing-line-style', 'dashed');

  await page.getByTestId('drawing-extend-start').check();
  await expect(canvas).toHaveAttribute('data-selected-drawing-extend-start', 'true');
  await page.getByTestId('drawing-extend-end').check();
  await expect(canvas).toHaveAttribute('data-selected-drawing-extend-end', 'true');
  await page.getByTestId('drawing-start-style').selectOption('arrow');
  await expect(canvas).toHaveAttribute('data-selected-drawing-start-style', 'arrow');
  await page.getByTestId('drawing-end-style').selectOption('circle');
  await expect(canvas).toHaveAttribute('data-selected-drawing-end-style', 'circle');

  const panelBeforeDrag = await propertiesPanel.boundingBox();
  const dragHandle = page.getByTestId('drawing-properties-drag-handle');
  const dragHandleBounds = await dragHandle.boundingBox();
  expect(panelBeforeDrag).not.toBeNull();
  expect(dragHandleBounds).not.toBeNull();

  if (panelBeforeDrag === null || dragHandleBounds === null) {
    throw new Error('The drawing properties panel must be visible before dragging.');
  }

  await page.mouse.move(
    dragHandleBounds.x + dragHandleBounds.width / 2,
    dragHandleBounds.y + dragHandleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dragHandleBounds.x + dragHandleBounds.width / 2 + 45,
    dragHandleBounds.y + dragHandleBounds.height / 2 + 30,
  );
  await page.mouse.up();

  const panelAfterDrag = await propertiesPanel.boundingBox();
  expect(panelAfterDrag).not.toBeNull();

  if (panelAfterDrag === null) {
    throw new Error('The drawing properties panel must remain visible after dragging.');
  }

  expect(panelAfterDrag.x).toBeGreaterThan(panelBeforeDrag.x + 20);
  expect(panelAfterDrag.y).toBeGreaterThan(panelBeforeDrag.y + 10);

  const coordinatePanel = page.getByTestId('drawing-coordinate-panel');
  await expect(coordinatePanel).toBeVisible();
  const coordinateBeforeDrag = await coordinatePanel.boundingBox();
  const coordinateHandle = page.getByTestId('drawing-coordinate-drag-handle');
  const coordinateHandleBounds = await coordinateHandle.boundingBox();

  expect(coordinateBeforeDrag).not.toBeNull();
  expect(coordinateHandleBounds).not.toBeNull();

  if (coordinateBeforeDrag === null || coordinateHandleBounds === null) {
    throw new Error('The drawing coordinate panel must be visible before dragging.');
  }

  await page.mouse.move(
    coordinateHandleBounds.x + coordinateHandleBounds.width / 2,
    coordinateHandleBounds.y + coordinateHandleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    coordinateHandleBounds.x + coordinateHandleBounds.width / 2 + 38,
    coordinateHandleBounds.y + coordinateHandleBounds.height / 2 + 24,
  );
  await page.mouse.up();

  const coordinateAfterDrag = await coordinatePanel.boundingBox();
  expect(coordinateAfterDrag).not.toBeNull();

  if (coordinateAfterDrag === null) {
    throw new Error('The drawing coordinate panel must remain visible after dragging.');
  }

  expect(coordinateAfterDrag.x).toBeGreaterThan(coordinateBeforeDrag.x + 20);
  expect(coordinateAfterDrag.y).toBeGreaterThan(coordinateBeforeDrag.y + 10);

  const savedAppearancePosition = await propertiesPanel.evaluate((element: HTMLElement) => ({
    left: element.style.left,
    top: element.style.top,
  }));
  const savedCoordinatePosition = await coordinatePanel.evaluate((element: HTMLElement) => ({
    left: element.style.left,
    top: element.style.top,
  }));

  await page.getByTestId('drawing-editor-close').click();
  await expect(propertiesPanel).toBeHidden();
  await expect(coordinatePanel).toBeVisible();
  await expect(canvas).toHaveAttribute('data-selected-drawing-id', 'drawing-1');

  await page.getByTestId('drawing-coordinate-close').click();
  await expect(coordinatePanel).toBeHidden();
  await expect(propertiesPanel).toBeHidden();
  await page.getByTestId('drawing-panel-toggle-appearance').click();
  await expect(propertiesPanel).toBeVisible();
  await page.getByTestId('drawing-panel-toggle-coordinates').click();
  await expect(coordinatePanel).toBeVisible();

  const selectedImage = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.mouse.move(middleX, middleY);
  await page.mouse.down();
  await page.mouse.move(middleX + 35, middleY - 18);
  await page.mouse.up();

  await expect(canvas).toHaveAttribute('data-selected-drawing-id', 'drawing-1');
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(selectedImage);

  const movedStartX = startX + 35;
  const movedStartY = startY - 18;
  const startAnchorBefore = {
    price: Number(await canvas.getAttribute('data-selected-drawing-start-price')),
    timestamp: Number(await canvas.getAttribute('data-selected-drawing-start-timestamp')),
  };
  const endAnchorBefore = {
    price: Number(await canvas.getAttribute('data-selected-drawing-end-price')),
    timestamp: Number(await canvas.getAttribute('data-selected-drawing-end-timestamp')),
  };
  await page.mouse.move(movedStartX, movedStartY);
  await page.mouse.down();
  await page.mouse.move(movedStartX + 18, movedStartY + 14);
  await page.mouse.up();

  await expect
    .poll(async () => Number(await canvas.getAttribute('data-selected-drawing-start-price')))
    .not.toBe(startAnchorBefore.price);
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-selected-drawing-start-timestamp')))
    .not.toBe(startAnchorBefore.timestamp);
  await expect(canvas).toHaveAttribute(
    'data-selected-drawing-end-price',
    String(endAnchorBefore.price),
  );
  await expect(canvas).toHaveAttribute(
    'data-selected-drawing-end-timestamp',
    String(endAnchorBefore.timestamp),
  );

  await page.getByTestId('drawing-editor-close').click();
  await expect(propertiesPanel).toBeHidden();
  await expect(coordinatePanel).toBeVisible();

  const deleteSelected = page.getByTestId('drawing-delete-selected');
  await expect(deleteSelected).toBeEnabled();
  await deleteSelected.click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '0');
  await expect(canvas).toHaveAttribute('data-selected-drawing-id', '');

  await page.getByTestId('drawing-undo').click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');
  await page.getByTestId('drawing-redo').click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '0');

  const persistedPanelLayout = await page.evaluate(() => {
    const serialized = window.localStorage.getItem('openview.chart.drawing-panel-layout');

    if (serialized === null) {
      return null;
    }

    return JSON.parse(serialized) as {
      positions: {
        appearance: { left: number; top: number } | null;
        coordinates: { left: number; top: number } | null;
      };
      visible: { appearance: boolean; coordinates: boolean };
    };
  });

  expect(persistedPanelLayout).not.toBeNull();

  if (persistedPanelLayout === null) {
    throw new Error('The drawing panel layout must be persisted before reloading.');
  }

  expect(persistedPanelLayout.positions.appearance).toEqual({
    left: Number.parseFloat(savedAppearancePosition.left),
    top: Number.parseFloat(savedAppearancePosition.top),
  });
  expect(persistedPanelLayout.positions.coordinates).toEqual({
    left: Number.parseFloat(savedCoordinatePosition.left),
    top: Number.parseFloat(savedCoordinatePosition.top),
  });
  expect(persistedPanelLayout.visible).toEqual({ appearance: false, coordinates: true });

  await page.reload();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const reloadedBounds = await canvas.boundingBox();
  expect(reloadedBounds).not.toBeNull();

  if (reloadedBounds === null) {
    throw new Error('The chart canvas must remain visible after reloading.');
  }

  const reloadedStartX = reloadedBounds.x + reloadedBounds.width * 0.3;
  const reloadedStartY = reloadedBounds.y + reloadedBounds.height * 0.34;
  const reloadedEndX = reloadedBounds.x + reloadedBounds.width * 0.58;
  const reloadedEndY = reloadedBounds.y + reloadedBounds.height * 0.56;

  await page.getByTestId('drawing-tool-trend-line').click();
  await page.mouse.move(reloadedStartX, reloadedStartY);
  await page.mouse.down();
  await page.mouse.move(reloadedEndX, reloadedEndY);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');
  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click((reloadedStartX + reloadedEndX) / 2, (reloadedStartY + reloadedEndY) / 2);

  await expect(canvas).toHaveAttribute('data-selected-drawing-id', 'drawing-1');
  await expect(propertiesPanel).toBeHidden();

  const restoredCoordinatePanel = page.getByTestId('drawing-coordinate-panel');
  await expect(restoredCoordinatePanel).toBeVisible();
  await expect(restoredCoordinatePanel).toHaveAttribute(
    'data-panel-left',
    String(persistedPanelLayout.positions.coordinates?.left ?? 'default'),
  );
  await expect(restoredCoordinatePanel).toHaveAttribute(
    'data-panel-top',
    String(persistedPanelLayout.positions.coordinates?.top ?? 'default'),
  );
  const restoredCoordinatePosition = await restoredCoordinatePanel.evaluate(
    (element: HTMLElement) => ({
      left: element.style.left,
      top: element.style.top,
    }),
  );

  expect(restoredCoordinatePosition).toEqual(savedCoordinatePosition);

  await page.getByTestId('drawing-panel-toggle-appearance').click();
  await expect(propertiesPanel).toBeVisible();
  await expect(propertiesPanel).toHaveAttribute(
    'data-panel-left',
    String(persistedPanelLayout.positions.appearance?.left ?? 'default'),
  );
  await expect(propertiesPanel).toHaveAttribute(
    'data-panel-top',
    String(persistedPanelLayout.positions.appearance?.top ?? 'default'),
  );
  const restoredAppearancePosition = await propertiesPanel.evaluate((element: HTMLElement) => ({
    left: element.style.left,
    top: element.style.top,
  }));

  expect(restoredAppearancePosition).toEqual(savedAppearancePosition);
});

test('edits rectangle fill color and opacity', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const startX = bounds.x + bounds.width * 0.32;
  const startY = bounds.y + bounds.height * 0.3;
  const endX = bounds.x + bounds.width * 0.56;
  const endY = bounds.y + bounds.height * 0.65;

  await page.getByTestId('drawing-tool-rectangle').click();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');

  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click((startX + endX) / 2, (startY + endY) / 2);
  await expect(canvas).toHaveAttribute('data-selected-drawing-type', 'rectangle');

  const fillProperties = page.getByTestId('drawing-rectangle-properties');
  await expect(fillProperties).toBeVisible();
  await expect(page.getByTestId('drawing-fill-opacity')).toHaveValue('0');

  const fillColor = page.getByTestId('drawing-fill-color');
  await fillColor.evaluate((element: HTMLInputElement) => {
    element.value = '#22c55e';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(canvas).toHaveAttribute('data-selected-drawing-fill-color', '#22c55e');

  await page.getByTestId('drawing-fill-opacity').evaluate((element: HTMLInputElement) => {
    element.value = '45';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(canvas).toHaveAttribute('data-selected-drawing-fill-opacity', '0.45');
  await expect(page.getByTestId('drawing-fill-opacity')).toHaveValue('45');
});

test('selects drawings with Shift and moves and deletes the group together', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  const drawLine = async (startY: number, endY: number) => {
    const startX = bounds.x + bounds.width * 0.28;
    const endX = bounds.x + bounds.width * 0.52;
    await page.getByTestId('drawing-tool-trend-line').click();
    await page.mouse.move(startX, bounds.y + bounds.height * startY);
    await page.mouse.down();
    await page.mouse.move(endX, bounds.y + bounds.height * endY);
    await page.mouse.up();
  };

  await drawLine(0.28, 0.4);
  await drawLine(0.6, 0.72);
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');

  const firstMidpoint = {
    x: bounds.x + bounds.width * 0.4,
    y: bounds.y + bounds.height * 0.34,
  };
  const secondMidpoint = {
    x: bounds.x + bounds.width * 0.4,
    y: bounds.y + bounds.height * 0.66,
  };

  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click(firstMidpoint.x, firstMidpoint.y);
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '1');

  await page.keyboard.down('Shift');
  await page.mouse.click(secondMidpoint.x, secondMidpoint.y);
  await page.keyboard.up('Shift');
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');
  await expect(canvas).toHaveAttribute('data-selected-drawing-ids', 'drawing-1,drawing-2');

  const beforeGroupMove = await canvas.evaluate((element: HTMLCanvasElement) =>
    element.toDataURL(),
  );
  await page.mouse.move(firstMidpoint.x, firstMidpoint.y);
  await page.mouse.down();
  await page.mouse.move(firstMidpoint.x + 35, firstMidpoint.y - 18);
  await page.mouse.up();

  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(beforeGroupMove);
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '2');
  await expect(canvas).toHaveAttribute('data-drawing-undo-count', '3');

  await page.getByTestId('drawing-delete-selected').click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '0');
  await expect(canvas).toHaveAttribute('data-selected-drawing-count', '0');

  await page.getByTestId('drawing-undo').click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');
  await page.getByTestId('drawing-redo').click();
  await expect(canvas).toHaveAttribute('data-drawing-count', '0');
});

test('saves and reapplies custom drawing style templates across reloads', async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole('img', {
            name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
          })
          .getAttribute('data-candles-count'),
      ),
    )
    .toBeGreaterThan(400);

  await page.evaluate(() => localStorage.removeItem('openview.chart.drawing-style-templates'));
  await page.reload();

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const drawAndSelect = async () => {
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();

    if (bounds === null) {
      throw new Error('The chart canvas must have a visible bounding box.');
    }

    const startX = bounds.x + bounds.width * 0.3;
    const startY = bounds.y + bounds.height * 0.34;
    const endX = bounds.x + bounds.width * 0.58;
    const endY = bounds.y + bounds.height * 0.56;

    await page.getByTestId('drawing-tool-trend-line').click();
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();
    await expect(canvas).toHaveAttribute('data-drawing-count', '1');

    await page.getByTestId('drawing-tool-select').click();
    await page.mouse.click((startX + endX) / 2, (startY + endY) / 2);
    await expect(canvas).toHaveAttribute('data-selected-drawing-count', '1');
  };

  await drawAndSelect();
  await page.getByTestId('drawing-templates-toggle').click();
  await expect(page.getByTestId('drawing-templates-manager')).toBeVisible();
  await page.getByTestId('drawing-template-select').selectOption('builtin-red-dashed');
  await page.getByTestId('drawing-template-apply').click();

  await expect(canvas).toHaveAttribute('data-selected-drawing-color', '#ef5350');
  await expect(canvas).toHaveAttribute('data-selected-drawing-width', '2');
  await expect(canvas).toHaveAttribute('data-selected-drawing-line-style', 'dashed');

  await page.getByTestId('drawing-template-name').fill('Mi estilo');
  await page.getByTestId('drawing-template-save').click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('openview.chart.drawing-style-templates') ?? ''),
    )
    .toContain('Mi estilo');

  await page.reload();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  await drawAndSelect();
  await page.getByTestId('drawing-templates-toggle').click();
  await expect(page.getByTestId('drawing-template-select')).toContainText('Mi estilo');
  await page.getByTestId('drawing-template-select').selectOption({ label: 'Mi estilo' });
  await page.getByTestId('drawing-template-apply').click();

  await expect(canvas).toHaveAttribute('data-selected-drawing-color', '#ef5350');
  await expect(canvas).toHaveAttribute('data-selected-drawing-width', '2');
  await expect(canvas).toHaveAttribute('data-selected-drawing-line-style', 'dashed');

  await page.getByTestId('drawing-template-delete').click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('openview.chart.drawing-style-templates') ?? ''),
    )
    .toContain('"templates":[]');
});

test('uses quick drawing templates and contextual coordinate controls', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', {
    name: /Gráfico interactivo de velas y volumen para BTC \/ USDT/,
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-candles-count')))
    .toBeGreaterThan(400);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  if (bounds === null) {
    throw new Error('The chart canvas must have a visible bounding box.');
  }

  await page.getByTestId('drawing-tool-horizontal-line').click();
  await page.getByTestId('drawing-template-quick-toggle').click();
  await expect(page.getByTestId('drawing-template-quick-menu')).toBeVisible();
  await page.getByTestId('drawing-template-quick-builtin-red-dashed').click();

  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('openview.chart.drawing-tool-preferences') ?? ''),
    )
    .toContain('horizontal-line');

  const horizontalY = bounds.y + bounds.height * 0.4;
  await page.mouse.move(bounds.x + bounds.width * 0.5, horizontalY);
  await page.mouse.down();
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-drawing-count', '1');

  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click(bounds.x + bounds.width * 0.5, horizontalY);
  await expect(canvas).toHaveAttribute('data-selected-drawing-type', 'horizontal-line');
  await expect(canvas).toHaveAttribute('data-selected-drawing-color', '#ef5350');
  await expect(canvas).toHaveAttribute('data-selected-drawing-width', '2');
  await expect(canvas).toHaveAttribute('data-selected-drawing-line-style', 'dashed');

  const horizontalPrice = page.getByTestId('drawing-horizontal-price');
  await expect(horizontalPrice).toBeVisible();
  await horizontalPrice.fill('123.45');
  await horizontalPrice.press('Enter');
  await expect(canvas).toHaveAttribute('data-selected-drawing-start-price', '123.45');

  await page.getByTestId('drawing-tool-vertical-line').click();
  const verticalX = bounds.x + bounds.width * 0.68;
  await page.mouse.move(verticalX, bounds.y + bounds.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(verticalX, bounds.y + bounds.height * 0.65);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-drawing-count', '2');

  await page.getByTestId('drawing-tool-select').click();
  await page.mouse.click(verticalX, bounds.y + bounds.height * 0.5);
  await expect(canvas).toHaveAttribute('data-selected-drawing-type', 'vertical-line');
  await expect(page.getByTestId('drawing-vertical-time')).toBeVisible();
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
