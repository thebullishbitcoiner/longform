import { NextRequest, NextResponse } from 'next/server';
import { normalizePubkeyHex } from '@/server/platform-roster/roster';
import { startCheckout } from '@/server/billing/checkout';
import {
  PRO_INVOICE_EXPIRY_SEC,
  PRO_TERM_DAYS_MONTHLY,
  PRO_TERM_DAYS_YEARLY,
  expectedSatsForTerm,
} from '@/server/billing/proPayment';

export const runtime = 'nodejs';

type CheckoutBody = {
  pubkey: string;
  termDays: number;
};

export async function POST(req: NextRequest) {
  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const pk = normalizePubkeyHex(body.pubkey ?? '');
  if (!pk) {
    return NextResponse.json({ error: 'Invalid pubkey' }, { status: 400 });
  }

  if (body.termDays !== PRO_TERM_DAYS_MONTHLY && body.termDays !== PRO_TERM_DAYS_YEARLY) {
    return NextResponse.json({ error: 'termDays must be 30 or 365' }, { status: 400 });
  }

  try {
    const description = `Longform PRO ${body.termDays === PRO_TERM_DAYS_YEARLY ? 'yearly' : 'monthly'}`;
    const invoice = await startCheckout({
      amountSats: expectedSatsForTerm(body.termDays),
      description,
      expirySec: PRO_INVOICE_EXPIRY_SEC,
    });
    return NextResponse.json(invoice);
  } catch (e) {
    console.error('[api/billing/pro/checkout]', e);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 502 });
  }
}
