import {
  coordinateToPrice,
  createPriceScale,
  priceToCoordinate,
  type PriceScale,
  type PriceScaleOptions,
} from './price-scale';
import {
  coordinateToLogicalIndex,
  createTimeScale,
  logicalIndexToCoordinate,
  type TimeScale,
  type TimeScaleOptions,
} from './time-scale';
import { createChartLayout, type ChartLayout, type ChartLayoutOptions } from './layout';
import type { NumericRange } from './viewport';

export type ChartFrameOptions = Readonly<{
  layout?: ChartLayoutOptions;
  priceScale?: PriceScaleOptions;
  timeScale?: TimeScaleOptions;
}>;

export type ChartDataPoint = Readonly<{
  logicalIndex: number;
  price: number;
}>;

export type ChartCoordinate = Readonly<{
  x: number;
  y: number;
}>;

export type ChartFrame = Readonly<{
  layout: ChartLayout;
  priceScale: PriceScale;
  timeScale: TimeScale;
}>;

export const createChartFrame = (
  width: number,
  height: number,
  priceRange: NumericRange,
  rightmostLogicalIndex: number,
  options: ChartFrameOptions = {},
): ChartFrame => {
  const layout = createChartLayout(width, height, options.layout);
  const priceScale = createPriceScale(priceRange, layout.plotArea.height, options.priceScale);
  const timeScale = createTimeScale(
    layout.plotArea.width,
    rightmostLogicalIndex,
    options.timeScale,
  );

  return Object.freeze({ layout, priceScale, timeScale });
};

export const dataPointToChartCoordinate = (
  point: ChartDataPoint,
  frame: ChartFrame,
): ChartCoordinate => {
  const x = frame.layout.plotArea.x + logicalIndexToCoordinate(point.logicalIndex, frame.timeScale);
  const y = frame.layout.plotArea.y + priceToCoordinate(point.price, frame.priceScale);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError(
      'Data point resolves to a coordinate outside the supported numeric range.',
    );
  }

  return Object.freeze({ x, y });
};

export const chartCoordinateToDataPoint = (
  coordinate: ChartCoordinate,
  frame: ChartFrame,
): ChartDataPoint => {
  if (!Number.isFinite(coordinate.x) || !Number.isFinite(coordinate.y)) {
    throw new RangeError('Chart coordinates must be finite numbers.');
  }

  const logicalIndex = coordinateToLogicalIndex(
    coordinate.x - frame.layout.plotArea.x,
    frame.timeScale,
  );
  const price = coordinateToPrice(coordinate.y - frame.layout.plotArea.y, frame.priceScale);

  return Object.freeze({ logicalIndex, price });
};
