import type { ChartCoordinate, ChartDataPoint, ChartFrame } from './chart-frame';
import type { ChartRenderCandle, ChartRenderDrawing } from './canvas-painter';
import { priceToCoordinate } from './price-scale';
import { logicalIndexToCoordinate } from './time-scale';

export type ChartDrawingSelectionArea = Readonly<{
  start: ChartCoordinate;
  end: ChartCoordinate;
}>;

export type ChartDrawingHit = Readonly<{
  drawingId: string;
  target: 'start' | 'end' | 'body';
}>;

export const getLogicalIndexAtTimestamp = (
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

export const getTimestampAtLogicalIndex = (
  logicalIndex: number,
  candles: readonly ChartRenderCandle[],
): number | null => {
  if (!Number.isFinite(logicalIndex) || candles.length === 0) {
    return null;
  }

  if (candles.length === 1) {
    return candles[0]?.timestamp ?? null;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];

  if (first === undefined || last === undefined) {
    return null;
  }

  let left = first;
  let right = last;

  if (logicalIndex <= first.logicalIndex) {
    right = candles[1] ?? first;
  } else if (logicalIndex >= last.logicalIndex) {
    left = candles[candles.length - 2] ?? last;
  } else {
    let lower = 0;
    let upper = candles.length - 1;

    while (lower <= upper) {
      const middle = Math.floor((lower + upper) / 2);
      const candle = candles[middle];

      if (candle === undefined) {
        return null;
      }

      if (candle.logicalIndex === logicalIndex) {
        return candle.timestamp;
      }

      if (candle.logicalIndex < logicalIndex) {
        lower = middle + 1;
      } else {
        upper = middle - 1;
      }
    }

    left = candles[upper] ?? first;
    right = candles[lower] ?? last;
  }

  const indexSpan = right.logicalIndex - left.logicalIndex;

  if (indexSpan <= 0) {
    return left.timestamp;
  }

  const progress = (logicalIndex - left.logicalIndex) / indexSpan;
  return left.timestamp + (right.timestamp - left.timestamp) * progress;
};

const getDrawingCoordinates = (
  drawing: ChartRenderDrawing,
  candles: readonly ChartRenderCandle[],
  frame: ChartFrame,
): Readonly<{ start: ChartCoordinate; end: ChartCoordinate | null }> | null => {
  const startIndex = getLogicalIndexAtTimestamp(drawing.start.timestamp, candles);

  if (startIndex === null) {
    return null;
  }

  const { plotArea } = frame.layout;
  const start: ChartCoordinate = Object.freeze({
    x: plotArea.x + logicalIndexToCoordinate(startIndex, frame.timeScale),
    y: plotArea.y + priceToCoordinate(drawing.start.price, frame.priceScale),
  });

  if (drawing.end === null) {
    return Object.freeze({ start, end: null });
  }

  const endIndex = getLogicalIndexAtTimestamp(drawing.end.timestamp, candles);

  if (endIndex === null) {
    return null;
  }

  const end: ChartCoordinate = Object.freeze({
    x: plotArea.x + logicalIndexToCoordinate(endIndex, frame.timeScale),
    y: plotArea.y + priceToCoordinate(drawing.end.price, frame.priceScale),
  });

  return Object.freeze({ start, end });
};

const distance = (first: ChartCoordinate, second: ChartCoordinate): number =>
  Math.hypot(first.x - second.x, first.y - second.y);

const distanceToSegment = (
  point: ChartCoordinate,
  start: ChartCoordinate,
  end: ChartCoordinate,
): number => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (lengthSquared === 0) {
    return distance(point, start);
  }

  const progress = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared),
  );
  return distance(point, {
    x: start.x + progress * deltaX,
    y: start.y + progress * deltaY,
  });
};

const getRayEnd = (
  start: ChartCoordinate,
  end: ChartCoordinate,
  frame: ChartFrame,
): ChartCoordinate | null => {
  const { plotArea } = frame.layout;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (deltaX === 0 && deltaY === 0) {
    return null;
  }

  const right = plotArea.x + plotArea.width;
  const bottom = plotArea.y + plotArea.height;
  const xIntersection =
    deltaX > 0
      ? (right - start.x) / deltaX
      : deltaX < 0
        ? (plotArea.x - start.x) / deltaX
        : Number.POSITIVE_INFINITY;
  const yIntersection =
    deltaY > 0
      ? (bottom - start.y) / deltaY
      : deltaY < 0
        ? (plotArea.y - start.y) / deltaY
        : Number.POSITIVE_INFINITY;
  const intersections = [xIntersection, yIntersection].filter(
    (value) => value >= 0 && Number.isFinite(value),
  );
  const extent = Math.min(...intersections);

  if (!Number.isFinite(extent)) {
    return null;
  }

  return Object.freeze({
    x: start.x + deltaX * extent,
    y: start.y + deltaY * extent,
  });
};

