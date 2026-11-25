import type { ChartDataPoint, ChartFrame } from './chart-frame';
import type { ChartIndicatorSeries, ChartRenderCandle } from './canvas-painter';
import { priceToCoordinate } from './price-scale';

export type ChartDrawingMagnetMode = 'off' | 'weak' | 'strong';

const DEFAULT_WEAK_MAGNET_TOLERANCE = 12;

type MagnetCandidate = Readonly<{
  logicalIndex: number;
  price: number;
}>;

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

const findClosestIndicatorPoint = (
  logicalIndex: number,
  points: ChartIndicatorSeries['points'],
): MagnetCandidate | null => {
  if (points.length === 0) {
    return null;
  }

  let lower = 0;
  let upper = points.length - 1;

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = points[middle];

    if (candidate === undefined) {
      return null;
    }

    if (candidate.logicalIndex === logicalIndex) {
      return Object.freeze({
        logicalIndex: candidate.logicalIndex,
        price: candidate.value,
      });
    }

    if (candidate.logicalIndex < logicalIndex) {
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }

  const left = points[upper];
  const right = points[lower];
  const closest =
    left === undefined
      ? right
      : right === undefined
        ? left
        : Math.abs(left.logicalIndex - logicalIndex) <=
            Math.abs(right.logicalIndex - logicalIndex)
          ? left
          : right;

  return closest === undefined
    ? null
    : Object.freeze({ logicalIndex: closest.logicalIndex, price: closest.value });
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
  indicators: readonly ChartIndicatorSeries[] = [],
  snapToIndicators = false,
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

  const candidates: MagnetCandidate[] = [
    { logicalIndex: candle.logicalIndex, price: candle.open },
    { logicalIndex: candle.logicalIndex, price: candle.high },
    { logicalIndex: candle.logicalIndex, price: candle.low },
    { logicalIndex: candle.logicalIndex, price: candle.close },
  ];

  if (snapToIndicators) {
    for (const indicator of indicators) {
      const candidate = findClosestIndicatorPoint(candle.logicalIndex, indicator.points);

      if (candidate !== null) {
        candidates.push(candidate);
      }
    }
  }

  const pointerY = frame.layout.plotArea.y + priceToCoordinate(point.price, frame.priceScale);
  let nearestCandidate: MagnetCandidate | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.price)) {
      continue;
    }

    try {
      const candidateY =
        frame.layout.plotArea.y + priceToCoordinate(candidate.price, frame.priceScale);
      const candidateDistance = Math.abs(candidateY - pointerY);

      if (candidateDistance < nearestDistance) {
        nearestCandidate = candidate;
        nearestDistance = candidateDistance;
      }
    } catch {
      continue;
    }
  }

  if (
    nearestCandidate === null ||
    (mode === 'weak' && nearestDistance > weakTolerance)
  ) {
    return point;
  }

  return Object.freeze({
    logicalIndex: nearestCandidate.logicalIndex,
    price: nearestCandidate.price,
  });
};
