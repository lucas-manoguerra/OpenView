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
import { getLogicalIndexAtTimestamp } from './drawing-geometry';
import {
  createChartObjectOrder,
  reconcileChartObjectOrder,
  type ChartObjectOrderItem,
} from './chart-object-order';

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

export type ChartDrawingLineStyle = 'solid' | 'dashed' | 'dotted';
export type ChartDrawingEndpointStyle = 'none' | 'arrow' | 'circle';

export type ChartRenderDrawing = Readonly<{
  id: string;
  type: 'trend-line' | 'ray' | 'horizontal-line' | 'vertical-line' | 'rectangle';
  start: ChartDrawingPoint;
  end: ChartDrawingPoint | null;
  color: string;
  lineWidth?: number;
  lineStyle?: ChartDrawingLineStyle;
  fillColor?: string;
  fillOpacity?: number;
  extendStart?: boolean;
  extendEnd?: boolean;
  startStyle?: ChartDrawingEndpointStyle;
  endStyle?: ChartDrawingEndpointStyle;
  locked?: boolean;
  visible?: boolean;
}>;

export type ChartRenderDrawingHit = Readonly<{
  drawingId: string;
  target: 'body' | 'start' | 'end';
}>;

export type ChartRenderScene = Readonly<{
  frame: ChartFrame;
  candles: readonly ChartRenderCandle[];
  timeAxisData: TimeAxisData;
  crosshair: ChartCoordinate | null;
  chartType: ChartType;
  indicators: readonly ChartIndicatorSeries[];
  drawings: readonly ChartRenderDrawing[];
  selectedDrawingId: string | null;
  selectedDrawingIds: readonly string[];
  hoveredDrawingHit: ChartRenderDrawingHit | null;
  objectOrder: readonly ChartObjectOrderItem[];
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

const normalizeSelectedDrawingIds = (
  selectedDrawingIds: readonly string[],
  drawings: readonly ChartRenderDrawing[],
): readonly string[] => {
  const drawingIds = new Set(drawings.map((drawing) => drawing.id));
  return Object.freeze([...new Set(selectedDrawingIds)].filter((id) => drawingIds.has(id)));
};

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
        (drawing.type !== 'horizontal-line' &&
          drawing.type !== 'vertical-line' &&
          drawing.end === null)
      ) {
        throw new RangeError('Chart drawings must contain finite anchored points.');
      }

      if (
        drawing.end !== null &&
        (!Number.isFinite(drawing.end.timestamp) || !Number.isFinite(drawing.end.price))
      ) {
        throw new RangeError('Chart drawing end points must be finite.');
      }

      const lineWidth = drawing.lineWidth ?? 1.5;
      const lineStyle = drawing.lineStyle ?? 'solid';

      if (!Number.isFinite(lineWidth) || lineWidth < 0.5 || lineWidth > 8) {
        throw new RangeError('Chart drawing line width must be between 0.5 and 8.');
      }

      if (!(['solid', 'dashed', 'dotted'] as const).includes(lineStyle)) {
        throw new RangeError('Chart drawing line style must be solid, dashed or dotted.');
      }

      const fillColor = drawing.fillColor ?? drawing.color;
      const fillOpacity = drawing.fillOpacity ?? 0;
      const extendStart = drawing.extendStart ?? false;
      const extendEnd = drawing.extendEnd ?? drawing.type === 'ray';
      const startStyle = drawing.startStyle ?? 'none';
      const endStyle = drawing.endStyle ?? 'none';
      const locked = drawing.locked ?? false;
      const visible = drawing.visible ?? true;

      if (
        typeof fillColor !== 'string' ||
        fillColor.length === 0 ||
        !Number.isFinite(fillOpacity) ||
        fillOpacity < 0 ||
        fillOpacity > 1
      ) {
        throw new RangeError('Chart drawing fill color and opacity must be valid.');
      }

      if (typeof visible !== 'boolean') {
        throw new RangeError('Chart drawing visibility must be a boolean.');
      }

      if (typeof extendStart !== 'boolean' || typeof extendEnd !== 'boolean') {
        throw new RangeError('Chart drawing extensions must be boolean values.');
      }

      if (
        !(['none', 'arrow', 'circle'] as const).includes(startStyle) ||
        !(['none', 'arrow', 'circle'] as const).includes(endStyle)
      ) {
        throw new RangeError('Chart drawing endpoint style must be none, arrow or circle.');
      }

      ids.add(drawing.id);
      return Object.freeze({
        id: drawing.id,
        type: drawing.type,
        start: Object.freeze({ ...drawing.start }),
        end: drawing.end === null ? null : Object.freeze({ ...drawing.end }),
        color: drawing.color,
        lineWidth,
        lineStyle,
        fillColor,
        fillOpacity,
        extendStart,
        extendEnd,
        startStyle,
        endStyle,
        locked,
        visible,
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
  selectedDrawingId: string | null = null,
  selectedDrawingIds: readonly string[] = selectedDrawingId === null ? [] : [selectedDrawingId],
  hoveredDrawingHit: ChartRenderDrawingHit | null = null,
  objectOrder?: readonly ChartObjectOrderItem[],
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
  const frozenSelectedDrawingIds = normalizeSelectedDrawingIds(selectedDrawingIds, frozenDrawings);
  const availableObjects: ChartObjectOrderItem[] = [
    { kind: 'price-series', id: 'main' },
    { kind: 'volume', id: 'volume' },
    ...frozenIndicators.map((indicator) => ({ kind: 'indicator' as const, id: indicator.id })),
    ...frozenDrawings.map((drawing) => ({ kind: 'drawing' as const, id: drawing.id })),
  ];
  const frozenObjectOrder = reconcileChartObjectOrder(
    objectOrder ?? createChartObjectOrder(availableObjects),
    availableObjects,
  );

  return Object.freeze({
    frame,
    candles: frozenCandles,
    timeAxisData: createTimeAxisData(frozenCandles),
    crosshair: crosshair === null ? null : Object.freeze({ ...crosshair }),
    chartType,
    indicators: frozenIndicators,
    drawings: frozenDrawings,
    selectedDrawingId: frozenSelectedDrawingIds[frozenSelectedDrawingIds.length - 1] ?? null,
    selectedDrawingIds: frozenSelectedDrawingIds,
    hoveredDrawingHit:
      hoveredDrawingHit !== null &&
      frozenDrawings.some((drawing) => drawing.id === hoveredDrawingHit.drawingId)
        ? Object.freeze({ ...hoveredDrawingHit })
        : null,
    objectOrder: frozenObjectOrder,
  });
};

export type ChartRenderSceneUpdate = Readonly<{
  frame?: ChartFrame;
  crosshair?: ChartCoordinate | null;
  chartType?: ChartType;
  indicators?: readonly ChartIndicatorSeries[];
  drawings?: readonly ChartRenderDrawing[];
  selectedDrawingId?: string | null;
  selectedDrawingIds?: readonly string[];
  hoveredDrawingHit?: ChartRenderDrawingHit | null;
  objectOrder?: readonly ChartObjectOrderItem[];
}>;

export const updateChartRenderScene = (
  scene: ChartRenderScene,
  update: ChartRenderSceneUpdate,
): ChartRenderScene => {
  const frame = update.frame ?? scene.frame;
  const crosshair = update.crosshair === undefined ? scene.crosshair : update.crosshair;
  const chartType = update.chartType ?? scene.chartType;
  const indicators =
    update.indicators === undefined || update.indicators === scene.indicators
      ? scene.indicators
      : normalizeChartIndicators(update.indicators);
  const drawings =
    update.drawings === undefined || update.drawings === scene.drawings
      ? scene.drawings
      : normalizeChartDrawings(update.drawings);
  const requestedSelectedDrawingIds =
    update.selectedDrawingIds ??
    (update.selectedDrawingId === undefined
      ? scene.selectedDrawingIds
      : update.selectedDrawingId === null
        ? []
        : [update.selectedDrawingId]);
  const selectedDrawingIds =
    update.selectedDrawingIds === undefined &&
    update.selectedDrawingId === undefined &&
    drawings === scene.drawings
      ? scene.selectedDrawingIds
      : normalizeSelectedDrawingIds(requestedSelectedDrawingIds, drawings);
  const selectedDrawingId = selectedDrawingIds[selectedDrawingIds.length - 1] ?? null;
  const hoveredDrawingHit =
    update.hoveredDrawingHit === undefined
      ? scene.hoveredDrawingHit
      : update.hoveredDrawingHit !== null &&
          drawings.some((drawing) => drawing.id === update.hoveredDrawingHit?.drawingId)
        ? Object.freeze({ ...update.hoveredDrawingHit })
        : null;
  const availableObjects: ChartObjectOrderItem[] = [
    { kind: 'price-series', id: 'main' },
    { kind: 'volume', id: 'volume' },
    ...indicators.map((indicator) => ({ kind: 'indicator' as const, id: indicator.id })),
    ...drawings.map((drawing) => ({ kind: 'drawing' as const, id: drawing.id })),
  ];
  const objectOrder = reconcileChartObjectOrder(
    update.objectOrder ?? scene.objectOrder,
    availableObjects,
  );

  if (crosshair !== null && (!Number.isFinite(crosshair.x) || !Number.isFinite(crosshair.y))) {
    throw new RangeError('Crosshair coordinates must be finite numbers.');
  }

  if (
    frame === scene.frame &&
    crosshair?.x === scene.crosshair?.x &&
    crosshair?.y === scene.crosshair?.y &&
    chartType === scene.chartType &&
    indicators === scene.indicators &&
    drawings === scene.drawings &&
    selectedDrawingId === scene.selectedDrawingId &&
    selectedDrawingIds === scene.selectedDrawingIds &&
    hoveredDrawingHit?.drawingId === scene.hoveredDrawingHit?.drawingId &&
    hoveredDrawingHit?.target === scene.hoveredDrawingHit?.target &&
    objectOrder === scene.objectOrder
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
    selectedDrawingId,
    selectedDrawingIds,
    hoveredDrawingHit,
    objectOrder,
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

const getPositivePlotExtent = (
  originX: number,
  originY: number,
  deltaX: number,
  deltaY: number,
  plotArea: ChartFrame['layout']['plotArea'],
): number | null => {
  const right = plotArea.x + plotArea.width;
  const bottom = plotArea.y + plotArea.height;
  const intersections = [
    deltaX > 0
      ? (right - originX) / deltaX
      : deltaX < 0
        ? (plotArea.x - originX) / deltaX
        : Number.POSITIVE_INFINITY,
    deltaY > 0
      ? (bottom - originY) / deltaY
      : deltaY < 0
        ? (plotArea.y - originY) / deltaY
        : Number.POSITIVE_INFINITY,
  ].filter((intersection) => intersection >= 0 && Number.isFinite(intersection));

  return intersections.length === 0 ? null : Math.min(...intersections);
};

const drawDrawingEndpoint = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: number,
  style: ChartDrawingEndpointStyle,
  color: string,
  lineWidth: number,
): void => {
  if (style === 'none') {
    return;
  }

  context.save();
  context.fillStyle = color;
  context.strokeStyle = color;

  if (style === 'circle') {
    context.beginPath();
    context.arc(x, y, Math.max(3, lineWidth * 1.5), 0, Math.PI * 2);
    context.fill();
  } else {
    const size = Math.max(8, lineWidth * 3);
    const wing = size * 0.55;
    const leftAngle = direction + Math.PI - Math.PI / 6;
    const rightAngle = direction + Math.PI + Math.PI / 6;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(leftAngle) * size, y + Math.sin(leftAngle) * size);
    context.lineTo(
      x + Math.cos(direction + Math.PI) * wing,
      y + Math.sin(direction + Math.PI) * wing,
    );
    context.lineTo(x + Math.cos(rightAngle) * size, y + Math.sin(rightAngle) * size);
    context.closePath();
    context.fill();
  }

  context.restore();
};

const drawDrawings = (context: CanvasRenderingContext2D, scene: ChartRenderScene): void => {
  if (scene.drawings.length === 0 || scene.candles.length === 0) {
    return;
  }

  const { frame } = scene;
  const { plotArea, volumeArea } = frame.layout;
  const plotRight = plotArea.x + plotArea.width;
  const plotBottom = plotArea.y + plotArea.height;

  context.save();
  context.beginPath();
  context.rect(plotArea.x, plotArea.y, plotArea.width, plotArea.height + volumeArea.height);
  context.clip();

  const selectionHandles: {
    point: ChartCoordinate;
    color: string;
    hovered: boolean;
  }[] = [];

  for (const drawing of scene.drawings) {
    if (drawing.visible === false) {
      continue;
    }

    const startIndex = getLogicalIndexAtTimestamp(drawing.start.timestamp, scene.candles);

    if (startIndex === null) {
      continue;
    }

    const startX = plotArea.x + logicalIndexToCoordinate(startIndex, frame.timeScale);
    const startY = plotArea.y + priceToCoordinate(drawing.start.price, frame.priceScale);
    const startHandle: ChartCoordinate = { x: startX, y: startY };
    let endHandle: ChartCoordinate | null = null;

    context.beginPath();

    if (drawing.type === 'horizontal-line') {
      context.moveTo(plotArea.x, startY);
      context.lineTo(plotRight, startY);
    } else if (drawing.type === 'vertical-line') {
      context.moveTo(startX, plotArea.y);
      context.lineTo(startX, plotBottom + volumeArea.height);
    } else if (drawing.end !== null) {
      const endIndex = getLogicalIndexAtTimestamp(drawing.end.timestamp, scene.candles);

      if (endIndex === null) {
        continue;
      }

      const endX = plotArea.x + logicalIndexToCoordinate(endIndex, frame.timeScale);
      const endY = plotArea.y + priceToCoordinate(drawing.end.price, frame.priceScale);
      endHandle = { x: endX, y: endY };

      if (drawing.type === 'rectangle') {
        context.moveTo(startX, startY);
        context.lineTo(endX, startY);
        context.lineTo(endX, endY);
        context.lineTo(startX, endY);
        context.lineTo(startX, startY);
      } else {
        const deltaX = endX - startX;
        const deltaY = endY - startY;

        if (deltaX === 0 && deltaY === 0) {
          continue;
        }

        let segmentStartX = startX;
        let segmentStartY = startY;
        let segmentEndX = endX;
        let segmentEndY = endY;

        if (drawing.extendStart ?? false) {
          const extent = getPositivePlotExtent(startX, startY, -deltaX, -deltaY, plotArea);

          if (extent !== null) {
            segmentStartX = startX - deltaX * extent;
            segmentStartY = startY - deltaY * extent;
          }
        }

        if (drawing.extendEnd ?? drawing.type === 'ray') {
          const extent = getPositivePlotExtent(startX, startY, deltaX, deltaY, plotArea);

          if (extent !== null) {
            segmentEndX = startX + deltaX * extent;
            segmentEndY = startY + deltaY * extent;
          }
        }

        context.moveTo(segmentStartX, segmentStartY);
        context.lineTo(segmentEndX, segmentEndY);
      }
    } else {
      continue;
    }

    const isSelected =
      scene.selectedDrawingId === drawing.id || scene.selectedDrawingIds.includes(drawing.id);
    const lineDash =
      drawing.lineStyle === 'dashed' ? [8, 5] : drawing.lineStyle === 'dotted' ? [2, 4] : [];
    context.setLineDash(lineDash);
    context.strokeStyle = drawing.color;
    context.lineWidth = (drawing.lineWidth ?? 1.5) + (isSelected ? 1 : 0);

    if (drawing.type === 'rectangle' && (drawing.fillOpacity ?? 0) > 0) {
      context.save();
      context.globalAlpha = drawing.fillOpacity ?? 0;
      context.fillStyle = drawing.fillColor ?? drawing.color;
      context.fill();
      context.restore();
    }

    context.stroke();

    if (endHandle !== null && (drawing.type === 'trend-line' || drawing.type === 'ray')) {
      const direction = Math.atan2(endHandle.y - startHandle.y, endHandle.x - startHandle.x);
      drawDrawingEndpoint(
        context,
        startHandle.x,
        startHandle.y,
        direction + Math.PI,
        drawing.startStyle ?? 'none',
        drawing.color,
        drawing.lineWidth ?? 1.5,
      );
      drawDrawingEndpoint(
        context,
        endHandle.x,
        endHandle.y,
        direction,
        drawing.endStyle ?? 'none',
        drawing.color,
        drawing.lineWidth ?? 1.5,
      );
    }

    const hoveredTarget =
      scene.hoveredDrawingHit?.drawingId === drawing.id ? scene.hoveredDrawingHit.target : null;
    if (isSelected || hoveredTarget === 'start') {
      selectionHandles.push({
        point: startHandle,
        color: drawing.color,
        hovered: hoveredTarget === 'start',
      });
    }
    if (endHandle !== null && (isSelected || hoveredTarget === 'end')) {
      selectionHandles.push({
        point: endHandle,
        color: drawing.color,
        hovered: hoveredTarget === 'end',
      });
    }
  }

  for (const handle of selectionHandles) {
    context.beginPath();
    context.arc(handle.point.x, handle.point.y, handle.hovered ? 8 : 6, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.strokeStyle = handle.color;
    context.lineWidth = handle.hovered ? 2 : 1.5;
    context.stroke();

    context.beginPath();
    context.arc(handle.point.x, handle.point.y, 2, 0, Math.PI * 2);
    context.fillStyle = handle.color;
    context.fill();
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
  for (const item of scene.objectOrder) {
    if (item.kind === 'price-series' && item.id === 'main') {
      if (scene.chartType === 'candles') {
        drawCandles(context, scene, theme);
      } else if (scene.chartType === 'bars') {
        drawBars(context, scene, theme);
      } else {
        drawCloseSeries(context, scene, theme, scene.chartType === 'area');
      }
    } else if (item.kind === 'volume' && item.id === 'volume') {
      drawVolumeBars(context, scene, theme);
    } else if (item.kind === 'indicator') {
      const indicator = scene.indicators.find((candidate) => candidate.id === item.id);
      if (indicator !== undefined) {
        drawIndicators(context, { ...scene, indicators: [indicator] });
      }
    } else if (item.kind === 'drawing') {
      const drawing = scene.drawings.find((candidate) => candidate.id === item.id);
      if (drawing !== undefined) {
        drawDrawings(context, { ...scene, drawings: [drawing] });
      }
    }
  }
  drawCrosshair(context, scene, theme);
  context.restore();
};
