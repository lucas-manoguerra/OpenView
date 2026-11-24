import { createCandle, type Candle } from '@openview/market-domain';
import { generatePriceTicks, priceToCoordinate } from './price-scale';
import { logicalIndexToCoordinate } from './time-scale';
import {
  createTimeAxisData,
  generateTimeAxisTicks,
  selectNonOverlappingTimeAxisTicks,
  type TimeAxisData,
} from './time-axis';
import type { ChartCoordinate, ChartFrame } from './chart-frame';
import type { MovingAveragePoint } from './indicators';

export type ChartRenderCandle = Candle &
  Readonly<{
    logicalIndex: number;
  }>;

export type ChartType = 'candles' | 'bars' | 'line' | 'area';

export type ChartIndicatorSeries = Readonly<{
  id: string;
  label: string;
  color: string;
  points: readonly MovingAveragePoint[];
}>;

export type ChartDrawingPoint = Readonly<{
  timestamp: number;
  price: number;
}>;

export type ChartRenderDrawing = Readonly<{
  id: string;
  type: 'trend-line' | 'horizontal-line';
  start: ChartDrawingPoint;
  end: ChartDrawingPoint | null;
  color: string;
}>;

export type ChartRenderScene = Readonly<{
  frame: ChartFrame;
  candles: readonly ChartRenderCandle[];
  timeAxisData: TimeAxisData;
  crosshair: ChartCoordinate | null;
  chartType: ChartType;
  indicators: readonly ChartIndicatorSeries[];
  drawings: readonly ChartRenderDrawing[];
}>;

export type ChartRenderTheme = Readonly<{
  background: string;
  plotBackground: string;
  volumeBackground: string;
  axisBackground: string;
  grid: string;
  axisText: string;
  bullish: string;
  bearish: string;
  unchanged: string;
  crosshair: string;
}>;

const getTargetTimeTickCount = (plotWidth: number): number =>
  Math.max(2, Math.min(50, Math.floor(plotWidth / 110)));

export const DEFAULT_CHART_THEME: ChartRenderTheme = Object.freeze({
  background: '#0b0f17',
  plotBackground: '#0d121d',
  volumeBackground: '#0b101a',
  axisBackground: '#101723',
  grid: '#202938',
  axisText: '#8994a7',
  bullish: '#26a69a',
  bearish: '#ef5350',
  unchanged: '#9aa4b2',
  crosshair: '#aab4c4',
});

const normalizeChartIndicators = (
  indicators: readonly ChartIndicatorSeries[],
): readonly ChartIndicatorSeries[] =>
  Object.freeze(
    indicators.map((indicator) => {
      if (
        indicator.id.length === 0 ||
        indicator.label.length === 0 ||
        indicator.color.length === 0
      ) {
        throw new RangeError('Chart indicators must include an id, label and color.');
      }

      let previousLogicalIndex = Number.NEGATIVE_INFINITY;
      const points = indicator.points.map((point) => {
        if (
          !Number.isFinite(point.logicalIndex) ||
          point.logicalIndex <= previousLogicalIndex ||
          !Number.isFinite(point.value)
        ) {
          throw new RangeError(
            'Chart indicator points must have finite values and ascending indices.',
          );
        }

        previousLogicalIndex = point.logicalIndex;
        return Object.freeze({ ...point });
      });

      return Object.freeze({
        id: indicator.id,
        label: indicator.label,
        color: indicator.color,
        points: Object.freeze(points),
      });
    }),
  );

const normalizeChartDrawings = (
  drawings: readonly ChartRenderDrawing[],
): readonly ChartRenderDrawing[] => {
  const ids = new Set<string>();

  return Object.freeze(
    drawings.map((drawing) => {
      if (drawing.id.length === 0 || drawing.color.length === 0 || ids.has(drawing.id)) {
        throw new RangeError('Chart drawings must have unique ids and a color.');
      }

      if (
        !Number.isFinite(drawing.start.timestamp) ||
        !Number.isFinite(drawing.start.price) ||
        (drawing.type === 'trend-line' && drawing.end === null)
      ) {
        throw new RangeError('Chart drawings must contain finite anchored points.');
      }

      if (
        drawing.end !== null &&
        (!Number.isFinite(drawing.end.timestamp) || !Number.isFinite(drawing.end.price))
      ) {
        throw new RangeError('Chart drawing end points must be finite.');
      }

      ids.add(drawing.id);
      return Object.freeze({
        id: drawing.id,
        type: drawing.type,
        start: Object.freeze({ ...drawing.start }),
        end: drawing.end === null ? null : Object.freeze({ ...drawing.end }),
        color: drawing.color,
      });
    }),
  );
};

