import type { ChartDataPoint, ChartFrame } from './chart-frame';
import type { ChartRenderCandle } from './canvas-painter';
import { priceToCoordinate } from './price-scale';

export type ChartDrawingMagnetMode = 'off' | 'weak' | 'strong';

const DEFAULT_WEAK_MAGNET_TOLERANCE = 12;

const findClosestCandle = (
  logicalIndex: number,
  candles: readonly ChartRenderCandle[],
): ChartRenderCandle | null => {
  if (candles.length === 0) {
    return null;
  }

  let lower = 0;
  let upper = candles.length - 1;

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candle = candles[middle];

    if (candle === undefined) {
      return null;
    }

    if (candle.logicalIndex === logicalIndex) {
      return candle;
    }

    if (candle.logicalIndex < logicalIndex) {
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }

  const left = candles[upper];
  const right = candles[lower];

  if (left === undefined) {
    return right ?? null;
  }

  if (right === undefined) {
    return left;
  }

  return Math.abs(left.logicalIndex - logicalIndex) <= Math.abs(right.logicalIndex - logicalIndex)
    ? left
    : right;
};

export const resolveChartDrawingMagnetMode = (
  configuredMode: ChartDrawingMagnetMode,
  modifierPressed: boolean,
): ChartDrawingMagnetMode => {
  if (!modifierPressed) {
    return configuredMode;
  }

  return configuredMode === 'off' ? 'strong' : 'off';
};

export const snapChartDrawingPointToOhlc = (
  point: ChartDataPoint,
  candles: readonly ChartRenderCandle[],
  frame: ChartFrame,
  mode: ChartDrawingMagnetMode,
  weakTolerance = DEFAULT_WEAK_MAGNET_TOLERANCE,
): ChartDataPoint => {
  if (
    !Number.isFinite(point.logicalIndex) ||
    !Number.isFinite(point.price) ||
    !Number.isFinite(weakTolerance) ||
    weakTolerance < 0
  ) {
    throw new RangeError('Drawing magnet coordinates and tolerance must be finite.');
  }

  if (mode === 'off') {
    return point;
  }

  const candle = findClosestCandle(point.logicalIndex, candles);

  if (candle === null) {
    return point;
  }

  const candidatePrices = [candle.open, candle.high, candle.low, candle.close];
  const pointerY = frame.layout.plotArea.y + priceToCoordinate(point.price, frame.priceScale);
  let nearestPrice: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const price of candidatePrices) {
    if (!Number.isFinite(price)) {
      continue;
    }

    try {
      const candidateY = frame.layout.plotArea.y + priceToCoordinate(price, frame.priceScale);
      const candidateDistance = Math.abs(candidateY - pointerY);

      if (candidateDistance < nearestDistance) {
        nearestPrice = price;
        nearestDistance = candidateDistance;
      }
    } catch {
      continue;
    }
  }

  if (nearestPrice === null || (mode === 'weak' && nearestDistance > weakTolerance)) {
    return point;
  }

  return Object.freeze({
    logicalIndex: candle.logicalIndex,
    price: nearestPrice,
  });
};
