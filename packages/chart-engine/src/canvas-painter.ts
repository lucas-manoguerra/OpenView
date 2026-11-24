import type { Candle } from '@openview/market-domain';
import { generatePriceTicks, priceToCoordinate } from './price-scale';
import { generateTimeTicks, logicalIndexToCoordinate } from './time-scale';
import type { ChartCoordinate, ChartFrame } from './chart-frame';

export type ChartRenderCandle = Candle &
  Readonly<{
    logicalIndex: number;
  }>;

export type ChartRenderScene = Readonly<{
  frame: ChartFrame;
  candles: readonly ChartRenderCandle[];
  crosshair: ChartCoordinate | null;
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

export const createChartRenderScene = (
  frame: ChartFrame,
  candles: readonly ChartRenderCandle[],
  crosshair: ChartCoordinate | null = null,
): ChartRenderScene => {
  let previousLogicalIndex = Number.NEGATIVE_INFINITY;

  for (const candle of candles) {
    if (
      !Number.isFinite(candle.logicalIndex) ||
      candle.logicalIndex <= previousLogicalIndex ||
      !Number.isFinite(candle.volume) ||
      candle.volume < 0
    ) {
      throw new RangeError('Render candles must have ordered logical indices and valid volumes.');
    }

    previousLogicalIndex = candle.logicalIndex;
  }

  if (
    crosshair !== null &&
    (!Number.isFinite(crosshair.x) || !Number.isFinite(crosshair.y))
  ) {
    throw new RangeError('Crosshair coordinates must be finite numbers.');
  }

  return Object.freeze({
    frame,
    candles: Object.freeze(candles.map((candle) => Object.freeze({ ...candle }))),
    crosshair: crosshair === null ? null : Object.freeze({ ...crosshair }),
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

  for (const tick of generateTimeTicks(frame.timeScale, 8)) {
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
    context.fillRect(
      timeScaleArea.x,
      timeScaleArea.y,
      timeScaleArea.width,
      timeScaleArea.height,
    );
  }

  context.fillStyle = theme.axisText;
  context.font = '11px sans-serif';
  context.textBaseline = 'middle';

  for (const tick of generatePriceTicks(priceScale, 7)) {
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

    for (const tick of generateTimeTicks(timeScale, 8)) {
      const x = plotArea.x + tick.coordinate;
      context.fillText(String(tick.logicalIndex), x, timeScaleArea.y + timeScaleArea.height / 2);
    }
  }

  context.strokeStyle = theme.grid;
  context.lineWidth = 1;
  context.beginPath();

  if (rightPriceScaleArea.width > 0) {
    context.moveTo(rightPriceScaleArea.x, rightPriceScaleArea.y);
    context.lineTo(
      rightPriceScaleArea.x,
      rightPriceScaleArea.y + rightPriceScaleArea.height,
    );
  }

  if (leftPriceScaleArea.width > 0) {
    context.moveTo(
      leftPriceScaleArea.x + leftPriceScaleArea.width,
      leftPriceScaleArea.y,
    );
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

const drawCandles = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { frame, candles } = scene;
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
    context.fillRect(
      x - bodyWidth / 2,
      bodyTop,
      bodyWidth,
      Math.max(1, bodyBottom - bodyTop),
    );
  }

  context.restore();
};

const drawVolume = (
  context: CanvasRenderingContext2D,
  scene: ChartRenderScene,
  theme: ChartRenderTheme,
): void => {
  const { volumeArea, plotArea } = scene.frame.layout;

  if (volumeArea.height <= 0) {
    return;
  }

  context.save();
  context.fillStyle = theme.volumeBackground;
  context.fillRect(volumeArea.x, volumeArea.y, volumeArea.width, volumeArea.height);

  if (scene.candles.length === 0) {
    context.restore();
    return;
  }

  let maximumVolume = 0;

  for (const candle of scene.candles) {
    maximumVolume = Math.max(maximumVolume, candle.volume);
  }

  if (maximumVolume <= 0) {
    context.restore();
    return;
  }

  const barWidth = Math.max(1, Math.min(20, scene.frame.timeScale.barSpacing * 0.7));
  context.beginPath();
  context.rect(volumeArea.x, volumeArea.y, volumeArea.width, volumeArea.height);
  context.clip();

  for (const candle of scene.candles) {
    const x =
      plotArea.x + logicalIndexToCoordinate(candle.logicalIndex, scene.frame.timeScale);
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
  context.lineTo(crosshair.x, plotArea.y + plotArea.height);
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
  drawGrid(context, scene, theme);
  drawCandles(context, scene, theme);
  drawVolume(context, scene, theme);
  drawCrosshair(context, scene, theme);
  context.restore();
};