export const createChartRenderScene = (
  frame: ChartFrame,
  candles: readonly ChartRenderCandle[],
  crosshair: ChartCoordinate | null = null,
  chartType: ChartType = 'candles',
  indicators: readonly ChartIndicatorSeries[] = [],
  drawings: readonly ChartRenderDrawing[] = [],
): ChartRenderScene => {
  let previousLogicalIndex = Number.NEGATIVE_INFINITY;
  const normalizedCandles: ChartRenderCandle[] = [];

  for (const candle of candles) {
    if (!Number.isFinite(candle.logicalIndex) || candle.logicalIndex <= previousLogicalIndex) {
      throw new RangeError('Render candles must have unique, ascending logical indices.');
    }

    const validation = createCandle(candle);

    if (!validation.ok) {
      throw new RangeError('Render candles must satisfy market domain validation.');
    }

    previousLogicalIndex = candle.logicalIndex;
    normalizedCandles.push(
      Object.freeze({ ...validation.value, logicalIndex: candle.logicalIndex }),
    );
  }

  if (crosshair !== null && (!Number.isFinite(crosshair.x) || !Number.isFinite(crosshair.y))) {
    throw new RangeError('Crosshair coordinates must be finite numbers.');
  }

  const frozenCandles = Object.freeze(normalizedCandles);
  const frozenIndicators = normalizeChartIndicators(indicators);
  const frozenDrawings = normalizeChartDrawings(drawings);

  return Object.freeze({
    frame,
    candles: frozenCandles,
    timeAxisData: createTimeAxisData(frozenCandles),
    crosshair: crosshair === null ? null : Object.freeze({ ...crosshair }),
    chartType,
    indicators: frozenIndicators,
    drawings: frozenDrawings,
  });
};

export type ChartRenderSceneUpdate = Readonly<{
  frame?: ChartFrame;
  crosshair?: ChartCoordinate | null;
  chartType?: ChartType;
  indicators?: readonly ChartIndicatorSeries[];
  drawings?: readonly ChartRenderDrawing[];
}>;

export const updateChartRenderScene = (
  scene: ChartRenderScene,
  update: ChartRenderSceneUpdate,
): ChartRenderScene => {
  const frame = update.frame ?? scene.frame;
  const crosshair = update.crosshair === undefined ? scene.crosshair : update.crosshair;
  const chartType = update.chartType ?? scene.chartType;
  const indicators =
    update.indicators === undefined
      ? scene.indicators
      : normalizeChartIndicators(update.indicators);
  const drawings =
    update.drawings === undefined ? scene.drawings : normalizeChartDrawings(update.drawings);

  if (crosshair !== null && (!Number.isFinite(crosshair.x) || !Number.isFinite(crosshair.y))) {
    throw new RangeError('Crosshair coordinates must be finite numbers.');
  }

  if (
    frame === scene.frame &&
    crosshair?.x === scene.crosshair?.x &&
    crosshair?.y === scene.crosshair?.y &&
    chartType === scene.chartType &&
    indicators === scene.indicators &&
    drawings === scene.drawings
  ) {
    return scene;
  }

  return Object.freeze({
    frame,
    candles: scene.candles,
    timeAxisData: scene.timeAxisData,
    crosshair: crosshair === null ? null : Object.freeze({ ...crosshair }),
    chartType,
    indicators,
    drawings,
  });
};

const getCandleColor = (candle: ChartRenderCandle, theme: ChartRenderTheme): string => {
  if (candle.close > candle.open) {
    return theme.bullish;
  }

  if (candle.close < candle.open) {
    return theme.bearish;
  }

  return theme.unchanged;
};

