export type Result<TValue, TError> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; error: TError }>;

export const success = <TValue>(value: TValue): Result<TValue, never> => ({
  ok: true,
  value,
});

export const failure = <TError>(error: TError): Result<never, TError> => ({
  ok: false,
  error,
});
