import { invalidatePlatformMeCache } from '@/utils/platformMeStatus';
import type { CheckoutStatus } from '@/utils/invoiceCheckout';

export const PRO_TERM_DAYS_MONTHLY = 30;
export const PRO_TERM_DAYS_YEARLY = 365;

export async function fetchLegendPriceSats(): Promise<number> {
  try {
    const r = await fetch('/api/billing/legend/config', { cache: 'no-store' });
    if (!r.ok) return 100_000;
    const data = (await r.json()) as { priceSats?: number };
    return typeof data.priceSats === 'number' && data.priceSats >= 1 ? data.priceSats : 100_000;
  } catch {
    return 100_000;
  }
}

export async function fetchProPrices(): Promise<{ monthly: number; yearly: number }> {
  try {
    const r = await fetch('/api/billing/pro/config', { cache: 'no-store' });
    if (!r.ok) return { monthly: 1_000, yearly: 10_000 };
    const data = (await r.json()) as { monthlyPriceSats?: number; yearlyPriceSats?: number };
    return {
      monthly:
        typeof data.monthlyPriceSats === 'number' && data.monthlyPriceSats >= 1
          ? data.monthlyPriceSats
          : 1_000,
      yearly:
        typeof data.yearlyPriceSats === 'number' && data.yearlyPriceSats >= 1
          ? data.yearlyPriceSats
          : 10_000,
    };
  } catch {
    return { monthly: 1_000, yearly: 10_000 };
  }
}

type CheckoutInvoice = { paymentRequest: string; expiresAt: number };

async function startCheckout(url: string, body: Record<string, unknown>): Promise<CheckoutInvoice> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to create invoice (${r.status})`);
  }
  return (await r.json()) as CheckoutInvoice;
}

async function checkComplete(url: string, body: Record<string, unknown>): Promise<CheckoutStatus> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await r.json().catch(() => ({}))) as { status?: CheckoutStatus; error?: string };
  if (!r.ok || !data.status) {
    throw new Error(data.error ?? `Request failed (${r.status})`);
  }
  return data.status;
}

function statusToResult(status: CheckoutStatus | 'cancelled'): { ok: true } | { ok: false; error: string } {
  switch (status) {
    case 'paid':
      return { ok: true };
    case 'cancelled':
      return { ok: false, error: 'Cancelled' };
    case 'expired':
      return { ok: false, error: 'Invoice expired — please try again' };
    default:
      return { ok: false, error: 'Payment could not be verified' };
  }
}

export async function payLegendInvoice(
  pubkey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { paymentRequest, expiresAt } = await startCheckout('/api/billing/legend/checkout', {
      pubkey,
    });
    const { payGeneratedInvoice } = await import('@/utils/invoiceCheckout');
    const status = await payGeneratedInvoice(paymentRequest, expiresAt, () =>
      checkComplete('/api/billing/legend/complete', { pubkey, paymentRequest })
    );
    if (status === 'paid') invalidatePlatformMeCache(pubkey);
    return statusToResult(status);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function payProInvoice(
  pubkey: string,
  termDays: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { paymentRequest, expiresAt } = await startCheckout('/api/billing/pro/checkout', {
      pubkey,
      termDays,
    });
    const { payGeneratedInvoice } = await import('@/utils/invoiceCheckout');
    const status = await payGeneratedInvoice(paymentRequest, expiresAt, () =>
      checkComplete('/api/billing/pro/complete', { pubkey, paymentRequest, termDays })
    );
    if (status === 'paid') invalidatePlatformMeCache(pubkey);
    return statusToResult(status);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
