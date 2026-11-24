import { describe, expect, it } from 'vitest';
import { OkxSpotMarketDataProvider } from '../src/providers/okx-spot';

const createResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), { status });

describe('OKX Spot instrument discovery', () => {
  it('requests public Spot instruments and keeps live markets only', async () => {
    let requestUrl: URL | null = null;
    const fetcher: typeof fetch = async (input) => {
      requestUrl = input instanceof URL ? input : new URL(String(input));

      return createResponse({
        code: '0',
        msg: '',
        data: [
          {
            instId: 'BTC-USDT',
            instType: 'SPOT',
            baseCcy: 'BTC',
            quoteCcy: 'USDT',
            state: 'live',
          },
          {
            instId: 'ETH-BTC',
            instType: 'SPOT',
            baseCcy: 'ETH',
            quoteCcy: 'BTC',
            state: 'live',
          },
          {
            instId: 'XRP-USDT',
            instType: 'SPOT',
            baseCcy: 'XRP',
            quoteCcy: 'USDT',
            state: 'suspend',
          },
        ],
      });
    };
    const provider = new OkxSpotMarketDataProvider({
      fetcher,
      minimumRequestIntervalMs: 0,
    });

    const instruments = await provider.listInstruments();

    expect(requestUrl?.pathname).toBe('/api/v5/public/instruments');
    expect(requestUrl?.searchParams.get('instType')).toBe('SPOT');
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

  it('keeps valid markets when the response contains unsupported asset codes', async () => {
    const provider = new OkxSpotMarketDataProvider({
      fetcher: async () =>
        createResponse({
          code: '0',
          msg: '',
          data: [
            { state: 'live', baseCcy: 'OLD/TOKEN', quoteCcy: 'USDT' },
            { state: 'live', baseCcy: 'AVAX', quoteCcy: 'USDT' },
          ],
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
        code: '0',
        data: [
          { baseCcy: 'BTC', quoteCcy: 'USDT', state: 'live' },
          { baseCcy: 'ETH', quoteCcy: 'USDC', state: 'live' },
        ],
      });
    };
    const provider = new OkxSpotMarketDataProvider({
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
    const failedProvider = new OkxSpotMarketDataProvider({
      fetcher: async () => createResponse({ code: '50011', msg: 'Rate limit reached', data: [] }),
      minimumRequestIntervalMs: 0,
    });
    const malformedProvider = new OkxSpotMarketDataProvider({
      fetcher: async () => createResponse({ code: '0', data: null }),
      minimumRequestIntervalMs: 0,
    });

    await expect(failedProvider.listInstruments()).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      providerId: 'okx-spot',
    });
    await expect(malformedProvider.listInstruments()).rejects.toThrow(
      'malformed public instruments response',
    );
  });
});
