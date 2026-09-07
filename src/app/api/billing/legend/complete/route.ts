import { NextRequest, NextResponse } from 'next/server';
import { nip19 } from 'nostr-tools';
import { loadPlatformKeysFromEnv } from '@/server/platform-roster/keys';
import { grantLegendOnRoster } from '@/server/platform-roster/grant';
import { normalizePubkeyHex } from '@/server/platform-roster/roster';
import { checkCheckoutStatus } from '@/server/billing/checkout';
import { getLegendPriceSats } from '@/server/billing/legendPayment';

export const runtime = 'nodejs';

type CompleteBody = {
  pubkey: string;
  paymentRequest: string;
};

function resolvePubkey(raw: string): string | null {
  const direct = normalizePubkeyHex(raw);
  if (direct) return direct;
  const trimmed = raw.trim();
  if (trimmed.startsWith('npub')) {
    try {
      const d = nip19.decode(trimmed);
      if (d.type === 'npub') return normalizePubkeyHex(d.data as string);
    } catch {
      return null;
    }
  }
  return null;
}

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

  const pk = resolvePubkey(body.pubkey ?? '');
  if (!pk) {
    return NextResponse.json({ error: 'Invalid pubkey' }, { status: 400 });
  }

  if (!body.paymentRequest) {
    return NextResponse.json({ error: 'Missing paymentRequest' }, { status: 400 });
  }

  const status = await checkCheckoutStatus({
    paymentRequest: body.paymentRequest,
    expectedSats: getLegendPriceSats(),
  });

  if (status !== 'paid') {
    return NextResponse.json({ status });
  }

  try {
    await grantLegendOnRoster(keys, pk);
    return NextResponse.json({ status: 'paid', isLegend: true });
  } catch (e) {
    console.error('[api/billing/legend/complete]', e);
    return NextResponse.json({ error: 'Failed to publish legend status' }, { status: 500 });
  }
}
