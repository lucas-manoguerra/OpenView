export type NumericRange = Readonly<{
  min: number;
  max: number;
}>;

export type ChartViewport = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
}>;

export const createChartViewport = (
  width: number,
  height: number,
  devicePixelRatio = 1,
): ChartViewport => {
  if (![width, height, devicePixelRatio].every(Number.isFinite)) {
    throw new RangeError('Viewport dimensions must be finite numbers.');
  }

  if (width <= 0 || height <= 0 || devicePixelRatio <= 0) {
    throw new RangeError('Viewport dimensions and pixel ratio must be positive.');
  }

  return Object.freeze({ width, height, devicePixelRatio });
};

const normalize = (value: number, range: NumericRange): number => {
  if (range.max <= range.min) {
    throw new RangeError('A scale range must have a positive span.');
  }

  return (value - range.min) / (range.max - range.min);
};

export const timeToHorizontalCoordinate = (
  timestamp: number,
  visibleTimeRange: NumericRange,
  viewportWidth: number,
): number => {
  if (!Number.isFinite(timestamp) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new RangeError('Time and viewport width must be finite, with positive width.');
  }

  return normalize(timestamp, visibleTimeRange) * viewportWidth;
};

export const priceToVerticalCoordinate = (
  price: number,
  visiblePriceRange: NumericRange,
  viewportHeight: number,
): number => {
  if (!Number.isFinite(price) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new RangeError('Price and viewport height must be finite, with positive height.');
  }

  return (1 - normalize(price, visiblePriceRange)) * viewportHeight;
};
