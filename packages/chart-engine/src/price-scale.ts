import type { NumericRange } from './viewport';

export type PriceScaleMode = 'linear' | 'logarithmic' | 'percentage' | 'indexed-to-100';

export type PriceScaleOptions = Readonly<{
  mode?: PriceScaleMode;
  baseValue?: number;
  inverted?: boolean;
}>;

export type PriceScale = Readonly<{
  range: NumericRange;
  height: number;
  mode: PriceScaleMode;
  baseValue: number | null;
  inverted: boolean;
}>;

export type PriceScaleTick = Readonly<{
  price: number;
  value: number;
  coordinate: number;
  label: string;
}>;

const relativeModes = new Set<PriceScaleMode>(['percentage', 'indexed-to-100']);

const getBaseValue = (scale: PriceScale): number => {
  if (scale.baseValue === null) {
    throw new RangeError('Relative price scales require a base value.');
  }

  return scale.baseValue;
};

const toScaleValue = (price: number, scale: PriceScale): number => {
  if (!Number.isFinite(price)) {
    throw new RangeError('Price values must be finite numbers.');
  }

  let value: number;

  if (scale.mode === 'logarithmic') {
    if (price <= 0) {
      throw new RangeError('Logarithmic price scales require positive prices.');
    }

    value = Math.log(price);
  } else if (scale.mode === 'percentage') {
    const baseValue = getBaseValue(scale);
    value = ((price - baseValue) / baseValue) * 100;
  } else if (scale.mode === 'indexed-to-100') {
    value = (price / getBaseValue(scale)) * 100;
  } else {
    value = price;
  }

  if (!Number.isFinite(value)) {
    throw new RangeError('Price cannot be represented in the selected scale mode.');
  }

  return value;
};

const fromScaleValue = (value: number, scale: PriceScale): number => {
  const baseValue = scale.baseValue;

  if (scale.mode === 'logarithmic') {
    return Math.exp(value);
  }

  if (scale.mode === 'percentage') {
    if (baseValue === null) {
      throw new RangeError('Relative price scales require a base value.');
    }

    return baseValue * (1 + value / 100);
  }

  if (scale.mode === 'indexed-to-100') {
    if (baseValue === null) {
      throw new RangeError('Relative price scales require a base value.');
    }

    return (baseValue * value) / 100;
  }

  return value;
};

const getTransformedRange = (scale: PriceScale): NumericRange => ({
  min: toScaleValue(scale.range.min, scale),
  max: toScaleValue(scale.range.max, scale),
});

const normalizeZero = (value: number): number => (Object.is(value, -0) ? 0 : value);

const getNiceStep = (range: NumericRange, targetTickCount: number): number => {
  const roughStep = (range.max - range.min) / Math.max(1, targetTickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const comparisonTolerance = Number.EPSILON * Math.max(1, normalizedStep) * 16;
  const multiplier =
    [1, 2, 2.5, 5, 10].find((candidate) => normalizedStep <= candidate + comparisonTolerance) ?? 10;
  const step = multiplier * magnitude;

  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError('The requested tick interval is outside the supported numeric range.');
  }

  return step;
};

const getDecimalPlaces = (step: number): number => {
  for (let precision = 0; precision <= 12; precision += 1) {
    const factor = 10 ** precision;
    const scaledStep = step * factor;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaledStep)) * 8;

    if (Number.isFinite(scaledStep) && Math.abs(scaledStep - Math.round(scaledStep)) <= tolerance) {
      return precision;
    }
  }

  return 12;
};

const formatNumber = (value: number, precision: number): string => {
  const normalizedValue = normalizeZero(value);

  if (Math.abs(normalizedValue) >= 1e21) {
    return normalizedValue.toExponential(precision);
  }

  return normalizedValue.toFixed(precision);
};

const generateLinearValues = (
  range: NumericRange,
  targetTickCount: number,
): Readonly<{ values: readonly number[]; step: number }> => {
  const step = getNiceStep(range, targetTickCount);
  const tolerance =
    Number.EPSILON * Math.max(Math.abs(range.min), Math.abs(range.max), Math.abs(step)) * 16;
  const firstIndex = Math.ceil(range.min / step - Number.EPSILON * 8);
  const values: number[] = [];

  for (let index = firstIndex; values.length < 100; index += 1) {
    const value = normalizeZero(Number((index * step).toPrecision(14)));

    if (value > range.max + tolerance) {
      break;
    }

    if (value >= range.min - tolerance) {
      values.push(value);
    }
  }

  return { values, step };
};