const drawGrid = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { frame } = scene;
  const { plotArea, volumeArea } = frame.layout;

  context.save();
  context.strokeStyle = theme.grid;
  context.lineWidth = 1;
  context.beginPath();

  for (const tick of generatePriceTicks(frame.priceScale, 7)) {
    const y = plotArea.y + tick.coordinate;

    if (y >= plotArea.y && y <= plotArea.y + plotArea.height) {
      context.moveTo(plotArea.x, y);
      context.lineTo(plotArea.x + plotArea.width, y);
    }
  }

  for (const tick of generateTimeAxisTicks(frame.timeScale, scene.timeAxisData, {
    targetTickCount: getTargetTimeTickCount(plotArea.width),
  })) {
    const x = plotArea.x + tick.coordinate;
    context.moveTo(x, plotArea.y);
    context.lineTo(x, plotArea.y + plotArea.height + volumeArea.height);
  }

  context.stroke();
  context.restore();
};

const drawAxes = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { layout, priceScale, timeScale } = scene.frame;
  const { leftPriceScaleArea, rightPriceScaleArea, timeScaleArea, plotArea } = layout;

  context.save();
  context.fillStyle = theme.axisBackground;

  if (leftPriceScaleArea.width > 0) {
    context.fillRect(
      leftPriceScaleArea.x,
      leftPriceScaleArea.y,
      leftPriceScaleArea.width,
      leftPriceScaleArea.height,
    );
  }

  if (rightPriceScaleArea.width > 0) {
    context.fillRect(
      rightPriceScaleArea.x,
      rightPriceScaleArea.y,
      rightPriceScaleArea.width,
      rightPriceScaleArea.height,
    );
  }

  if (timeScaleArea.height > 0) {
    context.fillRect(timeScaleArea.x, timeScaleArea.y, timeScaleArea.width, timeScaleArea.height);
  }

  context.fillStyle = theme.axisText;
  context.font = '11px sans-serif';
  context.textBaseline = 'middle';

  for (const tick of generatePriceTicks(priceScale, 7, { locale: 'es-AR' })) {
    const y = plotArea.y + tick.coordinate;

    if (rightPriceScaleArea.width > 0) {
      context.textAlign = 'right';
      context.fillText(tick.label, rightPriceScaleArea.x + rightPriceScaleArea.width - 8, y);
    }

    if (leftPriceScaleArea.width > 0) {
      context.textAlign = 'left';
      context.fillText(tick.label, leftPriceScaleArea.x + 8, y);
    }
  }

  if (timeScaleArea.height > 0) {
    context.textAlign = 'center';

    const timeTicks = generateTimeAxisTicks(timeScale, scene.timeAxisData, {
      targetTickCount: getTargetTimeTickCount(plotArea.width),
      locale: 'es-AR',
    });
    const visibleTimeTicks = selectNonOverlappingTimeAxisTicks(
      timeTicks,
      (label) => context.measureText(label).width,
      timeScaleArea.width,
    );

    for (const tick of visibleTimeTicks) {
      const x = plotArea.x + tick.coordinate;
      context.fillText(tick.label, x, timeScaleArea.y + timeScaleArea.height / 2);
    }
  }

  context.strokeStyle = theme.grid;
  context.lineWidth = 1;
  context.beginPath();

  if (rightPriceScaleArea.width > 0) {
    context.moveTo(rightPriceScaleArea.x, rightPriceScaleArea.y);
    context.lineTo(rightPriceScaleArea.x, rightPriceScaleArea.y + rightPriceScaleArea.height);
  }

  if (leftPriceScaleArea.width > 0) {
    context.moveTo(leftPriceScaleArea.x + leftPriceScaleArea.width, leftPriceScaleArea.y);
    context.lineTo(
      leftPriceScaleArea.x + leftPriceScaleArea.width,
      leftPriceScaleArea.y + leftPriceScaleArea.height,
    );
  }

  if (timeScaleArea.height > 0) {
    context.moveTo(timeScaleArea.x, timeScaleArea.y);
    context.lineTo(timeScaleArea.x + timeScaleArea.width, timeScaleArea.y);
  }

  context.stroke();
  context.restore();
};

