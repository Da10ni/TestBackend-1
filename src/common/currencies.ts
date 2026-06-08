/**
 * Allow-list of supported currencies. Validating against a fixed set (rather
 * than accepting arbitrary strings) prevents balance fragmentation and junk
 * data, and makes currency handling predictable across deposits/withdrawals.
 */
export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'BTC',
  'ETH',
  'USDC',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
