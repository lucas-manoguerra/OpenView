export class MarketDataProviderError extends Error {
  readonly providerId: string;
  readonly statusCode: number | null;
  readonly retryAfterMs: number | null;

  constructor(
    providerId: string,
    message: string,
    statusCode: number | null = null,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'MarketDataProviderError';
    this.providerId = providerId;
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
  }
}
