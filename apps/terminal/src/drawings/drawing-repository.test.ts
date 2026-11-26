import { describe, expect, it } from 'vitest';
import {
  type DrawingRepositoryScope,
  DrawingRevisionConflictError,
  LocalStorageDrawingRepository,
} from './drawing-repository';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const accountScope: DrawingRepositoryScope = {
  owner: { kind: 'account', id: 'user-1' },
  instrumentId: 'binance-spot:BTC-USDT',
  timeframe: '1h',
};

const drawing = {
  drawingId: 'drawing-uuid-1',
  payload: {
    type: 'trend-line' as const,
    start: { timestamp: 10, price: 100 },
    end: { timestamp: 20, price: 120 },
    color: '#60a5fa',
    lineWidth: 1.5,
    lineStyle: 'solid' as const,
    locked: false,
    visible: true,
  },
  zOrder: 2,
};

describe('local drawing repository', () => {
  it('stores confirmed drawing documents with timestamps and revisions', async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageDrawingRepository(
      storage,
      () => new Date('2026-11-26T12:00:00.000Z'),
    );

    const saved = await repository.save(accountScope, drawing, null);

    expect(saved).toMatchObject({
      drawingId: drawing.drawingId,
      payload: drawing.payload,
      zOrder: 2,
      createdAt: '2026-11-26T12:00:00.000Z',
      updatedAt: '2026-11-26T12:00:00.000Z',
      revision: 1,
      timeframeScope: accountScope.timeframe,
    });
    expect(await repository.list(accountScope)).toEqual([saved]);
  });

  it('keeps all-timeframe drawings visible alongside timeframe-specific drawings', async () => {
    const repository = new LocalStorageDrawingRepository(new MemoryStorage());
    const globalScope = { ...accountScope, timeframe: null };

    await repository.save(globalScope, { ...drawing, drawingId: 'global' }, null);
    await repository.save(accountScope, { ...drawing, drawingId: 'hourly' }, null);
    await repository.save(
      { ...accountScope, timeframe: '4h' },
      { ...drawing, drawingId: 'four-hour' },
      null,
    );

    expect(
      (await repository.list(accountScope)).map((item) => [item.drawingId, item.timeframeScope]),
    ).toEqual([
      ['global', null],
      ['hourly', '1h'],
    ]);
    expect(
      (await repository.list({ ...accountScope, timeframe: '4h' })).map((item) => [
        item.drawingId,
        item.timeframeScope,
      ]),
    ).toEqual([
      ['global', null],
      ['four-hour', '4h'],
    ]);
  });

  it('isolates owners and instruments', async () => {
    const repository = new LocalStorageDrawingRepository(new MemoryStorage());
    await repository.save(accountScope, drawing, null);

    expect(
      await repository.list({
        ...accountScope,
        owner: { kind: 'account', id: 'user-2' },
      }),
    ).toEqual([]);
    expect(await repository.list({ ...accountScope, instrumentId: 'okx-spot:BTC-USDT' })).toEqual(
      [],
    );
  });

  it('uses optimistic revisions to reject stale updates and deletes', async () => {
    const repository = new LocalStorageDrawingRepository(new MemoryStorage());
    const first = await repository.save(accountScope, drawing, null);
    const second = await repository.save(accountScope, drawing, first.revision);

    expect(second.revision).toBe(2);
    await expect(repository.save(accountScope, drawing, first.revision)).rejects.toBeInstanceOf(
      DrawingRevisionConflictError,
    );
    await expect(
      repository.delete(accountScope, drawing.drawingId, first.revision),
    ).rejects.toBeInstanceOf(DrawingRevisionConflictError);
    await repository.delete(accountScope, drawing.drawingId, second.revision);
    expect(await repository.list(accountScope)).toEqual([]);
  });

  it('rejects invalid payloads and invalid z-order values', async () => {
    const repository = new LocalStorageDrawingRepository(new MemoryStorage());

    await expect(repository.save(accountScope, { ...drawing, zOrder: -1 }, null)).rejects.toThrow(
      'z-order',
    );
    await expect(
      repository.save(
        accountScope,
        { ...drawing, payload: { ...drawing.payload, start: { timestamp: NaN, price: 1 } } },
        null,
      ),
    ).rejects.toThrow('payload');
  });

  it('ignores corrupt or unsupported local collections without throwing', async () => {
    const storage = new MemoryStorage();
    const repository = new LocalStorageDrawingRepository(storage);
    storage.setItem('openview.terminal.drawings:account%3Auser-1:binance-spot%3ABTC-USDT', '{');

    expect(await repository.list(accountScope)).toEqual([]);
  });

  it('keeps anonymous local drawings partitioned from authenticated accounts', async () => {
    const repository = new LocalStorageDrawingRepository(new MemoryStorage());
    const anonymousScope = {
      ...accountScope,
      owner: { kind: 'anonymous' as const, id: 'browser-install-1' },
    };

    await repository.save(anonymousScope, drawing, null);

    expect(await repository.list(accountScope)).toEqual([]);
    expect(await repository.list(anonymousScope)).toHaveLength(1);
  });
});
