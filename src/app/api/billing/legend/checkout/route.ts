import { NextRequest, NextResponse } from 'next/server';
import { normalizePubkeyHex } from '@/server/platform-roster/roster';
import { startCheckout } from '@/server/billing/checkout';
import { LEGEND_INVOICE_EXPIRY_SEC, getLegendPriceSats } from '@/server/billing/legendPayment';

export const runtime = 'nodejs';

type CheckoutBody = {
  pubkey: string;
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

  try {
    const invoice = await startCheckout({
      amountSats: getLegendPriceSats(),
      description: 'Longform Legend',
      expirySec: LEGEND_INVOICE_EXPIRY_SEC,
    });
    return NextResponse.json(invoice);
  } catch (e) {
    console.error('[api/billing/legend/checkout]', e);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 502 });
  }
}
