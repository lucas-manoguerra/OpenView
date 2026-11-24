import { describe, expect, it } from 'vitest';
import { BinanceSpotMarketDataProvider } from '../src/providers/binance-spot';

const createResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), { status });

describe('Binance Spot instrument discovery', () => {
  it('requests Spot trading markets and normalizes the active instruments', async () => {
    let requestUrl: URL | null = null;
    let requestInit: RequestInit | undefined;
    const fetcher: typeof fetch = async (input, init = {}) => {
      requestUrl = input instanceof URL ? input : new URL(String(input));
      requestInit = init;

      return createResponse({
        symbols: [
          {
            symbol: 'BTCUSDT',
            status: 'TRADING',
            isSpotTradingAllowed: true,
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
          },
          {
            symbol: 'ETHBTC',
            status: 'TRADING',
            isSpotTradingAllowed: true,
            baseAsset: 'ETH',
            quoteAsset: 'BTC',
          },
          {
            symbol: 'XRPUSDT',
            status: 'BREAK',
            isSpotTradingAllowed: true,
            baseAsset: 'XRP',
            quoteAsset: 'USDT',
          },
          {
            symbol: 'SOLUSDT',
            status: 'TRADING',
            isSpotTradingAllowed: false,
            baseAsset: 'SOL',
            quoteAsset: 'USDT',
          },
        ],
      });
    };
    const provider = new BinanceSpotMarketDataProvider({ fetcher });

    const instruments = await provider.listInstruments();

    expect(requestUrl?.pathname).toBe('/api/v3/exchangeInfo');
    expect(requestUrl?.searchParams.get('permissions')).toBe('SPOT');
    expect(requestUrl?.searchParams.get('symbolStatus')).toBe('TRADING');
    expect(new Headers(requestInit?.headers).get('accept')).toBe('application/json');
    expect(instruments).toEqual([
      {
        id: 'BTC-USDT',
        symbol: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
      },
      {
        id: 'ETH-BTC',
        symbol: 'ETH/BTC',
        baseAsset: 'ETH',
        quoteAsset: 'BTC',
      },
    ]);
  });

  it('filters discovered instruments by quote asset and forwards abort signals', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_input, init = {}) => {
      requestSignal = init.signal;

      return createResponse({
        symbols: [
          {
            status: 'TRADING',
            baseAsset: 'BTC',
            quoteAsset: 'USDT',
            isSpotTradingAllowed: true,
          },
          {
            status: 'TRADING',
            baseAsset: 'ETH',
            quoteAsset: 'USDC',
            isSpotTradingAllowed: true,
          },
        ],
      });
    };
    const provider = new BinanceSpotMarketDataProvider({ fetcher });

    const instruments = await provider.listInstruments({
      quoteAsset: 'usdt',
      signal: controller.signal,
    });

    expect(requestSignal).toBe(controller.signal);
    expect(instruments.map((instrument) => instrument.id)).toEqual(['BTC-USDT']);
  });

  it('surfaces HTTP errors and rejects malformed exchange information', async () => {
    const failedProvider = new BinanceSpotMarketDataProvider({
      fetcher: async () => createResponse({ msg: 'Service unavailable' }, 503),
    });
    const malformedProvider = new BinanceSpotMarketDataProvider({
      fetcher: async () => createResponse({ symbols: null }),
    });

    await expect(failedProvider.listInstruments()).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      providerId: 'binance-spot',
      statusCode: 503,
    });
    await expect(malformedProvider.listInstruments()).rejects.toThrow(
      'malformed exchange information response',
    );
  });
});
