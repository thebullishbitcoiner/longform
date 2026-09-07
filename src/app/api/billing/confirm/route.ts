import { NextRequest, NextResponse } from 'next/server';
import { loadPlatformKeysFromEnv } from '@/server/platform-roster/keys';
import { normalizePubkeyHex } from '@/server/platform-roster/roster';
import { grantLegendOnRoster, grantProOnRoster } from '@/server/platform-roster/grant';
import { PRO_TERM_DAYS_MONTHLY, PRO_TERM_DAYS_YEARLY } from '@/server/billing/proPayment';

export const runtime = 'nodejs';

type ConfirmBody = {
  pubkey: string;
  tier: 'pro' | 'legend';
  /** Subscription length for PRO: 30 (monthly) or 365 (yearly). Ignored for legend. */
  termDays?: number;
  invoiceHash?: string;
  preimage?: string;
};

/**
 * Protected merge + publish. Call with `Authorization: Bearer <BILLING_WEBHOOK_SECRET>`.
 * Payment verification is a separate hardening step (preimage / LN backend).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim();
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = loadPlatformKeysFromEnv();
  if (!keys) {
    return NextResponse.json({ error: 'PLATFORM_NSEC not configured' }, { status: 503 });
  }

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const pk = normalizePubkeyHex(body.pubkey);
  if (!pk) {
    return NextResponse.json({ error: 'Invalid pubkey' }, { status: 400 });
  }

  if (body.tier !== 'pro' && body.tier !== 'legend') {
    return NextResponse.json({ error: 'tier must be pro or legend' }, { status: 400 });
  }

  const termDays = body.tier === 'pro' ? body.termDays ?? PRO_TERM_DAYS_MONTHLY : undefined;
  if (
    body.tier === 'pro' &&
    termDays !== PRO_TERM_DAYS_MONTHLY &&
    termDays !== PRO_TERM_DAYS_YEARLY
  ) {
    return NextResponse.json({ error: 'termDays must be 30 or 365' }, { status: 400 });
  }

  try {
    if (body.tier === 'pro') {
      await grantProOnRoster(keys, pk, termDays!);
    } else {
      await grantLegendOnRoster(keys, pk);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/billing/confirm]', e);
    return NextResponse.json({ error: 'Publish failed' }, { status: 500 });
  }
}
