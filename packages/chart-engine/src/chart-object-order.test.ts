import { describe, expect, it } from 'vitest';
import {
  type ChartObjectOrderItem,
  createChartObjectOrder,
  moveChartObjectInOrder,
  reconcileChartObjectOrder,
} from './chart-object-order';

const objects = [
  { kind: 'price-series', id: 'candles' },
  { kind: 'volume', id: 'volume' },
  { kind: 'indicator', id: 'sma-20' },
  { kind: 'drawing', id: 'trend-1' },
  { kind: 'drawing', id: 'fib-1' },
] as const satisfies readonly ChartObjectOrderItem[];

const ids = (order: readonly ChartObjectOrderItem[]) =>
  order.map((object) => `${object.kind}:${object.id}`);

describe('chart object order', () => {
  it('preserves the supplied initial stacking order', () => {
    expect(ids(createChartObjectOrder(objects))).toEqual([
      'price-series:candles',
      'volume:volume',
      'indicator:sma-20',
      'drawing:trend-1',
      'drawing:fib-1',
    ]);
  });

  it('moves an object one position forward or backward across object kinds', () => {
    const order = createChartObjectOrder(objects);

    expect(ids(moveChartObjectInOrder(order, objects[3], 'forward'))).toEqual([
      'price-series:candles',
      'volume:volume',
      'indicator:sma-20',
      'drawing:fib-1',
      'drawing:trend-1',
    ]);
    expect(ids(moveChartObjectInOrder(order, objects[3], 'backward'))).toEqual([
      'price-series:candles',
      'volume:volume',
      'drawing:trend-1',
      'indicator:sma-20',
      'drawing:fib-1',
    ]);
  });

  it('moves an object to the front or back of the complete stack', () => {
    const order = createChartObjectOrder(objects);

    expect(ids(moveChartObjectInOrder(order, objects[0], 'front')).at(-1)).toBe(
      'price-series:candles',
    );
    expect(ids(moveChartObjectInOrder(order, objects[4], 'back'))[0]).toBe('drawing:fib-1');
  });

  it('keeps the current order and appends newly available objects', () => {
    const current = createChartObjectOrder([objects[0], objects[3]]);
    const next = reconcileChartObjectOrder(current, objects);

    expect(ids(next)).toEqual([
      'price-series:candles',
      'drawing:trend-1',
      'volume:volume',
      'indicator:sma-20',
      'drawing:fib-1',
    ]);
  });

  it('removes deleted objects without disturbing the remaining order', () => {
    const current = createChartObjectOrder(objects);
    const next = reconcileChartObjectOrder(current, [objects[0], objects[2], objects[4]]);

    expect(ids(next)).toEqual(['price-series:candles', 'indicator:sma-20', 'drawing:fib-1']);
  });

  it('rejects duplicate object identities', () => {
    expect(() => createChartObjectOrder([objects[3], { kind: 'drawing', id: 'trend-1' }])).toThrow(
      'Chart object order items must be unique.',
    );
  });

  it('leaves the order unchanged when the target is not present', () => {
    const order = createChartObjectOrder(objects);
    expect(moveChartObjectInOrder(order, { kind: 'drawing', id: 'missing' }, 'front')).toEqual(
      order,
    );
  });
});
