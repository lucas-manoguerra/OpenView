import { logicalIndexToCoordinate, type TimeScale } from './time-scale';

export type TimeAxisPoint = Readonly<{
  logicalIndex: number;
  timestamp: number;
}>;

export type TimeAxisOptions = Readonly<{
  targetTickCount?: number;
  locale?: string;
  timeZone?: string;
}>;

export type TimeAxisTick = Readonly<{
  logicalIndex: number;
  timestamp: number;
  coordinate: number;
  label: string;
}>;

export type TimeAxisData = Readonly<{
  points: readonly TimeAxisPoint[];
  validated: true;
}>;

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

const NICE_TIME_STEPS = [
  SECOND,
  5 * SECOND,
  15 * SECOND,
  30 * SECOND,
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  4 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  3 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
  90 * DAY,
  180 * DAY,
  YEAR,
  2 * YEAR,
  5 * YEAR,
  10 * YEAR,
] as const;

const getNiceTimeStep = (timestampSpan: number, targetTickCount: number): number => {
  const roughStep = timestampSpan / Math.max(1, targetTickCount - 1);
  const step =
    NICE_TIME_STEPS.find((candidate) => candidate >= roughStep) ??
    10 ** Math.ceil(Math.log10(roughStep));

  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError('The requested time interval is outside the supported numeric range.');
  }

  return step;
};

const validateTimeAxisPoints = (points: readonly TimeAxisPoint[]): void => {
  let previousLogicalIndex = Number.NEGATIVE_INFINITY;
  let previousTimestamp = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (
      !Number.isFinite(point.logicalIndex) ||
      !Number.isFinite(point.timestamp) ||
      point.logicalIndex <= previousLogicalIndex ||
      point.timestamp <= previousTimestamp ||
      !Number.isFinite(new Date(point.timestamp).getTime())
    ) {
      throw new RangeError(
        'Time axis points must have ascending logical indices and Unix millisecond timestamps.',
      );
    }

    previousLogicalIndex = point.logicalIndex;
    previousTimestamp = point.timestamp;
  }
};

export const createTimeAxisData = (points: readonly TimeAxisPoint[]): TimeAxisData => {
  validateTimeAxisPoints(points);

  const stablePoints =
    Object.isFrozen(points) && points.every((point) => Object.isFrozen(point))
      ? points
      : Object.freeze(
          points.map((point) =>
            Object.freeze({ logicalIndex: point.logicalIndex, timestamp: point.timestamp }),
          ),
        );

  return Object.freeze({ points: stablePoints, validated: true as const });
};

