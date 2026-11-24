import { describe, expect, it, vi } from 'vitest';
import { MarketDataRequestScheduler } from './src/request-scheduler';

describe('market data request scheduler', () => {
  it('serializes concurrent requests through one provider instance', async () => {
    const scheduler = new MarketDataRequestScheduler({
      minimumIntervalMs: 0,
    });
    const events: string[] = [];

    await Promise.all([
      scheduler.run(async () => {
        events.push('first-start');
        await Promise.resolve();
        events.push('first-end');
      }),
      scheduler.run(async () => {
        events.push('second-start');
        events.push('second-end');
      }),
    ]);

    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('waits between calls when a minimum request interval is configured', async () => {
    const waiter = vi.fn(async () => undefined);
    const scheduler = new MarketDataRequestScheduler({
      minimumIntervalMs: 100,
      waiter,
    });

    await scheduler.run(async () => 'first');
    await scheduler.run(async () => 'second');

    expect(waiter).toHaveBeenCalledTimes(1);
    expect(waiter.mock.calls[0]?.[0]).toBeGreaterThan(0);
    expect(waiter.mock.calls[0]?.[0]).toBeLessThanOrEqual(100);
  });

  it('rejects queued operations when their abort signal is already aborted', async () => {
    const scheduler = new MarketDataRequestScheduler({
      minimumIntervalMs: 0,
    });
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const operation = vi.fn(async () => 'unreachable');

    await expect(scheduler.run(operation, controller.signal)).rejects.toThrow('cancelled');
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects invalid minimum request intervals', () => {
    expect(() => new MarketDataRequestScheduler({ minimumIntervalMs: -1 })).toThrow(RangeError);
    expect(() => new MarketDataRequestScheduler({ minimumIntervalMs: Number.NaN })).toThrow(
      RangeError,
    );
  });
});
