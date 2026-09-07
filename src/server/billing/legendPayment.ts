export const DEFAULT_LEGEND_PRICE_SATS = 100_000;
export const LEGEND_INVOICE_EXPIRY_SEC = 300;

export function getLegendPriceSats(): number {
  const raw = process.env.LEGEND_PRICE?.trim();
  if (!raw) return DEFAULT_LEGEND_PRICE_SATS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    console.warn('[billing] Invalid LEGEND_PRICE, using default', raw);
    return DEFAULT_LEGEND_PRICE_SATS;
  }
  return n;
}