const getVisibleCandles = (scene: ChartRenderScene): readonly ChartRenderCandle[] => {
  const { candles, frame } = scene;
  const minimumIndex = frame.timeScale.visibleLogicalRange.from - 1;
  const maximumIndex = frame.timeScale.visibleLogicalRange.to + 1;
  let start = 0;
  let end = candles.length;

  while (start < end) {
    const middle = Math.floor((start + end) / 2);

    const candle = candles[middle];

    if (candle !== undefined && candle.logicalIndex < minimumIndex) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }

  const firstVisibleIndex = start;
  end = candles.length;

  while (start < end) {
    const middle = Math.floor((start + end) / 2);

    const candle = candles[middle];

    if (candle !== undefined && candle.logicalIndex <= maximumIndex) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }

  return candles.slice(firstVisibleIndex, start);
};

const drawCandles = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { frame } = scene;
  const candles = getVisibleCandles(scene);
  const { plotArea } = frame.layout;
  const bodyWidth = Math.max(1, Math.min(20, frame.timeScale.barSpacing * 0.7));

  context.save();
  context.beginPath();
  context.rect(plotArea.x, plotArea.y, plotArea.width, plotArea.height);
  context.clip();

  for (const candle of candles) {
    const x = plotArea.x + logicalIndexToCoordinate(candle.logicalIndex, frame.timeScale);
    const bodyTop =
      plotArea.y + priceToCoordinate(Math.max(candle.open, candle.close), frame.priceScale);
    const bodyBottom =
      plotArea.y + priceToCoordinate(Math.min(candle.open, candle.close), frame.priceScale);
    const high = plotArea.y + priceToCoordinate(candle.high, frame.priceScale);
    const low = plotArea.y + priceToCoordinate(candle.low, frame.priceScale);
    const color = getCandleColor(candle, theme);

    if (x < plotArea.x - bodyWidth || x > plotArea.x + plotArea.width + bodyWidth) {
      continue;
    }

    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, high);
    context.lineTo(x, low);
    context.stroke();
    context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, Math.max(1, bodyBottom - bodyTop));
  }

  context.restore();
};

const drawBars = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { frame } = scene;
  const candles = getVisibleCandles(scene);
  const { plotArea } = frame.layout;
  const tickWidth = Math.max(1, Math.min(7, frame.timeScale.barSpacing * 0.24));

  context.save();
  context.beginPath();
  context.rect(plotArea.x, plotArea.y, plotArea.width, plotArea.height);
  context.clip();

  for (const candle of candles) {
    const x = plotArea.x + logicalIndexToCoordinate(candle.logicalIndex, frame.timeScale);
    const high = plotArea.y + priceToCoordinate(candle.high, frame.priceScale);
    const low = plotArea.y + priceToCoordinate(candle.low, frame.priceScale);
    const open = plotArea.y + priceToCoordinate(candle.open, frame.priceScale);
    const close = plotArea.y + priceToCoordinate(candle.close, frame.priceScale);

    if (x < plotArea.x - tickWidth || x > plotArea.x + plotArea.width + tickWidth) {
      continue;
    }

    context.strokeStyle = getCandleColor(candle, theme);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, high);
    context.lineTo(x, low);
    context.moveTo(x - tickWidth, open);
    context.lineTo(x, open);
    context.moveTo(x, close);
    context.lineTo(x + tickWidth, close);
    context.stroke();
  }

  context.restore();
};

