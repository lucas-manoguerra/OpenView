import { failure, success, type Result } from './result';

export type CandleInput = Readonly<{
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>;

export type Candle = CandleInput;

export type CandleValidationError =
  | 'non-finite-value'
  | 'negative-timestamp'
  | 'negative-volume'
  | 'invalid-price-range'
  | 'invalid-ohlc-range';

export const createCandle = (input: CandleInput): Result<Candle, CandleValidationError> => {
  const values = [input.timestamp, input.open, input.high, input.low, input.close, input.volume];

  if (!values.every(Number.isFinite)) {
    return failure('non-finite-value');
  }

  if (input.timestamp < 0) {
    return failure('negative-timestamp');
  }

  if (input.volume < 0) {
    return failure('negative-volume');
  }

  if (input.low > input.high) {
    return failure('invalid-price-range');
  }

  if (
    input.low > Math.min(input.open, input.close) ||
    input.high < Math.max(input.open, input.close)
  ) {
    return failure('invalid-ohlc-range');
  }

  return success(Object.freeze({ ...input }));
};
