export type LayoutRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type ChartLayoutOptions = Readonly<{
  leftPriceScaleWidth?: number;
  rightPriceScaleWidth?: number;
  timeScaleHeight?: number;
  topInset?: number;
  bottomInset?: number;
}>;

export type ChartLayout = Readonly<{
  bounds: LayoutRect;
  plotArea: LayoutRect;
  leftPriceScaleArea: LayoutRect;
  rightPriceScaleArea: LayoutRect;
  timeScaleArea: LayoutRect;
}>;

const createRect = (x: number, y: number, width: number, height: number): LayoutRect =>
  Object.freeze({ x, y, width, height });

export const createChartLayout = (
  width: number,
  height: number,
  options: ChartLayoutOptions = {},
): ChartLayout => {
  const leftPriceScaleWidth = options.leftPriceScaleWidth ?? 0;
  const rightPriceScaleWidth = options.rightPriceScaleWidth ?? 72;
  const timeScaleHeight = options.timeScaleHeight ?? 32;
  const topInset = options.topInset ?? 0;
  const bottomInset = options.bottomInset ?? 0;
  const dimensions = [
    width,
    height,
    leftPriceScaleWidth,
    rightPriceScaleWidth,
    timeScaleHeight,
    topInset,
    bottomInset,
  ];

  if (!dimensions.every(Number.isFinite)) {
    throw new RangeError('Chart layout dimensions must be finite numbers.');
  }

  if (
    width <= 0 ||
    height <= 0 ||
    leftPriceScaleWidth < 0 ||
    rightPriceScaleWidth < 0 ||
    timeScaleHeight < 0 ||
    topInset < 0 ||
    bottomInset < 0
  ) {
    throw new RangeError('Chart bounds must be positive and layout insets must be non-negative.');
  }

  const plotWidth = width - leftPriceScaleWidth - rightPriceScaleWidth;
  const plotHeight = height - timeScaleHeight - topInset - bottomInset;

  if (plotWidth <= 0 || plotHeight <= 0) {
    throw new RangeError('Chart layout must leave a positive plot area.');
  }

  const plotArea = createRect(leftPriceScaleWidth, topInset, plotWidth, plotHeight);
  const bounds = createRect(0, 0, width, height);
  const leftPriceScaleArea = createRect(0, topInset, leftPriceScaleWidth, plotHeight);
  const rightPriceScaleArea = createRect(
    width - rightPriceScaleWidth,
    topInset,
    rightPriceScaleWidth,
    plotHeight,
  );
  const timeScaleArea = createRect(
    leftPriceScaleWidth,
    height - timeScaleHeight,
    plotWidth,
    timeScaleHeight,
  );

  return Object.freeze({
    bounds,
    plotArea,
    leftPriceScaleArea,
    rightPriceScaleArea,
    timeScaleArea,
  });
};
