export type MovingAverageInput = Readonly<{
  logicalIndex: number;
  close: number;
}>;

export type MovingAveragePoint = Readonly<{
  logicalIndex: number;
  value: number;
}>;

const validatePeriod = (period: number): void => {
  if (!Number.isSafeInteger(period) || period <= 0) {
    throw new RangeError('Moving average period must be a positive integer.');
  }
};

const validateInputs = (candles: readonly MovingAverageInput[], period: number): void => {
  validatePeriod(period);
  let previousLogicalIndex = Number.NEGATIVE_INFINITY;

  for (const candle of candles) {
    if (
      !Number.isFinite(candle.logicalIndex) ||
      candle.logicalIndex <= previousLogicalIndex ||
      !Number.isFinite(candle.close)
    ) {
      throw new RangeError('Moving average inputs must contain finite closes and ascending indices.');
    }

    previousLogicalIndex = candle.logicalIndex;
  }
};

export const calculateSimpleMovingAverage = (
  candles: readonly MovingAverageInput[],
  period: number,
): readonly MovingAveragePoint[] => {
  validateInputs(candles, period);

  if (candles.length < period) {
    return Object.freeze([]);
  }

  const points: MovingAveragePoint[] = [];
  let rollingSum = 0;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];

    if (candle === undefined) {
      continue;
    }

    rollingSum += candle.close;

    if (index >= period) {
      const expired = candles[index - period];

      if (expired !== undefined) {
        rollingSum -= expired.close;
      }
    }

    if (index >= period - 1) {
      points.push(
        Object.freeze({
          logicalIndex: candle.logicalIndex,
          value: rollingSum / period,
        }),
      );
    }
  }

  return Object.freeze(points);
};

export const calculateExponentialMovingAverage = (
  candles: readonly MovingAverageInput[],
  period: number,
): readonly MovingAveragePoint[] => {
  validateInputs(candles, period);

  if (candles.length < period) {
    return Object.freeze([]);
  }

  const seed = calculateSimpleMovingAverage(candles.slice(0, period), period)[0];

  if (seed === undefined) {
    return Object.freeze([]);
  }

  const points: MovingAveragePoint[] = [
    Object.freeze({
      logicalIndex: candles[period - 1]?.logicalIndex ?? seed.logicalIndex,
      value: seed.value,
    }),
  ];
  const multiplier = 2 / (period + 1);
  let previousAverage = seed.value;

  for (let index = period; index < candles.length; index += 1) {
    const candle = candles[index];

    if (candle === undefined) {
      continue;
    }

    previousAverage = (candle.close - previousAverage) * multiplier + previousAverage;
    points.push(
      Object.freeze({
        logicalIndex: candle.logicalIndex,
        value: previousAverage,
      }),
    );
  }

  return Object.freeze(points);
};
