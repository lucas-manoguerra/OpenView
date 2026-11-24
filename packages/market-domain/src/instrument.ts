export type AssetClass = 'equity' | 'future' | 'forex' | 'crypto' | 'index' | 'commodity' | 'bond';

export type InstrumentId = string & Readonly<{ __brand: 'InstrumentId' }>;

export type Instrument = Readonly<{
  id: InstrumentId;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quoteCurrency: string;
}>;

export const createInstrumentId = (value: string): InstrumentId => {
  const normalizedValue = value.trim().toUpperCase();

  if (normalizedValue.length === 0) {
    throw new RangeError('Instrument identifiers cannot be empty.');
  }

  return normalizedValue as InstrumentId;
};
