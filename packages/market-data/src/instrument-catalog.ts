import { createInstrumentId } from '@openview/market-domain';
import type {
  InstrumentDiscoveryFilter,
  MarketInstrument,
} from './contracts';

const normalizeAssetCode = (value: string, label: string): string => {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z0-9]{1,24}$/.test(normalized)) {
    throw new RangeError('Market instrument ' + label + ' must be a valid asset code.');
  }

  return normalized;
};

export const createMarketInstrument = (
  baseAsset: string,
  quoteAsset: string,
): MarketInstrument => {
  const normalizedBaseAsset = normalizeAssetCode(baseAsset, 'base asset');
  const normalizedQuoteAsset = normalizeAssetCode(quoteAsset, 'quote asset');

  return Object.freeze({
    id: createInstrumentId(normalizedBaseAsset + '-' + normalizedQuoteAsset),
    symbol: normalizedBaseAsset + '/' + normalizedQuoteAsset,
    baseAsset: normalizedBaseAsset,
    quoteAsset: normalizedQuoteAsset,
  });
};

export const normalizeMarketInstruments = (
  instruments: readonly MarketInstrument[],
  filter: InstrumentDiscoveryFilter = {},
): readonly MarketInstrument[] => {
  const quoteAsset =
    filter.quoteAsset === undefined
      ? null
      : normalizeAssetCode(filter.quoteAsset, 'quote filter');
  const unique = new Map<string, MarketInstrument>();

  for (const instrument of instruments) {
    if (quoteAsset !== null && instrument.quoteAsset !== quoteAsset) {
      continue;
    }

    unique.set(instrument.id, instrument);
  }

  return Object.freeze(
    [...unique.values()].sort((left, right) => left.symbol.localeCompare(right.symbol)),
  );
};
