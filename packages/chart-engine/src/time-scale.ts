export type LogicalRange = Readonly<{
  from: number;
  to: number;
}>;

export type TimeScaleOptions = Readonly<{
  barSpacing?: number;
  rightOffset?: number;
  minBarSpacing?: number;
  maxBarSpacing?: number;
  inverted?: boolean;
}>;

export type TimeScale = Readonly<{
  width: number;
  rightmostLogicalIndex: number;
  barSpacing: number;
  rightOffset: number;
  minBarSpacing: number;
  maxBarSpacing: number;
  inverted: boolean;
  visibleLogicalRange: LogicalRange;
}>;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const createTimeScale = (
  width: number,
  rightmostLogicalIndex: number,
  options: TimeScaleOptions = {},
): TimeScale => {
  const barSpacing = options.barSpacing ?? 8;
  const rightOffset = options.rightOffset ?? 0;
  const minBarSpacing = options.minBarSpacing ?? 2;
  const maxBarSpacing = options.maxBarSpacing ?? 50;

  if (
    ![width, rightmostLogicalIndex, barSpacing, rightOffset, minBarSpacing, maxBarSpacing].every(
      Number.isFinite,
    )
  ) {
    throw new RangeError('Time scale dimensions and logical offsets must be finite numbers.');
  }

  if (width <= 0 || barSpacing <= 0 || minBarSpacing <= 0 || maxBarSpacing < minBarSpacing) {
    throw new RangeError('Time scale dimensions and bar spacing limits must be positive.');
  }

  if (barSpacing < minBarSpacing || barSpacing > maxBarSpacing) {
    throw new RangeError('Bar spacing must remain within its configured limits.');
  }

  const visibleTo = rightmostLogicalIndex + rightOffset + 0.5;
  const visibleFrom = visibleTo - width / barSpacing;

  if (!Number.isFinite(visibleFrom) || !Number.isFinite(visibleTo) || visibleTo <= visibleFrom) {
    throw new RangeError('The visible logical range must have a finite positive span.');
  }

  const visibleLogicalRange: LogicalRange = Object.freeze({
    from: visibleFrom,
    to: visibleTo,
  });

  return Object.freeze({
    width,
    rightmostLogicalIndex,
    barSpacing,
    rightOffset,
    minBarSpacing,
    maxBarSpacing,
    inverted: options.inverted ?? false,
    visibleLogicalRange,
  });
};

export const logicalIndexToCoordinate = (logicalIndex: number, scale: TimeScale): number => {
  if (!Number.isFinite(logicalIndex)) {
    throw new RangeError('Logical indices must be finite numbers.');
  }

  const distanceFromRight = scale.visibleLogicalRange.to - logicalIndex;
  const coordinate = scale.inverted
    ? distanceFromRight * scale.barSpacing
    : scale.width - distanceFromRight * scale.barSpacing;

  if (!Number.isFinite(coordinate)) {
    throw new RangeError('Logical index resolves to a coordinate outside the supported range.');
  }

  return coordinate;
};

export const coordinateToLogicalIndex = (coordinate: number, scale: TimeScale): number => {
  if (!Number.isFinite(coordinate)) {
    throw new RangeError('Time coordinates must be finite numbers.');
  }

  const distanceFromRight = scale.inverted
    ? coordinate / scale.barSpacing
    : (scale.width - coordinate) / scale.barSpacing;
  const logicalIndex = scale.visibleLogicalRange.to - distanceFromRight;

  if (!Number.isFinite(logicalIndex)) {
    throw new RangeError('Coordinate resolves to a logical index outside the supported range.');
  }

  return logicalIndex;
};

export const panTimeScale = (scale: TimeScale, deltaX: number): TimeScale => {
  if (!Number.isFinite(deltaX)) {
    throw new RangeError('Pan distance must be a finite number.');
  }

  const rightOffset = scale.inverted
    ? scale.rightOffset + deltaX / scale.barSpacing
    : scale.rightOffset - deltaX / scale.barSpacing;

  return createTimeScale(scale.width, scale.rightmostLogicalIndex, {
    barSpacing: scale.barSpacing,
    rightOffset,
    minBarSpacing: scale.minBarSpacing,
    maxBarSpacing: scale.maxBarSpacing,
    inverted: scale.inverted,
  });
};

export const zoomTimeScale = (
  scale: TimeScale,
  zoomFactor: number,
  anchorCoordinate: number,
): TimeScale => {
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0 || !Number.isFinite(anchorCoordinate)) {
    throw new RangeError('Zoom factor and anchor coordinate must be finite, with positive zoom.');
  }

  const barSpacing = clamp(scale.barSpacing * zoomFactor, scale.minBarSpacing, scale.maxBarSpacing);

  if (barSpacing === scale.barSpacing) {
    return scale;
  }

  const anchorLogicalIndex = coordinateToLogicalIndex(anchorCoordinate, scale);
  const distanceFromRight = scale.inverted ? anchorCoordinate : scale.width - anchorCoordinate;
  const rightOffset =
    anchorLogicalIndex - scale.rightmostLogicalIndex - 0.5 + distanceFromRight / barSpacing;

  return createTimeScale(scale.width, scale.rightmostLogicalIndex, {
    barSpacing,
    rightOffset,
    minBarSpacing: scale.minBarSpacing,
    maxBarSpacing: scale.maxBarSpacing,
    inverted: scale.inverted,
  });
};

export const resizeTimeScale = (scale: TimeScale, width: number): TimeScale =>
  createTimeScale(width, scale.rightmostLogicalIndex, {
    barSpacing: scale.barSpacing,
    rightOffset: scale.rightOffset,
    minBarSpacing: scale.minBarSpacing,
    maxBarSpacing: scale.maxBarSpacing,
    inverted: scale.inverted,
  });

export type TimeScaleTick = Readonly<{
  logicalIndex: number;
  coordinate: number;
}>;

const getNiceLogicalStep = (range: LogicalRange, targetTickCount: number): number => {
  const roughStep = (range.to - range.from) / Math.max(1, targetTickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const tolerance = Number.EPSILON * Math.max(1, normalizedStep) * 16;
  const multiplier =
    [1, 2, 2.5, 5, 10].find((candidate) => normalizedStep <= candidate + tolerance) ?? 10;

  return Math.max(1, multiplier * magnitude);
};

export const generateTimeTicks = (
  scale: TimeScale,
  targetTickCount = 6,
): readonly TimeScaleTick[] => {
  if (!Number.isInteger(targetTickCount) || targetTickCount < 2 || targetTickCount > 50) {
    throw new RangeError('Target time tick count must be an integer between 2 and 50.');
  }

  const step = getNiceLogicalStep(scale.visibleLogicalRange, targetTickCount);
  const firstIndex = Math.ceil(scale.visibleLogicalRange.from / step) * step;
  const ticks: TimeScaleTick[] = [];

  for (let logicalIndex = firstIndex; ticks.length < 100; logicalIndex += step) {
    if (logicalIndex > scale.visibleLogicalRange.to + Number.EPSILON * 16) {
      break;
    }

    const coordinate = logicalIndexToCoordinate(logicalIndex, scale);

    if (coordinate >= 0 && coordinate <= scale.width) {
      ticks.push(Object.freeze({ logicalIndex, coordinate }));
    }
  }

  return Object.freeze(ticks);
};