const drawCloseSeries = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
  fillArea: boolean,
): void => {
  const { frame } = scene;
  const candles = getVisibleCandles(scene);
  const { plotArea } = frame.layout;

  if (candles.length === 0) {
    return;
  }

  const points = candles.map((candle) => ({
    x: plotArea.x + logicalIndexToCoordinate(candle.logicalIndex, frame.timeScale),
    y: plotArea.y + priceToCoordinate(candle.close, frame.priceScale),
  }));

  context.save();
  context.beginPath();
  context.rect(plotArea.x, plotArea.y, plotArea.width, plotArea.height);
  context.clip();

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  if (firstPoint === undefined || lastPoint === undefined) {
    context.restore();
    return;
  }

  if (fillArea) {
    context.beginPath();
    context.moveTo(firstPoint.x, plotArea.y + plotArea.height);
    context.lineTo(firstPoint.x, firstPoint.y);

    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    context.lineTo(lastPoint.x, plotArea.y + plotArea.height);
    context.closePath();
    context.fillStyle = theme.bullish;
    context.globalAlpha = 0.14;
    context.fill();
    context.globalAlpha = 1;
  }

  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }

  context.strokeStyle = theme.bullish;
  context.lineWidth = 1.6;
  context.stroke();
  context.restore();
};

const drawVolumeBackground = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { volumeArea } = scene.frame.layout;

  if (volumeArea.height <= 0) {
    return;
  }

  context.save();
  context.fillStyle = theme.volumeBackground;
  context.fillRect(volumeArea.x, volumeArea.y, volumeArea.width, volumeArea.height);
  context.restore();
};

const drawVolumeBars = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { volumeArea, plotArea } = scene.frame.layout;

  if (volumeArea.height <= 0) {
    return;
  }

  const candles = getVisibleCandles(scene);

  if (candles.length === 0) {
    return;
  }

  let maximumVolume = 0;

  for (const candle of candles) {
    maximumVolume = Math.max(maximumVolume, candle.volume);
  }

  if (maximumVolume <= 0) {
    return;
  }

  const barWidth = Math.max(1, Math.min(20, scene.frame.timeScale.barSpacing * 0.7));

  context.save();
  context.beginPath();
  context.rect(volumeArea.x, volumeArea.y, volumeArea.width, volumeArea.height);
  context.clip();

  for (const candle of candles) {
    const x = plotArea.x + logicalIndexToCoordinate(candle.logicalIndex, scene.frame.timeScale);
    const barHeight = (candle.volume / maximumVolume) * Math.max(1, volumeArea.height - 2);

    if (x < volumeArea.x - barWidth || x > volumeArea.x + volumeArea.width + barWidth) {
      continue;
    }

    context.globalAlpha = 0.55;
    context.fillStyle = getCandleColor(candle, theme);
    context.fillRect(
      x - barWidth / 2,
      volumeArea.y + volumeArea.height - barHeight,
      barWidth,
      barHeight,
    );
  }

  context.restore();
};

const drawIndicators = (context: CanvasRenderingContext2D, scene: ChartRenderScene): void => {
  if (scene.indicators.length === 0) {
    return;
  }

  const { frame } = scene;
  const { plotArea } = frame.layout;

  context.save();
  context.beginPath();
  context.rect(plotArea.x, plotArea.y, plotArea.width, plotArea.height);
  context.clip();

  for (const indicator of scene.indicators) {
    const firstPoint = indicator.points[0];

    if (firstPoint === undefined) {
      continue;
    }

    context.beginPath();
    context.moveTo(
      plotArea.x + logicalIndexToCoordinate(firstPoint.logicalIndex, frame.timeScale),
      plotArea.y + priceToCoordinate(firstPoint.value, frame.priceScale),
    );

    for (const point of indicator.points.slice(1)) {
      context.lineTo(
        plotArea.x + logicalIndexToCoordinate(point.logicalIndex, frame.timeScale),
        plotArea.y + priceToCoordinate(point.value, frame.priceScale),
      );
    }

    context.strokeStyle = indicator.color;
    context.lineWidth = 1.5;
    context.stroke();
  }

  context.restore();
};

