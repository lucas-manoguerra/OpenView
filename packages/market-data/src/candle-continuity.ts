import type { CandleInterval } from './contracts';

const FIXED_INTERVAL_DURATIONS: Readonly<Partial<Record<CandleInterval, number>>> = Object.freeze({
  '1s': 1_000,
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '6h': 21_600_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
});

export const getNextCandleTimestamp = (timestamp: number, interval: CandleInterval): number => {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new RangeError('Candle timestamps must be non-negative safe Unix millisecond values.');
  }

  if (interval === '1M') {
    const nextMonth = new Date(timestamp);
    nextMonth.setUTCDate(1);
    nextMonth.setUTCHours(0, 0, 0, 0);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return nextMonth.getTime();
  }

  const duration = FIXED_INTERVAL_DURATIONS[interval];

  if (duration === undefined) {
    throw new RangeError('Unsupported candle interval: ' + interval + '.');
  }

  return timestamp + duration;
};
