import { describe, expect, it } from 'vitest';
import { BybitSpotMarketDataProvider } from '../src/providers/bybit-spot';

const createResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), { status });

describe('Bybit Spot instrument discovery', () => {
  it('requests the non-paginated Spot catalog and normalizes tradable instruments', async () => {
    let requestUrl: URL | null = null;
    const fetcher: typeof fetch = async (input) => {
      requestUrl = input instanceof URL ? input : new URL(String(input));

      return createResponse({
        retCode: 0,
        retMsg: 'OK',
        result: {
          category: 'spot',
          list: [
            {
              symbol: 'BTCUSDT',
              status: 'Trading',
              baseCoin: 'BTC',
              quoteCoin: 'USDT',
              priceFilter: { tickSize: '0.1' },
            },
            {
              symbol: 'ETHBTC',
              status: 'Trading',
              baseCoin: 'ETH',
              quoteCoin: 'BTC',
            },
            {
              symbol: 'XRPUSDT',
              status: 'PreLaunch',
              baseCoin: 'XRP',
              quoteCoin: 'USDT',
            },
          ],
        },
      });
    };
    const provider = new BybitSpotMarketDataProvider({
      fetcher,
      minimumRequestIntervalMs: 0,
    });

    const instruments = await provider.listInstruments();

    expect(requestUrl?.pathname).toBe('/v5/market/instruments-info');
    expect(requestUrl?.searchParams.get('category')).toBe('spot');
    expect(requestUrl?.searchParams.has('cursor')).toBe(false);
    expect(requestUrl?.searchParams.has('limit')).toBe(false);
    expect(instruments).toEqual([
      {
        id: 'BTC-USDT',
        symbol: 'BTC/USDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        priceIncrement: 0.1,
      },
      {
        id: 'ETH-BTC',
        symbol: 'ETH/BTC',
        baseAsset: 'ETH',
        quoteAsset: 'BTC',
      },
    ]);
  });

  it('keeps valid markets when the response contains unsupported asset codes', async () => {
    const provider = new BybitSpotMarketDataProvider({
      fetcher: async () =>
        createResponse({
          retCode: 0,
          retMsg: 'OK',
          result: {
            list: [
              { status: 'Trading', baseCoin: 'OLD/TOKEN', quoteCoin: 'USDT' },
              { status: 'Trading', baseCoin: 'AVAX', quoteCoin: 'USDT' },
            ],
          },
        }),
      minimumRequestIntervalMs: 0,
    });

    const instruments = await provider.listInstruments();

    expect(instruments.map((instrument) => instrument.id)).toEqual(['AVAX-USDT']);
  });

  it('filters instruments by quote asset and forwards abort signals', async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_input, init = {}) => {
      requestSignal = init.signal;

      return createResponse({
        retCode: 0,
        retMsg: 'OK',
        result: {
          list: [
            { status: 'Trading', baseCoin: 'BTC', quoteCoin: 'USDT' },
            { status: 'Trading', baseCoin: 'ETH', quoteCoin: 'USDC' },
          ],
        },
      });
    };
    const provider = new BybitSpotMarketDataProvider({
      fetcher,
      minimumRequestIntervalMs: 0,
    });

    const instruments = await provider.listInstruments({
      quoteAsset: 'USDT',
      signal: controller.signal,
    });

    expect(requestSignal).toBe(controller.signal);
    expect(instruments.map((instrument) => instrument.id)).toEqual(['BTC-USDT']);
  });

  it('surfaces API errors and rejects malformed instrument lists', async () => {
    const failedProvider = new BybitSpotMarketDataProvider({
      fetcher: async () =>
        createResponse({
          retCode: 10006,
          retMsg: 'Too many visits',
          result: { list: [] },
        }),
      minimumRequestIntervalMs: 0,
    });
    const malformedProvider = new BybitSpotMarketDataProvider({
      fetcher: async () => createResponse({ retCode: 0, result: { list: null } }),
      minimumRequestIntervalMs: 0,
    });

    await expect(failedProvider.listInstruments()).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      providerId: 'bybit-spot',
    });
    await expect(malformedProvider.listInstruments()).rejects.toThrow(
      'malformed instruments response',
    );
  });
});
