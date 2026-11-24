import { describe, expect, it } from 'vitest';
import { createTimeScale } from './src/time-scale';
import {
  createTimeAxisData,
  formatTimeAxisLabel,
  generateTimeAxisTicks,
  selectNonOverlappingTimeAxisTicks,
  type TimeAxisPoint,
  type TimeAxisTick,
} from './src/time-axis';

const MINUTE = 60_000;
const createPoints = (
  count: number,
  startTimestamp = Date.UTC(2024, 0, 1),
): readonly TimeAxisPoint[] =>
  Object.freeze(
    Array.from({ length: count }, (_, logicalIndex) =>
      Object.freeze({
        logicalIndex,
        timestamp: startTimestamp + logicalIndex * MINUTE,
      }),
    ),
  );

describe('timestamp based time axis', () => {
  it('creates a frozen validated time axis snapshot without cloning frozen candle data', () => {
    const points = Object.freeze(createPoints(10));

    expect(createTimeAxisData(points).points).toBe(points);
    const mutablePoints = createPoints(2).map((point) => ({ ...point }));
    const snapshot = createTimeAxisData(mutablePoints);

    expect(snapshot.points).not.toBe(mutablePoints);
    expect(Object.isFrozen(snapshot.points)).toBe(true);
    expect(Object.isFrozen(snapshot.points[0])).toBe(true);
    expect(Object.isFrozen(createTimeAxisData(points))).toBe(true);
  });

  it('formats intraday labels as hours and minutes in the configured timezone', () => {
    const timestamp = Date.UTC(2024, 0, 1, 0, 0);

    expect(
      formatTimeAxisLabel(timestamp, MINUTE, 3 * 60 * MINUTE, {
        locale: 'en-GB',
        timeZone: 'UTC',
      }),
    ).toBe('00:00');
  });

  it('adds the day when intraday ticks span multiple dates', () => {
    const timestamp = Date.UTC(2024, 0, 1, 12, 30);
    const label = formatTimeAxisLabel(timestamp, 30 * MINUTE, 2 * 24 * 60 * MINUTE, {
      locale: 'en-US',
      timeZone: 'UTC',
    });

    expect(label).toContain('Jan');
    expect(label).toContain('01');
    expect(label).toContain('12:30');
  });

  it('formats daily, monthly and yearly intervals at the appropriate date granularity', () => {
    const timestamp = Date.UTC(2024, 0, 15);

    expect(
      formatTimeAxisLabel(timestamp, 24 * 60 * MINUTE, 10 * 24 * 60 * MINUTE, {
        locale: 'en-US',
        timeZone: 'UTC',
      }),
    ).toBe('Jan 15');
    expect(
      formatTimeAxisLabel(timestamp, 30 * 24 * 60 * MINUTE, 300 * 24 * 60 * MINUTE, {
        locale: 'en-US',
        timeZone: 'UTC',
      }),
    ).toBe('Jan 2024');
    expect(
      formatTimeAxisLabel(timestamp, 2 * 365 * 24 * 60 * MINUTE, 10 * 365 * 24 * 60 * MINUTE, {
        locale: 'en-US',
        timeZone: 'UTC',
      }),
    ).toBe('2024');
  });

  it('maps time ticks to actual candle timestamps and logical indices', () => {
    const points = createPoints(120, Date.UTC(2024, 0, 1, 12));
    const scale = createTimeScale(900, 119, { barSpacing: 7.5 });
    const ticks = generateTimeAxisTicks(scale, points, {
      targetTickCount: 8,
      locale: 'en-GB',
      timeZone: 'UTC',
    });

    expect(ticks.length).toBeGreaterThan(2);

    for (const tick of ticks) {
      const point = points[tick.logicalIndex];

      expect(point?.timestamp).toBe(tick.timestamp);
      expect(tick.coordinate).toBeGreaterThanOrEqual(0);
      expect(tick.coordinate).toBeLessThanOrEqual(scale.width);
      expect(tick.label).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('uses shorter time intervals as the chart zooms in', () => {
    const points = createPoints(240);
    const zoomedOut = createTimeScale(600, 239, { barSpacing: 2 });
    const zoomedIn = createTimeScale(600, 239, { barSpacing: 16 });
    const wideTicks = generateTimeAxisTicks(zoomedOut, points, { targetTickCount: 6 });
    const closeTicks = generateTimeAxisTicks(zoomedIn, points, { targetTickCount: 6 });

    expect(wideTicks.length).toBeGreaterThan(1);
    expect(closeTicks.length).toBeGreaterThan(1);
    expect(closeTicks[1]!.timestamp - closeTicks[0]!.timestamp).toBeLessThan(
      wideTicks[1]!.timestamp - wideTicks[0]!.timestamp,
    );
  });

  it('skips calendar grid points that cannot be mapped near an available candle', () => {
    const points: readonly TimeAxisPoint[] = [
      { logicalIndex: 0, timestamp: Date.UTC(2024, 0, 1) },
      { logicalIndex: 1, timestamp: Date.UTC(2024, 0, 1, 0, 1) },
      { logicalIndex: 2, timestamp: Date.UTC(2024, 0, 1, 0, 2) },
      { logicalIndex: 3, timestamp: Date.UTC(2024, 0, 1, 12) },
      { logicalIndex: 4, timestamp: Date.UTC(2024, 0, 1, 12, 1) },
    ];
    const scale = createTimeScale(500, 4, { barSpacing: 100, maxBarSpacing: 100 });
    const ticks = generateTimeAxisTicks(scale, points, { targetTickCount: 4 });

    expect(ticks.length).toBe(2);
    expect(ticks.every((tick) => points[tick.logicalIndex]?.timestamp === tick.timestamp)).toBe(
      true,
    );
    expect(new Set(ticks.map((tick) => tick.logicalIndex)).size).toBe(ticks.length);
  });

  it('filters overlapping labels and labels clipped by axis boundaries', () => {
    const ticks: readonly TimeAxisTick[] = [
      { logicalIndex: 0, timestamp: 0, coordinate: 10, label: 'first' },
      { logicalIndex: 1, timestamp: 1, coordinate: 70, label: 'middle' },
      { logicalIndex: 2, timestamp: 2, coordinate: 110, label: 'overlap' },
      { logicalIndex: 3, timestamp: 3, coordinate: 170, label: 'last' },
    ];
    const selected = selectNonOverlappingTimeAxisTicks(ticks, (label) => label.length * 6, 200, 8);

    expect(selected.map((tick) => tick.label)).toEqual(['middle', 'last']);
  });

  it('rejects invalid tick density, timestamp ordering and invalid date values', () => {
    const scale = createTimeScale(600, 9);
    const points = createPoints(10);

    expect(() => generateTimeAxisTicks(scale, points, { targetTickCount: 1 })).toThrow(RangeError);
    expect(() =>
      generateTimeAxisTicks(scale, [
        points[0]!,
        { logicalIndex: 1, timestamp: points[0]!.timestamp },
      ]),
    ).toThrow(RangeError);
    expect(() => formatTimeAxisLabel(Number.NaN, MINUTE, MINUTE)).toThrow(RangeError);
    expect(() => formatTimeAxisLabel(Date.UTC(2024, 0, 1), 0, MINUTE)).toThrow(RangeError);
  });
});
