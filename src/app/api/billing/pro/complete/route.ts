import { NextRequest, NextResponse } from 'next/server';
import { loadPlatformKeysFromEnv } from '@/server/platform-roster/keys';
import { grantProOnRoster } from '@/server/platform-roster/grant';
import { resolvePubkeyHex } from '@/server/platform-roster/roster';
import { checkCheckoutStatus } from '@/server/billing/checkout';
import {
  PRO_TERM_DAYS_MONTHLY,
  PRO_TERM_DAYS_YEARLY,
  expectedSatsForTerm,
} from '@/server/billing/proPayment';

export const runtime = 'nodejs';

type CompleteBody = {
  pubkey: string;
  paymentRequest: string;
  termDays: number;
};

export async function POST(req: NextRequest) {
  const keys = loadPlatformKeysFromEnv();
  if (!keys) {
    return NextResponse.json({ error: 'PLATFORM_NSEC not configured' }, { status: 503 });
  }

  let body: CompleteBody;
  try {
    body = (await req.json()) as CompleteBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const pk = resolvePubkeyHex(body.pubkey ?? '');
  if (!pk) {
    return NextResponse.json({ error: 'Invalid pubkey' }, { status: 400 });
  }

  if (body.termDays !== PRO_TERM_DAYS_MONTHLY && body.termDays !== PRO_TERM_DAYS_YEARLY) {
    return NextResponse.json({ error: 'termDays must be 30 or 365' }, { status: 400 });
  }

  if (!body.paymentRequest) {
    return NextResponse.json({ error: 'Missing paymentRequest' }, { status: 400 });
  }

  const status = await checkCheckoutStatus({
    paymentRequest: body.paymentRequest,
    expectedSats: expectedSatsForTerm(body.termDays),
  });

  if (status !== 'paid') {
    return NextResponse.json({ status });
  }

  try {
    await grantProOnRoster(keys, pk, body.termDays);
    return NextResponse.json({ status: 'paid', termDays: body.termDays });
  } catch (e) {
    console.error('[api/billing/pro/complete]', e);
    return NextResponse.json({ error: 'Failed to publish PRO status' }, { status: 500 });
  }
}
