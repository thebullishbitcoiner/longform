export const DEFAULT_PRO_MONTHLY_SATS = 1_000;
export const DEFAULT_PRO_YEARLY_SATS = 10_000;
export const PRO_TERM_DAYS_MONTHLY = 30;
export const PRO_TERM_DAYS_YEARLY = 365;
export const PRO_INVOICE_EXPIRY_SEC = 300;

export function getProMonthlyPriceSats(): number {
  const raw = process.env.PRO_PRICE?.trim();
  if (!raw) return DEFAULT_PRO_MONTHLY_SATS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_PRO_MONTHLY_SATS;
}

export function getProYearlyPriceSats(): number {
  const raw = process.env.PRO_PRICE_YEARLY?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return DEFAULT_PRO_YEARLY_SATS;
}

export function expectedSatsForTerm(termDays: number): number {
  return termDays >= PRO_TERM_DAYS_YEARLY ? getProYearlyPriceSats() : getProMonthlyPriceSats();
}