const isInside = (
  point: ChartCoordinate,
  first: ChartCoordinate,
  second: ChartCoordinate,
): boolean =>
  point.x >= Math.min(first.x, second.x) &&
  point.x <= Math.max(first.x, second.x) &&
  point.y >= Math.min(first.y, second.y) &&
  point.y <= Math.max(first.y, second.y);

const hitDrawingBody = (
  drawing: ChartRenderDrawing,
  start: ChartCoordinate,
  end: ChartCoordinate | null,
  point: ChartCoordinate,
  frame: ChartFrame,
  tolerance: number,
): boolean => {
  const { plotArea } = frame.layout;
  const plotRight = plotArea.x + plotArea.width;

  if (drawing.type === 'horizontal-line') {
    return (
      point.x >= plotArea.x && point.x <= plotRight && Math.abs(point.y - start.y) <= tolerance
    );
  }

  if (drawing.type === 'vertical-line') {
    return (
      point.y >= plotArea.y &&
      point.y <= plotArea.y + plotArea.height &&
      Math.abs(point.x - start.x) <= tolerance
    );
  }

  if (end === null) {
    return false;
  }

  if (drawing.type === 'ray') {
    const rayEnd = getRayEnd(start, end, frame);
    return rayEnd !== null && distanceToSegment(point, start, rayEnd) <= tolerance;
  }

  if (drawing.type === 'rectangle') {
    const inside = isInside(point, start, end);
    const onEdge =
      distanceToSegment(point, start, { x: end.x, y: start.y }) <= tolerance ||
      distanceToSegment(point, { x: end.x, y: start.y }, end) <= tolerance ||
      distanceToSegment(point, end, { x: start.x, y: end.y }) <= tolerance ||
      distanceToSegment(point, { x: start.x, y: end.y }, start) <= tolerance;
    return inside || onEdge;
  }

  return distanceToSegment(point, start, end) <= tolerance;
};

export const hitTestChartDrawing = (
  point: ChartCoordinate,
  drawings: readonly ChartRenderDrawing[],
  candles: readonly ChartRenderCandle[],
  frame: ChartFrame,
  tolerance = 8,
): ChartDrawingHit | null => {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    throw new RangeError('Drawing hit-test coordinates and tolerance must be finite.');
  }

  for (let index = drawings.length - 1; index >= 0; index -= 1) {
    const drawing = drawings[index];

    if (drawing === undefined || drawing.locked === true) {
      continue;
    }

    const coordinates = getDrawingCoordinates(drawing, candles, frame);

    if (coordinates === null) {
      continue;
    }

    if (distance(point, coordinates.start) <= tolerance + 2) {
      return Object.freeze({ drawingId: drawing.id, target: 'start' });
    }

    if (coordinates.end !== null && distance(point, coordinates.end) <= tolerance + 2) {
      return Object.freeze({ drawingId: drawing.id, target: 'end' });
    }

    if (hitDrawingBody(drawing, coordinates.start, coordinates.end, point, frame, tolerance)) {
      return Object.freeze({ drawingId: drawing.id, target: 'body' });
    }
  }

  return null;
};

