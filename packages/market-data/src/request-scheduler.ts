export type RequestWaiter = (durationMs: number) => Promise<void>;

export type RequestSchedulerOptions = Readonly<{
  minimumIntervalMs: number;
  waiter?: RequestWaiter;
}>;

const defaultWaiter: RequestWaiter = (durationMs) =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

export class MarketDataRequestScheduler {
  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private readonly minimumIntervalMs: number;
  private readonly waiter: RequestWaiter;

  constructor(options: RequestSchedulerOptions) {
    if (!Number.isFinite(options.minimumIntervalMs) || options.minimumIntervalMs < 0) {
      throw new RangeError('Market data request intervals must be finite and non-negative.');
    }

    this.minimumIntervalMs = options.minimumIntervalMs;
    this.waiter = options.waiter ?? defaultWaiter;
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const previousRequest = this.queue;
    let releaseRequest: (() => void) | null = null;

    this.queue = new Promise((resolve) => {
      releaseRequest = resolve;
    });

    await previousRequest;

    try {
      signal?.throwIfAborted();

      const elapsed = this.lastRequestAt === 0 ? this.minimumIntervalMs : Date.now() - this.lastRequestAt;
      const waitDuration = Math.max(0, this.minimumIntervalMs - elapsed);

      if (waitDuration > 0) {
        await this.waiter(waitDuration);
      }

      signal?.throwIfAborted();
      this.lastRequestAt = Date.now();

      return await operation();
    } finally {
      releaseRequest?.();
    }
  }
}