export const formatTimeAxisLabel = (
  timestamp: number,
  interval: number,
  visibleSpan: number,
  options: Pick<TimeAxisOptions, 'locale' | 'timeZone'> = {},
): string => {
  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(interval) ||
    interval <= 0 ||
    !Number.isFinite(visibleSpan) ||
    visibleSpan < 0
  ) {
    throw new RangeError('Time axis labels require a finite timestamp and positive interval.');
  }

  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('Time axis timestamp is outside the supported date range.');
  }

  const locale = options.locale ?? 'en-US';
  const timeZone = options.timeZone;
  const includeSeconds = interval < MINUTE;
  const timeFields: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  };
  const formatOptions: Intl.DateTimeFormatOptions =
    interval < DAY
      ? visibleSpan >= DAY
        ? { day: '2-digit', month: 'short', ...timeFields }
        : timeFields
      : interval < 30 * DAY
        ? { day: '2-digit', month: 'short' }
        : interval < YEAR
          ? { month: 'short', year: 'numeric' }
          : { year: 'numeric' };

  return new Intl.DateTimeFormat(locale, {
    ...formatOptions,
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(date);
};

const findClosestPoint = (
  points: readonly TimeAxisPoint[],
  timestamp: number,
  start: number,
  end: number,
): TimeAxisPoint | null => {
  let low = start;
  let high = end;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (points[middle]!.timestamp < timestamp) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const after = low < end ? points[low]! : null;
  const before = low > start ? points[low - 1]! : null;

  if (before === null) {
    return after;
  }

  if (after === null) {
    return before;
  }

  return timestamp - before.timestamp <= after.timestamp - timestamp ? before : after;
};

export const generateTimeAxisTicks = (
  scale: TimeScale,
  data: readonly TimeAxisPoint[] | TimeAxisData,
  options: TimeAxisOptions = {},
): readonly TimeAxisTick[] => {
  const targetTickCount = options.targetTickCount ?? 8;

  if (!Number.isInteger(targetTickCount) || targetTickCount < 2 || targetTickCount > 50) {
    throw new RangeError('Target time axis tick count must be an integer between 2 and 50.');
  }

  const isValidatedData = !Array.isArray(data);
  const points = isValidatedData
    ? (data as TimeAxisData).points
    : (data as readonly TimeAxisPoint[]);

  if (!isValidatedData) {
    validateTimeAxisPoints(points);
  }

  if (points.length === 0) {
    return Object.freeze([]);
  }

  const visibleRange = scale.visibleLogicalRange;
  let start = 0;
  let end = points.length;

  while (start < end) {
    const middle = Math.floor((start + end) / 2);

    if (points[middle]!.logicalIndex < visibleRange.from) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }

  const firstVisibleIndex = start;
  end = points.length;

  while (start < end) {
    const middle = Math.floor((start + end) / 2);

    if (points[middle]!.logicalIndex <= visibleRange.to) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }

  const lastVisibleIndex = start;

  if (firstVisibleIndex >= lastVisibleIndex) {
    return Object.freeze([]);
  }

  const firstTimestamp = points[firstVisibleIndex]!.timestamp;
  const lastTimestamp = points[lastVisibleIndex - 1]!.timestamp;
  const visibleSpan = lastTimestamp - firstTimestamp;

  if (visibleSpan === 0) {
    const point = points[firstVisibleIndex]!;

    return Object.freeze([
      Object.freeze({
        logicalIndex: point.logicalIndex,
        timestamp: point.timestamp,
        coordinate: logicalIndexToCoordinate(point.logicalIndex, scale),
        label: formatTimeAxisLabel(point.timestamp, MINUTE, visibleSpan, options),
      }),
    ]);
  }

  const interval = getNiceTimeStep(visibleSpan, targetTickCount);
  const firstGridTimestamp = Math.ceil(firstTimestamp / interval) * interval;
  const ticks: TimeAxisTick[] = [];
  const maximumSnapDistance = interval * 0.75;
  let previousLogicalIndex = Number.NEGATIVE_INFINITY;

  for (
    let timestamp = firstGridTimestamp;
    timestamp <= lastTimestamp + interval * 0.25 && ticks.length < 100;
    timestamp += interval
  ) {
    const point = findClosestPoint(points, timestamp, firstVisibleIndex, lastVisibleIndex);

    if (
      point === null ||
      Math.abs(point.timestamp - timestamp) > maximumSnapDistance ||
      point.logicalIndex === previousLogicalIndex
    ) {
      continue;
    }

    const coordinate = logicalIndexToCoordinate(point.logicalIndex, scale);

    if (coordinate >= 0 && coordinate <= scale.width) {
      ticks.push(
        Object.freeze({
          logicalIndex: point.logicalIndex,
          timestamp: point.timestamp,
          coordinate,
          label: formatTimeAxisLabel(point.timestamp, interval, visibleSpan, options),
        }),
      );
      previousLogicalIndex = point.logicalIndex;
    }
  }

  if (ticks.length === 0) {
    const point = points[Math.min(firstVisibleIndex, lastVisibleIndex - 1)]!;
    const coordinate = logicalIndexToCoordinate(point.logicalIndex, scale);

    ticks.push(
      Object.freeze({
        logicalIndex: point.logicalIndex,
        timestamp: point.timestamp,
        coordinate,
        label: formatTimeAxisLabel(point.timestamp, interval, visibleSpan, options),
      }),
    );
  }

  return Object.freeze(ticks);
};

export const selectNonOverlappingTimeAxisTicks = (
  ticks: readonly TimeAxisTick[],
  measureLabel: (label: string) => number,
  axisWidth: number,
  minimumGap = 12,
): readonly TimeAxisTick[] => {
  if (
    !Number.isFinite(axisWidth) ||
    axisWidth < 0 ||
    !Number.isFinite(minimumGap) ||
    minimumGap < 0
  ) {
    throw new RangeError('Time axis width and label gap must be finite and non-negative.');
  }

  const orderedTicks = [...ticks].sort((left, right) => left.coordinate - right.coordinate);
  const selected: TimeAxisTick[] = [];
  let previousRight = Number.NEGATIVE_INFINITY;

  for (const tick of orderedTicks) {
    const labelWidth = measureLabel(tick.label);

    if (!Number.isFinite(labelWidth) || labelWidth < 0) {
      throw new RangeError('Measured time axis label widths must be finite and non-negative.');
    }

    const left = tick.coordinate - labelWidth / 2;
    const right = tick.coordinate + labelWidth / 2;

    if (left < 4 || right > axisWidth - 4 || left < previousRight + minimumGap) {
      continue;
    }

    selected.push(tick);
    previousRight = right;
  }

  return Object.freeze(selected);
};