const generateLogarithmicValues = (
  range: NumericRange,
  targetTickCount: number,
): Readonly<{ values: readonly number[]; step: number }> => {
  const minimumExponent = Math.floor(Math.log10(range.min));
  const maximumExponent = Math.ceil(Math.log10(range.max));
  const exponentSpan = Math.max(1, maximumExponent - minimumExponent);
  const exponentStep = Math.max(1, Math.ceil((exponentSpan + 1) / targetTickCount));
  const multipliers = exponentSpan * 3 <= targetTickCount * 2 ? [1, 2, 5] : [1];
  const tolerance =
    Number.EPSILON * Math.max(Math.abs(range.min), Math.abs(range.max), Number.MIN_VALUE) * 16;
  const values: number[] = [];

  for (let exponent = minimumExponent; exponent <= maximumExponent; exponent += exponentStep) {
    const magnitude = 10 ** exponent;

    for (const multiplier of multipliers) {
      const value = normalizeZero(multiplier * magnitude);

      if (value >= range.min - tolerance && value <= range.max + tolerance) {
        values.push(value);
      }
    }
  }

  const uniqueValues = [...new Set(values)].sort((left, right) => left - right);

  if (uniqueValues.length > 1) {
    let step = Number.POSITIVE_INFINITY;

    for (let index = 1; index < uniqueValues.length; index += 1) {
      const previousValue = uniqueValues[index - 1];
      const currentValue = uniqueValues[index];

      if (previousValue !== undefined && currentValue !== undefined) {
        step = Math.min(step, currentValue - previousValue);
      }
    }

    return { values: uniqueValues, step };
  }

  return generateLinearValues(range, targetTickCount);
};

export const createPriceScale = (
  range: NumericRange,
  height: number,
  options: PriceScaleOptions = {},
): PriceScale => {
  if (![range.min, range.max, height].every(Number.isFinite)) {
    throw new RangeError('Price range and scale height must be finite numbers.');
  }

  if (range.max <= range.min || !Number.isFinite(range.max - range.min) || height <= 0) {
    throw new RangeError('Price ranges must have a finite positive span and height.');
  }

  const mode = options.mode ?? 'linear';
  const supportedModes: readonly PriceScaleMode[] = [
    'linear',
    'logarithmic',
    'percentage',
    'indexed-to-100',
  ];

  if (!supportedModes.includes(mode)) {
    throw new RangeError('The selected price scale mode is not supported.');
  }

  const baseValue = options.baseValue === undefined ? null : options.baseValue;

  if (relativeModes.has(mode)) {
    if (baseValue === null || !Number.isFinite(baseValue) || baseValue <= 0) {
      throw new RangeError('Percentage and indexed scales require a positive finite base value.');
    }
  } else if (baseValue !== null) {
    throw new RangeError('A base value is only valid for relative price scale modes.');
  }

  if (mode === 'logarithmic' && range.min <= 0) {
    throw new RangeError('Logarithmic price scales require a positive price range.');
  }

  const scale: PriceScale = Object.freeze({
    range: Object.freeze({ min: range.min, max: range.max }),
    height,
    mode,
    baseValue,
    inverted: options.inverted ?? false,
  });
  const transformedRange = getTransformedRange(scale);

  if (
    !Number.isFinite(transformedRange.min) ||
    !Number.isFinite(transformedRange.max) ||
    !Number.isFinite(transformedRange.max - transformedRange.min) ||
    transformedRange.max <= transformedRange.min
  ) {
    throw new RangeError('The transformed price range must have a finite positive span.');
  }

  return scale;
};

export const priceToCoordinate = (price: number, scale: PriceScale): number => {
  const transformedRange = getTransformedRange(scale);
  const transformedPrice = toScaleValue(price, scale);
  const normalizedValue =
    (transformedPrice - transformedRange.min) / (transformedRange.max - transformedRange.min);
  const verticalValue = scale.inverted ? normalizedValue : 1 - normalizedValue;
  const coordinate = verticalValue * scale.height;

  if (!Number.isFinite(coordinate)) {
    throw new RangeError('Price resolves to a coordinate outside the supported numeric range.');
  }

  return coordinate;
};

export const coordinateToPrice = (coordinate: number, scale: PriceScale): number => {
  if (!Number.isFinite(coordinate)) {
    throw new RangeError('Price coordinates must be finite numbers.');
  }

  const transformedRange = getTransformedRange(scale);
  const verticalValue = coordinate / scale.height;
  const normalizedValue = scale.inverted ? verticalValue : 1 - verticalValue;
  const transformedValue =
    transformedRange.min + normalizedValue * (transformedRange.max - transformedRange.min);
  const price = fromScaleValue(transformedValue, scale);

  if (!Number.isFinite(price)) {
    throw new RangeError('The coordinate resolves to a price outside the supported numeric range.');
  }

  return normalizeZero(price);
};

export const generatePriceTicks = (
  scale: PriceScale,
  targetTickCount = 6,
): readonly PriceScaleTick[] => {
  if (!Number.isInteger(targetTickCount) || targetTickCount < 2 || targetTickCount > 50) {
    throw new RangeError('Target tick count must be an integer between 2 and 50.');
  }

  const transformedRange = getTransformedRange(scale);
  const generated =
    scale.mode === 'logarithmic'
      ? generateLogarithmicValues(scale.range, targetTickCount)
      : generateLinearValues(transformedRange, targetTickCount);
  const precision = getDecimalPlaces(generated.step);

  return Object.freeze(
    generated.values.map((generatedValue) => {
      const price =
        scale.mode === 'logarithmic' ? generatedValue : fromScaleValue(generatedValue, scale);
      const value = scale.mode === 'logarithmic' ? price : generatedValue;
      const numberLabel = formatNumber(value, precision);
      const label =
        scale.mode === 'percentage' ? `${value > 0 ? '+' : ''}${numberLabel}%` : numberLabel;

      return Object.freeze({
        price,
        value,
        coordinate: priceToCoordinate(price, scale),
        label,
      });
    }),
  );
};