const getLogicalIndexAtTimestamp = (
  timestamp: number,
  candles: readonly ChartRenderCandle[],
): number | null => {
  if (candles.length === 0 || !Number.isFinite(timestamp)) {
    return null;
  }

  if (candles.length === 1) {
    return candles[0]?.logicalIndex ?? null;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];

  if (first === undefined || last === undefined) {
    return null;
  }

  let left: ChartRenderCandle;
  let right: ChartRenderCandle;

  if (timestamp <= first.timestamp) {
    left = first;
    right = candles[1] ?? first;
  } else if (timestamp >= last.timestamp) {
    left = candles[candles.length - 2] ?? last;
    right = last;
  } else {
    let lower = 0;
    let upper = candles.length - 1;

    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      const candle = candles[middle];

      if (candle === undefined) {
        return null;
      }

      if (candle.timestamp === timestamp) {
        return candle.logicalIndex;
      }

      if (candle.timestamp < timestamp) {
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }

    left = candles[upper] ?? first;
    right = candles[lower] ?? last;
  }

  const duration = right.timestamp - left.timestamp;

  if (duration <= 0) {
    return left.logicalIndex;
  }

  const progress = (timestamp - left.timestamp) / duration;
  return left.logicalIndex + (right.logicalIndex - left.logicalIndex) * progress;
};

const drawDrawings = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
): void => {
  if (scene.drawings.length === 0 || scene.candles.length === 0) {
    return;
  }

  const { frame } = scene;
  const { plotArea } = frame.layout;

  context.save();
  context.beginPath();
  context.rect(plotArea.x, plotArea.y, plotArea.width, plotArea.height);
  context.clip();

  for (const drawing of scene.drawings) {
    const startY = plotArea.y + priceToCoordinate(drawing.start.price, frame.priceScale);

    if (drawing.type === 'horizontal-line') {
      context.beginPath();
      context.moveTo(plotArea.x, startY);
      context.lineTo(plotArea.x + plotArea.width, startY);
    } else if (drawing.end !== null) {
      const startIndex = getLogicalIndexAtTimestamp(drawing.start.timestamp, scene.candles);
      const endIndex = getLogicalIndexAtTimestamp(drawing.end.timestamp, scene.candles);

      if (startIndex === null || endIndex === null) {
        continue;
      }

      context.beginPath();
      context.moveTo(
        plotArea.x + logicalIndexToCoordinate(startIndex, frame.timeScale),
        startY,
      );
      context.lineTo(
        plotArea.x + logicalIndexToCoordinate(endIndex, frame.timeScale),
        plotArea.y + priceToCoordinate(drawing.end.price, frame.priceScale),
      );
    } else {
      continue;
    }

    context.strokeStyle = drawing.color;
    context.lineWidth = 1.5;
    context.stroke();
  }

  context.restore();
};

const drawCrosshair = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const crosshair = scene.crosshair;

  if (crosshair === null) {
    return;
  }

  const { plotArea } = scene.frame.layout;

  if (
    crosshair.x < plotArea.x ||
    crosshair.x > plotArea.x + plotArea.width ||
    crosshair.y < plotArea.y ||
    crosshair.y > plotArea.y + plotArea.height
  ) {
    return;
  }

  context.save();
  context.strokeStyle = theme.crosshair;
  context.lineWidth = 1;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(crosshair.x, plotArea.y);
  context.lineTo(crosshair.x, plotArea.y + plotArea.height + scene.frame.layout.volumeArea.height);
  context.moveTo(plotArea.x, crosshair.y);
  context.lineTo(plotArea.x + plotArea.width, crosshair.y);
  context.stroke();
  context.setLineDash([]);
  context.restore();
};

export const drawChartScene = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme = DEFAULT_CHART_THEME,
): void => {
  const { bounds, plotArea } = scene.frame.layout;

  context.save();
  context.globalAlpha = 1;
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, bounds.width, bounds.height);
  context.fillStyle = theme.plotBackground;
  context.fillRect(plotArea.x, plotArea.y, plotArea.width, plotArea.height);
  drawAxes(context, scene, theme);
  drawVolumeBackground(context, scene, theme);
  drawGrid(context, scene, theme);
  if (scene.chartType === 'candles') {
    drawCandles(context, scene, theme);
  } else if (scene.chartType === 'bars') {
    drawBars(context, scene, theme);
  } else {
    drawCloseSeries(context, scene, theme, scene.chartType === 'area');
  }
  drawVolumeBars(context, scene, theme);
  drawIndicators(context, scene);
  drawDrawings(context, scene);
  drawCrosshair(context, scene, theme);
  context.restore();
};