export const selectChartDrawingsWithinArea = (
  area: ChartDrawingSelectionArea,
  drawings: readonly ChartRenderDrawing[],
  candles: readonly ChartRenderCandle[],
  frame: ChartFrame,
): readonly string[] => {
  const left = Math.min(area.start.x, area.end.x);
  const right = Math.max(area.start.x, area.end.x);
  const top = Math.min(area.start.y, area.end.y);
  const bottom = Math.max(area.start.y, area.end.y);

  if (![left, right, top, bottom].every(Number.isFinite)) {
    throw new RangeError('Drawing selection area coordinates must be finite.');
  }

  const contains = (point: ChartCoordinate): boolean =>
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;

  const segmentIntersectsArea = (start: ChartCoordinate, end: ChartCoordinate): boolean => {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    let minimum = 0;
    let maximum = 1;
    const constraints: readonly (readonly [number, number])[] = [
      [-deltaX, start.x - left],
      [deltaX, right - start.x],
      [-deltaY, start.y - top],
      [deltaY, bottom - start.y],
    ];

    for (const [direction, distanceFromEdge] of constraints) {
      if (direction === 0) {
        if (distanceFromEdge < 0) {
          return false;
        }
        continue;
      }

      const progress = distanceFromEdge / direction;

      if (direction < 0) {
        minimum = Math.max(minimum, progress);
      } else {
        maximum = Math.min(maximum, progress);
      }

      if (minimum > maximum) {
        return false;
      }
    }

    return true;
  };

  const intersectsArea = (
    drawing: ChartRenderDrawing,
    start: ChartCoordinate,
    end: ChartCoordinate | null,
  ): boolean => {
    if (drawing.type === 'horizontal-line') {
      const { plotArea } = frame.layout;
      return segmentIntersectsArea(
        { x: plotArea.x, y: start.y },
        { x: plotArea.x + plotArea.width, y: start.y },
      );
    }

    if (drawing.type === 'vertical-line') {
      const { plotArea } = frame.layout;
      return segmentIntersectsArea(
        { x: start.x, y: plotArea.y },
        { x: start.x, y: plotArea.y + plotArea.height },
      );
    }

    if (end === null) {
      return contains(start);
    }

    if (drawing.type === 'rectangle') {
      return (
        Math.max(start.x, end.x) >= left &&
        Math.min(start.x, end.x) <= right &&
        Math.max(start.y, end.y) >= top &&
        Math.min(start.y, end.y) <= bottom
      );
    }

    if (drawing.type === 'ray') {
      const rayEnd = getRayEnd(start, end, frame);
      return rayEnd !== null && segmentIntersectsArea(start, rayEnd);
    }

    return segmentIntersectsArea(start, end);
  };

  const selectedIds: string[] = [];

  for (const drawing of drawings) {
    if (drawing.locked === true) {
      continue;
    }

    const coordinates = getDrawingCoordinates(drawing, candles, frame);

    if (coordinates !== null && intersectsArea(drawing, coordinates.start, coordinates.end)) {
      selectedIds.push(drawing.id);
    }
  }

  return Object.freeze(selectedIds);
};

export const updateChartDrawing = (
  drawing: ChartRenderDrawing,
  target: ChartDrawingHit['target'],
  origin: ChartDataPoint,
  current: ChartDataPoint,
  candles: readonly ChartRenderCandle[],
): ChartRenderDrawing => {
  const logicalDelta = current.logicalIndex - origin.logicalIndex;
  const priceDelta = current.price - origin.price;

  const updateAnchor = (
    anchor: ChartRenderDrawing['start'],
    nextLogicalIndex: number,
    nextPrice: number,
  ): ChartRenderDrawing['start'] => {
    const timestamp = getTimestampAtLogicalIndex(nextLogicalIndex, candles);

    if (timestamp === null || !Number.isFinite(nextPrice)) {
      throw new RangeError('Edited drawing anchors must resolve to finite market coordinates.');
    }

    return Object.freeze({ timestamp, price: nextPrice });
  };

  if (target === 'start') {
    if (drawing.type === 'horizontal-line') {
      return Object.freeze({
        ...drawing,
        start: Object.freeze({ ...drawing.start, price: current.price }),
      });
    }

    if (drawing.type === 'vertical-line') {
      return Object.freeze({
        ...drawing,
        start: updateAnchor(drawing.start, current.logicalIndex, drawing.start.price),
      });
    }

    return Object.freeze({
      ...drawing,
      start: updateAnchor(drawing.start, current.logicalIndex, current.price),
    });
  }

  if (target === 'end') {
    if (drawing.end === null) {
      throw new RangeError('A drawing without an end anchor cannot edit its end point.');
    }

    return Object.freeze({
      ...drawing,
      end: updateAnchor(drawing.end, current.logicalIndex, current.price),
    });
  }

  if (drawing.type === 'horizontal-line') {
    return Object.freeze({
      ...drawing,
      start: Object.freeze({
        ...drawing.start,
        price: drawing.start.price + priceDelta,
      }),
    });
  }

  const startLogicalIndex = getLogicalIndexAtTimestamp(drawing.start.timestamp, candles);

  if (startLogicalIndex === null) {
    throw new RangeError('Drawing start anchor is outside the available market data.');
  }

  if (drawing.type === 'vertical-line') {
    return Object.freeze({
      ...drawing,
      start: updateAnchor(drawing.start, startLogicalIndex + logicalDelta, drawing.start.price),
    });
  }

  if (drawing.end === null) {
    throw new RangeError('A two-point drawing must contain an end anchor.');
  }

  const endLogicalIndex = getLogicalIndexAtTimestamp(drawing.end.timestamp, candles);

  if (endLogicalIndex === null) {
    throw new RangeError('Drawing end anchor is outside the available market data.');
  }

  return Object.freeze({
    ...drawing,
    start: updateAnchor(
      drawing.start,
      startLogicalIndex + logicalDelta,
      drawing.start.price + priceDelta,
    ),
    end: updateAnchor(drawing.end, endLogicalIndex + logicalDelta, drawing.end.price + priceDelta),
  });
};
